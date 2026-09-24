// Demo data for showing Tammeni to someone: one account per situation a real user can be in,
// with trips, alerts and notifications already in place (PLAN §17).
//
// Everything here is invented: names, phone numbers, schools. The accounts share one password
// and are meant for a demonstration server, never for a server holding a real child's data.
// Run it with `node dist/ops/cli.js demo` (see docs/DEMO.md); running it twice does nothing.
import { PrismaClient, type Prisma, type TripDirection } from '@prisma/client';
import { COUNTRY_DEFAULTS, PRIVACY_POLICY_VERSION, LEGAL_VERSION } from '@wusool/shared';
import sharp from 'sharp';
import { hashPassword } from '../auth/passwords';
import { processStudentPhoto } from '../students/photos';

export const DEMO_PASSWORD = 'Falcon-Harbour-2026';
export const DEMO_DOMAIN = 'tammeni.demo';
const MARKER_EMAIL = `platform.admin@${DEMO_DOMAIN}`;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** A face-less placeholder so the demo has photos without using a real child's picture. */
async function placeholderPhoto(letter: string, colour: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
    <rect width="400" height="400" fill="${colour}"/>
    <text x="200" y="265" font-size="220" font-family="sans-serif" fill="#ffffff"
      text-anchor="middle">${letter}</text></svg>`;
  return processStudentPhoto(await sharp(Buffer.from(svg)).png().toBuffer());
}

/** Today at a given hour and minute, in the server's time zone. */
function todayAt(hour: number, minute: number, dayOffset = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/**
 * What each demo account said it was when signing up. It decides which screens they land on:
 * a school admin should not be shown an empty "my children" tab.
 */
const SIGNUP_ROLE_OF: Record<
  string,
  'guardian' | 'independent_driver' | 'organization' | 'staff_driver'
> = {
  'platform.admin': 'organization',
  'school.admin': 'organization',
  'kindergarten.admin': 'organization',
  'driver.bus': 'staff_driver',
  'driver.active': 'staff_driver',
  'driver.waiting': 'staff_driver',
  'driver.independent': 'independent_driver',
};

export interface DemoAccount {
  email: string;
  role: string;
  scenario: string;
}

export async function seedDemo(db: PrismaClient): Promise<DemoAccount[] | null> {
  if (await db.user.findUnique({ where: { email: MARKER_EMAIL } })) return null;

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const now = new Date();
  const bh = COUNTRY_DEFAULTS.BH;
  let phoneCounter = 3900_0001;
  const accounts: DemoAccount[] = [];

  const user = async (
    local: string,
    ar: string,
    en: string,
    role: string,
    scenario: string,
    extra: Prisma.UserUncheckedCreateInput | object = {},
  ) => {
    const signupRole = SIGNUP_ROLE_OF[local] ?? 'guardian';
    const email = `${local}@${DEMO_DOMAIN}`;
    const created = await db.user.create({
      data: {
        email,
        fullNameAr: ar,
        fullNameEn: en,
        phoneE164: `+973${phoneCounter++}`,
        passwordHash,
        emailVerifiedAt: now,
        signupRole,
        termsVersion: LEGAL_VERSION,
        termsAcceptedAt: now,
        legalAcceptances: {
          create: [
            { document: 'terms', version: LEGAL_VERSION },
            { document: 'privacy', version: LEGAL_VERSION },
          ],
        },
        ...extra,
      },
    });
    accounts.push({ email, role, scenario });
    return created;
  };

  const org = (
    type: 'school' | 'kindergarten' | 'transport_company' | 'independent_driver',
    nameAr: string,
    nameEn: string,
    status: 'active' | 'pending_review',
  ) =>
    db.organization.create({
      data: {
        type,
        nameAr,
        nameEn,
        nameKeyAr: nameAr.toLowerCase(),
        nameKeyEn: nameEn.toLowerCase(),
        country: 'BH',
        timezone: bh.timezone,
        status,
      },
    });

  // ── The organisations ──────────────────────────────────────────────────────
  await user(
    'platform.admin',
    'مشغّل المنصة',
    'Platform Operator',
    'مشغّل المنصة',
    'يوافق على المدارس والرياض الجديدة: عنده روضة بانتظار الموافقة.',
    {
      isPlatformAdmin: true,
    },
  );

  const school = await org(
    'school',
    'مدرسة الأمل النموذجية (تجريبية)',
    'Al Amal Model School (demo)',
    'active',
  );
  const van = await org(
    'independent_driver',
    'نقل أبو خالد (تجريبي)',
    'Abu Khalid Transport (demo)',
    'active',
  );
  const kindergarten = await org(
    'kindergarten',
    'روضة الأمانة (تجريبية)',
    'Al Amana Kindergarten (demo)',
    'pending_review',
  );

  const schoolAdmin = await user(
    'school.admin',
    'منى الحداد',
    'Mona Alhaddad',
    'مدير مدرسة',
    'مدرسة كاملة: حافلتان ومساران وطلاب، طلب انضمام معلّق، وتنبيه حرج مفتوح.',
  );
  const driverBus = await user(
    'driver.bus',
    'جاسم الدوسري',
    'Jassim Aldosari',
    'سائق مدرسة',
    'رحلة الصباح انتهت بسلام، ورحلة العودة تبدأ بعد قليل.',
  );
  const driverActive = await user(
    'driver.active',
    'سلمان النعيمي',
    'Salman Alnaimi',
    'سائق مدرسة',
    'رحلة جارية الآن: ثلاثة طلاب على متن الحافلة وطالب لم يصعد بعد.',
  );
  const independentDriver = await user(
    'driver.independent',
    'خالد المناعي',
    'Khalid Almannai',
    'سائق مستقل',
    'صاحب منظمته: يدير مركبته ومساره بنفسه، والأهالي يربطون أطفالهم برقمه.',
  );
  const staffDriver = await user(
    'driver.waiting',
    'عيسى البنعلي',
    'Isa Albinali',
    'سائق بانتظار إدارته',
    'أنشأ حسابه وينتظر أن تضيفه المدرسة: تظهر له شاشة الانتظار.',
  );
  const kindergartenAdmin = await user(
    'kindergarten.admin',
    'أمل السعد',
    'Amal Alsaad',
    'مديرة روضة',
    'سجّلت روضة وتنتظر موافقة مشغّل المنصة: تظهر لها لافتة الانتظار.',
  );

  await db.membership.createMany({
    data: [
      { userId: schoolAdmin.id, organizationId: school.id, role: 'org_admin' },
      { userId: driverBus.id, organizationId: school.id, role: 'driver' },
      { userId: driverActive.id, organizationId: school.id, role: 'driver' },
      { userId: independentDriver.id, organizationId: van.id, role: 'org_admin' },
      { userId: independentDriver.id, organizationId: van.id, role: 'driver' },
      { userId: kindergartenAdmin.id, organizationId: kindergarten.id, role: 'org_admin' },
    ],
  });
  void staffDriver;

  const bus1 = await db.vehicle.create({
    data: { organizationId: school.id, plateNumber: 'D 11001', type: 'bus', capacity: 30 },
  });
  const bus2 = await db.vehicle.create({
    data: { organizationId: school.id, plateNumber: 'D 11002', type: 'bus', capacity: 30 },
  });
  const bus3 = await db.vehicle.create({
    data: { organizationId: school.id, plateNumber: 'D 11003', type: 'bus', capacity: 30 },
  });
  const minivan = await db.vehicle.create({
    data: { organizationId: van.id, plateNumber: 'D 22010', type: 'van', capacity: 10 },
  });

  // ── Routes ─────────────────────────────────────────────────────────────────
  const schoolDays = [7, 1, 2, 3, 4];
  const makeRoute = async (
    organizationId: string,
    name: string,
    direction: TripDirection,
    vehicleId: string,
    driverId: string,
    plannedStart: string,
    plannedEnd: string,
  ) => {
    const route = await db.route.create({
      data: {
        organizationId,
        name,
        direction,
        defaultVehicleId: vehicleId,
        defaultDriverId: driverId,
        plannedStart,
        plannedEnd,
        daysOfWeek: schoolDays,
      },
    });
    const stop = await db.routeStop.create({
      data: {
        organizationId,
        routeId: route.id,
        sequence: 1,
        name: `${name} — المحطة الأولى`,
        lat: '26.130000',
        lng: '50.555000',
      },
    });
    return { route, stop };
  };

  const morning = await makeRoute(
    school.id,
    'خط الرفاع',
    'to_school',
    bus1.id,
    driverBus.id,
    '06:15',
    '07:15',
  );
  const afternoon = await makeRoute(
    school.id,
    'خط الرفاع',
    'to_home',
    bus1.id,
    driverBus.id,
    '13:15',
    '14:15',
  );
  const busy = await makeRoute(
    school.id,
    'خط مدينة عيسى',
    'to_school',
    bus2.id,
    driverActive.id,
    '06:30',
    '07:30',
  );
  const late = await makeRoute(
    school.id,
    'خط سترة',
    'to_home',
    bus3.id,
    driverActive.id,
    '13:30',
    '14:30',
  );
  const vanRoute = await makeRoute(
    van.id,
    'خط المحرق',
    'to_school',
    minivan.id,
    independentDriver.id,
    '06:45',
    '07:30',
  );

  // ── Guardians and their children ───────────────────────────────────────────
  const colours = ['#0f766e', '#b45309', '#1d4ed8', '#9d174d', '#4d7c0f'];
  let colourIndex = 0;
  const addChild = async (
    guardianId: string,
    nameAr: string,
    nameEn: string,
    organizationId: string,
    schoolName: string,
    enrollment: 'approved' | 'pending',
    decidedBy?: string,
  ) => {
    const photo = await placeholderPhoto(nameAr[0]!, colours[colourIndex++ % colours.length]!);
    return db.student.create({
      data: {
        createdByGuardianId: guardianId,
        fullNameAr: nameAr,
        fullNameEn: nameEn,
        dateOfBirth: new Date(Date.UTC(2016 + (colourIndex % 4), colourIndex % 12, 12)),
        schoolName,
        photoVersion: 1,
        photo: { create: photo },
        guardians: {
          create: { guardianUserId: guardianId, relationship: 'mother', isPrimary: true },
        },
        consents: {
          create: {
            guardianUserId: guardianId,
            purpose: 'transport_safety',
            policyVersion: PRIVACY_POLICY_VERSION,
          },
        },
        enrollmentRequests: {
          create:
            enrollment === 'approved'
              ? {
                  organizationId,
                  requestedBy: guardianId,
                  status: 'approved',
                  decidedAt: now,
                  decidedBy,
                }
              : { organizationId, requestedBy: guardianId },
        },
        ...(enrollment === 'approved' ? { orgStudents: { create: { organizationId } } } : {}),
      },
    });
  };

  // 1. A quiet day that went well, with two siblings on one phone number.
  const calmGuardian = await user(
    'guardian.calm',
    'نورة القطان',
    'Noora Alqattan',
    'ولي أمر',
    'اليوم الطبيعي: طفلان (إخوة) على نفس الرقم، صعدا ونزلا، وطفل ثالث غائب اليوم.',
  );
  const sibling1 = await addChild(
    calmGuardian.id,
    'سالم القطان',
    'Salem Alqattan',
    school.id,
    school.nameAr,
    'approved',
    schoolAdmin.id,
  );
  const sibling2 = await addChild(
    calmGuardian.id,
    'سارة القطان',
    'Sara Alqattan',
    school.id,
    school.nameAr,
    'approved',
    schoolAdmin.id,
  );

  // 2. Waiting for the school to approve.
  const waitingGuardian = await user(
    'guardian.waiting',
    'هيا العلوي',
    'Haya Alalawi',
    'ولي أمر',
    'طلب الانضمام للمدرسة ما زال بانتظار الموافقة: يظهر الطفل «بانتظار الموافقة».',
  );
  await addChild(
    waitingGuardian.id,
    'عمر العلوي',
    'Omar Alalawi',
    school.id,
    school.nameAr,
    'pending',
  );

  // 3. A trip happening right now.
  const liveGuardian = await user(
    'guardian.live',
    'مريم الشاعر',
    'Maryam Alshaer',
    'ولي أمر',
    'رحلة جارية الآن: الطفل على متن الحافلة، والحالة تتغير أمامك.',
  );
  const liveChild = await addChild(
    liveGuardian.id,
    'يوسف الشاعر',
    'Yousif Alshaer',
    school.id,
    school.nameAr,
    'approved',
    schoolAdmin.id,
  );

  // 4. The situation the whole system exists for.
  const alertGuardian = await user(
    'guardian.alert',
    'دانة المحمود',
    'Dana Almahmood',
    'ولي أمر',
    'التنبيه الحرج: انتهت رحلة الأمس والطفل ما زال مسجّلاً على الحافلة — التنبيه مفتوح.',
  );
  const forgottenChild = await addChild(
    alertGuardian.id,
    'ليان المحمود',
    'Layan Almahmood',
    school.id,
    school.nameAr,
    'approved',
    schoolAdmin.id,
  );

  // 5. With the independent driver.
  const vanGuardian = await user(
    'guardian.van',
    'شيخة الجودر',
    'Shaikha Aljowder',
    'ولي أمر',
    'طفل مع سائق مستقل بدل مدرسة: الربط تمّ برقم جوال السائق.',
  );
  const vanChild = await addChild(
    vanGuardian.id,
    'حمد الجودر',
    'Hamad Aljowder',
    van.id,
    'روضة الجنان',
    'approved',
    independentDriver.id,
  );

  // 6. A child marked absent today.
  const absentChild = await addChild(
    calmGuardian.id,
    'خالد القطان',
    'Khalid Alqattan',
    school.id,
    school.nameAr,
    'approved',
    schoolAdmin.id,
  );

  const riders: [string, { route: { id: string }; stop: { id: string } }, string][] = [
    [sibling1.id, morning, school.id],
    [sibling2.id, morning, school.id],
    [absentChild.id, morning, school.id],
    [sibling1.id, afternoon, school.id],
    [sibling2.id, afternoon, school.id],
    [forgottenChild.id, afternoon, school.id],
    [liveChild.id, busy, school.id],
    [vanChild.id, vanRoute, van.id],
  ];
  for (const [studentId, line, organizationId] of riders) {
    await db.routeStudent.create({
      data: {
        organizationId,
        routeId: line.route.id,
        studentId,
        stopId: line.stop.id,
        activeFrom: new Date(Date.UTC(2026, 8, 1)),
      },
    });
  }

  // ── Trips ──────────────────────────────────────────────────────────────────
  const makeTrip = async (
    organizationId: string,
    line: { route: { id: string }; stop: { id: string } },
    vehicleId: string,
    driverId: string,
    direction: TripDirection,
    status: 'scheduled' | 'in_progress' | 'completed' | 'completed_with_alert' | 'overdue',
    plannedStartAt: Date,
    plannedEndAt: Date,
    students: {
      studentId: string;
      status: 'expected' | 'boarded' | 'alighted' | 'absent' | 'missing';
    }[],
    extra: object = {},
  ) =>
    db.trip.create({
      data: {
        organizationId,
        routeId: line.route.id,
        vehicleId,
        driverId,
        direction,
        status,
        serviceDate: plannedStartAt,
        plannedStartAt,
        plannedEndAt,
        students: {
          create: students.map((s) => ({
            organizationId,
            studentId: s.studentId,
            status: s.status,
          })),
        },
        ...extra,
      },
      include: { students: true },
    });

  const tap = (
    organizationId: string,
    studentId: string,
    eventType: 'board' | 'alight' | 'absent',
    at: Date,
    recordedBy: string,
  ) => ({
    organizationId,
    studentId,
    eventType,
    recordedBy,
    clientEventId: `demo-${studentId}-${eventType}-${at.getTime()}`,
    clientRecordedAt: at,
    lat: '26.130000',
    lng: '50.555000',
    accuracyM: '12.00',
  });

  // A morning run that went exactly as it should.
  const calmTrip = await makeTrip(
    school.id,
    morning,
    bus1.id,
    driverBus.id,
    'to_school',
    'completed',
    todayAt(6, 15),
    todayAt(7, 15),
    [
      { studentId: sibling1.id, status: 'alighted' },
      { studentId: sibling2.id, status: 'alighted' },
      { studentId: absentChild.id, status: 'absent' },
    ],
    { startedAt: todayAt(6, 16), endedAt: todayAt(7, 10) },
  );
  await db.tripEvent.createMany({
    data: [
      tap(school.id, sibling1.id, 'board', todayAt(6, 22), driverBus.id),
      tap(school.id, sibling2.id, 'board', todayAt(6, 22), driverBus.id),
      tap(school.id, absentChild.id, 'absent', todayAt(6, 23), driverBus.id),
      tap(school.id, sibling1.id, 'alight', todayAt(7, 5), driverBus.id),
      tap(school.id, sibling2.id, 'alight', todayAt(7, 5), driverBus.id),
    ].map((e) => ({ ...e, tripId: calmTrip.id })),
  });

  // A trip running right now.
  const liveTrip = await makeTrip(
    school.id,
    busy,
    bus2.id,
    driverActive.id,
    'to_school',
    'in_progress',
    new Date(now.getTime() - 25 * MINUTE),
    new Date(now.getTime() + 20 * MINUTE),
    [{ studentId: liveChild.id, status: 'boarded' }],
    { startedAt: new Date(now.getTime() - 24 * MINUTE) },
  );
  await db.tripEvent.create({
    data: {
      ...tap(
        school.id,
        liveChild.id,
        'board',
        new Date(now.getTime() - 18 * MINUTE),
        driverActive.id,
      ),
      tripId: liveTrip.id,
    },
  });

  // Ready to start: the independent driver's run.
  await makeTrip(
    van.id,
    vanRoute,
    minivan.id,
    independentDriver.id,
    'to_school',
    'scheduled',
    new Date(now.getTime() + 45 * MINUTE),
    new Date(now.getTime() + 2 * HOUR),
    [{ studentId: vanChild.id, status: 'expected' }],
  );

  // Yesterday afternoon: the trip that ended with a child still on board.
  const alertTrip = await makeTrip(
    school.id,
    afternoon,
    bus1.id,
    driverBus.id,
    'to_home',
    'completed_with_alert',
    todayAt(13, 15, -1),
    todayAt(14, 15, -1),
    [
      { studentId: sibling1.id, status: 'alighted' },
      { studentId: sibling2.id, status: 'alighted' },
      { studentId: forgottenChild.id, status: 'missing' },
    ],
    {
      startedAt: todayAt(13, 16, -1),
      endedAt: todayAt(14, 20, -1),
      endType: 'forced',
      forceReason: 'نهاية الدوام — أُنهيت الرحلة رغم وجود طالب مسجّل على الحافلة',
    },
  );
  await db.tripEvent.createMany({
    data: [
      tap(school.id, sibling1.id, 'board', todayAt(13, 20, -1), driverBus.id),
      tap(school.id, sibling2.id, 'board', todayAt(13, 20, -1), driverBus.id),
      tap(school.id, forgottenChild.id, 'board', todayAt(13, 21, -1), driverBus.id),
      tap(school.id, sibling1.id, 'alight', todayAt(13, 50, -1), driverBus.id),
      tap(school.id, sibling2.id, 'alight', todayAt(13, 50, -1), driverBus.id),
    ].map((e) => ({ ...e, tripId: alertTrip.id })),
  });
  const openAlert = await db.alert.create({
    data: {
      organizationId: school.id,
      tripId: alertTrip.id,
      studentId: forgottenChild.id,
      type: 'student_left_onboard',
      severity: 'critical',
      status: 'open',
      escalationLevel: 2,
      openedAt: new Date(now.getTime() - 40 * MINUTE),
      nextEscalationAt: new Date(now.getTime() + 2 * MINUTE),
      events: {
        create: [
          {
            organizationId: school.id,
            action: 'opened',
            createdAt: new Date(now.getTime() - 40 * MINUTE),
          },
          {
            organizationId: school.id,
            action: 'notified',
            createdAt: new Date(now.getTime() - 38 * MINUTE),
          },
          {
            organizationId: school.id,
            action: 'notified',
            createdAt: new Date(now.getTime() - 20 * MINUTE),
          },
        ],
      },
    },
  });

  // An overdue trip, so the admin screen shows both kinds of alert.
  const overdueTrip = await makeTrip(
    school.id,
    late,
    bus3.id,
    driverActive.id,
    'to_home',
    'overdue',
    todayAt(13, 30, -1),
    todayAt(14, 30, -1),
    [{ studentId: liveChild.id, status: 'boarded' }],
    { startedAt: todayAt(13, 31, -1) },
  );
  await db.alert.create({
    data: {
      organizationId: school.id,
      tripId: overdueTrip.id,
      type: 'trip_overdue',
      severity: 'critical',
      status: 'acknowledged',
      openedAt: new Date(now.getTime() - 3 * HOUR),
      acknowledgedAt: new Date(now.getTime() - 2 * HOUR),
      acknowledgedBy: schoolAdmin.id,
      events: {
        create: [
          {
            organizationId: school.id,
            action: 'opened',
            createdAt: new Date(now.getTime() - 3 * HOUR),
          },
          {
            organizationId: school.id,
            action: 'acknowledged',
            actorUserId: schoolAdmin.id,
            createdAt: new Date(now.getTime() - 2 * HOUR),
          },
        ],
      },
    },
  });

  // What the guardians see in their inbox.
  await db.notification.createMany({
    data: [
      {
        userId: calmGuardian.id,
        templateKey: 'boarded',
        priority: 'normal',
        payload: { studentName: 'سالم', time: '06:22' },
        createdAt: todayAt(6, 22),
      },
      {
        userId: calmGuardian.id,
        templateKey: 'alighted',
        priority: 'normal',
        payload: { studentName: 'سالم', time: '07:05' },
        createdAt: todayAt(7, 5),
      },
      {
        userId: alertGuardian.id,
        alertId: openAlert.id,
        templateKey: 'student_left_onboard',
        priority: 'critical',
        payload: { studentName: 'ليان' },
        createdAt: new Date(now.getTime() - 40 * MINUTE),
      },
    ],
  });

  return accounts;
}

/** Entry point for `cli.js demo`. */
export async function runDemo(databaseUrl: string): Promise<void> {
  const db = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const accounts = await seedDemo(db);
    if (!accounts) {
      // Demo accounts made before the sign-up type was recorded: put each on its own screen.
      let repaired = 0;
      for (const [local, signupRole] of Object.entries(SIGNUP_ROLE_OF)) {
        const { count } = await db.user.updateMany({
          where: { email: `${local}@${DEMO_DOMAIN}`, signupRole: { not: signupRole } },
          data: { signupRole },
        });
        repaired += count;
      }
      console.log(
        repaired > 0
          ? `Demo data already present — corrected ${repaired} account types.`
          : 'Demo data already present — nothing to do.',
      );
      return;
    }
    console.log(`✓ ${accounts.length} demo accounts, password: ${DEMO_PASSWORD}`);
    for (const a of accounts) console.log(`  ${a.email}  ${a.role}`);
  } finally {
    await db.$disconnect();
  }
}
