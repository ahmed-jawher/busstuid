import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import PgBoss from 'pg-boss';
import { EscalationService } from '../alerts/escalation.service';
import { WatchdogService } from '../alerts/watchdog.service';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TripGenerationService } from '../trips/trip-generation.service';
import { RetentionService } from './retention.service';

/** PLAN §12. Cron in UTC; 00:00 UTC is 03:00 in Bahrain and Riyadh. */
const SCHEDULES = [
  { name: 'trip-watchdog', cron: '* * * * *' },
  { name: 'alert-escalation', cron: '* * * * *' },
  { name: 'notification-dispatch', cron: '* * * * *' },
  { name: 'daily-trip-generation', cron: '0 0 * * *' },
  { name: 'retention-cleanup', cron: '30 0 * * *' },
] as const;
type JobName = (typeof SCHEDULES)[number]['name'];

/**
 * Background jobs on pg-boss, whose queue lives in PostgreSQL (no Redis). Every job only calls a
 * service method that reads its work from the database, so nothing is lost on restart; on boot
 * open alerts are reconciled so none is left without a next escalation time (PLAN §12).
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Jobs');
  private boss: PgBoss | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly watchdog: WatchdogService,
    private readonly escalation: EscalationService,
    private readonly notifications: NotificationsService,
    private readonly generation: TripGenerationService,
    private readonly retention: RetentionService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const reconciled = await this.escalation.reconcile();
    if (reconciled > 0)
      this.logger.warn(`reconciled ${reconciled} open alert(s) without a schedule`);
    if (!this.config.jobsEnabled) return;

    this.boss = new PgBoss({ connectionString: this.config.databaseSystemUrl, schema: 'pgboss' });
    this.boss.on('error', (e) => this.logger.error(e.message));
    await this.boss.start();
    for (const { name, cron } of SCHEDULES) {
      await this.boss.createQueue(name);
      await this.boss.schedule(name, cron, {}, { singletonKey: name });
      await this.boss.work(name, { pollingIntervalSeconds: 5 }, async () => this.run(name));
    }
    this.logger.log(`scheduled ${SCHEDULES.map((s) => s.name).join(', ')}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.boss?.stop({ graceful: true, timeout: 10_000 });
  }

  /** Runs one job by name (also used by tests and the admin tooling). */
  async run(name: JobName, now = new Date()): Promise<unknown> {
    switch (name) {
      case 'trip-watchdog':
        return this.watchdog.runOnce(now);
      case 'alert-escalation':
        return this.escalation.runDue(now);
      case 'notification-dispatch':
        return this.notifications.retryPending(now);
      case 'retention-cleanup':
        return this.retention.run(now);
      case 'daily-trip-generation': {
        const orgs = await this.prisma.system.organization.findMany({
          where: { status: 'active', deletedAt: null },
          select: { id: true },
        });
        let created = 0;
        for (const org of orgs) {
          created += (
            await this.generation.generateForOrg(org.id, await this.generation.today(org.id, now))
          ).created;
        }
        return { created };
      }
    }
  }
}
