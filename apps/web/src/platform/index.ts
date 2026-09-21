import { Capacitor } from '@capacitor/core';
import { createNativePlatform } from './native';
import type { Platform } from './types';
import { createWebPlatform } from './web';

export type * from './types';

export function selectPlatform(isNative: boolean): Platform {
  return isNative ? createNativePlatform() : createWebPlatform();
}

export const platform: Platform = selectPlatform(Capacitor.isNativePlatform());
