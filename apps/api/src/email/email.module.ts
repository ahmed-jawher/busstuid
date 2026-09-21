import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { EMAIL_PROVIDER } from './email.provider';
import { SmtpEmailProvider } from './smtp.provider';

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new SmtpEmailProvider(config),
    },
  ],
  exports: [EMAIL_PROVIDER],
})
export class EmailModule {}
