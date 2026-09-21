import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { decisionSchema } from '@wusool/shared';
import { z } from 'zod';
import { Auth, Org, OrgRoles, type AuthContext, type OrgContext } from '../common/auth-context';
import { ApiZodBody, ApiZodQuery, zod } from '../common/zod';
import { EnrollmentService } from './enrollment.service';

const listQuery = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
});

@ApiTags('organization')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Organization-Id', required: true })
@OrgRoles('org_admin')
@Controller('org')
export class EnrollmentController {
  constructor(private readonly enrollment: EnrollmentService) {}

  @Get('enrollment-requests')
  @ApiZodQuery(listQuery)
  list(@Org() org: OrgContext, @Query(zod(listQuery)) q: z.output<typeof listQuery>) {
    return this.enrollment.list(org.id, q.status);
  }

  @Post('enrollment-requests/:id/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @Org() org: OrgContext,
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.enrollment.decide(org.id, auth.userId, id, 'approved');
  }

  @Post('enrollment-requests/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(decisionSchema)
  reject(
    @Org() org: OrgContext,
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(decisionSchema)) body: z.output<typeof decisionSchema>,
  ) {
    return this.enrollment.decide(org.id, auth.userId, id, 'rejected', body.note);
  }

  @Get('students')
  students(@Org() org: OrgContext, @Auth() auth: AuthContext) {
    return this.enrollment.students(org.id, auth.userId);
  }
}
