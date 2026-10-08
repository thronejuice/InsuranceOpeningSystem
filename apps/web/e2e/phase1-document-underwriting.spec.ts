/**
 * Phase 1 Acceptance Flow — Document & Underwriting (PLAN_V2.md Day 10)
 *
 * Covers: Job → upload document → verify (as a second user) → underwriting
 * request → review/approve (as a second user, maker-checker) → request
 * quotation succeeds only once underwriting is APPROVED (D-2 / UNDERWRITING_REQUIRED).
 *
 * Prerequisites (run before this suite):
 *   1. `npm run dev` (root) — API on :3000, web on :4200
 *   2. `npm run db:seed -w apps/api` — seeds admin/staff + master data
 *
 * Test data setup (product requiring underwriting + a 1-item document checklist)
 * is created directly via the API in `beforeAll`, since it is master-data
 * arrangement, not the behavior under test. Everything from job creation
 * onward runs through the real browser UI.
 *
 * Both actors (admin, staff) log in to the UI exactly once and keep a
 * persistent page/context for the whole suite — login is rate-limited to
 * 5 attempts/min per IP+username (DESIGN.md §8), so logging in fresh in
 * every test would exhaust that budget.
 */
import { expect, test, type Page } from '@playwright/test';

const SEED_PASS = process.env['SEED_USER_PASSWORD'] ?? 'Password@123';
const BASE = 'http://localhost:4200';
const API = 'http://localhost:3000';

const RUN_ID = Date.now().toString(36);
const PRODUCT_CODE = `E2EP1-${RUN_ID}`;
const CUSTOMER_NAME = `Phase1QA ${RUN_ID}`;

let productId = '';
let productName = '';
let jobId = '';
let adminPage: Page;
let staffPage: Page;

// ─── API setup helpers ──────────────────────────────────────────────────────

async function apiLogin(username: string): Promise<string> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: SEED_PASS }),
  });
  const body = await res.json();
  return body.data.accessToken as string;
}

async function apiCall(method: string, path: string, token: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.success) throw new Error(`${method} ${path} failed: ${JSON.stringify(json)}`);
  return json.data;
}

// ─── UI helpers (mirrors acceptance-flow.spec.ts conventions) ──────────────

async function login(page: Page, username: string) {
  await page.goto(`${BASE}/login`);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(SEED_PASS);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await page.waitForURL('**/dashboard');
}

async function selectMatOption(page: Page, inputId: string, optionLabel: string | RegExp) {
  await page.locator(`ui-select[inputid="${inputId}"] mat-select`).click();
  await page.getByRole('option', { name: optionLabel, exact: typeof optionLabel === 'string' }).first().click();
}

async function fillDate(page: Page, inputId: string, dateStr: string) {
  const input = page.locator(`#${inputId}`);
  await input.fill(dateStr);
  await input.press('Tab');
}

async function requestQuotation(page: Page) {
  await page.getByRole('tab', { name: 'ใบเสนอราคา' }).click();
  await page.getByRole('button', { name: 'ขอราคา' }).click();
  await selectMatOption(page, 'req-company', /.+/);
  await page.locator('#req-gross').fill('10000');
  await page.getByRole('button', { name: 'ส่งคำขอ' }).click();
}

// ─── Suite ──────────────────────────────────────────────────────────────────

test.describe.serial('Phase 1 — Document & Underwriting flow', () => {
  test.beforeAll(async ({ browser }) => {
    const adminToken = await apiLogin('admin');

    const types = await apiCall('GET', '/api/master/insurance-types', adminToken);
    const fireType = types.find((t: { code: string }) => t.code === 'FIRE');
    if (!fireType) throw new Error('Seed insurance type FIRE not found');

    const product = await apiCall('POST', '/api/master/products', adminToken, {
      insuranceTypeId: fireType.id,
      code: PRODUCT_CODE,
      name: `E2E Phase1 Product ${RUN_ID}`,
      requireDocsOnSubmit: true,
      requireUnderwriting: true,
    });
    productId = product.id;
    productName = product.name;

    await apiCall('POST', '/api/master/document-checklists', adminToken, {
      productId,
      documentType: 'ID_CARD',
      isRequired: true,
    });

    await apiCall('POST', '/api/customers', adminToken, {
      customerType: 'INDIVIDUAL',
      firstName: CUSTOMER_NAME,
      lastName: 'Test',
    });

    adminPage = await (await browser.newContext()).newPage();
    await login(adminPage, 'admin');

    staffPage = await (await browser.newContext()).newPage();
    await login(staffPage, 'staff');
  });

  test.afterAll(async () => {
    await adminPage.close();
    await staffPage.close();
  });

  test('Step 1 — Create Job on the underwriting-required product', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/create`);
    await expect(page.getByText('เปิดงานประกันภัยใหม่')).toBeVisible();

    const customerSearch = page.locator('#customer-search');
    await customerSearch.fill(CUSTOMER_NAME);
    await page.waitForResponse('**/api/customers**');
    await page.getByRole('option', { name: new RegExp(CUSTOMER_NAME) }).first().click();

    await selectMatOption(page, 'insuranceTypeId', 'ประกันอัคคีภัย');
    await selectMatOption(page, 'productId', productName);
    await fillDate(page, 'effectiveDate', '01/01/2027');
    await selectMatOption(page, 'agentId', 'System Administrator');

    await page.getByRole('button', { name: 'เปิดงานประกัน' }).click();
    await page.waitForURL((url) => url.pathname.startsWith('/jobs/') && url.pathname !== '/jobs/create');

    jobId = page.url().split('/jobs/')[1].split('/')[0].split('?')[0];
    expect(jobId).toBeTruthy();
  });

  test('Step 2 — Upload the required document (ID_CARD)', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);

    await page.getByRole('tab', { name: 'เอกสาร' }).click();
    await expect(page.getByText('ยังไม่ได้อัปโหลด (จำเป็น)')).toBeVisible();

    await page.locator('.upload-card mat-select').click();
    await page.getByRole('option', { name: 'บัตรประชาชน' }).click();

    await page.setInputFiles('input[type="file"]', {
      name: 'id-card.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF'),
    });

    await expect(page.getByText('id-card.pdf').first()).toBeVisible({ timeout: 10_000 });
  });

  test('Step 3 — Submit the Job (DRAFT → OPEN; upload level is enough)', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);

    await page.getByRole('button', { name: /ส่งงาน/ }).click();
    // Job status badges are Thai-localized (app-status-badge.component.ts STATUS_MAP); 'เปิด' = OPEN.
    await expect(page.locator('app-status-badge').first()).toContainText('เปิด', { timeout: 10_000 });
  });

  test('Step 4 — Verify the document as a different user (staff)', async () => {
    const page = staffPage;
    await page.goto(`${BASE}/jobs/${jobId}`);
    await page.getByRole('tab', { name: 'เอกสาร' }).click();

    const docRow = page.locator('tr', { hasText: 'บัตรประชาชน' });
    await docRow.locator('button:has(i.pi-check)').click();

    await expect(page.getByText('ยืนยันอนุมัติ (Verify)')).toBeVisible();
    await page.getByRole('button', { name: 'ยืนยันอนุมัติ (Verify)' }).click();

    await expect(docRow.locator('.doc-status-badge')).toContainText(/VERIFIED|ตรวจสอบ/, { timeout: 10_000 });
  });

  test('Step 5 — Request quotation is blocked before underwriting is approved', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);
    await requestQuotation(page);

    await expect(page.locator('ui-message').getByText(/underwriting/i)).toBeVisible({ timeout: 10_000 });
  });

  test('Step 6 — Request underwriting review (as admin, the job owner)', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);
    await page.getByRole('tab', { name: 'Underwriting' }).click();

    await page.getByRole('button', { name: 'ขอตรวจ Underwriting' }).click();
    // 'PENDING' now renders as the Thai label added to AppStatusBadgeComponent's STATUS_MAP.
    await expect(page.locator('app-status-badge').last()).toContainText('รอตรวจพิจารณา', { timeout: 10_000 });
  });

  test('Step 7 — Approve underwriting as a different user (staff, maker-checker)', async () => {
    const page = staffPage;
    await page.goto(`${BASE}/jobs/${jobId}`);
    await page.getByRole('tab', { name: 'Underwriting' }).click();

    await page.locator('mat-select').first().click();
    await page.getByRole('option', { name: 'ต่ำ (LOW)' }).click();

    await page.getByRole('button', { name: 'อนุมัติ' }).click();
    // 'APPROVED' happens to collide with Job's own status map → renders as 'อนุมัติแล้ว'.
    await expect(page.getByText('อนุมัติแล้ว').first()).toBeVisible({ timeout: 10_000 });
  });

  test('Step 8 — Request quotation now succeeds', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);
    await requestQuotation(page);

    await expect(page.getByText('ยังไม่มีใบเสนอราคา')).not.toBeVisible({ timeout: 10_000 });
    // 'ขอราคาแล้ว' = QUOTATION_REQUESTED (STATUS_MAP in app-status-badge.component.ts)
    await expect(page.locator('app-status-badge').first()).toContainText('ขอราคาแล้ว', { timeout: 10_000 });
  });
});
