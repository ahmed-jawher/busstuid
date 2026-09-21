import webpush, { WebPushError } from 'web-push';
import type { AppConfig } from '../config/env';
import type {
  PushMessage,
  PushOptions,
  PushProvider,
  PushResult,
  PushTarget,
} from './push.provider';

/** Free Web Push with VAPID keys generated locally — no Firebase, no account (PLAN §2, §8). */
export class WebPushProvider implements PushProvider {
  constructor(private readonly config: AppConfig) {}

  async send(target: PushTarget, message: PushMessage, options: PushOptions): Promise<PushResult> {
    if (target.provider !== 'webpush') return { ok: false, gone: false, error: 'wrong_provider' };
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(message),
        {
          vapidDetails: {
            subject: this.config.vapid.subject,
            publicKey: this.config.vapid.publicKey,
            privateKey: this.config.vapid.privateKey,
          },
          urgency: options.urgency,
          TTL: options.ttlSeconds,
          topic: message.tag?.slice(0, 32),
          timeout: 10_000,
        },
      );
      return { ok: true };
    } catch (e) {
      if (e instanceof WebPushError) {
        return {
          ok: false,
          gone: e.statusCode === 404 || e.statusCode === 410,
          error: `${e.statusCode}: ${e.body || e.message}`.slice(0, 500),
        };
      }
      return { ok: false, gone: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
