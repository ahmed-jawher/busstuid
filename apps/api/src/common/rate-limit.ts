import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  Throttle,
  ThrottlerGuard,
  ThrottlerModule,
  ThrottlerStorage,
  type ThrottlerModuleOptions,
} from '@nestjs/throttler';
import { APP_CONFIG, type AppConfig } from '../config/env';

const MINUTE = 60_000;

/**
 * Per-IP limits (PLAN §17 phase 5). Generous by default — a school's drivers may share one
 * network address — and strict where guessing or enumeration is possible. They add to, not
 * replace, the per-account lockout and the per-address email-code limits.
 */
export const RateLimitModule = ThrottlerModule.forRoot({
  throttlers: [{ name: 'default', ttl: MINUTE, limit: 600 }],
});

export const StrictLimit = {
  /**
   * Password guessing. Wide enough that a family, a staff room or a school bus depot behind one
   * address can all sign in at the same minute; guessing is really stopped by the per-account
   * lockout after ten wrong passwords.
   */
  login: () => Throttle({ default: { limit: 60, ttl: MINUTE } }),
  /**
   * Anything that sends an email. Counted per address as well as per network (see `getTracker`),
   * so two parents signing up side by side never take each other's turn — which is what the
   * "too many requests" complaints were. The real protection against mass email is the
   * per-address limit of five codes an hour in EmailCodesService.
   */
  email: () => Throttle({ default: { limit: 10, ttl: MINUTE } }),
  /** Code guessing (codes also die after 5 wrong attempts). */
  code: () => Throttle({ default: { limit: 20, ttl: MINUTE } }),
  /** Phone-number enumeration of independent drivers. */
  lookup: () => Throttle({ default: { limit: 30, ttl: MINUTE } }),
};

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    super(options, storage, reflector);
  }

  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    return !this.config.rateLimitEnabled || super.shouldSkip(context);
  }

  /**
   * Counts per network address and, when the request names an email address, per address too.
   * A school, a home or a mobile network puts many people behind one address; without this, the
   * second parent to sign up in the same minute was told to wait. It does not weaken anything:
   * sign-in sends no `email` field, so password attempts stay counted per network only.
   */
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const network = await super.getTracker(req);
    const body = req.body as { email?: unknown } | undefined;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    return email ? `${network}|${email.slice(0, 254)}` : network;
  }
}
