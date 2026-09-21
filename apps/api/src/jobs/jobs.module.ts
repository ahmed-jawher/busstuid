import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { TripsModule } from '../trips/trips.module';
import { JobsService } from './jobs.service';

@Module({
  imports: [AlertsModule, TripsModule],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
