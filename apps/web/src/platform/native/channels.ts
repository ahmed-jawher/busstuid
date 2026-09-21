import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';

/**
 * Android notification channels. The ids must match the API (apps/api/src/push/fcm.provider.ts,
 * ANDROID_CHANNELS). Critical alerts get the highest importance so they sound and show over
 * other apps; the user can still change this in the system settings.
 */
export const CHANNELS = {
  critical: { id: 'wusool_critical', name: 'تنبيهات السلامة العاجلة', importance: 5 },
  normal: { id: 'wusool_default', name: 'تحديثات الرحلات', importance: 4 },
  reminders: { id: 'wusool_reminders', name: 'تذكير السائق', importance: 5 },
} as const;

export async function createChannels(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  for (const c of Object.values(CHANNELS)) {
    const channel = {
      id: c.id,
      name: c.name,
      importance: c.importance,
      visibility: 0, // private: names stay hidden on the lock screen
      vibration: true,
      lights: true,
    } as const;
    await PushNotifications.createChannel(channel);
    await LocalNotifications.createChannel(channel);
  }
}
