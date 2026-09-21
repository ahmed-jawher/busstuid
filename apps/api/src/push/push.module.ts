import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { PushController } from './push.controller';
import { PUSH_PROVIDER } from './push.provider';
import { PushService } from './push.service';
import { LogPushProvider } from './log.provider';
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
        config.pushProvider === 'log' ? new LogPushProvider() : new WebPushProvider(config),
    },
  ],
  exports: [PushService, PUSH_PROVIDER],
})
export class PushModule {}
