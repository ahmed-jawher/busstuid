import type { EmailMessage, EmailProvider } from '../../src/email/email.provider';
import type {
  PushMessage,
  PushOptions,
  PushProvider,
  PushResult,
  PushTarget,
} from '../../src/push/push.provider';
import { targetAddress } from '../../src/push/push.provider';

/** Records emails instead of sending them. */
export class CapturingEmailProvider implements EmailProvider {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }

  /** The 6-digit code from the most recent email to `to`. */
  lastCode(to: string): string {
    const mail = [...this.sent].reverse().find((m) => m.to === to);
    const code = mail?.text.match(/\b(\d{6})\b/)?.[1];
    if (!code) throw new Error(`no code emailed to ${to}`);
    return code;
  }

  countTo(to: string): number {
    return this.sent.filter((m) => m.to === to).length;
  }
}

/** Records pushes; endpoints can be marked gone to simulate expired subscriptions. */
export class FakePushProvider implements PushProvider {
  readonly sent: { target: PushTarget; message: PushMessage; options: PushOptions }[] = [];
  readonly goneEndpoints = new Set<string>();

  async send(target: PushTarget, message: PushMessage, options: PushOptions): Promise<PushResult> {
    if (this.goneEndpoints.has(targetAddress(target)))
      return { ok: false, gone: true, error: '410: gone' };
    this.sent.push({ target, message, options });
    return { ok: true };
  }
}
