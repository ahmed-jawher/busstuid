import type { PermissionState, PushPort, PushRegistration } from '../types';
import { getServiceWorker } from './service-worker';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function toBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createWebPush(): PushPort {
  const isSupported = () =>
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  return {
    isSupported,

    async permission(): Promise<PermissionState> {
      if (!isSupported()) return 'unsupported';
      return Notification.permission === 'default' ? 'prompt' : Notification.permission;
    },

    async subscribe(vapidPublicKey): Promise<PushRegistration> {
      if (!isSupported()) throw new Error('push-unsupported');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('push-permission-denied');
      const reg = await getServiceWorker();
      if (!reg) throw new Error('push-unsupported');
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));
      return {
        provider: 'webpush',
        platform: 'web',
        endpoint: sub.endpoint,
        p256dh: toBase64Url(sub.getKey('p256dh')),
        auth: toBase64Url(sub.getKey('auth')),
      };
    },

    async unsubscribe() {
      const reg = await getServiceWorker();
      const sub = await reg?.pushManager.getSubscription();
      await sub?.unsubscribe();
    },
  };
}
