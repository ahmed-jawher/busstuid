import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Country, EnrollableOrgType, Locale, SignupRole } from '@wusool/shared';
import { AuditService } from '../audit/audit';
import { ApiError, Errors } from '../common/api-error';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { createOrganization, type NewOrganization } from '../organizations/create-organization';
import { assertDriverPhoneAvailable } from '../organizations/driver-phone';
import { decryptField, verifyTotp } from './totp';
import { EmailCodesService } from './email-codes.service';
import { checkPasswordPolicy, hashPassword, verifyPassword } from './passwords';
import { TokensService, type TokenPair } from './tokens.service';

export const MAX_FAILED_LOGINS = 10;
export const LOCK_MS = 15 * 60_000;

export interface RegisterData {
  email: string;
  password: string;
  fullNameAr: string;
  fullNameEn?: string;
  phone: string;
  country: Country;
  locale: Locale;
  signupRole?: SignupRole;
  organization?: { type: EnrollableOrgType; nameAr: string; nameEn: string };
}

/** The organisation a person asked for at sign-up; created once the email is verified. */
function pendingOrganizationFor(input: RegisterData): NewOrganization | null {
  if (input.signupRole === 'independent_driver') {
    return {
      type: 'independent_driver',
      nameAr: input.fullNameAr,
      // Required for this role by the sign-up schema.
      nameEn: input.fullNameEn ?? input.fullNameAr,
      country: input.country,
    };
  }
  if (input.signupRole === 'organization' && input.organization) {
    return { ...input.organization, country: input.country };
  }
  return null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: EmailCodesService,
    private readonly tokens: TokensService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  /**
   * Always answers the same way whether or not the email exists, so the endpoint cannot be
   * used to discover who has an account.
   */
  async register(input: RegisterData, ip: string | null): Promise<void> {
    const weak = checkPasswordPolicy(input.password, {
      email: input.email,
      names: [input.fullNameAr, input.fullNameEn],
    });
    if (weak) throw Errors.badRequest(weak);

    const existing = await this.prisma.system.user.findUnique({ where: { email: input.email } });
    if (existing) {
      if (existing.status === 'active' && !existing.emailVerifiedAt) {
        await this.codes
          .issue({
            userId: existing.id,
            purpose: 'verify_email',
            targetEmail: existing.email,
            locale: existing.preferredLocale,
            ip,
          })
          .catch(ignoreRateLimit);
      }
      return;
    }

    // An independent driver's phone links guardians to them, so it must be free (PLAN §3.1).
    // Checked now so the form can say so, and again when the organisation is created.
    if (input.signupRole === 'independent_driver') {
      await this.prisma.systemTx((tx) => assertDriverPhoneAvailable(tx, input.phone));
    }
    const pending = pendingOrganizationFor(input);
    const user = await this.prisma.system.user.create({
      data: {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        fullNameAr: input.fullNameAr,
        fullNameEn: input.fullNameEn ?? null,
        phoneE164: input.phone,
        preferredLocale: input.locale,
        signupRole: input.signupRole ?? 'guardian',
        pendingOrganization: pending
          ? (pending as unknown as Prisma.InputJsonObject)
          : Prisma.DbNull,
      },
    });
    await this.codes.issue({
      userId: user.id,
      purpose: 'verify_email',
      targetEmail: user.email,
      locale: user.preferredLocale,
      ip,
    });
  }

  async verifyEmail(email: string, code: string, deviceInfo?: string): Promise<TokenPair> {
    const user = await this.findActive(email);
    if (!user) throw Errors.badRequest('code_invalid');
    if (user.emailVerifiedAt) throw Errors.conflict('email_already_verified');
    await this.codes.consume(user.id, 'verify_email', code);
    let createdOrgId: string | null = null;
    const tokens = await this.prisma.systemTx(async (tx) => {
      const verified = await tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date(), pendingOrganization: Prisma.DbNull },
      });
      const pending = user.pendingOrganization as NewOrganization | null;
      if (pending) {
        try {
          createdOrgId = (await createOrganization(tx, user.id, pending)).id;
        } catch (e) {
          // E.g. the phone was taken by another driver meanwhile. Verification still succeeds;
          // the app then asks the person to register the organisation themselves.
          if (!(e instanceof ApiError)) throw e;
          this.logger.warn(`sign-up organisation not created: ${e.code}`);
        }
      }
      return this.tokens.issue(tx, verified, deviceInfo);
    });
    if (createdOrgId) {
      await this.audit.record({
        actorUserId: user.id,
        organizationId: createdOrgId,
        action: 'organization.create',
        entityType: 'organization',
        entityId: createdOrgId,
        diff: { via: 'signup' },
      });
    }
    return tokens;
  }

  async resendCode(
    email: string,
    purpose: 'verify_email' | 'reset_password',
    ip: string | null,
  ): Promise<void> {
    const user = await this.findActive(email);
    if (!user) return;
    if (purpose === 'verify_email' && user.emailVerifiedAt) return;
    await this.codes.issue({
      userId: user.id,
      purpose,
      targetEmail: user.email,
      locale: user.preferredLocale,
      ip,
    });
  }

  async login(
    email: string,
    password: string,
    deviceInfo?: string,
    totp?: string,
  ): Promise<TokenPair> {
    const user = await this.findActive(email);
    if (!user) {
      await verifyPassword(null, password);
      throw Errors.unauthorized('invalid_credentials');
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new ApiError(HttpStatus.LOCKED, 'account_locked', undefined, {
        retryAfterSeconds: Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000),
      });
    }

    if (!(await verifyPassword(user.passwordHash, password))) {
      await this.countFailure(user);
      throw Errors.unauthorized('invalid_credentials');
    }

    // Second factor, only asked once the password was right (PLAN §5.1: optional TOTP).
    if (user.totpEnabledAt && user.totpSecretEncrypted) {
      if (!totp) throw Errors.unauthorized('totp_required');
      const secret = decryptField(user.totpSecretEncrypted, this.config.fieldEncryptionKey);
      if (!verifyTotp(secret, totp)) {
        await this.countFailure(user);
        throw Errors.unauthorized('totp_invalid');
      }
    }

    return this.prisma.systemTx(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
      return this.tokens.issue(tx, user, deviceInfo);
    });
  }

  /** Committed on its own so the lockout counts even though the request then fails. */
  private async countFailure(user: {
    id: string;
    failedLoginCount: number;
    lockedUntil: Date | null;
  }): Promise<void> {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await this.prisma.system.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: lock ? 0 : failed,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MS) : user.lockedUntil,
      },
    });
  }

  async forgotPassword(email: string, ip: string | null): Promise<void> {
    // Rate limits are swallowed so the reply never reveals whether the account exists.
    await this.resendCode(email, 'reset_password', ip).catch(ignoreRateLimit);
  }

  async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    const user = await this.findActive(email);
    if (!user) throw Errors.badRequest('code_invalid');
    const weak = checkPasswordPolicy(newPassword, {
      email: user.email,
      names: [user.fullNameAr, user.fullNameEn],
    });
    if (weak) throw Errors.badRequest(weak);
    await this.codes.consume(user.id, 'reset_password', code);
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.systemTx(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          failedLoginCount: 0,
          lockedUntil: null,
          // The code arrived at this address, which proves ownership.
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        },
      });
      await this.tokens.revokeAllForUser(tx, user.id);
    });
  }

  private findActive(email: string) {
    return this.prisma.system.user.findFirst({ where: { email, status: 'active' } });
  }
}

function ignoreRateLimit(e: unknown): void {
  if (e instanceof ApiError && e.getStatus() === HttpStatus.TOO_MANY_REQUESTS) return;
  throw e;
}
