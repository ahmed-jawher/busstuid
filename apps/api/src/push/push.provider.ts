export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
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

/**
 * Replaceable push channel (PLAN §8). `webpush` now; `fcm`/`apns` join in phase 6 behind the
 * same interface.
 */
export interface PushProvider {
  send(target: PushTarget, message: PushMessage, options: PushOptions): Promise<PushResult>;
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');
