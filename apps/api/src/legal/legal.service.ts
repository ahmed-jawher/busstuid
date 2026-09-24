import { Injectable } from '@nestjs/common';
import { LEGAL_VERSION, type LegalDocumentKind } from '@wusool/shared';
import { PrismaService } from '../database/prisma.service';
import type { Tx } from '../database/prisma.service';

export interface AcceptanceContext {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Who agreed to what, and when (PLAN §14). Acceptances are append-only evidence: one row per
 * account, document and version, kept even after the account is closed.
 */
@Injectable()
export class LegalService {
  constructor(private readonly prisma: PrismaService) {}

  /** Records an acceptance inside an existing transaction (used by sign-up). */
  static async recordInTx(
    tx: Tx,
    userId: string,
    documents: readonly LegalDocumentKind[],
    version: string,
    context: AcceptanceContext = {},
  ): Promise<void> {
    await tx.legalAcceptance.createMany({
      data: documents.map((document) => ({
        userId,
        document,
        version,
        ip: context.ip ?? null,
        userAgent: context.userAgent?.slice(0, 300) ?? null,
      })),
      // Agreeing twice to the same version is not an error; the first record stands.
      skipDuplicates: true,
    });
    if (documents.includes('terms')) {
      await tx.user.update({
        where: { id: userId },
        data: { termsVersion: version, termsAcceptedAt: new Date() },
      });
    }
  }

  /** The person agrees again after the documents changed, or a driver acknowledges the rules. */
  async accept(
    userId: string,
    documents: readonly LegalDocumentKind[],
    version: string,
    context: AcceptanceContext = {},
  ): Promise<{ version: string; acceptedAt: Date }> {
    await this.prisma.systemTx((tx) =>
      LegalService.recordInTx(tx, userId, documents, version, context),
    );
    return { version, acceptedAt: new Date() };
  }

  /** What this account has agreed to, and whether anything newer is waiting. */
  async statusOf(userId: string) {
    const rows = await this.prisma.withContext({ userId }, (tx) =>
      tx.legalAcceptance.findMany({
        where: { userId },
        select: { document: true, version: true, acceptedAt: true },
        orderBy: { acceptedAt: 'desc' },
      }),
    );
    const newest = new Map<string, { version: string; acceptedAt: Date }>();
    for (const row of rows) if (!newest.has(row.document)) newest.set(row.document, row);
    return {
      currentVersion: LEGAL_VERSION,
      accepted: Object.fromEntries(newest),
      /** True while the person still has to agree before using the app. */
      mustAccept: !(
        newest.get('terms')?.version === LEGAL_VERSION &&
        newest.get('privacy')?.version === LEGAL_VERSION
      ),
    };
  }
}
