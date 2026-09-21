import type { Platform } from '../types';
import { createWebAlarm } from '../web/alarm';
import { createWebPreferences } from '../web/device';
import { createWebOfflineQueue } from '../web/offline-queue';
import { createChannels } from './channels';
import {
  createNativeAppLifecycle,
  createNativeCamera,
  createNativeGeolocation,
  createNativeHaptics,
  createNativeKeepAwake,
  createNativeSecureStorage,
} from './device';
import { createNativeLocalNotifications } from './local-notifications';
import { createNativePush } from './push';

// Capacitor implementations of the device ports (PLAN §9.1). Some web implementations are
// reused on purpose because the app's web view supports them fully:
// - offline queue: IndexedDB persists in the app's own storage;
// - preferences: must be synchronous, and localStorage is kept by the web view;
// - alarm: Web Audio plays while the app is open; with the app in the background the
//   high-importance notification channels and scheduled reminders take over.
export function createNativePlatform(): Platform {
  void createChannels();
  return {
    kind: 'native',
    push: createNativePush(),
    localNotifications: createNativeLocalNotifications(),
    offlineQueue: createWebOfflineQueue,
    secureStorage: createNativeSecureStorage(),
    preferences: createWebPreferences(),
    geolocation: createNativeGeolocation(),
    camera: createNativeCamera(),
    haptics: createNativeHaptics(),
    keepAwake: createNativeKeepAwake(),
    appLifecycle: createNativeAppLifecycle(),
    alarm: createWebAlarm(),
  };
}
