import { Inject, Injectable } from '@nestjs/common';
import type { Locale } from '@wusool/shared';
import { EmailCodesService } from '../auth/email-codes.service';
import { checkPasswordPolicy, hashPassword, verifyPassword } from '../auth/passwords';
import {
  decryptField,
  encryptField,
  generateTotpSecret,
  otpauthUri,
  verifyTotp,
} from '../auth/totp';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { TokensService } from '../auth/tokens.service';
import { Errors } from '../common/api-error';
import { PrismaService } from '../database/prisma.service';
import { assertDriverPhoneAvailable, isIndependentDriver } from '../organizations/driver-phone';
import { removeChildForGuardian } from '../students/child-data';

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: EmailCodesService,
    private readonly tokens: TokensService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async profile(userId: string) {
    const user = await this.prisma.withContext({ userId }, (tx) =>
      tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
          phoneE164: true,
          phoneVerified: true,
          fullNameAr: true,
          fullNameEn: true,
          preferredLocale: true,
          muteRoutineNotifications: true,
          isPlatformAdmin: true,
          totpEnabledAt: true,
          signupRole: true,
          status: true,
        },
      }),
    );
    if (!user || user.status !== 'active') throw Errors.unauthorized();
    // Memberships are listed through the system role: they span organisations by design.
    const memberships = await this.prisma.system.membership.findMany({
      where: { userId, status: 'active', organization: { deletedAt: null } },
      select: {
        role: true,
        organization: {
          select: { id: true, type: true, nameAr: true, nameEn: true, country: true, status: true },
        },
      },
    });
    // Guardian interface: for everyone who signed up as a guardian or has added a child.
    const childLinks = await this.prisma.withContext({ userId }, (tx) =>
      tx.studentGuardian.count({ where: { guardianUserId: userId, student: { deletedAt: null } } }),
    );
    const { status: _status, emailVerifiedAt, totpEnabledAt, ...rest } = user;
    return {
      ...rest,
      emailVerified: emailVerifiedAt !== null,
      totpEnabled: totpEnabledAt !== null,
      isGuardian: user.signupRole === 'guardian' || childLinks > 0,
      memberships,
    };
  }

  async updateProfile(
    userId: string,
    data: {
      fullNameAr?: string;
      fullNameEn?: string | null;
      phone?: string;
      preferredLocale?: Locale;
    },
  ) {
    if (data.phone) {
      const phone = data.phone;
      await this.prisma.systemTx(async (tx) => {
        if (await isIndependentDriver(tx, userId)) {
          await assertDriverPhoneAvailable(tx, phone, userId);
        }
      });
    }
    await this.prisma.withContext({ userId }, (tx) =>
      tx.user.update({
        where: { id: userId },
        data: {
          fullNameAr: data.fullNameAr,
          fullNameEn: data.fullNameEn,
          phoneE164: data.phone,
          preferredLocale: data.preferredLocale,
        },
      }),
    );
    return this.profile(userId);
  }

  async setNotificationSettings(userId: string, muteRoutineNotifications: boolean) {
    await this.prisma.withContext({ userId }, (tx) =>
      tx.user.update({ where: { id: userId }, data: { muteRoutineNotifications } }),
    );
    // Critical alerts cannot be muted (PLAN §8); only routine board/alight pushes are affected.
    return { muteRoutineNotifications, criticalAlertsMutable: false };
  }

  /** New address must be confirmed by a code sent to it before it replaces the old one. */
  async requestEmailChange(userId: string, newEmail: string, password: string, ip: string | null) {
    const user = await this.requirePassword(userId, password);
    if (newEmail === user.email) throw Errors.badRequest('email_unchanged');
    const taken = await this.prisma.system.user.findUnique({ where: { email: newEmail } });
    if (taken) throw Errors.conflict('email_taken');
    await this.codes.issue({
      userId,
      purpose: 'change_email',
      targetEmail: newEmail,
      locale: user.preferredLocale,
      ip,
    });
  }

  async confirmEmailChange(userId: string, code: string) {
    const { targetEmail } = await this.codes.consume(userId, 'change_email', code);
    await this.prisma.systemTx(async (tx) => {
      const taken = await tx.user.findUnique({ where: { email: targetEmail } });
      if (taken) throw Errors.conflict('email_taken');
      await tx.user.update({
        where: { id: userId },
        data: { email: targetEmail, emailVerifiedAt: new Date() },
      });
    });
    return this.profile(userId);
  }

  /**
   * Account deletion (required by Apple for apps with sign-up, PLAN §5.1). Personal data is
   * removed; trip events and alerts stay for safety and legal reasons (PLAN §14). Children with
   * no other guardian are unlinked from every organisation and their photos deleted.
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    await this.requirePassword(userId, password);
    const now = new Date();
    await this.prisma.systemTx(async (tx) => {
      const links = await tx.studentGuardian.findMany({
        where: { guardianUserId: userId },
        select: { studentId: true },
      });
      for (const link of links) await removeChildForGuardian(tx, link.studentId, userId, now);
      await tx.membership.updateMany({ where: { userId }, data: { status: 'revoked' } });
      await tx.pushSubscription.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await this.tokens.revokeAllForUser(tx, userId);
      await tx.user.update({
        where: { id: userId },
        data: {
          status: 'deleted',
          deletedAt: now,
          email: `deleted-${userId}@deleted.invalid`,
          fullNameAr: 'حساب محذوف',
          fullNameEn: null,
          phoneE164: '+10000000000',
          passwordHash: '!deleted',
          totpSecretEncrypted: null,
        },
      });
    });
  }

  /** Starts TOTP enrolment: a new secret, not active until a code from it is confirmed. */
  async setupTotp(userId: string, password: string) {
    const user = await this.requirePassword(userId, password);
    if (user.totpEnabledAt) throw Errors.conflict('totp_already_enabled');
    const secret = generateTotpSecret();
    await this.prisma.system.user.update({
      where: { id: userId },
      data: { totpSecretEncrypted: encryptField(secret, this.config.fieldEncryptionKey) },
    });
    return { secret, otpauthUri: otpauthUri(secret, user.email) };
  }

  async enableTotp(userId: string, code: string) {
    const user = await this.prisma.system.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totpEnabledAt) throw Errors.conflict('totp_already_enabled');
    if (!user.totpSecretEncrypted) throw Errors.badRequest('totp_not_set_up');
    const secret = decryptField(user.totpSecretEncrypted, this.config.fieldEncryptionKey);
    if (!verifyTotp(secret, code)) throw Errors.badRequest('totp_invalid');
    await this.prisma.system.user.update({
      where: { id: userId },
      data: { totpEnabledAt: new Date() },
    });
    return { totpEnabled: true };
  }

  async disableTotp(userId: string, password: string, code: string) {
    const user = await this.requirePassword(userId, password);
    if (!user.totpEnabledAt || !user.totpSecretEncrypted)
      throw Errors.badRequest('totp_not_enabled');
    const secret = decryptField(user.totpSecretEncrypted, this.config.fieldEncryptionKey);
    if (!verifyTotp(secret, code)) throw Errors.badRequest('totp_invalid');
    await this.prisma.system.user.update({
      where: { id: userId },
      data: { totpEnabledAt: null, totpSecretEncrypted: null },
    });
    return { totpEnabled: false };
  }

  /**
   * Changes the password with the current one as proof. Every other session is signed out; this
   * device gets a fresh session so the user stays signed in here.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    deviceInfo?: string | null,
  ) {
    const user = await this.requirePassword(userId, currentPassword);
    const weak = checkPasswordPolicy(newPassword, {
      email: user.email,
      names: [user.fullNameAr, user.fullNameEn],
    });
    if (weak) throw Errors.badRequest(weak);
    if (await verifyPassword(user.passwordHash, newPassword))
      throw Errors.badRequest('password_unchanged');
    const passwordHash = await hashPassword(newPassword);
    return this.prisma.systemTx(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await this.tokens.revokeAllForUser(tx, userId);
      return this.tokens.issue(tx, user, deviceInfo);
    });
  }

  private async requirePassword(userId: string, password: string) {
    const user = await this.prisma.system.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'active') throw Errors.unauthorized();
    if (!(await verifyPassword(user.passwordHash, password))) {
      throw Errors.forbidden('password_incorrect');
    }
    return user;
  }
}
