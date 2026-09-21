import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import type { PermissionState, PushPort, PushRegistration } from '../types';
import { openInApp } from './open-url';

// Android gets an FCM token and iOS an APNs device token; the API picks the matching provider
// (apps/api/src/push). Notification channels are created at start-up (./channels.ts).

const REGISTRATION_TIMEOUT_MS = 15_000;

function nativeToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const handles = [
      PushNotifications.addListener('registration', (t) => finish(() => resolve(t.value))),
      PushNotifications.addListener('registrationError', (e) =>
        finish(() => reject(new Error(`push-registration-failed: ${e.error}`))),
      ),
    ];
    const timer = setTimeout(
      () => finish(() => reject(new Error('push-registration-failed: timeout'))),
      REGISTRATION_TIMEOUT_MS,
    );
    function finish(settle: () => void) {
      clearTimeout(timer);
      for (const h of handles) void h.then((l) => l.remove());
      settle();
    }
    void PushNotifications.register().catch((e: unknown) =>
      finish(() => reject(e instanceof Error ? e : new Error(String(e)))),
    );
  });
}

export function createNativePush(): PushPort {
  // Tapping a notification opens its screen (PLAN §9.1 deep links).
  void PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    openInApp((action.notification.data as { url?: unknown } | undefined)?.url);
  });

  return {
    isSupported: () => true,

    async permission(): Promise<PermissionState> {
      const { receive } = await PushNotifications.checkPermissions();
      return receive === 'prompt-with-rationale' ? 'prompt' : receive;
    },

    async subscribe(): Promise<PushRegistration> {
      let { receive } = await PushNotifications.checkPermissions();
      if (receive !== 'granted') ({ receive } = await PushNotifications.requestPermissions());
      if (receive !== 'granted') throw new Error('push-permission-denied');
      const token = await nativeToken();
      return Capacitor.getPlatform() === 'ios'
        ? { provider: 'apns', platform: 'ios', nativeToken: token }
        : { provider: 'fcm', platform: 'android', nativeToken: token };
    },

    async unsubscribe() {
      await PushNotifications.unregister();
    },
  };
}
