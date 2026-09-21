import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { TripsModule } from '../trips/trips.module';
import { JobsService } from './jobs.service';
import { RetentionService } from './retention.service';

@Module({
  imports: [AlertsModule, TripsModule],
  providers: [JobsService, RetentionService],
  exports: [JobsService],
})
export class JobsModule {}
