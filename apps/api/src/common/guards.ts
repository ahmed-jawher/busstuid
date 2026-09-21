import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@wusool/shared';
import { verifyJwt } from '../auth/jwt';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { Errors } from './api-error';
import {
  IS_PUBLIC,
  ORG_ROLES,
  PLATFORM_ADMIN,
  REQUIRE_VERIFIED,
  type AppRequest,
} from './auth-context';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Global guard: bearer JWT → `req.auth`; then, as declared on the route, verified email,
 * organisation membership (`X-Organization-Id`) or platform admin.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const claims = token ? verifyJwt(token, this.config.jwtAccessSecret) : null;
    if (!claims || typeof claims.sub !== 'string') throw Errors.unauthorized();
    req.auth = { userId: claims.sub, emailVerified: claims.ev === true };

    const orgRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ORG_ROLES, targets);
    const needsVerified =
      this.reflector.getAllAndOverride<boolean>(REQUIRE_VERIFIED, targets) || !!orgRoles;
    if (needsVerified && !req.auth.emailVerified) throw Errors.forbidden('email_not_verified');

    if (this.reflector.getAllAndOverride<boolean>(PLATFORM_ADMIN, targets)) {
      const user = await this.prisma.system.user.findUnique({
        where: { id: req.auth.userId },
        select: { isPlatformAdmin: true, status: true },
      });
      if (!user?.isPlatformAdmin || user.status !== 'active') throw Errors.forbidden();
    }

    if (orgRoles) {
      const orgId = req.headers['x-organization-id'];
      if (typeof orgId !== 'string' || !UUID.test(orgId)) {
        throw Errors.badRequest('organization_header_required');
      }
      const memberships = await this.prisma.system.membership.findMany({
        where: {
          userId: req.auth.userId,
          organizationId: orgId,
          status: 'active',
          organization: { status: { not: 'suspended' }, deletedAt: null },
        },
        select: { role: true },
      });
      const roles = memberships.map((m) => m.role as Role);
      if (!roles.some((r) => orgRoles.includes(r))) throw Errors.forbidden('not_a_member');
      req.org = { id: orgId, roles };
    }
    return true;
  }
}
