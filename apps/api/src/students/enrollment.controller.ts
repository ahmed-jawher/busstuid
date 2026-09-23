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
import { Audit } from '../audit/audit';
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
  @Audit('enrollment.approve', 'enrollment_request', { idParam: 'id' })
  @HttpCode(HttpStatus.OK)
  approve(
    @Org() org: OrgContext,
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.enrollment.decide(org.id, auth.userId, id, 'approved');
  }

  @Post('enrollment-requests/:id/reject')
  @Audit('enrollment.reject', 'enrollment_request', { idParam: 'id', bodyFields: ['note'] })
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

  @Post('enrollment-requests/:id/undo')
  @Audit('enrollment.undo', 'enrollment_request', { idParam: 'id' })
  @HttpCode(HttpStatus.OK)
  undo(@Org() org: OrgContext, @Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.enrollment.undo(org.id, auth.userId, id);
  }

  @Get('students')
  @Audit('students.view_list', 'student')
  students(@Org() org: OrgContext, @Auth() auth: AuthContext) {
    return this.enrollment.students(org.id, auth.userId);
  }
}
