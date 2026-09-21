import type {
  PushMessage,
  PushOptions,
  PushProvider,
  PushResult,
  PushTarget,
} from './push.provider';

/** Sends each message through the provider of its subscription (web, Android or iOS). */
export class RoutingPushProvider implements PushProvider {
  constructor(private readonly providers: Partial<Record<PushTarget['provider'], PushProvider>>) {}

  has(provider: PushTarget['provider']): boolean {
    return provider in this.providers;
  }

  async send(target: PushTarget, message: PushMessage, options: PushOptions): Promise<PushResult> {
    const provider = this.providers[target.provider];
    if (!provider) return { ok: false, gone: false, error: `${target.provider}_not_configured` };
    return provider.send(target, message, options);
  }
}
