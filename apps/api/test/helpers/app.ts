import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { SideEffects } from '../../src/common/side-effects';
import { JobsService } from '../../src/jobs/jobs.service';
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
  jobs: JobsService;
  /** Waits for post-commit work (pushes, alert dispatch) to finish. */
  drain(): Promise<void>;
  close(): Promise<void>;
}

export async function createTestApp(
  opts: { db?: TestDatabase; env?: Record<string, string> } = {},
): Promise<TestApp> {
  const db = opts.db ?? (await createTestDatabase());
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
    ...opts.env,
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
    jobs: app.get(JobsService),
    drain: () => app.get(SideEffects).drain(),
    async close() {
      await app.get(SideEffects).drain();
      await app.close();
      if (!opts.db) await db.drop();
    },
  };
}
