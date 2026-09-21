// PLAN §16 test 10: a user of organisation A never sees organisation B's data — enforced by the
// database itself, not only by API code. Also: append-only tables really are append-only.
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createTestDatabase, type TestDatabase } from './helpers/database';

describe('Row Level Security (database level)', () => {
  let db: TestDatabase;
  let app: PrismaClient;
  let system: PrismaClient;
  const ids = {
    orgA: randomUUID(),
    orgB: randomUUID(),
    adminA: randomUUID(),
    guardian: randomUUID(),
    stranger: randomUUID(),
    student: randomUUID(),
    vehicleA: randomUUID(),
    vehicleB: randomUUID(),
    tripB: randomUUID(),
  };

  /** Runs `fn` as wusool_app with the given RLS context, like the API does. */
  const as = <T>(ctx: { user: string; org?: string }, fn: (tx: PrismaClient) => Promise<T>) =>
    app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${ctx.user}, true),
                                  set_config('app.current_org_id', ${ctx.org ?? ''}, true)`;
      return fn(tx as unknown as PrismaClient);
    });

  beforeAll(async () => {
    db = await createTestDatabase();
    app = new PrismaClient({ datasourceUrl: db.appUrl });
    system = new PrismaClient({ datasourceUrl: db.systemUrl });
    const a = db.admin;
    for (const [id, name] of [
      [ids.orgA, 'A'],
      [ids.orgB, 'B'],
    ] as const) {
      await a.organization.create({
        data: {
          id,
          type: 'school',
          nameAr: `منظمة ${name}`,
          country: 'BH',
          timezone: 'Asia/Bahrain',
          status: 'active',
        },
      });
    }
    for (const id of [ids.adminA, ids.guardian, ids.stranger]) {
      await a.user.create({
        data: {
          id,
          email: `${id}@example.com`,
          phoneE164: '+97336000000',
          fullNameAr: 'اختبار',
          passwordHash: 'x',
          emailVerifiedAt: new Date(),
        },
      });
    }
    await a.membership.create({
      data: { userId: ids.adminA, organizationId: ids.orgA, role: 'org_admin' },
    });
    await a.vehicle.createMany({
      data: [
        {
          id: ids.vehicleA,
          organizationId: ids.orgA,
          plateNumber: 'A-1',
          type: 'bus',
          capacity: 30,
        },
        {
          id: ids.vehicleB,
          organizationId: ids.orgB,
          plateNumber: 'B-1',
          type: 'bus',
          capacity: 30,
        },
      ],
    });
    await a.student.create({
      data: {
        id: ids.student,
        createdByGuardianId: ids.guardian,
        fullNameAr: 'طالب',
        dateOfBirth: new Date('2016-01-01'),
        schoolName: 'مدرسة',
        guardians: {
          create: { guardianUserId: ids.guardian, relationship: 'mother', isPrimary: true },
        },
      },
    });
    // Student is enrolled in B only.
    await a.orgStudent.create({ data: { organizationId: ids.orgB, studentId: ids.student } });
    await a.trip.create({
      data: {
        id: ids.tripB,
        organizationId: ids.orgB,
        vehicleId: ids.vehicleB,
        driverId: ids.stranger,
        direction: 'to_school',
        serviceDate: new Date('2026-09-21'),
        plannedStartAt: new Date('2026-09-21T03:30:00Z'),
        plannedEndAt: new Date('2026-09-21T04:30:00Z'),
        students: { create: { organizationId: ids.orgB, studentId: ids.student } },
      },
    });
  });

  afterAll(async () => {
    await Promise.all([app?.$disconnect(), system?.$disconnect()]);
    await db?.drop();
  });

  it('shows organisation A only its own rows', async () => {
    const vehicles = await as({ user: ids.adminA, org: ids.orgA }, (tx) => tx.vehicle.findMany());
    expect(vehicles.map((v) => v.id)).toEqual([ids.vehicleA]);
    const trips = await as({ user: ids.adminA, org: ids.orgA }, (tx) => tx.trip.findMany());
    expect(trips).toEqual([]);
  });

  it('hides students that are not enrolled in the current organisation', async () => {
    const students = await as({ user: ids.adminA, org: ids.orgA }, (tx) => tx.student.findMany());
    expect(students).toEqual([]);
    const photos = await as({ user: ids.adminA, org: ids.orgA }, (tx) =>
      tx.studentPhoto.findMany(),
    );
    expect(photos).toEqual([]);
  });

  it('refuses to write rows into another organisation', async () => {
    await expect(
      as({ user: ids.adminA, org: ids.orgA }, (tx) =>
        tx.vehicle.create({
          data: { organizationId: ids.orgB, plateNumber: 'X', type: 'car', capacity: 4 },
        }),
      ),
    ).rejects.toThrow(/row-level security/i);
    const updated = await as({ user: ids.adminA, org: ids.orgA }, (tx) =>
      tx.vehicle.updateMany({ where: { id: ids.vehicleB }, data: { plateNumber: 'hijacked' } }),
    );
    expect(updated.count).toBe(0);
  });

  it('shows nothing when no context is set', async () => {
    expect(await app.vehicle.findMany()).toEqual([]);
    expect(await app.student.findMany()).toEqual([]);
    expect(await app.user.findMany()).toEqual([]);
  });

  it("lets a guardian read their own child's trip, and nothing else", async () => {
    const guardianTrips = await as({ user: ids.guardian }, (tx) => tx.trip.findMany());
    expect(guardianTrips.map((t) => t.id)).toEqual([ids.tripB]);
    const strangerTrips = await as({ user: ids.stranger }, (tx) => tx.trip.findMany());
    expect(strangerTrips).toEqual([]);
    const strangerStudents = await as({ user: ids.stranger }, (tx) => tx.student.findMany());
    expect(strangerStudents).toEqual([]);
  });

  it('keeps sign-in tables away from the request role', async () => {
    await db.admin.refreshToken.create({
      data: {
        userId: ids.adminA,
        tokenHash: 'h',
        familyId: randomUUID(),
        expiresAt: new Date(Date.now() + 1e6),
      },
    });
    const tokens = await as({ user: ids.adminA, org: ids.orgA }, (tx) =>
      tx.refreshToken.findMany(),
    );
    expect(tokens).toEqual([]);
    expect(await system.refreshToken.count()).toBe(1);
  });

  it('makes trip events append-only, even for the system role (PLAN §3.2)', async () => {
    const event = await db.admin.tripEvent.create({
      data: {
        organizationId: ids.orgB,
        tripId: ids.tripB,
        studentId: ids.student,
        eventType: 'board',
        recordedBy: ids.stranger,
        clientEventId: randomUUID(),
        clientRecordedAt: new Date(),
      },
    });
    await expect(
      system.tripEvent.update({ where: { id: event.id }, data: { eventType: 'alight' } }),
    ).rejects.toThrow();
    await expect(system.tripEvent.delete({ where: { id: event.id } })).rejects.toThrow();
    // Even the superuser is stopped by the trigger.
    await expect(
      db.admin.tripEvent.update({ where: { id: event.id }, data: { eventType: 'alight' } }),
    ).rejects.toThrow(/append-only/);
    await expect(db.admin.$executeRawUnsafe('TRUNCATE trip_events')).rejects.toThrow(/append-only/);
  });

  it('allows only one active trip per vehicle (PLAN §6.1)', async () => {
    const base = {
      organizationId: ids.orgB,
      vehicleId: ids.vehicleB,
      driverId: ids.stranger,
      direction: 'to_home' as const,
      plannedStartAt: new Date(),
      plannedEndAt: new Date(),
      status: 'in_progress' as const,
    };
    await db.admin.trip.create({ data: { ...base, serviceDate: new Date('2026-09-22') } });
    await expect(
      db.admin.trip.create({ data: { ...base, serviceDate: new Date('2026-09-23') } }),
    ).rejects.toThrow();
  });
});
