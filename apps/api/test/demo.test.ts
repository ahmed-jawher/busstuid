// The demo data must build cleanly and give a working account for every situation.
import { DEMO_PASSWORD, seedDemo } from '../src/ops/demo';
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
    const calm = await signIn('guardian.calm@tammeni.demo');
    const children = await t.http.get('/v1/me/children').set(calm).expect(200);
    expect(children.body.length).toBe(3);
    const today = await t.http
      .get(`/v1/children/${children.body[0].id}/today`)
      .set(calm)
      .expect(200);
    expect(today.body.length).toBeGreaterThan(0);

    // A guardian waiting for the school to approve.
    const waiting = await signIn('guardian.waiting@tammeni.demo');
    const pending = await t.http.get('/v1/me/children').set(waiting).expect(200);
    expect(pending.body[0].enrollmentRequests[0].status).toBe('pending');

    // The guardian with the open critical alert.
    const alerted = await signIn('guardian.alert@tammeni.demo');
    const alerts = await t.http.get('/v1/me/alerts').set(alerted).expect(200);
    expect(alerts.body.asGuardian.length).toBeGreaterThan(0);
    expect(alerts.body.asGuardian[0].severity).toBe('critical');

    // The driver with a trip running right now.
    const driver = await signIn('driver.active@tammeni.demo');
    const trips = await t.http.get('/v1/driver/today').set(driver).expect(200);
    expect(trips.body.some((trip: { status: string }) => trip.status === 'in_progress')).toBe(true);

    // The school admin sees the pending request and the open alert.
    const admin = await signIn('school.admin@tammeni.demo');
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
    const waitingDriver = await signIn('driver.waiting@tammeni.demo');
    const profile = await t.http.get('/v1/me').set(waitingDriver).expect(200);
    expect(profile.body.memberships).toEqual([]);

    // A driver is not shown the guardian screens, and a school admin is not either.
    for (const email of ['driver.active', 'school.admin', 'driver.waiting']) {
      const profile = await t.http
        .get('/v1/me')
        .set(await signIn(`${email}@tammeni.demo`))
        .expect(200);
      expect(profile.body.isGuardian, email).toBe(false);
    }

    // The platform admin has a kindergarten to approve.
    const platform = await signIn('platform.admin@tammeni.demo');
    const review = await t.http.get('/v1/platform/organizations/pending').set(platform).expect(200);
    expect(review.body.some((o: { type: string }) => o.type === 'kindergarten')).toBe(true);
  });
});
