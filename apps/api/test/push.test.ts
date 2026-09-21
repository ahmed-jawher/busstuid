// Web Push subscriptions and the test notification (PLAN §7, §8).
import { registerVerified, type Actor } from './helpers/actors';
import { createTestApp, type TestApp } from './helpers/app';

const subscription = (n: number) => ({
  provider: 'webpush',
  platform: 'web',
  endpoint: `https://push.example.test/send/${n}-${Date.now()}`,
  keys: { p256dh: 'BExamplePublicKeyValue0123456789', auth: 'authSecret0123' },
  userAgent: 'vitest',
});

describe('push subscriptions', () => {
  let t: TestApp;
  let user: Actor;
  beforeAll(async () => {
    t = await createTestApp();
    user = await registerVerified(t);
  });
  afterAll(() => t?.close());

  it('exposes the VAPID public key without authentication', async () => {
    const res = await t.http.get('/v1/push/vapid-public-key').expect(200);
    expect(res.body.publicKey).toBe('test-vapid-public');
  });

  it('registers a device and sends a test notification in the user language', async () => {
    const sub = await t.http
      .post('/v1/push/subscriptions')
      .set(user.auth)
      .send(subscription(1))
      .expect(201);
    const res = await t.http
      .post(`/v1/push/subscriptions/${sub.body.id}/test`)
      .set(user.auth)
      .expect(200);
    expect(res.body.ok).toBe(true);
    const sent = t.push.sent.at(-1)!;
    expect(sent.message.body).toContain('الإشعارات تعمل');
    expect(sent.options.urgency).toBe('high');
    const row = await t.db.admin.pushSubscription.findUniqueOrThrow({ where: { id: sub.body.id } });
    expect(row.lastTestOkAt).not.toBeNull();
  });

  it('revokes a subscription the push service reports as gone', async () => {
    const body = subscription(2);
    const sub = await t.http.post('/v1/push/subscriptions').set(user.auth).send(body).expect(201);
    t.push.goneEndpoints.add(body.endpoint);
    const res = await t.http
      .post(`/v1/push/subscriptions/${sub.body.id}/test`)
      .set(user.auth)
      .expect(410);
    expect(res.body.error.code).toBe('subscription_expired');
    const row = await t.db.admin.pushSubscription.findUniqueOrThrow({ where: { id: sub.body.id } });
    expect(row.revokedAt).not.toBeNull();
  });

  it("moves a device to whoever signs in on it, and hides others' subscriptions", async () => {
    const body = subscription(3);
    const first = await t.http.post('/v1/push/subscriptions').set(user.auth).send(body).expect(201);
    const other = await registerVerified(t);
    const second = await t.http
      .post('/v1/push/subscriptions')
      .set(other.auth)
      .send(body)
      .expect(201);
    expect(second.body.id).toBe(first.body.id);
    const mine = await t.http.get('/v1/push/subscriptions').set(user.auth).expect(200);
    expect(mine.body.map((s: { id: string }) => s.id)).not.toContain(first.body.id);
    await t.http.post(`/v1/push/subscriptions/${first.body.id}/test`).set(user.auth).expect(404);
  });
});
