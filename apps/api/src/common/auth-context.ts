import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@wusool/shared';
import type { Request } from 'express';

export interface AuthContext {
  userId: string;
  emailVerified: boolean;
}

export interface OrgContext {
  id: string;
  roles: Role[];
}

export interface AppRequest extends Request {
  auth?: AuthContext;
  org?: OrgContext;
}

export const IS_PUBLIC = 'wusool:public';
export const REQUIRE_VERIFIED = 'wusool:requireVerified';
export const ORG_ROLES = 'wusool:orgRoles';
export const PLATFORM_ADMIN = 'wusool:platformAdmin';

/** No bearer token needed. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Email must be verified (PLAN §5.1: no adding students or starting trips before that). */
export const RequireVerifiedEmail = () => SetMetadata(REQUIRE_VERIFIED, true);

/**
 * Acting inside an organisation: needs the `X-Organization-Id` header and an active membership
 * with one of these roles. Implies a verified email.
 */
export const OrgRoles = (...roles: Role[]) => SetMetadata(ORG_ROLES, roles);

export const PlatformAdminOnly = () => SetMetadata(PLATFORM_ADMIN, true);

export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.auth) throw new Error('Auth() used on a public route');
  return req.auth;
});

export const Org = createParamDecorator((_: unknown, ctx: ExecutionContext): OrgContext => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.org) throw new Error('Org() used without @OrgRoles()');
  return req.org;
});

export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext): string | null => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  return req.ip ?? null;
});
