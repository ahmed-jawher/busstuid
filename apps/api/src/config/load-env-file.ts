import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Loads the monorepo's .env in development. Real environment variables always win,
 * and production containers get their configuration from the environment only.
 */
export function loadEnvFile(start = process.cwd()): string | null {
  let dir = path.resolve(start);
  for (let depth = 0; depth < 4; depth++) {
    const candidate = path.join(dir, '.env');
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
