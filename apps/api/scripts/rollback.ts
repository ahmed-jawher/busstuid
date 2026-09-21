// `pnpm db:rollback` — reverts the most recent applied migration using its down.sql (PLAN §19).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

async function main(): Promise<void> {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (!adminUrl) throw new Error('DATABASE_ADMIN_URL is required');
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{ migration_name: string }>(
      `SELECT migration_name FROM _prisma_migrations
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
        ORDER BY finished_at DESC LIMIT 1`,
    );
    const name = rows[0]?.migration_name;
    if (!name) {
      console.log('Nothing to roll back.');
      return;
    }
    const downFile = path.resolve(__dirname, '../prisma/migrations', name, 'down.sql');
    if (!existsSync(downFile)) throw new Error(`${name} has no down.sql`);
    await client.query('BEGIN');
    await client.query(readFileSync(downFile, 'utf8'));
    // The init migration drops the whole schema, including _prisma_migrations itself.
    const table = await client.query(`SELECT to_regclass('_prisma_migrations') AS t`);
    if (table.rows[0].t) {
      await client.query('DELETE FROM _prisma_migrations WHERE migration_name = $1', [name]);
    }
    await client.query('COMMIT');
    console.log(`✓ rolled back ${name}`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
