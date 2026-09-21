# CLAUDE.md — Wusool Safe (وصول آمن)

Student-safety system for school transport. The full plan is [docs/PLAN.md](docs/PLAN.md); read it
before changing behaviour. Section 20 (autonomous execution) wins on any conflict. Decisions taken
during the build are in [docs/DECISIONS.md](docs/DECISIONS.md), progress in
[docs/CHANGELOG.md](docs/CHANGELOG.md).

## Hard constraints (PLAN §2) — ask before changing any of these

- Boarding/alighting is **tap only**. No QR, NFC or codes in trip operation. The only code in the
  whole system is the 6-digit email verification/reset code.
- No Google/Apple/third-party sign-in. Email + password only, with email verification.
- No SMS, calls or pay-per-message services. Notifications are free Web Push (VAPID) only.
- Guardians only create their account and add a child; everything else is notifications.
- Real PostgreSQL everywhere (dev, tests, CI, prod). **Never SQLite.**
- No external accounts or Docker needed in development (embedded PostgreSQL + local mail catcher).

## Design principles (PLAN §3) — non-negotiable

1. Safety over convenience: anything ambiguous is treated as danger.
2. Nothing on the critical path is deleted: trip events and alerts are append-only; corrections are
   new events.
3. Alerts close only through a documented human action (driver or org admin, with a reason).
4. The watchdog is independent of the driver; it never relies on "end trip" being pressed.
5. The driver's local alarm must not need the internet.
6. Driver app is offline-first; events are queued and sent idempotently (`client_event_id`).
7. API-first: the web app talks to the API over REST only.
8. Wrap-ready: the web app is a static SPA later wrapped with Capacitor using the same code.

## Device layer (PLAN §9.1)

- Components never call device/browser APIs directly. Use `platform` from `apps/web/src/platform`
  (push, localNotifications, offlineQueue, secureStorage, preferences, geolocation, camera, haptics,
  keepAwake, appLifecycle). ESLint blocks direct use outside `src/platform/`.
- No SSR, no API routes inside the web app, no server actions — static files only.
- API URL comes from `VITE_API_URL`. CORS always allows `capacitor://localhost` and
  `https://localhost`.
- All assets (fonts, icons, alarm sounds) are bundled locally — no CDNs.
- Deep links: `/trip/:id`, `/child/:id`, `/alert/:id`.

## Layout

```
apps/api          NestJS 11 API (/v1, Swagger at /docs)
apps/web          Vite + React SPA (driver, guardian, admin by route)
packages/shared   enums, schemas, state machines, notification templates
packages/ui-tokens design tokens → dist/tokens.css (themes: bh, sa)
packages/config   shared tsconfig presets
tools/dev-stack   embedded PostgreSQL 16 + mail catcher (replaces Docker in dev and tests)
```

## Commands

```bash
pnpm install
pnpm run setup      # NOT `pnpm setup` (that is a built-in pnpm command)
pnpm dev            # DB + mail inbox (http://localhost:8025) + API (:3000) + web (:5173)
pnpm test           # all tests; integration tests start a throwaway PostgreSQL
pnpm lint           # ESLint + secret scan
pnpm typecheck
pnpm format
```

## Rules

- Technical names (tables, fields, endpoints) in English; UI Arabic-first (RTL) with English.
- Every UI string lives in `apps/web/src/i18n/{ar,en}.json`.
- Every migration is reversible; never edit a migration that has been merged.
- Never commit `.env`, keys or tokens; the pre-commit secret scan must stay green.
- Integration tests use real PostgreSQL via `startTestPostgres()` from `@wusool/dev-stack`.
- One branch per phase (`phase-N-name`), PR to `main`, squash-merge only when build, lint,
  typecheck and tests pass. Append to `docs/CHANGELOG.md` at the end of each phase.
- When something is ambiguous: pick the option that is safest for children, then simplest, and
  record it in `docs/DECISIONS.md`.
