// Starts an isolated stack for the end-to-end tests (PLAN §16): throwaway PostgreSQL 16 with
// migrations + seed, the mail catcher, the real API process, and a production build of the web
// app served by `vite preview`. Nothing touches the development database.
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFreePort, startMailCatcher, startTestPostgres } from '@wusool/dev-stack';
import pg from 'pg';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const apiDir = path.join(root, 'apps/api');
const webDir = path.join(root, 'apps/web');
export const STATE_FILE = path.join(here, '.state.json');

function roleUrl(adminUrl: string, role: string, password: string) {
  const u = new URL(adminUrl);
  u.username = role;
  u.password = password;
  return u.toString();
}

async function waitFor(url: string, proc: ChildProcess, name: string) {
  for (let i = 0; i < 120; i++) {
    if (proc.exitCode !== null) throw new Error(`${name} exited with ${proc.exitCode}`);
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${name} did not start: ${url}`);
}

export default async function globalSetup() {
  // Builds the API (and generates the Prisma client the seed needs on a fresh machine).
  execSync('pnpm run build', { cwd: apiDir, stdio: 'pipe' });
  const pgServer = await startTestPostgres({ database: 'wusool_e2e' });
  const env = { ...process.env, DATABASE_URL: pgServer.url, DATABASE_ADMIN_URL: pgServer.url };
  execSync(`"${path.join(apiDir, 'node_modules/.bin/prisma')}" migrate deploy`, {
    cwd: apiDir,
    env,
    stdio: 'pipe',
  });

  const passwords = { app: 'e2e-app-password', system: 'e2e-system-password' };
  const admin = new pg.Client({ connectionString: pgServer.url });
  await admin.connect();
  await admin.query(`ALTER ROLE wusool_app LOGIN PASSWORD '${passwords.app}'`);
  await admin.query(`ALTER ROLE wusool_system LOGIN PASSWORD '${passwords.system}'`);
  await admin.query('GRANT CREATE ON DATABASE wusool_e2e TO wusool_system');
  execSync(`"${path.join(apiDir, 'node_modules/.bin/tsx')}" prisma/seed.ts`, {
    cwd: apiDir,
    env,
    stdio: 'pipe',
  });
  // Make the seeded routes run every day, all day, so the suite works on any date and time.
  await admin.query(
    `UPDATE routes SET days_of_week = '{1,2,3,4,5,6,7}',
       planned_start = CASE direction WHEN 'to_school' THEN '00:01' ELSE '00:02' END,
       planned_end = '23:58'`,
  );
  await admin.end();

  const mail = await startMailCatcher({
    smtpPort: await getFreePort(),
    httpPort: await getFreePort(),
  });
  const apiPort = await getFreePort();
  const webPort = await getFreePort();
  const apiUrl = `http://127.0.0.1:${apiPort}/v1`;
  const webUrl = `http://127.0.0.1:${webPort}`;

  // cwd outside the repo, so the API never picks up the development .env.
  const api = spawn(process.execPath, [path.join(apiDir, 'dist/main.js')], {
    cwd: tmpdir(),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      API_PORT: String(apiPort),
      DATABASE_URL: roleUrl(pgServer.url, 'wusool_app', passwords.app),
      DATABASE_SYSTEM_URL: roleUrl(pgServer.url, 'wusool_system', passwords.system),
      PUBLIC_API_URL: apiUrl,
      WEB_ORIGINS: `${webUrl},http://localhost:${webPort}`,
      JWT_ACCESS_SECRET: 'e2e-access-secret-0123456789abcdef012345',
      JWT_REFRESH_SECRET: 'e2e-refresh-secret-0123456789abcdef01234',
      FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
      PHOTO_URL_SECRET: 'e2e-photo-secret-0123456789abcdef0123456',
      VAPID_PUBLIC_KEY:
        'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
      VAPID_PRIVATE_KEY: 'e2e-not-used-with-log-provider',
      PUSH_PROVIDER: 'log',
      JOBS_ENABLED: 'false',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(mail.smtpPort),
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  await waitFor(`${apiUrl}/health`, api, 'API');

  const outDir = path.join(webDir, 'dist-e2e');
  execSync(`pnpm exec vite build --outDir "${outDir}" --emptyOutDir`, {
    cwd: webDir,
    env: { ...process.env, VITE_API_URL: apiUrl },
    stdio: 'pipe',
  });
  const web = spawn(
    `pnpm exec vite preview --outDir "${outDir}" --port ${webPort} --strictPort --host 127.0.0.1`,
    { cwd: webDir, shell: true, stdio: 'ignore' },
  );
  await waitFor(webUrl, web, 'web');

  mkdirSync(path.join(here, 'fixtures'), { recursive: true });
  const photo = path.join(here, 'fixtures', 'child.jpg');
  writeFileSync(
    photo,
    await sharp({
      create: { width: 600, height: 600, channels: 3, background: { r: 210, g: 160, b: 120 } },
    })
      .jpeg()
      .toBuffer(),
  );

  writeFileSync(
    STATE_FILE,
    JSON.stringify({
      webUrl,
      apiUrl,
      mailUrl: `http://127.0.0.1:${mail.httpPort}`,
      dbUrl: pgServer.url,
      photo,
    }),
  );

  return async () => {
    api.kill();
    // `vite preview` runs under a shell; kill the whole tree on Windows.
    if (process.platform === 'win32' && web.pid) {
      try {
        execSync(`taskkill /pid ${web.pid} /T /F`, { stdio: 'ignore' });
      } catch {
        // already gone
      }
    } else {
      web.kill();
    }
    await mail.stop();
    await pgServer.stop();
  };
}
