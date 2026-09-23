// Finding the right child, and telling organisations apart: short codes, search by the
// guardian's phone (brothers and sisters share one), unique names, and kindergartens.
import { addChild, PASSWORD, registerVerified, uniqueEmail, uniquePhone } from './helpers/actors';
import { createTestApp, type TestApp } from './helpers/app';
import { buildFleet } from './helpers/fleet';

describe('student and driver codes, and search', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t?.close());

  it('gives every child and every account its own short code', async () => {
    const f = await buildFleet(t, 2);
    const children = await t.http.get('/v1/me/children').set(f.guardian.auth).expect(200);
    const codes = children.body.map((c: { publicCode: string }) => c.publicCode);
    expect(codes).toHaveLength(2);
    for (const code of codes) expect(code).toMatch(/^S[0-9A-F]{5}$/);
    expect(new Set(codes).size).toBe(2);

    const me = await t.http.get('/v1/me').set(f.driver.auth).expect(200);
    expect(me.body.publicCode).toMatch(/^D[0-9A-F]{5}$/);
  });

  it("finds brothers and sisters by their guardian's phone, and one child by its code", async () => {
    const f = await buildFleet(t, 1);
    const phone = uniquePhone();
    const parent = await registerVerified(t, { phone });
    const brother = await addChild(t, parent, f.org.id, 'سالم الأخ');
    const sister = await addChild(t, parent, f.org.id, 'سارة الأخت');
    for (const id of [brother.id, sister.id]) {
      await t.db.admin.orgStudent.create({
        data: { organizationId: f.org.id, studentId: id, status: 'active' },
      });
    }
    await t.http.post(`/v1/trips/${f.tripId}/start`).set(f.driver.auth).expect(200);
    const search = async (q: string) =>
      (
        await t.http
          .get(`/v1/trips/${f.tripId}/candidates?q=${encodeURIComponent(q)}`)
          .set(f.driver.auth)
          .expect(200)
      ).body as { id: string; publicCode: string; guardianNames: string[] }[];

    // The guardian's number, typed the way a driver would read it off a phone.
    const local = phone.replace('+973', '');
    for (const typed of [phone, local, `+973 ${local.slice(0, 4)} ${local.slice(4)}`]) {
      const found = await search(typed);
      expect(found.map((s) => s.id).sort()).toEqual([brother.id, sister.id].sort());
      expect(found[0]!.guardianNames.length).toBeGreaterThan(0);
    }

    // A code finds exactly one child.
    const code = (await search('سالم'))[0]!.publicCode;
    const byCode = await search(code.toLowerCase());
    expect(byCode).toHaveLength(1);
    expect(byCode[0]!.id).toBe(brother.id);

    // A number nobody uses finds nobody.
    expect(await search('35999999')).toEqual([]);
  });
});

describe('organisation names', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t?.close());

  const create = async (body: object) => {
    const admin = await registerVerified(t);
    return t.http.post('/v1/organizations').set(admin.auth).send(body);
  };
  const school = (nameAr: string, nameEn: string) => ({
    type: 'school',
    nameAr,
    nameEn,
    country: 'BH',
  });

  it('refuses a school name that already exists, in either language', async () => {
    await create(school('مدرسة الأمل', 'Al Amal School')).then((r) => expect(r.status).toBe(201));

    const sameAr = await create(school('مدرسة الأمل', 'Another Name'));
    expect(sameAr.status).toBe(409);
    expect(sameAr.body.error.code).toBe('organization_name_taken');

    const sameEn = await create(school('اسم آخر', 'al amal school'));
    expect(sameEn.status).toBe(409);

    // Extra spaces are not a new school either.
    const spaced = await create(school('مدرسة   الأمل ', ' Al Amal   School'));
    expect(spaced.status).toBe(409);

    // A transport company may carry the same name as a school.
    const company = await create({
      ...school('مدرسة الأمل', 'Al Amal School'),
      type: 'transport_company',
    });
    expect(company.status).toBe(201);
  });

  it('requires both names, with Latin letters in the English one', async () => {
    expect(
      (await create({ type: 'school', nameAr: 'مدرسة بلا إنجليزي', country: 'BH' })).status,
    ).toBe(400);
    const arabicEn = await create(school('مدرسة النخيل', 'مدرسة النخيل'));
    expect(arabicEn.status).toBe(400);
    expect(JSON.stringify(arabicEn.body)).toContain('name_en_latin');
  });

  it('lists kindergartens in the directory and lets guardians search it', async () => {
    const admin = await registerVerified(t);
    const kg = await t.http
      .post('/v1/organizations')
      .set(admin.auth)
      .send({
        type: 'kindergarten',
        nameAr: 'روضة البراعم',
        nameEn: 'Al Baraem Kindergarten',
        country: 'BH',
      })
      .expect(201);
    expect(kg.body.type).toBe('kindergarten');
    // Schools and companies wait for review; a kindergarten does too.
    await t.db.admin.organization.update({ where: { id: kg.body.id }, data: { status: 'active' } });

    const all = await t.http
      .get('/v1/organizations/directory?country=BH')
      .set(admin.auth)
      .expect(200);
    expect(all.body.some((o: { id: string }) => o.id === kg.body.id)).toBe(true);

    const onlyKg = await t.http
      .get('/v1/organizations/directory?country=BH&type=kindergarten')
      .set(admin.auth)
      .expect(200);
    expect(onlyKg.body.every((o: { type: string }) => o.type === 'kindergarten')).toBe(true);

    const searched = await t.http
      .get('/v1/organizations/directory?country=BH&q=baraem')
      .set(admin.auth)
      .expect(200);
    expect(searched.body.map((o: { id: string }) => o.id)).toEqual([kg.body.id]);
  });

  it('an independent driver signing up needs their name in both languages', async () => {
    const missing = await t.http.post('/v1/auth/register').send({
      email: uniqueEmail('drv'),
      password: PASSWORD,
      fullNameAr: 'سائق بلا اسم إنجليزي',
      phone: uniquePhone(),
      country: 'BH',
      signupRole: 'independent_driver',
    });
    expect(missing.status).toBe(400);
    expect(JSON.stringify(missing.body)).toContain('name_en_required');
  });
});
