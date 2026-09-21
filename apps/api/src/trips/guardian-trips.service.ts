import { Injectable } from '@nestjs/common';
import { COUNTRY_DEFAULTS, localDate } from '@wusool/shared';
import { Errors } from '../common/api-error';
import { PrismaService, type Tx } from '../database/prisma.service';

const TRIP_ROW = {
  status: true,
  isUnexpected: true,
  boardedAt: true,
  alightedAt: true,
  stop: { select: { name: true } },
  trip: {
    select: {
      id: true,
      direction: true,
      status: true,
      serviceDate: true,
      plannedStartAt: true,
      plannedEndAt: true,
      startedAt: true,
      endedAt: true,
      vehicle: { select: { plateNumber: true, type: true } },
      organization: { select: { nameAr: true, nameEn: true } },
    },
  },
} as const;

/**
 * Read-only views for guardians (PLAN §5 step 5, §13): where the child is now and their recent
 * trips. Everything runs under RLS as the guardian, so only their own children are visible.
 */
@Injectable()
export class GuardianTripsService {
  constructor(private readonly prisma: PrismaService) {}

  async today(guardianId: string, studentId: string) {
    // Candidate "today" dates across supported countries' timezones.
    const dates = [
      ...new Set(Object.values(COUNTRY_DEFAULTS).map((c) => localDate(new Date(), c.timezone))),
    ].map((d) => new Date(`${d}T00:00:00Z`));
    return this.prisma.withContext({ userId: guardianId }, async (tx) => {
      await assertGuardian(tx, guardianId, studentId);
      const rows = await tx.tripStudent.findMany({
        where: { studentId, trip: { serviceDate: { in: dates }, status: { not: 'cancelled' } } },
        select: TRIP_ROW,
        orderBy: { trip: { plannedStartAt: 'asc' } },
      });
      return rows.map(flatten);
    });
  }

  async history(guardianId: string, studentId: string, days: number) {
    const since = new Date(Date.now() - days * 24 * 3_600_000);
    return this.prisma.withContext({ userId: guardianId }, async (tx) => {
      await assertGuardian(tx, guardianId, studentId);
      const rows = await tx.tripStudent.findMany({
        where: {
          studentId,
          trip: { plannedStartAt: { gte: since }, status: { not: 'cancelled' } },
        },
        select: TRIP_ROW,
        orderBy: { trip: { plannedStartAt: 'desc' } },
        take: 200,
      });
      return rows.map(flatten);
    });
  }
}

async function assertGuardian(tx: Tx, guardianId: string, studentId: string) {
  const link = await tx.studentGuardian.findFirst({
    where: { studentId, guardianUserId: guardianId, student: { deletedAt: null } },
  });
  if (!link) throw Errors.notFound();
}

function flatten(row: {
  status: string;
  isUnexpected: boolean;
  boardedAt: Date | null;
  alightedAt: Date | null;
  stop: { name: string } | null;
  trip: Record<string, unknown>;
}) {
  const { trip, stop, ...student } = row;
  return {
    ...trip,
    studentStatus: student.status,
    isUnexpected: student.isUnexpected,
    boardedAt: student.boardedAt,
    alightedAt: student.alightedAt,
    stopName: stop?.name ?? null,
  };
}
