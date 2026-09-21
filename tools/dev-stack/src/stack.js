import path from 'node:path';
import { findRepoRoot, readEnvFile } from './env.js';
import { startMailCatcher } from './mail.js';
import { startDevPostgres } from './postgres.js';

/** Starts the whole local stack (PostgreSQL + mail catcher) from the repo's .env. */
export async function startStack({ quiet = false } = {}) {
  const root = findRepoRoot();
  const env = { ...readEnvFile(path.join(root, '.env')), ...process.env };
  if (!env.PG_PASSWORD) {
    throw new Error('PG_PASSWORD is missing — run `pnpm run setup` first.');
  }
  const pgPort = Number(env.PG_PORT ?? 54329);
  const pg = await startDevPostgres({
    dataDir: path.join(root, '.data', 'pg'),
    port: pgPort,
    password: env.PG_PASSWORD,
    database: env.PG_DATABASE ?? 'wusool',
  });

  let mail = null;
  try {
    mail = await startMailCatcher({
      smtpPort: Number(env.SMTP_PORT ?? 1025),
      httpPort: Number(env.MAIL_UI_PORT ?? 8025),
    });
  } catch (e) {
    if (e.code !== 'EADDRINUSE') throw e;
    if (!quiet) console.log('[dev-stack] mail catcher already running');
  }

  if (!quiet) {
    console.log(`[dev-stack] PostgreSQL ${pg.reused ? '(already running) ' : ''}on port ${pgPort}`);
    if (mail) console.log(`[dev-stack] Mail inbox: http://localhost:${mail.httpPort}`);
  }

  return {
    databaseUrl: pg.url,
    stop: async () => {
      await mail?.stop();
      await pg.stop();
    },
  };
}
