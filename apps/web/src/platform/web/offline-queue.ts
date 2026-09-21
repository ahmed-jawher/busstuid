import type { OfflineQueuePort, QueuedItem } from '../types';
import { getDb, STORES } from './idb';

interface Row<T> extends QueuedItem<T> {
  name: string;
}

// Strictly increasing so two items enqueued in the same millisecond keep their order.
let lastStamp = 0;
const nextStamp = () => (lastStamp = Math.max(Date.now(), lastStamp + 1));

export function createWebOfflineQueue<T>(name: string): OfflineQueuePort<T> {
  return {
    async enqueue(id, payload) {
      const db = await getDb();
      const existing = await db.get(STORES.queue, [name, id]);
      // Idempotent: re-enqueueing the same id keeps the original entry and order.
      if (existing) return;
      const row: Row<T> = { name, id, createdAt: nextStamp(), payload };
      await db.put(STORES.queue, row);
    },

    async list() {
      const db = await getDb();
      const range = IDBKeyRange.bound([name, -Infinity], [name, Infinity]);
      const rows = (await db.getAllFromIndex(STORES.queue, 'byName', range)) as Row<T>[];
      return rows.map(({ id, createdAt, payload }) => ({ id, createdAt, payload }));
    },

    async remove(ids) {
      const db = await getDb();
      const tx = db.transaction(STORES.queue, 'readwrite');
      await Promise.all([...ids.map((id) => tx.store.delete([name, id])), tx.done]);
    },

    async count() {
      const db = await getDb();
      const range = IDBKeyRange.bound([name, -Infinity], [name, Infinity]);
      return db.countFromIndex(STORES.queue, 'byName', range);
    },
  };
}
