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

## Phase 1

- **Two database login roles.** `wusool_app` serves user requests and is bound by Row Level
  Security (FORCE RLS on every table). `wusool_system` has BYPASSRLS and is used only for sign-in
  flows, background jobs, and a few narrow cross-tenant reads that are checked in code (the
  enrollment queue, the school directory, driver lookup by phone). The RLS context is set per
  transaction with `set_config(..., true)`, so it cannot leak between pooled connections.
- **Guardians are covered by RLS too**, not only organisations: they can read their own children's
  trips, events, stops and alerts through SECURITY DEFINER helper functions, and nothing else.
- **Before approval an organisation sees only the child's name and school.** The photo and birth
  date become visible only once it approves the enrollment request (RLS on `students` and
  `student_photos`).
- **Schools and transport companies start as `pending_review`** and are hidden from the directory
  until a platform admin approves them, so nobody can impersonate a real school. Independent
  drivers are active immediately because guardians reach them only by phone number and must
  confirm the name shown.
- **One independent driver per phone number** (advisory-locked check), because phone numbers are
  not verified.
- **Platform admin is a user flag (`is_platform_admin`)** rather than a membership, since it is not
  tied to any organisation.
- **Emails are stored lower-case with a CHECK constraint** instead of the `citext` extension, which
  would need a Prisma preview feature.
- **Reversible migrations**: Prisma migrations are forward-only, so every migration folder carries a
  hand-written `down.sql`; `pnpm --filter @wusool/api db:rollback` runs the newest one. A test
  rolls everything back and re-applies it, and another fails if `schema.prisma` and the SQL drift.
- **Access tokens are HS256 JWTs signed with `node:crypto`** (15 minutes, header pinned so `alg`
  cannot be switched). Refresh tokens are opaque, stored as SHA-256, rotated on every use; reusing
  a rotated token revokes its whole family.
- **Email codes are hashed with a keyed HMAC** (a leaked table can't be brute-forced over the 10⁶
  code space), and wrong-attempt counters are committed in their own transaction before the error
  is returned — otherwise the rollback would silently disable the 5-attempt limit. Same for the
  login lockout counter.
- **No account discovery**: register, resend and forgot-password answer identically whether or not
  the email exists; unknown emails still pay the argon2 cost at login.
- **Photos**: EXIF-rotated, cropped to 400×400 with attention-based positioning, all metadata
  (including GPS) stripped, WebP ≤ 100 KB, stored in PostgreSQL. Served only through HMAC-signed
  URLs valid 5 minutes and bound to the photo version, so replacing a photo kills old links.
- **Account deletion** anonymises the user, revokes sessions and devices, and — for children with
  no other guardian — deletes the photo, withdraws consent, cancels requests and unlinks the child.
  Trip events and alerts are kept (PLAN §14).
- **Push subscriptions are keyed by endpoint** and move to whoever signs in on that device.
- **TOTP for admins is deferred to phase 5** (it is optional in PLAN §5.1); the column exists.
- **Seed data** uses fictional names, reserved `example.com` emails and `+973 3999 xxxx` numbers.

## Phase 2

- **A child's status is always rebuilt from the full event history** (`foldStudentEvents` in
  `packages/shared`), ordered by the device's `clientRecordedAt` with the server's receive time
  as tie-breaker. Late, out-of-order and resent taps therefore converge on the same answer, and
  the driver app can run the same function offline.
- **Conservative fold rules**: a child can board from any state (including after alighting);
  "absent" never overrides "boarded"; an "alight" for a child who never boarded has no effect. All
  taps are still stored — nothing on the critical path is dropped.
- **Undo**: 60 s by device time plus a 10 s clock-jitter allowance; an undo outside the window is
  rejected and not stored. The original tap stays; the undo is a new event.
- **Duplicate taps** are detected by `clientEventId` across all organisations, and re-checked under
  the trip row lock so two simultaneous resends cannot both insert.
- **A forced end is always possible** (the driver must never be trapped with an ended shift), but
  children recorded on board raise a _critical_ `student_left_onboard` alert and children never
  accounted for become `missing` with a _high_ alert of the same type — unknown is treated as
  danger. Alerts are created now; delivery and escalation arrive in phase 3.
- **Late offline taps** recorded on the device up to 5 minutes after the end are accepted and
  update the child's state (a later human resolution still wins over them).
- **Trips are generated lazily** whenever a driver opens "today", in addition to the nightly job
  (phase 3), so a missed job never leaves a driver without a trip.
- **Who may do what on a trip**: start — the assigned driver only; end — the driver or an org admin
  (the driver may have forgotten); record taps/heartbeat/manifest — driver, attendants, admins.
  Everyone else gets 404, so trip ids cannot be probed.
- **Starting a trip requires a device that passed the test notification**, implementing PLAN §7
  (test 11) already in this phase.
- **Idempotency without storing `Idempotency-Key`s**: start/end are checked under a row lock and
  events are keyed by `clientEventId`, so retries are harmless; the header is accepted and
  documented but not needed.
- **Guardian "today"** uses the local date of every supported country (both are UTC+3 today, but
  the code does not assume it).

## Phase 3

- **Escalation state lives in the database** (`alerts.next_escalation_at`). pg-boss only runs a
  minute job that processes whatever is due, so a restart loses nothing; on boot any open
  high/critical alert without a schedule is made due immediately (PLAN §12, test 7). Rows are
  claimed with `FOR UPDATE SKIP LOCKED`, so several API instances can run safely.
- **New alerts are sent right after commit** (not at the next minute tick) through a small
  `SideEffects` runner; the minute jobs are the safety net.
- **Escalation plan (PLAN §7)**: minute 0 — driver, primary guardians and all org admins; every
  2 minutes — repeat to the same people; minute 5 — every guardian of the child; minute 10 —
  the country's emergency number is appended to every message. Acknowledging records who is
  handling it but does **not** stop the reminders; only resolving does.
- **Low-severity alerts** (`unexpected_student`) notify admins once and never repeat.
- **Overdue alerts name each child still recorded on board**, to the driver, every admin and that
  child's guardians — an admin needs to know who, not just which bus.
- **An overdue or device-silent alert cannot be resolved while a child is still recorded on
  board** (409 `students_still_onboard`).
- **Resolving a "left on board" alert appends a corrective `alight` event** (reasons that mean the
  child got off) and marks the child `resolved`; guardians receive "تم التأكد من سلامة …".
- **Deliveries are claimed atomically** before sending, so concurrent dispatchers never send the
  same push twice; failures retry every minute up to 5 attempts; 404/410 revokes the device.
- **Names are stored in both languages** in notification payloads and rendered in each
  recipient's language at send time.
- **pg-boss needs `CREATE` on the database** for its unconditional `CREATE SCHEMA IF NOT EXISTS`;
  it is granted to `wusool_system` only. The `pgboss` schema itself is created by a migration.
- **Watchdog settings** (`overdueMarginMinutes`, `deviceSilentMinutes`) are read from
  `organizations.settings` with the plan's defaults (15 and 10 minutes).
- **Repeated alert pushes set `renotify`** in the service worker so each repeat makes a sound.

## Phase 4

- **One Vite app, three interfaces by route** (`/driver`, `/guardian`, `/admin`); the home screen
  sends a user with a single role straight to it.
- **Absolute asset base (`/`)**, not `./` as in phase 0: with relative paths, deep links like
  `/notifications/setup` loaded `/notifications/assets/…` and rendered a blank page (caught by
  the E2E suite). Capacitor also serves from the root, so this is correct for the wrapped app.
- **Driver taps are optimistic and offline-first**: the card changes instantly, the tap goes to
  the durable device queue with a one-shot location (≤ 1.5 s, never blocking the screen), and a
  sync loop sends batches every 5 s and on reconnect. A child's local override is dropped only
  when the server shows the same status, so a slow response can never flash an old status (the
  first, timing-based version flickered on CI).
- **Ending needs every queued tap delivered first** — the server decides with the full picture.
- **The local alarm is synthesised with Web Audio** (no file, works offline) and sounds while the
  red "children on board" screen is open, and on the admin dashboard for open critical alerts
  until silenced; it restarts for a new critical alert.
- **Dialogs report only user dismissal** (Escape), not programmatic closing — otherwise moving
  from the red screen to the force-end form reset the flow (caught by the E2E suite).
- **Admin live view polls every 10 s** instead of SSE/WebSockets: simpler, works through any
  proxy, and fast enough next to the minute-based watchdog.
- **Guardian alert screen** comes from `GET /me/alerts/:id` (RLS as the guardian, then the
  driver's phone) with `tel:` links to the driver and the country's emergency number.
- **Drivers search enrolled children** to add an unexpected child (`GET /trips/:id/candidates`).
- **Photo "crop"** relies on the server's attention-based square crop; the form shows a preview.
- **Translations are guarded by a test**: both languages must have identical keys, every key
  used in code must exist, and every error code the API can return must have a message.
- **E2E runs on an isolated stack**: throwaway PostgreSQL with seed, real API process with
  `PUSH_PROVIDER=log` (refused in production), a production web build, and a stubbed browser
  push service (headless Chromium has none). A real-device push test belongs to phase 6.
- **The E2E suite fills login forms with local seed fixtures itself**; I (the assistant) did not
  type credentials into a browser by hand.
- **Stale alarms are dropped**: a delivery for an alert that was resolved before the push went out
  is not sent (`alert_resolved_before_send`), so a guardian never ends up with "🚨 urgent" as the
  latest message after "confirmed safe". Found through a flaky test; now covered by a test.

## Phase 5

- **Rate limits per IP** (`@nestjs/throttler`): 600/min by default (a school's drivers may share
  one address), 10/min for login and code checks, 5/min for anything that sends email, 20/min
  for driver lookup by phone. They add to the per-account lockout and per-address code limits.
  Off in tests unless a test enables them; photos and health checks are exempt.
- **Security headers**: helmet on the API (CSP left to Caddy, since Swagger needs inline
  scripts and photos are loaded cross-origin in development); Caddy sets HSTS, a strict CSP,
  no framing and a narrow Permissions-Policy in production.
- **Audit log via `@Audit()`** on controller methods, written after success through
  `SideEffects` (never blocks or fails the action). Covers enrollment decisions, viewing the
  student list with photos, fleet/route/member changes, trip start/end (with force reason),
  alert acknowledge/resolve, organisation lifecycle, account deletion, TOTP changes, child data
  export/deletion. Admins read their organisation's log under RLS.
- **Retention** is the only way rows leave append-only tables: the daily job runs as
  `wusool_system` with the transaction-local flag `app.retention_purge = on` (migration 3).
  Updates and TRUNCATE stay forbidden; other roles (including the superuser) cannot delete.
  Open or acknowledged alerts are never purged, nor any trip that still has an alert.
  Organisations can extend retention but never below one year for safety records.
- **Guardians' data rights**: export (everything visible to them under RLS, photo included) and
  deletion (password-confirmed). Deletion anonymises the child and deletes the photo; if
  another guardian exists only the caller's link is removed. Account deletion reuses the same
  function.
- **TOTP (RFC 6238) is optional for any account**, recommended for admins; secrets are encrypted
  with AES-256-GCM (`FIELD_ENCRYPTION_KEY`). The code is asked only after a correct password;
  a wrong code counts towards the lockout. No QR library: the `otpauth://` link opens the
  authenticator directly on a phone, and the key is shown for manual entry.
- **Sentry is opt-in** (`SENTRY_DSN`); request data and users are stripped before sending.
- **Backups**: `pg_dump -Fc` streamed through AES-256-GCM (`BACKUP_KEY`), rotated (14 kept),
  decrypted fully and tag-checked before `pg_restore`, so a tampered file never half-restores.
  The embedded PostgreSQL has no `pg_dump`, so the round-trip test runs on CI and in the image.
- **Operations CLI** (`dist/ops/cli.js roles | backup [--daily] | restore`) is compiled into the
  API image; the entrypoint runs migrations and roles on every start (both idempotent).
- **Production = one VPS with Docker Compose**: PostgreSQL 16, API, Caddy (serves the SPA,
  proxies `/v1` on the same origin, automatic HTTPS), and a backup service. Built and
  smoke-tested in CI because this development machine has no Docker.
- **Load test found and fixed a trip-generation race** (see docs/LOAD_TEST.md). Lazy generation
  is now shared per process, serialised by an advisory lock, and cached for 60 s — the cache is
  cleared whenever routes change so a new route shows up immediately.
- **Guardian notifications follow taps, not only the final state**: a late offline batch sends
  both "boarded 6:45" and "got off 7:05", in device-time order (found by the field simulation).
- **Coverage gate** for `trips`, `alerts` and `notifications`: ≥ 90 % lines/statements/functions,
  ≥ 80 % branches (currently 95 / 95 / 93 / 85), enforced on every API test run.
- **TOTP replay within the same 30-second window is not blocked** (no per-user "last step"
  record); acceptable for an optional second factor, noted for later.

## Phase 6 (partial, PLAN §20)

- **Native push without SDKs on the server:** FCM HTTP v1 (service-account JWT, RS256) and APNs
  (provider token, ES256, HTTP/2) are implemented with `node:crypto` and `node:http2` only. Both
  sit behind the same `PushProvider` interface; a routing provider picks one per subscription.
  An HTTP seam lets tests check exactly what would be sent, with real signatures.
- **Native push is optional per platform.** Without keys the server refuses to register those
  devices (`push_provider_unavailable`) rather than accepting a device it cannot reach — a driver
  must never pass the notification test on a channel that does not work.
- **Android channels:** critical alerts use a max-importance channel, everything else a
  high-importance one; lock-screen visibility is private (children's names hidden).
- **iOS alerts are time-sensitive, not critical,** until Apple grants the Critical Alerts
  entitlement (docs/RELEASE.md).
- **Driver reminders on native** are a series of 12 one-shot OS notifications (one hour at the
  usual 5-minute interval) instead of a platform-specific repeat rule, so they behave the same on
  Android and iOS and are fully cancelled together. The server watchdog remains the main
  protection after that.
- **No `USE_EXACT_ALARM`:** Google Play reserves it for alarm and calendar apps. The app asks for
  the user-granted `SCHEDULE_EXACT_ALARM`; without it reminders may be a few minutes late.
- **Reused web implementations inside the app:** the offline queue (IndexedDB, persisted in the
  app's storage), preferences (must stay synchronous) and the in-app siren (Web Audio).
- **No cloud backup on Android** (`allowBackup=false`, extraction rules): children's data never
  leaves the phone that way, and Keystore-encrypted secrets could not be restored anyway.
- **Notification taps only open this app's own paths** (`/alert/…`), never another site.
- **The Android build runs in CI**, not locally: installing the Android SDK here would require
  accepting Google's licence on the owner's behalf. GitHub's runner already has it.

## Sign-up by account type (after phase 6)

- **The first sign-up screen asks who the person is:** guardian, independent driver, school or
  transport company, or a driver employed by one (owner's request). The choice is stored on the
  user (`signup_role`, migration 4) and decides where they land.
- **The organisation is created when the email is verified,** not at sign-up, so unverified
  addresses never reach the platform's review queue. Independent drivers are named after the
  person and are active at once; schools and companies wait for review as before.
- **Phone clash after sign-up does not block verification:** the account is verified and the
  app sends the person to "register an organisation" to resolve it.
- **Employed drivers get a plain account** and a waiting screen showing the email their
  employer must add; organisations still add their own drivers, so nobody can make themselves a
  school's driver.
- **The guardian interface appears only for guardians** (or anyone who has added a child), so a
  school admin does not land on an empty "my children" screen.

## Name and pilot banner (owner's request, 2026-09-23)

- **The product is now طمّني — Tammeni** ("reassure me"), chosen by the owner. The app id is
  `com.tammeni.app` (changed before any store upload, when it still could be). Internal code
  names stay `wusool` (packages, database roles, storage keys) to avoid a risky data migration;
  users never see them.
- **The "pilot version — do not rely on it alone" banner (PLAN §20.4) was removed** at the
  owner's request. The underlying limits are unchanged and documented in docs/STATUS.md and
  docs/RELEASE.md: on the web, reminders need the page open and iPhones need the site installed;
  the server watchdog remains the main protection. Real-phone checks are still required before a
  school relies on the app.

## Test hosting (owner's request, 2026-09-22)

- **Testing runs on one small DigitalOcean droplet** (2 GB RAM + 2 GB swap) with the existing
  `infra/docker-compose.prod.yml`: the cheapest setup that behaves like production (no free host
  that sleeps, because a sleeping server stops the watchdog). The plan is to move to AWS if the
  pilot succeeds; data residency (PLAN §14) is decided then, so only testers who know it is a
  trial use it.
- **No domain yet: the address is `46-101-190-48.sslip.io`**, a free name that resolves to the
  server's IP and gets a normal Let's Encrypt certificate. Native test builds have this API
  address built in, so moving to a real domain means new test builds.
- **Email goes through Brevo on port 2525** because DigitalOcean blocks the usual SMTP ports
  (docs/DEPLOY.md). The sender is a Gmail address for now; a domain of our own (with SPF, DKIM
  and DMARC) replaces it before schools use the app.
- **`@capacitor/preferences` is not a dependency:** native preferences stay in the web view's
  `localStorage` (`src/platform/native/index.ts`). `cap sync` had removed its stale entries from
  the Android Gradle files; the regenerated files are committed.

## Automatic deploys (owner's request, 2026-09-23)

- **Every push to `main` that passes CI is deployed** by GitHub Actions (docs/DEPLOY.md §6).
  Images are built on GitHub, not on the small server, so a deploy only pulls and restarts.
- **A backup is taken before every deploy**, and an unhealthy API puts the previous version back
  automatically. Migrations are never undone automatically, because a `down.sql` may delete trip
  history.
- **Rollback is a manual "Run workflow" with a commit SHA,** reusing that commit's images.
- **This change was committed straight to `main`** at the owner's request, instead of a PR.

## Admin redesign from Claude Design (owner's request, 2026-09-23)

- **Source:** Claude Design project "Tammeni", screen `Tammeni Admin Mobile.dc.html`. Work is on
  the `new-design` branch; guardian, driver and onboarding screens follow separately.
- **Brand colours applied to the `bh` theme** (indigo and navy, red kept for alerts), because the
  admin screens depend on them. This recolours the whole app. The `sa` theme only gets the new
  token names.
- **Fonts and icons are bundled, not loaded from Google Fonts:** Readex Pro (Latin figures only)
  from `@fontsource`, Material Symbols as individual SVGs from `@material-symbols/svg-400`, so
  only the icons in use are shipped and everything works offline (PLAN §9.1).
- **Admin shell:** four bottom tabs on phones (trips, alerts, requests, more) and a grouped
  sidebar from 1024 px. The critical alert stays pinned under the title bar with its mute button.
- **Things the design showed that the API cannot do yet were left out:** undoing an enrollment
  decision, a student's route in the student list, and the guardian's name on link requests.
- **Alert closing is shared with the driver's alert page:** reasons are a tap list instead of a
  dropdown, and "other" still requires a note.

## Full redesign from Claude Design (owner's request, 2026-09-23)

- **Every screen follows the Claude Design project "Tammeni"**: onboarding, the guardian app
  (four tabs), the driver app, admin on phones and on the web, and the brand (logo, app icon,
  splash, indigo and navy colours).
- **Bahrain only:** the Saudi theme switch and the country fields are gone from the screens;
  phone fields show +973 and take 8 digits. The API keeps its multi-country support.
- **Backend additions the design needed:** guardians are notified when a link request is accepted
  or rejected; an admin can undo that decision for 10 minutes, but never once the child is on a
  route (so no trip loses a child silently), and the guardian is told the request is pending
  again. Link requests show the asking guardian's name and relationship; the student list shows
  each student's route and stop; the guardian alert screen shows when the driver was told,
  whether the organisation took the alert, and who closed it by role only (never staff names);
  `POST /me/password` changes the password and signs out other devices.
- **Driver end of trip:** "the bus is empty" is a press-and-hold (1.2 s; keyboard: hold Enter or
  Space) so a stray tap cannot confirm it. The 60-second undo toast is cleared when the red
  screen or the confirmation opens, because it covered their buttons; undo stays on each card.
- **Kept although the design leaves them out:** the organisation type when an organisation signs
  up (school or transport company), the two-step sign-in code, and removing members. Links to
  terms and privacy are plain text until those pages exist. The design's support address
  (help@tammeni.app) does not exist yet, so Help shows support.tammeni@gmail.com.
- **Not possible yet:** the organisation "area" line in the design's directory has no data behind
  it, so the directory shows the type only.

## Finding people, and naming organisations (owner's request, 2026-09-23)

- **Kindergartens are their own organisation type** (`kindergarten`), beside schools and transport
  companies: a nursery is not a school, and guardians look for it under its own name.
- **Every organisation has both names.** The English one must contain Latin letters, so "English
  name" cannot be the Arabic name typed again.
- **Names are unique per country and type** through `name_key_ar` / `name_key_en` (lower-cased,
  spaces collapsed). Independent drivers are excluded — guardians reach them by phone, and two
  drivers may genuinely share a name — so their key is the organisation's own id.
- **Every child and every account carries a short code** (`S1A2B3`, `D4C5D6`), generated by the
  database. It tells two children with the same name apart and lets a school add exactly the
  right driver. It is **not** a sign-in name: sign-in stays email + password (PLAN §2).
- **One search box for the driver:** name, child code, or the guardian's phone. A phone search
  compares the last 8 digits, so any way of typing it works, and brothers and sisters on one
  number come back together. Results show the code and the guardian's name so the driver can see
  they picked the right child.

## The school list (owner's request, 2026-09-23)

- **Every school, kindergarten and nursery in Bahrain ships with the app** (516 places) so a
  guardian picks the right one instead of typing it, and every family writes the same place the
  same way. Sources: the open data portal for public and private schools, and the ministry's
  educational-institutions finder for kindergartens and nurseries — both bilingual, read
  2026-09-23. `packages/shared/src/schools.ts` is generated; regenerate when the ministry
  publishes changes.
- **A name that is not in the list can still be typed.** New schools open, and a parent must
  never be blocked from adding their child because a list is out of date.
- **The list is data, not organisations.** These places have not signed up; creating accounts
  for them would leave guardians waiting for an approval nobody can give. The child's school is
  a name; the transport is a separate organisation the guardian links to.
- **Search ignores how Arabic is written**: hamza forms, ta marbuta, vowel marks and word order,
  so "روضة الإبداع", "ابداع" and "Creativity" all find the same place.
- **Branches with the same name carry their governorate** (and block, when two share one), and
  kindergarten names get the word "روضة"/"حضانة" that the ministry's list leaves out.

## Privacy policy and terms (owner's request, 2026-09-23)

- **Both documents live in the app** at `/privacy` and `/terms`, open without an account, in
  Arabic and English. The stores need a public address for the privacy policy, and Apple rejects
  an app whose policy link does not work.
- **They describe what the code actually does** — the data listed is the data the schema stores,
  the retention periods are the ones the retention job uses, and the rights named are the buttons
  that exist (export, delete child, delete account, withdraw consent). If behaviour changes, the
  text changes with it.
- **They are drafts, not legal advice.** A lawyer must read them before a real school uses
  Tammeni: children's data, Bahrain's Personal Data Protection Law 30/2018, and the fact that the
  server is currently in Germany (transfer outside the country).
- **The owner's legal name is a placeholder** in `legal-content.ts` until they confirm the exact
  name that will appear in the stores.
