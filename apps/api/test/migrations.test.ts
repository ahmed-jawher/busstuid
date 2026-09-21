// PLAN §19: every migration is reversible. Applies each down.sql newest-first on a migrated
// database, checks the schema is gone, then re-applies everything with `prisma migrate deploy`.
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { createTestDatabase, type TestDatabase } from './helpers/database';

const apiRoot = path.resolve(__dirname, '..');
const migrationsDir = path.join(apiRoot, 'prisma', 'migrations');

describe('migrations', () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await createTestDatabase();
  });
  afterAll(() => db?.drop());

  const tableCount = async () => {
    const c = new Client({ connectionString: db.adminUrl });
    await c.connect();
    const { rows } = await c.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'",
    );
    await c.end();
    return rows[0].n as number;
  };

  it('every migration has a down.sql', () => {
    const folders = readdirSync(migrationsDir, { withFileTypes: true }).filter((d) =>
      d.isDirectory(),
    );
    expect(folders.length).toBeGreaterThan(0);
    for (const f of folders) {
      expect(() => readFileSync(path.join(migrationsDir, f.name, 'down.sql'))).not.toThrow();
    }
  });

  it('schema.prisma and the SQL migrations describe the same database (no drift)', async () => {
    // Prisma replays the migrations into an empty shadow database and diffs against the schema.
    const shadowName = `${db.name}_shadow`;
    const maintenanceUrl = new URL(db.adminUrl);
    maintenanceUrl.pathname = '/postgres';
    const m = new Client({ connectionString: maintenanceUrl.toString() });
    await m.connect();
    await m.query(`CREATE DATABASE "${shadowName}" TEMPLATE template0`);
    const shadowUrl = new URL(db.adminUrl);
    shadowUrl.pathname = `/${shadowName}`;
    try {
      // --exit-code: 0 = no difference, 2 = difference.
      execSync(
        `"${path.join(apiRoot, 'node_modules', '.bin', 'prisma')}" migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "${shadowUrl}" --exit-code`,
        {
          cwd: apiRoot,
          env: { ...process.env, DATABASE_URL: db.adminUrl, DATABASE_ADMIN_URL: db.adminUrl },
          stdio: 'pipe',
        },
      );
    } finally {
      await m.query(`DROP DATABASE IF EXISTS "${shadowName}" WITH (FORCE)`);
      await m.end();
    }
  });

  it('rolls back completely and re-applies cleanly', async () => {
    expect(await tableCount()).toBeGreaterThan(20);
    await db.admin.$disconnect();

    const folders = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
      .reverse();
    const c = new Client({ connectionString: db.adminUrl });
    await c.connect();
    for (const name of folders) {
      await c.query(readFileSync(path.join(migrationsDir, name, 'down.sql'), 'utf8'));
    }
    await c.end();
    expect(await tableCount()).toBe(0);

    execSync(`"${path.join(apiRoot, 'node_modules', '.bin', 'prisma')}" migrate deploy`, {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: db.adminUrl, DATABASE_ADMIN_URL: db.adminUrl },
      stdio: 'pipe',
    });
    expect(await tableCount()).toBeGreaterThan(20);
  });
});
