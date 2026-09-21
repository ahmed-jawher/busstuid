import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { APP_CONFIG, type AppConfig } from '../config/env';

export type Tx = Prisma.TransactionClient;

export interface DbContext {
  userId: string;
  /** Organisation the request acts in; omitted for guardian/personal requests. */
  orgId?: string | null;
}

const TX_OPTIONS = { maxWait: 5_000, timeout: 15_000 } as const;

/**
 * Two connection pools:
 * - `withContext` runs as `wusool_app`, inside a transaction that sets the RLS context
 *   (PLAN §10). Use it for everything a user does.
 * - `system` runs as `wusool_system` (bypasses RLS) for sign-in flows, background jobs and the
 *   few narrow cross-tenant reads that are checked in code. Use it deliberately.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly app: PrismaClient;
  readonly system: PrismaClient;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.app = new PrismaClient({ datasourceUrl: config.databaseUrl });
    this.system = new PrismaClient({ datasourceUrl: config.databaseSystemUrl });
  }

  async withContext<T>(ctx: DbContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${ctx.userId}, true),
                                  set_config('app.current_org_id', ${ctx.orgId ?? ''}, true)`;
      return fn(tx);
    }, TX_OPTIONS);
  }

  /** System-role transaction (no RLS). */
  async systemTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.system.$transaction(fn, TX_OPTIONS);
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.system.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.app.$disconnect(), this.system.$disconnect()]);
  }
}
