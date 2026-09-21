import { z } from 'zod';

// Capacitor serves the wrapped app from these origins (PLAN §9.1).
const CAPACITOR_ORIGINS = ['capacitor://localhost', 'https://localhost', 'http://localhost'];

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required — run `pnpm run setup`'),
  WEB_ORIGINS: z.string().default('http://localhost:5173'),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  corsOrigins: string[];
}

export const APP_CONFIG = Symbol('APP_CONFIG');

export function parseConfig(env: NodeJS.ProcessEnv): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${issues.join('\n')}`);
  }
  const e = result.data;
  const webOrigins = e.WEB_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return {
    nodeEnv: e.NODE_ENV,
    port: e.API_PORT,
    databaseUrl: e.DATABASE_URL,
    corsOrigins: [...new Set([...webOrigins, ...CAPACITOR_ORIGINS])],
  };
}
