import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';

// jsdom's crypto lacks SubtleCrypto; use Node's WebCrypto so secure storage can be tested.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
