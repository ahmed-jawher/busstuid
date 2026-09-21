import { Module } from '@nestjs/common';
import {
  OrganizationsController,
  PlatformOrganizationsController,
} from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  controllers: [OrganizationsController, PlatformOrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
