import type { Platform } from '../types';

// Native implementations (Capacitor plugins) are written in phase 6 (PLAN §9.1, §17).
// Until then a native build fails fast instead of silently running without safety features.
export function createNativePlatform(): Platform {
  throw new Error(
    'Native platform is not implemented yet (phase 6). Build the web app or finish src/platform/native.',
  );
}
