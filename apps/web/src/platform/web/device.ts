import type {
  AppLifecyclePort,
  CameraPort,
  GeolocationPort,
  HapticsPort,
  KeepAwakePort,
  PreferencesPort,
} from '../types';

export function createWebGeolocation(): GeolocationPort {
  return {
    current({ timeoutMs = 8000 } = {}) {
      return new Promise((resolve) => {
        if (!('geolocation' in navigator)) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (p) =>
            resolve({
              lat: p.coords.latitude,
              lng: p.coords.longitude,
              accuracyM: p.coords.accuracy,
            }),
          // Location is best-effort: a tap is still recorded without it.
          () => resolve(null),
          { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
        );
      });
    },
  };
}

export function createWebCamera(): CameraPort {
  return {
    pickPhoto() {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.setAttribute('capture', 'user');
        input.onchange = () => resolve(input.files?.[0] ?? null);
        input.oncancel = () => resolve(null);
        input.click();
      });
    },
  };
}

export function createWebHaptics(): HapticsPort {
  const vibrate = (pattern: number | number[]) => {
    if ('vibrate' in navigator) navigator.vibrate(pattern);
  };
  return {
    success: () => vibrate(30),
    warning: () => vibrate([80, 60, 80]),
  };
}

export function createWebKeepAwake(): KeepAwakePort {
  let sentinel: WakeLockSentinel | null = null;
  let wanted = false;

  const acquire = async () => {
    if (
      !wanted ||
      sentinel ||
      !('wakeLock' in navigator) ||
      document.visibilityState !== 'visible'
    ) {
      return;
    }
    try {
      sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => {
        sentinel = null;
      });
    } catch {
      sentinel = null;
    }
  };

  // The browser drops the lock when the page is hidden; take it back on return.
  document.addEventListener('visibilitychange', () => void acquire());

  return {
    async enable() {
      wanted = true;
      await acquire();
    },
    async disable() {
      wanted = false;
      await sentinel?.release();
      sentinel = null;
    },
  };
}

export function createWebAppLifecycle(): AppLifecyclePort {
  const subscribe = (state: 'hidden' | 'visible', listener: () => void) => {
    const handler = () => {
      if (document.visibilityState === state) listener();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  };
  return {
    onPause: (listener) => subscribe('hidden', listener),
    onResume: (listener) => subscribe('visible', listener),
  };
}

export function createWebPreferences(): PreferencesPort {
  const PREFIX = 'wusool:';
  return {
    get(key) {
      try {
        return localStorage.getItem(PREFIX + key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(PREFIX + key, value);
      } catch {
        // Private mode or storage disabled: preferences simply don't persist.
      }
    },
  };
}
