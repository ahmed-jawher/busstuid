import { defineConfig, devices } from '@playwright/test';

// PLAN §16 E2E scenarios on a phone-sized screen (375 px, PLAN §17 phase 4 priority).
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  // Scenarios share the seeded drivers and trips, so they run one after another.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    ...devices['Pixel 7'],
    viewport: { width: 375, height: 812 },
    locale: 'ar-BH',
    timezoneId: 'Asia/Bahrain',
    permissions: ['notifications'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
