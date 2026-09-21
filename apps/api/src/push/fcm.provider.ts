import { fetchTransport, signJwt, type HttpTransport } from './native-transport';
import type {
  PushMessage,
  PushOptions,
  PushProvider,
  PushResult,
  PushTarget,
} from './push.provider';

/** The fields used from a Firebase service-account JSON file. */
export interface FcmCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  tokenUri: string;
}

/** Android notification channels created by the app (src/platform/native). */
export const ANDROID_CHANNELS = { critical: 'wusool_critical', normal: 'wusool_default' } as const;

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/** FCM HTTP v1 message for one device (PLAN §8). */
export function fcmMessage(token: string, m: PushMessage, o: PushOptions) {
  return {
    token,
    notification: { title: m.title, body: m.body },
    // Read by the app when the notification is tapped (deep link, PLAN §9.1).
    data: {
      ...(m.url ? { url: m.url } : {}),
      ...(m.tag ? { tag: m.tag } : {}),
      critical: m.critical ? '1' : '0',
    },
    android: {
      priority: o.urgency === 'high' ? 'HIGH' : 'NORMAL',
      ttl: `${o.ttlSeconds}s`,
      ...(m.tag ? { collapse_key: m.tag } : {}),
      notification: {
        channel_id: m.critical ? ANDROID_CHANNELS.critical : ANDROID_CHANNELS.normal,
        ...(m.tag ? { tag: m.tag } : {}),
        default_sound: true,
        notification_priority: m.critical ? 'PRIORITY_MAX' : 'PRIORITY_HIGH',
        // Children's names stay hidden on a locked screen.
        visibility: 'PRIVATE',
      },
    },
  };
}

/** Firebase Cloud Messaging for Android, authenticated with a service account (OAuth 2). */
export class FcmPushProvider implements PushProvider {
  private access: { token: string; expiresAt: number } | null = null;

  constructor(
    private readonly creds: FcmCredentials,
    private readonly transport: HttpTransport = fetchTransport,
    private readonly now: () => number = Date.now,
  ) {}

  private async accessToken(): Promise<string> {
    if (this.access && this.access.expiresAt - 60_000 > this.now()) return this.access.token;
    const iat = Math.floor(this.now() / 1000);
    const assertion = signJwt(
      { alg: 'RS256', typ: 'JWT' },
      { iss: this.creds.clientEmail, scope: SCOPE, aud: this.creds.tokenUri, iat, exp: iat + 3600 },
      this.creds.privateKey,
    );
    const res = await this.transport({
      url: this.creds.tokenUri,
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });
    if (res.status !== 200) throw new Error(`fcm_auth ${res.status}: ${res.body.slice(0, 200)}`);
    const body = JSON.parse(res.body) as { access_token: string; expires_in: number };
    this.access = { token: body.access_token, expiresAt: this.now() + body.expires_in * 1000 };
    return body.access_token;
  }

  async send(target: PushTarget, message: PushMessage, options: PushOptions): Promise<PushResult> {
    if (target.provider !== 'fcm') return { ok: false, gone: false, error: 'wrong_provider' };
    try {
      const res = await this.transport({
        url: `https://fcm.googleapis.com/v1/projects/${this.creds.projectId}/messages:send`,
        method: 'POST',
        headers: {
          authorization: `Bearer ${await this.accessToken()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ message: fcmMessage(target.token, message, options) }),
      });
      if (res.status === 200) return { ok: true };
      if (res.status === 401) this.access = null;
      // The app was uninstalled or the token rotated: the subscription is dead (PLAN §8).
      const gone =
        res.status === 404 ||
        /UNREGISTERED/.test(res.body) ||
        (res.status === 400 && /registration token/i.test(res.body));
      return { ok: false, gone, error: `${res.status}: ${res.body}`.slice(0, 500) };
    } catch (e) {
      return { ok: false, gone: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
