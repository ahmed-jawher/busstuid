import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Errors } from '../common/api-error';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { PrismaService, type Tx } from '../database/prisma.service';
import { signJwt } from './jwt';

export const ACCESS_TTL_SECONDS = 15 * 60;
// Long sessions so drivers and guardians rarely sign in again (PLAN §5.1).
export const REFRESH_TTL_MS = 90 * 24 * 3_600_000;

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('base64url');

@Injectable()
export class TokensService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  accessToken(user: { id: string; emailVerifiedAt: Date | null }): string {
    return signJwt(
      { sub: user.id, ev: user.emailVerifiedAt !== null },
      this.config.jwtAccessSecret,
      ACCESS_TTL_SECONDS,
    );
  }

  async issue(
    tx: Tx,
    user: { id: string; emailVerifiedAt: Date | null },
    deviceInfo?: string | null,
    familyId: string = randomUUID(),
  ): Promise<TokenPair> {
    const refreshToken = randomBytes(32).toString('base64url');
    await tx.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        familyId,
        deviceInfo: deviceInfo ?? null,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return {
      accessToken: this.accessToken(user),
      accessTokenExpiresIn: ACCESS_TTL_SECONDS,
      refreshToken,
    };
  }

  /**
   * Rotates a refresh token. Presenting a token that was already rotated or revoked means it
   * leaked, so the whole family is revoked.
   */
  async rotate(refreshToken: string): Promise<TokenPair> {
    const outcome = await this.prisma.systemTx(async (tx) => {
      const row = await tx.refreshToken.findUnique({
        where: { tokenHash: sha256(refreshToken) },
        include: { user: { select: { id: true, emailVerifiedAt: true, status: true } } },
      });
      if (!row) return { error: 'refresh_invalid' } as const;
      if (row.revokedAt || row.replacedAt) {
        await tx.refreshToken.updateMany({
          where: { familyId: row.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return { error: 'refresh_reused' } as const;
      }
      if (row.expiresAt.getTime() <= Date.now() || row.user.status !== 'active') {
        return { error: 'refresh_invalid' } as const;
      }
      const claimed = await tx.refreshToken.updateMany({
        where: { id: row.id, replacedAt: null, revokedAt: null },
        data: { replacedAt: new Date() },
      });
      if (claimed.count !== 1) return { error: 'refresh_reused' } as const;
      return { tokens: await this.issue(tx, row.user, row.deviceInfo, row.familyId) } as const;
    });
    // Errors are thrown outside the transaction so the family revocation is committed.
    if ('error' in outcome) throw Errors.unauthorized(outcome.error);
    return outcome.tokens;
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.system.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(tx: Tx, userId: string): Promise<void> {
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
