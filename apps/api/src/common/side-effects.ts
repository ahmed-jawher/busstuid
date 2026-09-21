import { Global, Injectable, Logger, Module } from '@nestjs/common';

/**
 * Work that must happen after a transaction commits (sending pushes, kicking escalation) without
 * making the request wait for slow push services. Failures are logged; everything important is
 * also retried by the minute jobs, since the state lives in the database (PLAN §12).
 * Tests call `drain()` to wait for pending effects deterministically.
 */
@Injectable()
export class SideEffects {
  private readonly logger = new Logger('SideEffects');
  private readonly pending = new Set<Promise<unknown>>();

  run(label: string, fn: () => Promise<unknown>): void {
    const p = fn()
      .catch((e: unknown) =>
        this.logger.error(`${label} failed: ${e instanceof Error ? e.stack : String(e)}`),
      )
      .finally(() => this.pending.delete(p));
    this.pending.add(p);
  }

  async drain(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }
}

@Global()
@Module({ providers: [SideEffects], exports: [SideEffects] })
export class SideEffectsModule {}
