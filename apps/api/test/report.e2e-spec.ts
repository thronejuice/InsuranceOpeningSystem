import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_rpt_';
const UP = PREFIX.toUpperCase();
const PASSWORD = 'E2e@Report1';

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);

/**
 * Phase 7 / Day 44 — Excel exports and the manager dashboard.
 * Two agents each own one policy with invoices; every export and dashboard figure must respect data scope.
 */
describe('Reports & dashboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let allToken: string; // job.view_all
  let ownerAToken: string; // OWN scope, owns policy A
  let noReportToken: string;
  let userA: string;
  let userB: string;
  let policyA: string;
  let policyB: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  /** Downloads an export and returns its sheets as arrays of row objects keyed by header. */
  async function exportSheets(path: string, token: string): Promise<Record<string, Record<string, unknown>[]>> {
    const res = await http().get(`/api/reports/${path}/export`).set(auth(token)).buffer(true)
      .parse((r, cb) => { const chunks: Buffer[] = []; r.on('data', (c: Buffer) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });
    expect(res.status, `${path} → ${res.status}`).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as Buffer);
    const out: Record<string, Record<string, unknown>[]> = {};
    for (const ws of wb.worksheets) {
      const headers = (ws.getRow(1).values as unknown[]).slice(1).map(String);
      const rows: Record<string, unknown>[] = [];
      ws.eachRow((row, n) => {
        if (n === 1) return;
        const vals = (row.values as unknown[]).slice(1);
        rows.push(Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ''])));
      });
      out[ws.name] = rows;
    }
    return out;
  }

  async function cleanup() {
    const jobs = await prisma.job.findMany({ where: { jobNo: { startsWith: UP } }, select: { id: true } });
    const jobIds = jobs.map((j) => j.id);
    const policies = await prisma.policy.findMany({ where: { jobId: { in: jobIds } }, select: { id: true } });
    const policyIds = policies.map((p) => p.id);
    await prisma.refund.deleteMany({ where: { creditNote: { policyId: { in: policyIds } } } });
    await prisma.payment.deleteMany({ where: { policyId: { in: policyIds } } });
    await prisma.invoice.deleteMany({ where: { policyId: { in: policyIds } } });
    await prisma.endorsement.deleteMany({ where: { policyId: { in: policyIds } } });
    await prisma.renewal.deleteMany({ where: { previousPolicyId: { in: policyIds } } });
    await prisma.commissionStatement.deleteMany({ where: { statementNo: { startsWith: UP } } });
    await prisma.policy.deleteMany({ where: { id: { in: policyIds } } });
    await prisma.quotation.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
    await prisma.customer.deleteMany({ where: { customerCode: { startsWith: UP } } });
    await prisma.insuranceCompany.deleteMany({ where: { code: { startsWith: UP } } });
    await prisma.insuranceProduct.deleteMany({ where: { code: { startsWith: UP } } });
    await prisma.insuranceType.deleteMany({ where: { code: { startsWith: UP } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: UP } } });
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    await cleanup();

    const perm = (code: string) => prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } });
    const [report, viewAll, jobView, commissionView, statementPerm] = await Promise.all(
      ['report.view', 'job.view_all', 'job.view', 'commission.view', 'commission.statement'].map(perm),
    );
    const passwordHash = await hash(PASSWORD);
    const mkUser = async (suffix: string, permissionIds: string[], dataScope: 'OWN' | 'ALL') => {
      const role = await prisma.role.create({
        data: { code: `${UP}${suffix}`, name: `E2E ${suffix}`, dataScope, permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) } },
      });
      const user = await prisma.user.create({ data: { username: `${PREFIX}${suffix.toLowerCase()}`, email: `${PREFIX}${suffix.toLowerCase()}@test.com`, fullName: `Report ${suffix}`, passwordHash } });
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
      const res = await http().post('/api/auth/login').send({ username: user.username, password: PASSWORD });
      return { id: user.id, token: res.body.data.accessToken as string };
    };
    const all = await mkUser('ALL', [report.id, viewAll.id, jobView.id, commissionView.id, statementPerm.id], 'ALL');
    const a = await mkUser('A', [report.id, jobView.id, commissionView.id], 'OWN');
    const b = await mkUser('B', [report.id, jobView.id, commissionView.id], 'OWN');
    const none = await mkUser('NONE', [jobView.id], 'OWN');
    allToken = all.token;
    ownerAToken = a.token;
    noReportToken = none.token;
    userA = a.id;
    userB = b.id;

    const type = await prisma.insuranceType.create({ data: { code: `${UP}T`, name: 'E2E report type' } });
    const product = await prisma.insuranceProduct.create({ data: { code: `${UP}P`, name: 'E2E report product', insuranceTypeId: type.id } });
    const company = await prisma.insuranceCompany.create({ data: { code: `${UP}CO`, name: 'E2E report insurer' } });
    const customer = await prisma.customer.create({ data: { customerCode: `${UP}C`, customerType: 'INDIVIDUAL', firstName: 'Report', lastName: 'Customer' } });

    const mkPolicy = async (tag: string, agentId: string) => {
      const job = await prisma.job.create({
        data: { jobNo: `${UP}J${tag}`, customerId: customer.id, insuranceTypeId: type.id, productId: product.id, agentId, effectiveDate: new Date('2027-01-01') },
      });
      const quotation = await prisma.quotation.create({ data: { jobId: job.id, insuranceCompanyId: company.id, quotationNo: `${UP}Q${tag}`, status: 'SELECTED' } });
      return prisma.policy.create({
        data: {
          policyNo: `${UP}PL${tag}`, jobId: job.id, quotationId: quotation.id, insuranceCompanyId: company.id,
          effectiveDate: new Date('2027-01-01'), expiryDate: day(60), status: 'ACTIVE', totalPremium: '12500.00',
        },
      });
    };
    policyA = (await mkPolicy('A', a.id)).id;
    policyB = (await mkPolicy('B', b.id)).id;

    const mkInvoice = (policyId: string, no: string, amount: string, due: Date, extra: Record<string, unknown> = {}) =>
      prisma.invoice.create({ data: { invoiceNo: `${UP}${no}`, policyId, customerId: customer.id, amount, netAmount: amount, dueDate: due, ...extra } });
    // A: 10,000 overdue 45 days with 4,000 paid (→ 6,000 in D31_60); 2,500 not yet due
    const invA1 = await mkInvoice(policyA, 'INV-A1', '10000.00', day(-45), { installmentNo: 1, status: 'PARTIALLY_PAID' });
    await mkInvoice(policyA, 'INV-A2', '2500.00', day(30), { installmentNo: 2 });
    await prisma.payment.create({ data: { paymentNo: `${UP}PAY-A1`, policyId: policyA, invoiceId: invA1.id, paymentDate: day(-10), amount: '4000.00', paymentMethod: 'TRANSFER' } });
    // B: 999.99 overdue 5 days
    await mkInvoice(policyB, 'INV-B1', '999.99', day(-5), { installmentNo: 1, status: 'OVERDUE' });

    const cnA = await mkInvoice(policyA, 'CN-A1', '1500.00', day(0), { type: 'CREDIT_NOTE' });
    await prisma.refund.create({ data: { refundNo: `${UP}RF-A1`, creditNoteId: cnA.id, amount: '1500.00' } });
    const cnB = await mkInvoice(policyB, 'CN-B1', '300.00', day(0), { type: 'CREDIT_NOTE' });
    await prisma.refund.create({ data: { refundNo: `${UP}RF-B1`, creditNoteId: cnB.id, amount: '300.00' } });

    for (const [tag, policyId] of [['A', policyA], ['B', policyB]] as const) {
      await prisma.endorsement.create({
        data: { endorsementNo: `${UP}EN-${tag}`, policyId, type: 'CHANGE_ADDRESS', effectiveDate: day(1), changes: {} },
      });
      await prisma.renewal.create({
        data: { previousPolicyId: policyId, renewalDate: day(0), targetExpiryDate: day(60), status: tag === 'A' ? 'PENDING' : 'QUOTATION' },
      });
    }
    for (const [tag, agentId] of [['A', a.id], ['B', b.id]] as const) {
      await prisma.commissionStatement.create({
        data: { statementNo: `${UP}CS-${tag}`, agentId, period: '2026-09', periodEnd: new Date('2026-09-30'), shareTotal: '1000.00', whtTotal: '30.00', netTotal: '970.00' },
      });
    }
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('R1: invoices export — an own-scope user sees only their invoices, with paid / outstanding computed', async () => {
    const own = (await exportSheets('invoices', ownerAToken))['Invoices'].filter((r) => String(r['Invoice No.']).startsWith(UP));
    expect(own.map((r) => r['Invoice No.']).sort()).toEqual([`${UP}CN-A1`, `${UP}INV-A1`, `${UP}INV-A2`]);
    const a1 = own.find((r) => r['Invoice No.'] === `${UP}INV-A1`)!;
    expect(a1).toMatchObject({ Amount: 10000, Paid: 4000, Outstanding: 6000, Status: 'PARTIALLY_PAID', Installment: 1 });

    const everyone = (await exportSheets('invoices', allToken))['Invoices'].filter((r) => String(r['Invoice No.']).startsWith(UP));
    expect(everyone).toHaveLength(5); // A: 3, B: 2 (invoice + credit note)
  });

  it('R2: receivables export — aging buckets and a summary that adds up', async () => {
    const sheets = await exportSheets('receivables', ownerAToken);
    const rows = sheets['Aging'].filter((r) => String(r['Invoice No.']).startsWith(UP));
    expect(rows.map((r) => [r['Invoice No.'], r['Aging Bucket'], r['Outstanding']]).sort()).toEqual([
      [`${UP}INV-A1`, 'D31_60', 6000],
      [`${UP}INV-A2`, 'NOT_DUE', 2500],
    ]);
    expect(rows.find((r) => r['Invoice No.'] === `${UP}INV-A1`)!['Days Overdue']).toBe(45);

    const summary = sheets['Summary'];
    const total = summary.find((r) => r['Aging Bucket'] === 'TOTAL')!['Outstanding'] as number;
    const buckets = summary.filter((r) => r['Aging Bucket'] !== 'TOTAL').reduce((n, r) => n + (r['Outstanding'] as number), 0);
    expect(Math.round(total * 100)).toBe(Math.round(buckets * 100));
    expect(total).toBe(8500); // A is the only own-scope data in the suite's window… plus nothing else open for this user
  });

  it('R3: commission statements export follows the statements list scope (payees see their own)', async () => {
    const own = (await exportSheets('commission-statements', ownerAToken))['Statements'].filter((r) => String(r['Statement No.']).startsWith(UP));
    expect(own.map((r) => r['Statement No.'])).toEqual([`${UP}CS-A`]);
    expect(own[0]).toMatchObject({ Period: '2026-09', 'Share Total': 1000, 'WHT Total': 30, 'Net Total': 970, Status: 'DRAFT' });

    const everyone = (await exportSheets('commission-statements', allToken))['Statements'].filter((r) => String(r['Statement No.']).startsWith(UP));
    expect(everyone.map((r) => r['Statement No.']).sort()).toEqual([`${UP}CS-A`, `${UP}CS-B`]);
  });

  it('R4: endorsements, refunds and renewals exports are scoped and carry the right columns', async () => {
    const endorsements = (await exportSheets('endorsements', ownerAToken))['Endorsements'].filter((r) => String(r['Endorsement No.']).startsWith(UP));
    expect(endorsements).toHaveLength(1);
    expect(endorsements[0]).toMatchObject({ 'Endorsement No.': `${UP}EN-A`, 'Policy No.': `${UP}PLA`, Type: 'CHANGE_ADDRESS', Status: 'DRAFT' });

    const refunds = (await exportSheets('refunds', ownerAToken))['Refunds'].filter((r) => String(r['Refund No.']).startsWith(UP));
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ 'Refund No.': `${UP}RF-A1`, 'Credit Note': `${UP}CN-A1`, Amount: 1500, Status: 'REQUESTED' });

    const renewals = (await exportSheets('renewals', allToken))['Renewals'].filter((r) => String(r['Previous Policy No.']).startsWith(UP));
    expect(renewals.map((r) => [r['Previous Policy No.'], r['Status']]).sort()).toEqual([[`${UP}PLA`, 'PENDING'], [`${UP}PLB`, 'QUOTATION']]);
    expect((await exportSheets('renewals', ownerAToken))['Renewals'].filter((r) => String(r['Previous Policy No.']).startsWith(UP))).toHaveLength(1);
  });

  it('R5: the older exports no longer leak other agents’ data', async () => {
    const policies = (await exportSheets('policies', ownerAToken))['Policies'].filter((r) => String(r['Policy No.']).startsWith(UP));
    expect(policies.map((r) => r['Policy No.'])).toEqual([`${UP}PLA`]);
    const payments = (await exportSheets('payments', ownerAToken))['Payments'].filter((r) => String(r['Payment No.']).startsWith(UP));
    expect(payments.map((r) => r['Payment No.'])).toEqual([`${UP}PAY-A1`]);
    const jobs = (await exportSheets('jobs', ownerAToken))['Jobs'].filter((r) => String(r['Job No.']).startsWith(UP));
    expect(jobs.map((r) => r['Job No.'])).toEqual([`${UP}JA`]);
    const quotations = (await exportSheets('quotations', ownerAToken))['Quotations'].filter((r) => String(r['Quotation No.']).startsWith(UP));
    expect(quotations.map((r) => r['Quotation No.'])).toEqual([`${UP}QA`]);
  });

  it('R6: every export needs report.view', async () => {
    for (const path of ['invoices', 'receivables', 'commission-statements', 'endorsements', 'refunds', 'renewals', 'jobs', 'policies']) {
      expect((await http().get(`/api/reports/${path}/export`).set(auth(noReportToken))).status, path).toBe(403);
      expect((await http().get(`/api/reports/${path}/export`)).status, path).toBe(401);
    }
  });

  it('D1: manager dashboard — AR, renewal pipeline and approvals are scoped and match the data', async () => {
    const own = (await http().get('/api/dashboard/manager').set(auth(ownerAToken))).body.data;
    // A: 6,000.00 + 2,500.00 outstanding; the credit note is not receivable
    expect(own.arOutstanding).toBe('8500.00');
    expect(own.renewalPipelineCount).toBe(1);
    expect(own.pendingApprovals).toBe(0);

    // B's data must not move A's numbers, and the all-scope total includes both
    const everything = (await http().get('/api/dashboard/manager').set(auth(allToken))).body.data;
    const expected = await prisma.invoice.findMany({
      where: { status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] }, type: { in: ['INVOICE', 'DEBIT_NOTE'] }, policy: { job: { deletedAt: null } } },
      select: { id: true, amount: true },
    });
    const paid = await prisma.payment.groupBy({ by: ['invoiceId'], where: { status: 'ACTIVE', invoiceId: { in: expected.map((i) => i.id) } }, _sum: { amount: true } });
    const owed = expected.reduce((n, i) => n + Math.round(Number(i.amount) * 100), 0) - paid.reduce((n, p) => n + Math.round(Number(p._sum.amount ?? 0) * 100), 0);
    expect(everything.arOutstanding).toBe((owed / 100).toFixed(2));
    expect(everything.renewalPipelineCount).toBeGreaterThanOrEqual(2);
    expect(userB).not.toBe(userA);
  });

  it('D2: funnel counts only what the caller may see; dashboards need permission', async () => {
    const own = (await http().get('/api/dashboard/funnel').set(auth(ownerAToken))).body.data;
    expect(own.stages.job).toBe(1);
    expect(own.stages.policy).toBe(1);
    expect(own.metrics.totalPremium).toBe('12500.00');
    expect((await http().get('/api/dashboard/manager').set(auth(noReportToken))).status).toBe(403);
    expect((await http().get('/api/dashboard/funnel')).status).toBe(401);
  });
});
