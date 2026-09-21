import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { parseConfig, type AppConfig } from '../../src/config/env';
import { EMAIL_PROVIDER } from '../../src/email/email.provider';
import { PUSH_PROVIDER } from '../../src/push/push.provider';
import { createTestDatabase, type TestDatabase } from './database';
import { CapturingEmailProvider, FakePushProvider } from './fakes';

export interface TestApp {
  app: INestApplication;
  http: ReturnType<typeof request>;
  config: AppConfig;
  db: TestDatabase;
  mail: CapturingEmailProvider;
  push: FakePushProvider;
  close(): Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const db = await createTestDatabase();
  const config = parseConfig({
    NODE_ENV: 'test',
    DATABASE_URL: db.appUrl,
    DATABASE_SYSTEM_URL: db.systemUrl,
    PUBLIC_API_URL: 'http://api.test/v1',
    JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef0123',
    JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef012',
    FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    PHOTO_URL_SECRET: 'test-photo-secret-0123456789abcdef012345',
    VAPID_PUBLIC_KEY: 'test-vapid-public',
    VAPID_PRIVATE_KEY: 'test-vapid-private',
  });
  const mail = new CapturingEmailProvider();
  const push = new FakePushProvider();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] })
    .overrideProvider(EMAIL_PROVIDER)
    .useValue(mail)
    .overrideProvider(PUSH_PROVIDER)
    .useValue(push)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, config);
  await app.init();
  return {
    app,
    http: request(app.getHttpServer()),
    config,
    db,
    mail,
    push,
    async close() {
      await app.close();
      await db.drop();
    },
  };
}
