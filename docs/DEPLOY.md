# Deployment (one small VPS)

Everything runs with Docker Compose: PostgreSQL 16, the API, Caddy (serves the web app and gets
HTTPS certificates automatically), and a daily encrypted backup. Any Linux server with Docker
works; 2 vCPU / 4 GB RAM is plenty to start.

> ⚠️ Before real children are involved, read the safety limits in [STATUS.md](STATUS.md): the web
> version cannot sound the driver's alarm when the app is closed. That needs the native apps
> (phase 6).

## 1. What you need (decisions only the owner can make)

- A server (VPS) in a location allowed by the data-protection law you fall under (PLAN §14).
- A domain name pointing (A/AAAA record) to the server, e.g. `app.example.com`.
- An email provider account for verification codes (Brevo, Resend, Amazon SES…), with SPF,
  DKIM and DMARC configured for the domain so codes do not land in spam.

## 2. First install

```bash
git clone https://github.com/ahmed-jawher/busstuid.git && cd busstuid
node scripts/prod-env.mjs --domain app.example.com --mail-from "Tammeni <no-reply@example.com>"
# edit .env.production: fill SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD
docker compose -f infra/docker-compose.prod.yml --env-file .env.production up -d --build
```

(`scripts/prod-env.mjs` needs Node.js and `pnpm install` once, for the VAPID key generator.)

On start the API applies database migrations and database roles by itself. Check:

```bash
curl https://app.example.com/v1/health
```

Create the platform operator account: register in the app, verify the email, then

```bash
docker compose -f infra/docker-compose.prod.yml exec postgres \
  psql -U postgres -d wusool -c "UPDATE users SET is_platform_admin = true WHERE email = 'you@example.com'"
```

The operator approves schools and transport companies before guardians can see them.

## 3. Backups

- The `backup` service writes an encrypted dump every 24 h to the `backups` volume and keeps 14.
  Copy them out with `docker compose -f infra/docker-compose.prod.yml cp backup:/backups ./backups`.
- **Copy these files off the server** regularly (e.g. `rclone` to cloud storage). They are
  useless without `BACKUP_KEY` — keep `.env.production` safe and separate from the backups.
- Test a restore into a scratch database from time to time:

```bash
docker compose -f infra/docker-compose.prod.yml exec backup \
  node dist/ops/cli.js restore /backups/<file>.dump.enc --into postgres://postgres:…@postgres:5432/restore_test
```

## 4. Updates

```bash
git pull
docker compose -f infra/docker-compose.prod.yml --env-file .env.production up -d --build
```

Migrations run automatically on API start. To roll back the newest migration, run its
`down.sql` (see `apps/api/prisma/migrations/*/down.sql`) — take a backup first.

## 5. Security notes

- Caddy sets HSTS, a strict Content-Security-Policy, and no-framing headers; the API adds
  helmet headers and per-IP rate limits (strict on sign-in and code endpoints).
- The API trusts one proxy hop (`TRUST_PROXY_HOPS=1`) so rate limits and the audit log see real
  client IPs.
- Sentry is off unless `SENTRY_DSN` is set; no request bodies or user data are sent.
- Encrypt the server disk (PLAN §14) — most VPS providers offer it at creation time.

## 6. Automatic deploys (GitHub Actions)

`.github/workflows/deploy.yml` runs after **CI passes on `main`**: it builds the API and web
images, pushes them to GitHub Container Registry tagged with the commit
(`ghcr.io/<owner>/<repo>-api:<sha>`, `-web:<sha>`), then runs `infra/deploy.sh <sha>` on the
server over SSH:

1. pull the new images;
2. **encrypted backup** of the database (the version still running);
3. start the new version — the API applies migrations on start;
4. wait for the API to be healthy. If it is not, the **previous images are started again** and
   the workflow fails (red in GitHub, email to the owner).

**Rollback:** Actions → _Deploy_ → _Run workflow_ → enter the commit SHA to go back to. It reuses
that commit's images (no rebuild, no CI wait). Then revert the change on `main` so the next deploy
does not bring it back.

**Migrations are not undone** by either path: a `down.sql` can delete data (principle 2). Write
migrations so the previous version keeps working (add first, remove in a later release). If one
must be undone, a person runs `db:rollback` or restores the pre-deploy backup.

**Setup (once):**

- On the server, the `deploy` user runs Docker; the stack lives in `~/tammeni` with
  `.env.production` (never in GitHub). `.deploy.env` records the running commit (`IMAGE_TAG`).
- A dedicated SSH key for GitHub, added to `deploy`'s `authorized_keys` with
  `no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty`.
- Repository **secrets** `DEPLOY_SSH_KEY` (that private key) and `DEPLOY_KNOWN_HOSTS`
  (`ssh-keyscan -t ed25519 <server-ip>`); **variables** `DEPLOY_HOST` (server IP) and
  `DEPLOY_URL` (`https://…`, used for the health check).
- The registry login on the server uses the job's own short-lived token and is removed after
  each deploy.

Manual commands on the server must include the image override:

```bash
docker compose -f infra/docker-compose.prod.yml -f infra/docker-compose.images.yml \
  --env-file .env.production --env-file .deploy.env ps
```
