import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, type Tx } from '../database/prisma.service';

const DAY = 24 * 3_600_000;

/** PLAN §14 defaults, overridable per organisation in `settings.retention`. */
export const DEFAULT_RETENTION = {
  /** Trip events and trips: a school year plus a year. */
  tripDays: 730,
  /** Resolved alerts and their history. */
  alertDays: 3 * 365,
  /** Audit log. */
  auditDays: 3 * 365,
};

/** Routine notifications (not tied to an alert) and sign-in housekeeping. */
const NOTIFICATION_DAYS = 365;
const EMAIL_CODE_DAYS = 7;
const REFRESH_TOKEN_DAYS = 30;
const REVOKED_DEVICE_DAYS = 90;

type Retention = typeof DEFAULT_RETENTION;

function retentionOf(settings: unknown): Retention {
  const r =
    ((settings ?? {}) as { retention?: Partial<Record<keyof Retention, unknown>> }).retention ?? {};
  // Never shorter than a year for safety records, whatever the settings say.
  const pick = (v: unknown, d: number) => (typeof v === 'number' && v >= 365 && v <= 3650 ? v : d);
  return {
    tripDays: pick(r.tripDays, DEFAULT_RETENTION.tripDays),
    alertDays: pick(r.alertDays, DEFAULT_RETENTION.alertDays),
    auditDays: pick(r.auditDays, DEFAULT_RETENTION.auditDays),
  };
}

/**
 * Daily `retention-cleanup` job (PLAN §12, §14). Append-only tables can only be purged here: the
 * transaction runs as wusool_system with `app.retention_purge = on` (migration 3). Open or
 * acknowledged alerts are never deleted, and a trip is kept while any of its alerts remains.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger('Retention');

  constructor(private readonly prisma: PrismaService) {}

  async run(now = new Date()): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    const add = (k: string, n: number) => (counts[k] = (counts[k] ?? 0) + n);

    const orgs = await this.prisma.system.organization.findMany({
      select: { id: true, settings: true },
    });
    for (const org of orgs) {
      const r = retentionOf(org.settings);
      await this.purgeTx(async (tx) => {
        const alertCutoff = new Date(now.getTime() - r.alertDays * DAY);
        const oldAlerts = (
          await tx.alert.findMany({
            where: { organizationId: org.id, status: 'resolved', openedAt: { lt: alertCutoff } },
            select: { id: true },
          })
        ).map((a) => a.id);
        if (oldAlerts.length) {
          add(
            'notifications',
            (await tx.notification.deleteMany({ where: { alertId: { in: oldAlerts } } })).count,
          );
          add(
            'alertEvents',
            (await tx.alertEvent.deleteMany({ where: { alertId: { in: oldAlerts } } })).count,
          );
          add('alerts', (await tx.alert.deleteMany({ where: { id: { in: oldAlerts } } })).count);
        }

        const tripCutoff = new Date(now.getTime() - r.tripDays * DAY);
        const oldTrips = (
          await tx.trip.findMany({
            where: {
              organizationId: org.id,
              plannedStartAt: { lt: tripCutoff },
              alerts: { none: {} },
            },
            select: { id: true },
          })
        ).map((t) => t.id);
        if (oldTrips.length) {
          add(
            'tripEvents',
            (await tx.tripEvent.deleteMany({ where: { tripId: { in: oldTrips } } })).count,
          );
          add(
            'tripStudents',
            (await tx.tripStudent.deleteMany({ where: { tripId: { in: oldTrips } } })).count,
          );
          add('trips', (await tx.trip.deleteMany({ where: { id: { in: oldTrips } } })).count);
        }

        const auditCutoff = new Date(now.getTime() - r.auditDays * DAY);
        add(
          'auditLogs',
          (
            await tx.auditLog.deleteMany({
              where: { organizationId: org.id, createdAt: { lt: auditCutoff } },
            })
          ).count,
        );
      });
    }

    await this.purgeTx(async (tx) => {
      add(
        'auditLogs',
        (
          await tx.auditLog.deleteMany({
            where: {
              organizationId: null,
              createdAt: { lt: new Date(now.getTime() - DEFAULT_RETENTION.auditDays * DAY) },
            },
          })
        ).count,
      );
      add(
        'notifications',
        (
          await tx.notification.deleteMany({
            where: {
              alertId: null,
              createdAt: { lt: new Date(now.getTime() - NOTIFICATION_DAYS * DAY) },
            },
          })
        ).count,
      );
      add(
        'emailCodes',
        (
          await tx.emailCode.deleteMany({
            where: { createdAt: { lt: new Date(now.getTime() - EMAIL_CODE_DAYS * DAY) } },
          })
        ).count,
      );
      const tokenCutoff = new Date(now.getTime() - REFRESH_TOKEN_DAYS * DAY);
      add(
        'refreshTokens',
        (
          await tx.refreshToken.deleteMany({
            where: { OR: [{ expiresAt: { lt: tokenCutoff } }, { revokedAt: { lt: tokenCutoff } }] },
          })
        ).count,
      );
      add(
        'revokedDevices',
        (
          await tx.pushSubscription.deleteMany({
            where: { revokedAt: { lt: new Date(now.getTime() - REVOKED_DEVICE_DAYS * DAY) } },
          })
        ).count,
      );
    });

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total > 0) this.logger.log(`retention removed ${JSON.stringify(counts)}`);
    return counts;
  }

  private purgeTx(fn: (tx: Tx) => Promise<void>): Promise<void> {
    return this.prisma.systemTx(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.retention_purge', 'on', true)`;
      await fn(tx);
    });
  }
}
