#!/usr/bin/env node
// One-shot local setup (PLAN §9.2): .env with generated secrets, database, migrations, seed.
// Safe to run repeatedly — existing values are never overwritten.
// Run with `pnpm run setup` (plain `pnpm setup` is a built-in pnpm command).
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';
import { startDevPostgres } from '@wusool/dev-stack';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const step = (msg) => console.log(`\n▶ ${msg}`);

const [major] = process.versions.node.split('.').map(Number);
if (major < 22) {
  console.error(`Node.js 22 or newer is required (found ${process.versions.node}).`);
  process.exit(1);
}

step('Preparing .env');
if (!existsSync(envPath)) {
  copyFileSync(path.join(root, '.env.example'), envPath);
  console.log('  created .env from .env.example');
}

let text = readFileSync(envPath, 'utf8');
const get = (key) => text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim() ?? '';
const fill = (key, value) => {
  if (get(key)) return;
  const line = `${key}=${value}`;
  text = new RegExp(`^${key}=.*$`, 'm').test(text)
    ? text.replace(new RegExp(`^${key}=.*$`, 'm'), line)
    : `${text.trimEnd()}\n${line}\n`;
  console.log(`  generated ${key}`);
};
const secret = (bytes = 48) => randomBytes(bytes).toString('base64url');

fill('PG_PASSWORD', secret(24));
fill('JWT_ACCESS_SECRET', secret());
fill('JWT_REFRESH_SECRET', secret());
fill('FIELD_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
fill('PHOTO_URL_SECRET', secret());
if (!get('VAPID_PUBLIC_KEY') || !get('VAPID_PRIVATE_KEY')) {
  const keys = webpush.generateVAPIDKeys();
  text = text.replace(/^VAPID_PUBLIC_KEY=.*$/m, 'VAPID_PUBLIC_KEY=');
  text = text.replace(/^VAPID_PRIVATE_KEY=.*$/m, 'VAPID_PRIVATE_KEY=');
  fill('VAPID_PUBLIC_KEY', keys.publicKey);
  fill('VAPID_PRIVATE_KEY', keys.privateKey);
}

const pgPort = get('PG_PORT') || '54329';
const pgDb = get('PG_DATABASE') || 'wusool';
const pgPassword = get('PG_PASSWORD');
fill('DATABASE_ADMIN_URL', `postgres://postgres:${pgPassword}@127.0.0.1:${pgPort}/${pgDb}`);
fill('APP_DB_PASSWORD', secret(24));
fill('SYSTEM_DB_PASSWORD', secret(24));
// Phase 0 pointed DATABASE_URL at the superuser; the API must now use the RLS-bound role.
if (get('DATABASE_URL') === get('DATABASE_ADMIN_URL')) {
  text = text.replace(/^DATABASE_URL=.*$/m, 'DATABASE_URL=');
}
fill('DATABASE_URL', `postgres://wusool_app:${get('APP_DB_PASSWORD')}@127.0.0.1:${pgPort}/${pgDb}`);
fill(
  'DATABASE_SYSTEM_URL',
  `postgres://wusool_system:${get('SYSTEM_DB_PASSWORD')}@127.0.0.1:${pgPort}/${pgDb}`,
);
fill('PUBLIC_API_URL', 'http://localhost:3000/v1');
writeFileSync(envPath, text);
// Child processes (Prisma, seed) read the same values.
process.loadEnvFile(envPath);

step('Starting PostgreSQL 16 (embedded)');
const db = await startDevPostgres({
  dataDir: path.join(root, '.data', 'pg'),
  port: Number(pgPort),
  password: pgPassword,
  database: pgDb,
});
console.log(`  ready on port ${pgPort}${db.reused ? ' (already running)' : ''}`);

const pnpm = (args) => {
  // Args are fixed strings from this file; one command string avoids Node's DEP0190 warning.
  const res = spawnSync(`pnpm ${args.join(' ')}`, { cwd: root, stdio: 'inherit', shell: true });
  if (res.status !== 0) throw new Error(`pnpm ${args.join(' ')} failed`);
};

try {
  step('Building shared packages');
  pnpm(['exec', 'turbo', 'run', 'build', '--filter=./packages/*']);
  step('Applying database migrations');
  pnpm(['--filter', '@wusool/api', 'run', '--if-present', 'db:migrate']);
  step('Enabling database login roles');
  pnpm(['--filter', '@wusool/api', 'run', '--if-present', 'db:roles']);
  step('Loading seed data');
  pnpm(['--filter', '@wusool/api', 'run', '--if-present', 'db:seed']);
} finally {
  await db.stop();
}

console.log(`
✓ Setup complete.

  pnpm dev     → starts database, mail inbox, API and web app
  pnpm test    → runs all tests

  Web app:     http://localhost:5173
  API docs:    http://localhost:3000/docs
  Mail inbox:  http://localhost:8025
`);
