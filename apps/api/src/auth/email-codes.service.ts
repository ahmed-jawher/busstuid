import { Inject, Injectable } from '@nestjs/common';
import type { EmailCodePurpose, Locale } from '@wusool/shared';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Errors } from '../common/api-error';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { PrismaService, type Tx } from '../database/prisma.service';
import { EMAIL_PROVIDER, type EmailProvider } from '../email/email.provider';
import { codeEmail } from '../email/templates';

// PLAN §5.1: 6 digits, valid 10 minutes, 5 attempts, resend after 60 s, 5 emails/hour/address.
export const CODE_TTL_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60_000;
export const MAX_CODES_PER_HOUR = 5;

@Injectable()
export class EmailCodesService {
  private readonly pepper: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    // Keyed hash: a leaked table cannot be brute-forced over the 10^6 code space without the key.
    this.pepper = createHmac('sha256', Buffer.from(config.fieldEncryptionKey, 'base64'))
      .update('email-code-pepper')
      .digest();
  }

  private hash(code: string, codeId: string): string {
    return createHmac('sha256', this.pepper).update(`${codeId}:${code}`).digest('base64url');
  }

  /** Creates and emails a new code, superseding older unused ones. */
  async issue(input: {
    userId: string;
    purpose: EmailCodePurpose;
    targetEmail: string;
    locale: Locale;
    ip?: string | null;
  }): Promise<void> {
    const now = Date.now();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');

    await this.prisma.systemTx(async (tx) => {
      // Serialise concurrent requests for the same address so the limits hold.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'email-code:' + input.targetEmail}))`;
      const last = await tx.emailCode.findFirst({
        where: { userId: input.userId, purpose: input.purpose },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (last && now - last.createdAt.getTime() < RESEND_COOLDOWN_MS) {
        const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - last.createdAt.getTime())) / 1000);
        throw Errors.tooMany('resend_too_soon', wait);
      }
      const sentLastHour = await tx.emailCode.count({
        where: { targetEmail: input.targetEmail, createdAt: { gt: new Date(now - 3_600_000) } },
      });
      if (sentLastHour >= MAX_CODES_PER_HOUR) throw Errors.tooMany('too_many_codes', 3600);

      await tx.emailCode.updateMany({
        where: { userId: input.userId, purpose: input.purpose, consumedAt: null },
        data: { expiresAt: new Date(now) },
      });
      const row = await tx.emailCode.create({
        data: {
          userId: input.userId,
          purpose: input.purpose,
          targetEmail: input.targetEmail,
          codeHash: 'pending',
          expiresAt: new Date(now + CODE_TTL_MS),
          requestIp: input.ip ?? null,
        },
        select: { id: true },
      });
      await tx.emailCode.update({
        where: { id: row.id },
        data: { codeHash: this.hash(code, row.id) },
      });
    });

    await this.email.send(codeEmail(input.targetEmail, input.purpose, code, input.locale));
  }

  /**
   * Checks and consumes the latest code in its own transaction. Wrong guesses count towards the
   * 5-attempt limit; after that the code is dead even if the right digits arrive.
   *
   * The attempt counter must be committed before the error is thrown — throwing inside a shared
   * transaction would roll the increment back and silently disable the limit.
   */
  async consume(
    userId: string,
    purpose: EmailCodePurpose,
    code: string,
  ): Promise<{ targetEmail: string }> {
    type Outcome =
      { ok: true; targetEmail: string } | { ok: false; error: string; attemptsLeft?: number };
    const outcome = await this.prisma.systemTx(async (tx: Tx): Promise<Outcome> => {
      const rows = await tx.$queryRaw<
        {
          id: string;
          code_hash: string;
          expires_at: Date;
          attempts: number;
          target_email: string;
        }[]
      >`SELECT id, code_hash, expires_at, attempts, target_email FROM email_codes
         WHERE user_id = ${userId}::uuid AND purpose = ${purpose}::"EmailCodePurpose"
           AND consumed_at IS NULL
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`;
      const row = rows[0];
      if (!row || row.expires_at.getTime() <= Date.now())
        return { ok: false, error: 'code_expired' };
      if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: 'code_attempts_exceeded' };

      const expected = Buffer.from(row.code_hash);
      const given = Buffer.from(this.hash(code, row.id));
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
        const attempts = row.attempts + 1;
        await tx.emailCode.update({ where: { id: row.id }, data: { attempts } });
        return {
          ok: false,
          error: attempts >= MAX_ATTEMPTS ? 'code_attempts_exceeded' : 'code_invalid',
          attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempts),
        };
      }
      await tx.emailCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
      return { ok: true, targetEmail: row.target_email };
    });

    if (!outcome.ok) {
      throw Errors.badRequest(
        outcome.error,
        outcome.attemptsLeft !== undefined ? { attemptsLeft: outcome.attemptsLeft } : undefined,
      );
    }
    return { targetEmail: outcome.targetEmail };
  }
}
