import { HttpStatus, Injectable } from '@nestjs/common';
import type { Locale } from '@wusool/shared';
import { ApiError, Errors } from '../common/api-error';
import { PrismaService } from '../database/prisma.service';
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
  locale: Locale;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: EmailCodesService,
    private readonly tokens: TokensService,
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

    const user = await this.prisma.system.user.create({
      data: {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        fullNameAr: input.fullNameAr,
        fullNameEn: input.fullNameEn ?? null,
        phoneE164: input.phone,
        preferredLocale: input.locale,
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
    return this.prisma.systemTx(async (tx) => {
      const verified = await tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });
      return this.tokens.issue(tx, verified, deviceInfo);
    });
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

  async login(email: string, password: string, deviceInfo?: string): Promise<TokenPair> {
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
      // Committed before throwing so the lockout actually counts (PLAN §5.1).
      const failed = user.failedLoginCount + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await this.prisma.system.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: lock ? 0 : failed,
          lockedUntil: lock ? new Date(Date.now() + LOCK_MS) : user.lockedUntil,
        },
      });
      throw Errors.unauthorized('invalid_credentials');
    }

    return this.prisma.systemTx(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
      return this.tokens.issue(tx, user, deviceInfo);
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
