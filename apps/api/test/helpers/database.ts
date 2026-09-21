import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import { inject } from 'vitest';
import { roleUrl } from '../../src/database/roles';
import { TEMPLATE_DB, TEST_ROLE_PASSWORDS } from '../global-setup';

export interface TestDatabase {
  name: string;
  adminUrl: string;
  appUrl: string;
  systemUrl: string;
  /** Superuser client for arranging and inspecting state (bypasses RLS and grants). */
  admin: PrismaClient;
  drop(): Promise<void>;
}

function withDatabase(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

/** A fresh, fully migrated database cloned from the template. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const templateUrl = inject('pgTemplateUrl');
  const name = `t_${randomBytes(6).toString('hex')}`;
  const maintenance = new Client({ connectionString: withDatabase(templateUrl, 'postgres') });
  await maintenance.connect();
  await maintenance.query(`CREATE DATABASE "${name}" TEMPLATE "${TEMPLATE_DB}"`);
  await maintenance.end();

  const adminUrl = withDatabase(templateUrl, name);
  const admin = new PrismaClient({ datasourceUrl: adminUrl });
  return {
    name,
    adminUrl,
    appUrl: roleUrl(adminUrl, 'wusool_app', TEST_ROLE_PASSWORDS.app),
    systemUrl: roleUrl(adminUrl, 'wusool_system', TEST_ROLE_PASSWORDS.system),
    admin,
    async drop() {
      await admin.$disconnect();
      const c = new Client({ connectionString: withDatabase(templateUrl, 'postgres') });
      await c.connect();
      await c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await c.end();
    },
  };
}
