// Native push providers against a fake sender (PLAN §20, phase 6): no Firebase or Apple
// account is needed to prove what would be sent and how answers are handled.
import { generateKeyPairSync, verify } from 'node:crypto';
import http2 from 'node:http2';
import type { AddressInfo } from 'node:net';
import { parseConfig } from '../config/env';
import { ApnsPushProvider } from './apns.provider';
import { FcmPushProvider } from './fcm.provider';
import { createHttp2Transport, type HttpRequest, type HttpResponse } from './native-transport';
import { toPushTarget, type PushMessage, type PushOptions } from './push.provider';
import { RoutingPushProvider } from './routing.provider';

const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pem = (k: typeof rsa.privateKey) => k.export({ type: 'pkcs8', format: 'pem' }).toString();

const message: PushMessage = {
  title: 'وصول آمن',
  body: '🚨 تنبيه',
  url: '/alert/1',
  tag: 'alert-1',
  critical: true,
};
const high: PushOptions = { urgency: 'high', ttlSeconds: 120 };

/** Records requests and answers from a script. */
function fakeSender(answer: (req: HttpRequest) => HttpResponse) {
  const requests: HttpRequest[] = [];
  const transport = async (req: HttpRequest) => {
    requests.push(req);
    return answer(req);
  };
  return { requests, transport };
}

function decodeJwt(jwt: string) {
  const [h, p, s] = jwt.split('.') as [string, string, string];
  const json = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString());
  return {
    header: json(h),
    claims: json(p),
    input: `${h}.${p}`,
    signature: Buffer.from(s, 'base64url'),
  };
}

describe('FCM provider', () => {
  const creds = {
    projectId: 'wusool-test',
    clientEmail: 'push@wusool-test.iam.gserviceaccount.com',
    privateKey: pem(rsa.privateKey),
    tokenUri: 'https://oauth2.example.test/token',
  };
  const oauth = (req: HttpRequest): HttpResponse | null =>
    req.url === creds.tokenUri
      ? { status: 200, body: JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }) }
      : null;

  it('signs the service-account assertion and sends a high-priority Android message', async () => {
    const fake = fakeSender((req) => oauth(req) ?? { status: 200, body: '{"name":"m/1"}' });
    const fcm = new FcmPushProvider(creds, fake.transport);
    expect(
      await fcm.send({ provider: 'fcm', token: 'device-token-1234567890' }, message, high),
    ).toEqual({
      ok: true,
    });

    const [auth, send] = fake.requests as [HttpRequest, HttpRequest];
    const assertion = new URLSearchParams(auth.body).get('assertion')!;
    const jwt = decodeJwt(assertion);
    expect(jwt.header).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(jwt.claims).toMatchObject({
      iss: creds.clientEmail,
      aud: creds.tokenUri,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
    });
    expect(verify('sha256', Buffer.from(jwt.input), rsa.publicKey, jwt.signature)).toBe(true);

    expect(send.url).toBe('https://fcm.googleapis.com/v1/projects/wusool-test/messages:send');
    expect(send.headers.authorization).toBe('Bearer ya29.test');
    const body = JSON.parse(send.body).message;
    expect(body).toMatchObject({
      token: 'device-token-1234567890',
      notification: { title: 'وصول آمن', body: '🚨 تنبيه' },
      data: { url: '/alert/1', tag: 'alert-1', critical: '1' },
      android: {
        priority: 'HIGH',
        ttl: '120s',
        notification: { channel_id: 'wusool_critical', visibility: 'PRIVATE' },
      },
    });
  });

  it('reuses the access token until it expires', async () => {
    let now = 1_000_000;
    const fake = fakeSender((req) => oauth(req) ?? { status: 200, body: '{}' });
    const fcm = new FcmPushProvider(creds, fake.transport, () => now);
    const target = { provider: 'fcm', token: 'device-token-1234567890' } as const;
    await fcm.send(target, message, high);
    await fcm.send(target, { title: 't', body: 'b' }, { urgency: 'normal', ttlSeconds: 60 });
    expect(fake.requests.filter((r) => r.url === creds.tokenUri)).toHaveLength(1);
    const normal = JSON.parse(fake.requests.at(-1)!.body).message;
    expect(normal.android).toMatchObject({
      priority: 'NORMAL',
      notification: { channel_id: 'wusool_default' },
    });
    now += 3600_000;
    await fcm.send(target, message, high);
    expect(fake.requests.filter((r) => r.url === creds.tokenUri)).toHaveLength(2);
  });

  it('reports uninstalled apps as gone and other failures as retryable', async () => {
    let answer: HttpResponse = {
      status: 404,
      body: '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}',
    };
    const fake = fakeSender((req) => oauth(req) ?? answer);
    const fcm = new FcmPushProvider(creds, fake.transport);
    const target = { provider: 'fcm', token: 'device-token-1234567890' } as const;
    expect(await fcm.send(target, message, high)).toMatchObject({ ok: false, gone: true });
    answer = { status: 503, body: 'unavailable' };
    expect(await fcm.send(target, message, high)).toMatchObject({ ok: false, gone: false });
    // A rejected access token is dropped and fetched again next time.
    answer = { status: 401, body: 'unauthenticated' };
    await fcm.send(target, message, high);
    answer = { status: 200, body: '{}' };
    await fcm.send(target, message, high);
    expect(fake.requests.filter((r) => r.url === creds.tokenUri)).toHaveLength(2);
  });

  it('never throws: a broken sign-in becomes a failed delivery', async () => {
    const fake = fakeSender(() => ({ status: 400, body: 'invalid_grant' }));
    const fcm = new FcmPushProvider(creds, fake.transport);
    const res = await fcm.send({ provider: 'fcm', token: 'x'.repeat(30) }, message, high);
    expect(res).toMatchObject({
      ok: false,
      gone: false,
      error: expect.stringContaining('fcm_auth'),
    });
    expect(await fcm.send({ provider: 'apns', token: 'a' }, message, high)).toMatchObject({
      error: 'wrong_provider',
    });
  });
});

describe('APNs provider', () => {
  const creds = {
    keyId: 'KEY1234567',
    teamId: 'TEAM123456',
    privateKey: pem(ec.privateKey),
    bundleId: 'com.wusoolsafe.app',
    production: true,
  };
  const token = 'ab'.repeat(32);

  it('signs an ES256 provider token and sends a time-sensitive alert', async () => {
    const fake = fakeSender(() => ({ status: 200, body: '' }));
    const apns = new ApnsPushProvider(creds, fake.transport, () => 1_700_000_000_000);
    expect(await apns.send({ provider: 'apns', token }, message, high)).toEqual({ ok: true });

    const req = fake.requests[0]!;
    expect(req.url).toBe(`https://api.push.apple.com/3/device/${token}`);
    expect(req.headers).toMatchObject({
      'apns-topic': 'com.wusoolsafe.app',
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-expiration': String(1_700_000_000 + 120),
      'apns-collapse-id': 'alert-1',
    });
    const jwt = decodeJwt(req.headers.authorization!.replace('bearer ', ''));
    expect(jwt.header).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
    expect(jwt.claims).toEqual({ iss: 'TEAM123456', iat: 1_700_000_000 });
    expect(
      verify(
        'sha256',
        Buffer.from(jwt.input),
        { key: ec.publicKey, dsaEncoding: 'ieee-p1363' },
        jwt.signature,
      ),
    ).toBe(true);
    expect(JSON.parse(req.body)).toEqual({
      aps: {
        alert: { title: 'وصول آمن', body: '🚨 تنبيه' },
        sound: 'default',
        'interruption-level': 'time-sensitive',
        'thread-id': 'alert-1',
      },
      url: '/alert/1',
    });
  });

  it('keeps the provider token for 50 minutes and uses the sandbox for development builds', async () => {
    let now = 1_700_000_000_000;
    const fake = fakeSender(() => ({ status: 200, body: '' }));
    const apns = new ApnsPushProvider({ ...creds, production: false }, fake.transport, () => now);
    const plain = { title: 't', body: 'b' };
    await apns.send({ provider: 'apns', token }, plain, { urgency: 'normal', ttlSeconds: 60 });
    now += 10 * 60_000;
    await apns.send({ provider: 'apns', token }, plain, { urgency: 'normal', ttlSeconds: 60 });
    now += 45 * 60_000;
    await apns.send({ provider: 'apns', token }, plain, { urgency: 'normal', ttlSeconds: 60 });
    const [a, b, c] = fake.requests.map((r) => r.headers.authorization);
    expect(a).toBe(b);
    expect(c).not.toBe(a);
    expect(fake.requests[0]!.url).toContain('api.sandbox.push.apple.com');
    expect(fake.requests[0]!.headers['apns-priority']).toBe('5');
    expect(JSON.parse(fake.requests[0]!.body).aps['interruption-level']).toBe('active');
  });

  it('marks dead tokens as gone and refreshes an expired provider token', async () => {
    let answer: HttpResponse = { status: 410, body: '{"reason":"Unregistered"}' };
    const fake = fakeSender(() => answer);
    let now = 1_700_000_000_000;
    const apns = new ApnsPushProvider(creds, fake.transport, () => now);
    expect(await apns.send({ provider: 'apns', token }, message, high)).toMatchObject({
      ok: false,
      gone: true,
    });
    answer = { status: 400, body: '{"reason":"BadDeviceToken"}' };
    expect(await apns.send({ provider: 'apns', token }, message, high)).toMatchObject({
      gone: true,
    });
    answer = { status: 403, body: '{"reason":"ExpiredProviderToken"}' };
    expect(await apns.send({ provider: 'apns', token }, message, high)).toMatchObject({
      gone: false,
      error: '403: ExpiredProviderToken',
    });
    now += 1000;
    answer = { status: 500, body: 'not json' };
    expect(await apns.send({ provider: 'apns', token }, message, high)).toMatchObject({
      gone: false,
      error: '500: not json',
    });
    const auths = fake.requests.map((r) => r.headers.authorization);
    expect(auths[3]).not.toBe(auths[2]);
  });

  it('turns network errors into retryable failures', async () => {
    const apns = new ApnsPushProvider(creds, async () => {
      throw new Error('ECONNRESET');
    });
    expect(await apns.send({ provider: 'apns', token }, message, high)).toEqual({
      ok: false,
      gone: false,
      error: 'ECONNRESET',
    });
    expect(await apns.send({ provider: 'fcm', token }, message, high)).toMatchObject({
      error: 'wrong_provider',
    });
  });
});

describe('HTTP/2 transport', () => {
  it('talks HTTP/2 and reuses one connection', async () => {
    const server = http2.createServer();
    const sessions = new Set<unknown>();
    server.on('stream', (stream, headers) => {
      sessions.add(stream.session);
      let body = '';
      stream.on('data', (c: Buffer) => (body += c.toString()));
      stream.on('end', () => {
        stream.respond({ ':status': 200 });
        stream.end(JSON.stringify({ path: headers[':path'], topic: headers['apns-topic'], body }));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const send = createHttp2Transport();
      const req = (n: number) =>
        send({
          url: `${origin}/3/device/${n}?x=1`,
          method: 'POST',
          headers: { 'apns-topic': 'app' },
          body: `hello ${n}`,
        });
      const [a, b] = await Promise.all([req(1), req(2)]);
      expect(a.status).toBe(200);
      expect(JSON.parse(a.body)).toEqual({
        path: '/3/device/1?x=1',
        topic: 'app',
        body: 'hello 1',
      });
      expect(JSON.parse(b.body).body).toBe('hello 2');
      expect(sessions.size).toBe(1);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('fails instead of hanging when the connection cannot be made', async () => {
    const send = createHttp2Transport();
    await expect(
      send({ url: 'http://127.0.0.1:1/x', method: 'POST', headers: {}, body: '' }),
    ).rejects.toThrow();
  });
});

describe('routing and configuration', () => {
  it('routes by provider and reports providers that are not configured', async () => {
    const sent: string[] = [];
    const web = {
      send: async () => {
        sent.push('web');
        return { ok: true } as const;
      },
    };
    const router = new RoutingPushProvider({ webpush: web });
    expect(router.has('webpush')).toBe(true);
    expect(router.has('apns')).toBe(false);
    await router.send(
      { provider: 'webpush', endpoint: 'e', p256dh: 'p', auth: 'a' },
      message,
      high,
    );
    expect(sent).toEqual(['web']);
    expect(await router.send({ provider: 'apns', token: 't' }, message, high)).toEqual({
      ok: false,
      gone: false,
      error: 'apns_not_configured',
    });
  });

  it('builds targets from stored subscriptions', () => {
    const row = { endpoint: null, p256dh: null, authSecret: null, nativeToken: null };
    expect(toPushTarget({ ...row, provider: 'fcm', nativeToken: 'tok' })).toEqual({
      provider: 'fcm',
      token: 'tok',
    });
    expect(toPushTarget({ ...row, provider: 'apns' })).toBeNull();
    expect(toPushTarget({ ...row, provider: 'webpush', endpoint: 'e' })).toBeNull();
  });

  const base = {
    DATABASE_URL: 'postgres://app@localhost/db',
    DATABASE_SYSTEM_URL: 'postgres://system@localhost/db',
    JWT_ACCESS_SECRET: 'a'.repeat(40),
    JWT_REFRESH_SECRET: 'b'.repeat(40),
    FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    PHOTO_URL_SECRET: 'c'.repeat(40),
    VAPID_PUBLIC_KEY: 'pub',
    VAPID_PRIVATE_KEY: 'priv',
  };
  const b64 = (s: string) => Buffer.from(s).toString('base64');

  it('reads native push keys only when provided', () => {
    const none = parseConfig(base);
    expect(none.fcm).toBeNull();
    expect(none.apns).toBeNull();

    const both = parseConfig({
      ...base,
      NODE_ENV: 'production',
      FCM_SERVICE_ACCOUNT_BASE64: b64(
        JSON.stringify({ project_id: 'p', client_email: 'e@x', private_key: 'k' }),
      ),
      APNS_KEY_BASE64: b64('-----KEY-----'),
      APNS_KEY_ID: 'K',
      APNS_TEAM_ID: 'T',
    });
    expect(both.fcm).toEqual({
      projectId: 'p',
      clientEmail: 'e@x',
      privateKey: 'k',
      tokenUri: 'https://oauth2.googleapis.com/token',
    });
    expect(both.apns).toMatchObject({
      privateKey: '-----KEY-----',
      bundleId: 'com.wusoolsafe.app',
      production: true,
    });
    expect(
      parseConfig({ ...base, APNS_KEY_BASE64: 'x', APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T' }).apns
        ?.production,
    ).toBe(false);
  });

  it('refuses incomplete or malformed native push keys', () => {
    expect(() => parseConfig({ ...base, FCM_SERVICE_ACCOUNT_BASE64: b64('not json') })).toThrow(
      /base64-encoded JSON/,
    );
    expect(() =>
      parseConfig({ ...base, FCM_SERVICE_ACCOUNT_BASE64: b64('{"project_id":"p"}') }),
    ).toThrow(/service-account/);
    expect(() => parseConfig({ ...base, APNS_KEY_BASE64: 'x' })).toThrow(/APNS_KEY_ID/);
    // Empty values from a copied .env file mean "not set".
    const blank = parseConfig({
      ...base,
      APNS_ENV: '',
      APNS_BUNDLE_ID: '',
      FCM_SERVICE_ACCOUNT_BASE64: '',
    });
    expect(blank.fcm).toBeNull();
  });
});
