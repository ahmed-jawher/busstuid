/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

interface PushPayload {
  title: string;
  body: string;
  /** Deep link such as /trip/:id, /child/:id, /alert/:id (PLAN §9.1). */
  url?: string;
  tag?: string;
  critical?: boolean;
}

self.addEventListener('push', (event) => {
  let payload: PushPayload;
  try {
    payload = event.data?.json() as PushPayload;
  } catch {
    payload = { title: 'وصول آمن', body: event.data?.text() ?? '' };
  }
  // `renotify` is supported by browsers but missing from TypeScript's DOM types.
  const options: NotificationOptions & { renotify?: boolean } = {
    body: payload.body,
    tag: payload.tag,
    data: { url: payload.url },
    // Critical alerts stay on screen until the user acts (PLAN §7).
    requireInteraction: payload.critical ?? false,
    // Escalation repeats reuse the alert's tag; without this the repeat would be silent.
    renotify: Boolean(payload.tag),
    icon: 'icons/icon.svg',
    badge: 'icons/icon.svg',
  };
  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(
    (event.notification.data?.url as string | undefined) ?? './',
    self.registration.scope,
  );
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === url.origin) {
          await client.focus();
          if ('navigate' in client) await (client as WindowClient).navigate(url.href);
          return;
        }
      }
      await self.clients.openWindow(url.href);
    })(),
  );
});
