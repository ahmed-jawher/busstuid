// The first sign-up question — guardian, independent driver, school/company, or a driver
// employed by one — decides what the account becomes once the email is verified.
import { PASSWORD, uniqueEmail, uniquePhone } from './helpers/actors';
import { createTestApp, type TestApp } from './helpers/app';

describe('sign-up by account type', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t?.close());

  async function signUp(extra: object, phone = uniquePhone()) {
    const email = uniqueEmail('signup');
    const suffix = email.split('@')[0]!.replace(/W/g, '');
    await t.http
      .post('/v1/auth/register')
      .send({
        email,
        password: PASSWORD,
        fullNameAr: `أحمد السائق ${suffix}`,
        fullNameEn: `Ahmed Driver ${suffix}`,
        phone,
        country: 'BH',
        ...extra,
      })
      .expect(202);
    const res = await t.http
      .post('/v1/auth/verify-email')
      .send({ email, code: t.mail.lastCode(email) })
      .expect(200);
    const me = await t.http
      .get('/v1/me')
      .set({ Authorization: `Bearer ${res.body.accessToken}` })
      .expect(200);
    return me.body as {
      signupRole: string;
      isGuardian: boolean;
      memberships: {
        role: string;
        organization: { type: string; status: string; nameAr: string };
      }[];
    };
  }

  it('a guardian gets no organisation', async () => {
    const me = await signUp({});
    expect(me).toMatchObject({ signupRole: 'guardian', isGuardian: true, memberships: [] });
  });

  it('an independent driver owns an active organisation named after them and can drive', async () => {
    const me = await signUp({ signupRole: 'independent_driver' });
    expect(me.signupRole).toBe('independent_driver');
    expect(me.isGuardian).toBe(false);
    expect(me.memberships.map((m) => m.role).sort()).toEqual(['driver', 'org_admin']);
    expect(me.memberships[0]!.organization).toMatchObject({
      type: 'independent_driver',
      status: 'active',
      nameAr: expect.stringContaining('أحمد السائق'),
    });
    const audit = await t.db.admin.auditLog.findFirst({
      where: {
        action: 'organization.create',
        actorUserId: { not: null },
        diff: { equals: { via: 'signup' } },
      },
    });
    expect(audit).not.toBeNull();
  });

  it('a school waits for platform review; the name comes from the form', async () => {
    const me = await signUp({
      signupRole: 'organization',
      organization: { type: 'school', nameAr: 'مدرسة النور', nameEn: 'Al Noor School' },
    });
    expect(me.memberships).toEqual([
      expect.objectContaining({
        role: 'org_admin',
        organization: expect.objectContaining({
          type: 'school',
          status: 'pending_review',
          nameAr: 'مدرسة النور',
        }),
      }),
    ]);
  });

  it('an organisation must give its name', async () => {
    const res = await t.http
      .post('/v1/auth/register')
      .send({
        email: uniqueEmail('signup'),
        password: PASSWORD,
        fullNameAr: 'مدير',
        phone: uniquePhone(),
        country: 'BH',
        signupRole: 'organization',
      })
      .expect(400);
    expect(JSON.stringify(res.body)).toContain('organization_required');
  });

  it('a driver employed by a school gets a plain account until the school adds them', async () => {
    const me = await signUp({ signupRole: 'staff_driver' });
    expect(me).toMatchObject({ signupRole: 'staff_driver', isGuardian: false, memberships: [] });
  });

  it('refuses an independent driver whose phone another independent driver already uses', async () => {
    const phone = uniquePhone();
    await signUp({ signupRole: 'independent_driver' }, phone);
    const res = await t.http
      .post('/v1/auth/register')
      .send({
        email: uniqueEmail('signup'),
        password: PASSWORD,
        fullNameAr: 'سائق آخر',
        fullNameEn: 'Another Driver',
        phone,
        country: 'BH',
        signupRole: 'independent_driver',
      })
      .expect(409);
    expect(res.body.error.code).toBe('phone_in_use_by_driver');
  });

  it('still verifies the email if the phone was taken between sign-up and verification', async () => {
    const phone = uniquePhone();
    const email = uniqueEmail('signup');
    await t.http
      .post('/v1/auth/register')
      .send({
        email,
        password: PASSWORD,
        fullNameAr: 'سائق',
        fullNameEn: 'Driver',
        phone,
        country: 'BH',
        signupRole: 'independent_driver',
      })
      .expect(202);
    await signUp({ signupRole: 'independent_driver' }, phone);
    const res = await t.http
      .post('/v1/auth/verify-email')
      .send({ email, code: t.mail.lastCode(email) })
      .expect(200);
    const me = await t.http
      .get('/v1/me')
      .set({ Authorization: `Bearer ${res.body.accessToken}` })
      .expect(200);
    expect(me.body).toMatchObject({ signupRole: 'independent_driver', memberships: [] });
  });
});
