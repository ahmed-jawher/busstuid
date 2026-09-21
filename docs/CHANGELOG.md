# Changelog

## Phase 0 — Foundation

**Acceptance:** `pnpm dev` starts everything and `pnpm test` passes. ✅

- pnpm + Turborepo monorepo: `apps/api`, `apps/web`, `packages/shared`, `packages/ui-tokens`,
  `packages/config`, `tools/dev-stack`.
- **No Docker needed**: `tools/dev-stack` runs a real PostgreSQL 16 (embedded) and a local mail
  catcher with a web inbox at http://localhost:8025.
- `pnpm run setup`: creates `.env`, generates VAPID keys and all secrets, initialises the database,
  builds shared packages, and runs migrations/seed when they exist (phase 1).
- `pnpm dev`: database + mail inbox + API (http://localhost:3000, docs at `/docs`) + web
  (http://localhost:5173).
- API (NestJS 11): `/v1` prefix, Swagger, structured logging without headers, CORS that always
  allows the Capacitor origins, `GET /v1/health` with a real database check.
- Web (Vite + React 19 + Tailwind 4): Arabic-first RTL with English, Bahrain and Saudi themes,
  dark mode by default, locally bundled IBM Plex Sans Arabic, PWA service worker with push and
  deep-link click handling, beta safety banner.
- `src/platform/` with interfaces and web implementations for push, local notifications,
  offline queue (IndexedDB), encrypted secure storage, preferences, geolocation, camera, haptics,
  keep-awake and app lifecycle. ESLint forbids device APIs outside this folder.
- `packages/ui-tokens`: themes as design tokens emitted to CSS, with a WCAG AA contrast test.
- Secret scan on every commit (pre-commit hook) and in CI; GitHub Actions CI runs build, lint,
  format, typecheck and tests (with real PostgreSQL).
- Deferred to phase 1: `packages/api-client` (generated from OpenAPI once real endpoints exist).
- Tests: 16 passing (shared 2, ui-tokens 2, dev-stack 2, api 5, web 5).
