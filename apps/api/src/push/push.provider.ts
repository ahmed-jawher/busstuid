/** Where a message goes: a browser subscription or a native device token (PLAN §8). */
export type PushTarget =
  | { provider: 'webpush'; endpoint: string; p256dh: string; auth: string }
  | { provider: 'fcm' | 'apns'; token: string };

/** One device's address, for logs and tests. */
export const targetAddress = (t: PushTarget): string =>
  t.provider === 'webpush' ? t.endpoint : t.token;

/** Builds the target from a stored subscription; null when it is incomplete. */
export function toPushTarget(sub: {
  provider: 'webpush' | 'fcm' | 'apns';
  endpoint: string | null;
  p256dh: string | null;
  authSecret: string | null;
  nativeToken: string | null;
}): PushTarget | null {
  if (sub.provider === 'webpush') {
    return sub.endpoint && sub.p256dh && sub.authSecret
      ? { provider: 'webpush', endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.authSecret }
      : null;
  }
  return sub.nativeToken ? { provider: sub.provider, token: sub.nativeToken } : null;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Deep link opened on tap: /trip/:id, /child/:id, /alert/:id (PLAN §9.1). */
  url?: string;
  tag?: string;
  critical?: boolean;
}

export interface PushOptions {
  urgency: 'very-low' | 'low' | 'normal' | 'high';
  ttlSeconds: number;
}

export type PushResult =
  | { ok: true }
  /** `gone`: the subscription no longer exists (HTTP 404/410) and must be revoked. */
  | { ok: false; gone: boolean; error: string };

/** Replaceable push channel (PLAN §8): Web Push, FCM (Android) and APNs (iOS). */
export interface PushProvider {
  send(target: PushTarget, message: PushMessage, options: PushOptions): Promise<PushResult>;
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');
