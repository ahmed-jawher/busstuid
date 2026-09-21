import { HttpStatus, Injectable } from '@nestjs/common';
import { COUNTRY_DEFAULTS, type RESOLUTION_REASONS } from '@wusool/shared';
import { ApiError, Errors } from '../common/api-error';
import { SideEffects } from '../common/side-effects';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { loadTripFor } from '../trips/trip-access';

type Reason = (typeof RESOLUTION_REASONS)[number];

/** Reasons that mean the child did get off: a corrective "alight" is recorded (PLAN §7). */
const MEANS_ALIGHTED: readonly Reason[] = [
  'found_on_vehicle_and_alighted',
  'alighted_earlier_unrecorded',
  'picked_up_by_guardian',
];

const ALERT_SELECT = {
  id: true,
  tripId: true,
  studentId: true,
  type: true,
  severity: true,
  status: true,
  escalationLevel: true,
  openedAt: true,
  acknowledgedAt: true,
  resolvedAt: true,
  resolutionReason: true,
  resolutionNote: true,
  trip: {
    select: {
      direction: true,
      status: true,
      driverId: true,
      vehicle: { select: { plateNumber: true } },
      route: { select: { name: true } },
    },
  },
} as const;

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly effects: SideEffects,
  ) {}

  /** Organisation view (admin dashboard). */
  listForOrg(userId: string, orgId: string, status?: 'open' | 'acknowledged' | 'resolved') {
    return this.prisma.withContext({ userId, orgId }, (tx) =>
      tx.alert.findMany({
        where: status ? { status } : { status: { in: ['open', 'acknowledged'] } },
        orderBy: [{ severity: 'desc' }, { openedAt: 'desc' }],
        take: 200,
        select: ALERT_SELECT,
      }),
    );
  }

  /**
   * Alerts that concern the caller personally: their children's (under RLS as a guardian) and
   * those on trips they drive.
   */
  async listMine(userId: string) {
    const asGuardian = await this.prisma.withContext({ userId }, (tx) =>
      tx.alert.findMany({
        where: { status: { in: ['open', 'acknowledged'] } },
        orderBy: { openedAt: 'desc' },
        select: {
          id: true,
          studentId: true,
          type: true,
          severity: true,
          status: true,
          openedAt: true,
          escalationLevel: true,
        },
      }),
    );
    const asDriver = await this.prisma.system.alert.findMany({
      where: { status: { in: ['open', 'acknowledged'] }, trip: { driverId: userId } },
      orderBy: { openedAt: 'desc' },
      select: ALERT_SELECT,
    });
    return { asGuardian, asDriver };
  }

  /**
   * Full-screen alert for a guardian (PLAN §13): their child, the vehicle, the driver's phone
   * for a free `tel:` call, and the emergency number. Visibility is decided by RLS as the
   * guardian; only then is the driver's phone read.
   */
  async getForGuardian(userId: string, alertId: string) {
    const alert = await this.prisma.withContext({ userId }, (tx) =>
      tx.alert.findFirst({
        where: { id: alertId },
        select: {
          id: true,
          type: true,
          severity: true,
          status: true,
          openedAt: true,
          resolvedAt: true,
          escalationLevel: true,
          studentId: true,
          tripId: true,
        },
      }),
    );
    if (!alert || !alert.studentId) throw Errors.notFound();
    const info = await this.prisma.system.trip.findUniqueOrThrow({
      where: { id: alert.tripId },
      select: {
        vehicle: { select: { plateNumber: true } },
        organization: { select: { nameAr: true, nameEn: true, country: true } },
        driverId: true,
      },
    });
    const [driver, student] = await Promise.all([
      this.prisma.system.user.findUnique({
        where: { id: info.driverId },
        select: { fullNameAr: true, fullNameEn: true, phoneE164: true },
      }),
      this.prisma.system.student.findUniqueOrThrow({
        where: { id: alert.studentId },
        select: { fullNameAr: true, fullNameEn: true },
      }),
    ]);
    return {
      ...alert,
      student,
      vehicle: info.vehicle,
      organization: { nameAr: info.organization.nameAr, nameEn: info.organization.nameEn },
      driver: driver ? { ...driver, phoneVerified: false } : null,
      emergencyNumber: COUNTRY_DEFAULTS[info.organization.country].emergencyNumber,
    };
  }

  async get(userId: string, alertId: string) {
    const alert = await this.prisma.system.alert.findUnique({
      where: { id: alertId },
      select: { tripId: true },
    });
    if (!alert) throw Errors.notFound();
    const ref = await loadTripFor(this.prisma, userId, alert.tripId, 'operate');
    return this.prisma.withContext({ userId, orgId: ref.organizationId }, (tx) =>
      tx.alert.findUniqueOrThrow({
        where: { id: alertId },
        select: {
          ...ALERT_SELECT,
          events: {
            orderBy: { createdAt: 'asc' },
            select: { action: true, actorUserId: true, payload: true, createdAt: true },
          },
        },
      }),
    );
  }

  /** Records that someone is handling it. Reminders keep coming until it is resolved. */
  async acknowledge(userId: string, alertId: string) {
    const { orgId } = await this.authorize(userId, alertId);
    return this.prisma.withContext({ userId, orgId }, async (tx) => {
      const updated = await tx.alert.updateMany({
        where: { id: alertId, status: 'open' },
        data: { status: 'acknowledged', acknowledgedAt: new Date(), acknowledgedBy: userId },
      });
      if (updated.count === 0) throw Errors.conflict('alert_not_open');
      await tx.alertEvent.create({
        data: { organizationId: orgId, alertId, action: 'acknowledged', actorUserId: userId },
      });
      return tx.alert.findUniqueOrThrow({ where: { id: alertId }, select: ALERT_SELECT });
    });
  }

  /**
   * Closes an alert — only a documented human action by the driver or an org admin, with a
   * reason (PLAN §3.3, §7). Guardians are never asked to do anything.
   */
  async resolve(userId: string, alertId: string, reason: Reason, note?: string) {
    const { orgId } = await this.authorize(userId, alertId);
    const result = await this.prisma.withContext({ userId, orgId }, async (tx) => {
      const rows = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM alerts WHERE id = ${alertId}::uuid FOR UPDATE`;
      if (!rows[0]) throw Errors.notFound();
      if (rows[0].status === 'resolved') throw Errors.conflict('alert_already_resolved');
      const alert = await tx.alert.findUniqueOrThrow({
        where: { id: alertId },
        select: { type: true, tripId: true, studentId: true, trip: { select: { status: true } } },
      });

      // An overdue trip cannot be "resolved" while the records still show a child on board.
      if (alert.type === 'trip_overdue' || alert.type === 'driver_device_silent') {
        const onboard = await tx.tripStudent.count({
          where: { tripId: alert.tripId, status: 'boarded' },
        });
        if (onboard > 0) {
          throw new ApiError(HttpStatus.CONFLICT, 'students_still_onboard', undefined, {
            count: onboard,
          });
        }
      }

      const now = new Date();
      if (alert.type === 'student_left_onboard' && alert.studentId) {
        if (MEANS_ALIGHTED.includes(reason)) {
          // Corrective event: nothing is edited, a new "alight" is appended (PLAN §3.2, §7).
          await tx.tripEvent.create({
            data: {
              organizationId: orgId,
              tripId: alert.tripId,
              studentId: alert.studentId,
              eventType: 'alight',
              recordedBy: userId,
              clientEventId: `resolution:${alertId}`,
              clientRecordedAt: now,
            },
          });
        }
        await tx.tripStudent.update({
          where: { tripId_studentId: { tripId: alert.tripId, studentId: alert.studentId } },
          data: {
            status: 'resolved',
            ...(MEANS_ALIGHTED.includes(reason) ? { alightedAt: now } : {}),
          },
        });
      }

      await tx.alert.update({
        where: { id: alertId },
        data: {
          status: 'resolved',
          resolvedAt: now,
          resolvedBy: userId,
          resolutionReason: reason,
          resolutionNote: note ?? null,
          // Stops escalation immediately (PLAN §16 test 8).
          nextEscalationAt: null,
        },
      });
      await tx.alertEvent.create({
        data: {
          organizationId: orgId,
          alertId,
          action: 'resolved',
          actorUserId: userId,
          payload: { reason, note: note ?? null },
        },
      });
      return { studentId: alert.type === 'student_left_onboard' ? alert.studentId : null };
    });

    if (result.studentId) {
      const studentId = result.studentId;
      this.effects.run('reassure guardians', () => this.reassureGuardians(alertId, studentId));
    }
    return this.prisma.system.alert.findUniqueOrThrow({
      where: { id: alertId },
      select: ALERT_SELECT,
    });
  }

  /** "تم التأكد من سلامة {student}" to every guardian (PLAN §7). */
  private async reassureGuardians(alertId: string, studentId: string) {
    const ids = await this.prisma.systemTx(async (tx) => {
      const student = await tx.student.findUniqueOrThrow({
        where: { id: studentId },
        select: {
          fullNameAr: true,
          fullNameEn: true,
          guardians: { select: { guardianUserId: true } },
        },
      });
      return this.notifications.createInTx(
        tx,
        student.guardians.map((g) => ({
          userId: g.guardianUserId,
          template: 'resolved' as const,
          priority: 'high' as const,
          alertId,
          payload: {
            student: { ar: student.fullNameAr, en: student.fullNameEn },
            url: `/child/${studentId}`,
            tag: `alert-${alertId}`,
          },
        })),
      );
    });
    await this.notifications.dispatch(ids);
  }

  private async authorize(userId: string, alertId: string): Promise<{ orgId: string }> {
    const alert = await this.prisma.system.alert.findUnique({
      where: { id: alertId },
      select: { tripId: true },
    });
    if (!alert) throw Errors.notFound();
    // Same rule as ending a trip: the trip's driver or an org admin; everyone else gets 404.
    const ref = await loadTripFor(this.prisma, userId, alert.tripId, 'end');
    return { orgId: ref.organizationId };
  }
}
