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

describe('native app devices (phase 6)', () => {
  const fcmAccount = Buffer.from(
    JSON.stringify({ project_id: 'p', client_email: 'e@example.com', private_key: 'k' }),
  ).toString('base64');
  let t: TestApp;
  let user: Actor;
  beforeAll(async () => {
    t = await createTestApp({ env: { FCM_SERVICE_ACCOUNT_BASE64: fcmAccount } });
    user = await registerVerified(t);
  });
  afterAll(() => t?.close());

  it('registers an Android token, tests it, and moves it to whoever signs in next', async () => {
    const token = `fcm-token:${Date.now()}_abcdefghijklmnop`;
    const body = { provider: 'fcm', platform: 'android', token, userAgent: 'Pixel 8' };
    const sub = await t.http.post('/v1/push/subscriptions').set(user.auth).send(body).expect(201);
    expect(sub.body).toMatchObject({ provider: 'fcm', platform: 'android' });
    await t.http.post(`/v1/push/subscriptions/${sub.body.id}/test`).set(user.auth).expect(200);
    expect(t.push.sent.at(-1)!.target).toEqual({ provider: 'fcm', token });

    const other = await registerVerified(t);
    const again = await t.http
      .post('/v1/push/subscriptions')
      .set(other.auth)
      .send(body)
      .expect(201);
    expect(again.body.id).toBe(sub.body.id);
    const row = await t.db.admin.pushSubscription.findUniqueOrThrow({ where: { id: sub.body.id } });
    expect(row).toMatchObject({ userId: other.id, lastTestOkAt: null });
  });

  it('refuses iOS devices while APNs is not configured, and malformed tokens', async () => {
    const res = await t.http
      .post('/v1/push/subscriptions')
      .set(user.auth)
      .send({ provider: 'apns', platform: 'ios', token: 'ab'.repeat(32) })
      .expect(503);
    expect(res.body.error.code).toBe('push_provider_unavailable');
    await t.http
      .post('/v1/push/subscriptions')
      .set(user.auth)
      .send({ provider: 'apns', platform: 'ios', token: 'not-hex' })
      .expect(400);
    await t.http
      .post('/v1/push/subscriptions')
      .set(user.auth)
      .send({ provider: 'fcm', platform: 'ios', token: 'x'.repeat(30) })
      .expect(400);
  });

  it('revokes an Android token the provider reports as gone', async () => {
    const token = `fcm-gone-${Date.now()}-abcdefghijklmnop`;
    const sub = await t.http
      .post('/v1/push/subscriptions')
      .set(user.auth)
      .send({ provider: 'fcm', platform: 'android', token })
      .expect(201);
    t.push.goneEndpoints.add(token);
    await t.http.post(`/v1/push/subscriptions/${sub.body.id}/test`).set(user.auth).expect(410);
  });
});
