import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { PushController } from './push.controller';
import { PUSH_PROVIDER } from './push.provider';
import { PushService } from './push.service';
import { LogPushProvider } from './log.provider';
import { ApnsPushProvider } from './apns.provider';
import { FcmPushProvider } from './fcm.provider';
import { RoutingPushProvider } from './routing.provider';
import { WebPushProvider } from './webpush.provider';

@Global()
@Module({
  controllers: [PushController],
  providers: [
    PushService,
    {
      provide: PUSH_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.pushProvider === 'log'
          ? new LogPushProvider()
          : new RoutingPushProvider({
              webpush: new WebPushProvider(config),
              ...(config.fcm ? { fcm: new FcmPushProvider(config.fcm) } : {}),
              ...(config.apns ? { apns: new ApnsPushProvider(config.apns) } : {}),
            }),
    },
  ],
  exports: [PushService, PUSH_PROVIDER],
})
export class PushModule {}
