import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { NotificationTemplate } from '@wusool/shared';
import { z } from 'zod';
import { Errors } from '../common/api-error';
import { Auth, Org, OrgRoles, type AuthContext, type OrgContext } from '../common/auth-context';
import { ApiZodQuery, zod } from '../common/zod';
import { PrismaService } from '../database/prisma.service';
import { renderFor, type NotificationPayload } from './notifications.service';

const inboxQuery = z.object({
  unread: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('me/notifications')
export class InboxController {
  constructor(private readonly prisma: PrismaService) {}

  /** In-app inbox (PLAN §8), rendered in the user's language. */
  @Get()
  @ApiZodQuery(inboxQuery)
  async list(@Auth() auth: AuthContext, @Query(zod(inboxQuery)) q: z.output<typeof inboxQuery>) {
    return this.prisma.withContext({ userId: auth.userId }, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: auth.userId },
        select: { preferredLocale: true },
      });
      const rows = await tx.notification.findMany({
        where: { userId: auth.userId, ...(q.unread ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: q.limit,
        select: {
          id: true,
          templateKey: true,
          payload: true,
          priority: true,
          alertId: true,
          createdAt: true,
          readAt: true,
        },
      });
      return rows.map(({ payload, templateKey, ...n }) => {
        const p = payload as NotificationPayload;
        return {
          ...n,
          template: templateKey,
          url: p.url ?? null,
          ...renderFor(templateKey as NotificationTemplate, p, user.preferredLocale),
        };
      });
    });
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async read(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    const res = await this.prisma.withContext({ userId: auth.userId }, (tx) =>
      tx.notification.updateMany({
        where: { id, userId: auth.userId, readAt: null },
        data: { readAt: new Date() },
      }),
    );
    if (res.count === 0) {
      const exists = await this.prisma.withContext({ userId: auth.userId }, (tx) =>
        tx.notification.count({ where: { id } }),
      );
      if (!exists) throw Errors.notFound();
    }
  }
}

const STALE_DAYS = 7;

@ApiTags('organization')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Organization-Id', required: true })
@OrgRoles('org_admin')
@Controller('org/unreachable-guardians')
export class UnreachableGuardiansController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Guardians who would probably not receive an alert right now, so the admin can contact them
   * (PLAN §7): no working device, or their latest push failed. Phone numbers are unverified.
   */
  @Get()
  async list(@Org() org: OrgContext) {
    const staleBefore = new Date(Date.now() - STALE_DAYS * 24 * 3_600_000);
    const guardians = await this.prisma.system.user.findMany({
      where: {
        status: 'active',
        guardianOf: {
          some: {
            student: {
              deletedAt: null,
              orgStudents: { some: { organizationId: org.id, status: 'active' } },
            },
          },
        },
      },
      select: {
        id: true,
        fullNameAr: true,
        fullNameEn: true,
        phoneE164: true,
        phoneVerified: true,
        guardianOf: {
          where: {
            student: { orgStudents: { some: { organizationId: org.id, status: 'active' } } },
          },
          select: { student: { select: { id: true, fullNameAr: true } } },
        },
        pushSubscriptions: {
          where: { revokedAt: null },
          select: { lastSuccessAt: true, lastTestOkAt: true, failedCount: true, createdAt: true },
        },
      },
    });
    return guardians
      .map((g) => {
        const subs = g.pushSubscriptions;
        const working = subs.filter(
          (s) =>
            s.failedCount === 0 &&
            ((s.lastSuccessAt && s.lastSuccessAt > staleBefore) ||
              (s.lastTestOkAt && s.lastTestOkAt > staleBefore) ||
              s.createdAt > staleBefore),
        );
        const reason =
          subs.length === 0 ? 'no_device' : working.length === 0 ? 'delivery_failing' : null;
        return reason
          ? {
              userId: g.id,
              fullNameAr: g.fullNameAr,
              fullNameEn: g.fullNameEn,
              phone: g.phoneE164,
              phoneVerified: g.phoneVerified,
              children: g.guardianOf.map((l) => l.student),
              reason,
            }
          : null;
      })
      .filter((g) => g !== null);
  }
}
