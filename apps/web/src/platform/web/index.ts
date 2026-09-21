import type { Platform } from '../types';
import {
  createWebAppLifecycle,
  createWebCamera,
  createWebGeolocation,
  createWebHaptics,
  createWebKeepAwake,
  createWebPreferences,
} from './device';
import { createWebLocalNotifications } from './local-notifications';
import { createWebOfflineQueue } from './offline-queue';
import { createWebPush } from './push';
import { createWebSecureStorage } from './secure-storage';

export function createWebPlatform(): Platform {
  return {
    kind: 'web',
    push: createWebPush(),
    localNotifications: createWebLocalNotifications(),
    offlineQueue: createWebOfflineQueue,
    secureStorage: createWebSecureStorage(),
    preferences: createWebPreferences(),
    geolocation: createWebGeolocation(),
    camera: createWebCamera(),
    haptics: createWebHaptics(),
    keepAwake: createWebKeepAwake(),
    appLifecycle: createWebAppLifecycle(),
  };
}
