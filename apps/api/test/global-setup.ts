// Once per test run: start a throwaway PostgreSQL 16, apply every migration to a template
// database and enable the login roles. Each test file then clones the template (fast).
import { execSync } from 'node:child_process';
import path from 'node:path';
import { startTestPostgres } from '@wusool/dev-stack';
import type { TestProject } from 'vitest/node';
import { provisionLoginRoles } from '../src/database/roles';

export const TEMPLATE_DB = 'wusool_template';
export const TEST_ROLE_PASSWORDS = { app: 'app-test-password', system: 'system-test-password' };

declare module 'vitest' {
  export interface ProvidedContext {
    pgTemplateUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const pg = await startTestPostgres({ database: TEMPLATE_DB });
  const apiRoot = path.resolve(__dirname, '..');
  const prismaBin = path.join(apiRoot, 'node_modules', '.bin', 'prisma');
  // One command string: Windows needs a shell for .cmd shims, and Node warns about shell + args.
  execSync(`"${prismaBin}" migrate deploy`, {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: pg.url, DATABASE_ADMIN_URL: pg.url },
    stdio: 'pipe',
  });
  await provisionLoginRoles(pg.url, TEST_ROLE_PASSWORDS);
  project.provide('pgTemplateUrl', pg.url);
  return () => pg.stop();
}
