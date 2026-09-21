import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'wusool';
const DB_VERSION = 1;

export const STORES = {
  queue: 'queue',
  secure: 'secure',
  keys: 'keys',
} as const;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDb(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const queue = db.createObjectStore(STORES.queue, { keyPath: ['name', 'id'] });
      queue.createIndex('byName', ['name', 'createdAt']);
      db.createObjectStore(STORES.secure);
      db.createObjectStore(STORES.keys);
    },
  });
  return dbPromise;
}

/** Test helper: forget the cached connection. */
export function resetDbForTests(): void {
  dbPromise = null;
}
