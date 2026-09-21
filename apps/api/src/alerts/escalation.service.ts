import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { COUNTRY_DEFAULTS, type AlertSeverity, type AlertType, type Country } from '@wusool/shared';
import { PrismaService, type Tx } from '../database/prisma.service';
import {
  NotificationsService,
  type NotificationPayload,
  type NotificationRequest,
  type Priority,
} from '../notifications/notifications.service';

// PLAN §7 escalation, with no paid channels: repeat and widen.
export const REPEAT_MS = 2 * 60_000;
/** Minute 5: every guardian of the child and every admin. */
export const WIDEN_AFTER_MS = 5 * 60_000;
/** Minute 10: the emergency number is shown everywhere. */
export const EMERGENCY_AFTER_MS = 10 * 60_000;

const PRIORITY: Record<AlertSeverity, Priority> = {
  critical: 'critical',
  high: 'high',
  low: 'normal',
};

export function escalationLevel(openedAt: Date, now: Date): 0 | 1 | 2 {
  const elapsed = now.getTime() - openedAt.getTime();
  return elapsed >= EMERGENCY_AFTER_MS ? 2 : elapsed >= WIDEN_AFTER_MS ? 1 : 0;
}

interface DueAlert {
  id: string;
  organization_id: string;
  trip_id: string;
  student_id: string | null;
  type: AlertType;
  severity: AlertSeverity;
  escalation_level: number;
  opened_at: Date;
}

/**
 * Sends (and re-sends) alert notifications. Every open alert has a `next_escalation_at` in the
 * database; the minute job processes whatever is due, so escalation survives restarts
 * (PLAN §16 test 7) and stops as soon as the alert is resolved (test 8).
 */
@Injectable()
export class EscalationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Processes every due alert. Returns how many were processed. */
  async runDue(now = new Date()): Promise<number> {
    const due = await this.prisma.system.alert.findMany({
      where: { status: { in: ['open', 'acknowledged'] }, nextEscalationAt: { lte: now } },
      select: { id: true },
      orderBy: { nextEscalationAt: 'asc' },
      take: 200,
    });
    let processed = 0;
    for (const a of due) if (await this.processAlert(a.id, now)) processed++;
    return processed;
  }

  async processAlerts(ids: string[], now = new Date()): Promise<void> {
    for (const id of ids) await this.processAlert(id, now);
  }

  /**
   * Boot-time reconciliation (PLAN §12): an open high/critical alert must always have a next
   * escalation time. Anything missing one is made due immediately.
   */
  async reconcile(now = new Date()): Promise<number> {
    const res = await this.prisma.system.alert.updateMany({
      where: {
        status: { in: ['open', 'acknowledged'] },
        severity: { in: ['high', 'critical'] },
        nextEscalationAt: null,
      },
      data: { nextEscalationAt: now },
    });
    return res.count;
  }

  /** One escalation round for one alert; false if it was not due (or taken by another worker). */
  async processAlert(alertId: string, now = new Date()): Promise<boolean> {
    const deliveries = await this.prisma.systemTx(async (tx) => {
      const rows = await tx.$queryRaw<DueAlert[]>`
        SELECT id, organization_id, trip_id, student_id, type, severity, escalation_level, opened_at
          FROM alerts
         WHERE id = ${alertId}::uuid
           AND status IN ('open', 'acknowledged')
           AND next_escalation_at <= ${now}
         FOR UPDATE SKIP LOCKED`;
      const alert = rows[0];
      if (!alert) return null;

      const level = escalationLevel(alert.opened_at, now);
      const requests = await this.recipients(tx, alert, level, now);
      const ids = await this.notifications.createInTx(tx, requests);

      if (level > alert.escalation_level) {
        await tx.alertEvent.create({
          data: {
            organizationId: alert.organization_id,
            alertId: alert.id,
            action: 'escalated',
            payload: { from: alert.escalation_level, to: level },
          },
        });
      }
      await tx.alertEvent.create({
        data: {
          organizationId: alert.organization_id,
          alertId: alert.id,
          action: 'notified',
          payload: {
            level,
            recipients: [...new Set(requests.map((r) => r.userId))].length,
          } as Prisma.InputJsonValue,
        },
      });
      await tx.alert.update({
        where: { id: alert.id },
        data: {
          escalationLevel: Math.max(level, alert.escalation_level),
          // Low-severity alerts are informational: notify once, never repeat.
          nextEscalationAt: alert.severity === 'low' ? null : new Date(now.getTime() + REPEAT_MS),
        },
      });
      return ids;
    });
    if (deliveries === null) return false;
    await this.notifications.dispatch(deliveries);
    return true;
  }

  /** Who hears about an alert, per type and escalation level (PLAN §7 table). */
  private async recipients(
    tx: Tx,
    alert: DueAlert,
    level: 0 | 1 | 2,
    now: Date,
  ): Promise<NotificationRequest[]> {
    const trip = await tx.trip.findUniqueOrThrow({
      where: { id: alert.trip_id },
      select: {
        driverId: true,
        plannedEndAt: true,
        route: { select: { name: true } },
        vehicle: { select: { plateNumber: true } },
        organization: { select: { country: true } },
        students: {
          where: { status: 'boarded' },
          select: {
            studentId: true,
            student: {
              select: {
                fullNameAr: true,
                fullNameEn: true,
                guardians: { select: { guardianUserId: true, isPrimary: true } },
              },
            },
          },
        },
      },
    });
    const driver = await tx.user.findUnique({
      where: { id: trip.driverId },
      select: { phoneE164: true },
    });
    const admins = (
      await tx.membership.findMany({
        where: { organizationId: alert.organization_id, role: 'org_admin', status: 'active' },
        select: { userId: true },
      })
    ).map((m) => m.userId);

    const base: NotificationPayload = {
      vehicle: trip.vehicle.plateNumber,
      tripName: trip.route?.name ?? trip.vehicle.plateNumber,
      driverPhone: driver?.phoneE164 ?? '—',
      minutesLate: Math.max(0, Math.round((now.getTime() - trip.plannedEndAt.getTime()) / 60_000)),
      url: `/alert/${alert.id}`,
      tag: `alert-${alert.id}`,
      ...(level >= 2
        ? {
            emergencyNumber: COUNTRY_DEFAULTS[trip.organization.country as Country].emergencyNumber,
          }
        : {}),
    };
    const priority = PRIORITY[alert.severity];
    const req = (userId: string, payload: NotificationPayload): NotificationRequest => ({
      userId,
      template: alert.type,
      priority,
      alertId: alert.id,
      payload,
    });
    /** Primary guardians first; from minute 5 every guardian (PLAN §7). */
    const guardiansOf = (g: { guardianUserId: string; isPrimary: boolean }[]) =>
      g.filter((x) => level >= 1 || x.isPrimary || g.length === 1).map((x) => x.guardianUserId);

    const out: NotificationRequest[] = [];
    switch (alert.type) {
      case 'student_left_onboard': {
        const student = alert.student_id
          ? await tx.student.findUnique({
              where: { id: alert.student_id },
              select: {
                fullNameAr: true,
                fullNameEn: true,
                guardians: { select: { guardianUserId: true, isPrimary: true } },
              },
            })
          : null;
        const payload = student
          ? { ...base, student: { ar: student.fullNameAr, en: student.fullNameEn } }
          : base;
        for (const id of new Set([
          trip.driverId,
          ...admins,
          ...guardiansOf(student?.guardians ?? []),
        ])) {
          out.push(req(id, payload));
        }
        break;
      }
      case 'trip_overdue': {
        if (trip.students.length === 0) {
          for (const id of new Set([trip.driverId, ...admins])) out.push(req(id, base));
          break;
        }
        // Children still recorded on board: the driver and admins get one message per child,
        // naming them; each child's guardians hear about their own child only.
        for (const s of trip.students) {
          const payload = {
            ...base,
            student: { ar: s.student.fullNameAr, en: s.student.fullNameEn },
          };
          const ids = new Set([trip.driverId, ...admins, ...guardiansOf(s.student.guardians)]);
          for (const id of ids) out.push(req(id, payload));
        }
        break;
      }
      case 'driver_device_silent':
        for (const id of admins) out.push(req(id, base));
        break;
      case 'unexpected_student': {
        const student = alert.student_id
          ? await tx.student.findUnique({
              where: { id: alert.student_id },
              select: { fullNameAr: true, fullNameEn: true },
            })
          : null;
        for (const id of admins) {
          out.push(
            req(
              id,
              student
                ? { ...base, student: { ar: student.fullNameAr, en: student.fullNameEn } }
                : base,
            ),
          );
        }
        break;
      }
    }
    return out;
  }
}
