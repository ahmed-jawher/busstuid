import { createHmac, timingSafeEqual } from 'node:crypto';

// Minimal HS256 JWT: short-lived access tokens only (refresh tokens are opaque, PLAN §5.1).
// Written out rather than pulled from a library so the exact checks are visible.

export interface JwtClaims {
  sub: string;
  iat: number;
  exp: number;
  [key: string]: unknown;
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');
const HEADER = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

const sign = (data: string, secret: string) => createHmac('sha256', secret).update(data).digest();

export function signJwt(
  claims: Omit<JwtClaims, 'iat' | 'exp'>,
  secret: string,
  ttlSeconds: number,
  now = Date.now(),
): string {
  const iat = Math.floor(now / 1000);
  const payload = b64url(JSON.stringify({ ...claims, iat, exp: iat + ttlSeconds }));
  const body = `${HEADER}.${payload}`;
  return `${body}.${b64url(sign(body, secret))}`;
}

export function verifyJwt(token: string, secret: string, now = Date.now()): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];
  // Only our exact header is accepted — no "alg: none" or algorithm switching.
  if (header !== HEADER) return null;
  const expected = sign(`${header}.${payload}`, secret);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as JwtClaims;
    if (typeof claims.exp !== 'number' || claims.exp <= Math.floor(now / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}
