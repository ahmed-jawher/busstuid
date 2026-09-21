#!/usr/bin/env node
// `pnpm dev`: local database + mail inbox in-process, then every workspace `dev` task via Turborepo.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStack } from '@wusool/dev-stack';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(path.join(root, '.env'))) {
  console.error('No .env found — run `pnpm run setup` first.');
  process.exit(1);
}

const stack = await startStack();
// Only simple flags such as --filter=@wusool/web are forwarded to turbo.
const extra = process.argv.slice(2).filter((a) => /^[\w=@./:-]+$/.test(a));
const child = spawn(`pnpm exec turbo run dev ${extra.join(' ')}`.trim(), {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});

let stopping = false;
const shutdown = async (code = 0) => {
  if (stopping) return;
  stopping = true;
  child.kill('SIGINT');
  await stack.stop();
  process.exit(code);
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
child.on('exit', (code) => shutdown(code ?? 0));
