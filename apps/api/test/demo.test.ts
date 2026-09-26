// The demo data must build cleanly and give a working account for every situation.
import { DEMO_PASSWORD, seedDemo, wipeEverything } from '../src/ops/demo';
import { createTestApp, type TestApp } from './helpers/app';

describe('demo data', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t?.close());

  it('creates every scenario once, and does nothing the second time', async () => {
    const accounts = await seedDemo(t.db.admin);
    expect(accounts).not.toBeNull();
    expect(accounts!.length).toBeGreaterThanOrEqual(10);
    expect(await seedDemo(t.db.admin)).toBeNull();

    // Every demo account can sign in with the shared password.
    for (const account of accounts!) {
      const res = await t.http
        .post('/v1/auth/login')
        .send({ email: account.email, password: DEMO_PASSWORD });
      expect(res.status, account.email).toBe(200);
    }
  });

  it('gives each role the screen its scenario describes', async () => {
    const signIn = async (email: string) => {
      const res = await t.http
        .post('/v1/auth/login')
        .send({ email, password: DEMO_PASSWORD })
        .expect(200);
      return { Authorization: `Bearer ${res.body.accessToken}` };
    };

    // A guardian with two children and a completed morning trip.
    const calm = await signIn('parent1@t.test');
    const children = await t.http.get('/v1/me/children').set(calm).expect(200);
    expect(children.body.length).toBe(3);
    const today = await t.http
      .get(`/v1/children/${children.body[0].id}/today`)
      .set(calm)
      .expect(200);
    expect(today.body.length).toBeGreaterThan(0);

    // A guardian waiting for the school to approve.
    const waiting = await signIn('parent2@t.test');
    const pending = await t.http.get('/v1/me/children').set(waiting).expect(200);
    expect(pending.body[0].enrollmentRequests[0].status).toBe('pending');

    // The guardian with the open critical alert.
    const alerted = await signIn('parent4@t.test');
    const alerts = await t.http.get('/v1/me/alerts').set(alerted).expect(200);
    expect(alerts.body.asGuardian.length).toBeGreaterThan(0);
    expect(alerts.body.asGuardian[0].severity).toBe('critical');

    // The driver with a trip running right now.
    const driver = await signIn('driver2@t.test');
    const trips = await t.http.get('/v1/driver/today').set(driver).expect(200);
    expect(trips.body.some((trip: { status: string }) => trip.status === 'in_progress')).toBe(true);

    // The school admin sees the pending request and the open alert.
    const admin = await signIn('school@t.test');
    const me = await t.http.get('/v1/me').set(admin).expect(200);
    const orgId = me.body.memberships[0].organization.id;
    const org = { 'X-Organization-Id': orgId };
    const requests = await t.http
      .get('/v1/org/enrollment-requests')
      .set(admin)
      .set(org)
      .expect(200);
    expect(requests.body.length).toBeGreaterThan(0);
    const openAlerts = await t.http.get('/v1/alerts').set(admin).set(org).expect(200);
    expect(openAlerts.body.length).toBeGreaterThan(0);

    // The driver waiting to be added has no organisation yet.
    const waitingDriver = await signIn('driver3@t.test');
    const profile = await t.http.get('/v1/me').set(waitingDriver).expect(200);
    expect(profile.body.memberships).toEqual([]);

    // A driver is not shown the guardian screens, and a school admin is not either.
    for (const email of ['driver2', 'school', 'driver3']) {
      const profile = await t.http
        .get('/v1/me')
        .set(await signIn(`${email}@t.test`))
        .expect(200);
      expect(profile.body.isGuardian, email).toBe(false);
    }

    // The platform admin has a kindergarten to approve.
    const platform = await signIn('admin@t.test');
    const review = await t.http.get('/v1/platform/organizations/pending').set(platform).expect(200);
    expect(review.body.some((o: { type: string }) => o.type === 'kindergarten')).toBe(true);

    // The family whose own driver has no account: the invitation waits on the child.
    const inviting = await signIn('parent6@t.test');
    const waitingChild = await t.http.get('/v1/me/children').set(inviting).expect(200);
    expect(waitingChild.body[0].enrollmentRequests).toEqual([]);
    expect(waitingChild.body[0].driverInvitations[0].driverName).toBeTruthy();
  });

  it('empties the database completely, including the append-only tables', async () => {
    expect(await t.db.admin.tripEvent.count()).toBeGreaterThan(0);
    expect(await t.db.admin.legalAcceptance.count()).toBeGreaterThan(0);

    await wipeEverything(t.db.admin);

    for (const count of [
      await t.db.admin.user.count(),
      await t.db.admin.organization.count(),
      await t.db.admin.student.count(),
      await t.db.admin.trip.count(),
      await t.db.admin.tripEvent.count(),
      await t.db.admin.alert.count(),
      await t.db.admin.alertEvent.count(),
      await t.db.admin.auditLog.count(),
      await t.db.admin.legalAcceptance.count(),
      await t.db.admin.driverInvitation.count(),
    ]) {
      expect(count).toBe(0);
    }

    // The protection is back on: nothing may edit a safety record afterwards.
    const accounts = await seedDemo(t.db.admin);
    expect(accounts).not.toBeNull();
    const event = await t.db.admin.tripEvent.findFirstOrThrow();
    await expect(
      t.db.admin.tripEvent.update({ where: { id: event.id }, data: { lat: '1.000000' } }),
    ).rejects.toThrow(/append-only/);
  });
});
