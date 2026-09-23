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

## Phase 3 — Notifications and alerts

**Acceptance:** tests 2 (forced end → critical alert to driver, guardian and admin), 3 (never
ended → `trip_overdue`), 4 (device silent → `driver_device_silent`), 7 (escalation survives a
restart), 8 (repeats until resolved, stops immediately) and 11 pass; the alert part of test 9
passes too. ✅

- Web Push delivery pipeline: notification + per-device delivery rows, sent after commit,
  retried every minute, expired devices revoked; in-app inbox with read state.
- Bilingual templates from PLAN §8 in `packages/shared`; routine notifications can be muted by
  guardians, alerts never.
- Guardians are notified when their child boards, gets off, or is marked absent.
- Alerts: list (org), my alerts (guardian/driver), detail with history, acknowledge, resolve with
  a required reason (corrective alight event, reassurance to guardians).
- Escalation: repeat every 2 min, widen at 5, emergency number at 10; stops on resolve.
- Watchdog every minute: overdue trips and silent driver devices, per-organisation settings.
- Jobs on pg-boss (queue in PostgreSQL): watchdog, escalation, dispatch retries, daily trip
  generation; boot-time reconciliation of open alerts.
- Admin list of guardians who cannot currently be reached.
- Migration 2: `pgboss` schema and indexes for due alerts/pending deliveries.
- Note: existing development databases need `pnpm run setup` again (applies migration 2 and the
  new role grant).

## Phase 4 — Interfaces

**Acceptance:** the four PLAN §16 E2E scenarios pass through the real UI on a 375 px screen. ✅

- Auth screens: sign in, sign up, email code, forgot/reset password.
- Notification setup with the iPhone home-screen instructions and a test notification;
  drivers are sent here when a trip cannot start.
- Driver: today's trips; trip screen with large photo cards, one or two buttons per card, 60 s
  undo toast, live counter, sync indicator, offline queue, keep-awake, heartbeat, background
  reminder, add an unexpected child, end flow with red screen + local alarm, empty-vehicle
  confirmation, and a double-confirmed forced end with reason.
- Guardian: children with live status ("on the bus since 6:42"), add-child flow (school list or
  driver phone with name confirmation, photo, consent), child page with today and history,
  full-screen alert with call buttons, inbox, settings (mute routine, delete account).
- Admin: organisation switcher, live trips, pinned alert bar with sound, alerts with
  acknowledge/resolve, enrollment requests, students, vehicles, routes with stops and student
  assignment, members, unreachable guardians; organisation registration; platform approvals.
- API additions: driver candidate search, guardian alert detail, live counts on org trips,
  log-only push provider for E2E.
- Playwright E2E package (`pnpm e2e`) with an isolated stack; runs in CI with screenshots.

## Phase 5 — Hardening

- Rate limiting (strict on sign-in, codes and driver lookup), helmet headers, trust-proxy.
- Audit log for sensitive actions, including viewing students with photos; admin audit page.
- Retention job with a narrow, role- and flag-guarded exception to append-only (migration 3).
- Guardians can export or delete their child's data.
- Optional TOTP two-step sign-in (RFC 6238), with settings UI and sign-in code field.
- Optional Sentry error reporting.
- Encrypted, rotated backups and tag-checked restore; operations CLI in the API image.
- Production: API and web Dockerfiles, Caddy with automatic HTTPS and strict headers,
  `infra/docker-compose.prod.yml` with a daily backup service, `scripts/prod-env.mjs`,
  docs/DEPLOY.md; CI builds the images and smoke-tests the stack through Caddy.
- Load test: 200 concurrent trips, 0 errors (docs/LOAD_TEST.md); fixed a trip-generation race.
- Automated field simulation of a full school day (offline batches, backgrounded app, forgotten
  child, watchdog, escalation, resolution) replacing the human field trial (PLAN §20).
- Guardians now get one message per tap, so late offline batches report both boarding and
  getting off.
- Coverage gate ≥ 90 % for the critical-path modules.

## Phase 6 — Native apps (partial, PLAN §20)

- Capacitor Android and iOS projects (`apps/web/android`, `apps/web/ios`), app id
  `com.wusoolsafe.app`, Arabic first, permissions with explanations, no cloud backup.
- Native device ports: push (FCM/APNs tokens), OS-scheduled reminders, Keychain/Keystore,
  one-shot location, camera, haptics, keep-awake, lifecycle, notification deep links.
- Server push via FCM HTTP v1 and APNs HTTP/2, optional and configured from the environment;
  subscriptions accept native device tokens.
- `native:sync` build that refuses a missing or local API address.
- CI builds a debug APK on every pull request.
- docs/RELEASE.md: the owner's steps for Firebase, Apple, signing, stores and on-device checks.

## Fix — registering an organisation

- New accounts land on the guardian screen, which hid the "register an organisation or
  independent driver" link. It is now on the guardian home, in Settings, and explained on the
  sign-up page.

## Sign-up by account type

- The first sign-up screen asks: guardian, independent driver, school or company, or driver at
  one. Organisations are created on email verification; each account lands on its interface.

## Name: طمّني — Tammeni

- Renamed everywhere users see it (app, emails, notifications, stores, authenticator issuer);
  app id `com.tammeni.app`.
- Removed the pilot-version banner at the owner's request.

## Admin redesign (branch `new-design`)

- New admin app shell from Claude Design: navy title bar, pinned critical alert with mute, bottom
  tabs on phones and a sidebar on desktop.
- New screens: trip detail with the passenger list, alert detail with a timeline and a sticky
  close button, and "More" (data, follow-up, dark mode, language, account).
- Tammeni brand colours, Readex Pro figures and bundled Material Symbols icons.

## Full redesign (branch `new-design`)

- Onboarding: welcome, sign in, three-step sign-up with a +973 phone and password meter, six-box
  email code, notifications step, and a ready screen per account type.
- Guardian app with four tabs, child cards (home → bus → school), child timeline, full-screen
  alert with who is following, notifications, services, history, help, and a four-step add-child
  wizard; one account screen for every role (password change, two-step sign-in, dark mode).
- Driver app: day view with one big action per trip, the list grouped by stop, sync pill, and
  the staged end (red screen with alarm, undecided children, press-and-hold, forced end, summary).
- Admin on the web: navy sidebar with the organisation switcher, page headers with actions, side
  panels for trips, alerts and routes, tables for students and the audit log, dialogs to add
  routes and vehicles.
- API: link-request notifications and a 10-minute undo, guardian names on requests, routes on the
  student list, alert follow-up for guardians, password change.
- New app icon and splash screens.

## Codes, search and kindergartens

- Kindergarten organisations; organisation names required in both languages and unique per
  country and type (except independent drivers).
- Short public code for every child and account; driver search by name, code or guardian phone.

## Bahrain school list

- 516 schools, kindergartens and nurseries ship with the app; the guardian picks their school
  from the list when adding a child, or types a name that is not listed.

## Privacy policy and terms

- Public /privacy and /terms pages in both languages, linked from sign-up, describing the data
  the app really stores. Drafts pending a lawyer review.
