// Development seed (PLAN §17 phase 1): a school, an independent driver, 3 vehicles, routes with
// stops, 40 students with placeholder photos, and their guardians. All names, emails and phone
// numbers are fictional; emails use the reserved example.com domain.
//
// Idempotent: does nothing if the seed platform admin already exists.
import { PrismaClient, type TripDirection } from '@prisma/client';
import { COUNTRY_DEFAULTS, PRIVACY_POLICY_VERSION } from '@wusool/shared';
import sharp from 'sharp';
import { hashPassword } from '../src/auth/passwords';
import { processStudentPhoto } from '../src/students/photos';

export const SEED_PASSWORD = 'Wusool-Dev-Seed-2026';
const PLATFORM_EMAIL = 'platform.admin@example.com';

const BOYS = [
  ['محمد', 'Mohammed'],
  ['أحمد', 'Ahmed'],
  ['يوسف', 'Yousif'],
  ['علي', 'Ali'],
  ['حمد', 'Hamad'],
  ['عبدالله', 'Abdulla'],
  ['سلمان', 'Salman'],
  ['خالد', 'Khalid'],
  ['عيسى', 'Isa'],
  ['راشد', 'Rashid'],
  ['فيصل', 'Faisal'],
  ['جاسم', 'Jassim'],
  ['سعود', 'Saud'],
  ['مبارك', 'Mubarak'],
  ['ناصر', 'Nasser'],
  ['عمر', 'Omar'],
  ['إبراهيم', 'Ibrahim'],
  ['حسن', 'Hasan'],
  ['زياد', 'Ziyad'],
  ['مالك', 'Malik'],
] as const;
const GIRLS = [
  ['فاطمة', 'Fatima'],
  ['مريم', 'Maryam'],
  ['نورة', 'Noora'],
  ['سارة', 'Sara'],
  ['ليان', 'Layan'],
  ['حصة', 'Hessa'],
  ['شيخة', 'Shaikha'],
  ['دانة', 'Dana'],
  ['ريم', 'Reem'],
  ['لطيفة', 'Latifa'],
  ['جود', 'Joud'],
  ['آمنة', 'Amna'],
  ['روان', 'Rawan'],
  ['هيا', 'Haya'],
  ['العنود', 'Alanoud'],
  ['منيرة', 'Munira'],
  ['زينب', 'Zainab'],
  ['عائشة', 'Aisha'],
  ['غلا', 'Ghala'],
  ['تالا', 'Tala'],
] as const;
const FAMILIES = [
  ['الأنصاري', 'Alansari'],
  ['البوعينين', 'Albuainain'],
  ['السيد', 'Alsayed'],
  ['الكوهجي', 'Alkoohaji'],
  ['المناعي', 'Almannai'],
  ['الدوسري', 'Aldosari'],
  ['النعيمي', 'Alnaimi'],
  ['الشيخ', 'Alshaikh'],
  ['العلوي', 'Alalawi'],
  ['الجودر', 'Aljowder'],
  ['البنعلي', 'Albinali'],
  ['الحداد', 'Alhaddad'],
  ['المحميد', 'Almahmeed'],
  ['الرميحي', 'Alromaihi'],
  ['القطان', 'Alqattan'],
  ['الزياني', 'Alzayani'],
] as const;

const COLORS = [
  '#1b8354',
  '#1d4ed8',
  '#9333ea',
  '#b45309',
  '#0f766e',
  '#be123c',
  '#4d7c0f',
  '#6d28d9',
];

let phoneSeq = 0;
/** Fictional Bahraini mobile numbers: +973 3 999 xxxx. */
const nextPhone = () => `+9733999${String(phoneSeq++).padStart(4, '0')}`;

async function placeholderPhoto(initial: string, color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
    <rect width="400" height="400" fill="${color}"/>
    <circle cx="200" cy="160" r="80" fill="#ffffff" fill-opacity="0.9"/>
    <rect x="80" y="260" width="240" height="160" rx="120" fill="#ffffff" fill-opacity="0.9"/>
    <text x="200" y="190" font-size="90" text-anchor="middle" font-family="Tahoma, sans-serif" fill="${color}">${initial}</text>
  </svg>`;
  return processStudentPhoto(await sharp(Buffer.from(svg)).png().toBuffer());
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error('DATABASE_ADMIN_URL is required (run through `pnpm db:seed`).');
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    if (await db.user.findUnique({ where: { email: PLATFORM_EMAIL } })) {
      console.log('Seed data already present — nothing to do.');
      return;
    }
    const passwordHash = await hashPassword(SEED_PASSWORD);
    const now = new Date();
    const user = (email: string, ar: string, en: string, extra: object = {}) =>
      db.user.create({
        data: {
          email,
          fullNameAr: ar,
          fullNameEn: en,
          phoneE164: nextPhone(),
          passwordHash,
          emailVerifiedAt: now,
          ...extra,
        },
      });
    const bh = COUNTRY_DEFAULTS.BH;

    await user(PLATFORM_EMAIL, 'مشغّل المنصة', 'Platform Operator', { isPlatformAdmin: true });

    // ── School with its own fleet ──
    const school = await db.organization.create({
      data: {
        type: 'school',
        nameAr: 'مدرسة الرواد النموذجية',
        nameEn: 'Al Rowad Model School',
        nameKeyAr: 'مدرسة الرواد النموذجية',
        nameKeyEn: 'al rowad model school',
        country: 'BH',
        timezone: bh.timezone,
        status: 'active',
      },
    });
    const schoolAdmin = await user('school.admin@example.com', 'منى الحداد', 'Mona Alhaddad');
    const driver1 = await user('driver.one@example.com', 'جاسم الدوسري', 'Jassim Aldosari');
    const driver2 = await user('driver.two@example.com', 'سلمان النعيمي', 'Salman Alnaimi');
    const attendant = await user('attendant@example.com', 'ليلى العلوي', 'Layla Alalawi');
    await db.membership.createMany({
      data: [
        { userId: schoolAdmin.id, organizationId: school.id, role: 'org_admin' },
        { userId: driver1.id, organizationId: school.id, role: 'driver' },
        { userId: driver2.id, organizationId: school.id, role: 'driver' },
        { userId: attendant.id, organizationId: school.id, role: 'attendant' },
      ],
    });
    const bus1 = await db.vehicle.create({
      data: { organizationId: school.id, plateNumber: 'B 10231', type: 'bus', capacity: 30 },
    });
    const bus2 = await db.vehicle.create({
      data: { organizationId: school.id, plateNumber: 'B 10232', type: 'bus', capacity: 30 },
    });

    // ── Independent driver (their own organisation) ──
    const independentDriver = await user(
      'independent.driver@example.com',
      'يوسف المناعي',
      'Yousif Almannai',
    );
    const independent = await db.organization.create({
      data: {
        type: 'independent_driver',
        nameAr: 'نقل أبو يوسف',
        nameEn: 'Abu Yousif Transport',
        nameKeyAr: 'نقل أبو يوسف',
        nameKeyEn: 'abu yousif transport',
        country: 'BH',
        timezone: bh.timezone,
        status: 'active',
      },
    });
    await db.membership.createMany({
      data: [
        { userId: independentDriver.id, organizationId: independent.id, role: 'org_admin' },
        { userId: independentDriver.id, organizationId: independent.id, role: 'driver' },
      ],
    });
    const van = await db.vehicle.create({
      data: { organizationId: independent.id, plateNumber: 'T 55810', type: 'van', capacity: 10 },
    });

    // ── Routes: a morning and an afternoon run for each vehicle, Sunday–Thursday ──
    const schoolDays = [7, 1, 2, 3, 4];
    const stopsFor = (area: string, base: [number, number]) =>
      [0, 1, 2, 3].map((i) => ({
        name: `${area} — محطة ${i + 1}`,
        lat: (base[0] + i * 0.004).toFixed(6),
        lng: (base[1] + i * 0.003).toFixed(6),
      }));
    const lines = [
      {
        org: school.id,
        vehicle: bus1.id,
        driver: driver1.id,
        name: 'خط الرفاع',
        stops: stopsFor('الرفاع', [26.13, 50.555]),
      },
      {
        org: school.id,
        vehicle: bus2.id,
        driver: driver2.id,
        name: 'خط مدينة عيسى',
        stops: stopsFor('مدينة عيسى', [26.173, 50.547]),
      },
      {
        org: independent.id,
        vehicle: van.id,
        driver: independentDriver.id,
        name: 'خط المحرق',
        stops: stopsFor('المحرق', [26.257, 50.611]),
      },
    ];

    const students: { id: string; line: number }[] = [];
    let guardianIndex = 0;
    let studentIndex = 0;
    // 16 + 16 + 8 = 40 students; every third guardian has two children.
    for (const [lineIndex, count] of [
      [0, 16],
      [1, 16],
      [2, 8],
    ] as const) {
      let remaining: number = count;
      while (remaining > 0) {
        const family = FAMILIES[guardianIndex % FAMILIES.length]!;
        const kids = guardianIndex % 3 === 0 && remaining >= 2 ? 2 : 1;
        const mother = GIRLS[(guardianIndex + 7) % GIRLS.length]!;
        const guardian = await user(
          `guardian${String(guardianIndex + 1).padStart(2, '0')}@example.com`,
          `${mother[0]} ${family[0]}`,
          `${mother[1]} ${family[1]}`,
        );
        guardianIndex++;
        for (let k = 0; k < kids; k++) {
          const girl = studentIndex % 2 === 0;
          const first = (girl ? GIRLS : BOYS)[Math.floor(studentIndex / 2) % 20]!;
          const orgId = lines[lineIndex]!.org;
          const photo = await placeholderPhoto(first[0][0]!, COLORS[studentIndex % COLORS.length]!);
          const student = await db.student.create({
            data: {
              createdByGuardianId: guardian.id,
              fullNameAr: `${first[0]} ${family[0]}`,
              fullNameEn: `${first[1]} ${family[1]}`,
              dateOfBirth: new Date(
                Date.UTC(2013 + (studentIndex % 8), studentIndex % 12, 1 + (studentIndex % 27)),
              ),
              schoolName: 'مدرسة الرواد النموذجية',
              photoVersion: 1,
              guardians: {
                create: { guardianUserId: guardian.id, relationship: 'mother', isPrimary: true },
              },
              consents: {
                create: {
                  guardianUserId: guardian.id,
                  purpose: 'transport_safety',
                  policyVersion: PRIVACY_POLICY_VERSION,
                },
              },
              photo: { create: photo },
              enrollmentRequests: {
                create: {
                  organizationId: orgId,
                  requestedBy: guardian.id,
                  status: 'approved',
                  decidedAt: now,
                  decidedBy: lineIndex === 2 ? independentDriver.id : schoolAdmin.id,
                },
              },
              orgStudents: { create: { organizationId: orgId } },
            },
          });
          students.push({ id: student.id, line: lineIndex });
          studentIndex++;
          remaining--;
        }
      }
    }

    // One pending request so the admin queue is not empty.
    const newcomerGuardian = await user('guardian.new@example.com', 'هيا القطان', 'Haya Alqattan');
    const newcomerPhoto = await placeholderPhoto('ع', '#0f766e');
    await db.student.create({
      data: {
        createdByGuardianId: newcomerGuardian.id,
        fullNameAr: 'عمر القطان',
        fullNameEn: 'Omar Alqattan',
        dateOfBirth: new Date(Date.UTC(2017, 4, 9)),
        schoolName: 'مدرسة الرواد النموذجية',
        photoVersion: 1,
        guardians: {
          create: { guardianUserId: newcomerGuardian.id, relationship: 'mother', isPrimary: true },
        },
        consents: {
          create: {
            guardianUserId: newcomerGuardian.id,
            purpose: 'transport_safety',
            policyVersion: PRIVACY_POLICY_VERSION,
          },
        },
        photo: { create: newcomerPhoto },
        enrollmentRequests: {
          create: { organizationId: school.id, requestedBy: newcomerGuardian.id },
        },
      },
    });

    const directions: { direction: TripDirection; start: string; end: string; label: string }[] = [
      { direction: 'to_school', start: '06:15', end: '07:15', label: 'صباحي' },
      { direction: 'to_home', start: '13:15', end: '14:15', label: 'عودة' },
    ];
    for (const [lineIndex, line] of lines.entries()) {
      for (const d of directions) {
        const route = await db.route.create({
          data: {
            organizationId: line.org,
            name: `${line.name} — ${d.label}`,
            direction: d.direction,
            defaultVehicleId: line.vehicle,
            defaultDriverId: line.driver,
            plannedStart: d.start,
            plannedEnd: d.end,
            daysOfWeek: schoolDays,
          },
        });
        const stops = [];
        for (const [sequence, stop] of line.stops.entries()) {
          stops.push(
            await db.routeStop.create({
              data: {
                organizationId: line.org,
                routeId: route.id,
                sequence: sequence + 1,
                ...stop,
              },
            }),
          );
        }
        const riders = students.filter((s) => s.line === lineIndex);
        await db.routeStudent.createMany({
          data: riders.map((s, i) => ({
            organizationId: line.org,
            routeId: route.id,
            studentId: s.id,
            stopId: stops[i % stops.length]!.id,
            activeFrom: new Date(Date.UTC(2026, 8, 1)),
          })),
        });
      }
    }

    console.log(`✓ Seeded ${students.length + 1} students, ${guardianIndex + 1} guardians, 2 organisations, 3 vehicles, 6 routes.

  Development sign-ins (password for all: ${SEED_PASSWORD})
    platform.admin@example.com       platform admin
    school.admin@example.com         school admin
    driver.one@example.com           school driver (bus B 10231)
    driver.two@example.com           school driver (bus B 10232)
    independent.driver@example.com   independent driver (van T 55810)
    guardian01@example.com           guardian (…guardian${String(guardianIndex).padStart(2, '0')})
`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
