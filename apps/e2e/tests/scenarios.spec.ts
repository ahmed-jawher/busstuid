// PLAN §16 end-to-end scenarios, driven through the real UI on a 375 px phone screen:
//  1. a guardian adds a child and the school approves it;
//  2. a full morning trip;
//  3. a return trip with an absence and an undo;
//  4. the forgotten child: forced end → critical alert → guardian screen → admin resolves.
import { randomInt } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { db, enableNotifications, latestCode, newPage, SEED, shot, signIn, state } from './helpers';

test.describe.configure({ mode: 'serial' });

async function openTrip(page: Page, routeName: RegExp) {
  await page.goto(`${state().webUrl}/driver`);
  await page.getByRole('link', { name: routeName }).first().click();
  await expect(page).toHaveURL(/\/trip\//);
  await expect(page.getByRole('button', { name: /ابدأ الرحلة|إنهاء الرحلة/ })).toBeVisible();
}

async function startTrip(page: Page) {
  await page.getByRole('button', { name: 'ابدأ الرحلة' }).click();
  await expect(page.getByRole('button', { name: 'إنهاء الرحلة' })).toBeVisible();
}

/** Taps the first visible button with this label, `n` times (cards re-sort after each tap). */
async function tapEach(page: Page, label: string, n: number) {
  const buttons = page.getByRole('button', { name: label, exact: true });
  for (let i = 0; i < n; i++) {
    const before = await buttons.count();
    await buttons.first().click();
    // Wait for the card to move before the next tap, like a person would.
    await expect(buttons).toHaveCount(before - 1);
  }
}

async function waitSynced(page: Page) {
  await expect(page.getByText('✓ متزامن')).toBeVisible({ timeout: 20_000 });
}

test('1. guardian adds a child; the school approves it', async ({ browser }) => {
  const guardian = await newPage(browser);
  const email = `e2e.parent.${Date.now()}@example.com`;
  await guardian.goto(`${state().webUrl}/register`);
  await guardian.getByLabel('الاسم الكامل').fill('نورة الاختبار');
  await guardian.getByLabel('البريد الإلكتروني').fill(email);
  await guardian.getByLabel('رقم الجوال').fill(`3${randomInt(1_000_000, 9_999_999)}`);
  await guardian.getByLabel('كلمة المرور').fill('Quiet-Harbor-Lantern-81');
  await guardian.getByRole('button', { name: 'إنشاء حساب' }).click();

  await expect(guardian).toHaveURL(/verify-email/);
  await guardian.getByLabel('الرمز').fill(await latestCode(email));
  await guardian.getByRole('button', { name: 'تأكيد' }).click();
  await expect(guardian).toHaveURL(/\/guardian$/);
  await shot(guardian, '01-guardian-empty');

  await enableNotifications(guardian);
  await guardian.goto(`${state().webUrl}/children/new`);
  await guardian.getByLabel('اسم الطفل بالعربي').fill('يوسف الاختبار');
  await guardian.getByLabel('تاريخ الميلاد').fill('2017-04-12');
  await guardian.getByLabel('المدرسة', { exact: true }).fill('مدرسة الرواد النموذجية');
  await guardian.getByLabel('اختر من القائمة').selectOption({ label: 'مدرسة الرواد النموذجية' });
  const chooser = guardian.waitForEvent('filechooser');
  await guardian.getByRole('button', { name: 'التقط أو اختر صورة' }).click();
  await (await chooser).setFiles(state().photo);
  await guardian.getByLabel('أوافق على معالجة بيانات طفلي لهذا الغرض').check();
  await shot(guardian, '02-add-child-form');
  await guardian.getByRole('button', { name: 'إضافة الطفل وإرسال طلب الربط' }).click();

  await expect(guardian).toHaveURL(/\/guardian$/);
  await expect(guardian.getByText('يوسف الاختبار')).toBeVisible();
  await expect(guardian.getByText('بانتظار موافقة مدرسة الرواد النموذجية')).toBeVisible();
  await shot(guardian, '03-guardian-pending');

  const admin = await newPage(browser);
  await signIn(admin, SEED.schoolAdmin);
  await admin.goto(`${state().webUrl}/admin/enrollments`);
  const row = admin.locator('li', { hasText: 'يوسف الاختبار' });
  // Before approval: name and school only, no photo (PLAN §5, §20.3).
  await expect(row.locator('img')).toHaveCount(0);
  await shot(admin, '04-admin-requests');
  await row.getByRole('button', { name: 'قبول' }).click();
  await expect(row).toHaveCount(0);

  await admin.goto(`${state().webUrl}/admin/students`);
  await expect(admin.locator('li', { hasText: 'يوسف الاختبار' }).locator('img')).toHaveCount(1);

  await guardian.reload();
  await expect(guardian.getByText('بانتظار موافقة')).toHaveCount(0);
});

test('2. full morning trip: everyone boards, everyone gets off, vehicle confirmed empty', async ({
  browser,
}) => {
  const driver = await newPage(browser);
  await signIn(driver, SEED.driverOne);
  await enableNotifications(driver);
  await openTrip(driver, /خط الرفاع — صباحي/);
  await startTrip(driver);

  const count = await driver.getByRole('button', { name: 'صعد', exact: true }).count();
  expect(count).toBe(16);
  await tapEach(driver, 'صعد', count);
  await expect(driver.getByText(`على المركبة: ${count}`)).toBeVisible();
  await shot(driver, '05-driver-all-boarded');

  // Trying to end now shows the red screen: children are on board (PLAN §6.3).
  await driver.getByRole('button', { name: 'إنهاء الرحلة' }).click();
  await expect(driver.getByRole('heading', { name: 'طلاب ما زالوا على المركبة!' })).toBeVisible();
  await shot(driver, '06-driver-blocked-end');
  await driver.getByRole('button', { name: 'رجوع' }).click();

  await tapEach(driver, 'نزل', count);
  await waitSynced(driver);
  await driver.getByRole('button', { name: 'إنهاء الرحلة' }).click();
  await expect(driver.getByText('هل تأكدت أن المركبة خالية تماماً')).toBeVisible();
  await driver.getByRole('button', { name: 'نعم، المركبة خالية — أنهِ الرحلة' }).click();
  await expect(driver.getByText('انتهت', { exact: true })).toBeVisible();
  await shot(driver, '07-driver-trip-completed');

  const status = await db((c) =>
    c.query(`SELECT t.status, count(*) FILTER (WHERE ts.status = 'alighted')::int AS alighted
               FROM trips t JOIN routes r ON r.id = t.route_id JOIN trip_students ts ON ts.trip_id = t.id
              WHERE r.name = 'خط الرفاع — صباحي' GROUP BY t.status`),
  );
  expect(status.rows[0]).toEqual({ status: 'completed', alighted: 16 });
});

test('3. return trip with an absence, an undo, and offline-safe sync', async ({ browser }) => {
  const driver = await newPage(browser);
  await signIn(driver, SEED.driverOne);
  await openTrip(driver, /خط الرفاع — عودة/);
  await startTrip(driver);

  // Mark one child absent, then undo it from the toast within 60 s.
  await driver.getByRole('button', { name: 'غائب', exact: true }).first().click();
  await driver.getByRole('status').getByRole('button', { name: 'تراجع' }).click();
  await waitSynced(driver);
  await expect(driver.getByRole('button', { name: 'صعد', exact: true })).toHaveCount(16);

  // Now really: one absent, the rest board and get off.
  await driver.getByRole('button', { name: 'غائب', exact: true }).first().click();
  await tapEach(driver, 'صعد', 15);
  await tapEach(driver, 'نزل', 15);
  await waitSynced(driver);
  await shot(driver, '08-return-trip-done');
  await driver.getByRole('button', { name: 'إنهاء الرحلة' }).click();
  await driver.getByRole('button', { name: 'نعم، المركبة خالية — أنهِ الرحلة' }).click();
  await expect(driver.getByText('انتهت', { exact: true })).toBeVisible();

  const rows = await db((c) =>
    c.query(`SELECT ts.status, count(*)::int AS n FROM trip_students ts
               JOIN trips t ON t.id = ts.trip_id JOIN routes r ON r.id = t.route_id
              WHERE r.name = 'خط الرفاع — عودة' GROUP BY ts.status ORDER BY ts.status`),
  );
  expect(rows.rows).toEqual([
    { status: 'alighted', n: 15 },
    { status: 'absent', n: 1 },
  ]);
  const undo = await db((c) =>
    c.query(`SELECT count(*)::int AS n FROM trip_events WHERE event_type = 'undo'`),
  );
  expect(undo.rows[0].n).toBe(1);
});

test('4. the forgotten child: forced end raises the alarm, guardian sees it, admin resolves it', async ({
  browser,
}) => {
  const driver = await newPage(browser);
  await signIn(driver, SEED.independentDriver);
  await enableNotifications(driver);
  await openTrip(driver, /خط المحرق — صباحي/);
  await startTrip(driver);

  const firstName = (await driver
    .getByRole('article')
    .first()
    .getByRole('heading')
    .textContent())!.trim();
  await driver.getByRole('button', { name: 'صعد', exact: true }).first().click();
  const others = await driver.getByRole('button', { name: 'غائب', exact: true }).count();
  await tapEach(driver, 'غائب', others);
  await waitSynced(driver);

  await driver.getByRole('button', { name: 'إنهاء الرحلة' }).click();
  await expect(driver.getByRole('heading', { name: 'طلاب ما زالوا على المركبة!' })).toBeVisible();
  await driver.getByRole('button', { name: 'إنهاء رغم وجود طالب' }).click();
  await driver.getByLabel('السبب').fill('انتهى الدوام ونسيت التسجيل');
  await shot(driver, '09-force-end');
  await driver.getByRole('button', { name: 'أنهِ الرحلة وأطلق الإنذار' }).click();
  await expect(driver.getByText('انتهت مع إنذار')).toBeVisible();

  // The child's guardian gets the full-screen alert with a free tel: call (PLAN §13).
  const alertRow = await db((c) =>
    c.query(`SELECT a.id, u.email FROM alerts a
               JOIN student_guardians sg ON sg.student_id = a.student_id
               JOIN users u ON u.id = sg.guardian_user_id
              WHERE a.type = 'student_left_onboard' AND a.status = 'open' LIMIT 1`),
  );
  const { id: alertId, email: guardianEmail } = alertRow.rows[0];
  const guardian = await newPage(browser);
  await signIn(guardian, guardianEmail);
  await expect(guardian.getByText('إنذار مفتوح — اضغط للتفاصيل')).toBeVisible();
  await guardian.goto(`${state().webUrl}/alert/${alertId}`);
  await expect(guardian.getByRole('heading', { name: '🚨 عاجل' })).toBeVisible();
  await expect(guardian.getByText(firstName)).toBeVisible();
  await expect(guardian.getByRole('link', { name: /اتصل بالسائق/ })).toHaveAttribute(
    'href',
    /^tel:\+973/,
  );
  await expect(guardian.getByRole('link', { name: /اتصل بالطوارئ 999/ })).toBeVisible();
  await shot(guardian, '10-guardian-alert');

  // The independent driver is also their organisation's admin: the admin bar shows the alert.
  await driver.goto(`${state().webUrl}/admin`);
  await expect(driver.getByText(/إنذار مفتوح/)).toBeVisible();
  await shot(driver, '11-admin-alert-bar');
  await driver.goto(`${state().webUrl}/alert/${alertId}`);
  await driver.getByLabel('سبب الإغلاق').selectOption({ label: 'وُجد الطالب في المركبة ونزل' });
  await driver.getByRole('button', { name: 'إغلاق الإنذار' }).click();
  await expect(driver.getByText(/مغلق/)).toBeVisible();

  await guardian.reload();
  await expect(guardian.getByRole('heading', { name: /تم التأكد من السلامة/ })).toBeVisible();
  await shot(guardian, '12-guardian-reassured');
});
