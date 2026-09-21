import { sign } from 'node:crypto';
import http2 from 'node:http2';

// The FCM and APNs providers talk HTTP through this small seam, so tests can replace the
// network with a fake sender and check exactly what would be sent (PLAN §20, phase 6).

export interface HttpRequest {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}

export interface HttpResponse {
  status: number;
  body: string;
}

export type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>;

const TIMEOUT_MS = 10_000;

/** HTTP/1.1 or HTTP/2 via fetch — enough for Google's endpoints. */
export const fetchTransport: HttpTransport = async (req) => {
  const res = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: res.status, body: await res.text() };
};

/**
 * HTTP/2 client with one reused connection per origin. APNs only speaks HTTP/2 and asks
 * providers to keep connections open rather than reconnect for each notification.
 */
export function createHttp2Transport(): HttpTransport {
  const sessions = new Map<string, http2.ClientHttp2Session>();

  const session = (origin: string) => {
    const existing = sessions.get(origin);
    if (existing && !existing.closed && !existing.destroyed) return existing;
    const s = http2.connect(origin);
    const forget = () => {
      if (sessions.get(origin) === s) sessions.delete(origin);
    };
    s.on('error', forget);
    s.on('close', forget);
    s.on('goaway', forget);
    // An idle connection must not keep a job runner or test process alive.
    s.unref();
    sessions.set(origin, s);
    return s;
  };

  return (req) =>
    new Promise((resolve, reject) => {
      const url = new URL(req.url);
      const stream = session(url.origin).request({
        ':method': req.method,
        ':path': url.pathname + url.search,
        ...req.headers,
      });
      let status = 0;
      let settled = false;
      const chunks: Buffer[] = [];
      const fail = (e: Error) => {
        if (!settled) {
          settled = true;
          reject(e);
        }
      };
      stream.setTimeout(TIMEOUT_MS, () => {
        fail(new Error('timeout'));
        stream.close(http2.constants.NGHTTP2_CANCEL);
      });
      stream.on('response', (headers) => {
        status = Number(headers[':status']);
      });
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        if (settled) return;
        settled = true;
        resolve({ status, body: Buffer.concat(chunks).toString('utf8') });
      });
      stream.on('error', fail);
      stream.on('close', () => fail(new Error('stream closed')));
      stream.end(req.body);
    });
}

/** Compact JWT signed with RS256 (Google) or ES256 (Apple). */
export function signJwt(
  header: { alg: 'RS256' | 'ES256'; [k: string]: string },
  claims: Record<string, string | number>,
  privateKeyPem: string,
): string {
  const encode = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const input = `${encode(header)}.${encode(claims)}`;
  const signature = sign(
    'sha256',
    Buffer.from(input),
    header.alg === 'ES256'
      ? { key: privateKeyPem, dsaEncoding: 'ieee-p1363' }
      : { key: privateKeyPem },
  );
  return `${input}.${signature.toString('base64url')}`;
}
