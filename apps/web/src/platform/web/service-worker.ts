import { registerSW } from 'virtual:pwa-register';

let registered: Promise<ServiceWorkerRegistration | null> | null = null;

/** Registers the app service worker once and resolves when it is active. */
export function getServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  registered ??= (async () => {
    registerSW({ immediate: true });
    return navigator.serviceWorker.ready;
  })();
  return registered;
}
