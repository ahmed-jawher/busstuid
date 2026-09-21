export interface RunningPostgres {
  url: string;
  stop(): Promise<void>;
}

export function startDevPostgres(options: {
  dataDir: string;
  port?: number;
  user?: string;
  password: string;
  database?: string;
  log?: boolean;
}): Promise<RunningPostgres & { reused: boolean }>;

export function startTestPostgres(options?: {
  database?: string;
}): Promise<RunningPostgres & { port: number }>;

export interface CaughtMail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  receivedAt: string;
}

export function startMailCatcher(options?: {
  smtpPort?: number;
  httpPort?: number;
  host?: string;
}): Promise<{
  smtpPort: number;
  httpPort: number;
  messages: CaughtMail[];
  stop(): Promise<void>;
}>;

export function startStack(options?: {
  quiet?: boolean;
}): Promise<{ databaseUrl: string; stop(): Promise<void> }>;

export function findRepoRoot(start?: string): string;
export function readEnvFile(file: string): Record<string, string>;
export function getFreePort(): Promise<number>;
export function isPortInUse(port: number, host?: string): Promise<boolean>;
