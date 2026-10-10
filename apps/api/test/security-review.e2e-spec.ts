import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_sec_';
const UP = PREFIX.toUpperCase();
const PASSWORD = 'E2e@Secure1';

/**
 * Phase 7 / Day 46 — findings of the security & permission review, each pinned by a negative test:
 * approver role + maker-checker on endorsements, system-wide jobs need maintenance.run, commission rates are
 * confidential, job-less tasks are not open to everybody, and another agent's records are unreachable by id.
 */
describe('Security & permission review (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const auth = (name: string) => ({ Authorization: `Bearer ${tokens[name]}` });

  async function cleanup() {
    const jobs = await prisma.job.findMany({ where: { jobNo: { startsWith: UP } }, select: { id: true } });
    const jobIds = jobs.map((j) => j.id);
    const policies = await prisma.policy.findMany({ where: { jobId: { in: jobIds } }, select: { id: true } });
    const policyIds = policies.map((p) => p.id);
    await prisma.task.deleteMany({ where: { OR: [{ subject: { startsWith: UP } }, { policyId: { in: policyIds } }] } });
    await prisma.refund.deleteMany({ where: { creditNote: { policyId: { in: policyIds } } } });
    await prisma.payment.deleteMany({ where: { policyId: { in: policyIds } } });
    await prisma.invoice.deleteMany({ where: { policyId: { in: policyIds } } });
    await prisma.endorsement.deleteMany({ where: { policyId: { in: policyIds } } });
    await prisma.renewal.deleteMany({ where: { previousPolicyId: { in: policyIds } } });
    await prisma.policy.deleteMany({ where: { id: { in: policyIds } } });
    await prisma.quotation.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
    await prisma.customer.deleteMany({ where: { customerCode: { startsWith: UP } } });
    await prisma.commissionRate.deleteMany({ where: { insuranceCompany: { code: { startsWith: UP } } } });
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

    const all = ['policy.view', 'policy.update', 'invoice.view', 'invoice.update', 'payment.view', 'payment.create', 'commission.view',
      'job.view', 'job.view_all', 'task.view', 'task.create', 'task.update', 'approval.approve', 'maintenance.run', 'commission.rate_view',
      'renewal.view', 'customer.view', 'master.manage'];
    const perms = Object.fromEntries(await Promise.all(all.map(async (code) => [code, (await prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } })).id])));
    const passwordHash = await hash(PASSWORD);

    // role code decides seniority for approvals (…MANAGER / …SUPERVISOR), dataScope decides what is visible
    const mk = async (name: string, roleCode: string, codes: string[], dataScope: 'OWN' | 'ALL') => {
      const role = await prisma.role.create({ data: { code: `${UP}${roleCode}`, name, dataScope, permissions: { create: codes.map((c) => ({ permissionId: perms[c] })) } } });
      const user = await prisma.user.create({ data: { username: `${PREFIX}${name}`, email: `${PREFIX}${name}@test.com`, fullName: name, passwordHash } });
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
      const res = await http().post('/api/auth/login').send({ username: user.username, password: PASSWORD });
      tokens[name] = res.body.data.accessToken as string;
      ids[name] = user.id;
    };
    const ownerPerms = ['policy.view', 'policy.update', 'invoice.view', 'payment.view', 'payment.create', 'commission.view', 'job.view', 'task.view', 'task.create', 'task.update', 'renewal.view', 'customer.view'];
    await mk('ownera', 'AGENTA', ownerPerms, 'OWN');
    await mk('ownerb', 'AGENTB', ownerPerms, 'OWN');
    await mk('staff', 'STAFF', ['policy.view', 'policy.update', 'job.view', 'job.view_all'], 'ALL');
    await mk('supervisor', 'SUPERVISOR', ['policy.view', 'approval.approve', 'job.view', 'job.view_all'], 'ALL');
    await mk('manager', 'MANAGER', ['policy.view', 'approval.approve', 'job.view', 'job.view_all'], 'ALL');
    await mk('plain', 'PLAIN', ['job.view', 'commission.view'], 'OWN');

    const type = await prisma.insuranceType.create({ data: { code: `${UP}T`, name: 'sec type' } });
    const product = await prisma.insuranceProduct.create({ data: { code: `${UP}P`, name: 'sec product', insuranceTypeId: type.id } });
    const company = await prisma.insuranceCompany.create({ data: { code: `${UP}CO`, name: 'sec insurer' } });
    ids.company = company.id;
    ids.product = product.id;
    await prisma.commissionRate.create({ data: { insuranceCompanyId: company.id, productId: product.id, rate: '12.5', effectiveFrom: new Date('2026-01-01') } });
    const customer = await prisma.customer.create({ data: { customerCode: `${UP}C`, customerType: 'INDIVIDUAL', firstName: 'Sec', lastName: 'Customer' } });

    // One policy owned by agent A with an invoice, payment, endorsement, refund, renewal
    const job = await prisma.job.create({ data: { jobNo: `${UP}JA`, customerId: customer.id, insuranceTypeId: type.id, productId: product.id, agentId: ids.ownera, effectiveDate: new Date('2026-01-01') } });
    const quotation = await prisma.quotation.create({ data: { jobId: job.id, insuranceCompanyId: company.id, quotationNo: `${UP}QA`, status: 'SELECTED' } });
    const policy = await prisma.policy.create({
      data: { policyNo: `${UP}PLA`, jobId: job.id, quotationId: quotation.id, insuranceCompanyId: company.id, effectiveDate: new Date('2026-01-01'), expiryDate: new Date('2027-01-01'), status: 'ACTIVE', totalPremium: '10000.00' },
    });
    ids.policy = policy.id;
    const invoice = await prisma.invoice.create({ data: { invoiceNo: `${UP}INV`, policyId: policy.id, customerId: customer.id, amount: '10000.00', netAmount: '10000.00', dueDate: new Date('2027-01-01') } });
    ids.invoice = invoice.id;
    const payment = await prisma.payment.create({ data: { paymentNo: `${UP}PAY`, policyId: policy.id, invoiceId: invoice.id, paymentDate: new Date(), amount: '1000.00', paymentMethod: 'CASH' } });
    ids.payment = payment.id;
    const credit = await prisma.invoice.create({ data: { invoiceNo: `${UP}CN`, policyId: policy.id, customerId: customer.id, type: 'CREDIT_NOTE', amount: '500.00', netAmount: '500.00', dueDate: new Date() } });
    ids.refund = (await prisma.refund.create({ data: { refundNo: `${UP}RF`, creditNoteId: credit.id, amount: '500.00' } })).id;
    ids.renewal = (await prisma.renewal.create({ data: { previousPolicyId: policy.id, renewalDate: new Date(), targetExpiryDate: new Date('2027-01-01') } })).id;
    // an endorsement that matched the ≥ 10,000 rule and is waiting for a MANAGER; requested by `supervisor`
    ids.endorsement = (
      await prisma.endorsement.create({
        data: {
          endorsementNo: `${UP}EN`, policyId: policy.id, type: 'CHANGE_SUM_INSURED', status: 'REQUESTED', effectiveDate: new Date(), changes: { after: { sumInsured: 1 } },
          requiredApproverRole: 'MANAGER', requestedById: ids.supervisor, premiumAdjustmentType: 'NO_CHANGE',
        },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  // ─── Endorsement approval (D-16) ───────────────────────────────────────────

  it('E1: approving an endorsement needs approval.approve — policy.update alone is not enough', async () => {
    expect((await http().post(`/api/endorsements/${ids.endorsement}/approve`).set(auth('staff'))).status).toBe(403);
    expect((await http().post(`/api/endorsements/${ids.endorsement}/reject`).set(auth('staff')).send({ reason: 'x' })).status).toBe(403);
  });

  it('E2: the approver must be as senior as the rule demands, and may not decide their own request', async () => {
    await prisma.endorsement.update({ where: { id: ids.endorsement }, data: { requestedById: ids.ownera } });
    const tooJunior = await http().post(`/api/endorsements/${ids.endorsement}/approve`).set(auth('supervisor'));
    expect(tooJunior.status).toBe(403); // SUPERVISOR < MANAGER

    // the requester holding the right seniority is still blocked by maker-checker
    await prisma.endorsement.update({ where: { id: ids.endorsement }, data: { requestedById: ids.manager } });
    const self = await http().post(`/api/endorsements/${ids.endorsement}/approve`).set(auth('manager'));
    expect([self.status, self.body.code]).toEqual([422, 'ENDORSEMENT_SELF_APPROVE']);

    await prisma.endorsement.update({ where: { id: ids.endorsement }, data: { requestedById: ids.supervisor } });
    const ok = await http().post(`/api/endorsements/${ids.endorsement}/approve`).set(auth('manager'));
    expect(ok.status).toBe(201);
    expect(ok.body.data.status).toBe('APPROVED');
  });

  // ─── System-wide jobs ───────────────────────────────────────────────────────

  it('M1: every nightly job needs maintenance.run', async () => {
    const paths = ['invoices/process-daily', 'policies/process-daily', 'proposals/daily-check', 'quotations/process-daily', 'renewals/process-daily', 'tasks/process-daily', 'documents/expire-outdated'];
    for (const p of paths) {
      expect((await http().post(`/api/${p}`).set(auth('staff'))).status, p).toBe(403);
      expect((await http().post(`/api/${p}`).set(auth('plain'))).status, p).toBe(403);
    }
  });

  // ─── Commission rates are confidential ──────────────────────────────────────

  it('R1: commission rates are visible only with commission.rate_view', async () => {
    expect((await http().get('/api/master/commission-rates').set(auth('plain'))).status).toBe(403);
    const company = await http().get(`/api/master/companies/${ids.company}`).set(auth('plain'));
    expect(company.status).toBe(200);
    expect(company.body.data).not.toHaveProperty('commissionRates');
  });

  // ─── Tasks ──────────────────────────────────────────────────────────────────

  it('T1: a task without an assignee belongs to its creator; job-less tasks are private to the people involved', async () => {
    const created = await http().post('/api/tasks').set(auth('ownera')).send({ taskType: 'OTHER', subject: `${UP} private`, policyId: ids.policy });
    expect(created.status).toBe(201);
    expect(created.body.data.assignedTo).toBe(ids.ownera);

    const other = await http().get('/api/tasks').set(auth('ownerb'));
    expect((other.body.data.items as { subject: string }[]).some((t) => t.subject === `${UP} private`)).toBe(false);
    expect((await http().post(`/api/tasks/${created.body.data.id}/complete`).set(auth('ownerb'))).status).toBe(404);
    expect((await http().post(`/api/tasks/${created.body.data.id}/complete`).set(auth('ownera'))).status).toBe(201);
  });

  it('T2: a task cannot be attached to a policy or customer the caller cannot see', async () => {
    const res = await http().post('/api/tasks').set(auth('ownerb')).send({ taskType: 'OTHER', subject: `${UP} sneaky`, policyId: ids.policy });
    expect(res.status).toBe(404);
  });

  // ─── Another agent's records are unreachable by id ──────────────────────────

  it('S1: agent B cannot read or act on agent A’s policy, invoice, payment, endorsement, refund, renewal or commissions', async () => {
    const reads = [
      `/api/policies/${ids.policy}`,
      `/api/policies/${ids.policy}/versions`,
      `/api/policies/${ids.policy}/invoices`,
      `/api/policies/${ids.policy}/payments`,
      `/api/policies/${ids.policy}/endorsements`,
      `/api/policies/${ids.policy}/commissions`,
      `/api/invoices/${ids.invoice}`,
      `/api/invoices/${ids.invoice}/pdf`,
      `/api/invoices/${ids.invoice}/payments`,
      `/api/endorsements/${ids.endorsement}`,
      `/api/refunds/${ids.refund}`,
    ];
    for (const path of reads) {
      const res = await http().get(path).set(auth('ownerb'));
      expect([403, 404], `${path} → ${res.status}`).toContain(res.status);
    }
    // …while the owner can read the same resources
    expect((await http().get(`/api/invoices/${ids.invoice}`).set(auth('ownera'))).status).toBe(200);
    expect((await http().get(`/api/policies/${ids.policy}/invoices`).set(auth('ownera'))).status).toBe(200);

    const pay = await http().post(`/api/invoices/${ids.invoice}/payments`).set(auth('ownerb')).send({ amount: '1.00', paymentMethod: 'CASH' });
    expect([403, 404]).toContain(pay.status);
    const cancelPay = await http().post(`/api/payments/${ids.payment}/cancel`).set(auth('ownerb')).send({ cancelReason: 'x' });
    expect([403, 404]).toContain(cancelPay.status);
    const submit = await http().post(`/api/endorsements/${ids.endorsement}/submit`).set(auth('ownerb'));
    expect([403, 404]).toContain(submit.status);
  });

  it('S2: lists are filtered, not just by-id access', async () => {
    for (const path of ['/api/invoices', '/api/payments', '/api/endorsements', '/api/refunds', '/api/renewals', '/api/commissions']) {
      const res = await http().get(path).set(auth('ownerb'));
      expect(res.status, path).toBe(200);
      const body = JSON.stringify(res.body.data);
      expect(body.includes(UP), `${path} leaked ${UP}`).toBe(false);
    }
    const mine = await http().get('/api/invoices').set(auth('ownera'));
    expect(JSON.stringify(mine.body.data)).toContain(`${UP}INV`);
  });
});
