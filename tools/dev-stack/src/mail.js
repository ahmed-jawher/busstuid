// Local SMTP catcher + web inbox, replacing Mailpit so development needs no Docker (PLAN §9.2).
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { simpleParser } from 'mailparser';
import { SMTPServer } from 'smtp-server';

const MAX_MESSAGES = 500;

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

function renderInbox(messages) {
  const rows = messages
    .map(
      (m) => `<article>
  <header><strong>${escapeHtml(m.subject)}</strong><span>${escapeHtml(m.to.join(', '))}</span><time>${escapeHtml(m.receivedAt)}</time></header>
  <pre>${escapeHtml(m.text)}</pre>
</article>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="5"><title>بريد التطوير</title>
<style>
body{font-family:Tahoma,system-ui,sans-serif;margin:0;padding:16px;background:#f6f6f6;color:#161616}
h1{font-size:20px}article{background:#fff;border:1px solid #ddd;border-radius:10px;padding:12px;margin-bottom:12px}
header{display:flex;flex-wrap:wrap;gap:12px;font-size:14px}pre{white-space:pre-wrap;font-family:inherit}
time{color:#666}
</style></head><body>
<h1>بريد التطوير (${messages.length})</h1>
${rows || '<p>لا توجد رسائل بعد.</p>'}
</body></html>`;
}

export async function startMailCatcher({
  smtpPort = 1025,
  httpPort = 8025,
  host = '127.0.0.1',
} = {}) {
  const messages = [];

  const smtp = new SMTPServer({
    authOptional: true,
    disabledCommands: ['STARTTLS'],
    logger: false,
    onData(stream, _session, callback) {
      simpleParser(stream)
        .then((parsed) => {
          messages.unshift({
            id: randomUUID(),
            from: parsed.from?.text ?? '',
            to: [parsed.to]
              .flat()
              .filter(Boolean)
              .flatMap((a) => a.value.map((v) => v.address)),
            subject: parsed.subject ?? '',
            text: parsed.text ?? '',
            html: typeof parsed.html === 'string' ? parsed.html : '',
            receivedAt: new Date().toISOString(),
          });
          messages.length = Math.min(messages.length, MAX_MESSAGES);
          callback();
        })
        .catch(callback);
    },
  });

  const web = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${host}`);
    if (url.pathname === '/api/messages' && req.method === 'GET') {
      const to = url.searchParams.get('to')?.toLowerCase();
      const list = to ? messages.filter((m) => m.to.some((a) => a.toLowerCase() === to)) : messages;
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(list));
    }
    if (url.pathname === '/api/messages' && req.method === 'DELETE') {
      messages.length = 0;
      res.writeHead(204);
      return res.end();
    }
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(renderInbox(messages));
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve, reject) => {
    smtp.server.once('error', reject);
    smtp.listen(smtpPort, host, resolve);
  });
  await new Promise((resolve, reject) => {
    web.once('error', reject);
    web.listen(httpPort, host, resolve);
  });

  return {
    smtpPort: smtp.server.address().port,
    httpPort: web.address().port,
    messages,
    stop: () =>
      Promise.all([new Promise((r) => smtp.close(r)), new Promise((r) => web.close(r))]).then(
        () => undefined,
      ),
  };
}
