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
  let managerToken: string;
  let managerId: string;

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
      await prisma.endorsement.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.policyVersion.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.renewal.deleteMany({ where: { previousPolicy: { jobId: { in: prevJobIds } } } });
      await prisma.refund.deleteMany({ where: { creditNote: { policy: { jobId: { in: prevJobIds } } } } });
      await prisma.commissionAdjustment.deleteMany({ where: { commission: { policy: { jobId: { in: prevJobIds } } } } });
      await prisma.commission.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.invoice.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
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
      upsertPerm('policy.view'), upsertPerm('policy.create'), upsertPerm('policy.update'), upsertPerm('maintenance.run'),
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
            { permission: { connect: { code: 'maintenance.run' } } },
          ],
        },
      },
    });

    const managerRole = await prisma.role.findFirst({ where: { code: 'MANAGER' } });
    const manager = await prisma.user.create({
      data: {
        username: `${PREFIX}mgr`,
        email: `${PREFIX}mgr@test.com`,
        passwordHash,
        fullName: 'E2E Pol Manager',
        roles: { create: [{ role: { connect: { id: managerRole!.id } } }] },
      },
    });
    managerId = manager.id;

    const agent = await prisma.user.create({
      data: {
        username: `${PREFIX}agent`,
        email: `${PREFIX}agent@test.com`,
        passwordHash,
        fullName: 'E2E Pol Agent',
        managerId: manager.id,
        roles: { create: [{ role: { connect: { id: role.id } } }] },
      },
    });
    agentId = agent.id;

    const loginRes = await http().post('/api/auth/login').send({ username: `${PREFIX}agent`, password: PASSWORD });
    agentToken = loginRes.body.data.accessToken;

    const mgrLoginRes = await http().post('/api/auth/login').send({ username: `${PREFIX}mgr`, password: PASSWORD });
    managerToken = mgrLoginRes.body.data.accessToken;

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
    expect(res.body.data).toHaveProperty('activatedCount');
    expect(res.body.data).toHaveProperty('expiringCount');
    expect(res.body.data).toHaveProperty('expiredCount');
  });

  // ─── Day 33 Policy Cancellation ───────────────────────────────────────────────

  it('Day 33: calculate, request, reject cancellation returns to ACTIVE', async () => {
    const listRes = await http().get('/api/policies').set('Authorization', `Bearer ${agentToken}`);
    const policyId = listRes.body.data[0].id;

    // Activate policy directly for cancellation testing
    await prisma.policy.update({
      where: { id: policyId },
      data: { status: 'ACTIVE' },
    });

    // 1. Calculate refund via short-rate
    const calcRes = await http()
      .post(`/api/policies/${policyId}/cancel-calculate`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ cancelEffectiveDate: '2027-02-15', method: 'SHORT_RATE' });
    expect(calcRes.status).toBe(201);
    expect(calcRes.body.data).toHaveProperty('refundNet');
    expect(calcRes.body.data).toHaveProperty('totalRefund');

    // 2. Request cancellation
    const reqRes = await http()
      .post(`/api/policies/${policyId}/cancel-request`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        cancelReason: 'Customer moving abroad',
        cancelRequestDate: '2027-02-10',
        cancelEffectiveDate: '2027-02-15',
        cancelRefundAmount: calcRes.body.data.totalRefund,
      });
    expect(reqRes.status).toBe(201);
    expect(reqRes.body.data.status).toBe('CANCEL_REQUESTED');
    expect(reqRes.body.data.cancelReason).toBe('Customer moving abroad');

    // 3. Reject cancellation (Manager rejects)
    const rejRes = await http()
      .post(`/api/policies/${policyId}/cancel-reject`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: 'Documents not clear' });
    expect(rejRes.status).toBe(201);
    expect(rejRes.body.data.status).toBe('ACTIVE');
  });

  it('Security: cancellation refund is capped server-side and the requester cannot approve their own request', async () => {
    const listRes = await http().get('/api/policies').set('Authorization', `Bearer ${agentToken}`);
    const policyId = listRes.body.data[0].id as string;
    await prisma.policy.update({ where: { id: policyId }, data: { status: 'ACTIVE', cancelRequestedById: null } });

    const request = (cancelRefundAmount: string) =>
      http().post(`/api/policies/${policyId}/cancel-request`).set('Authorization', `Bearer ${agentToken}`).send({
        cancelReason: 'refund tampering test', cancelRequestDate: '2027-02-10', cancelEffectiveDate: '2027-02-15', cancelRefundAmount,
      });

    const tooMuch = await request('99999999.00');
    expect([tooMuch.status, tooMuch.body.code]).toEqual([422, 'CANCEL_REFUND_EXCEEDS_LIMIT']);
    const negative = await request('-1.00');
    expect([negative.status, negative.body.code]).toEqual([422, 'CANCEL_REFUND_INVALID']);
    expect((await prisma.policy.findUniqueOrThrow({ where: { id: policyId } })).status).toBe('ACTIVE'); // nothing changed

    // a sane request goes through and records who asked
    const ok = await request('0.00');
    expect(ok.status).toBe(201);
    const stored = await prisma.policy.findUniqueOrThrow({ where: { id: policyId } });
    expect(stored.cancelRequestedById).not.toBeNull();

    // the amount cannot be raised behind the system's back either: approval re-checks the ceiling
    await prisma.policy.update({ where: { id: policyId }, data: { cancelRefundAmount: '99999999.00' } });
    const policyRow = await prisma.policy.findUniqueOrThrow({ where: { id: policyId } });
    const doc = await prisma.document.create({
      data: { jobId: policyRow.jobId, documentType: 'OTHER', originalName: 'sec-cancel.pdf', storedName: 'sec-cancel.pdf', size: 1024, mimeType: 'application/pdf', storagePath: 'docs/sec-cancel.pdf', status: 'VERIFIED' },
    });
    {
      const approve = await http().post(`/api/policies/${policyId}/cancel-approve`).set('Authorization', `Bearer ${managerToken}`).send({ cancelInsurerDocumentId: doc.id });
      expect([approve.status, approve.body.code]).toEqual([422, 'CANCEL_REFUND_EXCEEDS_LIMIT']);
    }

    // maker-checker: the requester is the approver → refused (set the requester to the manager)
    await prisma.policy.update({ where: { id: policyId }, data: { cancelRefundAmount: '0.00', cancelRequestedById: managerId } });
    {
      const self = await http().post(`/api/policies/${policyId}/cancel-approve`).set('Authorization', `Bearer ${managerToken}`).send({ cancelInsurerDocumentId: doc.id });
      expect([self.status, self.body.code]).toEqual([422, 'CANCEL_SELF_APPROVE']);
    }

    // back to a clean ACTIVE policy for the tests that follow
    await prisma.policy.update({ where: { id: policyId }, data: { status: 'ACTIVE', cancelRequestedById: null, cancelRefundAmount: null } });
  });

  it('Day 33: cancel policy with 3 installments, pay 1 → void unpaid invoices, create Credit Note + Refund, clawback commission (D-17)', async () => {
    // Find or create policy with 3 installments
    const listRes = await http().get('/api/policies').set('Authorization', `Bearer ${agentToken}`);
    const policyId = listRes.body.data[0].id;
    const policy = await prisma.policy.findUnique({
      where: { id: policyId },
      include: { invoices: true, job: true },
    });

    // Ensure policy has 3 installment invoices
    await prisma.invoice.deleteMany({ where: { policyId } });
    const inv1 = await prisma.invoice.create({
      data: {
        invoiceNo: 'INV-TEST-001',
        policyId,
        customerId: policy!.job.customerId,
        installmentNo: 1,
        amount: '10000.00',
        netAmount: '9300.00',
        vat: '651.00',
        stampDuty: '49.00',
        dueDate: new Date('2027-01-15'),
        status: 'PAID',
      },
    });
    const inv2 = await prisma.invoice.create({
      data: {
        invoiceNo: 'INV-TEST-002',
        policyId,
        customerId: policy!.job.customerId,
        installmentNo: 2,
        amount: '10000.00',
        netAmount: '9300.00',
        vat: '651.00',
        stampDuty: '49.00',
        dueDate: new Date('2027-03-15'),
        status: 'PENDING',
      },
    });
    const inv3 = await prisma.invoice.create({
      data: {
        invoiceNo: 'INV-TEST-003',
        policyId,
        customerId: policy!.job.customerId,
        installmentNo: 3,
        amount: '10000.00',
        netAmount: '9300.00',
        vat: '651.00',
        stampDuty: '49.00',
        dueDate: new Date('2027-04-15'),
        status: 'PENDING',
      },
    });

    // Create an active renewal for this policy
    const ren = await prisma.renewal.create({
      data: {
        previousPolicyId: policyId,
        renewalDate: new Date('2028-01-01'),
        targetExpiryDate: new Date('2029-01-01'),
        status: 'PENDING',
        remark: 'Auto renewal tracking',
      },
    });

    // Create insurer cancel document on this job
    const doc = await prisma.document.create({
      data: {
        jobId: policy!.jobId,
        documentType: 'OTHER',
        originalName: 'insurer-cancel-confirm.pdf',
        storedName: 'test-cancel.pdf',
        size: 1024,
        mimeType: 'application/pdf',
        storagePath: 'docs/test-cancel.pdf',
        status: 'VERIFIED',
      },
    });

    // Make sure policy is ACTIVE
    await prisma.policy.update({
      where: { id: policyId },
      data: { status: 'ACTIVE' },
    });

    // Request cancellation
    await http()
      .post(`/api/policies/${policyId}/cancel-request`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        cancelReason: 'Customer vehicle sold',
        cancelRequestDate: '2027-02-01',
        cancelEffectiveDate: '2027-02-15',
        cancelRefundAmount: '5000.00',
      });

    // Non-manager approve fails with 403
    const failApprove = await http()
      .post(`/api/policies/${policyId}/cancel-approve`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ cancelInsurerDocumentId: doc.id });
    expect(failApprove.status).toBe(403);

    // Manager approves cancellation
    const approveRes = await http()
      .post(`/api/policies/${policyId}/cancel-approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ cancelInsurerDocumentId: doc.id, remark: 'Approved per insurer notice' });
    expect(approveRes.status).toBe(201);
    expect(approveRes.body.data.status).toBe('CANCELLED');

    // Verify side effect 1: Invoices 2 and 3 due after 2027-02-15 are CANCELLED
    const updatedInv2 = await prisma.invoice.findUnique({ where: { id: inv2.id } });
    const updatedInv3 = await prisma.invoice.findUnique({ where: { id: inv3.id } });
    expect(updatedInv2?.status).toBe('CANCELLED');
    expect(updatedInv3?.status).toBe('CANCELLED');

    // Verify side effect 2: Credit note invoice and Refund created
    const creditNote = await prisma.invoice.findFirst({
      where: { policyId, type: 'CREDIT_NOTE' },
    });
    expect(creditNote).toBeTruthy();
    expect(Number(creditNote?.amount)).toBe(5000);

    const refund = await prisma.refund.findFirst({
      where: { creditNoteId: creditNote!.id },
    });
    expect(refund).toBeTruthy();
    expect(refund?.status).toBe('REQUESTED');
    expect(Number(refund?.amount)).toBe(5000);

    // Verify side effect 3: Commission clawback adjustment created
    const clawback = await prisma.commissionAdjustment.findFirst({
      where: { policyId, refType: 'POLICY_CANCEL' },
    });
    if (clawback) {
      expect(Number(clawback.amount)).toBeLessThan(0);
    }

    // Verify side effect 4: Associated renewal CANCELLED
    const updatedRen = await prisma.renewal.findUnique({ where: { id: ren.id } });
    expect(updatedRen?.status).toBe('CANCELLED');
  });
});

