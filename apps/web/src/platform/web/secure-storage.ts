import type { SecureStoragePort } from '../types';
import { getDb, STORES } from './idb';

// Values are encrypted with a non-extractable AES-GCM key kept in IndexedDB, so the raw
// refresh token is never readable from storage dumps or by other tabs' scripts reading IDB
// directly. Native builds replace this with Keychain/Keystore (PLAN §9.1).

const KEY_ID = 'secure-storage-key';

interface Sealed {
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
}

async function getKey(): Promise<CryptoKey> {
  const db = await getDb();
  const existing = (await db.get(STORES.keys, KEY_ID)) as CryptoKey | undefined;
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  await db.put(STORES.keys, key, KEY_ID);
  return key;
}

export function createWebSecureStorage(): SecureStoragePort {
  return {
    async get(key) {
      const db = await getDb();
      const sealed = (await db.get(STORES.secure, key)) as Sealed | undefined;
      if (!sealed) return null;
      try {
        const plain = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: sealed.iv },
          await getKey(),
          sealed.data,
        );
        return new TextDecoder().decode(plain);
      } catch {
        // Key lost or data corrupted: treat as signed out rather than crashing.
        await db.delete(STORES.secure, key);
        return null;
      }
    },

    async set(key, value) {
      const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
      const data = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        await getKey(),
        new TextEncoder().encode(value),
      );
      const db = await getDb();
      await db.put(STORES.secure, { iv, data } satisfies Sealed, key);
    },

    async remove(key) {
      const db = await getDb();
      await db.delete(STORES.secure, key);
    },
  };
}
