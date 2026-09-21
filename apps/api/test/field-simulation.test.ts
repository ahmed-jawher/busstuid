// Automated field simulation (PLAN §17 phase 5, replaced per §20): one school day with a school
// bus and an independent driver, including the failures that happen in real life. The clock is
// injected into the jobs, so the whole day runs in seconds and always the same way.
import { targetAddress } from '../src/push/push.provider';
import type { Actor } from './helpers/actors';
import { createTestApp, type TestApp } from './helpers/app';
import { buildFleet, enablePush, tap, type Fleet } from './helpers/fleet';

const MIN = 60_000;

describe('field simulation: one school day', () => {
  let t: TestApp;
  let bus: Fleet;
  let van: Fleet;

  const send = (f: Fleet, events: object[]) =>
    t.http.post(`/v1/trips/${f.tripId}/events`).set(f.driver.auth).send({ events }).expect(200);
  const statusOf = async (f: Fleet) =>
    (await t.db.admin.trip.findUniqueOrThrow({ where: { id: f.tripId } })).status;
  const pushesTo = async (a: Actor) => {
    const endpoints = new Set(
      (await t.db.admin.pushSubscription.findMany({ where: { userId: a.id } })).map(
        (s) => s.endpoint,
      ),
    );
    return t.push.sent.filter((p) => endpoints.has(targetAddress(p.target))).map((p) => p.message);
  };

  beforeAll(async () => {
    t = await createTestApp();
    bus = await buildFleet(t, 6);
    van = await buildFleet(t, 3);
    for (const f of [bus, van]) {
      await enablePush(t, f.guardian);
      await enablePush(t, f.admin);
    }
  });
  afterAll(() => t?.close());

  it('morning bus: taps recorded offline arrive late, duplicated and out of order — trip ends cleanly', async () => {
    await t.http.post(`/v1/trips/${bus.tripId}/start`).set(bus.driver.auth).expect(200);
    const t0 = new Date(Date.now() - 40 * MIN);
    const at = (m: number) => new Date(t0.getTime() + m * MIN);
    const [a, b, c, d, e, g] = bus.children.map((x) => x.id) as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];

    // Online: first two children board.
    await send(bus, [tap(a, 'board', at(0)), tap(b, 'board', at(2))]);
    // Tunnel: the phone is offline for the next stops and the app goes to the background.
    await t.http
      .post(`/v1/trips/${bus.tripId}/heartbeat`)
      .set(bus.driver.auth)
      .send({ state: 'app_backgrounded' });
    const offline = [
      tap(c, 'board', at(5)),
      tap(d, 'absent', at(6)),
      tap(e, 'board', at(7)),
      tap(g, 'board', at(8)),
      tap(a, 'alight', at(25)),
      tap(b, 'alight', at(25)),
      tap(c, 'alight', at(26)),
      tap(e, 'alight', at(26)),
      tap(g, 'alight', at(27)),
    ];
    // Back in coverage: the queue is flushed newest-first by a buggy client, then resent.
    await send(bus, [...offline].reverse());
    const resent = await send(bus, offline);
    expect(resent.body.results.every((r: { status: string }) => r.status === 'duplicate')).toBe(
      true,
    );

    // The watchdog runs all morning: a backgrounded app is not "silent".
    for (const m of [10, 20, 30]) await t.jobs.run('trip-watchdog', at(m));
    expect(await t.db.admin.alert.count({ where: { tripId: bus.tripId } })).toBe(0);

    await t.http
      .post(`/v1/trips/${bus.tripId}/end`)
      .set(bus.driver.auth)
      .send({ confirmEmpty: true })
      .expect(200);
    expect(await statusOf(bus)).toBe('completed');
    await t.drain();
    // Every guardian heard about boarding and arrival; the absent child's about the absence.
    const bodies = (await pushesTo(bus.guardian)).map((m) => m.body);
    expect(bodies.filter((b) => b.startsWith('✅ صعد'))).toHaveLength(5);
    expect(bodies.filter((b) => b.startsWith('🏫 نزل'))).toHaveLength(5);
    expect(bodies.filter((b) => b.startsWith('📋'))).toHaveLength(1);
  });

  it('afternoon van: the driver forgets a sleeping child and never ends the trip', async () => {
    await t.http.post(`/v1/trips/${van.tripId}/start`).set(van.driver.auth).expect(200);
    const [x, y, z] = van.children.map((c) => c.id) as [string, string, string];
    const now = Date.now();
    await send(van, [
      tap(x, 'board', new Date(now - 30 * MIN)),
      tap(y, 'board', new Date(now - 30 * MIN)),
      tap(z, 'absent', new Date(now - 30 * MIN)),
      tap(x, 'alight', new Date(now - 10 * MIN)),
      // y fell asleep on the back seat: no alight is ever recorded.
    ]);

    const trip = await t.db.admin.trip.findUniqueOrThrow({ where: { id: van.tripId } });
    const end = trip.plannedEndAt.getTime();

    // The phone dies: no heartbeat, the app never reports going to the background.
    await t.jobs.run('trip-watchdog', new Date(now + 11 * MIN));
    const silent = await t.db.admin.alert.findFirstOrThrow({
      where: { tripId: van.tripId, type: 'driver_device_silent' },
    });
    expect(silent.severity).toBe('high');

    // The planned end passes; the watchdog raises a critical overdue alert (child on board).
    await t.jobs.run('trip-watchdog', new Date(end + 16 * MIN));
    const overdue = await t.db.admin.alert.findFirstOrThrow({
      where: { tripId: van.tripId, type: 'trip_overdue' },
    });
    expect(overdue.severity).toBe('critical');
    expect(await statusOf(van)).toBe('overdue');

    // Escalation keeps going every two minutes; at minute 10 the emergency number appears.
    for (let m = 2; m <= 12; m += 2) {
      await t.jobs.run('alert-escalation', new Date(overdue.openedAt.getTime() + m * MIN + 1000));
    }
    const guardianMessages = await pushesTo(van.guardian);
    expect(guardianMessages.some((m) => m.body.includes('999'))).toBe(true);
    const rounds = await t.db.admin.alertEvent.count({
      where: { alertId: overdue.id, action: 'notified' },
    });
    expect(rounds).toBeGreaterThanOrEqual(6);

    // The admin cannot close it while the child is still recorded on board…
    await t.http
      .post(`/v1/alerts/${overdue.id}/resolve`)
      .set(van.admin.auth)
      .send({ reason: 'trip_ended_safely' })
      .expect(409);
    // …so the admin ends the trip (forced), which raises the child-specific critical alert…
    await t.http
      .post(`/v1/trips/${van.tripId}/end`)
      .set(van.admin.auth)
      .send({ force: true, reason: 'السائق لا يرد' })
      .expect(200);
    await t.drain();
    const left = await t.db.admin.alert.findFirstOrThrow({
      where: { tripId: van.tripId, type: 'student_left_onboard' },
    });
    // …which is resolved once the child is found and taken off the van.
    await t.http
      .post(`/v1/alerts/${left.id}/resolve`)
      .set(van.admin.auth)
      .send({ reason: 'found_on_vehicle_and_alighted', note: 'وُجد نائماً وتم إنزاله بسلام' })
      .expect(200);
    await t.http
      .post(`/v1/alerts/${overdue.id}/resolve`)
      .set(van.admin.auth)
      .send({ reason: 'trip_ended_safely' })
      .expect(200);
    await t.http
      .post(`/v1/alerts/${silent.id}/resolve`)
      .set(van.admin.auth)
      .send({ reason: 'trip_ended_safely' })
      .expect(200);
    await t.drain();

    const final = await t.db.admin.tripStudent.findMany({ where: { tripId: van.tripId } });
    expect(Object.fromEntries(final.map((s) => [s.studentId, s.status]))).toEqual({
      [x]: 'alighted',
      [y]: 'resolved',
      [z]: 'absent',
    });
    expect((await pushesTo(van.guardian)).at(-1)?.body).toContain('✔️ تم التأكد من سلامة');

    // Everything stops once resolved.
    const before = t.push.sent.length;
    await t.jobs.run('alert-escalation', new Date(end + 60 * MIN));
    await t.jobs.run('trip-watchdog', new Date(end + 60 * MIN));
    expect(t.push.sent.length).toBe(before);
  });
});
