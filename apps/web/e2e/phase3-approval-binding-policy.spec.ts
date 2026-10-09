/**
 * Phase 3 Acceptance Flow — Approval, Binding & Policy Lifecycle (PLAN_V2.md Day 22)
 *
 * Covers the full Phase 3 end-to-end lifecycle:
 *   1. Create Job (Product with no underwriting required) → Submit (OPEN).
 *   2. Request Quotation from insurer → Record price with gross >= 100,000 to trigger approval rule.
 *   3. Select Quotation → Create Proposal → Send Proposal (Job WAITING_CUSTOMER).
 *   4. Accept Proposal → triggers Approval Rule (gross >= 100k) → Job transitions to WAITING_APPROVAL.
 *   5. Tab 8 Approval: Manager rejects approval with reason → Job becomes APPROVAL_REJECTED.
 *   6. Tab 8 Approval: Staff resubmits approval with revised explanation → Job returns to WAITING_APPROVAL.
 *   7. Tab 8 Approval: Manager approves approval → Job transitions to APPROVED.
 *   8. Tab 9 Binding: Staff binds job (bind) → Binding SUBMITTED, Job status remains BINDING (single-hop).
 *   9. Tab 9 Binding: Insurer rejects binding (insurerRejectBinding) with reason →
 *      Binding status becomes REJECTED, Job transitions back to previous status (APPROVED).
 *  10. Tab 9 Binding: Staff re-binds job (doBind) → Binding SUBMITTED, Job status BINDING.
 *  11. Tab 9 Binding: Staff confirms binding (confirmBinding) with binder number, date, premium, underwriter →
 *      Binding becomes CONFIRMED, Job transitions to POLICY_PENDING.
 *  12. Tab 10 Policy: Staff issues policy with sumInsured & deductible →
 *      Policy becomes ACTIVE (effectiveDate in past/today) and Job is automatically CLOSED (D-10).
 *
 * Prerequisites:
 *   1. `npm run dev` (root) — API on :3000, web on :4200
 *   2. `npm run db:seed -w apps/api` — seeds admin/staff/manager + master data
 */
import { expect, test, type Page } from '@playwright/test';

const SEED_PASS = process.env['SEED_USER_PASSWORD'] ?? 'Password@123';
const BASE = 'http://localhost:4200';
const API = 'http://localhost:3000';

const RUN_ID = Date.now().toString(36);
const CUSTOMER_NAME = `Phase3QA ${RUN_ID}`;
const PRODUCT_CODE = `E2EP3-${RUN_ID}`;

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

// ─── Suite ──────────────────────────────────────────────────────────────────

test.describe.serial('Phase 3 — Approval, Binding & Policy Lifecycle Flow', () => {
  test.beforeAll(async ({ browser }) => {
    const adminToken = await apiLogin('admin');

    // Create a dedicated test customer via API
    await apiCall('POST', '/api/customers', adminToken, {
      customerType: 'INDIVIDUAL',
      firstName: CUSTOMER_NAME,
      lastName: 'PhaseThree',
    });

    // Create a dedicated product without underwriting required and no required risk fields
    const types = await apiCall('GET', '/api/master/insurance-types', adminToken);
    const fireType = types.find((t: { code: string }) => t.code === 'FIRE') ?? types[0];

    productName = `E2E P3 Fire ${RUN_ID}`;
    await apiCall('POST', '/api/master/insurance-products', adminToken, {
      code: PRODUCT_CODE,
      name: productName,
      insuranceTypeId: fireType.id,
      requireUnderwriting: false,
    });

    adminPage = await browser.newPage();
    await login(adminPage, 'admin');
  });

  test.afterAll(async () => {
    if (adminPage) await adminPage.close();
  });

  // ── Step 1: Create Job and Submit (DRAFT → OPEN) ─────────────────────────────
  test('Step 1 — Create job and submit to OPEN', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/new`);
    await expect(page.getByText('สร้างงานประกันใหม่')).toBeVisible();

    // Select customer
    const searchInput = page.locator('#customer-search');
    await searchInput.fill(CUSTOMER_NAME);
    await page.waitForResponse((r) => r.url().includes('/api/customers') && r.status() === 200);
    await page.getByRole('option', { name: new RegExp(CUSTOMER_NAME) }).first().click();

    // Select insurance type & product
    await selectMatOption(page, 'insuranceTypeId', 'ประกันอัคคีภัย');
    await selectMatOption(page, 'productId', productName);

    // Fill effective date
    await page.locator('#effectiveDate').fill('2026-10-09');
    await page.locator('#effectiveDate').press('Tab');

    // Create job (DRAFT)
    await page.getByRole('button', { name: 'บันทึกข้อมูล' }).click();
    await page.waitForURL(/\/jobs\/[0-9a-f-]+/);
    jobId = page.url().split('/jobs/')[1].split('?')[0];
    expect(jobId).toBeTruthy();

    await expect(page.locator('app-status-badge').first()).toContainText('ฉบับร่าง');

    // Submit Job → OPEN
    await page.getByRole('button', { name: 'ส่งงาน' }).click();
    await expect(page.locator('app-status-badge').first()).toContainText('เปิดงานแล้ว', { timeout: 10_000 });
  });

  // ── Step 2: Request quotation & record price (trigger approval: >= 100,000) ──
  test('Step 2 — Request and record quotation with gross >= 100k', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);
    await page.getByRole('tab', { name: 'ใบเสนอราคา' }).click();

    // Click "ขอราคา"
    await page.getByRole('button', { name: 'ขอราคา' }).click();
    await expect(page.getByText('ขอใบเสนอราคา')).toBeVisible();
    await selectMatOption(page, 'quo-company', /.+/);
    await page.getByRole('button', { name: 'ส่งคำขอ' }).click();

    // Scope to the quotation row's action button
    await page.locator('.quo-action-btns').getByRole('button', { name: 'บันทึกราคา' }).first().click();

    // Set gross >= 100,000 to trigger approval rule (> 100,000 requires supervisor/manager approval)
    await page.locator('#rec-gross').fill('120000');
    await page.locator('#rec-discount').fill('5000');
    await page.locator('#rec-deductible').fill('2000');
    await page.locator('#rec-comm-rate').fill('15.00');
    await page.locator('#rec-quo-date').fill('2026-10-09');
    await page.locator('#rec-valid').fill('2027-12-31');
    await page.locator('#rec-underwriter').fill('นายพิจารณา การันตี');
    await page.locator('#rec-insurer-ref').fill('QT-P3-120K');

    await Promise.all([
      page.waitForResponse((r) => /\/api\/quotations\/.+/.test(r.url()) && r.request().method() === 'PUT'),
      page.locator('.cdk-overlay-container').getByRole('button', { name: 'บันทึกราคา' }).click(),
    ]);

    await expect(page.locator('app-status-badge').getByText('ได้รับราคา').first()).toBeVisible({ timeout: 10_000 });
  });

  // ── Step 3: Select quotation, create & send proposal ─────────────────────────
  test('Step 3 — Select quotation and send proposal', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);

    // Select quotation on Tab เปรียบเทียบ
    await page.getByRole('tab', { name: 'เปรียบเทียบ' }).click();
    await page.getByRole('button', { name: 'เลือกข้อเสนอนี้' }).first().click();
    await page.locator('#select-reason').fill('เลือกข้อเสนอเบี้ย 120,000');
    await page.getByRole('button', { name: 'ยืนยันเลือก' }).click();
    await expect(page.locator('app-status-badge').first()).toContainText('เลือกราคาแล้ว', { timeout: 10_000 });

    // Create proposal on Tab ใบเสนอ
    await page.getByRole('tab', { name: 'ใบเสนอ' }).click();
    await page.getByRole('button', { name: 'สร้างใบเสนอ' }).click();
    await page.locator('#prop-valid').fill('2027-12-31');
    await selectMatOption(page, 'prop-payment-term', /.+/);
    await page.locator('#prop-cov-summary').fill('สรุปความคุ้มครอง Phase 3 Test');
    await page.getByRole('button', { name: 'สร้างใบเสนอ' }).last().click();

    const propCard = page.locator('.proposal-card').first();
    await expect(propCard).toBeVisible({ timeout: 10_000 });

    // Send proposal
    await propCard.getByRole('button', { name: 'ส่งใบเสนอ' }).click();
    await expect(propCard.locator('app-status-badge')).toContainText('ส่งแล้ว', { timeout: 10_000 });
    await expect(page.locator('app-status-badge').first()).toContainText('รอลูกค้าตอบรับ', { timeout: 10_000 });
  });

  // ── Step 4: Customer Accept triggers approval rule → WAITING_APPROVAL ─────────
  test('Step 4 — Customer accept triggers approval rule (WAITING_APPROVAL)', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);
    await page.getByRole('tab', { name: 'ใบเสนอ' }).click();

    const propCard = page.locator('.proposal-card').first();
    await propCard.getByRole('button', { name: 'ยอมรับ (Accept)' }).click();
    await expect(page.getByText('บันทึกการยอมรับข้อเสนอ (Accept Proposal)')).toBeVisible();

    await page.locator('#acc-name').fill('ลูกค้าตอบรับผ่านวาจา');
    // Select method MANUAL so file is not required, remark is required
    await selectMatOption(page, 'acc-method', /ด้วยตนเอง|MANUAL/);
    await page.locator('#acc-remark').fill('ลูกค้าตอบรับข้อเสนอ 120k ผ่านโทรศัพท์');
    await page.getByRole('button', { name: 'ยืนยันการยอมรับ' }).click();

    // Since gross premium > 100,000, approval rule triggers → Job transitions to WAITING_APPROVAL
    await expect(page.locator('app-status-badge').first()).toContainText('รออนุมัติ', { timeout: 10_000 });
  });

  // ── Step 5: Tab 8 Approval — Reject approval (APPROVAL_REJECTED) ───────────────
  test('Step 5 — Reject approval on Tab 8 (Job becomes APPROVAL_REJECTED)', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);
    await page.getByRole('tab', { name: 'การอนุมัติ' }).click();

    // Table of approvals
    await expect(page.locator('.data-table')).toBeVisible({ timeout: 10_000 });
    // Click "ปฏิเสธ" button on approval row
    await page.locator('.row-actions').getByRole('button', { name: 'ปฏิเสธ' }).first().click();

    await expect(page.getByText('ปฏิเสธการอนุมัติ')).toBeVisible();
    await page.locator('#reject-appr-reason').fill('เบี้ยสูงเกินไป ต้องการให้ต่อรองเพิ่มเติม');
    await page.locator('.cdk-overlay-container').getByRole('button', { name: 'ปฏิเสธ' }).click();

    // Job header badge becomes APPROVAL_REJECTED ("ไม่อนุมัติ")
    await expect(page.locator('app-status-badge').first()).toContainText('ไม่อนุมัติ', { timeout: 10_000 });

    // Verify rejection reason is displayed in the table
    await expect(page.locator('.reject-reason-box')).toContainText('เบี้ยสูงเกินไป ต้องการให้ต่อรองเพิ่มเติม', { timeout: 10_000 });
  });

  // ── Step 6: Tab 8 Approval — Resubmit approval (Job returns to WAITING_APPROVAL)
  test('Step 6 — Resubmit approval on Tab 8 (Job returns to WAITING_APPROVAL)', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);
    await page.getByRole('tab', { name: 'การอนุมัติ' }).click();

    // In APPROVAL_REJECTED state, the "ยื่นใหม่" button appears on the rejected approval
    await page.getByRole('button', { name: 'ยื่นใหม่' }).first().click();

    await expect(page.getByText('ยื่นขออนุมัติใหม่ (Resubmit Approval)')).toBeVisible();
    await page.locator('#resubmit-appr-reason').fill('ยืนยันความจำเป็นตามเงื่อนไขพิเศษของลูกค้า');
    await page.locator('.cdk-overlay-container').getByRole('button', { name: 'ยื่นพิจารณาใหม่' }).click();

    // Job returns to WAITING_APPROVAL ("รออนุมัติ")
    await expect(page.locator('app-status-badge').first()).toContainText('รออนุมัติ', { timeout: 10_000 });
  });

  // ── Step 7: Tab 8 Approval — Approve (Job becomes APPROVED) ────────────────────
  test('Step 7 — Approve approval on Tab 8 (Job becomes APPROVED)', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);
    await page.getByRole('tab', { name: 'การอนุมัติ' }).click();

    // Click "อนุมัติ" button
    await page.locator('.row-actions').getByRole('button', { name: 'อนุมัติ' }).first().click();

    // Job status transitions to APPROVED ("อนุมัติแล้ว")
    await expect(page.locator('app-status-badge').first()).toContainText('อนุมัติแล้ว', { timeout: 10_000 });
  });

  // ── Step 8: Tab 9 Binding — Bind (single-hop, Job status BINDING) ──────────────
  test('Step 8 — Bind job on Tab 9 (single-hop, Job remains BINDING)', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);
    await page.getByRole('tab', { name: 'ยืนยันคุ้มครอง' }).click();

    // Click "ส่งยืนยันคุ้มครอง (Bind)"
    await page.getByRole('button', { name: 'ส่งยืนยันคุ้มครอง (Bind)' }).click();

    // Job status should be BINDING ("รอยืนยันคุ้มครอง"), Binding card should display SUBMITTED ("ยื่นคำขอแล้ว" / SUBMITTED)
    await expect(page.locator('app-status-badge').first()).toContainText('รอยืนยันคุ้มครอง', { timeout: 10_000 });
    const bindingCard = page.locator('.binding-card');
    await expect(bindingCard).toBeVisible({ timeout: 10_000 });
    await expect(bindingCard.locator('app-status-badge')).toContainText(/ยื่นคำขอ|SUBMITTED/, { timeout: 10_000 });
  });

  // ── Step 9: Tab 9 Binding — Insurer Reject (Job reverts to APPROVED) ───────────
  test('Step 9 — Insurer reject binding (Job reverts to APPROVED)', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);
    await page.getByRole('tab', { name: 'ยืนยันคุ้มครอง' }).click();

    // Click "บริษัทประกันปฏิเสธ (Insurer Reject)"
    await page.getByRole('button', { name: 'บริษัทประกันปฏิเสธ (Insurer Reject)' }).click();

    await expect(page.getByText('บริษัทประกันปฏิเสธการรับประกัน (Insurer Reject)')).toBeVisible();
    await page.locator('#rb-reason').fill('บริษัทประกันขอปฏิเสธเนื่องจากพื้นที่อยู่นอกเขตรับประกัน');
    await page.locator('.cdk-overlay-container').getByRole('button', { name: 'ยืนยันการปฏิเสธ' }).click();

    // Job reverts back to APPROVED ("อนุมัติแล้ว") so staff can re-bind
    await expect(page.locator('app-status-badge').first()).toContainText('อนุมัติแล้ว', { timeout: 10_000 });
    // Binding card shows REJECTED with rejection reason box
    await expect(page.locator('.rejection-box')).toContainText('พื้นที่อยู่นอกเขตรับประกัน', { timeout: 10_000 });
  });

  // ── Step 10: Tab 9 Binding — Re-bind (Job returns to BINDING) ──────────────────
  test('Step 10 — Re-bind job (Job returns to BINDING)', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);
    await page.getByRole('tab', { name: 'ยืนยันคุ้มครอง' }).click();

    // In REJECTED state, button says "ยื่นออกกรมธรรม์ใหม่ (Re-bind)"
    await page.getByRole('button', { name: 'ยื่นออกกรมธรรม์ใหม่ (Re-bind)' }).click();

    // Job transitions to BINDING again
    await expect(page.locator('app-status-badge').first()).toContainText('รอยืนยันคุ้มครอง', { timeout: 10_000 });
    const bindingCard = page.locator('.binding-card');
    await expect(bindingCard.locator('app-status-badge')).toContainText(/ยื่นคำขอ|SUBMITTED/, { timeout: 10_000 });
  });

  // ── Step 11: Tab 9 Binding — Confirm Binding (Job becomes POLICY_PENDING) ──────
  test('Step 11 — Confirm binding with binder details (Job becomes POLICY_PENDING)', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);
    await page.getByRole('tab', { name: 'ยืนยันคุ้มครอง' }).click();

    // Click "ยืนยันรับประกัน (Confirm Binding)"
    await page.getByRole('button', { name: 'ยืนยันรับประกัน (Confirm Binding)' }).click();

    await expect(page.getByText('ยืนยันรับประกัน (Confirm Binding)')).toBeVisible();
    await page.locator('#cb-binder-no').fill('BND-2026-P3-001');
    await page.locator('#cb-binder-date').fill('2026-10-09');
    await page.locator('#cb-premium').fill('115000');
    await page.locator('#cb-payment-cond').fill('เครดิต 30 วัน');
    await page.locator('#cb-underwriter').fill('นายพิจารณา การันตี');
    await page.locator('#cb-remark').fill('ยืนยันความคุ้มครองสมบูรณ์');

    await page.locator('.cdk-overlay-container').getByRole('button', { name: 'ยืนยันรับประกัน' }).click();

    // Job transitions to POLICY_PENDING ("รอออกกรมธรรม์")
    await expect(page.locator('app-status-badge').first()).toContainText('รอออกกรมธรรม์', { timeout: 10_000 });
  });

  // ── Step 12: Tab 10 Policy — Issue Policy (Policy ACTIVE & Job CLOSED) ─────────
  test('Step 12 — Issue policy (Policy becomes ACTIVE and Job automatically CLOSED)', async () => {
    const page = adminPage;
    await page.goto(`${BASE}/jobs/${jobId}`);
    await page.getByRole('tab', { name: 'กรมธรรม์' }).click();

    await page.locator('#issue-sum-insured').fill('5000000');
    await page.locator('#issue-deductible').fill('2000');
    await page.locator('#policy-remark').fill('ออกกรมธรรม์เรียบร้อยตามข้อกำหนด');

    await page.getByRole('button', { name: 'ออกกรมธรรม์ (Issue Policy)' }).click();

    // Policy card is rendered with ACTIVE status ("คุ้มครองแล้ว" / ACTIVE)
    const policyCard = page.locator('.policy-card');
    await expect(policyCard).toBeVisible({ timeout: 10_000 });
    await expect(policyCard.locator('app-status-badge')).toContainText(/คุ้มครองอยู่|ACTIVE|คุ้มครองแล้ว/, { timeout: 10_000 });

    // Job status automatically transitions to CLOSED ("ปิดงานแล้ว") in the same transaction (D-10)
    await expect(page.locator('app-status-badge').first()).toContainText('ปิดงานแล้ว', { timeout: 10_000 });

    // Verify sumInsured & deductible are displayed in Policy details
    await expect(policyCard.getByText('5,000,000')).toBeVisible();
    await expect(policyCard.getByText('2,000')).toBeVisible();
  });
});

