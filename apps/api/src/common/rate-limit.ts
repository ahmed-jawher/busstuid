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
  /** Password guessing. */
  login: () => Throttle({ default: { limit: 10, ttl: MINUTE } }),
  /** Anything that sends an email. */
  email: () => Throttle({ default: { limit: 5, ttl: MINUTE } }),
  /** Code guessing (codes also die after 5 wrong attempts). */
  code: () => Throttle({ default: { limit: 10, ttl: MINUTE } }),
  /** Phone-number enumeration of independent drivers. */
  lookup: () => Throttle({ default: { limit: 20, ttl: MINUTE } }),
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
}
