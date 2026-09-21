import { createTestApp, type TestApp } from './helpers/app';

describe('GET /v1/health (real PostgreSQL)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t?.close());

  it('reports the database as up', async () => {
    const res = await t.http.get('/v1/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('allows the Capacitor origin for the wrapped app (PLAN §9.1)', async () => {
    const res = await t.http.get('/v1/health').set('Origin', 'capacitor://localhost').expect(200);
    expect(res.headers['access-control-allow-origin']).toBe('capacitor://localhost');
  });

  it('does not allow unknown origins', async () => {
    const res = await t.http.get('/v1/health').set('Origin', 'https://evil.example').expect(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('requires a bearer token everywhere else', async () => {
    const res = await t.http.get('/v1/me').expect(401);
    expect(res.body.error.code).toBe('unauthorized');
  });
});
