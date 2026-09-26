// Phase 5 hardening: rate limits, headers, audit trail, data rights, retention, TOTP.
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { totpCode } from '../src/auth/totp';
import { PASSWORD, registerVerified } from './helpers/actors';
import { createTestApp, type TestApp } from './helpers/app';
import { buildFleet, tap } from './helpers/fleet';

const DAY = 24 * 3_600_000;

describe('rate limits and security headers', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ env: { RATE_LIMIT_ENABLED: 'true' } });
  });
  afterAll(() => t?.close());

  it('limits password guessing per client address', async () => {
    // 60 a minute: a school, a family or a mobile network shares one address, and the real
    // answer to guessing is the per-account lockout (auth.test.ts).
    const statuses: number[] = [];
    for (let i = 0; i < 62; i++) {
      const res = await t.http
        .post('/v1/auth/login')
        .send({ identifier: `nobody${i}@example.com`, password: 'x' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 60).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(60)).toEqual([429, 429]);
  });

  it('counts the emails it sends per address, not only per network', async () => {
    // Two parents signing up from one school's wifi must not take each other's turn: this is
    // what the "too many requests, wait a little" reports were (docs/DECISIONS.md, 2026-09-26).
    const body = (email: string) => ({
      email,
      password: PASSWORD,
      fullNameAr: 'ولي أمر',
      phone: '36009911',
      country: 'BH',
      acceptTerms: true,
    });
    for (let i = 0; i < 8; i++) {
      await t.http
        .post('/v1/auth/register')
        .send(body(`crowd${i}@example.com`))
        .expect(202);
    }
  });

  it('sets security headers and never exposes the framework', async () => {
    const res = await t.http.get('/v1/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('audit trail, data rights, TOTP', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t?.close());

  it('records approvals and who viewed students with photos', async () => {
    const f = await buildFleet(t, 1);
    await t.http.get('/v1/org/students').set(f.admin.auth).set(f.org.header).expect(200);
    await t.drain();
    const res = await t.http.get('/v1/org/audit').set(f.admin.auth).set(f.org.header).expect(200);
    const actions = res.body.map((e: { action: string }) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'enrollment.approve',
        'students.view_list',
        'route.create',
        'vehicle.create',
      ]),
    );
    const view = res.body.find((e: { action: string }) => e.action === 'students.view_list');
    expect(view.actorUserId).toBe(f.admin.id);
    // Guardians cannot read an organisation's audit log.
    await t.http.get('/v1/org/audit').set(f.guardian.auth).set(f.org.header).expect(403);
  });

  it('audits forced trip ends with their reason, attributed to the organisation', async () => {
    const f = await buildFleet(t, 1);
    await t.http.post(`/v1/trips/${f.tripId}/start`).set(f.driver.auth).expect(200);
    await t.http
      .post(`/v1/trips/${f.tripId}/end`)
      .set(f.driver.auth)
      .send({ force: true, reason: 'تدقيق السبب' })
      .expect(200);
    await t.drain();
    const row = await t.db.admin.auditLog.findFirstOrThrow({
      where: { action: 'trip.end', entityId: f.tripId },
    });
    expect(row.organizationId).toBe(f.org.id);
    expect(row.diff).toMatchObject({ force: true, reason: 'تدقيق السبب' });
  });

  it('lets a guardian export everything about their child', async () => {
    const f = await buildFleet(t, 1);
    await t.http.post(`/v1/trips/${f.tripId}/start`).set(f.driver.auth).expect(200);
    await t.http
      .post(`/v1/trips/${f.tripId}/events`)
      .set(f.driver.auth)
      .send({ events: [tap(f.children[0]!.id, 'board', new Date(Date.now() - 60_000))] })
      .expect(200);
    const res = await t.http
      .get(`/v1/children/${f.children[0]!.id}/export`)
      .set(f.guardian.auth)
      .expect(200);
    expect(res.body.child.fullNameAr).toBe('طفل 1');
    expect(res.body.photo).toMatch(/^data:image\/webp;base64,/);
    expect(res.body.consents).toHaveLength(1);
    expect(res.body.events).toEqual([expect.objectContaining({ eventType: 'board' })]);
    const other = await registerVerified(t);
    await t.http.get(`/v1/children/${f.children[0]!.id}/export`).set(other.auth).expect(404);
  });

  it('lets a guardian delete their child’s data; safety records stay without name or photo', async () => {
    const f = await buildFleet(t, 1);
    const id = f.children[0]!.id;
    await t.http
      .delete(`/v1/children/${id}`)
      .set(f.guardian.auth)
      .send({ password: 'wrong' })
      .expect(403);
    const res = await t.http
      .delete(`/v1/children/${id}`)
      .set(f.guardian.auth)
      .send({ password: PASSWORD })
      .expect(200);
    expect(res.body.outcome).toBe('deleted');
    const student = await t.db.admin.student.findUniqueOrThrow({ where: { id } });
    expect(student).toMatchObject({ fullNameAr: 'طالب محذوف', photoVersion: 0 });
    expect(student.deletedAt).not.toBeNull();
    expect(await t.db.admin.studentPhoto.count({ where: { studentId: id } })).toBe(0);
    const link = await t.db.admin.orgStudent.findFirstOrThrow({ where: { studentId: id } });
    expect(link.status).toBe('removed');
    await t.http.get('/v1/me/children').set(f.guardian.auth).expect(200).expect([]);
  });

  it('only unlinks the caller when another guardian remains', async () => {
    const f = await buildFleet(t, 1);
    const id = f.children[0]!.id;
    const second = await registerVerified(t);
    await t.db.admin.studentGuardian.create({
      data: { studentId: id, guardianUserId: second.id, relationship: 'father' },
    });
    const res = await t.http
      .delete(`/v1/children/${id}`)
      .set(f.guardian.auth)
      .send({ password: PASSWORD })
      .expect(200);
    expect(res.body.outcome).toBe('unlinked');
    expect(await t.db.admin.studentPhoto.count({ where: { studentId: id } })).toBe(1);
  });

  it('enables TOTP only after a correct code, then requires it at sign-in', async () => {
    const a = await registerVerified(t);
    const setup = await t.http
      .post('/v1/me/totp/setup')
      .set(a.auth)
      .send({ password: PASSWORD })
      .expect(200);
    const secret: string = setup.body.secret;
    expect(setup.body.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    const stored = await t.db.admin.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(stored.totpSecretEncrypted).not.toContain(secret);

    await t.http
      .post('/v1/me/totp/enable')
      .set(a.auth)
      .send({ code: '000000' === totpCode(secret) ? '111111' : '000000' })
      .expect(400);
    await t.http
      .post('/v1/me/totp/enable')
      .set(a.auth)
      .send({ code: totpCode(secret) })
      .expect(200);
    expect((await t.http.get('/v1/me').set(a.auth).expect(200)).body.totpEnabled).toBe(true);

    const missing = await t.http
      .post('/v1/auth/login')
      .send({ email: a.email, password: PASSWORD })
      .expect(401);
    expect(missing.body.error.code).toBe('totp_required');
    const wrong = await t.http
      .post('/v1/auth/login')
      .send({ email: a.email, password: PASSWORD, totp: totpCode(secret, Date.now() - 5 * 60_000) })
      .expect(401);
    expect(wrong.body.error.code).toBe('totp_invalid');
    await t.http
      .post('/v1/auth/login')
      .send({ email: a.email, password: PASSWORD, totp: totpCode(secret) })
      .expect(200);

    await t.http
      .post('/v1/me/totp/disable')
      .set(a.auth)
      .send({ password: PASSWORD, code: totpCode(secret) })
      .expect(200);
    await t.http.post('/v1/auth/login').send({ email: a.email, password: PASSWORD }).expect(200);
  });
});

describe('retention (PLAN §14)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t?.close());

  it('purges expired records but keeps open alerts and their trips', async () => {
    const f = await buildFleet(t, 2);
    const old = new Date(Date.now() - 4 * 365 * DAY);
    const oldTrip = await t.db.admin.trip.create({
      data: {
        organizationId: f.org.id,
        vehicleId: f.vehicleId,
        driverId: f.driver.id,
        direction: 'to_school',
        status: 'completed',
        serviceDate: old,
        plannedStartAt: old,
        plannedEndAt: old,
        students: {
          create: { organizationId: f.org.id, studentId: f.children[0]!.id, status: 'alighted' },
        },
        events: {
          create: {
            organizationId: f.org.id,
            studentId: f.children[0]!.id,
            eventType: 'board',
            recordedBy: f.driver.id,
            clientEventId: randomUUID(),
            clientRecordedAt: old,
          },
        },
      },
    });
    const keptTrip = await t.db.admin.trip.create({
      data: {
        organizationId: f.org.id,
        vehicleId: f.vehicleId,
        driverId: f.driver.id,
        direction: 'to_home',
        status: 'completed_with_alert',
        serviceDate: new Date(old.getTime() + DAY),
        plannedStartAt: old,
        plannedEndAt: old,
        alerts: {
          create: {
            organizationId: f.org.id,
            type: 'student_left_onboard',
            severity: 'critical',
            openedAt: old,
            studentId: f.children[1]!.id,
          },
        },
      },
    });
    await t.db.admin.auditLog.create({
      data: { organizationId: f.org.id, action: 'old', entityType: 'x', createdAt: old },
    });

    const counts = (await t.jobs.run('retention-cleanup')) as Record<string, number>;
    expect(counts.trips).toBeGreaterThanOrEqual(1);
    expect(await t.db.admin.trip.count({ where: { id: oldTrip.id } })).toBe(0);
    expect(await t.db.admin.tripEvent.count({ where: { tripId: oldTrip.id } })).toBe(0);
    // An open alert is never purged, and neither is its trip.
    expect(await t.db.admin.trip.count({ where: { id: keptTrip.id } })).toBe(1);
    expect(await t.db.admin.alert.count({ where: { tripId: keptTrip.id } })).toBe(1);
    expect(await t.db.admin.auditLog.count({ where: { action: 'old' } })).toBe(0);
  });

  it('keeps append-only tables append-only for everyone else', async () => {
    const f = await buildFleet(t, 1);
    await t.http.post(`/v1/trips/${f.tripId}/start`).set(f.driver.auth).expect(200);
    await t.http
      .post(`/v1/trips/${f.tripId}/events`)
      .set(f.driver.auth)
      .send({ events: [tap(f.children[0]!.id, 'board', new Date())] })
      .expect(200);
    const system = new PrismaClient({ datasourceUrl: t.db.systemUrl });
    try {
      // The system role without the purge flag is still refused.
      await expect(system.tripEvent.deleteMany({ where: { tripId: f.tripId } })).rejects.toThrow(
        /append-only/,
      );
      // Even with the flag, updates stay forbidden.
      await expect(
        system.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.retention_purge', 'on', true)`;
          await tx.tripEvent.updateMany({
            where: { tripId: f.tripId },
            data: { eventType: 'alight' },
          });
        }),
      ).rejects.toThrow();
      // And the superuser with the flag is refused too: only wusool_system may purge.
      await expect(
        t.db.admin.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.retention_purge', 'on', true)`;
          await tx.tripEvent.deleteMany({ where: { tripId: f.tripId } });
        }),
      ).rejects.toThrow(/append-only/);
    } finally {
      await system.$disconnect();
    }
  });
});
