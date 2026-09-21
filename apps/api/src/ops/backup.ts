import { spawn, spawnSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

// Encrypted database backups (PLAN §14: "نسخ احتياطية مشفّرة"). A `pg_dump -Fc` stream is
// encrypted with AES-256-GCM on the fly: file = "WSB1" | IV (12) | ciphertext | auth tag (16).
// The key (BACKUP_KEY, 32 random bytes in base64) never goes into the backup location.

const MAGIC = Buffer.from('WSB1');
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function pgToolAvailable(tool = 'pg_dump'): boolean {
  return spawnSync(tool, ['--version'], { stdio: 'ignore', shell: false }).status === 0;
}

function keyFrom(base64: string): Buffer {
  const key = Buffer.from(base64, 'base64');
  if (key.length !== 32) throw new Error('BACKUP_KEY must be 32 random bytes in base64');
  return key;
}

function waitForExit(child: ReturnType<typeof spawn>, name: string): Promise<void> {
  let stderr = '';
  child.stderr?.on('data', (d) => (stderr += String(d)));
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${name} exited with ${code}: ${stderr.trim()}`)),
    );
  });
}

/** Dumps the database to `<dir>/wusool-<timestamp>.dump.enc` and returns the path. */
export async function createBackup(opts: {
  databaseUrl: string;
  keyBase64: string;
  dir: string;
  now?: Date;
}) {
  await fs.mkdir(opts.dir, { recursive: true });
  const stamp = (opts.now ?? new Date()).toISOString().replace(/[:.]/g, '-');
  const file = path.join(opts.dir, `wusool-${stamp}.dump.enc`);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(opts.keyBase64), iv);
  const out = createWriteStream(file, { mode: 0o600 });
  out.write(Buffer.concat([MAGIC, iv]));

  const dump = spawn('pg_dump', ['--format=custom', '--no-owner', '--dbname', opts.databaseUrl], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = waitForExit(dump, 'pg_dump');
  await pipeline(dump.stdout!, cipher, out, { end: false });
  await exited;
  await new Promise<void>((resolve, reject) =>
    out.end(cipher.getAuthTag(), (e?: Error | null) => (e ? reject(e) : resolve())),
  );
  return file;
}

/**
 * Restores an encrypted backup into `databaseUrl`. The authentication tag is checked before any
 * byte reaches pg_restore's final commit: a tampered or wrong-key file fails the whole restore.
 */
export async function restoreBackup(opts: {
  file: string;
  databaseUrl: string;
  keyBase64: string;
}) {
  const { size } = await fs.stat(opts.file);
  const handle = await fs.open(opts.file, 'r');
  const header = Buffer.alloc(MAGIC.length + IV_BYTES);
  const tag = Buffer.alloc(TAG_BYTES);
  await handle.read(header, 0, header.length, 0);
  await handle.read(tag, 0, TAG_BYTES, size - TAG_BYTES);
  await handle.close();
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('not a Wusool backup file');

  // Decrypt fully to a temporary file first, so a bad tag never leaves a half-restored database.
  const tmp = `${opts.file}.restore-${process.pid}.dump`;
  const decipher = createDecipheriv(
    'aes-256-gcm',
    keyFrom(opts.keyBase64),
    header.subarray(MAGIC.length),
  );
  decipher.setAuthTag(tag);
  try {
    await pipeline(
      createReadStream(opts.file, { start: header.length, end: size - TAG_BYTES - 1 }),
      decipher,
      createWriteStream(tmp, { mode: 0o600 }),
    );
    const restore = spawn(
      'pg_restore',
      [
        '--clean',
        '--if-exists',
        '--no-owner',
        '--exit-on-error',
        '--dbname',
        opts.databaseUrl,
        tmp,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    await waitForExit(restore, 'pg_restore');
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

/** Keeps the newest `keep` backups in `dir` and deletes older ones. */
export async function pruneBackups(dir: string, keep: number): Promise<string[]> {
  const files = (await fs.readdir(dir)).filter((f) => /^wusool-.*\.dump\.enc$/.test(f)).sort();
  const old = files.slice(0, Math.max(0, files.length - keep));
  for (const f of old) await fs.rm(path.join(dir, f));
  return old;
}
