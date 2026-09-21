import { Module } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { EscalationService } from './escalation.service';
import { WatchdogService } from './watchdog.service';

@Module({
  controllers: [AlertsController],
  providers: [AlertsService, EscalationService, WatchdogService],
  exports: [EscalationService, WatchdogService],
})
export class AlertsModule {}
