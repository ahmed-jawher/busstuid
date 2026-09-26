// Guardian flow (PLAN §5), enrollment privacy (§20.3) and §16 test 9 (guardians see only
// their own children).
import {
  addChild,
  createActiveOrg,
  registerVerified,
  samplePhoto,
  uniquePhone,
  type Actor,
} from './helpers/actors';
import { createTestApp, type TestApp } from './helpers/app';

describe('guardians, children and enrollment', () => {
  let t: TestApp;
  let schoolAdmin: Actor;
  let school: Awaited<ReturnType<typeof createActiveOrg>>;
  let otherAdmin: Actor;
  let otherOrg: Awaited<ReturnType<typeof createActiveOrg>>;
  let guardianA: Actor;
  let guardianB: Actor;

  beforeAll(async () => {
    t = await createTestApp();
    schoolAdmin = await registerVerified(t, { prefix: 'school-admin' });
    school = await createActiveOrg(t, schoolAdmin, 'school');
    otherAdmin = await registerVerified(t, { prefix: 'other-admin' });
    otherOrg = await createActiveOrg(t, otherAdmin, 'transport_company');
    guardianA = await registerVerified(t, { prefix: 'guardian-a' });
    guardianB = await registerVerified(t, { prefix: 'guardian-b' });
  });
  afterAll(() => t?.close());

  it('adds a child with photo, consent and an enrollment request in one step', async () => {
    const child = await addChild(t, guardianA, school.id, 'ليان');
    expect(child.photoUrl).toMatch(
      /^http:\/\/api\.test\/v1\/students\/.+\/photo\?v=1&exp=\d+&sig=/,
    );
    expect(child.enrollmentRequests).toHaveLength(1);

    const consent = await t.db.admin.consent.findFirstOrThrow({ where: { studentId: child.id } });
    expect(consent).toMatchObject({ guardianUserId: guardianA.id, purpose: 'transport_safety' });
    const photo = await t.db.admin.studentPhoto.findUniqueOrThrow({
      where: { studentId: child.id },
    });
    expect(photo.mimeType).toBe('image/webp');
    expect(photo.bytes).toBeLessThanOrEqual(100 * 1024);
  });

  it('requires a photo and explicit consent', async () => {
    const noPhoto = await t.http
      .post('/v1/students')
      .set(guardianA.auth)
      .field('fullNameAr', 'بدون صورة')
      .field('dateOfBirth', '2016-01-01')
      .field('schoolName', 'مدرسة')
      .field('organizationId', school.id)
      .field('consent', 'true')
      .expect(400);
    expect(noPhoto.body.error.code).toBe('photo_required');

    const noConsent = await t.http
      .post('/v1/students')
      .set(guardianA.auth)
      .field('fullNameAr', 'بدون موافقة')
      .field('dateOfBirth', '2016-01-01')
      .field('schoolName', 'مدرسة')
      .field('organizationId', school.id)
      .attach('photo', await samplePhoto(), 'face.jpg')
      .expect(400);
    expect(noConsent.body.error.code).toBe('validation_failed');
  });

  it('cannot link a child to an organisation that is not active', async () => {
    const pendingAdmin = await registerVerified(t, { prefix: 'pending-admin' });
    const pending = await t.http
      .post('/v1/organizations')
      .set(pendingAdmin.auth)
      .send({
        type: 'school',
        nameAr: 'مدرسة غير معتمدة',
        nameEn: 'Unapproved School',
        country: 'BH',
      })
      .expect(201);
    expect(pending.body.status).toBe('pending_review');
    await expect(addChild(t, guardianA, pending.body.id)).rejects.toThrow(
      /organization_unavailable/,
    );
  });

  it('test 9: a guardian sees only their own children', async () => {
    const mine = await addChild(t, guardianA, school.id, 'ابن أ');
    const theirs = await addChild(t, guardianB, school.id, 'ابن ب');

    const listA = await t.http.get('/v1/me/children').set(guardianA.auth).expect(200);
    const idsA = listA.body.map((c: { id: string }) => c.id);
    expect(idsA).toContain(mine.id);
    expect(idsA).not.toContain(theirs.id);

    // 404, not 403: other children's ids cannot be confirmed.
    await t.http.get(`/v1/children/${theirs.id}`).set(guardianA.auth).expect(404);
    await t.http.get(`/v1/children/${mine.id}`).set(guardianA.auth).expect(200);
    await t.http
      .put(`/v1/students/${theirs.id}/photo`)
      .set(guardianA.auth)
      .attach('photo', await samplePhoto(), 'face.jpg')
      .expect(404);
  });

  it('shows the organisation only name and school until it approves; photo afterwards', async () => {
    const child = await addChild(t, guardianA, school.id, 'مريم');

    const pending = await t.http
      .get('/v1/org/enrollment-requests')
      .set(schoolAdmin.auth)
      .set(school.header)
      .expect(200);
    const request = pending.body.find(
      (r: { student: { id: string } }) => r.student.id === child.id,
    );
    expect(request.student).toEqual({
      id: child.id,
      fullNameAr: 'مريم',
      fullNameEn: null,
      schoolName: 'مدرسة الاختبار',
    });

    const before = await t.http
      .get('/v1/org/students')
      .set(schoolAdmin.auth)
      .set(school.header)
      .expect(200);
    expect(before.body.map((s: { id: string }) => s.id)).not.toContain(child.id);

    await t.http
      .post(`/v1/org/enrollment-requests/${request.id}/approve`)
      .set(schoolAdmin.auth)
      .set(school.header)
      .expect(200);
    await t.http
      .post(`/v1/org/enrollment-requests/${request.id}/approve`)
      .set(schoolAdmin.auth)
      .set(school.header)
      .expect(409);

    const after = await t.http
      .get('/v1/org/students')
      .set(schoolAdmin.auth)
      .set(school.header)
      .expect(200);
    const enrolled = after.body.find((s: { id: string }) => s.id === child.id);
    expect(enrolled.photoUrl).toContain(`/students/${child.id}/photo`);

    const children = await t.http.get('/v1/me/children').set(guardianA.auth).expect(200);
    const mine = children.body.find((c: { id: string }) => c.id === child.id);
    expect(mine.enrollmentRequests[0]).toMatchObject({ status: 'approved' });
  });

  it('names the requesting guardian, tells them the decision, and allows a short undo', async () => {
    const child = await addChild(t, guardianB, school.id, 'راشد');
    const list = await t.http
      .get('/v1/org/enrollment-requests')
      .set(schoolAdmin.auth)
      .set(school.header)
      .expect(200);
    const request = list.body.find((r: { student: { id: string } }) => r.student.id === child.id);
    expect(request.guardian).toMatchObject({ relationship: expect.any(String) });
    expect(request.guardian.fullNameAr).toBeTruthy();

    const inbox = async () =>
      (await t.http.get('/v1/me/notifications').set(guardianB.auth).expect(200)).body as {
        template: string;
        body: string;
      }[];
    const url = `/v1/org/enrollment-requests/${request.id}`;
    await t.http.post(`${url}/undo`).set(schoolAdmin.auth).set(school.header).expect(409);
    await t.http.post(`${url}/approve`).set(schoolAdmin.auth).set(school.header).expect(200);
    await t.drain();
    expect((await inbox())[0]).toMatchObject({ template: 'enrollment_approved' });

    // Undo within the window: back to pending, the link it made is taken back, guardian told.
    await t.http.post(`${url}/undo`).set(schoolAdmin.auth).set(school.header).expect(200);
    await t.drain();
    expect((await inbox())[0]).toMatchObject({ template: 'enrollment_reopened' });
    const students = await t.http
      .get('/v1/org/students')
      .set(schoolAdmin.auth)
      .set(school.header)
      .expect(200);
    expect(students.body.map((s: { id: string }) => s.id)).not.toContain(child.id);
    const req = await t.db.admin.enrollmentRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(req).toMatchObject({ status: 'pending', decidedAt: null, decidedBy: null });

    // Rejected, then the window passes: no more undo.
    await t.http
      .post(`${url}/reject`)
      .set(schoolAdmin.auth)
      .set(school.header)
      .send({})
      .expect(200);
    await t.db.admin.enrollmentRequest.update({
      where: { id: request.id },
      data: { decidedAt: new Date(Date.now() - 11 * 60_000) },
    });
    const late = await t.http.post(`${url}/undo`).set(schoolAdmin.auth).set(school.header);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('undo_window_passed');
  });

  it('will not undo an approval once the child is on a route', async () => {
    const child = await addChild(t, guardianA, school.id, 'جود');
    const req = await t.db.admin.enrollmentRequest.findFirstOrThrow({
      where: { studentId: child.id },
    });
    const h = { ...schoolAdmin.auth, ...school.header };
    await t.http.post(`/v1/org/enrollment-requests/${req.id}/approve`).set(h).expect(200);
    const driver = await registerVerified(t, { prefix: 'route-driver' });
    await t.http.post('/v1/org/members').set(h).send({ email: driver.email, role: 'driver' });
    const vehicle = await t.http
      .post('/v1/org/vehicles')
      .set(h)
      .send({ plateNumber: `U ${uniquePhone().slice(-5)}`, type: 'bus', capacity: 20 })
      .expect(201);
    const route = await t.http
      .post('/v1/org/routes')
      .set(h)
      .send({
        name: 'مسار التراجع',
        direction: 'to_school',
        defaultVehicleId: vehicle.body.id,
        defaultDriverId: driver.id,
        plannedStart: '06:30',
        plannedEnd: '07:15',
        daysOfWeek: [1, 2, 3],
        stops: [{ name: 'محطة 1' }],
      })
      .expect(201);
    await t.http
      .put(`/v1/org/routes/${route.body.id}/students`)
      .set(h)
      .send({ assignments: [{ studentId: child.id, stopId: route.body.stops[0].id }] })
      .expect(200);

    const students = await t.http.get('/v1/org/students').set(h).expect(200);
    expect(students.body.find((s: { id: string }) => s.id === child.id).routes).toEqual([
      {
        routeId: route.body.id,
        routeName: 'مسار التراجع',
        direction: 'to_school',
        stopName: 'محطة 1',
        stopSequence: 1,
      },
    ]);
    const res = await t.http.post(`/v1/org/enrollment-requests/${req.id}/undo`).set(h);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('student_on_route');
  });

  it("does not let one organisation act on another's requests or members", async () => {
    const child = await addChild(t, guardianB, school.id, 'حمد');
    const req = await t.db.admin.enrollmentRequest.findFirstOrThrow({
      where: { studentId: child.id },
    });
    // Admin of another org, using their own org header: request not found there.
    await t.http
      .post(`/v1/org/enrollment-requests/${req.id}/approve`)
      .set(otherAdmin.auth)
      .set(otherOrg.header)
      .expect(404);
    // Same admin spoofing the school's header: not a member.
    const spoof = await t.http
      .get('/v1/org/enrollment-requests')
      .set(otherAdmin.auth)
      .set(school.header)
      .expect(403);
    expect(spoof.body.error.code).toBe('not_a_member');
    // A guardian is not an org admin at all.
    await t.http.get('/v1/org/students').set(guardianA.auth).set(school.header).expect(403);
  });

  it('serves photos only through valid, unexpired signed links', async () => {
    const child = await addChild(t, guardianA, school.id, 'صورة');
    const ok = await t.http
      .get(new URL(child.photoUrl).pathname + new URL(child.photoUrl).search)
      .expect(200);
    expect(ok.headers['content-type']).toBe('image/webp');
    expect(ok.headers['cache-control']).toBe('private, max-age=300');

    const url = new URL(child.photoUrl);
    url.searchParams.set('exp', String(Number(url.searchParams.get('exp')) + 60));
    await t.http.get(url.pathname + url.search).expect(403);

    const otherChild = await addChild(t, guardianB, school.id, 'غيره');
    const forged = new URL(child.photoUrl);
    await t.http.get(forged.pathname.replace(child.id, otherChild.id) + forged.search).expect(403);
  });

  it('a replaced photo invalidates old links', async () => {
    const child = await addChild(t, guardianA, school.id, 'تحديث');
    const old = new URL(child.photoUrl);
    const updated = await t.http
      .put(`/v1/students/${child.id}/photo`)
      .set(guardianA.auth)
      .attach('photo', await samplePhoto(), 'face.jpg')
      .expect(200);
    expect(updated.body.photoUrl).toContain('v=2');
    await t.http.get(old.pathname + old.search).expect(404);
  });

  it('deleting a sole guardian account unlinks the child and deletes the photo', async () => {
    const parent = await registerVerified(t, { prefix: 'leaving' });
    const child = await addChild(t, parent, school.id, 'مغادر');
    await t.http
      .delete('/v1/me')
      .set(parent.auth)
      .send({ password: 'Blue-Falcon-Harbour-42' })
      .expect(204);
    expect(await t.db.admin.studentPhoto.findUnique({ where: { studentId: child.id } })).toBeNull();
    const student = await t.db.admin.student.findUniqueOrThrow({ where: { id: child.id } });
    expect(student.deletedAt).not.toBeNull();
    const request = await t.db.admin.enrollmentRequest.findFirstOrThrow({
      where: { studentId: child.id },
    });
    expect(request.status).toBe('cancelled');
  });

  it('corrects a child whose school was typed wrongly', async () => {
    const child = await addChild(t, guardianA, school.id, 'ريم أحمد');
    const res = await t.http
      .patch(`/v1/students/${child.id}`)
      .set(guardianA.auth)
      .send({ schoolName: 'مدرسة أخرى', fullNameAr: 'ريم محمد' })
      .expect(200);
    expect(res.body.schoolName).toBe('مدرسة أخرى');
    expect(res.body.fullNameAr).toBe('ريم محمد');

    // Somebody else's child cannot be edited, and is not even admitted to exist.
    await t.http
      .patch(`/v1/students/${child.id}`)
      .set(guardianB.auth)
      .send({ schoolName: 'مدرسة ثالثة' })
      .expect(404);
  });

  it('lets a guardian take a pending link request back, but not an approved one', async () => {
    const child = await addChild(t, guardianA, school.id, 'بدر أحمد');
    const pending = child.enrollmentRequests[0]!.id;
    await t.http
      .delete(`/v1/students/${child.id}/enrollments/${pending}`)
      .set(guardianA.auth)
      .expect(200);
    const after = await t.http.get(`/v1/children/${child.id}`).set(guardianA.auth).expect(200);
    expect(after.body.enrollmentRequests).toEqual([]);

    // Approved: the school carries the child now, so only the school may remove them.
    const second = await addChild(t, guardianA, school.id, 'هدى أحمد');
    const request = second.enrollmentRequests[0]!.id;
    await t.http
      .post(`/v1/org/enrollment-requests/${request}/approve`)
      .set(schoolAdmin.auth)
      .set(school.header)
      .expect(200);
    await t.http
      .delete(`/v1/students/${second.id}/enrollments/${request}`)
      .set(guardianA.auth)
      .expect(404);
  });

  it('keeps a driver with no account waiting, and turns it into a request when they sign up', async () => {
    const child = await addChild(t, guardianA, school.id, 'لمى أحمد');
    const phone = uniquePhone();
    const local = phone.replace('+973', '');

    // The permission to speak to that driver is not optional.
    const refused = await t.http
      .post(`/v1/students/${child.id}/driver-invitations`)
      .set(guardianA.auth)
      .send({ nameAr: 'سائق العائلة', phone: local, country: 'BH' })
      .expect(400);
    expect(JSON.stringify(refused.body)).toContain('contact_consent_required');

    await t.http
      .post(`/v1/students/${child.id}/driver-invitations`)
      .set(guardianA.auth)
      .send({ nameAr: 'سائق العائلة', phone: local, country: 'BH', consentContact: true })
      .expect(201);
    const withInvite = await t.http.get(`/v1/children/${child.id}`).set(guardianA.auth).expect(200);
    expect(withInvite.body.driverInvitations).toHaveLength(1);

    // The consent is kept with its version and the device that gave it (PLAN §14).
    const stored = await t.db.admin.driverInvitation.findFirstOrThrow({
      where: { studentId: child.id },
    });
    expect(stored.policyVersion).toBeTruthy();
    expect(stored.contactConsentAt).toBeTruthy();
    expect(stored.driverPhoneE164).toBe(phone);

    // That driver registers with the same number: the family does not have to ask again.
    const driver = await registerVerified(t, { prefix: 'invited-driver', phone });
    await t.http
      .post('/v1/organizations')
      .set(driver.auth)
      .send({
        type: 'independent_driver',
        nameAr: 'سائق العائلة',
        nameEn: 'Family Driver',
        country: 'BH',
      })
      .expect(201);
    const linked = await t.http.get(`/v1/children/${child.id}`).set(guardianA.auth).expect(200);
    expect(linked.body.driverInvitations).toEqual([]);
    expect(
      linked.body.enrollmentRequests.some(
        (r: { status: string; organization: { type: string } }) =>
          r.status === 'pending' && r.organization.type === 'independent_driver',
      ),
    ).toBe(true);
  });

  it('adds a child with no organisation at all', async () => {
    const res = await t.http
      .post('/v1/students')
      .set(guardianA.auth)
      .field('fullNameAr', 'طفل بلا ناقل')
      .field('dateOfBirth', '2017-03-14')
      .field('schoolName', 'مدرسة الاختبار')
      .field('consent', 'true')
      .attach('photo', await samplePhoto(), { filename: 'f.jpg', contentType: 'image/jpeg' })
      .expect(201);
    expect(res.body.enrollmentRequests).toEqual([]);
  });
});

describe('organisations and the independent-driver phone rule', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t?.close());

  it('an independent driver is active at once and found by phone for confirmation', async () => {
    const phone = uniquePhone();
    const driver = await registerVerified(t, {
      prefix: 'driver',
      phone,
      fullNameAr: 'سالم السائق',
    });
    const org = await t.http
      .post('/v1/organizations')
      .set(driver.auth)
      .send({
        type: 'independent_driver',
        nameAr: 'نقل سالم',
        nameEn: 'Salem Transport',
        country: 'BH',
      })
      .expect(201);
    expect(org.body.status).toBe('active');
    const roles = await t.db.admin.membership.findMany({ where: { userId: driver.id } });
    expect(roles.map((r) => r.role).sort()).toEqual(['driver', 'org_admin']);

    const guardian = await registerVerified(t, { prefix: 'guardian' });
    const local = phone.replace('+973', '');
    const found = await t.http
      .get('/v1/organizations/driver-lookup')
      .query({ phone: local, country: 'BH' })
      .set(guardian.auth)
      .expect(200);
    expect(found.body).toMatchObject({ id: org.body.id, driverNameAr: 'سالم السائق' });
  });

  it('refuses a second independent driver with the same phone number', async () => {
    const phone = uniquePhone();
    const first = await registerVerified(t, { prefix: 'd1', phone });
    await t.http
      .post('/v1/organizations')
      .set(first.auth)
      .send({ type: 'independent_driver', nameAr: 'الأول', nameEn: 'The First', country: 'BH' })
      .expect(201);
    const impostor = await registerVerified(t, { prefix: 'd2', phone });
    const res = await t.http
      .post('/v1/organizations')
      .set(impostor.auth)
      .send({ type: 'independent_driver', nameAr: 'منتحل', nameEn: 'Impostor', country: 'BH' })
      .expect(409);
    expect(res.body.error.code).toBe('phone_in_use_by_driver');
  });

  it('keeps unapproved schools out of the directory until a platform admin approves', async () => {
    const admin = await registerVerified(t, { prefix: 'school' });
    const created = await t.http
      .post('/v1/organizations')
      .set(admin.auth)
      .send({ type: 'school', nameAr: 'مدرسة جديدة', nameEn: 'New School', country: 'BH' })
      .expect(201);
    const guardian = await registerVerified(t, { prefix: 'g' });
    const listed = async () =>
      (
        await t.http
          .get('/v1/organizations/directory')
          .query({ country: 'BH' })
          .set(guardian.auth)
          .expect(200)
      ).body.map((o: { id: string }) => o.id);
    expect(await listed()).not.toContain(created.body.id);

    await t.http
      .post(`/v1/platform/organizations/${created.body.id}/approve`)
      .set(guardian.auth)
      .expect(403);
    const platform = await registerVerified(t, { prefix: 'platform' });
    await t.db.admin.user.update({ where: { id: platform.id }, data: { isPlatformAdmin: true } });
    await t.http
      .post(`/v1/platform/organizations/${created.body.id}/approve`)
      .set(platform.auth)
      .expect(200);
    expect(await listed()).toContain(created.body.id);
  });
});
