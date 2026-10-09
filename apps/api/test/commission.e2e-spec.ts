/**
 * Commission V2 E2E (Phase 4 Day 26)
 *
 * Commission is calculated by the system when a policy is issued:
 *   gross = net premium × rate · agent share · manager override · broker remainder · WHT per payee
 * then FINANCE approves it and it becomes PAYABLE once every invoice of the policy is paid (D-13).
 * Day 27 adds signed adjustments and monthly payee statements (DRAFT → CONFIRMED → PAID).
 */
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_com_';
const PASSWORD = 'E2e@Com123';

interface CommissionRow {
  id: string;
  agentId: string;
  commissionType: 'AGENT' | 'TEAM';
  status: string;
  commissionRate: string;
  commissionBase: string;
  commissionAmount: string;
  grossAmount: string;
  sharePct: string;
  brokerShareAmount: string | null;
  whtRate: string;
  whtAmount: string;
  netAmount: string;
  rateSource: string;
  payableAt: string | null;
}

describe('Commission V2 (Phase 4 D26)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agentToken: string;
  let financeToken: string;
  let adminToken: string;
  let viewerToken: string;
  let approverToken: string;
  let agentId: string;
  let managerId: string;
  let customerId: string;
  let iTypeId: string;
  let companyId: string;
  let productWithRateId: string; // has a master commission rate
  let productNoRateId: string; // has none
  let threeInstalmentTermId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const getCommissions = async (policyId: string, token = financeToken): Promise<CommissionRow[]> =>
    (await http().get(`/api/policies/${policyId}/commissions`).set(auth(token))).body.data.items;
  const byType = (rows: CommissionRow[], type: 'AGENT' | 'TEAM', status?: string) =>
    rows.find((r) => r.commissionType === type && (!status || r.status === status));
  const setSetting = (key: string, value: string) =>
    http().put(`/api/system-settings/${key}`).set(auth(adminToken)).send({ value });

  /** Runs the whole sales flow over HTTP up to an issued policy and returns its id. */
  async function issuePolicy(opts: { productId: string; jobLabel: string; quotationRate?: string; paymentTermId?: string }): Promise<{ policyId: string; jobId: string }> {
    const jobRes = await http().post('/api/jobs').set(auth(agentToken)).send({
      customerId, insuranceTypeId: iTypeId, productId: opts.productId, agentId, effectiveDate: '2027-01-01',
    });
    const jobId = jobRes.body.data.id as string;

    const quo = await http().post(`/api/jobs/${jobId}/quotations`).set(auth(agentToken))
      .send({ insuranceCompanyId: companyId, grossPremium: '20000.00', validUntil: '2027-12-31' });
    const quotationId = quo.body.data.id as string;
    await http().put(`/api/quotations/${quotationId}`).set(auth(agentToken)).send({
      grossPremium: '20000.00', quotationDate: '2026-10-01', validUntil: '2027-12-31',
      ...(opts.quotationRate ? { commissionRate: opts.quotationRate } : {}),
    });
    const version = (await http().get(`/api/jobs/${jobId}/quotations`).set(auth(agentToken))).body.data[0].version as number;
    await http().post(`/api/quotations/${quotationId}/select`).set(auth(agentToken)).send({ reason: opts.jobLabel, version });

    const proposalId = (await http().post(`/api/jobs/${jobId}/proposal`).set(auth(agentToken))
      .send({ validUntil: '2027-06-30', remark: opts.jobLabel, ...(opts.paymentTermId ? { paymentTermId: opts.paymentTermId } : {}) })).body.data.id as string;
    await http().post(`/api/proposals/${proposalId}/send`).set(auth(agentToken));
    const acc = await http().post(`/api/proposals/${proposalId}/accept`).set(auth(agentToken))
      .send({ method: 'MANUAL', remark: 'Customer agreed verbally' });
    for (const approval of acc.body.data.approvals ?? []) {
      await http().post(`/api/approvals/${approval.id}/approve`).set(auth(approverToken)).send({ reason: opts.jobLabel });
    }

    await http().post(`/api/jobs/${jobId}/bind`).set(auth(agentToken)).send({ remark: opts.jobLabel });
    await http().post(`/api/jobs/${jobId}/bind/confirm`).set(auth(agentToken)).send({ binderNumber: `BIND-${opts.jobLabel}` });
    const pol = await http().post(`/api/jobs/${jobId}/policy`).set(auth(agentToken)).send({ remark: opts.jobLabel });
    if (pol.status !== 201) throw new Error(`Policy creation failed: ${JSON.stringify(pol.body)}`);
    return { policyId: pol.body.data.id as string, jobId };
  }

  /** Pays every open invoice of a policy in full; returns the payments made. */
  async function payInFull(policyId: string): Promise<string[]> {
    const invoices = (await http().get(`/api/policies/${policyId}/invoices`).set(auth(agentToken))).body.data as {
      id: string; status: string; outstandingAmount: string;
    }[];
    const ids: string[] = [];
    for (const inv of invoices.filter((i) => i.status !== 'PAID')) {
      const res = await http().post(`/api/invoices/${inv.id}/payments`).set(auth(agentToken))
        .send({ amount: inv.outstandingAmount, paymentMethod: 'TRANSFER' });
      expect(res.status).toBe(201);
      ids.push(res.body.data.payment.id);
    }
    return ids;
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    // ─── Cleanup ───────────────────────────────────────────────────────────
    const prevJobs = await prisma.job.findMany({
      where: { agent: { username: { startsWith: PREFIX } } },
      select: { id: true },
    });
    const prevJobIds = prevJobs.map((j) => j.id);
    if (prevJobIds.length > 0) {
      await prisma.idempotencyKey.deleteMany({ where: { entityId: { in: prevJobIds } } });
      await prisma.receipt.deleteMany({ where: { invoice: { policy: { jobId: { in: prevJobIds } } } } });
      await prisma.payment.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.invoice.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.commissionAdjustment.deleteMany({ where: { commission: { policy: { jobId: { in: prevJobIds } } } } });
      await prisma.commission.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.policyCoverage.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.policy.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.binding.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.approval.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.proposalAcceptance.deleteMany({ where: { proposal: { jobId: { in: prevJobIds } } } });
      await prisma.proposal.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.quotationItem.deleteMany({ where: { quotation: { jobId: { in: prevJobIds } } } });
      await prisma.quotation.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.jobStatusHistory.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.activityLog.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.document.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.job.deleteMany({ where: { id: { in: prevJobIds } } });
    }
    await prisma.paymentTerm.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } }).catch(() => undefined);
    await prisma.commissionStatement.deleteMany({ where: { agent: { username: { startsWith: PREFIX } } } });
    await prisma.commissionRate.deleteMany({ where: { OR: [{ product: { code: { startsWith: PREFIX.toUpperCase() } } }, { insuranceCompany: { code: { startsWith: PREFIX.toUpperCase() } } }] } });
    await prisma.customer.deleteMany({ where: { customerCode: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.insuranceCompany.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.insuranceProduct.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    const testUsers = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
    if (testUsers.length > 0) {
      await prisma.customer.deleteMany({ where: { createdById: { in: testUsers.map((u) => u.id) } } });
    }
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });

    // ─── Roles & users ─────────────────────────────────────────────────────
    const passwordHash = await hash(PASSWORD);
    const perms = [
      'job.view', 'job.view_all', 'job.create', 'job.submit', 'job.update', 'customer.view', 'customer.create',
      'quotation.create', 'quotation.update', 'quotation.select', 'proposal.create', 'proposal.send',
      'proposal.accept', 'proposal.reject', 'approval.approve', 'policy.view', 'policy.create', 'policy.update',
      'commission.view', 'commission.create', 'commission.approve', 'commission.adjust', 'commission.statement', 'payment.view', 'payment.create',
      'invoice.view', 'master.manage', 'user.manage',
    ];
    await Promise.all(perms.map((code) => prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } })));
    const mkRole = (suffix: string, codes: string[], dataScope: 'OWN' | 'ALL' = 'OWN') =>
      prisma.role.create({
        data: {
          code: `${PREFIX.toUpperCase()}${suffix}`,
          name: `E2E Commission ${suffix}`,
          dataScope,
          permissions: { create: codes.map((c) => ({ permission: { connect: { code: c } } })) },
        },
      });
    const mkUser = (name: string, roleId: string, extra: Record<string, unknown> = {}) =>
      prisma.user.create({
        data: {
          username: `${PREFIX}${name}`,
          email: `${PREFIX}${name}@test.com`,
          passwordHash,
          fullName: `E2E Commission ${name}`,
          roles: { create: [{ role: { connect: { id: roleId } } }] },
          ...extra,
        },
      });

    const agentRole = await mkRole('AGT', [
      'job.view', 'job.create', 'job.submit', 'job.update', 'customer.view', 'customer.create',
      'quotation.create', 'quotation.update', 'quotation.select', 'proposal.create', 'proposal.send',
      'proposal.accept', 'proposal.reject', 'policy.view', 'policy.create', 'policy.update',
      'commission.view', 'payment.view', 'payment.create', 'invoice.view',
    ]);
    const financeRole = await mkRole('FIN', ['job.view_all', 'policy.view', 'commission.view', 'commission.create', 'commission.approve', 'commission.adjust', 'commission.statement', 'payment.view', 'invoice.view'], 'ALL');
    const adminRole = await mkRole('ADM', ['master.manage', 'user.manage'], 'ALL');
    const approverRole = await mkRole('MANAGER', ['approval.approve', 'job.view_all'], 'ALL');
    const viewerRole = await mkRole('VWR', ['commission.view']);

    const manager = await mkUser('mgr', viewerRole.id);
    managerId = manager.id;
    const agent = await mkUser('agent', agentRole.id, { manager: { connect: { id: manager.id } } });
    agentId = agent.id;
    await mkUser('finance', financeRole.id);
    await mkUser('admin', adminRole.id);
    await mkUser('approver', approverRole.id);
    await mkUser('viewer', viewerRole.id);

    const login = async (name: string) =>
      (await http().post('/api/auth/login').send({ username: `${PREFIX}${name}`, password: PASSWORD })).body.data.accessToken as string;
    agentToken = await login('agent');
    financeToken = await login('finance');
    adminToken = await login('admin');
    approverToken = await login('approver');
    viewerToken = await login('viewer');

    // ─── Master data ───────────────────────────────────────────────────────
    const iType = await prisma.insuranceType.findFirst({ where: { active: true } });
    iTypeId = iType!.id;
    customerId = (await prisma.customer.create({
      data: { customerCode: `${PREFIX.toUpperCase()}C01`, customerType: 'INDIVIDUAL', firstName: 'ทดสอบCom', lastName: 'ลูกค้าCom' },
    })).id;
    companyId = (await prisma.insuranceCompany.create({ data: { code: `${PREFIX.toUpperCase()}CO`, name: 'E2E Commission Company' } })).id;
    const mkProduct = (suffix: string) =>
      prisma.insuranceProduct.create({
        data: { insuranceTypeId: iTypeId, code: `${PREFIX.toUpperCase()}${suffix}`, name: `E2E Commission ${suffix}`, requireDocsOnSubmit: false, requireDocsOnBind: false },
      });
    productWithRateId = (await mkProduct('RATED')).id;
    productNoRateId = (await mkProduct('NORATE')).id;
    await prisma.paymentTerm.deleteMany({ where: { code: `${PREFIX.toUpperCase()}3X` } });
    threeInstalmentTermId = (await prisma.paymentTerm.create({
      data: { code: `${PREFIX.toUpperCase()}3X`, name: 'E2E 3 instalments', installments: 3, intervalMonths: 1, firstDueDays: 30 },
    })).id;
    await prisma.commissionRate.create({
      data: { insuranceCompanyId: companyId, productId: productWithRateId, rate: '12.5', effectiveFrom: new Date('2026-01-01') },
    });

    // Known settings for the numbers asserted below: WHT 3%, agent share 50%, override 10%
    expect((await setSetting('commission.wht_rate', '3')).status).toBe(200);
    expect((await setSetting('commission.default_agent_share_pct', '50')).status).toBe(200);
    expect((await setSetting('commission.override_rate', '10')).status).toBe(200);
  });

  afterAll(async () => {
    // Other suites issue policies too — leave the system settings as they are by default
    await setSetting('commission.override_rate', '0');
    await setSetting('commission.default_agent_share_pct', '50');
    await setSetting('commission.wht_rate', '3');
    await app.close();
  });

  // ─── Calculation at issue ───────────────────────────────────────────────────

  let policyA: string;
  let invoiceA: string;
  it('C1: issuing a policy calculates commission — gross, agent share, manager override, broker remainder, WHT', async () => {
    ({ policyId: policyA } = await issuePolicy({ productId: productWithRateId, jobLabel: 'A' }));

    const policy = await prisma.policy.findUniqueOrThrow({ where: { id: policyA } });
    expect(policy.netPremium.toString()).toBe('20000'); // the numbers below are derived from this

    const rows = await getCommissions(policyA);
    expect(rows).toHaveLength(2);

    // 20000 × 12.5% = 2500.00
    const agent = byType(rows, 'AGENT')!;
    expect(agent).toMatchObject({
      agentId, status: 'CALCULATED', rateSource: 'QUOTATION', commissionRate: '12.5000', commissionBase: '20000.00',
      grossAmount: '2500.00', sharePct: '50.00', commissionAmount: '1250.00', whtRate: '3.00', whtAmount: '37.50', netAmount: '1212.50',
      brokerShareAmount: '1000.00',
    });
    const override = byType(rows, 'TEAM')!;
    expect(override).toMatchObject({
      agentId: managerId, status: 'CALCULATED', grossAmount: '2500.00', sharePct: '10.00',
      commissionAmount: '250.00', whtAmount: '7.50', netAmount: '242.50',
    });
    // agent + override + broker = gross, to the satang
    expect(1250.0 + 250.0 + Number(agent.brokerShareAmount)).toBe(2500);
  });

  it('C2: the manual V1 endpoint is gone', async () => {
    const res = await http().post(`/api/policies/${policyA}/commission`).set(auth(financeToken))
      .send({ commissionType: 'COMPANY', commissionBase: '1000.00', commissionRate: '10.0000' });
    expect(res.status).toBe(404);
  });

  it('C3: the rate on the selected quotation beats the master, and an agent-specific share beats the default', async () => {
    await prisma.user.update({ where: { id: agentId }, data: { agentSharePct: '60' } });
    const { policyId } = await issuePolicy({ productId: productWithRateId, jobLabel: 'B', quotationRate: '20' });

    const rows = await getCommissions(policyId);
    // 20000 × 20% = 4000 · agent 60% = 2400 (WHT 72 → 2328) · override 10% = 400 (WHT 12 → 388) · broker 1200
    expect(byType(rows, 'AGENT')).toMatchObject({
      rateSource: 'QUOTATION', commissionRate: '20.0000', grossAmount: '4000.00', sharePct: '60.00',
      commissionAmount: '2400.00', whtAmount: '72.00', netAmount: '2328.00', brokerShareAmount: '1200.00',
    });
    expect(byType(rows, 'TEAM')).toMatchObject({ commissionAmount: '400.00', whtAmount: '12.00', netAmount: '388.00' });

    // Recalculating before anything is approved replaces the rows; the old ones stay as CANCELLED
    expect((await setSetting('commission.override_rate', '0')).status).toBe(200);
    const recalc = await http().post(`/api/policies/${policyId}/commissions/calculate`).set(auth(financeToken));
    expect(recalc.status).toBe(201);
    const after = await getCommissions(policyId);
    expect(after.filter((r) => r.status === 'CANCELLED')).toHaveLength(2);
    const live = after.filter((r) => r.status === 'CALCULATED');
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ commissionType: 'AGENT', commissionAmount: '2400.00', brokerShareAmount: '1600.00' });

    await prisma.user.update({ where: { id: agentId }, data: { agentSharePct: null } });
    expect((await setSetting('commission.override_rate', '10')).status).toBe(200);
  });

  // ─── Approve → PAYABLE (D-13) ───────────────────────────────────────────────

  it('A1: only a user with commission.approve can approve; approving twice is a 409', async () => {
    const [agentRow] = (await getCommissions(policyA)).filter((r) => r.commissionType === 'AGENT');
    expect((await http().post(`/api/commissions/${agentRow.id}/approve`).set(auth(agentToken))).status).toBe(403);

    const ok = await http().post(`/api/commissions/${agentRow.id}/approve`).set(auth(financeToken));
    expect(ok.status).toBe(201);
    expect(ok.body.data.status).toBe('APPROVED');
    expect(ok.body.data.approvedAt).not.toBeNull();

    const again = await http().post(`/api/commissions/${agentRow.id}/approve`).set(auth(financeToken));
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('COMMISSION_INVALID_STATUS');
  });

  it('A2: an approved commission cannot be recalculated', async () => {
    const res = await http().post(`/api/policies/${policyA}/commissions/calculate`).set(auth(financeToken));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('COMMISSION_LOCKED');
  });

  let paymentsA: string[];
  it('P1: it becomes PAYABLE when every invoice of the policy is paid — and only the approved row moves', async () => {
    invoiceA = ((await http().get(`/api/policies/${policyA}/invoices`).set(auth(agentToken))).body.data[0] as { id: string }).id;
    expect(byType(await getCommissions(policyA), 'AGENT')!.status).toBe('APPROVED'); // unpaid yet

    paymentsA = await payInFull(policyA);
    const rows = await getCommissions(policyA);
    expect(byType(rows, 'AGENT')).toMatchObject({ status: 'PAYABLE' });
    expect(byType(rows, 'AGENT')!.payableAt).not.toBeNull();
    expect(byType(rows, 'TEAM')!.status).toBe('CALCULATED'); // never approved
  });

  it('P2: cancelling a payment sends it back to APPROVED, paying again makes it PAYABLE again', async () => {
    const cancel = await http().post(`/api/payments/${paymentsA[0]}/cancel`).set(auth(agentToken)).send({ cancelReason: 'bounced' });
    expect(cancel.status).toBe(201);
    const back = byType(await getCommissions(policyA), 'AGENT')!;
    expect(back.status).toBe('APPROVED');
    expect(back.payableAt).toBeNull();

    await payInFull(policyA);
    expect(byType(await getCommissions(policyA), 'AGENT')!.status).toBe('PAYABLE');
    expect(invoiceA).toBeTruthy();
  });

  it('P3: approving after everything is already paid goes straight to PAYABLE', async () => {
    const team = byType(await getCommissions(policyA), 'TEAM', 'CALCULATED')!;
    const res = await http().post(`/api/commissions/${team.id}/approve`).set(auth(financeToken));
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PAYABLE');
  });

  it('P4: with three instalments it stays APPROVED until the last one is paid', async () => {
    const { policyId } = await issuePolicy({ productId: productWithRateId, jobLabel: 'D', paymentTermId: threeInstalmentTermId });
    const invoices = (await http().get(`/api/policies/${policyId}/invoices`).set(auth(agentToken))).body.data as {
      id: string; outstandingAmount: string;
    }[];
    expect(invoices).toHaveLength(3);

    const agentRow = byType(await getCommissions(policyId), 'AGENT')!;
    expect((await http().post(`/api/commissions/${agentRow.id}/approve`).set(auth(financeToken))).body.data.status).toBe('APPROVED');

    const payAt = (i: number) =>
      http().post(`/api/invoices/${invoices[i].id}/payments`).set(auth(agentToken))
        .send({ amount: invoices[i].outstandingAmount, paymentMethod: 'TRANSFER' });
    await payAt(0);
    await payAt(1);
    expect(byType(await getCommissions(policyId), 'AGENT')!.status).toBe('APPROVED');
    await payAt(2);
    expect(byType(await getCommissions(policyId), 'AGENT')!.status).toBe('PAYABLE');
  });

  // ─── No rate on file ────────────────────────────────────────────────────────

  it('N1: with no rate anywhere the policy still issues, no commission is created, and it can be calculated once a rate exists', async () => {
    const { policyId, jobId } = await issuePolicy({ productId: productNoRateId, jobLabel: 'C' });
    expect(await getCommissions(policyId)).toEqual([]);
    expect(await prisma.activityLog.count({ where: { jobId, action: 'COMMISSION_SKIPPED' } })).toBe(1);

    const fail = await http().post(`/api/policies/${policyId}/commissions/calculate`).set(auth(financeToken));
    expect(fail.status).toBe(422);
    expect(fail.body.code).toBe('COMMISSION_RATE_NOT_FOUND');

    await prisma.commissionRate.create({
      data: { insuranceCompanyId: companyId, productId: productNoRateId, rate: '10', effectiveFrom: new Date('2026-01-01') },
    });
    const ok = await http().post(`/api/policies/${policyId}/commissions/calculate`).set(auth(financeToken));
    expect(ok.status).toBe(201);
    const agent = byType(await getCommissions(policyId), 'AGENT')!;
    expect(agent).toMatchObject({ rateSource: 'MASTER', grossAmount: '2000.00', commissionAmount: '1000.00', netAmount: '970.00' });
  });

  // ─── Access ─────────────────────────────────────────────────────────────────

  it('S1: a user who does not own the job cannot see its commissions; listing respects the same scope', async () => {
    expect((await http().get(`/api/policies/${policyA}/commissions`).set(auth(viewerToken))).status).toBe(404);
    const list = await http().get('/api/commissions').query({ policyId: policyA }).set(auth(viewerToken));
    expect(list.status).toBe(200);
    expect(list.body.data.items).toEqual([]);
    expect(list.body.data.total).toBe(0);

    const own = await http().get('/api/commissions').query({ policyId: policyA }).set(auth(financeToken));
    expect(own.body.data.total).toBe(2);
  });

  it('S2: calculating without commission.create → 403; unauthenticated → 401', async () => {
    expect((await http().post(`/api/policies/${policyA}/commissions/calculate`).set(auth(viewerToken))).status).toBe(403);
    expect((await http().get('/api/commissions')).status).toBe(401);
  });

  // ─── System settings & agent share ──────────────────────────────────────────

  it('T1: system settings list defaults and validate on update', async () => {
    const list = await http().get('/api/system-settings').set(auth(adminToken));
    expect(list.status).toBe(200);
    const byKey = Object.fromEntries((list.body.data as { key: string; value: string }[]).map((s) => [s.key, s.value]));
    expect(byKey).toMatchObject({
      'commission.wht_rate': '3',
      'commission.default_agent_share_pct': '50',
      'commission.override_rate': '10',
    });

    expect((await setSetting('commission.wht_rate', '101')).status).toBe(422);
    expect((await setSetting('commission.wht_rate', 'abc')).status).toBe(422);
    expect((await http().put('/api/system-settings/nope').set(auth(adminToken)).send({ value: '1' })).status).toBe(404);
    // share + override may not exceed 100%
    const tooMuch = await setSetting('commission.default_agent_share_pct', '95');
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.body.code).toBe('SETTING_SHARES_EXCEED_100');
    expect((await http().get('/api/system-settings').set(auth(agentToken))).status).toBe(403);
  });

  it('T2: a per-agent share is stored on the user and validated against the override', async () => {
    const set = await http().put(`/api/users/${agentId}`).set(auth(adminToken)).send({ agentSharePct: '70.5' });
    expect(set.status).toBe(200);
    expect(set.body.data.agentSharePct).toBe('70.50');

    const tooMuch = await http().put(`/api/users/${agentId}`).set(auth(adminToken)).send({ agentSharePct: '95' });
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.body.code).toBe('AGENT_SHARE_EXCEEDS_100');

    const bad = await http().put(`/api/users/${agentId}`).set(auth(adminToken)).send({ agentSharePct: '101' });
    expect(bad.status).toBe(422);

    const clear = await http().put(`/api/users/${agentId}`).set(auth(adminToken)).send({ agentSharePct: null });
    expect(clear.status).toBe(200);
    expect(clear.body.data.agentSharePct).toBeNull();
  });

  // ─── Day 27 — adjustments, statements, summary ──────────────────────────────

  const periodNow = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date()).slice(0, 7);
  const row = async (policyId: string, type: 'AGENT' | 'TEAM'): Promise<CommissionRow & { statementId: string | null }> =>
    (await getCommissions(policyId)).find((r) => r.commissionType === type && r.status !== 'CANCELLED') as never;
  const adjust = (commissionId: string, body: Record<string, unknown>, token = financeToken) =>
    http().post(`/api/commissions/${commissionId}/adjustments`).set(auth(token)).send(body);
  const createStatement = (agent: string, period = periodNow(), token = financeToken) =>
    http().post('/api/commission-statements').set(auth(token)).send({ agentId: agent, period });

  let policyB2: string; // a policy whose commission is still only CALCULATED
  let adjAgentId: string;
  let adjAgentPositiveId: string;

  it('D1: only an approved/payable/paid commission can be adjusted', async () => {
    ({ policyId: policyB2 } = await issuePolicy({ productId: productWithRateId, jobLabel: 'E' }));
    const calc = await row(policyB2, 'AGENT');
    expect(calc.status).toBe('CALCULATED');
    const res = await adjust(calc.id, { amount: '-10.00', reason: 'too early' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('COMMISSION_NOT_ADJUSTABLE');
  });

  it('D2: an adjustment is a new signed row — the original is untouched; WHT follows the original rate', async () => {
    const original = await row(policyA, 'AGENT');
    const res = await adjust(original.id, { amount: '-200.00', reason: 'Premium refunded on endorsement' });
    expect(res.status).toBe(201);
    adjAgentId = res.body.data.id;
    expect(res.body.data).toMatchObject({
      commissionId: original.id, agentId, amount: '-200.00', whtRate: '3.00', whtAmount: '-6.00', netAmount: '-194.00',
      status: 'PENDING', statementId: null,
    });

    const after = await row(policyA, 'AGENT');
    expect(after).toMatchObject({ commissionAmount: '1250.00', netAmount: '1212.50', status: 'PAYABLE' });

    const list = await http().get(`/api/commissions/${original.id}/adjustments`).set(auth(financeToken));
    expect(list.body.data).toHaveLength(1);
  });

  it('D3: adjustments are validated — zero, format, partial reference, and no clawing back more than was paid', async () => {
    const original = await row(policyA, 'AGENT');
    const zero = await adjust(original.id, { amount: '0.00', reason: 'x' });
    expect([zero.status, zero.body.code]).toEqual([422, 'ADJUSTMENT_AMOUNT_ZERO']);
    const bad = await adjust(original.id, { amount: 'abc', reason: 'x' });
    expect([bad.status, bad.body.code]).toEqual([422, 'ADJUSTMENT_AMOUNT_INVALID']);
    expect((await adjust(original.id, { amount: '-1.00', reason: '' })).status).toBe(422);
    const half = await adjust(original.id, { amount: '-1.00', reason: 'x', refType: 'ENDORSEMENT' });
    expect([half.status, half.body.code]).toEqual([422, 'ADJUSTMENT_REF_INCOMPLETE']);
    expect((await adjust(original.id, { amount: '-1.00', reason: 'x', refType: 'NOPE', refId: '00000000-0000-7000-8000-000000000000' })).status).toBe(422);

    // 200 already taken back of 1250: 1050.01 more would go past the original
    const over = await adjust(original.id, { amount: '-1050.01', reason: 'too much' });
    expect([over.status, over.body.code]).toEqual([422, 'ADJUSTMENT_EXCEEDS_COMMISSION']);
  });

  it('D4: a positive adjustment can reference an endorsement; needs commission.adjust and policy access', async () => {
    const d = await prisma.policy.findFirstOrThrow({ where: { job: { jobNo: { not: '' } }, commissions: { some: { agentId, status: 'PAYABLE', statementId: null, grossAmount: { not: null } } }, id: { not: policyA } }, select: { id: true } });
    const rowD = await row(d.id, 'AGENT');
    const ok = await adjust(rowD.id, { amount: '50.00', reason: 'Endorsement added cover', refType: 'ENDORSEMENT', refId: '00000000-0000-7000-8000-000000000001' });
    expect(ok.status).toBe(201);
    adjAgentPositiveId = ok.body.data.id;
    expect(ok.body.data).toMatchObject({ amount: '50.00', whtAmount: '1.50', netAmount: '48.50', refType: 'ENDORSEMENT' });

    expect((await adjust(rowD.id, { amount: '10.00', reason: 'x' }, agentToken)).status).toBe(403);
    expect((await adjust(rowD.id, { amount: '10.00', reason: 'x' }, viewerToken)).status).toBe(403);
    expect((await http().get('/api/commission-adjustments').set(auth(viewerToken))).body.data.items).toEqual([]); // scope
    expect((await http().get('/api/commission-adjustments').query({ agentId }).set(auth(financeToken))).body.data.total).toBe(2);
  });

  it('ST1: a statement collects everything payable to the payee by month end, plus the pending adjustments, and its totals add up', async () => {
    const res = await createStatement(agentId);
    expect(res.status).toBe(201);
    const st = res.body.data;
    expect(st.statementNo).toMatch(/^CS-\d{4}-\d{6}$/);
    expect(st).toMatchObject({ status: 'DRAFT', agentId, period: periodNow(), commissionCount: 2, adjustmentCount: 2 });
    // commissions A and D: 2 × (1250.00 share, 37.50 WHT, 1212.50 net); adjustments −200/−6/−194 and +50/+1.50/+48.50
    expect(st).toMatchObject({ shareTotal: '2350.00', whtTotal: '70.50', netTotal: '2279.50' });
    expect(st.commissions).toHaveLength(2);
    expect(st.adjustments.map((a: { id: string }) => a.id).sort()).toEqual([adjAgentId, adjAgentPositiveId].sort());
    expect(st.adjustments.every((a: { status: string }) => a.status === 'IN_STATEMENT')).toBe(true);
    expect(Number(st.shareTotal) - Number(st.whtTotal)).toBeCloseTo(Number(st.netTotal), 2);
  });

  it('ST2: only one live statement per payee per month; invalid / future periods and empty payees are rejected', async () => {
    const dup = await createStatement(agentId);
    expect([dup.status, dup.body.code]).toEqual([409, 'STATEMENT_ALREADY_EXISTS']);
    expect((await createStatement(agentId, '2026-13')).body.code).toBe('STATEMENT_PERIOD_INVALID');
    expect((await createStatement(agentId, '2099-01')).body.code).toBe('STATEMENT_PERIOD_IN_FUTURE');
    const viewer = await prisma.user.findFirstOrThrow({ where: { username: `${PREFIX}viewer` } });
    expect((await createStatement(viewer.id)).body.code).toBe('STATEMENT_NOTHING_TO_PAY');
    expect((await createStatement(agentId, periodNow(), agentToken)).status).toBe(403);
  });

  it('ST3: a commission already on a statement is not pulled back out when a payment on its policy is cancelled', async () => {
    const before = await row(policyA, 'AGENT');
    expect(before.statementId).not.toBeNull();
    const invoice = ((await http().get(`/api/policies/${policyA}/invoices`).set(auth(agentToken))).body.data[0]) as { id: string };
    const payment = (await http().get(`/api/invoices/${invoice.id}/payments`).set(auth(agentToken))).body.data.items.find(
      (p: { status: string }) => p.status === 'ACTIVE',
    );
    expect((await http().post(`/api/payments/${payment.id}/cancel`).set(auth(agentToken)).send({ cancelReason: 'chargeback' })).status).toBe(201);
    expect((await row(policyA, 'AGENT')).status).toBe('PAYABLE'); // stays: it is committed to a payout
    await payInFull(policyA);
  });

  it('ST4: confirm → mark paid moves every commission to PAID and settles the adjustments; dates and states are guarded', async () => {
    const list = await http().get('/api/commission-statements').query({ agentId, period: periodNow() }).set(auth(financeToken));
    const statementId = list.body.data.items[0].id as string;

    expect((await http().post(`/api/commission-statements/${statementId}/mark-paid`).set(auth(financeToken)).send({})).body.code).toBe('STATEMENT_INVALID_STATUS');
    const confirmed = await http().post(`/api/commission-statements/${statementId}/confirm`).set(auth(financeToken));
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.data.status).toBe('CONFIRMED');
    expect((await http().post(`/api/commission-statements/${statementId}/confirm`).set(auth(financeToken))).status).toBe(409);

    const future = await http().post(`/api/commission-statements/${statementId}/mark-paid`).set(auth(financeToken)).send({ paidDate: '2099-01-01' });
    expect([future.status, future.body.code]).toEqual([422, 'STATEMENT_PAID_DATE_IN_FUTURE']);

    const paid = await http().post(`/api/commission-statements/${statementId}/mark-paid`).set(auth(financeToken)).send({ paymentRef: 'BANK-0001' });
    expect(paid.status).toBe(201);
    expect(paid.body.data).toMatchObject({ status: 'PAID', paymentRef: 'BANK-0001', netTotal: '2279.50' });
    expect(paid.body.data.paidAt).not.toBeNull();
    expect(paid.body.data.commissions.every((c: { status: string; paidDate: string | null }) => c.status === 'PAID' && c.paidDate !== null)).toBe(true);
    expect(paid.body.data.adjustments.every((a: { status: string }) => a.status === 'SETTLED')).toBe(true);

    expect((await http().post(`/api/commission-statements/${statementId}/mark-paid`).set(auth(financeToken)).send({})).status).toBe(409);
    const cancel = await http().post(`/api/commission-statements/${statementId}/cancel`).set(auth(financeToken)).send({ reason: 'oops' });
    expect([cancel.status, cancel.body.code]).toEqual([409, 'STATEMENT_ALREADY_PAID']);
  });

  it('ST5: a paid commission can still be adjusted — the correction waits for the next statement', async () => {
    const paidRow = await row(policyA, 'AGENT');
    expect(paidRow.status).toBe('PAID');
    const res = await adjust(paidRow.id, { amount: '-100.00', reason: 'Late clawback' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    // …but this month is already settled for the payee, so it cannot be collected until next month
    expect((await createStatement(agentId)).body.code).toBe('STATEMENT_ALREADY_EXISTS');
  });

  // Manager (override payee): period cut-off, cancel/release and the "never below zero" carry-over
  it('ST6: the period cut-off decides what a statement holds, and a cancelled draft releases its items', async () => {
    const teamA = await row(policyA, 'TEAM');
    expect(teamA.status).toBe('PAYABLE');
    // Pretend A's override became payable in August; D's override is approved now (payable this month)
    await prisma.commission.update({ where: { id: teamA.id }, data: { payableAt: new Date('2026-08-20T00:00:00Z') } });
    const policyD = (await prisma.policy.findFirstOrThrow({
      where: { commissions: { some: { agentId: managerId, status: 'CALCULATED' } } }, select: { id: true },
    })).id;
    const teamD = await row(policyD, 'TEAM');
    expect((await http().post(`/api/commissions/${teamD.id}/approve`).set(auth(financeToken))).body.data.status).toBe('PAYABLE');

    const august = await createStatement(managerId, '2026-08');
    expect(august.status).toBe(201);
    expect(august.body.data.commissions.map((c: { id: string }) => c.id)).toEqual([teamA.id]); // D's row is after August
    expect(august.body.data.netTotal).toBe('242.50');

    const cancelled = await http().post(`/api/commission-statements/${august.body.data.id}/cancel`).set(auth(financeToken)).send({ reason: 'regenerate' });
    expect(cancelled.status).toBe(201);
    expect(cancelled.body.data).toMatchObject({ status: 'CANCELLED', commissionCount: 0 });
    expect((await row(policyA, 'TEAM')).statementId).toBeNull();

    // the cancelled one no longer blocks a new statement for the same month
    const again = await createStatement(managerId, '2026-08');
    expect(again.status).toBe(201);
    await http().post(`/api/commission-statements/${again.body.data.id}/confirm`).set(auth(financeToken));
    expect((await http().post(`/api/commission-statements/${again.body.data.id}/mark-paid`).set(auth(financeToken)).send({ paidDate: '2026-08-31' })).body.data.status).toBe('PAID');
  });

  it('ST7: a statement never nets below zero — an adjustment that does not fit stays pending for the next one', async () => {
    const policyD = (await prisma.policy.findFirstOrThrow({
      where: { commissions: { some: { agentId: managerId, status: 'PAYABLE', statementId: null } } }, select: { id: true },
    })).id;
    const teamA = await row(policyA, 'TEAM'); // PAID in August
    const teamD = await row(policyD, 'TEAM'); // PAYABLE: 250.00 share, 242.50 net

    const older = await adjust(teamA.id, { amount: '-200.00', reason: 'older clawback' }); // net −194.00
    const newer = await adjust(teamD.id, { amount: '-250.00', reason: 'newer clawback' }); // net −242.50
    expect([older.status, newer.status]).toEqual([201, 201]);

    const st = await createStatement(managerId);
    expect(st.status).toBe(201);
    // 242.50 − 194.00 = 48.50 fits; another −242.50 would go below zero
    expect(st.body.data).toMatchObject({ netTotal: '48.50', commissionCount: 1, adjustmentCount: 1 });
    expect(st.body.data.adjustments[0].id).toBe(older.body.data.id);
    const left = await prisma.commissionAdjustment.findUniqueOrThrow({ where: { id: newer.body.data.id } });
    expect(left).toMatchObject({ status: 'PENDING', statementId: null });
  });

  it('ST8: payees see only their own statements; finance sees all', async () => {
    const ownList = await http().get('/api/commission-statements').set(auth(agentToken));
    expect(ownList.status).toBe(200);
    expect(ownList.body.data.items.length).toBeGreaterThan(0);
    expect(ownList.body.data.items.every((s: { agentId: string }) => s.agentId === agentId)).toBe(true);

    const all = await http().get('/api/commission-statements').query({ period: periodNow() }).set(auth(financeToken));
    const payees = new Set(all.body.data.items.map((s: { agentId: string }) => s.agentId));
    expect(payees.has(agentId) && payees.has(managerId)).toBe(true);

    const managerStatement = all.body.data.items.find((s: { agentId: string }) => s.agentId === managerId);
    expect((await http().get(`/api/commission-statements/${managerStatement.id}`).set(auth(agentToken))).status).toBe(404);
    expect((await http().get(`/api/commission-statements/${managerStatement.id}`).set(auth(financeToken))).status).toBe(200);
    expect((await http().get('/api/commission-statements')).status).toBe(401);
  });

  it('SM1: summary rolls commissions up by policy — gross counted once, adjustments shown separately', async () => {
    const res = await http().get('/api/commissions/summary').query({ groupBy: 'policy', insurerId: companyId }).set(auth(financeToken));
    expect(res.status).toBe(200);
    expect(res.body.data.groupBy).toBe('policy');
    const g = (res.body.data.items as { key: string; [k: string]: unknown }[]).find((i) => i.key === policyA)!;
    // AGENT 1250.00 + TEAM 250.00; gross 2500.00 once; broker 1000.00
    expect(g).toMatchObject({
      commissionCount: 2, grossAmount: '2500.00', brokerShareAmount: '1000.00', shareAmount: '1500.00', whtAmount: '45.00', netAmount: '1455.00',
    });
    // adjustments on A: agent −194.00 (settled) + −97.00 (−100 late clawback) + manager −194.00
    expect(g.adjustmentNet).toBe('-485.00');
    expect(g.totalNet).toBe('970.00');
    expect((g.netByStatus as Record<string, string>).PAID).toBe('1455.00');
  });

  it('SM2: summary by agent, insurer, product and period; filters and scope apply', async () => {
    const byAgent = await http().get('/api/commissions/summary').query({ groupBy: 'agent', insurerId: companyId }).set(auth(financeToken));
    const keys = (byAgent.body.data.items as { key: string }[]).map((i) => i.key);
    expect(keys).toEqual(expect.arrayContaining([agentId, managerId]));

    const byPeriod = await http().get('/api/commissions/summary').query({ groupBy: 'period', insurerId: companyId }).set(auth(financeToken));
    expect(byPeriod.body.data.items[0].key).toBe(periodNow());
    for (const groupBy of ['insurer', 'product']) {
      const res = await http().get('/api/commissions/summary').query({ groupBy, insurerId: companyId }).set(auth(financeToken));
      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
    }

    const none = await http().get('/api/commissions/summary').query({ groupBy: 'agent', insurerId: companyId, to: '2000-01' }).set(auth(financeToken));
    expect(none.body.data.items).toEqual([]);
    expect(none.body.data.summary.totalNet).toBe('0.00');

    expect((await http().get('/api/commissions/summary').query({ groupBy: 'agent', insurerId: companyId }).set(auth(viewerToken))).body.data.items).toEqual([]);
    expect((await http().get('/api/commissions/summary').query({ groupBy: 'nope' }).set(auth(financeToken))).status).toBe(422);
  });
});
