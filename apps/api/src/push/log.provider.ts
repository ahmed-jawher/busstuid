import { Logger } from '@nestjs/common';
import type {
  PushMessage,
  PushOptions,
  PushProvider,
  PushResult,
  PushTarget,
} from './push.provider';

/**
 * Records pushes in the log instead of sending them. For end-to-end tests, where the headless
 * browser has no real push service; configuration refuses it in production.
 */
export class LogPushProvider implements PushProvider {
  private readonly logger = new Logger('LogPush');

  async send(target: PushTarget, message: PushMessage, options: PushOptions): Promise<PushResult> {
    this.logger.log(
      `push → ${target.endpoint.slice(-12)} [${options.urgency}] ${message.title}: ${message.body}`,
    );
    return { ok: true };
  }
}
