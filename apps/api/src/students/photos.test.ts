import sharp from 'sharp';
import { processStudentPhoto, signPhotoUrl, verifyPhotoSignature } from './photos';

const SECRET = 's'.repeat(40);

async function noisyJpeg(width: number, height: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919) % 256;
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .withMetadata({ exif: { IFD0: { Artist: 'secret-location' } } })
    .toBuffer();
}

describe('processStudentPhoto', () => {
  it('produces a 400×400 WebP under 100 KB without metadata', async () => {
    const out = await processStudentPhoto(await noisyJpeg(1600, 1200));
    const meta = await sharp(out.content).metadata();
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([400, 400]);
    expect(out.bytes).toBeLessThanOrEqual(100 * 1024);
    expect(meta.exif).toBeUndefined();
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects files that are not images and images that are too small', async () => {
    await expect(processStudentPhoto(Buffer.from('not an image'))).rejects.toMatchObject({
      code: 'photo_invalid',
    });
    await expect(processStudentPhoto(await noisyJpeg(80, 80))).rejects.toMatchObject({
      code: 'photo_too_small',
    });
  });
});

describe('signed photo URLs', () => {
  it('verifies its own signature and rejects tampering or expiry', () => {
    const url = new URL(signPhotoUrl('http://api/v1', SECRET, 'stu-1', 3)!);
    const exp = Number(url.searchParams.get('exp'));
    const sig = url.searchParams.get('sig')!;
    expect(verifyPhotoSignature(SECRET, 'stu-1', 3, exp, sig)).toBe(true);
    expect(verifyPhotoSignature(SECRET, 'stu-2', 3, exp, sig)).toBe(false);
    expect(verifyPhotoSignature(SECRET, 'stu-1', 4, exp, sig)).toBe(false);
    expect(verifyPhotoSignature(SECRET, 'stu-1', 3, exp, sig, (exp + 1) * 1000)).toBe(false);
  });

  it('gives no URL when there is no photo', () => {
    expect(signPhotoUrl('http://api/v1', SECRET, 'stu-1', 0)).toBeNull();
  });
});
