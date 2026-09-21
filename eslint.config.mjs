// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Device APIs must only be touched inside apps/web/src/platform (PLAN §9.1).
const deviceApiMessage = 'Device APIs are only allowed inside src/platform/ (PLAN §9.1).';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.data/**',
      '**/dev-dist/**',
      '**/android/**',
      '**/ios/**',
      '**/src/generated/**',
      '**/dist-e2e/**',
      '**/test-results/**',
      '**/playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}', 'apps/api/**/*.ts', 'packages/**/*.ts', 'tools/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-globals': [
        'error',
        { name: 'Notification', message: deviceApiMessage },
        { name: 'indexedDB', message: deviceApiMessage },
        { name: 'localStorage', message: deviceApiMessage },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'navigator', property: 'geolocation', message: deviceApiMessage },
        { object: 'navigator', property: 'vibrate', message: deviceApiMessage },
        { object: 'navigator', property: 'wakeLock', message: deviceApiMessage },
        { object: 'navigator', property: 'serviceWorker', message: deviceApiMessage },
        { object: 'window', property: 'Notification', message: deviceApiMessage },
        { object: 'window', property: 'indexedDB', message: deviceApiMessage },
      ],
    },
  },
  {
    files: ['apps/web/src/platform/**/*.{ts,tsx}', 'apps/web/src/sw.ts'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
    },
  },
);
