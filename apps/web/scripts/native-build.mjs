#!/usr/bin/env node
// Builds the web app for the Android/iOS shells. Inside the app the page is served from
// https://localhost (Android) or capacitor://localhost (iOS), so a relative or localhost API URL
// would point at the phone itself: an absolute HTTPS API URL is required.
//   VITE_API_URL=https://app.example.com/v1 pnpm --filter @wusool/web native:sync
import { execSync } from 'node:child_process';

const url = process.env.VITE_API_URL ?? '';
const allowHttp = process.argv.includes('--allow-http'); // emulator against a dev machine only
let parsed = null;
try {
  parsed = new URL(url);
} catch {
  // handled below
}
const ok =
  parsed &&
  (parsed.protocol === 'https:' || (allowHttp && parsed.protocol === 'http:')) &&
  (allowHttp || !['localhost', '127.0.0.1'].includes(parsed.hostname));
if (!ok) {
  console.error(
    'VITE_API_URL must be the absolute HTTPS address of the API for a native build,\n' +
      '  e.g. VITE_API_URL=https://app.example.com/v1\n' +
      '  (for an Android emulator against this machine: VITE_API_URL=http://10.0.2.2:3000/v1 with --allow-http)',
  );
  process.exit(1);
}
execSync('pnpm run build', { stdio: 'inherit' });
