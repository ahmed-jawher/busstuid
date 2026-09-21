import { Module } from '@nestjs/common';
import { TripsModule } from '../trips/trips.module';
import { OrgSetupController } from './org-setup.controller';
import { OrgSetupService } from './org-setup.service';

@Module({
  imports: [TripsModule],
  controllers: [OrgSetupController],
  providers: [OrgSetupService],
})
export class OrgSetupModule {}
