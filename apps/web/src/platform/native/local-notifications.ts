import { LocalNotifications } from '@capacitor/local-notifications';
import type { LocalNotification, LocalNotificationsPort } from '../types';
import { CHANNELS } from './channels';
import { openInApp } from './open-url';

// Real OS scheduling: reminders fire with the app in the background or closed (PLAN §6.4,
// §20.4). A repeating reminder is scheduled as a fixed series of one-shot notifications, which
// behaves the same on Android and iOS; cancelling removes the whole series.

/** How many repeats are scheduled ahead (e.g. 12 × 5 min = one hour of reminders). */
export const REPEATS = 12;
const SLOTS = 100;

/** Stable 31-bit numeric base per string id; occurrences use base + 0…REPEATS-1. */
export function numericIds(id: string): number[] {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  const base = ((h >>> 0) % 20_000_000) * SLOTS + 1;
  return Array.from({ length: REPEATS }, (_, i) => base + i);
}

export function createNativeLocalNotifications(): LocalNotificationsPort {
  void LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    openInApp((action.notification.extra as { url?: unknown } | undefined)?.url);
  });

  const cancel = async (id: string) => {
    await LocalNotifications.cancel({ notifications: numericIds(id).map((n) => ({ id: n })) });
  };

  return {
    worksInBackground: true,

    async requestPermission() {
      let { display } = await LocalNotifications.checkPermissions();
      if (display !== 'granted') ({ display } = await LocalNotifications.requestPermissions());
      return display === 'granted';
    },

    async schedule(n: LocalNotification) {
      await cancel(n.id);
      const ids = numericIds(n.id);
      const now = Date.now();
      const occurrences = n.everyMinutes ? ids : ids.slice(0, 1);
      await LocalNotifications.schedule({
        notifications: occurrences.map((nid, i) => ({
          id: nid,
          title: n.title,
          body: n.body,
          channelId: CHANNELS.reminders.id,
          extra: { url: n.url },
          schedule: {
            at: new Date(now + (n.everyMinutes ? (i + 1) * n.everyMinutes * 60_000 : 1000)),
            allowWhileIdle: true,
          },
        })),
      });
    },

    cancel,

    async cancelAll() {
      const { notifications } = await LocalNotifications.getPending();
      if (notifications.length) {
        await LocalNotifications.cancel({
          notifications: notifications.map((p) => ({ id: p.id })),
        });
      }
    },
  };
}
