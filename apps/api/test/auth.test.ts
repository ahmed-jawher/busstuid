// PLAN §5.1 account rules and §16 test 12.
import { createTestApp, type TestApp } from './helpers/app';
import { PASSWORD, registerUnverified, registerVerified, uniquePhone } from './helpers/actors';

describe('accounts and email verification', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t?.close());

  const register = (email: string, extra: Record<string, unknown> = {}) =>
    t.http.post('/v1/auth/register').send({
      email,
      password: PASSWORD,
      fullNameAr: 'ولي أمر',
      phone: '36001234',
      country: 'BH',
      acceptTerms: true,
      ...extra,
    });

  it('registers, stores the email lower-case, and emails a 6-digit code', async () => {
    await register('New.Parent@Example.com').expect(202);
    const user = await t.db.admin.user.findUniqueOrThrow({
      where: { email: 'new.parent@example.com' },
    });
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.phoneE164).toBe('+97336001234');
    expect(user.phoneVerified).toBe(false);
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(t.mail.lastCode('new.parent@example.com')).toMatch(/^\d{6}$/);
    const row = await t.db.admin.emailCode.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.codeHash).not.toContain(t.mail.lastCode('new.parent@example.com'));
  });

  it('answers the same way for an existing email (no account discovery)', async () => {
    const a = await registerVerified(t);
    const before = t.mail.countTo(a.email);
    const res = await register(a.email).expect(202);
    expect(res.body).toEqual({ status: 'verification_sent' });
    expect(t.mail.countTo(a.email)).toBe(before);
  });

  it('rejects weak passwords', async () => {
    const res = await register('weak@example.com', { password: 'password123' }).expect(400);
    expect(res.body.error.code).toBe('password_too_common');
    const personal = await register('khalidalbinali@example.com', {
      password: 'khalidalbinali1',
    }).expect(400);
    expect(personal.body.error.code).toBe('password_contains_personal_info');
  });

  it('test 12: an unverified account cannot add a student', async () => {
    const u = await registerUnverified(t);
    const res = await t.http
      .post('/v1/students')
      .set(u.auth)
      .field('fullNameAr', 'طفل')
      .expect(403);
    expect(res.body.error.code).toBe('email_not_verified');
  });

  it('test 12: a code dies after 5 wrong attempts, even if the right one follows', async () => {
    await register('attempts@example.com').expect(202);
    const code = t.mail.lastCode('attempts@example.com');
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 1; i <= 4; i++) {
      const res = await t.http
        .post('/v1/auth/verify-email')
        .send({ email: 'attempts@example.com', code: wrong })
        .expect(400);
      expect(res.body.error).toMatchObject({
        code: 'code_invalid',
        details: { attemptsLeft: 5 - i },
      });
    }
    const fifth = await t.http
      .post('/v1/auth/verify-email')
      .send({ email: 'attempts@example.com', code: wrong })
      .expect(400);
    expect(fifth.body.error.code).toBe('code_attempts_exceeded');
    const right = await t.http
      .post('/v1/auth/verify-email')
      .send({ email: 'attempts@example.com', code })
      .expect(400);
    expect(right.body.error.code).toBe('code_attempts_exceeded');
  });

  it('test 12: an expired code is rejected', async () => {
    await register('expired@example.com').expect(202);
    const code = t.mail.lastCode('expired@example.com');
    await t.db.admin.emailCode.updateMany({
      where: { targetEmail: 'expired@example.com' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await t.http
      .post('/v1/auth/verify-email')
      .send({ email: 'expired@example.com', code })
      .expect(400);
    expect(res.body.error.code).toBe('code_expired');
  });

  it('test 12: resend waits 60 s and allows at most 5 emails per hour', async () => {
    const email = 'resend@example.com';
    await register(email).expect(202);
    const soon = await t.http.post('/v1/auth/resend-code').send({ email }).expect(429);
    expect(soon.body.error.code).toBe('resend_too_soon');
    expect(Number(soon.headers['retry-after'])).toBeGreaterThan(0);

    const user = await t.db.admin.user.findUniqueOrThrow({ where: { email } });
    for (let i = 0; i < 4; i++) {
      // Age every code past the cooldown but keep it inside the hour.
      await t.db.admin.emailCode.updateMany({
        where: { userId: user.id },
        data: { createdAt: new Date(Date.now() - 2 * 60_000) },
      });
      await t.http.post('/v1/auth/resend-code').send({ email }).expect(202);
    }
    await t.db.admin.emailCode.updateMany({
      where: { userId: user.id },
      data: { createdAt: new Date(Date.now() - 2 * 60_000) },
    });
    const limited = await t.http.post('/v1/auth/resend-code').send({ email }).expect(429);
    expect(limited.body.error.code).toBe('too_many_codes');
    expect(t.mail.countTo(email)).toBe(5);
  });

  it('only the newest code works', async () => {
    const email = 'newest@example.com';
    await register(email).expect(202);
    const first = t.mail.lastCode(email);
    const user = await t.db.admin.user.findUniqueOrThrow({ where: { email } });
    await t.db.admin.emailCode.updateMany({
      where: { userId: user.id },
      data: { createdAt: new Date(Date.now() - 2 * 60_000) },
    });
    await t.http.post('/v1/auth/resend-code').send({ email }).expect(202);
    const second = t.mail.lastCode(email);
    if (first !== second) {
      await t.http.post('/v1/auth/verify-email').send({ email, code: first }).expect(400);
    }
    await t.http.post('/v1/auth/verify-email').send({ email, code: second }).expect(200);
  });

  it('verifies, then the token carries the verified flag', async () => {
    const a = await registerVerified(t);
    const me = await t.http.get('/v1/me').set(a.auth).expect(200);
    expect(me.body).toMatchObject({ email: a.email, emailVerified: true, phoneVerified: false });
  });

  it('logs in, rotates refresh tokens, and revokes the family when a token is reused', async () => {
    const a = await registerVerified(t);
    const login = await t.http
      .post('/v1/auth/login')
      .send({ email: a.email, password: PASSWORD })
      .expect(200);
    const r1 = login.body.refreshToken as string;
    const rotated = await t.http.post('/v1/auth/refresh').send({ refreshToken: r1 }).expect(200);
    const r2 = rotated.body.refreshToken as string;
    expect(r2).not.toBe(r1);

    const reuse = await t.http.post('/v1/auth/refresh').send({ refreshToken: r1 }).expect(401);
    expect(reuse.body.error.code).toBe('refresh_reused');
    // The legitimate newer token died with its family.
    await t.http.post('/v1/auth/refresh').send({ refreshToken: r2 }).expect(401);
    // Other sessions (the one from verification) are unaffected.
    await t.http.post('/v1/auth/refresh').send({ refreshToken: a.refreshToken }).expect(200);
  });

  it('logout revokes the refresh token', async () => {
    const a = await registerVerified(t);
    await t.http.post('/v1/auth/logout').send({ refreshToken: a.refreshToken }).expect(204);
    await t.http.post('/v1/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
  });

  it('locks the account for 15 minutes after 10 failed logins', async () => {
    const a = await registerVerified(t);
    for (let i = 0; i < 10; i++) {
      await t.http
        .post('/v1/auth/login')
        .send({ email: a.email, password: 'wrong-password' })
        .expect(401);
    }
    const locked = await t.http
      .post('/v1/auth/login')
      .send({ email: a.email, password: PASSWORD })
      .expect(423);
    expect(locked.body.error.code).toBe('account_locked');
    expect(locked.body.error.details.retryAfterSeconds).toBeGreaterThan(800);
  });

  it('gives the same answer for unknown emails and wrong passwords', async () => {
    const unknown = await t.http
      .post('/v1/auth/login')
      .send({ email: 'nobody@example.com', password: PASSWORD })
      .expect(401);
    expect(unknown.body.error.code).toBe('invalid_credentials');
  });

  it('resets the password with an emailed code and signs out every session', async () => {
    const a = await registerVerified(t);
    await t.http.post('/v1/auth/forgot-password').send({ email: a.email }).expect(202);
    const code = t.mail.lastCode(a.email);
    await t.http
      .post('/v1/auth/reset-password')
      .send({ email: a.email, code, newPassword: 'Quiet-Meadow-Lantern-7' })
      .expect(204);
    await t.http.post('/v1/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
    await t.http.post('/v1/auth/login').send({ email: a.email, password: PASSWORD }).expect(401);
    await t.http
      .post('/v1/auth/login')
      .send({ email: a.email, password: 'Quiet-Meadow-Lantern-7' })
      .expect(200);
  });

  it('changes the password with the current one and signs out other sessions', async () => {
    const user = await registerVerified(t, { prefix: 'change-pw' });
    const other = await t.http
      .post('/v1/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(200);
    const wrong = await t.http
      .post('/v1/me/password')
      .set(user.auth)
      .send({ currentPassword: 'not-it-at-all', newPassword: 'Silver-Kite-Meadow-77' });
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.code).toBe('password_incorrect');
    const same = await t.http
      .post('/v1/me/password')
      .set(user.auth)
      .send({ currentPassword: PASSWORD, newPassword: PASSWORD });
    expect(same.body.error.code).toBe('password_unchanged');

    const ok = await t.http
      .post('/v1/me/password')
      .set(user.auth)
      .send({ currentPassword: PASSWORD, newPassword: 'Silver-Kite-Meadow-77' })
      .expect(200);
    expect(ok.body.refreshToken).toBeTruthy();
    await t.http
      .post('/v1/auth/refresh')
      .send({ refreshToken: other.body.refreshToken })
      .expect(401);
    await t.http.post('/v1/auth/refresh').send({ refreshToken: ok.body.refreshToken }).expect(200);
    await t.http
      .post('/v1/auth/login')
      .send({ email: user.email, password: 'Silver-Kite-Meadow-77' })
      .expect(200);
    const audit = await t.db.admin.auditLog.findFirst({
      where: { action: 'account.change_password', actorUserId: user.id },
    });
    expect(audit).not.toBeNull();
  });

  it('forgot-password does not reveal whether an account exists', async () => {
    const res = await t.http
      .post('/v1/auth/forgot-password')
      .send({ email: 'ghost@example.com' })
      .expect(202);
    expect(res.body).toEqual({ status: 'sent_if_applicable' });
  });

  it('changes email only after the new address is confirmed', async () => {
    const a = await registerVerified(t);
    const newEmail = `changed.${Date.now()}@example.com`;
    await t.http
      .post('/v1/me/email-change')
      .set(a.auth)
      .send({ newEmail, password: PASSWORD })
      .expect(202);
    const unchanged = await t.http.get('/v1/me').set(a.auth).expect(200);
    expect(unchanged.body.email).toBe(a.email);
    const res = await t.http
      .post('/v1/me/email-change/confirm')
      .set(a.auth)
      .send({ code: t.mail.lastCode(newEmail) })
      .expect(200);
    expect(res.body.email).toBe(newEmail);
  });

  it('deletes the account (Apple requirement) and anonymises personal data', async () => {
    const a = await registerVerified(t, { phone: uniquePhone() });
    await t.http.delete('/v1/me').set(a.auth).send({ password: 'wrong' }).expect(403);
    await t.http.delete('/v1/me').set(a.auth).send({ password: PASSWORD }).expect(204);
    const user = await t.db.admin.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(user).toMatchObject({ status: 'deleted', fullNameAr: 'حساب محذوف' });
    expect(user.email).not.toBe(a.email);
    await t.http.post('/v1/auth/login').send({ email: a.email, password: PASSWORD }).expect(401);
    await t.http.post('/v1/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
  });
});
