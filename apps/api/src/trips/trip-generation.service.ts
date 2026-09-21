import { Injectable } from '@nestjs/common';
import { isoWeekday, localDate, zonedTimeToUtc } from '@wusool/shared';
import { PrismaService } from '../database/prisma.service';

/** A lazy "today" generation is not repeated for this long; the nightly job and admins force it. */
const LAZY_TTL_MS = 60_000;

/**
 * Creates a day's trips from routes (PLAN §6.1, §12 `daily-trip-generation`). Idempotent — one
 * trip per route and date — so it can run from the nightly job and also lazily whenever a driver
 * opens "today", which means a missed job never leaves a driver without a trip.
 *
 * Concurrency (found by the load test: 200 drivers opening the app together): calls for the same
 * organisation and date share one run inside a process, and a PostgreSQL advisory lock
 * serialises runs across API instances, so generators never race on the unique key.
 * Runs as the system role with explicit organisation filters.
 */
@Injectable()
export class TripGenerationService {
  private readonly inFlight = new Map<string, Promise<{ created: number }>>();
  private readonly recent = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  /** Today's date in the organisation's timezone. */
  async today(orgId: string, now = new Date()): Promise<string> {
    const org = await this.prisma.system.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { timezone: true },
    });
    return localDate(now, org.timezone);
  }

  /** Lazy path for drivers: skipped if this process generated the same day moments ago. */
  async ensureGenerated(orgId: string, date: string): Promise<void> {
    const key = `${orgId}:${date}`;
    const last = this.recent.get(key);
    if (last && Date.now() - last < LAZY_TTL_MS) return;
    await this.generateForOrg(orgId, date);
  }

  /** Routes changed: the next "today" must look again instead of trusting the recent run. */
  invalidate(orgId: string): void {
    for (const key of this.recent.keys()) if (key.startsWith(`${orgId}:`)) this.recent.delete(key);
  }

  generateForOrg(orgId: string, date: string): Promise<{ created: number }> {
    const key = `${orgId}:${date}`;
    const running = this.inFlight.get(key);
    if (running) return running;
    const run = this.generate(orgId, date)
      .then((r) => {
        this.recent.set(key, Date.now());
        return r;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, run);
    return run;
  }

  private async generate(orgId: string, date: string): Promise<{ created: number }> {
    const org = await this.prisma.system.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { timezone: true, status: true, deletedAt: true },
    });
    if (org.status === 'suspended' || org.deletedAt) return { created: 0 };

    const weekday = isoWeekday(date);
    const serviceDate = new Date(`${date}T00:00:00Z`);
    // Longer timeout: the first run of a large organisation creates many trips at once.
    return this.prisma.system.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`trip-generation:${orgId}:${date}`}))`;
        const routes = await tx.route.findMany({
          where: {
            organizationId: orgId,
            status: 'active',
            deletedAt: null,
            daysOfWeek: { has: weekday },
            defaultVehicleId: { not: null },
            defaultDriverId: { not: null },
            trips: { none: { serviceDate } },
          },
          select: {
            id: true,
            direction: true,
            plannedStart: true,
            plannedEnd: true,
            defaultVehicleId: true,
            defaultDriverId: true,
            students: {
              where: {
                activeFrom: { lte: serviceDate },
                OR: [{ activeTo: null }, { activeTo: { gt: serviceDate } }],
                student: {
                  deletedAt: null,
                  orgStudents: { some: { organizationId: orgId, status: 'active' } },
                },
              },
              select: { studentId: true, stopId: true, stop: { select: { sequence: true } } },
            },
          },
        });
        for (const route of routes) {
          await tx.trip.create({
            data: {
              organizationId: orgId,
              routeId: route.id,
              vehicleId: route.defaultVehicleId!,
              driverId: route.defaultDriverId!,
              direction: route.direction,
              serviceDate,
              plannedStartAt: zonedTimeToUtc(date, route.plannedStart, org.timezone),
              plannedEndAt: zonedTimeToUtc(date, route.plannedEnd, org.timezone),
              students: {
                create: route.students.map((s) => ({
                  organizationId: orgId,
                  studentId: s.studentId,
                  stopId: s.stopId,
                  stopSequence: s.stop.sequence,
                })),
              },
            },
          });
        }
        return { created: routes.length };
      },
      { maxWait: 30_000, timeout: 120_000 },
    );
  }
}
