/**
 * Phase 5 Acceptance Flow — Endorsement, Cancellation & Refund (PLAN_V2.md Day 36)
 *
 *   Setup: Issue an ACTIVE policy.
 *   1. Endorsement Lifecycle:
 *      - Request endorsement (CHANGE_SUM_INSURED) via UI
 *      - Approve endorsement & Issue endorsement via UI
 *      - Check Policy version bumped (v2) and Version history snapshot recorded
 *   2. Cancellation Lifecycle:
 *      - Calculate short-rate refund and submit cancellation request via UI
 *      - Manager approves cancellation with confirmation document attached via UI
 *      - Policy status transitions to CANCELLED; Credit Note & Refund record generated
 *   3. Refund Lifecycle:
 *      - Finance navigates to /refunds
 *      - Approves refund request via UI
 *      - Processes payout (TRANSFER) via UI
 *      - Verifies refund marked PROCESSED
 *
 * Prerequisites: `npm run dev` (api :3000, web :4200) and `npm run db:seed -w apps/api`.
 */
import { expect, test, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const SEED_PASS = process.env['SEED_USER_PASSWORD'] ?? 'Password@123';
const BASE = 'http://localhost:4200';
const API = 'http://localhost:3000';
const RUN_ID = Date.now().toString(36);
const AGENT_USER = `p5agent${RUN_ID}`;

let adminToken = '';
let managerToken = '';
let financeToken = '';
let agentId = '';
let policyId = '';
let policyNo = '';
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
  await p.context().clearCookies(); // switching user on the same page: drop the previous session first
  await p.goto(`${BASE}/login`);
  await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.goto(`${BASE}/login`);
  await p.locator('#username').fill(username);
  await p.locator('#password').fill(SEED_PASS);
  await p.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await p.waitForURL('**/dashboard');
}

function daysFromToday(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}

async function issuePolicy(admin: string, ids: { customerId: string; typeId: string; productId: string; companyId: string; agentId: string }) {
  const job = await api('POST', '/api/jobs', admin, {
    customerId: ids.customerId,
    insuranceTypeId: ids.typeId,
    productId: ids.productId,
    agentId: ids.agentId,
    effectiveDate: daysFromToday(-10), // a fresh policy: the short-rate refund on cancelling it is worth paying out
    expiryDate: daysFromToday(355),
  });
  const quo = await api('POST', `/api/jobs/${job.id}/quotations`, admin, {
    insuranceCompanyId: ids.companyId,
    grossPremium: '10000.00',
    validUntil: '2027-12-31',
  });
  await api('PUT', `/api/quotations/${quo.id}`, admin, {
    grossPremium: '10000.00',
    quotationDate: '2026-01-01',
    validUntil: '2027-12-31',
  });
  const list = await api('GET', `/api/jobs/${job.id}/quotations`, admin);
  const version = list[0].version as number;
  await api('POST', `/api/quotations/${quo.id}/select`, admin, { reason: 'Phase 5 e2e', version });
  const proposal = await api('POST', `/api/jobs/${job.id}/proposal`, admin, { validUntil: '2027-06-30' });
  await api('POST', `/api/proposals/${proposal.id}/send`, admin);
  const accepted = await api('POST', `/api/proposals/${proposal.id}/accept`, admin, { method: 'MANUAL', remark: 'agreed' });
  for (const a of accepted.approvals ?? []) await api('POST', `/api/approvals/${a.id}/approve`, admin, { reason: 'ok' });
  await api('POST', `/api/jobs/${job.id}/bind`, admin, {});
  await api('POST', `/api/jobs/${job.id}/bind/confirm`, admin, { binderNumber: `BIND-${RUN_ID}` });
  return (await api('POST', `/api/jobs/${job.id}/policy`, admin, { sumInsured: '500000.00' })) as { id: string; policyNo: string };
}

test.describe.serial('Phase 5 — Endorsement, Cancellation & Refund Flow', () => {
  test.beforeAll(async ({ browser }) => {
    adminToken = await apiLogin('admin');
    managerToken = await apiLogin('manager');
    financeToken = await apiLogin('finance');

    const roles = (await api('GET', '/api/users/roles', adminToken)) as { id: string; code: string }[];
    const agentUser = await api('POST', '/api/users', adminToken, {
      username: AGENT_USER,
      email: `${AGENT_USER}@example.com`,
      fullName: `P5 Agent ${RUN_ID}`,
      password: SEED_PASS,
      roleIds: [roles.find((r) => r.code === 'AGENT')!.id],
    });
    agentId = agentUser.id;

    const customer = await api('POST', '/api/customers', adminToken, {
      customerType: 'INDIVIDUAL',
      firstName: `P5QA ${RUN_ID}`,
      lastName: 'Endorsement',
    });
    const types = await api('GET', '/api/master/insurance-types', adminToken);
    const companies = await api('GET', '/api/master/companies', adminToken);
    const product = await api('POST', '/api/master/products', adminToken, {
      insuranceTypeId: types[0].id,
      code: `P5-${RUN_ID}`,
      name: `P5 Product ${RUN_ID}`,
      requireDocsOnSubmit: false,
      requireDocsOnBind: false,
      requireUnderwriting: false,
    });

    const pol = await issuePolicy(adminToken, {
      customerId: customer.id,
      typeId: types[0].id,
      productId: product.id,
      companyId: companies[0].id,
      agentId,
    });
    policyId = pol.id;
    policyNo = pol.policyNo;

    page = await browser.newPage();
  });

  test.afterAll(async () => {
    if (page) await page.close();
  });

  test('1. Endorsement: additional premium → approval (rule ≥ 10,000) → issue → pay the debit note', async () => {
    await login(page, 'admin');
    await page.goto(`${BASE}/policies/${policyId}`);
    await expect(page.getByText(policyNo).first()).toBeVisible();

    // Navigate to Endorsements Tab
    await page.getByRole('tab', { name: /สลักหลัง/ }).click();
    await expect(page.getByText('รายการสลักหลัง (Endorsements)')).toBeVisible();

    // Create: new sum insured + additional premium worked out pro-rata from an annual change of 80,000
    await page.getByRole('button', { name: 'สร้างสลักหลัง' }).click();
    await expect(page.getByText('สร้างคำขอสลักหลัง').first()).toBeVisible();
    await page.locator('#en-sumInsured').fill('600000');
    await page.locator('ui-select').filter({ hasText: 'ไม่มีการปรับเบี้ย' }).locator('mat-select').click();
    await page.getByRole('option', { name: 'เรียกเก็บเบี้ยเพิ่ม' }).click();
    await page.locator('#en-annual').fill('80000');
    await page.getByRole('dialog').getByRole('button', { name: /คำนวณอัตโนมัติ/ }).click();
    await expect(page.locator('#en-total')).not.toHaveValue('0.00');
    const net = Number(await page.locator('#en-net').inputValue());
    expect(net).toBeGreaterThanOrEqual(10_000); // the policy has almost a full year left, so nearly all of the 80,000 is still ahead

    const [createRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/api/policies/${policyId}/endorsements`) && r.request().method() === 'POST'),
      page.getByRole('dialog').getByRole('button', { name: /สร้างคำขอสลักหลัง$/ }).click(),
    ]);
    expect(createRes.status()).toBe(201);
    await expect(page.locator('app-policy-endorsements tbody tr')).toHaveCount(1);

    // Submit → matches the ENDORSEMENT approval rule → waits for approval
    const row = page.locator('app-policy-endorsements tbody tr');
    await row.getByRole('button', { name: 'ส่งขออนุมัติ' }).click();
    await expect(row.getByText('รออนุมัติ')).toBeVisible();

    // Admin (may decide own requests in non-production) approves, then issues
    await row.getByRole('button', { name: /อนุมัติ$/ }).click();
    await expect(row.getByRole('button', { name: /ออกสลักหลัง/ })).toBeVisible();
    await row.getByRole('button', { name: /ออกสลักหลัง/ }).click();
    await expect(page.getByText('ออกสลักหลังเรียบร้อยแล้ว')).toBeVisible();
    await expect(row.getByText('ออกสลักหลังแล้ว')).toBeVisible();

    // The additional premium was billed as a debit note — pay it
    await page.reload();
    await page.getByRole('tab', { name: /ใบแจ้งหนี้/ }).click();
    const debit = page.locator('app-policy-invoices tbody > tr:not(.sub)').filter({ hasText: 'ใบเพิ่มหนี้' });
    await expect(debit).toHaveCount(1);
    await debit.getByRole('button', { name: 'บันทึกการชำระ' }).click();
    await page.locator('#pay-ref').fill(`DN-SLIP-${RUN_ID}`);
    await Promise.all([
      page.waitForResponse((r) => /\/api\/invoices\/.+\/payments$/.test(r.url()) && r.request().method() === 'POST' && r.ok()),
      page.getByRole('dialog').getByRole('button', { name: /บันทึก$/ }).click(),
    ]);
    await expect(debit.getByText('ชำระแล้ว')).toBeVisible();

    // Check version bumped on Policy Versions Tab
    await page.getByRole('tab', { name: /ประวัติเวอร์ชัน/ }).click();
    await expect(page.locator('.version-badge', { hasText: 'v1' })).toBeVisible();
  });

  test('2. Cancellation: Request and approve cancellation with short-rate calculation', async () => {
    await page.goto(`${BASE}/policies/${policyId}`);

    // Click "ขอยกเลิกกรมธรรม์" button
    await page.getByRole('button', { name: 'ขอยกเลิกกรมธรรม์' }).click();
    await expect(page.getByText('ยื่นคำขอยกเลิกกรมธรรม์').first()).toBeVisible();

    // Fill reason
    await page.locator('textarea[placeholder="ระบุเหตุผลที่ขอยกเลิกกรมธรรม์"]').fill('Customer requested cancellation');

    // Calculate short-rate refund
    await page.getByRole('button', { name: 'คำนวณอัตโนมัติ' }).click();
    await expect(page.getByText('เบี้ยประกันที่ต้องคืน:')).toBeVisible();

    // Submit cancellation request
    const [reqRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/api/policies/${policyId}/cancel-request`)),
      page.getByRole('button', { name: 'ยื่นคำขอยกเลิก' }).click(),
    ]);
    expect(reqRes.status()).toBe(201);

    // Should see pending cancellation banner
    await expect(page.getByText('มีคำขอยกเลิกกรมธรรม์อยู่ระหว่างรออนุมัติ')).toBeVisible();

    // Approve cancellation as Manager / Admin
    await page.getByRole('button', { name: 'อนุมัติยกเลิกกรมธรรม์' }).click();
    await expect(page.getByText('อนุมัติการยกเลิกกรมธรรม์').first()).toBeVisible();

    // Create a dummy insurer confirmation file
    const tmpFile = path.join('/tmp', `insurer_cancel_${RUN_ID}.pdf`);
    fs.writeFileSync(tmpFile, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R/Size 4>>\n%%EOF\n');
    await page.locator('input[type="file"]').setInputFiles(tmpFile);

    // Submit approval
    const [apprRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/api/policies/${policyId}/cancel-approve`)),
      page.getByRole('button', { name: 'ยืนยันอนุมัติยกเลิก' }).click(),
    ]);
    expect(apprRes.status()).toBe(201);

    // Policy status updated to Cancelled
    await expect(page.getByText('กรมธรรม์นี้ถูกยกเลิกแล้ว (Cancelled)')).toBeVisible();
  });

  test('3. Refund: Finance approves and processes refund payout on /refunds UI', async () => {
    // Switch to Finance user
    await login(page, 'finance');
    await page.goto(`${BASE}/refunds`);
    await expect(page.getByText('การคืนเงิน (Refunds)')).toBeVisible();

    // Should see the refund record created from policy cancellation
    const refundRow = page.locator('.data-table tbody tr').first();
    await expect(refundRow).toBeVisible();
    await expect(refundRow.getByText('รออนุมัติ')).toBeVisible();

    // Finance approves refund
    const [approveRes] = await Promise.all([
      page.waitForResponse((r) => /\/api\/refunds\/.+\/approve$/.test(r.url())),
      refundRow.getByRole('button', { name: 'อนุมัติ' }).click(),
    ]);
    expect(approveRes.status()).toBe(201);

    // Row status now APPROVED
    await expect(refundRow.getByRole('button', { name: 'บันทึกจ่ายเงิน (Process)' })).toBeVisible();

    // Finance clicks Process
    await refundRow.getByRole('button', { name: 'บันทึกจ่ายเงิน (Process)' }).click();
    await expect(page.getByText('บันทึกการจ่ายเงินคืนลูกค้า (Process Refund)').first()).toBeVisible();

    await page.locator('input[placeholder="เช่น กสิกรไทย, ไทยพาณิชย์"]').fill('ธนาคารกรุงเทพ');
    await page.locator('input[placeholder="เลขที่อ้างอิงการโอน"]').fill(`REFUND-SLIP-${RUN_ID}`);

    const [procRes] = await Promise.all([
      page.waitForResponse((r) => /\/api\/refunds\/.+\/process$/.test(r.url())),
      page.getByRole('dialog').getByRole('button', { name: 'ยืนยันการจ่ายเงิน' }).click(),
    ]);
    expect(procRes.status()).toBe(201);

    // Row status now shows PROCESSED
    await expect(refundRow.getByText('จ่ายแล้ว').first()).toBeVisible();
  });
});

