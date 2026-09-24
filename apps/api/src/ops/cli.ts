// Operations CLI, compiled into the API image: `node dist/ops/cli.js <command>`.
// In development: `pnpm --filter @wusool/api db:roles | db:backup | db:restore`.
//
//   roles              give wusool_app / wusool_system LOGIN + passwords (after migrations)
//   backup             encrypted dump into BACKUP_DIR, keep BACKUP_KEEP newest
//   backup --daily     same, then repeat every 24 h (the production backup service)
//   restore <file> [--into <url>] [--yes]
//   demo               demo accounts and trips for showing the system (docs/DEMO.md)
import { provisionLoginRoles } from '../database/roles';
import { createBackup, pruneBackups, restoreBackup } from './backup';
import { runDemo } from './demo';

const DAY_MS = 24 * 3_600_000;

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

async function backupOnce(): Promise<void> {
  const dir = process.env.BACKUP_DIR ?? './backups';
  const file = await createBackup({
    databaseUrl: required('DATABASE_ADMIN_URL'),
    keyBase64: required('BACKUP_KEY'),
    dir,
  });
  const removed = await pruneBackups(dir, Number(process.env.BACKUP_KEEP ?? 14));
  console.log(`✓ ${file}${removed.length ? ` (removed ${removed.length} old)` : ''}`);
}

async function main(argv: string[]): Promise<void> {
  const [command, ...args] = argv;
  switch (command) {
    case 'roles':
      await provisionLoginRoles(required('DATABASE_ADMIN_URL'), {
        app: required('APP_DB_PASSWORD'),
        system: required('SYSTEM_DB_PASSWORD'),
      });
      console.log('✓ database login roles ready (wusool_app, wusool_system)');
      return;
    case 'demo':
      await runDemo(required('DATABASE_ADMIN_URL'));
      return;
    case 'backup':
      await backupOnce();
      if (args.includes('--daily')) {
        for (;;) {
          await new Promise((r) => setTimeout(r, DAY_MS));
          await backupOnce().catch((e: unknown) => console.error('backup failed', e));
        }
      }
      return;
    case 'restore': {
      const file = args.find((a) => !a.startsWith('--'));
      const intoIdx = args.indexOf('--into');
      const target = intoIdx >= 0 ? args[intoIdx + 1] : process.env.DATABASE_ADMIN_URL;
      if (!file || !target)
        throw new Error('usage: restore <file> [--into <database-url>] [--yes]');
      if (intoIdx < 0 && !args.includes('--yes')) {
        throw new Error('This replaces the live database. Re-run with --yes, or use --into <url>.');
      }
      await restoreBackup({ file, databaseUrl: target, keyBase64: required('BACKUP_KEY') });
      console.log('✓ restored');
      return;
    }
    default:
      throw new Error('commands: roles | backup [--daily] | restore <file> [--into <url>] [--yes]');
  }
}

main(process.argv.slice(2)).catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
