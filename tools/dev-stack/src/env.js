import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Walks up from `start` to the monorepo root (the folder containing pnpm-workspace.yaml). */
export function findRepoRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('Could not find the repository root');
    dir = parent;
  }
}

/** Minimal .env parser (KEY=value, # comments, optional quotes). */
export function readEnvFile(file) {
  if (!existsSync(file)) return {};
  const env = {};
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    let value = line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    env[line.slice(0, eq).trim()] = value;
  }
  return env;
}
