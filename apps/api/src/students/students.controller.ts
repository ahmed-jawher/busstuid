import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { createStudentSchema, enrollSchema } from '@wusool/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { Errors } from '../common/api-error';
import { Auth, Public, RequireVerifiedEmail, type AuthContext } from '../common/auth-context';
import { ApiZodBody, zod } from '../common/zod';
import { MAX_UPLOAD_BYTES, PHOTO_URL_TTL_SECONDS } from './photos';
import { StudentsService } from './students.service';

const photoUpload = FileInterceptor('photo', {
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

function requirePhoto(file: Express.Multer.File | undefined): Buffer {
  if (!file?.buffer?.length) throw Errors.badRequest('photo_required');
  if (!file.mimetype.startsWith('image/')) throw Errors.badRequest('photo_invalid');
  return file.buffer;
}

const photoQuerySchema = z.object({
  v: z.coerce.number().int().positive(),
  exp: z.coerce.number().int().positive(),
  sig: z.string().min(20).max(100),
});

const createStudentDoc = {
  schema: {
    type: 'object',
    required: ['photo', ...(z.toJSONSchema(createStudentSchema, { io: 'input' }).required ?? [])],
    properties: {
      photo: { type: 'string', format: 'binary' },
      ...(z.toJSONSchema(createStudentSchema, { io: 'input' }).properties ?? {}),
    },
  },
};

@ApiTags('students')
@ApiBearerAuth()
@Controller()
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Post('students')
  @RequireVerifiedEmail()
  @UseInterceptors(photoUpload)
  @ApiConsumes('multipart/form-data')
  @ApiBody(createStudentDoc as never)
  create(
    @Auth() auth: AuthContext,
    @Body(zod(createStudentSchema)) body: z.output<typeof createStudentSchema>,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.students.create(auth.userId, body, requirePhoto(file));
  }

  @Put('students/:id/photo')
  @RequireVerifiedEmail()
  @UseInterceptors(photoUpload)
  @ApiConsumes('multipart/form-data')
  replacePhoto(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.students.replacePhoto(auth.userId, id, requirePhoto(file));
  }

  @Post('students/:id/enrollments')
  @RequireVerifiedEmail()
  @ApiZodBody(enrollSchema)
  enroll(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(enrollSchema)) body: z.output<typeof enrollSchema>,
  ) {
    return this.students.requestEnrollment(auth.userId, id, body.organizationId);
  }

  @Get('me/children')
  children(@Auth() auth: AuthContext) {
    return this.students.listChildren(auth.userId);
  }

  @Get('children/:id')
  child(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.students.getChild(auth.userId, id);
  }

  /** Signed, short-lived photo link — usable directly in `<img src>` (PLAN §10, §14). */
  @Get('students/:id/photo')
  @Public()
  async photo(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(photoQuerySchema)) q: z.output<typeof photoQuerySchema>,
    @Res() res: Response,
  ) {
    const photo = await this.students.photoForSignedUrl(id, q.v, q.exp, q.sig);
    const etag = `"${photo.sha256}"`;
    res.setHeader('Cache-Control', `private, max-age=${PHOTO_URL_TTL_SECONDS}`);
    res.setHeader('ETag', etag);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    if (res.req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.type(photo.mimeType).send(Buffer.from(photo.content));
  }
}
