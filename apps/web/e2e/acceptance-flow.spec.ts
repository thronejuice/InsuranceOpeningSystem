/**
 * UI acceptance smoke — every V2 screen opens for the right role and the wrong role is kept out.
 * (The step-by-step business flows live in phase1…phase6; this one proves navigation, permissions and
 * that no page lands in its error state.)
 *
 * Prerequisites: `npm run dev` (api :3000, web :4200) and `npm run db:seed -w apps/api`.
 * Sign-in is limited to 5 per minute per user, so each role signs in once and the suite shares the page.
 */
import { expect, test, type Page } from '@playwright/test';

const SEED_PASS = process.env['SEED_USER_PASSWORD'] ?? 'Password@123';
const BASE = 'http://localhost:4200';

async function login(page: Page, username: string) {
  await page.context().clearCookies();
  await page.goto(`${BASE}/login`);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(`${BASE}/login`);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(SEED_PASS);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await page.waitForURL('**/dashboard');
}

/** A page counts as healthy when it stays on its URL and none of its requests fail with a server error. */
async function expectHealthy(page: Page, path: string) {
  const failures: string[] = [];
  const onResponse = (r: { url(): string; status(): number }) => {
    if (r.url().includes('/api/') && r.status() >= 500) failures.push(`${r.status()} ${r.url()}`);
  };
  page.on('response', onResponse);
  await page.goto(`${BASE}${path}`);
  await expect(page.locator('app-sidebar')).toBeVisible();
  await page.waitForLoadState('networkidle');
  page.off('response', onResponse);
  expect(failures, `${path} had failing requests`).toEqual([]);
  expect(new URL(page.url()).pathname).toBe(path);
}

const SCREENS: [string, string][] = [
  ['Dashboard', '/dashboard'],
  ['Customers', '/customers'],
  ['Jobs', '/jobs'],
  ['Quotations', '/quotations'],
  ['Approvals', '/approvals'],
  ['Underwriting inbox', '/underwriting'],
  ['Policies', '/policies'],
  ['Invoices', '/invoices'],
  ['Payments', '/payments'],
  ['Receivables (AR)', '/receivables'],
  ['Refunds', '/refunds'],
  ['Commissions', '/commissions'],
  ['Commission statements', '/commission-statements'],
  ['Renewals', '/renewals'],
  ['Tasks', '/tasks'],
  ['Notifications / audit', '/audit-logs'],
  ['Master data — insurers', '/master/companies'],
  ['Master data — commission settings', '/master/system-settings'],
  ['Users', '/users'],
];

test.describe.serial('Acceptance smoke (V2)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });
  test.afterAll(async () => {
    await page.close();
  });

  test('Unauthenticated access is redirected to /login', async () => {
    await page.goto(`${BASE}/policies`);
    await page.waitForURL('**/login');
  });

  test('Admin signs in and sees the navigation', async () => {
    await login(page, 'admin');
    await expect(page.locator('app-sidebar')).toBeVisible();
    await expect(page.locator('app-sidebar').getByText('ใบแจ้งหนี้')).toBeVisible();
    await expect(page.locator('app-sidebar').getByText('ใบสรุปค่าคอม')).toBeVisible();
  });

  for (const [name, path] of SCREENS) {
    test(`Admin opens: ${name}`, async () => {
      await expectHealthy(page, path);
    });
  }

  test('Admin opens the first insurer detail (contacts, products, stats)', async () => {
    await page.goto(`${BASE}/master/companies`);
    await page.locator('app-companies-page a, a.company-link').first().click();
    await page.waitForURL(/\/insurers\/[0-9a-f-]{36}/);
    await expect(page.getByRole('button', { name: /ผู้ติดต่อ/ })).toBeVisible();
    await page.getByRole('button', { name: /สถิติการดำเนินงาน/ }).click();
    await expect(page.getByText('อัตราได้งาน')).toBeVisible();
  });

  test('Viewer is kept out of finance actions and admin areas', async () => {
    await login(page, 'viewer');
    await page.goto(`${BASE}/users`);
    await expect(page).not.toHaveURL(/\/users$/); // no user.manage → redirected away
    await page.goto(`${BASE}/commission-statements`);
    await expect(page.getByRole('button', { name: 'สร้างใบสรุป' })).toHaveCount(0);
    await page.goto(`${BASE}/jobs`);
    await expect(page.getByRole('button', { name: /เปิดงาน/ })).toHaveCount(0);
  });

  test('Finance can reach billing and commission screens but not user admin', async () => {
    await login(page, 'finance');
    for (const path of ['/invoices', '/receivables', '/commissions', '/commission-statements', '/refunds']) {
      await expectHealthy(page, path);
    }
    await page.goto(`${BASE}/users`);
    await expect(page).not.toHaveURL(/\/users$/);
  });
});
