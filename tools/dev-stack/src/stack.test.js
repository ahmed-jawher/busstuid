import nodemailer from 'nodemailer';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getFreePort, startMailCatcher, startTestPostgres } from './index.js';

describe('startTestPostgres', () => {
  let db;
  beforeAll(async () => {
    db = await startTestPostgres();
  }, 120_000);
  afterAll(() => db?.stop());

  it('runs a real PostgreSQL 16 with UTF-8 encoding', async () => {
    const client = new pg.Client({ connectionString: db.url });
    await client.connect();
    const { rows } = await client.query(
      `SELECT current_setting('server_version_num')::int AS v,
              pg_encoding_to_char(encoding) AS enc
         FROM pg_database WHERE datname = current_database()`,
    );
    await client.end();
    expect(rows[0].v).toBeGreaterThanOrEqual(160000);
    expect(rows[0].enc).toBe('UTF8');
  });
});

describe('startMailCatcher', () => {
  let mail;
  beforeAll(async () => {
    mail = await startMailCatcher({ smtpPort: await getFreePort(), httpPort: await getFreePort() });
  });
  afterAll(() => mail?.stop());

  it('captures messages and exposes them over HTTP', async () => {
    const transport = nodemailer.createTransport({
      host: '127.0.0.1',
      port: mail.smtpPort,
      secure: false,
      ignoreTLS: true,
    });
    await transport.sendMail({
      from: 'app@wusool.test',
      to: 'parent@example.com',
      subject: 'رمز التأكيد',
      text: 'الرمز: 123456',
    });
    const res = await fetch(`http://127.0.0.1:${mail.httpPort}/api/messages?to=parent@example.com`);
    const list = await res.json();
    expect(list).toHaveLength(1);
    expect(list[0].subject).toBe('رمز التأكيد');
    expect(list[0].text).toContain('123456');
  });
});
