import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { App } from '@capacitor/app';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { KeepAwake } from '@capacitor-community/keep-awake';
import type {
  AppLifecyclePort,
  CameraPort,
  GeolocationPort,
  HapticsPort,
  KeepAwakePort,
  SecureStoragePort,
} from '../types';

/** Keychain (iOS) / Keystore-encrypted storage (Android) for the refresh token (PLAN §9.1). */
export function createNativeSecureStorage(): SecureStoragePort {
  return {
    async get(key) {
      try {
        const value = await SecureStorage.get(key);
        return typeof value === 'string' ? value : null;
      } catch {
        // Corrupted entry or a restored backup on a new device: treat as signed out.
        await SecureStorage.remove(key).catch(() => undefined);
        return null;
      }
    },
    async set(key, value) {
      await SecureStorage.set(key, value);
    },
    async remove(key) {
      await SecureStorage.remove(key);
    },
  };
}

export function createNativeGeolocation(): GeolocationPort {
  return {
    async current({ timeoutMs = 8000 } = {}) {
      try {
        const p = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 30_000,
        });
        return { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy };
      } catch {
        // Location is best-effort: a tap is still recorded without it.
        return null;
      }
    },
  };
}

export function createNativeCamera(): CameraPort {
  return {
    async pickPhoto() {
      try {
        const photo = await Camera.getPhoto({
          resultType: CameraResultType.Uri,
          source: CameraSource.Prompt,
          quality: 85,
          width: 1024,
          correctOrientation: true,
        });
        if (!photo.webPath) return null;
        return await (await fetch(photo.webPath)).blob();
      } catch {
        // The user cancelled or denied the camera.
        return null;
      }
    },
  };
}

export function createNativeHaptics(): HapticsPort {
  return {
    success: () => void Haptics.notification({ type: NotificationType.Success }).catch(() => {}),
    warning: () => void Haptics.notification({ type: NotificationType.Warning }).catch(() => {}),
  };
}

export function createNativeKeepAwake(): KeepAwakePort {
  return {
    enable: () => KeepAwake.keepAwake(),
    disable: () => KeepAwake.allowSleep(),
  };
}

export function createNativeAppLifecycle(): AppLifecyclePort {
  const subscribe = (event: 'pause' | 'resume', listener: () => void) => {
    const handle =
      event === 'pause' ? App.addListener('pause', listener) : App.addListener('resume', listener);
    return () => void handle.then((h) => h.remove());
  };
  return {
    onPause: (listener) => subscribe('pause', listener),
    onResume: (listener) => subscribe('resume', listener),
  };
}
