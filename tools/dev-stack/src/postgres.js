// Real PostgreSQL 16 without Docker or admin rights (PLAN §2.6, §20.2).
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { getFreePort, isPortInUse } from './net.js';

const INITDB_FLAGS = ['--encoding=UTF8', '--locale=C', '--auth=scram-sha-256'];

function quoteIdent(name) {
  return '"' + name.replaceAll('"', '""') + '"';
}

async function ensureDatabase(url, database) {
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      database,
    ]);
    if (!rowCount) await client.query(`CREATE DATABASE ${quoteIdent(database)}`);
  } finally {
    await client.end();
  }
}

/**
 * Starts (initialising on first run) the persistent development cluster.
 * If the port is already taken we assume the stack is running and reuse it.
 */
export async function startDevPostgres({
  dataDir,
  port = 54329,
  user = 'postgres',
  password,
  database = 'wusool',
  log = false,
}) {
  if (!password) throw new Error('startDevPostgres: password is required');
  const url = `postgres://${user}:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}`;

  if (await isPortInUse(port)) {
    await ensureDatabase(url, database);
    return { url, reused: true, stop: async () => {} };
  }

  mkdirSync(path.dirname(dataDir), { recursive: true });
  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user,
    password,
    persistent: true,
    initdbFlags: INITDB_FLAGS,
    onLog: log ? (m) => process.stdout.write(`[pg] ${m}`) : () => {},
    onError: (e) => process.stderr.write(`[pg] ${e}\n`),
  });
  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) await server.initialise();
  await server.start();
  await ensureDatabase(url, database);
  return { url, reused: false, stop: () => server.stop() };
}

/**
 * Throwaway cluster for tests: random port, temp directory, removed on stop.
 * Used by integration tests instead of Testcontainers (PLAN §16, §20).
 */
export async function startTestPostgres({ database = 'wusool_test' } = {}) {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'wusool-pg-'));
  const port = await getFreePort();
  const password = 'test-password';
  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: 'postgres',
    password,
    persistent: false,
    initdbFlags: INITDB_FLAGS,
    onLog: () => {},
    onError: () => {},
  });
  await server.initialise();
  await server.start();
  const url = `postgres://postgres:${password}@127.0.0.1:${port}/${database}`;
  await ensureDatabase(url, database);
  return {
    url,
    port,
    stop: async () => {
      await server.stop();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
