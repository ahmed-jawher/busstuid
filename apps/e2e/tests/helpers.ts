import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Browser, type Page } from '@playwright/test';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));

export interface E2EState {
  webUrl: string;
  apiUrl: string;
  mailUrl: string;
  dbUrl: string;
  photo: string;
}

export const state = (): E2EState =>
  JSON.parse(readFileSync(path.join(here, '..', '.state.json'), 'utf8'));

/** Seeded accounts (apps/api/prisma/seed.ts) — local test fixtures only. */
export const SEED_PASSWORD = 'Wusool-Dev-Seed-2026';
export const SEED = {
  schoolAdmin: 'school.admin@example.com',
  driverOne: 'driver.one@example.com',
  independentDriver: 'independent.driver@example.com',
};

export const SCREENSHOTS = path.join(here, '..', 'screenshots');

/**
 * Headless Chromium has no push service, so the browser side of Web Push is stubbed; the API
 * uses the log-only provider. Everything else (service worker, API calls, storage) is real.
 */
const PUSH_STUB = `
  (() => {
    const bytes = (n) => new Uint8Array(n).fill(7).buffer;
    let current = null;
    const make = () => ({
      endpoint: 'https://push.e2e.invalid/' + crypto.randomUUID(),
      getKey: (k) => bytes(k === 'p256dh' ? 65 : 16),
      unsubscribe: async () => { current = null; return true; },
    });
    if (window.PushManager) {
      PushManager.prototype.subscribe = async function () { current = current || make(); return current; };
      PushManager.prototype.getSubscription = async function () { return current; };
    }
  })();
`;

export async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript(PUSH_STUB);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  return page;
}

export async function signIn(page: Page, email: string, password = SEED_PASSWORD) {
  await page.goto(`${state().webUrl}/login`);
  await page.getByLabel('البريد الإلكتروني').fill(email);
  await page.getByLabel('كلمة المرور').fill(password);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** The 6-digit code from the newest email to `to` in the mail catcher. */
export async function latestCode(to: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${state().mailUrl}/api/messages?to=${encodeURIComponent(to)}`);
    const list = (await res.json()) as { text: string }[];
    const code = list[0]?.text.match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no code for ${to}`);
}

export async function enableNotifications(page: Page) {
  await page.goto(`${state().webUrl}/notifications/setup`);
  await page.getByRole('button', { name: /تفعيل الإشعارات|أرسل إشعاراً تجريبياً/ }).click();
  await expect(page.getByText('أُرسل إشعار تجريبي')).toBeVisible();
}

export async function db<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: state().dbUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SCREENSHOTS, `${name}.png`), fullPage: true });
}
