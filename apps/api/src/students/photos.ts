import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import sharp, { type Sharp } from 'sharp';
import { ApiError, Errors } from '../common/api-error';

// PLAN §9: 400×400 WebP, ≤ 100 KB, stored in PostgreSQL.
const SIZE = 400;
const MAX_BYTES = 100 * 1024;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
// Signed links expire within minutes (PLAN §14).
export const PHOTO_URL_TTL_SECONDS = 5 * 60;

export interface ProcessedPhoto {
  content: Uint8Array<ArrayBuffer>;
  mimeType: 'image/webp';
  bytes: number;
  sha256: string;
}

/**
 * Normalises an uploaded face photo: honours EXIF rotation, crops to a square around the
 * centre, strips all metadata (including GPS), and re-encodes until it fits the size budget.
 */
export async function processStudentPhoto(input: Buffer): Promise<ProcessedPhoto> {
  let pipeline: Sharp;
  try {
    const meta = await sharp(input, { limitInputPixels: 50_000_000 }).metadata();
    if (!meta.width || !meta.height) throw new Error('no dimensions');
    if (meta.width < 120 || meta.height < 120) throw Errors.badRequest('photo_too_small');
    pipeline = sharp(input, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize(SIZE, SIZE, { fit: 'cover', position: 'attention' });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw Errors.badRequest('photo_invalid');
  }

  for (const quality of [82, 72, 62, 52, 42]) {
    const content = await pipeline.clone().webp({ quality, effort: 4 }).toBuffer();
    if (content.length <= MAX_BYTES) {
      return {
        // Plain Uint8Array copy: what Prisma expects for bytea.
        content: new Uint8Array(content),
        mimeType: 'image/webp',
        bytes: content.length,
        sha256: createHash('sha256').update(content).digest('hex'),
      };
    }
  }
  throw Errors.badRequest('photo_too_complex');
}

const signature = (secret: string, studentId: string, version: number, exp: number) =>
  createHmac('sha256', secret).update(`${studentId}.${version}.${exp}`).digest('base64url');

/**
 * `<img>` tags cannot send an Authorization header, so photos are served from short-lived
 * signed URLs, issued only after the caller's access was checked (PLAN §14, §20.3).
 */
export function signPhotoUrl(
  baseUrl: string,
  secret: string,
  studentId: string,
  version: number,
  now = Date.now(),
): string | null {
  if (version <= 0) return null;
  const exp = Math.floor(now / 1000) + PHOTO_URL_TTL_SECONDS;
  const sig = signature(secret, studentId, version, exp);
  return `${baseUrl}/students/${studentId}/photo?v=${version}&exp=${exp}&sig=${sig}`;
}

export function verifyPhotoSignature(
  secret: string,
  studentId: string,
  version: number,
  exp: number,
  sig: string,
  now = Date.now(),
): boolean {
  if (!Number.isInteger(exp) || exp < Math.floor(now / 1000)) return false;
  const expected = Buffer.from(signature(secret, studentId, version, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
