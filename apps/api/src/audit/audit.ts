import {
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  Global,
  Injectable,
  Module,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { tap, type Observable } from 'rxjs';
import {
  Auth,
  Org,
  OrgRoles,
  type AppRequest,
  type AuthContext,
  type OrgContext,
} from '../common/auth-context';
import { SideEffects } from '../common/side-effects';
import { PrismaService } from '../database/prisma.service';

// Audit trail (PLAN §10 audit_logs, §14): append-only records of sensitive actions, including
// viewing students' data and photos in the admin panel.

export type EntityType =
  | 'student'
  | 'enrollment_request'
  | 'vehicle'
  | 'route'
  | 'membership'
  | 'trip'
  | 'alert'
  | 'organization'
  | 'user';

interface AuditMeta {
  action: string;
  entityType: EntityType;
  /** Route parameter holding the entity id; otherwise the response's `id`. */
  idParam?: string;
  /** Request body fields worth keeping (never passwords or codes). */
  bodyFields?: string[];
}

const AUDIT = 'wusool:audit';

/** Records the action after the handler succeeds. */
export const Audit = (
  action: string,
  entityType: EntityType,
  opts: Omit<AuditMeta, 'action' | 'entityType'> = {},
) => SetMetadata(AUDIT, { action, entityType, ...opts } satisfies AuditMeta);

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: {
    actorUserId: string | null;
    organizationId: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    ip?: string | null;
    userAgent?: string | null;
    diff?: Record<string, unknown> | null;
  }): Promise<void> {
    await this.prisma.system.auditLog.create({
      data: {
        actorUserId: entry.actorUserId,
        organizationId: entry.organizationId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent?.slice(0, 300) ?? null,
        diff: (entry.diff ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /** The organisation an entity belongs to, for routes that are not org-scoped (trips, alerts). */
  async orgOf(entityType: EntityType, id: string): Promise<string | null> {
    if (entityType === 'trip') {
      return (
        (
          await this.prisma.system.trip.findUnique({
            where: { id },
            select: { organizationId: true },
          })
        )?.organizationId ?? null
      );
    }
    if (entityType === 'alert') {
      return (
        (
          await this.prisma.system.alert.findUnique({
            where: { id },
            select: { organizationId: true },
          })
        )?.organizationId ?? null
      );
    }
    if (entityType === 'organization') return id;
    return null;
  }
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
    private readonly effects: SideEffects,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMeta | undefined>(AUDIT, ctx.getHandler());
    if (!meta) return next.handle();
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    return next.handle().pipe(
      tap((result) => {
        const param = meta.idParam ? req.params[meta.idParam] : undefined;
        const entityId: string | null =
          (typeof param === 'string' ? param : undefined) ??
          ((result as { id?: unknown } | undefined)?.id as string | undefined) ??
          null;
        const body = (req.body ?? {}) as Record<string, unknown>;
        const diff = meta.bodyFields?.length
          ? Object.fromEntries(meta.bodyFields.filter((f) => f in body).map((f) => [f, body[f]]))
          : null;
        // Auditing must never break the action it records; failures are logged.
        this.effects.run('audit', async () => {
          const organizationId =
            req.org?.id ?? (entityId ? await this.audit.orgOf(meta.entityType, entityId) : null);
          await this.audit.record({
            actorUserId: req.auth?.userId ?? null,
            organizationId,
            action: meta.action,
            entityType: meta.entityType,
            entityId,
            ip: req.ip ?? null,
            userAgent: req.headers['user-agent'] ?? null,
            diff,
          });
        });
      }),
    );
  }
}

@ApiTags('organization')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Organization-Id', required: true })
@OrgRoles('org_admin')
@Controller('org/audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  /** Latest audit entries for the organisation (RLS: audit_logs_org_read). */
  @Get()
  list(@Auth() auth: AuthContext, @Org() org: OrgContext) {
    return this.prisma.withContext({ userId: auth.userId, orgId: org.id }, (tx) =>
      tx.auditLog.findMany({
        where: { organizationId: org.id },
        orderBy: { createdAt: 'desc' },
        take: 300,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          actorUserId: true,
          diff: true,
          createdAt: true,
        },
      }),
    );
  }
}

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
  exports: [AuditService],
})
export class AuditModule {}
