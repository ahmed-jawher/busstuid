import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ROUTINE_TEMPLATES,
  renderNotification,
  type Locale,
  type NotificationTemplate,
  type TemplateData,
} from '@wusool/shared';
import { PrismaService, type Tx } from '../database/prisma.service';
import { PUSH_PROVIDER, toPushTarget, type PushProvider } from '../push/push.provider';

export type Priority = 'normal' | 'high' | 'critical';

/** Names are stored in both languages; the recipient's language is chosen at send time. */
export interface NotificationPayload extends Omit<TemplateData, 'student'> {
  student?: { ar: string; en: string | null };
  url?: string;
  tag?: string;
}

export interface NotificationRequest {
  userId: string;
  template: NotificationTemplate;
  payload: NotificationPayload;
  priority: Priority;
  alertId?: string;
}

const MAX_ATTEMPTS = 5;
/** Push TTL: an alert that arrives an hour late is still worth showing; routine ones are not. */
const TTL_SECONDS: Record<Priority, number> = { critical: 3600, high: 1800, normal: 900 };

export function renderFor(
  template: NotificationTemplate,
  payload: NotificationPayload,
  locale: Locale,
) {
  const student = payload.student
    ? locale === 'en' && payload.student.en
      ? payload.student.en
      : payload.student.ar
    : undefined;
  return renderNotification(template, { ...payload, student }, locale);
}

/**
 * Notifications (PLAN §8): one row per recipient for the in-app inbox, plus one delivery per
 * active device. Rows are written in the caller's system-role transaction; pushes go out after
 * commit via `dispatch()`, and `retryPending()` (every minute) re-sends failures.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_PROVIDER) private readonly provider: PushProvider,
  ) {}

  /** Creates notifications and queued deliveries; returns the delivery ids to dispatch. */
  async createInTx(tx: Tx, requests: NotificationRequest[]): Promise<string[]> {
    if (requests.length === 0) return [];
    const users = new Map(
      (
        await tx.user.findMany({
          where: { id: { in: [...new Set(requests.map((r) => r.userId))] }, status: 'active' },
          select: {
            id: true,
            muteRoutineNotifications: true,
            pushSubscriptions: { where: { revokedAt: null }, select: { id: true } },
          },
        })
      ).map((u) => [u.id, u]),
    );
    const deliveryIds: string[] = [];
    for (const r of requests) {
      const user = users.get(r.userId);
      if (!user) continue;
      // Guardians may mute routine board/alight/absent pushes — never alerts (PLAN §8).
      if (user.muteRoutineNotifications && ROUTINE_TEMPLATES.includes(r.template)) continue;
      const notification = await tx.notification.create({
        data: {
          userId: r.userId,
          alertId: r.alertId ?? null,
          templateKey: r.template,
          payload: r.payload as Prisma.InputJsonValue,
          priority: r.priority,
        },
        select: { id: true },
      });
      for (const sub of user.pushSubscriptions) {
        const d = await tx.notificationDelivery.create({
          data: { notificationId: notification.id, pushSubscriptionId: sub.id },
          select: { id: true },
        });
        deliveryIds.push(d.id);
      }
    }
    return deliveryIds;
  }

  /** Sends deliveries now. Safe to call twice: only queued/failed deliveries are sent. */
  async dispatch(deliveryIds: string[]): Promise<void> {
    for (const id of deliveryIds) {
      try {
        await this.sendOne(id);
      } catch (e) {
        this.logger.error(`delivery ${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  /** Re-sends deliveries stuck in queue or failed, with backoff (minute job, PLAN §12). */
  async retryPending(now = new Date()): Promise<number> {
    const due = await this.prisma.system.notificationDelivery.findMany({
      where: {
        OR: [
          { status: 'queued', updatedAt: { lt: new Date(now.getTime() - 30_000) } },
          {
            status: 'failed',
            attempts: { lt: MAX_ATTEMPTS },
            updatedAt: { lt: new Date(now.getTime() - 60_000) },
          },
        ],
        pushSubscription: { revokedAt: null },
      },
      select: { id: true },
      orderBy: { updatedAt: 'asc' },
      take: 500,
    });
    await this.dispatch(due.map((d) => d.id));
    return due.length;
  }

  private async sendOne(deliveryId: string): Promise<void> {
    // Claim the delivery so concurrent dispatchers never send it twice.
    const claimed = await this.prisma.system.notificationDelivery.updateMany({
      where: {
        id: deliveryId,
        status: { in: ['queued', 'failed'] },
        attempts: { lt: MAX_ATTEMPTS },
      },
      data: { status: 'queued', attempts: { increment: 1 } },
    });
    if (claimed.count === 0) return;
    const d = await this.prisma.system.notificationDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
      select: {
        attempts: true,
        notification: {
          select: {
            templateKey: true,
            payload: true,
            priority: true,
            user: { select: { preferredLocale: true } },
            alert: { select: { status: true } },
          },
        },
        pushSubscription: {
          select: {
            id: true,
            provider: true,
            endpoint: true,
            p256dh: true,
            authSecret: true,
            nativeToken: true,
            revokedAt: true,
          },
        },
      },
    });
    // An alarm that was queued before the alert was resolved must not arrive after the
    // "confirmed safe" message and leave the guardian with a stale alarm on screen.
    if (d.notification.templateKey !== 'resolved' && d.notification.alert?.status === 'resolved') {
      await this.prisma.system.notificationDelivery.update({
        where: { id: deliveryId },
        data: { status: 'failed', attempts: MAX_ATTEMPTS, lastError: 'alert_resolved_before_send' },
      });
      return;
    }
    const sub = d.pushSubscription;
    const target = sub && !sub.revokedAt ? toPushTarget(sub) : null;
    if (!sub || !target) {
      await this.prisma.system.notificationDelivery.update({
        where: { id: deliveryId },
        data: { status: 'failed', attempts: MAX_ATTEMPTS, lastError: 'subscription_revoked' },
      });
      return;
    }
    const n = d.notification;
    const payload = n.payload as NotificationPayload;
    const { title, body } = renderFor(
      n.templateKey as NotificationTemplate,
      payload,
      n.user.preferredLocale,
    );
    const priority = n.priority as Priority;
    const result = await this.provider.send(
      target,
      { title, body, url: payload.url, tag: payload.tag, critical: priority === 'critical' },
      { urgency: priority === 'normal' ? 'normal' : 'high', ttlSeconds: TTL_SECONDS[priority] },
    );
    const now = new Date();
    if (result.ok) {
      await this.prisma.system.$transaction([
        this.prisma.system.notificationDelivery.update({
          where: { id: deliveryId },
          data: { status: 'sent', lastError: null },
        }),
        this.prisma.system.pushSubscription.update({
          where: { id: sub.id },
          data: { lastSuccessAt: now, failedCount: 0 },
        }),
      ]);
      return;
    }
    // Dead subscriptions are removed automatically (PLAN §8).
    await this.prisma.system.$transaction([
      this.prisma.system.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'failed',
          lastError: result.error.slice(0, 500),
          ...(result.gone ? { attempts: MAX_ATTEMPTS } : {}),
        },
      }),
      this.prisma.system.pushSubscription.update({
        where: { id: sub.id },
        data: { failedCount: { increment: 1 }, ...(result.gone ? { revokedAt: now } : {}) },
      }),
    ]);
  }
}
