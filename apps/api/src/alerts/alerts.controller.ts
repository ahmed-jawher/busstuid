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
import { resolveAlertSchema } from '@wusool/shared';
import { z } from 'zod';
import { Auth, Org, OrgRoles, type AuthContext, type OrgContext } from '../common/auth-context';
import { ApiZodBody, ApiZodQuery, zod } from '../common/zod';
import { AlertsService } from './alerts.service';

const listQuery = z.object({ status: z.enum(['open', 'acknowledged', 'resolved']).optional() });

@ApiTags('alerts')
@ApiBearerAuth()
@Controller()
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get('alerts')
  @OrgRoles('org_admin')
  @ApiHeader({ name: 'X-Organization-Id', required: true })
  @ApiZodQuery(listQuery)
  list(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Query(zod(listQuery)) q: z.output<typeof listQuery>,
  ) {
    return this.alerts.listForOrg(auth.userId, org.id, q.status);
  }

  @Get('me/alerts')
  mine(@Auth() auth: AuthContext) {
    return this.alerts.listMine(auth.userId);
  }

  @Get('alerts/:id')
  get(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.alerts.get(auth.userId, id);
  }

  @Post('alerts/:id/acknowledge')
  @HttpCode(HttpStatus.OK)
  acknowledge(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.alerts.acknowledge(auth.userId, id);
  }

  @Post('alerts/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(resolveAlertSchema)
  resolve(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(resolveAlertSchema)) body: z.output<typeof resolveAlertSchema>,
  ) {
    return this.alerts.resolve(auth.userId, id, body.reason, body.note);
  }
}
