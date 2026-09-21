import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  addMemberSchema,
  routeSchema,
  routeStudentsSchema,
  ROLES,
  updateRouteSchema,
  updateVehicleSchema,
  vehicleSchema,
} from '@wusool/shared';
import { z } from 'zod';
import { Auth, Org, OrgRoles, type AuthContext, type OrgContext } from '../common/auth-context';
import { ApiZodBody, zod } from '../common/zod';
import { OrgSetupService } from './org-setup.service';

const ctx = (auth: AuthContext, org: OrgContext) => ({ userId: auth.userId, orgId: org.id });

@ApiTags('organization')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Organization-Id', required: true })
@OrgRoles('org_admin')
@Controller('org')
export class OrgSetupController {
  constructor(private readonly setup: OrgSetupService) {}

  @Get('vehicles')
  vehicles(@Auth() auth: AuthContext, @Org() org: OrgContext) {
    return this.setup.listVehicles(ctx(auth, org));
  }

  @Post('vehicles')
  @ApiZodBody(vehicleSchema)
  createVehicle(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Body(zod(vehicleSchema)) body: z.output<typeof vehicleSchema>,
  ) {
    return this.setup.createVehicle(ctx(auth, org), body);
  }

  @Patch('vehicles/:id')
  @ApiZodBody(updateVehicleSchema)
  updateVehicle(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(updateVehicleSchema)) body: z.output<typeof updateVehicleSchema>,
  ) {
    return this.setup.updateVehicle(ctx(auth, org), id, body);
  }

  @Get('routes')
  routes(@Auth() auth: AuthContext, @Org() org: OrgContext) {
    return this.setup.listRoutes(ctx(auth, org));
  }

  @Get('routes/:id')
  route(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.setup.getRoute(ctx(auth, org), id);
  }

  @Post('routes')
  @ApiZodBody(routeSchema)
  createRoute(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Body(zod(routeSchema)) body: z.output<typeof routeSchema>,
  ) {
    return this.setup.createRoute(ctx(auth, org), body);
  }

  @Patch('routes/:id')
  @ApiZodBody(updateRouteSchema)
  updateRoute(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(updateRouteSchema)) body: z.output<typeof updateRouteSchema>,
  ) {
    return this.setup.updateRoute(ctx(auth, org), id, body);
  }

  @Put('routes/:id/students')
  @ApiZodBody(routeStudentsSchema)
  setRouteStudents(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(routeStudentsSchema)) body: z.output<typeof routeStudentsSchema>,
  ) {
    return this.setup.setRouteStudents(ctx(auth, org), id, body.assignments);
  }

  @Get('members')
  members(@Auth() auth: AuthContext, @Org() org: OrgContext) {
    return this.setup.listMembers(ctx(auth, org));
  }

  @Post('members')
  @ApiZodBody(addMemberSchema)
  addMember(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Body(zod(addMemberSchema)) body: z.output<typeof addMemberSchema>,
  ) {
    return this.setup.addMember(ctx(auth, org), body.email, body.role);
  }

  @Delete('members/:userId/:role')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('role', zod(z.enum(ROLES))) role: (typeof ROLES)[number],
  ) {
    await this.setup.removeMember(ctx(auth, org), userId, role);
  }
}
