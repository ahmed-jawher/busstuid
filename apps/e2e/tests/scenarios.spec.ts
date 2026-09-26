// PLAN §16 end-to-end scenarios, driven through the real UI on a 375 px phone screen:
//  1. a guardian adds a child and the school approves it;
//  2. a full morning trip;
//  3. a return trip with an absence and an undo;
//  4. the forgotten child: forced end → critical alert → guardian screen → admin resolves.
import { randomInt } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { db, enableNotifications, latestCode, newPage, SEED, shot, signIn, state } from './helpers';

test.describe.configure({ mode: 'serial' });

/**
 * Opens a trip from the driver's day. A trip is titled by where it is going and for whom — the
 * driver has one of each direction a day — so that is what picks the card.
 */
async function openTrip(page: Page, heading: RegExp) {
  await page.goto(`${state().webUrl}/driver`);
  const card = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: heading }) })
    .first();
  await card.getByRole('link').or(card.getByRole('button')).first().click();
  await expect(page).toHaveURL(/\/trip\//);
  await expect(page.getByRole('button', { name: /ابدأ الرحلة|إنهاء الرحلة/ })).toBeVisible();
}

async function startTrip(page: Page) {
  const start = page.getByRole('button', { name: 'ابدأ الرحلة' });
  if (await start.isVisible()) await start.click();
  await expect(page.getByRole('button', { name: 'إنهاء الرحلة' })).toBeVisible();
}

/** "The bus is empty" is confirmed by pressing and holding (Claude Design "Tammeni Driver"). */
async function holdEmpty(page: Page) {
  const button = page.getByRole('button', { name: 'اضغط مطولاً: الباص خالٍ' });
  await button.hover();
  await page.mouse.down();
  await page.waitForTimeout(1600);
  await page.mouse.up();
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
  await expect(page.getByText('متزامن', { exact: true })).toBeVisible({ timeout: 20_000 });
}

test('1. guardian adds a child; the school approves it', async ({ browser }) => {
  const guardian = await newPage(browser);
  const email = `e2e.parent.${Date.now()}@example.com`;
  await guardian.goto(`${state().webUrl}/welcome`);
  await shot(guardian, '00-welcome');
  await guardian.getByRole('link', { name: 'إنشاء حساب' }).click();
  // Step 1 of 3: who are you?
  await guardian.getByRole('radio', { name: /ولي أمر/ }).click();
  await guardian.getByRole('button', { name: 'متابعة' }).click();
  // Step 2 of 3: details, Bahrain mobile without the +973.
  await guardian.getByLabel('الاسم الكامل').fill('نورة الاختبار');
  await guardian.getByLabel('البريد الإلكتروني').fill(email);
  await guardian.getByLabel('رقم الجوال').fill(`3${randomInt(1_000_000, 9_999_999)}`);
  // Two boxes: the password and the confirmation, both shown with the eye if a human looks.
  await guardian.getByLabel('كلمة المرور', { exact: true }).fill('Quiet-Harbor-Lantern-81');
  await guardian.getByLabel('تأكيد كلمة المرور').fill('Quiet-Harbor-Lantern-81');
  await shot(guardian, '00b-signup-details');
  // The terms must be ticked on purpose; the server refuses a sign-up without it.
  await guardian.getByRole('checkbox').check();
  await guardian.getByRole('button', { name: 'إنشاء الحساب' }).click();

  // Step 3 of 3: the six digits are checked as soon as they are in.
  await expect(guardian).toHaveURL(/verify-email/);
  await guardian.getByLabel('الرمز').fill(await latestCode(email));
  await expect(guardian).toHaveURL(/notifications\/setup/);
  await guardian.getByRole('button', { name: 'تفعيل الإشعارات' }).click();
  await expect(guardian.getByText('أُرسل إشعار تجريبي')).toBeVisible();
  await guardian.getByRole('button', { name: 'متابعة' }).click();
  await expect(guardian.getByRole('heading', { name: 'حسابك جاهز يا نورة' })).toBeVisible();
  await guardian.goto(`${state().webUrl}/guardian`);
  await shot(guardian, '01-guardian-empty');

  // Adding a child: four steps, one per screen.
  await guardian.goto(`${state().webUrl}/children/new`);
  await guardian.getByLabel('اسم الطفل بالعربي').fill('يوسف الاختبار');
  await guardian.getByLabel('تاريخ الميلاد').fill('2017-04-12');
  await guardian.getByLabel('المدرسة', { exact: true }).fill('مدرسة الرواد النموذجية');
  await guardian.getByRole('button', { name: 'متابعة' }).click();
  await guardian.getByRole('radio', { name: /مدرسة الرواد النموذجية/ }).click();
  await guardian.getByRole('button', { name: 'متابعة' }).click();
  const chooser = guardian.waitForEvent('filechooser');
  await guardian.getByRole('button', { name: 'التقط أو اختر صورة' }).click();
  await (await chooser).setFiles(state().photo);
  await guardian.getByRole('button', { name: 'متابعة' }).click();
  await guardian.getByText('أوافق على معالجة بيانات طفلي لهذا الغرض').click();
  await shot(guardian, '02-add-child-form');
  await guardian.getByRole('button', { name: 'إضافة الطفل وإرسال طلب الربط' }).click();
  await expect(guardian.getByRole('heading', { name: 'أُرسل طلب الربط' })).toBeVisible();
  await guardian.getByRole('button', { name: 'العودة إلى الرئيسية' }).click();

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
  // The decision stays on screen with an undo (Claude Design "Tammeni Admin").
  await expect(row.getByText('مقبول · أُبلغ ولي الأمر')).toBeVisible();

  await admin.goto(`${state().webUrl}/admin/students`);
  await expect(admin.locator('li', { hasText: 'يوسف الاختبار' }).locator('img')).toHaveCount(1);
  await shot(admin, '04b-admin-students');
  await admin.goto(`${state().webUrl}/admin`);
  await expect(admin.getByRole('heading', { name: 'رحلات اليوم' })).toBeVisible();
  await shot(admin, '04c-admin-live');
  // The web layout (Claude Design "Tammeni Admin"): navy sidebar and side panels.
  await admin.setViewportSize({ width: 1280, height: 800 });
  await admin.goto(`${state().webUrl}/admin/students`);
  await expect(admin.getByRole('heading', { name: 'الطلاب' })).toBeVisible();
  await shot(admin, '04d-admin-web-students');
  await admin.goto(`${state().webUrl}/admin/routes`);
  await shot(admin, '04e-admin-web-routes');

  await guardian.reload();
  await expect(guardian.getByText('بانتظار موافقة')).toHaveCount(0);
});

test('2. full morning trip: everyone boards, everyone gets off, vehicle confirmed empty', async ({
  browser,
}) => {
  const driver = await newPage(browser);
  await signIn(driver, SEED.driverOne);
  await enableNotifications(driver);
  await openTrip(driver, /ذهاب إلى المدرسة/);
  await startTrip(driver);

  const count = await driver.getByRole('button', { name: 'صعد', exact: true }).count();
  expect(count).toBe(16);
  await tapEach(driver, 'صعد', count);
  await expect(driver.getByRole('button', { name: 'نزل', exact: true })).toHaveCount(count);
  await shot(driver, '05-driver-all-boarded');

  // Trying to end now shows the red screen: children are on board (PLAN §6.3).
  await driver.getByRole('button', { name: 'إنهاء الرحلة' }).click();
  await expect(driver.getByRole('heading', { name: 'طلاب ما زالوا على الباص!' })).toBeVisible();
  await shot(driver, '06-driver-blocked-end');
  await driver.getByRole('button', { name: 'رجوع إلى القائمة' }).click();

  await tapEach(driver, 'نزل', count);
  await waitSynced(driver);
  await driver.getByRole('button', { name: 'إنهاء الرحلة' }).click();
  await expect(driver.getByText('هل الباص خالٍ تماماً')).toBeVisible();
  await shot(driver, '06b-driver-confirm-empty');
  await holdEmpty(driver);
  await expect(driver.getByRole('heading', { name: 'انتهت الرحلة بأمان' })).toBeVisible();
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
  await openTrip(driver, /عودة إلى البيت/);
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
  await holdEmpty(driver);
  await expect(driver.getByRole('heading', { name: 'انتهت الرحلة بأمان' })).toBeVisible();

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
  await openTrip(driver, /ذهاب إلى المدرسة/);
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
  await expect(driver.getByRole('heading', { name: 'طلاب ما زالوا على الباص!' })).toBeVisible();
  await driver.getByRole('button', { name: 'إنهاء رغم وجود طالب' }).click();
  await driver.getByLabel('السبب').fill('انتهى الدوام ونسيت التسجيل');
  await shot(driver, '09-force-end');
  await driver.getByRole('button', { name: 'أنهِ الرحلة وأطلق الإنذار' }).click();
  await expect(driver.getByRole('heading', { name: 'انتهت الرحلة مع إنذار' })).toBeVisible();

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
  await guardian.goto(`${state().webUrl}/guardian`);
  await expect(guardian.getByText(/إنذار عاجل/)).toBeVisible();
  await shot(guardian, '09b-guardian-home-alert');
  await guardian.goto(`${state().webUrl}/alert/${alertId}`);
  await expect(guardian.getByRole('heading', { name: /لم يُسجَّل نزوله من الباص/ })).toBeVisible();
  await expect(guardian.getByText(firstName)).toBeVisible();
  await expect(guardian.getByRole('link', { name: /اتصل بالسائق/ })).toHaveAttribute(
    'href',
    /^tel:\+973/,
  );
  await expect(guardian.getByRole('link', { name: /اتصل بالطوارئ 999/ })).toBeVisible();
  await shot(guardian, '10-guardian-alert');

  // The independent driver is also their organisation's admin: the critical alert is pinned
  // under the title bar on every admin screen.
  await driver.goto(`${state().webUrl}/admin`);
  await expect(driver.getByRole('alert').filter({ hasText: 'إنذار حرج' })).toBeVisible();
  await shot(driver, '11-admin-alert-bar');
  await driver.getByRole('alert').getByRole('link').click();
  await expect(driver).toHaveURL(new RegExp(`/admin/alerts/${alertId}$`));
  await driver.getByText('وُجد الطالب في المركبة ونزل').click();
  await shot(driver, '11b-admin-alert');
  await driver.getByRole('button', { name: 'إغلاق الإنذار' }).click();
  await expect(driver.getByText('مغلق', { exact: true })).toBeVisible();
  await expect(driver.getByRole('alert').filter({ hasText: 'إنذار حرج' })).toHaveCount(0);
  await driver.goto(`${state().webUrl}/admin/more`);
  await shot(driver, '11c-admin-more');

  await guardian.reload();
  await expect(guardian.getByRole('heading', { name: /تم التأكد من السلامة/ })).toBeVisible();
  await shot(guardian, '12-guardian-reassured');
});
