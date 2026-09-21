import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { AccessGuard } from './common/guards';
import { ConfigModule } from './config/config.module';
import type { AppConfig } from './config/env';
import { DatabaseModule } from './database/database.module';
import { EmailModule } from './email/email.module';
import { HealthController } from './health/health.controller';
import { MeModule } from './me/me.module';
import { OrgSetupModule } from './org-setup/org-setup.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PushModule } from './push/push.module';
import { StudentsModule } from './students/students.module';
import { TripsModule } from './trips/trips.module';

@Module({})
export class AppModule {
  static forRoot(config?: AppConfig): DynamicModule {
    const env = config?.nodeEnv ?? process.env.NODE_ENV ?? 'development';
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        LoggerModule.forRoot({
          pinoHttp: {
            level: env === 'test' ? 'silent' : 'info',
            transport:
              env === 'development'
                ? { target: 'pino-pretty', options: { singleLine: true } }
                : undefined,
            autoLogging: { ignore: (req) => req.url?.endsWith('/health') ?? false },
            // Log only what is needed to trace a request; headers (tokens) never reach the logs.
            serializers: {
              req: (req: { id: unknown; method: string; url: string }) => ({
                id: req.id,
                method: req.method,
                // Signed photo URLs carry their signature in the query string.
                url: req.url.split('?')[0],
              }),
              res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
            },
          },
        }),
        DatabaseModule,
        EmailModule,
        PushModule,
        AuthModule,
        MeModule,
        OrganizationsModule,
        StudentsModule,
        OrgSetupModule,
        TripsModule,
      ],
      controllers: [HealthController],
      providers: [
        { provide: APP_GUARD, useClass: AccessGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    };
  }
}
