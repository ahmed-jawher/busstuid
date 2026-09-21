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
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { createOrganizationSchema, directoryQuerySchema, driverLookupSchema } from '@wusool/shared';
import type { z } from 'zod';
import {
  Auth,
  PlatformAdminOnly,
  RequireVerifiedEmail,
  type AuthContext,
} from '../common/auth-context';
import { ApiZodBody, ApiZodQuery, zod } from '../common/zod';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@ApiBearerAuth()
@RequireVerifiedEmail()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Post()
  @ApiZodBody(createOrganizationSchema)
  create(
    @Auth() auth: AuthContext,
    @Body(zod(createOrganizationSchema)) body: z.output<typeof createOrganizationSchema>,
  ) {
    return this.orgs.create(auth.userId, body);
  }

  @Get('directory')
  @ApiZodQuery(directoryQuerySchema)
  directory(@Query(zod(directoryQuerySchema)) q: z.output<typeof directoryQuerySchema>) {
    return this.orgs.directory(q.country, q.type);
  }

  @Get('driver-lookup')
  @ApiZodQuery(directoryQuerySchema.pick({ country: true }))
  @ApiQuery({ name: 'phone', required: true, example: '36001234' })
  driverLookup(@Query(zod(driverLookupSchema)) q: z.output<typeof driverLookupSchema>) {
    return this.orgs.lookupDriver(q.phone);
  }
}

@ApiTags('platform')
@ApiBearerAuth()
@PlatformAdminOnly()
@Controller('platform/organizations')
export class PlatformOrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Get('pending')
  pending() {
    return this.orgs.pendingReview();
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.setStatus(id, 'active');
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  suspend(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.setStatus(id, 'suspended');
  }
}
