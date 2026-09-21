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

## Phase 1 — Data and identity

**Acceptance:** tests 9 (guardian sees only own children — data part; alert part in phase 3),
10 (RLS between organisations) and 12 (unverified accounts, code expiry/attempts, resend limits)
pass. ✅

- Full schema from PLAN §10 in one migration (24 tables), with CHECK constraints, the
  one-active-trip-per-vehicle index, append-only triggers on `trip_events`, `alert_events` and
  `audit_logs`, and Row Level Security forced on every table.
- Two DB roles (`wusool_app` under RLS, `wusool_system` for sign-in and jobs); `pnpm run setup` now
  migrates, provisions the roles and seeds.
- Accounts: register, verify email (6-digit code, 10 min, 5 attempts, 60 s resend, 5/hour),
  login with lockout after 10 failures, refresh-token rotation with reuse detection, logout,
  forgot/reset password, change email, delete account.
- Organisations: create (independent drivers active at once; schools pending platform approval),
  directory, driver lookup by phone, platform approve/suspend.
- Guardians: add a child with photo + consent + enrollment request, list/view children, replace
  photo, request enrollment in another organisation.
- Organisation admins: enrollment queue (name and school only), approve/reject, student list with
  photos.
- Photos: processed to 400×400 WebP ≤ 100 KB, stored in PostgreSQL, served via 5-minute signed URLs.
- Web Push: VAPID key endpoint, device subscriptions, test notification, automatic revocation of
  expired subscriptions.
- Seed: a school with 2 buses and 2 drivers, an independent driver with a van, 6 routes with stops,
  40 enrolled students with placeholder photos, 31 guardians, 1 pending request.
- Tests: 57 API tests (integration tests on real PostgreSQL), including migration rollback and a
  schema-drift check.

## Phase 2 — Trips

**Acceptance:** tests 1 (boarded but not alighted blocks the normal end), 5 (duplicate events
stored once) and 6 (late, out-of-order offline events end in the right state) pass. ✅
Test 11 (no trip start without working notifications) and the trip part of test 12 also pass.

- Pure, shared trip rules: trip status machine, per-child event fold, undo window, end-of-trip
  check, and timezone helpers — 12 unit tests.
- Organisation setup API: vehicles, routes with stops, rider assignments per stop, members.
- Daily trip generation from routes (idempotent; also lazily on the driver's "today").
- Driver API: today's trips, start, manifest (photos, stops, counts, PLAN §6.2 ordering), batched
  taps with offline sync, heartbeat with foreground/background state, end (normal with empty
  confirmation, or forced with reason), add an unexpected child.
- Forced end with children on board or unaccounted for opens alerts (delivery in phase 3).
- Guardian API: child's trips today and history.
- Org API: trips by date, manual generation.
- Tests: 81 API tests.
