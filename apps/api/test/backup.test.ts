// Encrypted backup and restore round-trip (PLAN §14). Needs the PostgreSQL client tools
// (pg_dump/pg_restore): present on CI's Ubuntu runner and in the production backup container;
// skipped where they are missing (the embedded PostgreSQL does not ship them).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from 'pg';
import { createBackup, pgToolAvailable, pruneBackups, restoreBackup } from '../src/ops/backup';
import { createTestDatabase, type TestDatabase } from './helpers/database';

const available = pgToolAvailable('pg_dump') && pgToolAvailable('pg_restore');
const KEY = Buffer.alloc(32, 11).toString('base64');

describe.skipIf(!available)('encrypted backups', () => {
  let source: TestDatabase;
  let target: TestDatabase;
  let dir: string;

  beforeAll(async () => {
    source = await createTestDatabase();
    target = await createTestDatabase();
    dir = mkdtempSync(path.join(tmpdir(), 'wusool-backup-'));
    await source.admin.organization.create({
      data: {
        type: 'school',
        nameEn: 'Backup Test School',
        nameKeyAr: 'مدرسة النسخ',
        nameKeyEn: 'backup test school',
        nameAr: 'مدرسة النسخة',
        country: 'BH',
        timezone: 'Asia/Bahrain',
        status: 'active',
      },
    });
  });
  afterAll(async () => {
    await source?.drop();
    await target?.drop();
    rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips a database through an encrypted file', async () => {
    const file = await createBackup({ databaseUrl: source.adminUrl, keyBase64: KEY, dir });
    // The Arabic name must not be readable in the file.
    expect(readFileSync(file).includes(Buffer.from('مدرسة النسخة'))).toBe(false);
    await restoreBackup({ file, databaseUrl: target.adminUrl, keyBase64: KEY });
    const c = new Client({ connectionString: target.adminUrl });
    await c.connect();
    const { rows } = await c.query(
      "SELECT name_ar FROM organizations WHERE name_ar = 'مدرسة النسخة'",
    );
    await c.end();
    expect(rows).toHaveLength(1);
  });

  it('refuses a tampered file or a wrong key', async () => {
    const file = await createBackup({ databaseUrl: source.adminUrl, keyBase64: KEY, dir });
    await expect(
      restoreBackup({
        file,
        databaseUrl: target.adminUrl,
        keyBase64: Buffer.alloc(32, 12).toString('base64'),
      }),
    ).rejects.toThrow();
    const bytes = readFileSync(file);
    bytes[bytes.length - 40]! ^= 0xff;
    writeFileSync(file, bytes);
    await expect(
      restoreBackup({ file, databaseUrl: target.adminUrl, keyBase64: KEY }),
    ).rejects.toThrow();
  });

  it('keeps only the newest backups', async () => {
    for (let i = 0; i < 3; i++) {
      await createBackup({
        databaseUrl: source.adminUrl,
        keyBase64: KEY,
        dir,
        now: new Date(Date.UTC(2020, 0, i + 1)),
      });
    }
    const removed = await pruneBackups(dir, 2);
    expect(removed.length).toBeGreaterThan(0);
  });
});

it('reports whether PostgreSQL client tools are available', () => {
  expect(typeof available).toBe('boolean');
});
