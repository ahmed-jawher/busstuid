// PLAN §6 trip lifecycle and §16 tests 1, 5, 6 (plus the start rules behind 11 and 12).
import { registerUnverified, registerVerified } from './helpers/actors';
import { createTestApp, type TestApp } from './helpers/app';
import { buildFleet, enablePush, tap, type Fleet } from './helpers/fleet';

const base = () => new Date(Date.now() - 30 * 60_000);
const plus = (d: Date, seconds: number) => new Date(d.getTime() + seconds * 1000);

describe('trips', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t?.close());

  const start = (f: Fleet) => t.http.post(`/v1/trips/${f.tripId}/start`).set(f.driver.auth);
  const send = (f: Fleet, events: object[]) =>
    t.http.post(`/v1/trips/${f.tripId}/events`).set(f.driver.auth).send({ events });
  const end = (f: Fleet, body: object) =>
    t.http.post(`/v1/trips/${f.tripId}/end`).set(f.driver.auth).send(body);
  const statuses = async (f: Fleet) =>
    Object.fromEntries(
      (await t.db.admin.tripStudent.findMany({ where: { tripId: f.tripId } })).map((s) => [
        s.studentId,
        s.status,
      ]),
    );

  describe('generation and starting', () => {
    it("generates today's trip once, with every assigned child expected", async () => {
      const f = await buildFleet(t, 3);
      expect(Object.values(await statuses(f))).toEqual(['expected', 'expected', 'expected']);
      await t.http.get('/v1/driver/today').set(f.driver.auth).expect(200);
      await t.http
        .post('/v1/org/trips/generate')
        .set(f.admin.auth)
        .set(f.org.header)
        .send({})
        .expect(200);
      expect(await t.db.admin.trip.count({ where: { routeId: f.routeId } })).toBe(1);
    });

    it('test 11: a driver whose notifications do not work cannot start', async () => {
      const f = await buildFleet(t, 1, { pushReady: false });
      const res = await start(f).expect(403);
      expect(res.body.error.code).toBe('push_not_enabled');
      await enablePush(t, f.driver);
      await start(f).expect(200);
    });

    it('test 12: an unverified account cannot start a trip', async () => {
      const f = await buildFleet(t, 1);
      const unverified = await registerUnverified(t);
      const res = await t.http.post(`/v1/trips/${f.tripId}/start`).set(unverified.auth).expect(403);
      expect(res.body.error.code).toBe('email_not_verified');
    });

    it('starts once (retries are harmless) and only by the assigned driver', async () => {
      const f = await buildFleet(t, 1);
      await t.http.post(`/v1/trips/${f.tripId}/start`).set(f.admin.auth).expect(403);
      const first = await start(f).expect(200);
      expect(first.body.status).toBe('in_progress');
      await start(f).expect(200);
    });

    it('allows only one active trip per vehicle', async () => {
      const f = await buildFleet(t, 1);
      await start(f).expect(200);
      const second = await t.http
        .post('/v1/org/routes')
        .set(f.admin.auth)
        .set(f.org.header)
        .send({
          name: 'خط ثانٍ',
          direction: 'to_home',
          defaultVehicleId: f.vehicleId,
          defaultDriverId: f.driver.id,
          plannedStart: '00:02',
          plannedEnd: '23:59',
          daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
          stops: [{ name: 'محطة' }],
        })
        .expect(201);
      const today = await t.http.get('/v1/driver/today').set(f.driver.auth).expect(200);
      const other = today.body.find((x: { route: { name: string } }) => x.route.name === 'خط ثانٍ');
      expect(other).toBeDefined();
      const res = await t.http.post(`/v1/trips/${other.id}/start`).set(f.driver.auth).expect(409);
      expect(res.body.error.code).toBe('vehicle_busy');
      expect(second.status).toBe(201);
    });

    it('does not reveal trips of other organisations', async () => {
      const f = await buildFleet(t, 1);
      const stranger = await registerVerified(t, { prefix: 'stranger' });
      await t.http.get(`/v1/trips/${f.tripId}/manifest`).set(stranger.auth).expect(404);
      await t.http.get(`/v1/trips/${f.tripId}/manifest`).set(f.guardian.auth).expect(404);
    });
  });

  describe('recording taps', () => {
    it('shows the manifest with photos, stops and counts', async () => {
      const f = await buildFleet(t, 3);
      await start(f).expect(200);
      const m = await t.http.get(`/v1/trips/${f.tripId}/manifest`).set(f.driver.auth).expect(200);
      expect(m.body.students).toHaveLength(3);
      expect(m.body.students[0].photoUrl).toContain('/photo?v=1');
      expect(m.body.students[0].stop.name).toBe('المحطة الأولى');
      expect(m.body.counts).toMatchObject({ onboard: 0, waiting: 3 });
    });

    it('refuses taps before the trip starts', async () => {
      const f = await buildFleet(t, 1);
      const res = await send(f, [tap(f.children[0]!.id, 'board', new Date())]).expect(409);
      expect(res.body.error.code).toBe('trip_not_started');
    });

    it('test 5: the same event sent twice is stored once', async () => {
      const f = await buildFleet(t, 1);
      await start(f).expect(200);
      const event = tap(f.children[0]!.id, 'board', base());
      const first = await send(f, [event]).expect(200);
      expect(first.body.results[0].status).toBe('accepted');
      const again = await send(f, [event, event]).expect(200);
      expect(again.body.results.map((r: { status: string }) => r.status)).toEqual([
        'duplicate',
        'duplicate',
      ]);
      expect(await t.db.admin.tripEvent.count({ where: { tripId: f.tripId } })).toBe(1);
    });

    it('test 6: late, out-of-order offline taps end in the right state', async () => {
      const f = await buildFleet(t, 2);
      await start(f).expect(200);
      const [a, b] = f.children as [{ id: string }, { id: string }];
      const t0 = base();
      // The alight (10 min later on the device) arrives first; the board arrives afterwards.
      await send(f, [tap(a.id, 'alight', plus(t0, 600)), tap(b.id, 'board', plus(t0, 30))]).expect(
        200,
      );
      expect((await statuses(f))[a.id]).toBe('expected');
      await send(f, [tap(a.id, 'board', t0)]).expect(200);
      const row = await t.db.admin.tripStudent.findUniqueOrThrow({
        where: { tripId_studentId: { tripId: f.tripId, studentId: a.id } },
      });
      expect(row.status).toBe('alighted');
      expect(row.boardedAt).toEqual(t0);
      expect(row.alightedAt).toEqual(plus(t0, 600));
      expect((await statuses(f))[b.id]).toBe('boarded');
    });

    it('undo works within 60 seconds and is refused after', async () => {
      const f = await buildFleet(t, 1);
      await start(f).expect(200);
      const id = f.children[0]!.id;
      const t0 = base();
      const board = tap(id, 'board', t0);
      const alight = tap(id, 'alight', plus(t0, 300));
      await send(f, [board, alight]).expect(200);
      await send(f, [
        tap(id, 'undo', plus(t0, 330), { undoesClientEventId: alight.clientEventId }),
      ]).expect(200);
      expect((await statuses(f))[id]).toBe('boarded');

      const late = await send(f, [
        tap(id, 'undo', plus(t0, 200), { undoesClientEventId: board.clientEventId }),
      ]);
      expect(late.body.results[0]).toMatchObject({
        status: 'rejected',
        reason: 'undo_window_expired',
      });
      // The undo is a new event: the original taps are still there (append-only).
      expect(await t.db.admin.tripEvent.count({ where: { tripId: f.tripId } })).toBe(3);
    });

    it('rejects taps for children who are not on the trip', async () => {
      const f = await buildFleet(t, 1);
      const other = await buildFleet(t, 1);
      await start(f).expect(200);
      const res = await send(f, [tap(other.children[0]!.id, 'board', base())]).expect(200);
      expect(res.body.results[0]).toMatchObject({
        status: 'rejected',
        reason: 'student_not_on_trip',
      });
    });

    it('adds a child who is not on the list, and flags it to the admin', async () => {
      const f = await buildFleet(t, 1);
      const extra = await buildFleet(t, 0);
      await start(f).expect(200);
      // Enroll a child of this school who is not on this route.
      const child = await t.db.admin.student.findFirstOrThrow({ where: { id: f.children[0]!.id } });
      await t.db.admin.tripStudent.delete({
        where: { tripId_studentId: { tripId: f.tripId, studentId: child.id } },
      });
      await t.http
        .post(`/v1/trips/${f.tripId}/students`)
        .set(f.driver.auth)
        .send({ studentId: child.id })
        .expect(201);
      const alert = await t.db.admin.alert.findFirstOrThrow({ where: { tripId: f.tripId } });
      expect(alert).toMatchObject({ type: 'unexpected_student', severity: 'low' });
      await t.http
        .post(`/v1/trips/${f.tripId}/students`)
        .set(f.driver.auth)
        .send({ studentId: extra.driver.id })
        .expect(400);
    });
  });

  describe('ending (PLAN §6.3)', () => {
    it('test 1: a child boarded but not alighted blocks the normal end', async () => {
      const f = await buildFleet(t, 2);
      await start(f).expect(200);
      const [a, b] = f.children as [{ id: string }, { id: string }];
      const t0 = base();
      await send(f, [tap(a.id, 'board', t0)]).expect(200);

      const blocked = await end(f, { confirmEmpty: true }).expect(409);
      expect(blocked.body.error.code).toBe('students_onboard');
      expect(blocked.body.error.details.students[0]).toMatchObject({
        studentId: a.id,
        fullNameAr: 'طفل 1',
      });

      await send(f, [tap(a.id, 'alight', plus(t0, 60))]).expect(200);
      const unresolved = await end(f, { confirmEmpty: true }).expect(409);
      expect(unresolved.body.error.code).toBe('students_unresolved');

      await send(f, [tap(b.id, 'absent', plus(t0, 90))]).expect(200);
      const done = await end(f, { confirmEmpty: true }).expect(200);
      expect(done.body).toMatchObject({ status: 'completed', endType: 'normal', alertsOpened: 0 });
      expect(done.body.emptyConfirmedAt).not.toBeNull();
      await end(f, { confirmEmpty: true }).expect(409);
    });

    it('a forced end with a child on board completes with a critical alert', async () => {
      const f = await buildFleet(t, 2);
      await start(f).expect(200);
      const [a, b] = f.children as [{ id: string }, { id: string }];
      await send(f, [tap(a.id, 'board', base())]).expect(200);
      const res = await end(f, { force: true, reason: 'الجوال سيفصل' }).expect(200);
      expect(res.body).toMatchObject({
        status: 'completed_with_alert',
        endType: 'forced',
        alertsOpened: 2,
      });

      const alerts = await t.db.admin.alert.findMany({
        where: { tripId: f.tripId },
        orderBy: { severity: 'asc' },
      });
      const byStudent = Object.fromEntries(alerts.map((x) => [x.studentId, x]));
      expect(byStudent[a.id]).toMatchObject({
        type: 'student_left_onboard',
        severity: 'critical',
        status: 'open',
      });
      // A child never accounted for is treated as possibly on board too.
      expect(byStudent[b.id]).toMatchObject({ type: 'student_left_onboard', severity: 'high' });
      expect((await statuses(f))[b.id]).toBe('missing');
      const opened = await t.db.admin.alertEvent.count({
        where: { alertId: { in: alerts.map((x) => x.id) } },
      });
      expect(opened).toBe(2);
    });

    it('an admin can end a trip the driver forgot; guardians cannot', async () => {
      const f = await buildFleet(t, 1);
      await start(f).expect(200);
      await t.http
        .post(`/v1/trips/${f.tripId}/end`)
        .set(f.guardian.auth)
        .send({ confirmEmpty: true })
        .expect(404);
      await send(f, [tap(f.children[0]!.id, 'absent', base())]).expect(200);
      await t.http
        .post(`/v1/trips/${f.tripId}/end`)
        .set(f.admin.auth)
        .send({ confirmEmpty: true })
        .expect(200);
    });

    it('accepts offline taps recorded before the end that arrive after it', async () => {
      const f = await buildFleet(t, 1);
      await start(f).expect(200);
      const id = f.children[0]!.id;
      const t0 = base();
      const board = tap(id, 'board', t0);
      await end(f, { force: true, reason: 'انقطاع الشبكة' }).expect(200);
      const res = await send(f, [board, tap(id, 'alight', plus(t0, 60))]).expect(200);
      expect(res.body.results.map((r: { status: string }) => r.status)).toEqual([
        'accepted',
        'accepted',
      ]);
      expect((await statuses(f))[id]).toBe('alighted');
      const tooLate = await send(f, [tap(id, 'board', new Date(Date.now() + 10 * 60_000))]).expect(
        200,
      );
      expect(tooLate.body.results[0]).toMatchObject({ status: 'rejected', reason: 'trip_ended' });
    });
  });

  describe('heartbeat and guardian view', () => {
    it('records the device state for the watchdog', async () => {
      const f = await buildFleet(t, 1);
      await start(f).expect(200);
      await t.http
        .post(`/v1/trips/${f.tripId}/heartbeat`)
        .set(f.driver.auth)
        .send({ state: 'app_backgrounded' })
        .expect(200);
      const trip = await t.db.admin.trip.findUniqueOrThrow({ where: { id: f.tripId } });
      expect(trip.lastDeviceState).toBe('app_backgrounded');
      expect(trip.lastHeartbeatAt).not.toBeNull();
    });

    it("shows guardians their child's trip today, and nobody else's", async () => {
      const f = await buildFleet(t, 1);
      await start(f).expect(200);
      const id = f.children[0]!.id;
      await send(f, [tap(id, 'board', base())]).expect(200);
      const today = await t.http.get(`/v1/children/${id}/today`).set(f.guardian.auth).expect(200);
      expect(today.body).toHaveLength(1);
      expect(today.body[0]).toMatchObject({
        studentStatus: 'boarded',
        status: 'in_progress',
        stopName: 'المحطة الأولى',
      });
      expect(today.body[0].vehicle.plateNumber).toMatch(/^B /);

      const history = await t.http
        .get(`/v1/children/${id}/history`)
        .set(f.guardian.auth)
        .expect(200);
      expect(history.body).toHaveLength(1);

      const other = await buildFleet(t, 1);
      await t.http.get(`/v1/children/${id}/today`).set(other.guardian.auth).expect(404);
    });
  });
});
