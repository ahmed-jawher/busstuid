import { Module } from '@nestjs/common';
import { StudentsModule } from '../students/students.module';
import { GuardianTripsService } from './guardian-trips.service';
import { TripGenerationService } from './trip-generation.service';
import { GuardianTripsController, OrgTripsController, TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  imports: [StudentsModule],
  controllers: [TripsController, OrgTripsController, GuardianTripsController],
  providers: [TripsService, TripGenerationService, GuardianTripsService],
  exports: [TripGenerationService, TripsService],
})
export class TripsModule {}
