import { platform } from '@/platform';

// Thin REST client for the API (PLAN §3.7). Bearer tokens only, never cookies (PLAN §9), so the
// same code works in the browser and inside the Capacitor WebView.

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/v1').replace(
  /\/+$/,
  '',
);
const REFRESH_KEY = 'refresh_token';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<(signedIn: boolean) => void>();

export const session = {
  get signedIn() {
    return accessToken !== null;
  },
  onChange(fn: (signedIn: boolean) => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  async store(tokens: Tokens) {
    accessToken = tokens.accessToken;
    await platform.secureStorage.set(REFRESH_KEY, tokens.refreshToken);
    listeners.forEach((l) => l(true));
  },
  async clear() {
    const refreshToken = await platform.secureStorage.get(REFRESH_KEY);
    accessToken = null;
    await platform.secureStorage.remove(REFRESH_KEY);
    listeners.forEach((l) => l(false));
    if (refreshToken) {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => undefined);
    }
  },
  /** Restores a session from the stored refresh token (long sessions, PLAN §5.1). */
  async restore(): Promise<boolean> {
    refreshing ??= (async () => {
      try {
        const refreshToken = await platform.secureStorage.get(REFRESH_KEY);
        if (!refreshToken) return false;
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (res.status === 401) {
          await platform.secureStorage.remove(REFRESH_KEY);
          accessToken = null;
          listeners.forEach((l) => l(false));
          return false;
        }
        if (!res.ok) return false; // offline or server trouble: keep the refresh token
        await session.store((await res.json()) as Tokens);
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  },
};

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  orgId?: string | null;
  signal?: AbortSignal;
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as {
      error?: { code?: string; details?: Record<string, unknown> };
    };
    return new ApiError(res.status, body.error?.code ?? 'error', body.error?.details);
  } catch {
    return new ApiError(res.status, res.status >= 500 ? 'server_error' : 'error');
  }
}

async function send(path: string, opts: RequestOptions, retried = false): Promise<Response> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (opts.orgId) headers['X-Organization-Id'] = opts.orgId;
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body,
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'network_error');
  }
  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    if (await session.restore()) return send(path, opts, true);
  }
  return res;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await send(path, opts);
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
