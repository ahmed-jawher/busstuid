/// <reference types="vitest/config" />
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Reads VITE_* from the monorepo root .env (PLAN §9.1: VITE_API_URL).
  envDir: path.resolve(__dirname, '../..'),
  // Absolute asset paths: deep links such as /trip/:id must load /assets/…, not /trip/assets/….
  // Capacitor serves the app from the root too (capacitor://localhost/), so this works there.
  base: '/',
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      registerType: 'prompt',
      manifest: {
        name: 'وصول آمن',
        short_name: 'وصول آمن',
        description: 'سلامة الطلاب في النقل المدرسي',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        display: 'standalone',
        background_color: '#f8f7f7',
        theme_color: '#ce1126',
        icons: [{ src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,mp3}'],
      },
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
  server: { port: 5173, strictPort: true },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
