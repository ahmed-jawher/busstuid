import { argon2id, hash, verify } from 'argon2';

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

/**
 * Length only, six characters (docs/DECISIONS.md, 2026-09-26). Word lists and "do not use your
 * name" rules were turning parents away at the one screen they cannot skip, and they are not what
 * stops guessing here: ten wrong attempts lock the account for fifteen minutes, and the accounts
 * that matter can add a second factor.
 *
 * Returns an error code when the password is not acceptable, otherwise null.
 */
export function checkPasswordPolicy(password: string): string | null {
  if (password.length < 6) return 'password_too_short';
  if (password.length > 128) return 'password_too_long';
  return null;
}
