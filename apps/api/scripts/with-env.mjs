#!/usr/bin/env node
// Runs a command with the monorepo's root .env loaded (Prisma only looks next to the schema).
// Existing environment variables always win.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('usage: with-env <command> [...args]');
  process.exit(2);
}
const quoted = [cmd, ...args].map((a) => (/^[\w@./:=-]+$/.test(a) ? a : JSON.stringify(a)));
const res = spawnSync(quoted.join(' '), { stdio: 'inherit', shell: true, env: process.env });
process.exit(res.status ?? 1);
