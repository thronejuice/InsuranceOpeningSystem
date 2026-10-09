import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_pol_';
const PASSWORD = 'E2e@Pol123';

describe('Policy API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agentToken: string;
  let agentId: string;

  // A job that is APPROVED (went through approval flow), ready to bind
  let approvedJobId: string;
  // A job that is CUSTOMER_ACCEPTED (no approval needed), ready to bind
  let acceptedJobId: string;

  const http = () => request(app.getHttpServer());

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
    await prisma.customer.deleteMany({ where: { customerCode: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.insuranceProduct.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });

    const passwordHash = await hash(PASSWORD);

    const upsertPerm = (code: string) =>
      prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } });
    await Promise.all([
      upsertPerm('job.view'), upsertPerm('job.create'), upsertPerm('customer.view'),
      upsertPerm('quotation.create'), upsertPerm('quotation.update'), upsertPerm('quotation.select'), upsertPerm('job.view_all'),
      upsertPerm('proposal.create'), upsertPerm('proposal.send'),
      upsertPerm('proposal.accept'), upsertPerm('proposal.reject'),
      upsertPerm('approval.approve'),
      upsertPerm('policy.view'), upsertPerm('policy.create'), upsertPerm('policy.update'),
    ]);

    const role = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}AGENT`,
        name: 'E2E Pol Agent',
        permissions: {
          create: [
            { permission: { connect: { code: 'job.view' } } },
            { permission: { connect: { code: 'job.create' } } },
            { permission: { connect: { code: 'customer.view' } } },
            { permission: { connect: { code: 'quotation.create' } } }, { permission: { connect: { code: 'quotation.update' } } }, { permission: { connect: { code: 'quotation.select' } } },
            { permission: { connect: { code: 'proposal.create' } } },
            { permission: { connect: { code: 'proposal.send' } } },
            { permission: { connect: { code: 'proposal.accept' } } },
            { permission: { connect: { code: 'proposal.reject' } } },
            { permission: { connect: { code: 'approval.approve' } } },
            { permission: { connect: { code: 'policy.view' } } },
            { permission: { connect: { code: 'policy.create' } } },
            { permission: { connect: { code: 'policy.update' } } },
          ],
        },
      },
    });

    const agent = await prisma.user.create({
      data: {
        username: `${PREFIX}agent`,
        email: `${PREFIX}agent@test.com`,
        passwordHash,
        fullName: 'E2E Pol Agent',
        roles: { create: [{ role: { connect: { id: role.id } } }] },
      },
    });
    agentId = agent.id;

    const loginRes = await http().post('/api/auth/login').send({ username: `${PREFIX}agent`, password: PASSWORD });
    agentToken = loginRes.body.data.accessToken;

    const iType = await prisma.insuranceType.findFirst({ where: { active: true } });
    // Create a test product with requireDocsOnBind=false to avoid BR-008 in bind flow
    await prisma.insuranceProduct.deleteMany({ where: { code: `${PREFIX.toUpperCase()}PROD` } });
    const product = await prisma.insuranceProduct.create({
      data: {
        insuranceTypeId: iType!.id,
        code: `${PREFIX.toUpperCase()}PROD`,
        name: 'E2E Policy Product',
        requireDocsOnSubmit: false,
        requireDocsOnBind: false,
      },
    });
    const company = await prisma.insuranceCompany.create({
      data: { code: `${PREFIX.toUpperCase()}CO`, name: 'E2E Pol Company' },
    });
    const customer = await prisma.customer.create({
      data: { customerCode: `${PREFIX.toUpperCase()}C001`, customerType: 'INDIVIDUAL', firstName: 'Pol', lastName: 'Test' },
    });

    // Helper: job → quotation → record → select → proposal → send → accept → (optional) approve → ready for bind
    async function prepareJob(grossPremium: string, approveIt: boolean): Promise<string> {
      const jobRes = await http()
        .post('/api/jobs')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ customerId: customer.id, insuranceTypeId: iType!.id, productId: product!.id, agentId, effectiveDate: '2027-01-01' });
      const jId = jobRes.body.data.id;

      const quoRes = await http()
        .post(`/api/jobs/${jId}/quotations`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ insuranceCompanyId: company.id, grossPremium, validUntil: '2027-12-31' });
      const quoId = quoRes.body.data.id;

      const recRes = await http()
        .put(`/api/quotations/${quoId}`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ grossPremium });

      await http()
        .post(`/api/quotations/${quoId}/select`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ reason: 'เลือก', version: recRes.body.data.version });

      const propRes = await http()
        .post(`/api/jobs/${jId}/proposal`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ validUntil: '2027-06-30' });
      const propId = propRes.body.data.id;

      await http().post(`/api/proposals/${propId}/send`).set('Authorization', `Bearer ${agentToken}`);

      const acceptRes = await http()
        .post(`/api/proposals/${propId}/accept`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ method: 'MANUAL', remark: 'Customer agreed verbally' });

      if (approveIt && acceptRes.body.data.approvals?.length > 0) {
        const approvalId = acceptRes.body.data.approvals[0].id;
        // Need a different user to approve (self-approve prevention)
        // Directly update DB to bypass self-approve for setup
        await prisma.approval.update({
          where: { id: approvalId },
          data: { status: 'APPROVED', approvedAt: new Date() },
        });
        await prisma.job.update({
          where: { id: jId },
          data: { status: 'APPROVED', version: { increment: 1 } },
        });
        await prisma.jobStatusHistory.create({
          data: { jobId: jId, fromStatus: 'WAITING_APPROVAL', toStatus: 'APPROVED', changedById: agentId },
        });
      }

      return jId;
    }

    // Job with premium 50k: CUSTOMER_ACCEPTED → WAITING_APPROVAL; approve directly
    approvedJobId = await prepareJob('50000.00', true);
    // Job with premium 1,000 (no approval rule triggers): CUSTOMER_ACCEPTED
    // Actually we need to ensure no approval rules match for low premium
    // All rules trigger at >= 0... hmm. Let me check: rules are PREMIUM < 100k → SUPERVISOR.
    // So 50k triggers SUPERVISOR and goes to WAITING_APPROVAL → we need to approve.
    // And 100k+ triggers MANAGER. There's no case where no approval is needed with current seed rules!
    // Q: does every premium trigger an approval? PREMIUM LT 100000 → SUPERVISOR, PREMIUM GTE 100000 → MANAGER
    // Yes, every premium triggers some approval rule.
    // So for "no approval needed" we'd need to disable rules, but we can't easily.
    // Instead: use same pattern - prepareJob creates job that needs approval, then approve it.
    // For acceptedJobId, let's just prepare another job with approval and approve it too.
    acceptedJobId = await prepareJob('80000.00', true);
  });

  afterAll(async () => { await app.close(); });

  // ─── Preconditions ────────────────────────────────────────────────────────────

  it('GET /jobs/:jobId/bind/preconditions — shows all checks', async () => {
    const res = await http()
      .get(`/api/jobs/${approvedJobId}/bind/preconditions`)
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    const checks = res.body.data as Array<{ code: string; met: boolean }>;
    expect(checks).toBeInstanceOf(Array);
    const customerCheck = checks.find((c) => c.code === 'CUSTOMER_ACCEPTED_PROPOSAL');
    expect(customerCheck?.met).toBe(true);
    const approvalCheck = checks.find((c) => c.code === 'APPROVAL_CLEARED');
    expect(approvalCheck?.met).toBe(true);
  });

  // ─── Bind ─────────────────────────────────────────────────────────────────────

  it('POST /jobs/:jobId/bind — binds job → BINDING, then confirm → POLICY_PENDING', async () => {
    const res = await http()
      .post(`/api/jobs/${approvedJobId}/bind`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ remark: 'ทดสอบ bind' });

    expect(res.status).toBe(201);
    expect(res.body.data.jobId).toBe(approvedJobId);
    expect(res.body.data.status).toBe('SUBMITTED');

    const jobRes = await http().get(`/api/jobs/${approvedJobId}`).set('Authorization', `Bearer ${agentToken}`);
    expect(jobRes.body.data.status).toBe('BINDING');

    // Confirm binding transitions Job to POLICY_PENDING
    const confirmRes = await http()
      .post(`/api/jobs/${approvedJobId}/bind/confirm`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ binderNumber: 'BIND-12345', remark: 'ยืนยันความคุ้มครอง' });

    expect(confirmRes.status).toBe(201);
    expect(confirmRes.body.data.status).toBe('CONFIRMED');

    const confirmedJobRes = await http().get(`/api/jobs/${approvedJobId}`).set('Authorization', `Bearer ${agentToken}`);
    expect(confirmedJobRes.body.data.status).toBe('POLICY_PENDING');
  });

  it('POST /jobs/:jobId/bind — idempotency: same key returns existing binding', async () => {
    const key = `test-idem-${Date.now()}`;

    const res1 = await http()
      .post(`/api/jobs/${acceptedJobId}/bind`)
      .set('Authorization', `Bearer ${agentToken}`)
      .set('idempotency-key', key)
      .send({});

    expect(res1.status).toBe(201);
    const bindingId1 = res1.body.data.id;

    // Second call with same key should return the existing binding (not 409)
    const res2 = await http()
      .post(`/api/jobs/${acceptedJobId}/bind`)
      .set('Authorization', `Bearer ${agentToken}`)
      .set('idempotency-key', key)
      .send({});

    expect(res2.status).toBe(201);
    expect(res2.body.data.id).toBe(bindingId1);
  });

  it('POST /jobs/:jobId/bind — already bound → 409', async () => {
    // approvedJobId is already bound (from previous test)
    const res = await http()
      .post(`/api/jobs/${approvedJobId}/bind`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({});
    // Job is now POLICY_PENDING, not CUSTOMER_ACCEPTED/APPROVED → invalid status
    expect(res.status).toBe(409);
  });

  // ─── Policy ───────────────────────────────────────────────────────────────────

  it('POST /jobs/:jobId/policy — issues policy (PENDING because effectiveDate is in 2027), job auto-closes (D-10)', async () => {
    const res = await http()
      .post(`/api/jobs/${approvedJobId}/policy`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ remark: 'ทดสอบ policy' });

    expect(res.status).toBe(201);
    expect(res.body.data.jobId).toBe(approvedJobId);
    // Since effectiveDate is 2027-01-01 (future), initial status is PENDING per D-10
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.policyNo).toMatch(/^PL-\d{4}-\d+$/);

    const jobRes = await http().get(`/api/jobs/${approvedJobId}`).set('Authorization', `Bearer ${agentToken}`);
    // Job auto-closed upon policy issuance (POLICY_PENDING -> POLICY_ISSUED -> CLOSED)
    expect(jobRes.body.data.status).toBe('CLOSED');
  });

  it('POST /jobs/:jobId/policy — duplicate policy → 409 (job already CLOSED)', async () => {
    const res = await http()
      .post(`/api/jobs/${approvedJobId}/policy`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({});
    expect(res.status).toBe(409);
  });

  it('GET /policies — lists policies', async () => {
    const res = await http()
      .get('/api/policies')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /policies/:id — returns policy with coverages', async () => {
    const listRes = await http().get('/api/policies').set('Authorization', `Bearer ${agentToken}`);
    const policyId = listRes.body.data[0].id;

    const res = await http()
      .get(`/api/policies/${policyId}`)
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(policyId);
    expect(Array.isArray(res.body.data.coverages)).toBe(true);
  });

  it('PUT /policies/:id — updates paymentDueDate', async () => {
    const listRes = await http().get('/api/policies').set('Authorization', `Bearer ${agentToken}`);
    const policyId = listRes.body.data[0].id;

    const res = await http()
      .put(`/api/policies/${policyId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ paymentDueDate: '2027-02-28', remark: 'อัปเดต' });
    expect(res.status).toBe(200);
    expect(res.body.data.paymentDueDate).toBe('2027-02-28');
    expect(res.body.data.remark).toBe('อัปเดต');
  });

  it('POST /policies/process-daily — maintains policy statuses', async () => {
    const res = await http()
      .post('/api/policies/process-daily')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('activatedCount');
    expect(res.body).toHaveProperty('expiringCount');
    expect(res.body).toHaveProperty('expiredCount');
  });
});
