import { Global, Module } from '@nestjs/common';
import { InboxController, UnreachableGuardiansController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { RoutineNotificationsService } from './routine-notifications.service';

@Global()
@Module({
  controllers: [InboxController, UnreachableGuardiansController],
  providers: [NotificationsService, RoutineNotificationsService],
  exports: [NotificationsService, RoutineNotificationsService],
})
export class NotificationsModule {}
