import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Locale } from '@wusool/shared';
import { ApiError, Errors } from '../common/api-error';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { PUSH_PROVIDER, type PushProvider } from './push.provider';

const TEST_MESSAGE: Record<Locale, { title: string; body: string }> = {
  ar: { title: 'وصول آمن', body: '✅ الإشعارات تعمل على هذا الجهاز.' },
  en: { title: 'Wusool Safe', body: '✅ Notifications work on this device.' },
};

@Injectable()
export class PushService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_PROVIDER) private readonly provider: PushProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  vapidPublicKey(): string {
    return this.config.vapid.publicKey;
  }

  /**
   * Upserts by endpoint. A browser endpoint identifies one device; if it was registered to
   * another account (shared phone, new sign-in) it moves to the current user. Runs on the
   * system role because the previous owner's row is invisible under RLS.
   */
  async subscribe(
    userId: string,
    input: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string },
  ) {
    return this.prisma.system.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId,
        provider: 'webpush',
        platform: 'web',
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        authSecret: input.keys.auth,
        userAgent: input.userAgent ?? null,
      },
      update: {
        userId,
        p256dh: input.keys.p256dh,
        authSecret: input.keys.auth,
        userAgent: input.userAgent ?? null,
        revokedAt: null,
        failedCount: 0,
        lastTestOkAt: null,
      },
      select: { id: true, provider: true, platform: true, createdAt: true },
    });
  }

  list(userId: string) {
    return this.prisma.withContext({ userId }, (tx) =>
      tx.pushSubscription.findMany({
        where: { userId, revokedAt: null },
        select: {
          id: true,
          provider: true,
          platform: true,
          userAgent: true,
          lastTestOkAt: true,
          lastSuccessAt: true,
          failedCount: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async unsubscribe(userId: string, id: string): Promise<void> {
    const res = await this.prisma.withContext({ userId }, (tx) =>
      tx.pushSubscription.updateMany({
        where: { id, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
    if (res.count === 0) throw Errors.notFound();
  }

  /**
   * Sends the test notification that proves notifications work (PLAN §7). Drivers cannot start
   * a trip until one of their devices has passed this test (enforced in phase 2/3).
   */
  async sendTest(userId: string, id: string) {
    const sub = await this.prisma.withContext({ userId }, (tx) =>
      tx.pushSubscription.findFirst({
        where: { id, userId, revokedAt: null },
        include: { user: { select: { preferredLocale: true } } },
      }),
    );
    if (!sub || !sub.endpoint || !sub.p256dh || !sub.authSecret) throw Errors.notFound();

    const result = await this.provider.send(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.authSecret },
      { ...TEST_MESSAGE[sub.user.preferredLocale], tag: 'wusool-test', url: '/' },
      { urgency: 'high', ttlSeconds: 120 },
    );
    const now = new Date();
    if (result.ok) {
      await this.prisma.system.pushSubscription.update({
        where: { id },
        data: { lastTestOkAt: now, lastSuccessAt: now, failedCount: 0 },
      });
      return { ok: true, testedAt: now };
    }
    await this.prisma.system.pushSubscription.update({
      where: { id },
      data: { failedCount: { increment: 1 }, ...(result.gone ? { revokedAt: now } : {}) },
    });
    throw result.gone
      ? new ApiError(HttpStatus.GONE, 'subscription_expired')
      : new ApiError(HttpStatus.BAD_GATEWAY, 'push_failed');
  }
}
