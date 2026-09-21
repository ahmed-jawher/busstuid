// PLAN §7 alerts and escalation, §6.4 watchdog, §8 notifications.
// §16 tests 2, 3, 4, 7, 8 and the alert part of 9.
import type { Actor } from './helpers/actors';
import { createTestApp, type TestApp } from './helpers/app';
import { buildFleet, enablePush, tap, type Fleet } from './helpers/fleet';

const MIN = 60_000;

describe('alerts, escalation and the watchdog', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t?.close());

  /** Push bodies that reached any device of `actor`. */
  const pushesTo = async (actor: Actor) => {
    const endpoints = new Set(
      (await t.db.admin.pushSubscription.findMany({ where: { userId: actor.id } })).map(
        (s) => s.endpoint,
      ),
    );
    return t.push.sent.filter((p) => endpoints.has(p.target.endpoint)).map((p) => p.message);
  };

  /** A fleet whose admin and guardian also have working notifications, with the trip started. */
  const startedFleet = async (children = 1): Promise<Fleet> => {
    const f = await buildFleet(t, children);
    await enablePush(t, f.admin);
    await enablePush(t, f.guardian);
    await t.http.post(`/v1/trips/${f.tripId}/start`).set(f.driver.auth).expect(200);
    return f;
  };
  const send = (f: Fleet, events: object[]) =>
    t.http.post(`/v1/trips/${f.tripId}/events`).set(f.driver.auth).send({ events }).expect(200);
  const boardFirst = (f: Fleet) =>
    send(f, [tap(f.children[0]!.id, 'board', new Date(Date.now() - 5 * MIN))]);
  const forceEnd = (f: Fleet) =>
    t.http
      .post(`/v1/trips/${f.tripId}/end`)
      .set(f.driver.auth)
      .send({ force: true, reason: 'اختبار الإنهاء' })
      .expect(200);
  const alertOf = (f: Fleet, type: string) =>
    t.db.admin.alert.findFirstOrThrow({ where: { tripId: f.tripId, type: type as never } });

  it('notifies guardians when their child boards and gets off (and respects muting)', async () => {
    const f = await startedFleet();
    const id = f.children[0]!.id;
    await send(f, [tap(id, 'board', new Date(Date.now() - 2 * MIN))]);
    await t.drain();
    const boarded = await pushesTo(f.guardian);
    expect(boarded.at(-1)?.body).toMatch(/^✅ صعد طفل 1 إلى B \d+ الساعة \d\d:\d\d$/);

    await t.http
      .patch('/v1/me/notification-settings')
      .set(f.guardian.auth)
      .send({ muteRoutineNotifications: true })
      .expect(200);
    await send(f, [tap(id, 'alight', new Date(Date.now() - MIN))]);
    await t.drain();
    expect(await pushesTo(f.guardian)).toHaveLength(boarded.length);

    const inbox = await t.http.get('/v1/me/notifications').set(f.guardian.auth).expect(200);
    expect(inbox.body[0]).toMatchObject({ template: 'boarded', url: `/child/${id}` });
  });

  it('test 2: forced end with a child on board → critical alert pushed to driver, guardian and admin', async () => {
    const f = await startedFleet();
    await boardFirst(f);
    await forceEnd(f);
    await t.drain();
    for (const who of [f.driver, f.guardian, f.admin]) {
      const last = (await pushesTo(who)).at(-1);
      expect(last?.critical).toBe(true);
      expect(last?.body).toContain('🚨 عاجل: طفل 1');
      expect(last?.url).toMatch(/^\/alert\//);
    }
    const sent = t.push.sent.at(-1)!;
    expect(sent.options).toMatchObject({ urgency: 'high', ttlSeconds: 3600 });
    const alert = await alertOf(f, 'student_left_onboard');
    expect(alert.nextEscalationAt!.getTime()).toBeGreaterThan(Date.now() + MIN);
  });

  it('test 3: a trip the driver never ends raises trip_overdue after the margin', async () => {
    const f = await startedFleet();
    await boardFirst(f);
    const trip = await t.db.admin.trip.findUniqueOrThrow({ where: { id: f.tripId } });
    const justBefore = new Date(trip.plannedEndAt.getTime() + 14 * MIN);
    await t.jobs.run('trip-watchdog', justBefore);
    expect(
      await t.db.admin.alert.count({ where: { tripId: f.tripId, type: 'trip_overdue' } }),
    ).toBe(0);

    const after = new Date(trip.plannedEndAt.getTime() + 16 * MIN);
    await t.jobs.run('trip-watchdog', after);
    const alert = await alertOf(f, 'trip_overdue');
    // A child is still recorded on board, so it is critical and the guardian hears about it.
    expect(alert.severity).toBe('critical');
    expect((await t.db.admin.trip.findUniqueOrThrow({ where: { id: f.tripId } })).status).toBe(
      'overdue',
    );
    expect((await pushesTo(f.guardian)).at(-1)?.body).toContain('لم تنتهِ بعد');
    expect((await pushesTo(f.admin)).at(-1)?.body).toContain('طفل 1');

    await t.jobs.run('trip-watchdog', new Date(after.getTime() + MIN));
    expect(
      await t.db.admin.alert.count({ where: { tripId: f.tripId, type: 'trip_overdue' } }),
    ).toBe(1);
  });

  it('test 4: silence from the driver device with children on board → driver_device_silent', async () => {
    const f = await startedFleet();
    await boardFirst(f);
    const now = new Date(Date.now() + 11 * MIN);
    await t.jobs.run('trip-watchdog', now);
    const alert = await alertOf(f, 'driver_device_silent');
    expect(alert.severity).toBe('high');
    await t.drain();
    expect((await pushesTo(f.admin)).at(-1)?.body).toContain('لا إشارة من جهاز سائق');
    // Only admins hear about device silence.
    expect((await pushesTo(f.guardian)).some((m) => m.body.includes('لا إشارة'))).toBe(false);
  });

  it('does not treat a backgrounded app as silent (the overdue rule covers it, PLAN §9.1)', async () => {
    const f = await startedFleet();
    await boardFirst(f);
    await t.http
      .post(`/v1/trips/${f.tripId}/heartbeat`)
      .set(f.driver.auth)
      .send({ state: 'app_backgrounded' })
      .expect(200);
    await t.jobs.run('trip-watchdog', new Date(Date.now() + 11 * MIN));
    expect(
      await t.db.admin.alert.count({ where: { tripId: f.tripId, type: 'driver_device_silent' } }),
    ).toBe(0);
  });

  it('test 8: repeats every 2 minutes until resolved, widens at 5, shows 999 at 10, stops at once', async () => {
    const f = await startedFleet();
    await boardFirst(f);
    await forceEnd(f);
    await t.drain();
    const alert = await alertOf(f, 'student_left_onboard');
    const opened = alert.openedAt.getTime();
    const rounds = async () =>
      t.db.admin.alertEvent.count({ where: { alertId: alert.id, action: 'notified' } });
    expect(await rounds()).toBe(1);

    // Other tests' alerts share this database, so count this alert's rounds only.
    await t.jobs.run('alert-escalation', new Date(opened + 1 * MIN));
    expect(await rounds()).toBe(1);
    await t.jobs.run('alert-escalation', new Date(opened + 2 * MIN + 1000));
    expect(await rounds()).toBe(2);
    await t.jobs.run('alert-escalation', new Date(opened + 6 * MIN));
    expect(
      (await t.db.admin.alert.findUniqueOrThrow({ where: { id: alert.id } })).escalationLevel,
    ).toBe(1);
    await t.jobs.run('alert-escalation', new Date(opened + 10 * MIN + 1000));
    expect((await pushesTo(f.guardian)).at(-1)?.body).toContain('999');

    // Acknowledging does not silence it — only resolving does.
    await t.http.post(`/v1/alerts/${alert.id}/acknowledge`).set(f.admin.auth).expect(200);
    const beforeAck = await rounds();
    await t.jobs.run('alert-escalation', new Date(opened + 13 * MIN));
    expect(await rounds()).toBe(beforeAck + 1);

    await t.http
      .post(`/v1/alerts/${alert.id}/resolve`)
      .set(f.driver.auth)
      .send({ reason: 'found_on_vehicle_and_alighted', note: 'وُجد نائماً في المقعد الأخير' })
      .expect(200);
    const before = await rounds();
    await t.jobs.run('alert-escalation', new Date(opened + 30 * MIN));
    expect(await rounds()).toBe(before);
  });

  it('resolving records a corrective alight, keeps history, and reassures the guardian', async () => {
    const f = await startedFleet();
    await boardFirst(f);
    await forceEnd(f);
    const alert = await alertOf(f, 'student_left_onboard');
    await t.http
      .post(`/v1/alerts/${alert.id}/resolve`)
      .set(f.admin.auth)
      .send({ reason: 'other' })
      .expect(400);
    await t.http
      .post(`/v1/alerts/${alert.id}/resolve`)
      .set(f.admin.auth)
      .send({ reason: 'picked_up_by_guardian' })
      .expect(200);
    await t.drain();
    const child = f.children[0]!.id;
    const events = await t.db.admin.tripEvent.findMany({
      where: { tripId: f.tripId },
      orderBy: { serverReceivedAt: 'asc' },
    });
    expect(events.map((e) => e.eventType)).toEqual(['board', 'alight']);
    const row = await t.db.admin.tripStudent.findUniqueOrThrow({
      where: { tripId_studentId: { tripId: f.tripId, studentId: child } },
    });
    expect(row.status).toBe('resolved');
    expect((await pushesTo(f.guardian)).at(-1)?.body).toBe('✔️ تم التأكد من سلامة طفل 1');
    const history = await t.db.admin.alertEvent.findMany({ where: { alertId: alert.id } });
    expect(history.map((h) => h.action)).toEqual(
      expect.arrayContaining(['opened', 'notified', 'resolved']),
    );
    await t.http
      .post(`/v1/alerts/${alert.id}/resolve`)
      .set(f.admin.auth)
      .send({ reason: 'false_alarm' })
      .expect(409);
  });

  it('test 9: a guardian cannot resolve or acknowledge, and sees only their own children’s alerts', async () => {
    const f = await startedFleet();
    const g = await startedFleet();
    await boardFirst(f);
    await boardFirst(g);
    await forceEnd(f);
    await forceEnd(g);
    const alert = await alertOf(f, 'student_left_onboard');
    await t.http
      .post(`/v1/alerts/${alert.id}/resolve`)
      .set(f.guardian.auth)
      .send({ reason: 'false_alarm' })
      .expect(404);
    await t.http.post(`/v1/alerts/${alert.id}/acknowledge`).set(f.guardian.auth).expect(404);
    const mine = await t.http.get('/v1/me/alerts').set(f.guardian.auth).expect(200);
    expect(mine.body.asGuardian.map((a: { id: string }) => a.id)).toEqual([alert.id]);
    // Another organisation's admin cannot touch it either.
    await t.http
      .post(`/v1/alerts/${alert.id}/resolve`)
      .set(g.admin.auth)
      .send({ reason: 'false_alarm' })
      .expect(404);
  });

  it('refuses to close an overdue alert while a child is still recorded on board', async () => {
    const f = await startedFleet();
    await boardFirst(f);
    const trip = await t.db.admin.trip.findUniqueOrThrow({ where: { id: f.tripId } });
    await t.jobs.run('trip-watchdog', new Date(trip.plannedEndAt.getTime() + 20 * MIN));
    const alert = await alertOf(f, 'trip_overdue');
    const res = await t.http
      .post(`/v1/alerts/${alert.id}/resolve`)
      .set(f.admin.auth)
      .send({ reason: 'trip_ended_safely' })
      .expect(409);
    expect(res.body.error.code).toBe('students_still_onboard');
  });

  it('shows admins which guardians cannot currently be reached', async () => {
    const f = await buildFleet(t, 1);
    const res = await t.http
      .get('/v1/org/unreachable-guardians')
      .set(f.admin.auth)
      .set(f.org.header)
      .expect(200);
    expect(res.body).toEqual([
      expect.objectContaining({ userId: f.guardian.id, reason: 'no_device', phoneVerified: false }),
    ]);
    await enablePush(t, f.guardian);
    const after = await t.http
      .get('/v1/org/unreachable-guardians')
      .set(f.admin.auth)
      .set(f.org.header)
      .expect(200);
    expect(after.body).toEqual([]);
  });

  it('retries failed deliveries and drops expired devices', async () => {
    const f = await startedFleet();
    const sub = await t.db.admin.pushSubscription.findFirstOrThrow({
      where: { userId: f.guardian.id },
    });
    t.push.goneEndpoints.add(sub.endpoint!);
    await boardFirst(f);
    await t.drain();
    expect(
      (await t.db.admin.pushSubscription.findUniqueOrThrow({ where: { id: sub.id } })).revokedAt,
    ).not.toBeNull();
    const delivery = await t.db.admin.notificationDelivery.findFirstOrThrow({
      where: { pushSubscriptionId: sub.id },
    });
    expect(delivery.status).toBe('failed');
  });
});

describe('restart safety (PLAN §16 test 7)', () => {
  it('keeps escalating an open alert after the server restarts', async () => {
    const first = await createTestApp();
    const f = await buildFleet(first, 1);
    await enablePush(first, f.guardian);
    await first.http.post(`/v1/trips/${f.tripId}/start`).set(f.driver.auth).expect(200);
    await first.http
      .post(`/v1/trips/${f.tripId}/events`)
      .set(f.driver.auth)
      .send({ events: [tap(f.children[0]!.id, 'board', new Date(Date.now() - MIN))] })
      .expect(200);
    await first.http
      .post(`/v1/trips/${f.tripId}/end`)
      .set(f.driver.auth)
      .send({ force: true, reason: 'قبل الإيقاف' })
      .expect(200);
    await first.drain();
    const alert = await first.db.admin.alert.findFirstOrThrow({ where: { tripId: f.tripId } });
    // Simulate a crash that lost the schedule, then restart on the same database.
    await first.db.admin.alert.update({
      where: { id: alert.id },
      data: { nextEscalationAt: null },
    });
    const db = first.db;
    await first.app.close();

    const second = await createTestApp({ db });
    try {
      const reconciled = await second.db.admin.alert.findUniqueOrThrow({ where: { id: alert.id } });
      expect(reconciled.nextEscalationAt).not.toBeNull();
      expect(await second.jobs.run('alert-escalation', new Date(Date.now() + 1000))).toBe(1);
      expect(second.push.sent.length).toBeGreaterThan(0);
    } finally {
      await second.close();
      await db.drop();
    }
  });
});

describe('pg-boss wiring', () => {
  it('schedules the jobs from PLAN §12 when enabled', async () => {
    const t = await createTestApp({ env: { JOBS_ENABLED: 'true' } });
    try {
      const rows = await t.db.admin.$queryRawUnsafe<{ name: string }[]>(
        'SELECT name FROM pgboss.schedule ORDER BY name',
      );
      expect(rows.map((r) => r.name)).toEqual([
        'alert-escalation',
        'daily-trip-generation',
        'notification-dispatch',
        'trip-watchdog',
      ]);
    } finally {
      await t.close();
    }
  });
});
