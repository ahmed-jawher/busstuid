import { DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import type { AppConfig } from './config/env';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';

@Module({})
export class AppModule {
  static forRoot(config?: AppConfig): DynamicModule {
    const isTest = (config?.nodeEnv ?? process.env.NODE_ENV) === 'test';
    const isDev = (config?.nodeEnv ?? process.env.NODE_ENV ?? 'development') === 'development';
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        LoggerModule.forRoot({
          pinoHttp: {
            level: isTest ? 'silent' : 'info',
            transport: isDev ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
            autoLogging: { ignore: (req) => req.url?.endsWith('/health') ?? false },
            // Log only what is needed to trace a request; headers (tokens) never reach the logs.
            serializers: {
              req: (req: { id: unknown; method: string; url: string }) => ({
                id: req.id,
                method: req.method,
                url: req.url,
              }),
              res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
            },
          },
        }),
        DatabaseModule,
      ],
      controllers: [HealthController],
    };
  }
}
