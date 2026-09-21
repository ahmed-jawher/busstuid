import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { startTestPostgres } from '@wusool/dev-stack';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { parseConfig } from '../src/config/env';

describe('GET /v1/health (real PostgreSQL)', () => {
  let db: Awaited<ReturnType<typeof startTestPostgres>>;
  let app: INestApplication;

  beforeAll(async () => {
    db = await startTestPostgres();
    const config = parseConfig({ NODE_ENV: 'test', DATABASE_URL: db.url });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(config)],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, config);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  it('reports the database as up', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('allows the Capacitor origin for the wrapped app (PLAN §9.1)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/health')
      .set('Origin', 'capacitor://localhost')
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBe('capacitor://localhost');
  });

  it('does not allow unknown origins', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/health')
      .set('Origin', 'https://evil.example')
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
