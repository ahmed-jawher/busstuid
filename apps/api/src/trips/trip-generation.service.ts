import { Injectable } from '@nestjs/common';
import { isoWeekday, localDate, zonedTimeToUtc } from '@wusool/shared';
import { PrismaService } from '../database/prisma.service';

/**
 * Creates a day's trips from routes (PLAN §6.1, §12 `daily-trip-generation`). Idempotent — one
 * trip per route and date — so it can run from the nightly job and also lazily whenever a driver
 * opens "today", which means a missed job never leaves a driver without a trip.
 * Runs as the system role with explicit organisation filters.
 */
@Injectable()
export class TripGenerationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Today's date in the organisation's timezone. */
  async today(orgId: string, now = new Date()): Promise<string> {
    const org = await this.prisma.system.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { timezone: true },
    });
    return localDate(now, org.timezone);
  }

  async generateForOrg(orgId: string, date: string): Promise<{ created: number }> {
    const org = await this.prisma.system.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { timezone: true, status: true, deletedAt: true },
    });
    if (org.status === 'suspended' || org.deletedAt) return { created: 0 };

    const weekday = isoWeekday(date);
    const serviceDate = new Date(`${date}T00:00:00Z`);
    const routes = await this.prisma.system.route.findMany({
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

    let created = 0;
    for (const route of routes) {
      await this.prisma.systemTx(async (tx) => {
        // A concurrent generator may have won the race; the (route, date) unique key decides.
        const exists = await tx.trip.findUnique({
          where: { routeId_serviceDate: { routeId: route.id, serviceDate } },
          select: { id: true },
        });
        if (exists) return;
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
        created++;
      });
    }
    return { created };
  }
}
