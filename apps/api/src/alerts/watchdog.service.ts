import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { EscalationService } from './escalation.service';

/** Per-organisation settings in `organizations.settings` (PLAN §6.4: all configurable). */
export interface WatchdogSettings {
  overdueMarginMinutes: number;
  deviceSilentMinutes: number;
}

export const DEFAULT_WATCHDOG: WatchdogSettings = {
  overdueMarginMinutes: 15,
  deviceSilentMinutes: 10,
};

function settingsOf(raw: unknown): WatchdogSettings {
  const s = (raw ?? {}) as Partial<Record<keyof WatchdogSettings, unknown>>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && v > 0 && v < 24 * 60 ? v : d);
  return {
    overdueMarginMinutes: num(s.overdueMarginMinutes, DEFAULT_WATCHDOG.overdueMarginMinutes),
    deviceSilentMinutes: num(s.deviceSilentMinutes, DEFAULT_WATCHDOG.deviceSilentMinutes),
  };
}

/**
 * Runs every minute and watches active trips on its own, because the driver may forget
 * everything (PLAN §3.4, §6.4):
 * - past planned end + margin → `trip_overdue` (critical if a child is still recorded on board);
 * - no event or heartbeat for 10 min with children on board → `driver_device_silent`, unless the
 *   device reported going to the background (then the overdue rule covers it, PLAN §9.1).
 */
@Injectable()
export class WatchdogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escalation: EscalationService,
  ) {}

  async runOnce(now = new Date()): Promise<{ overdue: number; silent: number }> {
    const trips = await this.prisma.system.trip.findMany({
      where: { status: { in: ['in_progress', 'overdue'] } },
      select: {
        id: true,
        organizationId: true,
        status: true,
        plannedEndAt: true,
        lastHeartbeatAt: true,
        lastDeviceState: true,
        organization: { select: { settings: true } },
        students: { where: { status: 'boarded' }, select: { studentId: true } },
        alerts: {
          where: {
            type: { in: ['trip_overdue', 'driver_device_silent'] },
            status: { not: 'resolved' },
          },
          select: { type: true },
        },
      },
    });

    const opened: string[] = [];
    let overdue = 0;
    let silent = 0;
    for (const trip of trips) {
      const s = settingsOf(trip.organization.settings);
      const has = (type: string) => trip.alerts.some((a) => a.type === type);
      const onboard = trip.students.length;

      if (
        now.getTime() > trip.plannedEndAt.getTime() + s.overdueMarginMinutes * 60_000 &&
        !has('trip_overdue')
      ) {
        const id = await this.open(
          trip.id,
          trip.organizationId,
          'trip_overdue',
          onboard > 0 ? 'critical' : 'high',
          now,
          {
            onboard,
            markOverdue: trip.status === 'in_progress',
          },
        );
        if (id) {
          opened.push(id);
          overdue++;
        }
      }

      const lastSignal = trip.lastHeartbeatAt?.getTime() ?? 0;
      if (
        onboard > 0 &&
        trip.lastDeviceState !== 'app_backgrounded' &&
        now.getTime() - lastSignal > s.deviceSilentMinutes * 60_000 &&
        !has('driver_device_silent')
      ) {
        const id = await this.open(
          trip.id,
          trip.organizationId,
          'driver_device_silent',
          'high',
          now,
          { onboard },
        );
        if (id) {
          opened.push(id);
          silent++;
        }
      }
    }
    await this.escalation.processAlerts(opened, now);
    return { overdue, silent };
  }

  /** Opens an alert unless one of that type is already open for the trip (re-checked under lock). */
  private open(
    tripId: string,
    orgId: string,
    type: 'trip_overdue' | 'driver_device_silent',
    severity: 'high' | 'critical',
    now: Date,
    extra: { onboard: number; markOverdue?: boolean },
  ): Promise<string | null> {
    return this.prisma.systemTx(async (tx) => {
      await tx.$queryRaw`SELECT id FROM trips WHERE id = ${tripId}::uuid FOR UPDATE`;
      const existing = await tx.alert.findFirst({
        where: { tripId, type, status: { not: 'resolved' } },
        select: { id: true },
      });
      if (existing) return null;
      if (extra.markOverdue) {
        await tx.trip.updateMany({
          where: { id: tripId, status: 'in_progress' },
          data: { status: 'overdue' },
        });
      }
      const alert = await tx.alert.create({
        data: {
          organizationId: orgId,
          tripId,
          type,
          severity,
          openedAt: now,
          nextEscalationAt: now,
        },
        select: { id: true },
      });
      await tx.alertEvent.create({
        data: {
          organizationId: orgId,
          alertId: alert.id,
          action: 'opened',
          payload: { source: 'watchdog', onboard: extra.onboard },
        },
      });
      return alert.id;
    });
  }
}
