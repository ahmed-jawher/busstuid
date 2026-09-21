import i18n from 'i18next';
import { ApiError } from './api';

/** Human message for an API error code, in the current language. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const key = `errors.${e.code}`;
    if (i18n.exists(key)) {
      const d = e.details as { attemptsLeft?: number; retryAfterSeconds?: number } | undefined;
      return i18n.t(key, { attemptsLeft: d?.attemptsLeft, seconds: d?.retryAfterSeconds });
    }
    return i18n.t(e.status === 0 ? 'errors.network_error' : 'errors.generic');
  }
  return i18n.t('errors.generic');
}

/** First field-level message of a `validation_failed` error, keyed by field path. */
export function fieldErrors(e: unknown): Record<string, string> {
  if (!(e instanceof ApiError) || e.code !== 'validation_failed') return {};
  const issues = (e.details?.issues ?? []) as { path: string; message: string }[];
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = `errors.${i.message}`;
    out[i.path] ??= i18n.exists(key) ? i18n.t(key) : i18n.t('errors.invalid_value');
  }
  return out;
}
