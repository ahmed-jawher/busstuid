import { createHttp2Transport, signJwt, type HttpTransport } from './native-transport';
import type {
  PushMessage,
  PushOptions,
  PushProvider,
  PushResult,
  PushTarget,
} from './push.provider';

/** Token-based APNs authentication: a .p8 key from the Apple Developer account. */
export interface ApnsCredentials {
  keyId: string;
  teamId: string;
  privateKey: string;
  bundleId: string;
  production: boolean;
}

/** Apple rejects provider tokens older than an hour and refreshes more often than every 20 min. */
const TOKEN_TTL_MS = 50 * 60_000;
const GONE_REASONS = new Set(['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered']);

export function apnsPayload(m: PushMessage) {
  return {
    aps: {
      alert: { title: m.title, body: m.body },
      sound: 'default',
      // Breaks through Focus modes; true "critical" alerts need an entitlement from Apple
      // (docs/RELEASE.md).
      'interruption-level': m.critical ? 'time-sensitive' : 'active',
      ...(m.tag ? { 'thread-id': m.tag } : {}),
    },
    ...(m.url ? { url: m.url } : {}),
  };
}

/** Apple Push Notification service for iOS, over HTTP/2 (PLAN §8). */
export class ApnsPushProvider implements PushProvider {
  private jwt: { token: string; issuedAt: number } | null = null;

  constructor(
    private readonly creds: ApnsCredentials,
    private readonly transport: HttpTransport = createHttp2Transport(),
    private readonly now: () => number = Date.now,
  ) {}

  private providerToken(): string {
    if (this.jwt && this.now() - this.jwt.issuedAt < TOKEN_TTL_MS) return this.jwt.token;
    const token = signJwt(
      { alg: 'ES256', kid: this.creds.keyId },
      { iss: this.creds.teamId, iat: Math.floor(this.now() / 1000) },
      this.creds.privateKey,
    );
    this.jwt = { token, issuedAt: this.now() };
    return token;
  }

  async send(target: PushTarget, message: PushMessage, options: PushOptions): Promise<PushResult> {
    if (target.provider !== 'apns') return { ok: false, gone: false, error: 'wrong_provider' };
    const host = this.creds.production
      ? 'https://api.push.apple.com'
      : 'https://api.sandbox.push.apple.com';
    try {
      const res = await this.transport({
        url: `${host}/3/device/${target.token}`,
        method: 'POST',
        headers: {
          authorization: `bearer ${this.providerToken()}`,
          'apns-topic': this.creds.bundleId,
          'apns-push-type': 'alert',
          'apns-priority': options.urgency === 'high' ? '10' : '5',
          'apns-expiration': String(Math.floor(this.now() / 1000) + options.ttlSeconds),
          ...(message.tag ? { 'apns-collapse-id': message.tag.slice(0, 64) } : {}),
          'content-type': 'application/json',
        },
        body: JSON.stringify(apnsPayload(message)),
      });
      if (res.status === 200) return { ok: true };
      let reason = '';
      try {
        reason = (JSON.parse(res.body) as { reason?: string }).reason ?? '';
      } catch {
        reason = res.body;
      }
      if (reason === 'ExpiredProviderToken') this.jwt = null;
      return {
        ok: false,
        gone: res.status === 410 || GONE_REASONS.has(reason),
        error: `${res.status}: ${reason || res.body}`.slice(0, 500),
      };
    } catch (e) {
      return { ok: false, gone: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
