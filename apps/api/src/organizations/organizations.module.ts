import { Module } from '@nestjs/common';
import {
  OrganizationsController,
  PlatformOrganizationsController,
} from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { SchoolsController } from './schools.controller';

@Module({
  controllers: [OrganizationsController, PlatformOrganizationsController, SchoolsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
