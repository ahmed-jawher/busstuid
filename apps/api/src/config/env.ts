import { z } from 'zod';

// Capacitor serves the wrapped app from these origins (PLAN §9.1).
const CAPACITOR_ORIGINS = ['capacitor://localhost', 'https://localhost', 'http://localhost'];

const secret = (name: string) =>
  z.string().min(32, `${name} must be at least 32 characters — run \`pnpm run setup\``);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  /** Request-serving role, subject to Row Level Security. */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required — run `pnpm run setup`'),
  /** Sign-in flows and background jobs; bypasses RLS, so use deliberately. */
  DATABASE_SYSTEM_URL: z.string().min(1, 'DATABASE_SYSTEM_URL is required — run `pnpm run setup`'),
  WEB_ORIGINS: z.string().default('http://localhost:5173'),
  /** Public base URL of the API, used to build absolute photo links. */
  PUBLIC_API_URL: z.string().url().default('http://localhost:3000/v1'),
  JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: secret('JWT_REFRESH_SECRET'),
  FIELD_ENCRYPTION_KEY: z.string().min(40, 'FIELD_ENCRYPTION_KEY must be 32 random bytes (base64)'),
  PHOTO_URL_SECRET: secret('PHOTO_URL_SECRET'),
  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z.string().min(1).default('mailto:dev@wusool.local'),
  SMTP_HOST: z.string().default('127.0.0.1'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('Wusool Safe <no-reply@wusool.local>'),
  /** Background jobs (pg-boss). Off by default in tests, which call the services directly. */
  JOBS_ENABLED: z.enum(['true', 'false']).optional(),
  /** 'log' records pushes instead of sending them (end-to-end tests); refused in production. */
  PUSH_PROVIDER: z.enum(['webpush', 'log']).default('webpush'),
  /** Per-IP rate limits (PLAN §17 phase 5). Off by default in tests. */
  RATE_LIMIT_ENABLED: z.enum(['true', 'false']).optional(),
  /** Number of reverse proxies in front of the API (Caddy in production), for client IPs. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  SENTRY_DSN: z.string().url().optional().or(z.literal('')),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  databaseSystemUrl: string;
  corsOrigins: string[];
  publicApiUrl: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  fieldEncryptionKey: string;
  photoUrlSecret: string;
  vapid: { publicKey: string; privateKey: string; subject: string };
  smtp: { host: string; port: number; secure: boolean; user?: string; password?: string };
  mailFrom: string;
  jobsEnabled: boolean;
  pushProvider: 'webpush' | 'log';
  rateLimitEnabled: boolean;
  trustProxyHops: number;
  sentryDsn: string | null;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

export function parseConfig(env: NodeJS.ProcessEnv): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${issues.join('\n')}`);
  }
  const e = result.data;
  if (e.NODE_ENV === 'production' && e.PUSH_PROVIDER !== 'webpush') {
    throw new Error('Invalid environment:\n  PUSH_PROVIDER: only webpush is allowed in production');
  }
  const webOrigins = e.WEB_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return {
    nodeEnv: e.NODE_ENV,
    port: e.API_PORT,
    databaseUrl: e.DATABASE_URL,
    databaseSystemUrl: e.DATABASE_SYSTEM_URL,
    corsOrigins: [...new Set([...webOrigins, ...CAPACITOR_ORIGINS])],
    publicApiUrl: e.PUBLIC_API_URL.replace(/\/+$/, ''),
    jwtAccessSecret: e.JWT_ACCESS_SECRET,
    jwtRefreshSecret: e.JWT_REFRESH_SECRET,
    fieldEncryptionKey: e.FIELD_ENCRYPTION_KEY,
    photoUrlSecret: e.PHOTO_URL_SECRET,
    vapid: {
      publicKey: e.VAPID_PUBLIC_KEY,
      privateKey: e.VAPID_PRIVATE_KEY,
      subject: e.VAPID_SUBJECT,
    },
    smtp: {
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_SECURE,
      user: e.SMTP_USER || undefined,
      password: e.SMTP_PASSWORD || undefined,
    },
    mailFrom: e.MAIL_FROM,
    jobsEnabled: e.JOBS_ENABLED ? e.JOBS_ENABLED === 'true' : e.NODE_ENV !== 'test',
    pushProvider: e.PUSH_PROVIDER,
    rateLimitEnabled: e.RATE_LIMIT_ENABLED
      ? e.RATE_LIMIT_ENABLED === 'true'
      : e.NODE_ENV !== 'test',
    trustProxyHops: e.TRUST_PROXY_HOPS,
    sentryDsn: e.SENTRY_DSN || null,
  };
}
