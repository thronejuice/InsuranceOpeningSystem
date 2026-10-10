/**
 * Negative / Edge-case Tests (spec §44)
 *
 * Phase 1–4 validations:
 *  N1 — Expired quotation → 422 QUOTATION_EXPIRED
 *  N2 — Expired proposal → 422 PROPOSAL_EXPIRED
 *  N3 — Self-approve prevention → 422
 *  N4 — Invalid status transition → 422
 *  N5 — Duplicate bind → 409 / 422
 *  N6 — Bind without approval → 422
 *  N7 — Unauthenticated access → 401
 */
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_neg_';
const PASSWORD = 'E2e@Neg123';

describe('Negative / Edge-case Tests (spec §44)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agentToken: string;
  let agentId: string;
  let customerId: string;

  const http = () => request(app.getHttpServer());

  // ─── Shared helper ──────────────────────────────────────────────────────────

  async function createJobInState(targetStatus: string): Promise<{
    jobId: string;
    quotationId: string;
    proposalId?: string;
    approvalId?: string;
  }> {
    const iType = await prisma.insuranceType.findFirst({ where: { active: true } });
    const product = await prisma.insuranceProduct.findFirst({ where: { code: `${PREFIX.toUpperCase()}PROD` } });
    const company = await prisma.insuranceCompany.findFirst({ where: { code: `${PREFIX.toUpperCase()}CO` } });

    // Create job
    const jobRes = await http()
      .post('/api/jobs')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ customerId, insuranceTypeId: iType!.id, productId: product!.id, agentId, effectiveDate: '2027-01-01', priority: 'NORMAL' });
    const jobId = jobRes.body.data.id as string;

    if (targetStatus === 'DRAFT') return { jobId, quotationId: '' };

    // Submit
    await http().post(`/api/jobs/${jobId}/submit`).set('Authorization', `Bearer ${agentToken}`).send({});

    // Create & update quotation
    const quoRes = await http()
      .post(`/api/jobs/${jobId}/quotations`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ insuranceCompanyId: company!.id, grossPremium: '150000.00', validUntil: '2027-12-31' });
    const quotationId = quoRes.body.data.id as string;
    await http().put(`/api/quotations/${quotationId}`).set('Authorization', `Bearer ${agentToken}`)
      .send({ grossPremium: '148000.00', quotationDate: '2026-10-01', validUntil: '2027-12-31' });

    if (targetStatus === 'QUOTATION_RECEIVED') return { jobId, quotationId };

    // Select quotation
    const quoListRes = await http().get(`/api/jobs/${jobId}/quotations`).set('Authorization', `Bearer ${agentToken}`);
    const version = quoListRes.body.data[0].version;
    await http().post(`/api/quotations/${quotationId}/select`).set('Authorization', `Bearer ${agentToken}`)
      .send({ reason: 'neg test', version });

    if (targetStatus === 'QUOTATION_SELECTED') return { jobId, quotationId };

    // Create proposal
    const propRes = await http()
      .post(`/api/jobs/${jobId}/proposal`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ validUntil: '2027-06-30', remark: 'neg test proposal' });
    const proposalId = propRes.body.data.id as string;

    if (targetStatus === 'PROPOSAL_DRAFT') return { jobId, quotationId, proposalId };

    // Send proposal
    await http().post(`/api/proposals/${proposalId}/send`).set('Authorization', `Bearer ${agentToken}`);

    if (targetStatus === 'WAITING_CUSTOMER') return { jobId, quotationId, proposalId };

    // Accept proposal → WAITING_APPROVAL
    const accRes = await http()
      .post(`/api/proposals/${proposalId}/accept`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ method: 'MANUAL', remark: 'Customer agreed verbally' });
    const approvalId = accRes.body.data.approvals?.[0]?.id as string | undefined;

    if (targetStatus === 'WAITING_APPROVAL') return { jobId, quotationId, proposalId, approvalId };

    return { jobId, quotationId, proposalId, approvalId };
  }

  // ─── Setup ─────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    // Cleanup
    const prevJobs = await prisma.job.findMany({
      where: { agent: { username: { startsWith: PREFIX } } },
      select: { id: true },
    });
    const prevJobIds = prevJobs.map((j) => j.id);
    if (prevJobIds.length > 0) {
      await prisma.idempotencyKey.deleteMany({ where: { entityId: { in: prevJobIds } } });
      await prisma.policyCoverage.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.receipt.deleteMany({ where: { invoice: { policy: { jobId: { in: prevJobIds } } } } });
      await prisma.payment.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.invoice.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
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
    await prisma.insuranceCompany.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    const testUsers = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
    if (testUsers.length > 0) {
      const testUserIds = testUsers.map((u) => u.id);
      await prisma.customer.deleteMany({ where: { createdById: { in: testUserIds } } });
    }
    await prisma.insuranceProduct.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });

    // Compute actual max document numbers and advance sequences past them
    const curYear = new Date().getFullYear();
    const yearStr = String(curYear);
    type MaxRow = [{ max: number | null }];
    const [jobR, qtR, ppR, plR] = await Promise.all([
      prisma.$queryRaw<MaxRow>`SELECT MAX(CAST(SPLIT_PART(job_no, '-', 3) AS INTEGER)) as max FROM jobs WHERE job_no LIKE ${`JOB-${yearStr}-%`}`,
      prisma.$queryRaw<MaxRow>`SELECT MAX(CAST(SPLIT_PART(quotation_no, '-', 3) AS INTEGER)) as max FROM quotations WHERE quotation_no LIKE ${`QT-${yearStr}-%`}`,
      prisma.$queryRaw<MaxRow>`SELECT MAX(CAST(SPLIT_PART(proposal_no, '-', 3) AS INTEGER)) as max FROM proposals WHERE proposal_no LIKE ${`PP-${yearStr}-%`}`,
      prisma.$queryRaw<MaxRow>`SELECT MAX(CAST(SPLIT_PART(policy_no, '-', 3) AS INTEGER)) as max FROM policies WHERE policy_no LIKE ${`PL-${yearStr}-%`}`,
    ]);
    const buf = 50;
    const jobSafe = (Number(jobR[0].max ?? 0)) + buf;
    const qtSafe  = (Number(qtR[0].max  ?? 0)) + buf;
    const ppSafe  = (Number(ppR[0].max  ?? 0)) + buf;
    const plSafe  = (Number(plR[0].max  ?? 0)) + buf;
    await prisma.$executeRaw`
      INSERT INTO document_sequences (prefix, year, last_value, updated_at) VALUES
        ('JOB', ${curYear}, ${jobSafe}, now()),
        ('QT',  ${curYear}, ${qtSafe},  now()),
        ('PP',  ${curYear}, ${ppSafe},  now()),
        ('PL',  ${curYear}, ${plSafe},  now()),
        ('CUS', 0,          ${Math.max(jobSafe, qtSafe, ppSafe, plSafe)}, now())
      ON CONFLICT (prefix, year) DO UPDATE
        SET last_value = GREATEST(document_sequences.last_value, EXCLUDED.last_value),
            updated_at = now()
    `;

    const passwordHash = await hash(PASSWORD);
    const upsertPerm = (code: string) =>
      prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } });

    await Promise.all([
      upsertPerm('job.view'), upsertPerm('job.create'), upsertPerm('job.submit'), upsertPerm('job.update'),
      upsertPerm('customer.view'), upsertPerm('customer.create'),
      upsertPerm('quotation.create'), upsertPerm('quotation.update'), upsertPerm('quotation.select'), upsertPerm('proposal.create'), upsertPerm('proposal.send'),
      upsertPerm('proposal.accept'), upsertPerm('proposal.reject'), upsertPerm('approval.approve'),
      upsertPerm('policy.view'), upsertPerm('policy.create'),
    ]);

    const role = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}AGENT`,
        name: 'E2E Negative Agent',
        permissions: {
          create: [
            { permission: { connect: { code: 'job.view' } } },
            { permission: { connect: { code: 'job.create' } } },
            { permission: { connect: { code: 'job.submit' } } },
            { permission: { connect: { code: 'job.update' } } },
            { permission: { connect: { code: 'customer.view' } } },
            { permission: { connect: { code: 'customer.create' } } },
            { permission: { connect: { code: 'quotation.create' } } }, { permission: { connect: { code: 'quotation.update' } } }, { permission: { connect: { code: 'quotation.select' } } },
            { permission: { connect: { code: 'proposal.create' } } },
            { permission: { connect: { code: 'proposal.send' } } },
            { permission: { connect: { code: 'proposal.accept' } } },
            { permission: { connect: { code: 'proposal.reject' } } },
            { permission: { connect: { code: 'approval.approve' } } },
            { permission: { connect: { code: 'policy.view' } } },
            { permission: { connect: { code: 'policy.create' } } },
          ],
        },
      },
    });

    const agent = await prisma.user.create({
      data: {
        username: `${PREFIX}agent`,
        email: `${PREFIX}agent@test.com`,
        passwordHash,
        fullName: 'E2E Negative Agent',
        roles: { create: [{ role: { connect: { id: role.id } } }] },
      },
    });
    agentId = agent.id;

    const iType = await prisma.insuranceType.findFirst({ where: { active: true } });
    await prisma.insuranceProduct.create({
      data: {
        insuranceTypeId: iType!.id,
        code: `${PREFIX.toUpperCase()}PROD`,
        name: 'E2E Negative Product',
        requireDocsOnSubmit: false,
        requireDocsOnBind: false,
      },
    });
    await prisma.insuranceCompany.create({
      data: { code: `${PREFIX.toUpperCase()}CO`, name: 'E2E Negative Company' },
    });

    const loginRes = await http().post('/api/auth/login').send({ username: `${PREFIX}agent`, password: PASSWORD });
    agentToken = loginRes.body.data.accessToken;

    const custRes = await http()
      .post('/api/customers')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ customerType: 'INDIVIDUAL', firstName: 'ทดสอบNeg', lastName: 'ลบNeg', phone: '0899999999' });
    customerId = custRes.body.data.id;
  });

  afterAll(async () => { await app.close(); });

  // ─── N1: Expired Quotation ─────────────────────────────────────────────────

  describe('N1 — Expired Quotation (spec §44)', () => {
    it('selecting an expired quotation → 422 QUOTATION_EXPIRED', async () => {
      const iType = await prisma.insuranceType.findFirst({ where: { active: true } });
      const product = await prisma.insuranceProduct.findFirst({ where: { code: `${PREFIX.toUpperCase()}PROD` } });
      const company = await prisma.insuranceCompany.findFirst({ where: { code: `${PREFIX.toUpperCase()}CO` } });

      const jobRes = await http().post('/api/jobs').set('Authorization', `Bearer ${agentToken}`)
        .send({ customerId, insuranceTypeId: iType!.id, productId: product!.id, agentId, effectiveDate: '2027-01-01', priority: 'NORMAL' });
      const jobId = jobRes.body.data.id;

      await http().post(`/api/jobs/${jobId}/submit`).set('Authorization', `Bearer ${agentToken}`).send({});

      const quoRes = await http().post(`/api/jobs/${jobId}/quotations`).set('Authorization', `Bearer ${agentToken}`)
        .send({ insuranceCompanyId: company!.id, grossPremium: '50000.00', validUntil: '2020-01-01' });
      const quotationId = quoRes.body.data.id;

      // Set quotation as received (with expired validUntil)
      await http().put(`/api/quotations/${quotationId}`).set('Authorization', `Bearer ${agentToken}`)
        .send({ grossPremium: '48000.00', quotationDate: '2019-12-01', validUntil: '2020-01-01' });

      const listRes = await http().get(`/api/jobs/${jobId}/quotations`).set('Authorization', `Bearer ${agentToken}`);
      const version = listRes.body.data[0].version;

      const res = await http().post(`/api/quotations/${quotationId}/select`).set('Authorization', `Bearer ${agentToken}`)
        .send({ reason: 'expired test', version });

      expect(res.status).toBe(422);
      expect(res.body.code ?? res.body.message).toMatch(/QUOTATION_EXPIRED/i);
    });
  });

  // ─── N2: Expired Proposal ──────────────────────────────────────────────────

  describe('N2 — Expired Proposal (spec §44)', () => {
    it('accepting an expired proposal → 422 PROPOSAL_EXPIRED', async () => {
      const { proposalId } = await createJobInState('PROPOSAL_DRAFT');

      // Expire the proposal directly in DB
      await prisma.proposal.update({
        where: { id: proposalId! },
        data: { validUntil: new Date('2020-01-01') },
      });

      // Send it (send should succeed regardless of expiry, acceptance is gated)
      await http().post(`/api/proposals/${proposalId}/send`).set('Authorization', `Bearer ${agentToken}`);

      const res = await http()
        .post(`/api/proposals/${proposalId}/accept`)
        .set('Authorization', `Bearer ${agentToken}`);

      expect(res.status).toBe(422);
      expect(res.body.code ?? res.body.message).toMatch(/PROPOSAL_EXPIRED/i);
    });
  });

  // ─── N3: Self-approve prevention ──────────────────────────────────────────

  describe('N3 — Self-approve prevention', () => {
    it('approving own approval request → 422', async () => {
      const { approvalId } = await createJobInState('WAITING_APPROVAL');
      expect(approvalId).toBeTruthy();

      // Same agent tries to approve
      const res = await http()
        .post(`/api/approvals/${approvalId}/approve`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ reason: 'self approve attempt' });

      expect(res.status).toBe(422);
    });
  });

  // ─── N4: Invalid status transition ────────────────────────────────────────

  describe('N4 — Invalid status transition', () => {
    it('submitting an already-submitted job → 409 JOB_INVALID_TRANSITION', async () => {
      const { jobId } = await createJobInState('QUOTATION_RECEIVED');

      // Try to submit again (job is already past DRAFT)
      const res = await http()
        .post(`/api/jobs/${jobId}/submit`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({});

      expect(res.status).toBe(409);
    });

    it('accepting a DRAFT proposal (not sent) → 409 PROPOSAL_INVALID_STATUS', async () => {
      const { proposalId } = await createJobInState('PROPOSAL_DRAFT');

      const res = await http()
        .post(`/api/proposals/${proposalId}/accept`)
        .set('Authorization', `Bearer ${agentToken}`);

      expect(res.status).toBe(409);
    });

    it('binding a job that is still WAITING_APPROVAL → 409 JOB_INVALID_STATUS', async () => {
      const { jobId } = await createJobInState('WAITING_APPROVAL');

      const res = await http()
        .post(`/api/jobs/${jobId}/bind`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ remark: 'premature bind' });

      expect(res.status).toBe(409);
    });
  });

  // ─── N5: Bind without going through approval ──────────────────────────────

  describe('N5 — Bind without approval', () => {
    it('binding a job in QUOTATION_SELECTED (no proposal) → 409 JOB_INVALID_STATUS', async () => {
      const { jobId } = await createJobInState('QUOTATION_SELECTED');

      const res = await http()
        .post(`/api/jobs/${jobId}/bind`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ remark: 'skip approval attempt' });

      expect(res.status).toBe(409);
    });
  });

  // ─── N6: Unauthenticated access ────────────────────────────────────────────

  describe('N6 — Unauthenticated access', () => {
    it('GET /jobs without token → 401', async () => {
      const res = await http().get('/api/jobs');
      expect(res.status).toBe(401);
    });

    it('POST /jobs without token → 401', async () => {
      const res = await http().post('/api/jobs').send({ customerId, effectiveDate: '2027-01-01' });
      expect(res.status).toBe(401);
    });

    it('GET /approvals without token → 401', async () => {
      const res = await http().get('/api/approvals');
      expect(res.status).toBe(401);
    });

    it('GET /policies without token → 401', async () => {
      const res = await http().get('/api/policies');
      expect(res.status).toBe(401);
    });
  });

  // ─── N7: Duplicate / idempotency ──────────────────────────────────────────

  describe('N7 — Duplicate operations', () => {
    it('sending the same proposal twice → second call is idempotent or 422', async () => {
      const { proposalId } = await createJobInState('PROPOSAL_DRAFT');

      const r1 = await http().post(`/api/proposals/${proposalId}/send`).set('Authorization', `Bearer ${agentToken}`);
      expect(r1.status).toBe(201);

      // Second send: should be idempotent (200/201), refuse (422 invalid transition), or 409 concurrent lock
      const r2 = await http().post(`/api/proposals/${proposalId}/send`).set('Authorization', `Bearer ${agentToken}`);
      expect([200, 201, 409, 422]).toContain(r2.status);
    });
  });
});
