import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, resetDbForTests, STORES } from './idb';
import { createWebOfflineQueue } from './offline-queue';
import { createWebSecureStorage } from './secure-storage';

beforeEach(async () => {
  const db = await getDb();
  db.close();
  resetDbForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('wusool');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
});

describe('web offline queue', () => {
  it('keeps items in insertion order and survives re-enqueue of the same id', async () => {
    const q = createWebOfflineQueue<{ type: string }>('trip-events');
    await q.enqueue('a', { type: 'board' });
    await q.enqueue('b', { type: 'alight' });
    await q.enqueue('a', { type: 'board-duplicate' });
    const items = await q.list();
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(items[0]?.payload.type).toBe('board');
    expect(await q.count()).toBe(2);
  });

  it('isolates queues by name and removes acknowledged items', async () => {
    const events = createWebOfflineQueue<number>('events');
    const other = createWebOfflineQueue<number>('other');
    await events.enqueue('1', 1);
    await events.enqueue('2', 2);
    await other.enqueue('x', 9);
    await events.remove(['1']);
    expect((await events.list()).map((i) => i.id)).toEqual(['2']);
    expect(await other.count()).toBe(1);
  });
});

describe('web secure storage', () => {
  it('round-trips values and never stores them in plain text', async () => {
    const storage = createWebSecureStorage();
    await storage.set('refresh_token', 'super-secret-token');
    expect(await storage.get('refresh_token')).toBe('super-secret-token');

    const raw = await (await getDb()).get(STORES.secure, 'refresh_token');
    const bytes = new Uint8Array(raw.data as ArrayBuffer);
    expect(new TextDecoder().decode(bytes)).not.toContain('super-secret-token');

    await storage.remove('refresh_token');
    expect(await storage.get('refresh_token')).toBeNull();
  });
});
