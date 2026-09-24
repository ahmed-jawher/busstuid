// Agreeing to the terms is explicit, refused on the server when missing, and kept as evidence.
import { LEGAL_VERSION } from '@wusool/shared';
import { PrismaClient } from '@prisma/client';
import { PASSWORD, registerVerified, uniqueEmail, uniquePhone } from './helpers/actors';
import { createTestApp, type TestApp } from './helpers/app';

describe('agreeing to the terms', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t?.close());

  const signUpBody = (extra: object = {}) => ({
    email: uniqueEmail('legal'),
    password: PASSWORD,
    fullNameAr: 'ولي أمر',
    phone: uniquePhone(),
    country: 'BH',
    acceptTerms: true,
    ...extra,
  });

  it('refuses to create an account without the tick, whatever the app sends', async () => {
    for (const missing of [
      { acceptTerms: undefined },
      { acceptTerms: false },
      { acceptTerms: 'true' },
    ]) {
      const res = await t.http.post('/v1/auth/register').send(signUpBody(missing));
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('terms_not_accepted');
    }
    // Nothing was created for those attempts.
    expect(await t.db.admin.legalAcceptance.count()).toBe(0);
  });

  it('records the terms and the privacy policy with the version, time, address and device', async () => {
    const body = signUpBody();
    await t.http
      .post('/v1/auth/register')
      .set('User-Agent', 'TammeniTest/1.0')
      .send(body)
      .expect(202);

    const user = await t.db.admin.user.findUniqueOrThrow({ where: { email: body.email } });
    const rows = await t.db.admin.legalAcceptance.findMany({ where: { userId: user.id } });
    expect(rows.map((r) => r.document).sort()).toEqual(['privacy', 'terms']);
    for (const row of rows) {
      expect(row.version).toBe(LEGAL_VERSION);
      expect(row.acceptedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
      expect(row.userAgent).toBe('TammeniTest/1.0');
      expect(row.ip).not.toBeNull();
    }
    expect(user.termsVersion).toBe(LEGAL_VERSION);
    expect(user.termsAcceptedAt).not.toBeNull();
  });

  it('shows the agreement in the profile and asks again when the documents change', async () => {
    const person = await registerVerified(t);
    const before = await t.http.get('/v1/me').set(person.auth).expect(200);
    expect(before.body).toMatchObject({ termsVersion: LEGAL_VERSION, mustAcceptTerms: false });
    expect(before.body.termsAcceptedAt).toBeTruthy();

    // A new version of the documents: the account must agree again.
    await t.db.admin.user.update({
      where: { id: person.id },
      data: { termsVersion: '2020-01-01' },
    });
    const stale = await t.http.get('/v1/me').set(person.auth).expect(200);
    expect(stale.body.mustAcceptTerms).toBe(true);

    const status = await t.http.get('/v1/me/legal').set(person.auth).expect(200);
    expect(status.body.mustAccept).toBe(false); // the acceptance rows still carry this version
    expect(status.body.currentVersion).toBe(LEGAL_VERSION);

    await t.http
      .post('/v1/me/legal/accept')
      .set(person.auth)
      .send({ documents: ['terms', 'privacy'], version: LEGAL_VERSION })
      .expect(201);
    const after = await t.http.get('/v1/me').set(person.auth).expect(200);
    expect(after.body.mustAcceptTerms).toBe(false);
  });

  it('keeps a driver’s safety acknowledgement separately', async () => {
    const driver = await registerVerified(t);
    await t.http
      .post('/v1/me/legal/accept')
      .set(driver.auth)
      .send({ documents: ['driver_safety'], version: LEGAL_VERSION })
      .expect(201);
    const status = await t.http.get('/v1/me/legal').set(driver.auth).expect(200);
    expect(status.body.accepted.driver_safety.version).toBe(LEGAL_VERSION);
  });

  it('never lets an acceptance be changed or removed', async () => {
    const person = await registerVerified(t);
    const row = await t.db.admin.legalAcceptance.findFirstOrThrow({
      where: { userId: person.id, document: 'terms' },
    });
    const system = new PrismaClient({ datasourceUrl: t.db.systemUrl });
    try {
      await expect(
        system.legalAcceptance.update({ where: { id: row.id }, data: { version: 'forged' } }),
      ).rejects.toThrow(/append-only/);
      await expect(system.legalAcceptance.delete({ where: { id: row.id } })).rejects.toThrow(
        /append-only/,
      );
    } finally {
      await system.$disconnect();
    }
  });

  it('shows an account only its own acceptances', async () => {
    const mine = await registerVerified(t);
    const other = await registerVerified(t);
    const status = await t.http.get('/v1/me/legal').set(mine.auth).expect(200);
    const rows = await t.db.admin.legalAcceptance.findMany({ where: { userId: other.id } });
    expect(rows.length).toBeGreaterThan(0);
    expect(Object.keys(status.body.accepted).sort()).toEqual(['privacy', 'terms']);
  });
});
