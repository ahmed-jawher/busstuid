import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import type { AppConfig } from './config/env';

export const API_PREFIX = 'v1';

/** Settings shared by the real server, tests and the OpenAPI emitter. */
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(API_PREFIX);
  // Behind Caddy in production: take the client IP from X-Forwarded-For (rate limits, audit).
  if (config.trustProxyHops > 0) {
    (app as NestExpressApplication).set('trust proxy', config.trustProxyHops);
  }
  app.use(
    helmet({
      // JSON API; the Swagger UI needs inline scripts, and photos are loaded by the web origin.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  // Bearer tokens only, never cookies (PLAN §9), so credentials stay off.
  app.enableCors({ origin: config.corsOrigins, credentials: false, maxAge: 600 });
  app.enableShutdownHooks();
}

export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const doc = new DocumentBuilder()
    .setTitle('Wusool Safe API')
    .setDescription('وصول آمن — سلامة الطلاب في النقل المدرسي')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, doc);
}
