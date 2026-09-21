import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC keeps decorator metadata, which Nest's dependency injection relies on.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // PLAN §16: at least 90 % coverage for the critical-path modules.
    coverage: {
      provider: 'v8',
      include: ['src/trips/**', 'src/alerts/**', 'src/notifications/**'],
      reporter: ['text-summary', 'text'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 80 },
    },
  },
});
