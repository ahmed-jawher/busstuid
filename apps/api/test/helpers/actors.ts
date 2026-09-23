import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import type { TestApp } from './app';

export const PASSWORD = 'Blue-Falcon-Harbour-42';

export interface Actor {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  auth: { Authorization: string };
}

let counter = 0;
export const uniqueEmail = (prefix: string) =>
  `${prefix}.${Date.now().toString(36)}${(counter++).toString(36)}@example.com`;

/** Unique valid Bahraini mobile numbers (fictional 3xxx xxxx range). */
export const uniquePhone = () =>
  `+9733${String(Math.floor(1_000_000 + Math.random() * 8_999_999))}`;

/** Registers, reads the code from the captured email, verifies, and returns tokens. */
export async function registerVerified(
  t: TestApp,
  opts: { prefix?: string; phone?: string; fullNameAr?: string } = {},
): Promise<Actor> {
  const email = uniqueEmail(opts.prefix ?? 'user');
  await t.http
    .post('/v1/auth/register')
    .send({
      email,
      password: PASSWORD,
      fullNameAr: opts.fullNameAr ?? 'مستخدم تجريبي',
      phone: opts.phone ?? uniquePhone(),
      country: 'BH',
    })
    .expect(202);
  const res = await t.http
    .post('/v1/auth/verify-email')
    .send({ email, code: t.mail.lastCode(email) })
    .expect(200);
  const user = await t.db.admin.user.findUniqueOrThrow({ where: { email } });
  return {
    id: user.id,
    email,
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    auth: { Authorization: `Bearer ${res.body.accessToken}` },
  };
}

/** Registers without verifying; logs in to get an (unverified) access token. */
export async function registerUnverified(t: TestApp): Promise<Actor> {
  const email = uniqueEmail('unverified');
  await t.http
    .post('/v1/auth/register')
    .send({
      email,
      password: PASSWORD,
      fullNameAr: 'غير مؤكد',
      phone: uniquePhone(),
      country: 'BH',
    })
    .expect(202);
  const res = await t.http.post('/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
  const user = await t.db.admin.user.findUniqueOrThrow({ where: { email } });
  return {
    id: user.id,
    email,
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    auth: { Authorization: `Bearer ${res.body.accessToken}` },
  };
}

/** Creates an organisation owned by `admin` and makes it active (as a platform admin would). */
export async function createActiveOrg(
  t: TestApp,
  admin: Actor,
  type: 'school' | 'transport_company' | 'independent_driver' = 'school',
): Promise<{ id: string; header: { 'X-Organization-Id': string } }> {
  const suffix = randomBytes(3).toString('hex');
  const res = await t.http
    .post('/v1/organizations')
    .set(admin.auth)
    .send({
      type,
      nameAr: `منظمة ${suffix}`,
      nameEn: `Org ${suffix}`,
      country: 'BH',
    })
    .expect(201);
  await t.db.admin.organization.update({ where: { id: res.body.id }, data: { status: 'active' } });
  return { id: res.body.id, header: { 'X-Organization-Id': res.body.id } };
}

let photoCache: Buffer | null = null;
export async function samplePhoto(): Promise<Buffer> {
  photoCache ??= await sharp({
    create: { width: 640, height: 640, channels: 3, background: { r: 200, g: 140, b: 90 } },
  })
    .jpeg()
    .toBuffer();
  return photoCache;
}

/** Guardian adds a child linked to `organizationId`; returns the child DTO. */
export async function addChild(
  t: TestApp,
  guardian: Actor,
  organizationId: string,
  name = 'سارة أحمد',
) {
  const res = await t.http
    .post('/v1/students')
    .set(guardian.auth)
    .field('fullNameAr', name)
    .field('dateOfBirth', '2017-03-14')
    .field('schoolName', 'مدرسة الاختبار')
    .field('organizationId', organizationId)
    .field('consent', 'true')
    .attach('photo', await samplePhoto(), { filename: 'face.jpg', contentType: 'image/jpeg' });
  if (res.status !== 201)
    throw new Error(`addChild failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; photoUrl: string; enrollmentRequests: { id: string }[] };
}
