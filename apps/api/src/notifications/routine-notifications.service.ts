import { Injectable } from '@nestjs/common';
import type { NotificationTemplate } from '@wusool/shared';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService, type NotificationRequest } from './notifications.service';

export interface StatusChange {
  studentId: string;
  status: 'boarded' | 'alighted' | 'absent';
  at: Date;
}

const TEMPLATE: Record<StatusChange['status'], NotificationTemplate> = {
  boarded: 'boarded',
  alighted: 'alighted',
  absent: 'absent',
};

/** Tells guardians their child boarded, got off or was marked absent (PLAN §5, §8). */
@Injectable()
export class RoutineNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async notifyGuardians(tripId: string, changes: StatusChange[]): Promise<void> {
    if (changes.length === 0) return;
    const deliveryIds = await this.prisma.systemTx(async (tx) => {
      const trip = await tx.trip.findUniqueOrThrow({
        where: { id: tripId },
        select: {
          route: { select: { name: true } },
          vehicle: { select: { plateNumber: true } },
          organization: { select: { timezone: true } },
          students: {
            where: { studentId: { in: changes.map((c) => c.studentId) } },
            select: {
              studentId: true,
              stop: { select: { name: true } },
              student: {
                select: {
                  fullNameAr: true,
                  fullNameEn: true,
                  guardians: { select: { guardianUserId: true } },
                },
              },
            },
          },
        },
      });
      const time = new Intl.DateTimeFormat('en-GB', {
        timeZone: trip.organization.timezone,
        hour: '2-digit',
        minute: '2-digit',
      });
      const requests: NotificationRequest[] = [];
      for (const change of changes) {
        const row = trip.students.find((s) => s.studentId === change.studentId);
        if (!row) continue;
        for (const g of row.student.guardians) {
          requests.push({
            userId: g.guardianUserId,
            template: TEMPLATE[change.status],
            priority: 'normal',
            payload: {
              student: { ar: row.student.fullNameAr, en: row.student.fullNameEn },
              vehicle: trip.vehicle.plateNumber,
              stop: row.stop?.name ?? '—',
              tripName: trip.route?.name ?? trip.vehicle.plateNumber,
              time: time.format(change.at),
              url: `/child/${change.studentId}`,
              tag: `child-${change.studentId}`,
            },
          });
        }
      }
      return this.notifications.createInTx(tx, requests);
    });
    await this.notifications.dispatch(deliveryIds);
  }
}
