import type { CapacitorConfig } from '@capacitor/cli';

// Android and iOS apps wrapping the same web build (PLAN §9.1, phase 6). Build with
// `pnpm --filter @wusool/web native:sync` — see docs/RELEASE.md.
const config: CapacitorConfig = {
  // Must match APNS_BUNDLE_ID on the server and the Firebase Android app. It cannot change after
  // the first store upload.
  appId: 'com.wusoolsafe.app',
  appName: 'وصول آمن',
  webDir: 'dist',
  android: {
    // The API is always HTTPS in production; never allow plain HTTP inside the app.
    allowMixedContent: false,
  },
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
    LocalNotifications: { iconColor: '#0F766E' },
  },
};

export default config;
