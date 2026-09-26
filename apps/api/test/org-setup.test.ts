// Organisation admin setup: routes, riders and members are validated against the organisation.
import { createActiveOrg, registerVerified } from './helpers/actors';
import { createTestApp, type TestApp } from './helpers/app';
import { buildFleet } from './helpers/fleet';

describe('organisation setup', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t?.close());

  const routeBody = (vehicleId: string, driverId: string) => ({
    name: 'خط',
    direction: 'to_school',
    defaultVehicleId: vehicleId,
    defaultDriverId: driverId,
    plannedStart: '06:00',
    plannedEnd: '07:00',
    daysOfWeek: [7, 1, 2, 3, 4],
    stops: [{ name: 'محطة', lat: 26.2, lng: 50.5 }],
  });

  it('refuses a route whose driver is not a driver of this organisation', async () => {
    const f = await buildFleet(t, 0);
    const outsider = await registerVerified(t);
    const res = await t.http
      .post('/v1/org/routes')
      .set(f.admin.auth)
      .set(f.org.header)
      .send(routeBody(f.vehicleId, outsider.id))
      .expect(400);
    expect(res.body.error.code).toBe('driver_not_member');
  });

  it("refuses another organisation's vehicle", async () => {
    const f = await buildFleet(t, 0);
    const g = await buildFleet(t, 0);
    const res = await t.http
      .post('/v1/org/routes')
      .set(f.admin.auth)
      .set(f.org.header)
      .send(routeBody(g.vehicleId, f.driver.id))
      .expect(400);
    expect(res.body.error.code).toBe('vehicle_not_found');
  });

  it('assigns only enrolled children, to stops of this route', async () => {
    const f = await buildFleet(t, 1);
    const g = await buildFleet(t, 1);
    const put = (assignments: object[]) =>
      t.http
        .put(`/v1/org/routes/${f.routeId}/students`)
        .set(f.admin.auth)
        .set(f.org.header)
        .send({ assignments });
    expect(
      (await put([{ studentId: g.children[0]!.id, stopId: f.stops[0]!.id }]).expect(400)).body.error
        .code,
    ).toBe('student_not_enrolled');
    expect(
      (await put([{ studentId: f.children[0]!.id, stopId: g.stops[0]!.id }]).expect(400)).body.error
        .code,
    ).toBe('stop_not_on_route');
    await put([{ studentId: f.children[0]!.id, stopId: f.stops[1]!.id }]).expect(200);
    const route = await t.http
      .get(`/v1/org/routes/${f.routeId}`)
      .set(f.admin.auth)
      .set(f.org.header)
      .expect(200);
    expect(route.body.students).toEqual([
      expect.objectContaining({ studentId: f.children[0]!.id, stopId: f.stops[1]!.id }),
    ]);
  });

  it('never removes the last admin', async () => {
    const admin = await registerVerified(t);
    const org = await createActiveOrg(t, admin);
    const res = await t.http
      .delete(`/v1/org/members/${admin.id}/org_admin`)
      .set(admin.auth)
      .set(org.header)
      .expect(409);
    expect(res.body.error.code).toBe('last_admin');
  });

  it('adds only existing, verified accounts as members', async () => {
    const admin = await registerVerified(t);
    const org = await createActiveOrg(t, admin);
    const res = await t.http
      .post('/v1/org/members')
      .set(admin.auth)
      .set(org.header)
      .send({ email: 'nobody-here@example.com', role: 'driver' })
      .expect(404);
    expect(res.body.error.code).toBe('user_not_found');
  });

  it('names a route after where it goes, and gives it a stop, when the school gives neither', async () => {
    const f = await buildFleet(t, 0);
    const res = await t.http
      .post('/v1/org/routes')
      .set(f.admin.auth)
      .set(f.org.header)
      .send({
        direction: 'to_school',
        defaultVehicleId: f.vehicleId,
        defaultDriverId: f.driver.id,
        plannedStart: '06:30',
        plannedEnd: '07:15',
      })
      .expect(201);
    expect(res.body.name).toBe('ذهاب إلى المدرسة 06:30');
    expect(res.body.stops).toHaveLength(1);
    expect(res.body.stops[0].name).toBe('المدرسة');

    // Anything at all is accepted as a name: Arabic, English, digits.
    const named = await t.http
      .post('/v1/org/routes')
      .set(f.admin.auth)
      .set(f.org.header)
      .send({
        name: 'Bus 7 — سترة',
        direction: 'to_home',
        defaultVehicleId: f.vehicleId,
        defaultDriverId: f.driver.id,
        plannedStart: '13:00',
        plannedEnd: '14:00',
      })
      .expect(201);
    expect(named.body.name).toBe('Bus 7 — سترة');
  });
});
