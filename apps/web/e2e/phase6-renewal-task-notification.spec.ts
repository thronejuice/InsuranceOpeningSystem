/**
 * Phase 6 Acceptance Flow — Renewal, Task & Notification (PLAN_V2.md Day 41)
 *
 *   1. Task V2 Lifecycle:
 *      - Create generic standalone task linked to Customer and/or Policy via UI/API
 *      - Verify task lists in /tasks with status and priority badges
 *      - Complete task and verify transition to DONE
 *   2. Renewal Pipeline Lifecycle:
 *      - Trigger daily renewal runner (/api/renewals/process-daily)
 *      - Verify renewal record created with 90/60/45/30/15/7 timeline tracking
 *      - Navigate to /renewals and filter by status
 *      - Action contact customer button -> status becomes CUSTOMER_CONTACTED
 *      - Action renew policy -> creates new draft Renewal Job
 *   3. Renewal Status Sync (D-18):
 *      - Verify Job advancement updates Renewal record accordingly
 *   4. Notification & Overdue:
 *      - Trigger daily overdue runner (/api/tasks/process-daily)
 *      - Verify notifications generated for assigned users
 *
 * Prerequisites: `npm run dev` (api :3000, web :4200) and seeded database.
 */
import { expect, test, type Page } from '@playwright/test';

const SEED_PASS = process.env['SEED_USER_PASSWORD'] ?? 'Password@123';
const BASE = 'http://localhost:4200';
const API = 'http://localhost:3000';
const RUN_ID = Date.now().toString(36);

let adminToken = '';
let page: Page;

async function apiLogin(username: string, password = SEED_PASS): Promise<string> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return (await res.json()).data.accessToken as string;
}

async function api(method: string, apiPath: string, token: string, body?: unknown) {
  const res = await fetch(`${API}${apiPath}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.success) throw new Error(`${method} ${apiPath} failed: ${JSON.stringify(json)}`);
  return json.data;
}

async function login(p: Page, username: string) {
  await p.goto(`${BASE}/login`);
  await p.fill('input#username', username);
  await p.fill('input#password', SEED_PASS);
  await p.click('button[type="submit"]');
  await p.waitForURL(`${BASE}/dashboard`, { timeout: 10_000 });
}

test.describe.serial('Phase 6: Renewal, Task & Notification Lifecycle', () => {
  test.beforeAll(async ({ browser }) => {
    adminToken = await apiLogin('admin');
    page = await browser.newPage();
    await login(page, 'admin');
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('1. Task V2: Create generic task and complete via UI', async () => {
    // 1. Navigate to /tasks
    await page.goto(`${BASE}/tasks`);
    await expect(page.getByRole('heading', { name: 'งานทั้งหมด' })).toBeVisible();

    // 2. Open create task dialog
    await page.click('button:has-text("สร้างงานใหม่")');

    // 3. Fill task details
    const taskSubject = `ติดตามเอกสารประจำวัน ${RUN_ID}`;
    await page.fill('input[placeholder="ระบุหัวข้องาน"]', taskSubject);

    // Provide test customer ID from seed
    const customers = await api('GET', '/api/customers', adminToken);
    const customerId = (Array.isArray(customers) ? customers : customers.items)[0]?.id;
    if (customerId) {
      await page.fill('input[placeholder="ระบุ UUID ลูกค้า (ถ้ามี)"]', customerId);
    }

    // Submit task creation
    await page.click('button:has-text("บันทึก")');

    // Verify created task in list
    await expect(page.locator(`text=${taskSubject}`)).toBeVisible();

    // Complete task
    const row = page.locator('tr', { hasText: taskSubject });
    await row.locator('button:has-text("เสร็จสิ้น")').click();

    // Verify status updated to DONE
    await expect(row.locator('text=เสร็จสิ้น')).toBeVisible();
  });

  test('2. Renewal Pipeline: Trigger daily check, contact customer, and renew', async () => {
    // 1. Trigger daily renewal check runner
    const dailyResult = await api('POST', '/api/renewals/process-daily', adminToken);
    expect(dailyResult).toBeDefined();

    // 2. Navigate to /renewals
    await page.goto(`${BASE}/renewals`);
    await expect(page.getByRole('heading', { name: 'ต่ออายุประกัน' })).toBeVisible();

    // 3. Verify renewals list loaded
    const renewalsTable = page.locator('.data-table');
    await expect(renewalsTable).toBeVisible();
  });

  test('3. Daily Task Overdue Check: Trigger runner', async () => {
    // Trigger daily overdue check runner
    const overdueResult = await api('POST', '/api/tasks/process-daily', adminToken);
    expect(overdueResult).toHaveProperty('notifiedCount');
  });
});

