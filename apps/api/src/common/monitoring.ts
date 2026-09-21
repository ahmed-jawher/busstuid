import * as Sentry from '@sentry/node';
import type { AppConfig } from '../config/env';

let enabled = false;

/**
 * Error monitoring is optional (PLAN §20.3): Sentry starts only when SENTRY_DSN is set, so no
 * account is needed to run the system. Request bodies, headers and user data are never sent.
 */
export function initMonitoring(config: AppConfig): void {
  if (!config.sentryDsn) return;
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.nodeEnv,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      delete event.request;
      delete event.user;
      return event;
    },
  });
  enabled = true;
}

export function reportError(error: unknown): void {
  if (enabled) Sentry.captureException(error);
}
