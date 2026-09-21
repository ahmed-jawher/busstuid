import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Load test only (pnpm --filter @wusool/api loadtest); never part of the normal suite.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['load/**/*.test.ts'],
    testTimeout: 900_000,
    hookTimeout: 120_000,
  },
});
