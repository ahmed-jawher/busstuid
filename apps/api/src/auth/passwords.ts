import { argon2id, hash, verify } from 'argon2';
import { COMMON_PASSWORDS } from './common-passwords';

// argon2id with OWASP-recommended parameters (PLAN §5.1).
const ARGON_OPTIONS = { type: argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

// A real hash so failed look-ups for unknown emails take as long as real checks.
let dummyHash: Promise<string> | null = null;

export const hashPassword = (password: string) => hash(password, ARGON_OPTIONS);

export async function verifyPassword(stored: string | null, password: string): Promise<boolean> {
  if (!stored || !stored.startsWith('$argon2')) {
    dummyHash ??= hash('timing-equaliser', ARGON_OPTIONS);
    await verify(await dummyHash, password).catch(() => false);
    return false;
  }
  return verify(stored, password).catch(() => false);
}

/** Returns an error code when the password is too weak, otherwise null. */
export function checkPasswordPolicy(
  password: string,
  personal: { email: string; names: (string | null | undefined)[] },
): string | null {
  if (password.length < 8) return 'password_too_short';
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return 'password_too_common';
  if (/^(.)\1+$/.test(password)) return 'password_too_common';
  const emailLocal = personal.email.split('@')[0]?.toLowerCase() ?? '';
  if (emailLocal.length >= 4 && lower.includes(emailLocal))
    return 'password_contains_personal_info';
  for (const name of personal.names) {
    for (const part of (name ?? '').toLowerCase().split(/\s+/)) {
      if (part.length >= 4 && lower.includes(part)) return 'password_contains_personal_info';
    }
  }
  return null;
}
