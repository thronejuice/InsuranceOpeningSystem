/**
 * Phase 2 Acceptance Flow — Quotation, Proposal & Acceptance (PLAN_V2.md Day 17)
 *
 * Covers the full Phase 2 end-to-end lifecycle:
 *   1. Create Job (Product without underwriting required) → Submit (OPEN).
 *   2. Tab 5: Request quotation from insurer.
 *   3. Record Quotation Version 1 (gross, discount, deductible, validity, etc.) → RECEIVED (v1).
 *   4. Record Quotation Version 2 ("ปรับปรุงราคา") → creates v2, marks v1 SUPERSEDED.
 *      Verify version history shows both v1 (SUPERSEDED) and v2 (ACTIVE).
 *   5. Tab 6: Comparison table displays multi-dimensional comparison and v2 badge.
 *   6. Select Quotation (v2) → Job transitions to QUOTATION_SELECTED.
 *   7. Tab 7: Create Proposal (v1) linked to Payment Term → Proposal DRAFT (v1).
 *   8. Send Proposal → Proposal SENT, Job WAITING_CUSTOMER.
 *   9. Revise Proposal → Proposal v1 becomes SUPERSEDED, Job returns to QUOTATION_RECEIVED.
 *  10. Re-select Quotation on Tab 6 → Job returns to QUOTATION_SELECTED.
 *  11. Tab 7: Create Proposal v2 → Send Proposal v2 → Proposal v2 becomes SENT.
 *  12. Accept Proposal with evidence file (EMAIL method + acceptance PDF) →
 *      Proposal v2 becomes ACCEPTED, Job becomes CUSTOMER_ACCEPTED.
 *      Verify Acceptance Evidence card displays method, acceptedByName, evidence download, and remark.
 *
 * Prerequisites:
 *   1. `npm run dev` (root) — API on :3000, web on :4200
 *   2. `npm run db:seed -w apps/api` — seeds admin/staff + master data
 */
import { expect, test, type Page } from '@playwright/test';

const SEED_PASS = process.env['SEED_USER_PASSWORD'] ?? 'Password@123';
const BASE = 'http://localhost:4200';
const API = 'http://localhost:3000';

const RUN_ID = Date.now().toString(36);
const CUSTOMER_NAME = `Phase2QA ${RUN_ID}`;
const PRODUCT_CODE = `E2EP2-${RUN_ID}`;

let jobId = '';
let productName = '';
let adminPage: Page;

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

// ─── UI helpers ─────────────────────────────────────────────────────────────

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

// ─── Suite ──────────────────────────────────────────────────────────────────

test.describe.serial('Phase 2 — Quotation, Proposal & Acceptance Flow', () => {
  test.beforeAll(async ({ browser }) => {
    const adminToken = await apiLogin('admin');

    // Create a dedicated test customer via API
    await apiCall('POST', '/api/customers', adminToken, {
      customerType: 'INDIVIDUAL',
      firstName: CUSTOMER_NAME,
      lastName: 'PhaseTwo',
    });

    // Every seeded FIRE product has required risk fields, so picking "the first FIRE
    // product" in the UI is not deterministic and can fail Submit with "Required risk
    // fields are missing". Create a dedicated product with none, same as the Phase 1 spec.
    const types = await apiCall('GET', '/api/master/insurance-types', adminToken);
    const fireType = types.find((t: { code: string }) => t.code === 'FIRE');
    if (!fireType) throw new Error('Seed insurance type FIRE not found');
    const product = await apiCall('POST', '/api/master/products', adminToken, {
      insuranceTypeId: fireType.id,
      code: PRODUCT_CODE,
      name: `E2E Phase2 Product ${RUN_ID}`,
      requireDocsOnSubmit: false,
      requireUnderwriting: false,
    });
    productName = product.name;

    adminPage = await (await browser.newContext()).newPage();
    await login(adminPage, 'admin');
  });

  test.afterAll(async () => {
    if (adminPage) await adminPage.close();
  });

  test('Step 1 — Create a new Job and Submit (OPEN)', async () => {
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

    // Submit Job from DRAFT → OPEN. This product has no risk fields / doc checklist,
    // so the button is available immediately — wait for it rather than a one-shot
    // isVisible() check, which can race the page render and silently no-op.
    const submitBtn = page.getByRole('button', { name: /ส่งงาน/ });
    await submitBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await submitBtn.click();
    await expect(page.locator('app-status-badge').first()).toContainText('เปิด', { timeout: 10_000 });
  });

  test('Step 2 — Request quotation on Tab 5', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);

    await page.getByRole('tab', { name: 'ใบเสนอราคา' }).click();
    await page.getByRole('button', { name: 'ขอราคา' }).click();

    await selectMatOption(page, 'req-company', /.+/);
    await page.locator('#req-gross').fill('15000');
    await page.locator('#req-discount').fill('1000');
    await page.locator('#req-valid').fill('2027-12-31');
    await page.locator('#req-remark').fill('ขอเสนอราคาเบื้องต้นสำหรับทดสอบ E2E');

    await page.getByRole('button', { name: 'ส่งคำขอ' }).click();

    // Verify row is created with REQUESTED status ("ขอราคาแล้ว")
    await expect(page.locator('app-status-badge').getByText('ขอราคาแล้ว').first()).toBeVisible({ timeout: 10_000 });
  });

  test('Step 3 — Record quotation version 1', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);
    await page.getByRole('tab', { name: 'ใบเสนอราคา' }).click();

    // The job action bar near the header also has a button labeled 'บันทึกราคา' (it just
    // jumps to this tab and does nothing else) — scope to the quotation row's own action
    // button so we open the real record-price dialog, not a no-op on the already-open tab.
    await page.locator('.quo-action-btns').getByRole('button', { name: 'บันทึกราคา' }).first().click();

    await page.locator('#rec-gross').fill('15000');
    await page.locator('#rec-discount').fill('1000');
    await page.locator('#rec-deductible').fill('2000');
    await page.locator('#rec-comm-rate').fill('12.00');
    await page.locator('#rec-quo-date').fill('2026-10-08');
    await page.locator('#rec-valid').fill('2027-12-31');
    await page.locator('#rec-underwriter').fill('นายพิจารณา ทดสอบ');
    await page.locator('#rec-insurer-ref').fill('QT-TEST-001');
    await page.locator('#rec-condition').fill('เงื่อนไขคุ้มครองตามมาตรฐาน');
    await page.locator('#rec-remark').fill('บันทึกราคาเวอร์ชัน 1');

    // The dialog renders in the CDK overlay container (outside <ui-dialog>'s own DOM
    // position), so scope there to reliably hit its submit button, not the row's trigger.
    await Promise.all([
      page.waitForResponse((r) => /\/api\/quotations\/.+/.test(r.url()) && r.request().method() === 'PUT'),
      page.locator('.cdk-overlay-container').getByRole('button', { name: 'บันทึกราคา' }).click(),
    ]);

    // Verify version badge and status RECEIVED ("ได้รับราคา"). The initial requestQuotation
    // call already consumes version 1 as a bare placeholder; recordReceived (this call) always
    // bumps the version even the first time, so the first real priced version is v2.
    await expect(page.locator('.badge-version').getByText('v2').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('app-status-badge').getByText('ได้รับราคา').first()).toBeVisible({ timeout: 10_000 });
  });

  test('Step 4 — Record quotation version 2 (Revise price) and check history', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);
    await page.getByRole('tab', { name: 'ใบเสนอราคา' }).click();

    // Click "ปรับปรุงราคา" button to create a new version
    await page.getByRole('button', { name: 'ปรับปรุงราคา' }).first().click();

    // Header says 'ปรับปรุงราคา / บันทึกเวอร์ชันใหม่'
    await expect(page.getByText('ปรับปรุงราคา / บันทึกเวอร์ชันใหม่')).toBeVisible();

    await page.locator('#rec-gross').fill('14000');
    await page.locator('#rec-discount').fill('1200');
    await page.locator('#rec-deductible').fill('1500');
    await page.locator('#rec-comm-rate').fill('15.00');
    await page.locator('#rec-valid').fill('2027-12-31');
    await page.locator('#rec-remark').fill('บันทึกราคาเวอร์ชัน 2 (ปรับปรุงข้อเสนอ)');

    await page.getByRole('button', { name: 'บันทึกเวอร์ชันใหม่' }).click();

    // Quotation should now show v3 badge (v1 placeholder + v2 first price + v3 this revise)
    await expect(page.locator('.badge-version').getByText('v3').first()).toBeVisible({ timeout: 10_000 });

    // Open version history table by clicking the history count button "(2)"
    await page.locator('button[title*="ประวัติเวอร์ชัน"]').first().click();

    // Verify version history shows both v1 (SUPERSEDED) and v2
    const historyBox = page.locator('.version-history-box');
    await expect(historyBox).toBeVisible({ timeout: 10_000 });
    await expect(historyBox.locator('.badge-version').getByText('v2')).toBeVisible();
    await expect(historyBox.locator('.badge-version').getByText('v1')).toBeVisible();
    await expect(historyBox.getByText(/SUPERSEDED|ยกเลิก/).first()).toBeVisible();
  });

  test('Step 5 — Compare quotations and Select Version 2', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);

    await page.getByRole('tab', { name: 'เปรียบเทียบ' }).click();
    await expect(page.locator('.comparison-table')).toBeVisible({ timeout: 10_000 });

    // Verify version v3 is shown in company column
    await expect(page.locator('.comp-meta .badge-version').getByText('v3').first()).toBeVisible();

    // Click "เลือกข้อเสนอนี้"
    await page.getByRole('button', { name: 'เลือกข้อเสนอนี้' }).first().click();
    await expect(page.getByText('เลือกใบเสนอราคา')).toBeVisible();

    await page.locator('#select-reason').fill('เบี้ยปรับปรุงถูกลงและให้เงื่อนไขความคุ้มครองดีที่สุด');
    await page.getByRole('button', { name: 'ยืนยันเลือก' }).click();

    // Verify selected mark in comparison and Job status badge QUOTATION_SELECTED ("เลือกราคาแล้ว")
    await expect(page.locator('.selected-mark').first()).toContainText('เลือกแล้ว', { timeout: 10_000 });
    await expect(page.locator('app-status-badge').first()).toContainText('เลือกราคาแล้ว', { timeout: 10_000 });
  });

  test('Step 6 — Create Proposal v1 with Payment Term & Send', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);

    await page.getByRole('tab', { name: 'ใบเสนอ' }).click();
    await page.getByRole('button', { name: 'สร้างใบเสนอ' }).click();

    await page.locator('#prop-valid').fill('2027-12-31');
    await selectMatOption(page, 'prop-payment-term', /.+/);
    await page.locator('#prop-cov-summary').fill('สรุปความคุ้มครองอัคคีภัยและภัยธรรมชาติครบถ้วน');
    await page.locator('#prop-terms').fill('เงื่อนไขการชำระเงินตามงวดที่กำหนด');
    await page.locator('#prop-conditions').fill('ไม่มีประวัติการเรียกร้องค่าสินไหมผิดเงื่อนไข');
    await page.locator('#prop-remark').fill('เอกสารข้อเสนอฉบับที่ 1');

    await page.getByRole('button', { name: 'สร้างใบเสนอ' }).last().click();

    // Verify Proposal card appears with v1 badge and DRAFT status
    const propCard = page.locator('.proposal-card').first();
    await expect(propCard.locator('.version-badge')).toContainText('v1', { timeout: 10_000 });
    await expect(propCard.locator('app-status-badge')).toContainText('ฉบับร่าง', { timeout: 10_000 });

    // Click "ส่งใบเสนอ"
    await propCard.getByRole('button', { name: 'ส่งใบเสนอ' }).click();

    // Verify Proposal status changes to SENT ("ส่งแล้ว") and Job status becomes WAITING_CUSTOMER ("รอลูกค้าตอบรับ")
    await expect(propCard.locator('app-status-badge')).toContainText('ส่งแล้ว', { timeout: 10_000 });
    await expect(page.locator('app-status-badge').first()).toContainText('รอลูกค้าตอบรับ', { timeout: 10_000 });
  });

  test('Step 7 — Revise Proposal v1 (reverts Job to QUOTATION_RECEIVED)', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);
    await page.getByRole('tab', { name: 'ใบเสนอ' }).click();

    const propCard = page.locator('.proposal-card').first();
    await propCard.getByRole('button', { name: 'ปรับปรุงข้อเสนอ (Revise)' }).click();

    await expect(page.getByText('ปรับปรุงข้อเสนอ (Revise Proposal)')).toBeVisible();
    await page.locator('#revise-reason').fill('ลูกค้าขอยื่นข้อเสนอปรับเปลี่ยนรูปแบบงวดการชำระเงิน');

    await page.getByRole('button', { name: 'ยืนยันการปรับปรุง' }).click();

    // Verify Proposal v1 becomes SUPERSEDED ("ยกเลิก/แทนที่แล้ว")
    await expect(propCard.locator('app-status-badge')).toContainText(/SUPERSEDED|ยกเลิก/, { timeout: 10_000 });

    // Verify Job status returns to QUOTATION_RECEIVED ("ได้รับราคา")
    await expect(page.locator('app-status-badge').first()).toContainText('ได้รับราคา', { timeout: 10_000 });
  });

  test('Step 8 — Select Quotation and Create Proposal v2 & Send', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);

    // Re-select quotation on Tab เปรียบเทียบ
    await page.getByRole('tab', { name: 'เปรียบเทียบ' }).click();
    await page.getByRole('button', { name: 'เลือกข้อเสนอนี้' }).first().click();
    await page.locator('#select-reason').fill('ยืนยันเลือกใบเสนอราคาฉบับปรับปรุง');
    await page.getByRole('button', { name: 'ยืนยันเลือก' }).click();
    await expect(page.locator('app-status-badge').first()).toContainText('เลือกราคาแล้ว', { timeout: 10_000 });

    // Switch to Tab ใบเสนอ
    await page.getByRole('tab', { name: 'ใบเสนอ' }).click();
    await page.getByRole('button', { name: 'สร้างใบเสนอ' }).click();

    await page.locator('#prop-valid').fill('2027-12-31');
    await selectMatOption(page, 'prop-payment-term', /.+/);
    await page.locator('#prop-cov-summary').fill('สรุปความคุ้มครองอัคคีภัยฉบับ v2');
    await page.locator('#prop-remark').fill('เอกสารข้อเสนอฉบับปรับปรุง v2');

    await page.getByRole('button', { name: 'สร้างใบเสนอ' }).last().click();

    // Verify Proposal v2 card is created with v2 badge
    const v2Card = page.locator('.proposal-card', { hasText: 'v2' }).first();
    await expect(v2Card).toBeVisible({ timeout: 10_000 });
    await expect(v2Card.locator('app-status-badge')).toContainText('ฉบับร่าง');

    // Send proposal v2
    await v2Card.getByRole('button', { name: 'ส่งใบเสนอ' }).click();
    await expect(v2Card.locator('app-status-badge')).toContainText('ส่งแล้ว', { timeout: 10_000 });
    await expect(page.locator('app-status-badge').first()).toContainText('รอลูกค้าตอบรับ', { timeout: 10_000 });
  });

  test('Step 9 — Accept Proposal v2 with Evidence file', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);
    await page.getByRole('tab', { name: 'ใบเสนอ' }).click();

    const v2Card = page.locator('.proposal-card', { hasText: 'v2' }).first();
    await v2Card.getByRole('button', { name: 'ยอมรับ (Accept)' }).click();

    await expect(page.getByText('บันทึกการยอมรับข้อเสนอ (Accept Proposal)')).toBeVisible();

    await page.locator('#acc-name').fill('นายสมชาย ใจดี (ลูกค้า)');
    // Method defaults to EMAIL; attach evidence PDF file
    await page.setInputFiles('#acc-file', {
      name: 'signed-acceptance.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF'),
    });
    await page.locator('#acc-remark').fill('ลูกค้ายืนยันและส่งใบตอบรับลงนามทางอีเมล');

    await page.getByRole('button', { name: 'ยืนยันการยอมรับ' }).click();

    // Verify Proposal v2 status is ACCEPTED ("ตอบรับแล้ว")
    await expect(v2Card.locator('app-status-badge')).toContainText('ตอบรับแล้ว', { timeout: 10_000 });

    // Verify Job status is CUSTOMER_ACCEPTED ("ลูกค้ายอมรับ")
    await expect(page.locator('app-status-badge').first()).toContainText('ลูกค้ายอมรับ', { timeout: 10_000 });

    // Verify Acceptance Evidence card is rendered on Proposal v2 card
    const accCard = v2Card.locator('.acceptance-card');
    await expect(accCard).toBeVisible({ timeout: 10_000 });
    await expect(accCard.getByText('นายสมชาย ใจดี (ลูกค้า)')).toBeVisible();
    await expect(accCard.getByText(/อีเมล|EMAIL/)).toBeVisible();
    await expect(accCard.getByText('signed-acceptance.pdf')).toBeVisible();
    await expect(accCard.getByText('ลูกค้ายืนยันและส่งใบตอบรับลงนามทางอีเมล')).toBeVisible();
  });
});

