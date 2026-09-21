import { randomUUID } from 'node:crypto';
import { addChild, createActiveOrg, registerVerified, type Actor } from './actors';
import type { TestApp } from './app';

export interface Fleet {
  admin: Actor;
  driver: Actor;
  org: { id: string; header: { 'X-Organization-Id': string } };
  vehicleId: string;
  routeId: string;
  stops: { id: string; sequence: number }[];
  guardian: Actor;
  children: { id: string }[];
  tripId: string;
}

/** Registers a device for `actor` and passes the test notification (required to start trips). */
export async function enablePush(t: TestApp, actor: Actor): Promise<void> {
  const sub = await t.http
    .post('/v1/push/subscriptions')
    .set(actor.auth)
    .send({
      provider: 'webpush',
      platform: 'web',
      endpoint: `https://push.example.test/${randomUUID()}`,
      keys: { p256dh: 'BExamplePublicKeyValue0123456789', auth: 'authSecret0123' },
    })
    .expect(201);
  await t.http.post(`/v1/push/subscriptions/${sub.body.id}/test`).set(actor.auth).expect(200);
}

/**
 * A school with one bus, one driver with working notifications, a route running every day and
 * `childCount` enrolled children riding it — all built through the public API — plus today's trip.
 */
export async function buildFleet(
  t: TestApp,
  childCount = 3,
  opts: { pushReady?: boolean } = {},
): Promise<Fleet> {
  const admin = await registerVerified(t, { prefix: 'admin' });
  const org = await createActiveOrg(t, admin, 'school');
  const driver = await registerVerified(t, { prefix: 'driver', fullNameAr: 'سائق الاختبار' });
  if (opts.pushReady !== false) await enablePush(t, driver);
  await t.http
    .post('/v1/org/members')
    .set(admin.auth)
    .set(org.header)
    .send({ email: driver.email, role: 'driver' })
    .expect(201);

  const vehicle = await t.http
    .post('/v1/org/vehicles')
    .set(admin.auth)
    .set(org.header)
    .send({
      plateNumber: `B ${Math.floor(Math.random() * 90000) + 10000}`,
      type: 'bus',
      capacity: 30,
    })
    .expect(201);

  const route = await t.http
    .post('/v1/org/routes')
    .set(admin.auth)
    .set(org.header)
    .send({
      name: 'خط الاختبار',
      direction: 'to_school',
      defaultVehicleId: vehicle.body.id,
      defaultDriverId: driver.id,
      plannedStart: '00:01',
      plannedEnd: '23:58',
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      stops: [{ name: 'المحطة الأولى' }, { name: 'المحطة الثانية' }],
    })
    .expect(201);

  const guardian = await registerVerified(t, { prefix: 'parent' });
  const children = [];
  for (let i = 0; i < childCount; i++) {
    const child = await addChild(t, guardian, org.id, `طفل ${i + 1}`);
    const req = await t.db.admin.enrollmentRequest.findFirstOrThrow({
      where: { studentId: child.id },
    });
    await t.http
      .post(`/v1/org/enrollment-requests/${req.id}/approve`)
      .set(admin.auth)
      .set(org.header)
      .expect(200);
    children.push({ id: child.id });
  }
  const stops = route.body.stops as { id: string; sequence: number }[];
  await t.http
    .put(`/v1/org/routes/${route.body.id}/students`)
    .set(admin.auth)
    .set(org.header)
    .send({
      assignments: children.map((c, i) => ({
        studentId: c.id,
        stopId: stops[i % stops.length]!.id,
      })),
    })
    .expect(200);

  // Opening "today" generates the trip lazily.
  const today = await t.http.get('/v1/driver/today').set(driver.auth).expect(200);
  const trip = today.body.find((x: { route: { name: string } }) => x.route.name === 'خط الاختبار');
  return {
    admin,
    driver,
    org,
    vehicleId: vehicle.body.id,
    routeId: route.body.id,
    stops,
    guardian,
    children,
    tripId: trip.id,
  };
}

let seq = 0;
/** A tap as the driver's device would record it. */
export function tap(
  studentId: string,
  type: 'board' | 'alight' | 'absent' | 'undo',
  at: Date,
  extra: { undoesClientEventId?: string; clientEventId?: string } = {},
) {
  return {
    clientEventId: extra.clientEventId ?? `evt-${Date.now()}-${seq++}-${randomUUID().slice(0, 8)}`,
    studentId,
    type,
    clientRecordedAt: at.toISOString(),
    ...(extra.undoesClientEventId ? { undoesClientEventId: extra.undoesClientEventId } : {}),
  };
}
