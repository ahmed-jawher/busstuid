import type { LocalNotification, LocalNotificationsPort } from '../types';
import { getServiceWorker } from './service-worker';

// Web limitation (PLAN §20.4): timers stop when the tab is closed or frozen, so these
// reminders only work while the page is open. Native builds use real OS scheduling.

async function show(n: LocalNotification): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  // Android Chrome forbids `new Notification()`; the service worker path works everywhere.
  const reg = await getServiceWorker();
  if (reg) {
    await reg.showNotification(n.title, {
      body: n.body,
      tag: n.id,
      data: { url: n.url },
      requireInteraction: true,
    });
  } else {
    new Notification(n.title, { body: n.body, tag: n.id });
  }
}

export function createWebLocalNotifications(): LocalNotificationsPort {
  const timers = new Map<string, ReturnType<typeof setInterval>>();

  const cancel = async (id: string) => {
    const t = timers.get(id);
    if (t !== undefined) clearInterval(t);
    timers.delete(id);
  };

  return {
    worksInBackground: false,

    async requestPermission() {
      if (typeof Notification === 'undefined') return false;
      if (Notification.permission === 'granted') return true;
      return (await Notification.requestPermission()) === 'granted';
    },

    async schedule(n) {
      await cancel(n.id);
      if (n.everyMinutes) {
        timers.set(
          n.id,
          setInterval(() => void show(n), n.everyMinutes * 60_000),
        );
      } else {
        await show(n);
      }
    },

    cancel,

    async cancelAll() {
      for (const id of [...timers.keys()]) await cancel(id);
    },
  };
}
