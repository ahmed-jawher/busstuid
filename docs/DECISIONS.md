# Decisions

Choices made during the build where the plan left room, or where reality forced a change.
Format: the decision, then why.

## Phase 0

- **Embedded PostgreSQL 16 instead of Docker/Testcontainers** (`embedded-postgres` npm package).
  The development machine has no Docker; this runs a real PostgreSQL without admin rights, in dev,
  tests and CI alike. Clusters are initialised with UTF-8 and `--locale=C` (the Windows default
  would be WIN1252, which would corrupt Arabic text).
- **Local mail catcher instead of Mailpit** (`smtp-server` + small web inbox on :8025, with a JSON
  API at `/api/messages` for tests). Same reason: no Docker.
- **Stable, well-known majors over the newest releases**: TypeScript 5.9, NestJS 11, Vite 7,
  Vitest 3, ESLint 9, Prisma 6 (phase 1), pg-boss 10 (phase 3). Newer majors (TypeScript 7,
  NestJS 12, Prisma 8 RC) are too fresh to bet a safety system on; upgrading later is routine.
- **`pnpm run setup`, not `pnpm setup`**: `pnpm setup` is a built-in pnpm command that would run
  instead of our script.
- **Linting runs once at the root** (`eslint .`) with a single flat config, instead of per package.
- **Device-API guard in ESLint**: `navigator.vibrate/geolocation/wakeLock/serviceWorker`,
  `Notification`, `indexedDB` and `localStorage` are errors outside `apps/web/src/platform/`.
- **Added a `preferences` port** (language, theme) to the platform layer. The plan lists no port for
  it, but iOS may clear WebView `localStorage`; native builds will use `@capacitor/preferences`.
- **Native platform throws until phase 6** instead of falling back to web implementations, so a
  native build can never silently ship without background reminders.
- **Browser routing (not hash routing)**: Capacitor serves `index.html` for unknown paths, and
  clean URLs make the deep links `/trip/:id` etc. identical on web and native. Vite `base: './'`
  keeps the same `dist/` usable in both.
- **Web secure storage** encrypts values with a non-extractable AES-GCM key stored in IndexedDB.
- **Dark mode is the default scheme**, per PLAN §13 (use inside the vehicle).
- **Beta banner on every screen** (not only the admin dashboard as §20.4 says) — safer.
- **Placeholder theme colours** are marked `TODO: verify against official guideline`; no
  government emblems, names or seals are used anywhere.
- **Sentry is not installed yet**; it will be added as an optional integration in phase 5 that
  stays off unless `SENTRY_DSN` is set.
- **Swagger UI telemetry (`@scarf/scarf`) is blocked** from running its install script.
- **Request logs** contain only id, method, URL and status; headers (tokens) are never logged, and
  health checks are not logged.
