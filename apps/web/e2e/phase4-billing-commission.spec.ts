/**
 * Phase 4 Acceptance Flow — Billing, AR & Commission (PLAN_V2.md Day 30)
 *
 *   Setup (API): fresh agent, product with a 12.5% commission rate, 3-instalment payment term, and a policy
 *   issued from a 20,000 quotation (job → quotation → proposal → bind → policy).
 *   UI (finance):
 *     1. Policy detail shows 3 invoices; the first two are paid one by one and each gets a receipt.
 *     2. Commission stays CALCULATED/not payable until the last invoice is paid (D-13); approving it then makes it PAYABLE.
 *     3. Create the month's statement for the agent → confirm → mark paid.
 *     4. The commission row is PAID and the AR page no longer lists the policy.
 *
 * Prerequisites: `npm run dev` (api :3000, web :4200) and `npm run db:seed -w apps/api`.
 */
import { expect, test, type Page } from '@playwright/test';

const SEED_PASS = process.env['SEED_USER_PASSWORD'] ?? 'Password@123';
const BASE = 'http://localhost:4200';
const API = 'http://localhost:3000';
const RUN_ID = Date.now().toString(36);
const AGENT_USER = `p4agent${RUN_ID}`;

let agentId = '';
let policyId = '';
let policyNo = '';
let financePage: Page;

async function apiLogin(username: string, password = SEED_PASS): Promise<string> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return (await res.json()).data.accessToken as string;
}

async function api(method: string, path: string, token: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.success) throw new Error(`${method} ${path} failed: ${JSON.stringify(json)}`);
  return json.data;
}

async function login(page: Page, username: string) {
  await page.goto(`${BASE}/login`);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(SEED_PASS);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await page.waitForURL('**/dashboard');
}

/** Job → quotation → proposal → bind → policy, all over HTTP. Returns the policy. */
async function issuePolicy(admin: string, ids: { customerId: string; typeId: string; productId: string; companyId: string; termId: string; agentId: string }) {
  const agent = admin; // the admin drives the flow; the job is still owned by the fresh agent (agentId)
  const job = await api('POST', '/api/jobs', agent, {
    customerId: ids.customerId, insuranceTypeId: ids.typeId, productId: ids.productId, agentId: ids.agentId, effectiveDate: '2027-01-01',
  });
  const quo = await api('POST', `/api/jobs/${job.id}/quotations`, agent, { insuranceCompanyId: ids.companyId, grossPremium: '20000.00', validUntil: '2027-12-31' });
  await api('PUT', `/api/quotations/${quo.id}`, agent, { grossPremium: '20000.00', quotationDate: '2026-10-01', validUntil: '2027-12-31' });
  const version = (await api('GET', `/api/jobs/${job.id}/quotations`, agent))[0].version as number;
  await api('POST', `/api/quotations/${quo.id}/select`, agent, { reason: 'Phase 4 e2e', version });
  const proposal = await api('POST', `/api/jobs/${job.id}/proposal`, agent, { validUntil: '2027-06-30', paymentTermId: ids.termId });
  await api('POST', `/api/proposals/${proposal.id}/send`, agent);
  const accepted = await api('POST', `/api/proposals/${proposal.id}/accept`, agent, { method: 'MANUAL', remark: 'agreed' });
  for (const a of accepted.approvals ?? []) await api('POST', `/api/approvals/${a.id}/approve`, admin, { reason: 'ok' });
  await api('POST', `/api/jobs/${job.id}/bind`, agent, {});
  await api('POST', `/api/jobs/${job.id}/bind/confirm`, agent, { binderNumber: `BIND-${RUN_ID}` });
  return (await api('POST', `/api/jobs/${job.id}/policy`, agent, {})) as { id: string; policyNo: string };
}

async function openPolicyTab(page: Page, name: RegExp) {
  await page.getByRole('tab', { name }).click();
}

async function payInstalment(page: Page, row: number) {
  const inv = page.locator('app-policy-invoices tbody tr').filter({ has: page.getByRole('button', { name: 'บันทึกการชำระ' }) }).first();
  await inv.getByRole('button', { name: 'บันทึกการชำระ' }).click();
  await expect(page.getByText('บันทึกการชำระเงิน').first()).toBeVisible();
  await page.locator('#pay-ref').fill(`SLIP-${RUN_ID}-${row}`);
  const [res] = await Promise.all([
    page.waitForResponse((r) => /\/api\/invoices\/.+\/payments$/.test(r.url()) && r.request().method() === 'POST'),
    page.getByRole('dialog').getByRole('button', { name: /บันทึก$/ }).click(),
  ]);
  expect(res.status(), await res.text()).toBe(201);
}

test.describe.serial('Phase 4 — Billing, AR & Commission Flow', () => {
  test.beforeAll(async ({ browser }) => {
    const admin = await apiLogin('admin');
    const roles = (await api('GET', '/api/users/roles', admin)) as { id: string; code: string }[];
    const agentUser = await api('POST', '/api/users', admin, {
      username: AGENT_USER, email: `${AGENT_USER}@example.com`, fullName: `P4 Agent ${RUN_ID}`, password: SEED_PASS,
      roleIds: [roles.find((r) => r.code === 'AGENT')!.id],
    });
    agentId = agentUser.id;

    const customer = await api('POST', '/api/customers', admin, { customerType: 'INDIVIDUAL', firstName: `P4QA ${RUN_ID}`, lastName: 'Billing' });
    const types = await api('GET', '/api/master/insurance-types', admin);
    const companies = await api('GET', '/api/master/companies', admin);
    const product = await api('POST', '/api/master/products', admin, {
      insuranceTypeId: types[0].id, code: `P4-${RUN_ID}`, name: `P4 Product ${RUN_ID}`,
      requireDocsOnSubmit: false, requireDocsOnBind: false, requireUnderwriting: false,
    });
    await api('POST', '/api/master/commission-rates', admin, {
      insuranceCompanyId: companies[0].id, productId: product.id, rate: '12.5', effectiveFrom: '2026-01-01',
    });
    const term = await api('POST', '/api/master/payment-terms', admin, {
      code: `P4T${RUN_ID}`.toUpperCase(), name: 'P4 3 instalments', installments: 3, intervalMonths: 1, firstDueDays: 30,
    });
    const policy = await issuePolicy(admin, {
      customerId: customer.id, typeId: types[0].id, productId: product.id, companyId: companies[0].id, termId: term.id, agentId,
    });
    policyId = policy.id;
    policyNo = policy.policyNo;

    financePage = await browser.newPage();
    await login(financePage, 'finance');
  });

  test.afterAll(async () => {
    if (financePage) await financePage.close();
  });

  test('Step 1 — policy shows 3 instalment invoices', async () => {
    await financePage.goto(`${BASE}/policies/${policyId}`);
    await openPolicyTab(financePage, /ใบแจ้งหนี้/);
    const rows = financePage.locator('app-policy-invoices tbody > tr:not(.sub)');
    await expect(rows).toHaveCount(3, { timeout: 15_000 });
    await expect(financePage.locator('app-policy-invoices .summary')).toContainText('ค้างชำระ');
  });

  test('Step 2 — pay instalments one by one; receipts are issued; commission is not payable yet', async () => {
    const page = financePage;
    await page.goto(`${BASE}/policies/${policyId}`);
    await openPolicyTab(page, /ใบแจ้งหนี้/);
    await payInstalment(page, 1);
    await expect(page.locator('app-policy-invoices tbody > tr:not(.sub)').filter({ hasText: 'ชำระแล้ว' })).toHaveCount(1, { timeout: 10_000 });
    await payInstalment(page, 2);
    await expect(page.locator('app-policy-invoices tbody > tr:not(.sub)').filter({ hasText: 'ชำระแล้ว' })).toHaveCount(2, { timeout: 10_000 });

    // A receipt exists for the paid instalments
    await page.locator('app-policy-invoices').getByRole('button', { name: 'การชำระ' }).first().click();
    await expect(page.locator('app-policy-invoices .linkbtn').first()).toContainText(/^RC-/);

    // Commission waits for every invoice (D-13): approving now leaves it APPROVED, not PAYABLE
    await openPolicyTab(page, /ค่าคอมมิชชัน/);
    const row = page.locator('app-policy-commissions tbody tr').first();
    await expect(row).toContainText('คำนวณแล้ว');
    await row.getByRole('button', { name: 'อนุมัติ' }).click();
    await expect(page.locator('app-policy-commissions tbody tr').first()).toContainText('อนุมัติแล้ว', { timeout: 10_000 });
  });

  test('Step 3 — last instalment paid → commission becomes PAYABLE', async () => {
    const page = financePage;
    await openPolicyTab(page, /ใบแจ้งหนี้/);
    await payInstalment(page, 3);
    await expect(page.locator('app-policy-invoices tbody > tr:not(.sub)').filter({ hasText: 'ชำระแล้ว' })).toHaveCount(3, { timeout: 10_000 });

    await page.reload();
    await openPolicyTab(page, /ค่าคอมมิชชัน/);
    await expect(page.locator('app-policy-commissions tbody tr').first()).toContainText('พร้อมจ่าย', { timeout: 15_000 });
    // 20,000 × 12.5% = 2,500 gross; agent 50% = 1,250; WHT 3% = 37.50; net 1,212.50
    await expect(page.locator('app-policy-commissions tbody tr').first()).toContainText('1,212.50');
  });

  test('Step 4 — AR page no longer lists this policy', async () => {
    const page = financePage;
    await page.goto(`${BASE}/receivables`);
    await expect(page.getByText('ลูกหนี้คงค้าง (AR)').first()).toBeVisible();
    await expect(page.getByText(`P4QA ${RUN_ID}`)).toHaveCount(0);
  });

  test('Step 5 — create, confirm and pay the monthly statement', async () => {
    const page = financePage;
    await page.goto(`${BASE}/commission-statements`);
    await page.getByRole('button', { name: 'สร้างใบสรุป' }).click();
    await page.locator('ui-select[inputid="st-agent"] mat-select').click();
    await page.getByRole('option', { name: `P4 Agent ${RUN_ID}` }).click();
    await Promise.all([
      page.waitForURL(/\/commission-statements\/[0-9a-f-]+/),
      page.getByRole('dialog').getByRole('button', { name: /สร้าง$/ }).click(),
    ]);

    await expect(page.locator('app-status-badge').first()).toContainText('ร่าง');
    await expect(page.getByText('1,212.50').first()).toBeVisible();
    await page.getByRole('button', { name: /ยืนยัน$/ }).click();
    await expect(page.locator('app-status-badge').first()).toContainText('ยืนยันแล้ว', { timeout: 10_000 });

    await page.getByRole('button', { name: 'บันทึกว่าจ่ายแล้ว' }).click();
    await page.locator('#paid-ref').fill(`BANK-${RUN_ID}`);
    await page.getByRole('dialog').getByRole('button', { name: /ยืนยัน$/ }).click();
    await expect(page.locator('app-status-badge').first()).toContainText('ชำระแล้ว', { timeout: 10_000 });
  });

  test('Step 6 — the commission is PAID and the statement exports to Excel', async () => {
    const page = financePage;
    await page.goto(`${BASE}/policies/${policyId}`);
    await openPolicyTab(page, /ค่าคอมมิชชัน/);
    await expect(page.locator('app-policy-commissions tbody tr').first()).toContainText('ชำระแล้ว', { timeout: 15_000 });

    await page.goto(`${BASE}/commission-statements`);
    await page.getByRole('link', { name: /^CS-/ }).first().click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export Excel' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^CS-.*\.xlsx$/);
  });
});
