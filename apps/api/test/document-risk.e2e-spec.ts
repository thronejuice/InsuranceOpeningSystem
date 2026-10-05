/**
 * Missing Document / Missing Risk negative tests — spec §44
 *
 * N8 — Missing Required Document: product with requireDocsOnSubmit → submit → 422 JOB_DOCUMENTS_MISSING
 * N9 — Missing Required Risk: MOTOR product with required fields → submit without risk → 422 JOB_RISK_INCOMPLETE
 * N10 — Duplicate policy: issue policy on POLICY_ISSUED job → 409 (state machine)
 */
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_drisk_';
const PASSWORD = 'E2e@DocR123';

describe('Missing Document / Risk / Duplicate Policy (spec §44 N8–N10)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agentToken: string;
  let approverToken: string;
  let agentId: string;
  let customerId: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    // Cleanup previous runs
    const prevJobs = await prisma.job.findMany({
      where: { agent: { username: { startsWith: PREFIX } } },
      select: { id: true },
    });
    const prevJobIds = prevJobs.map((j) => j.id);
    if (prevJobIds.length > 0) {
      await prisma.idempotencyKey.deleteMany({ where: { entityId: { in: prevJobIds } } });
      await prisma.policyCoverage.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.payment.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.commission.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.policy.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.binding.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.approval.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.proposal.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.quotationItem.deleteMany({ where: { quotation: { jobId: { in: prevJobIds } } } });
      await prisma.quotation.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.jobStatusHistory.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.activityLog.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.job.deleteMany({ where: { id: { in: prevJobIds } } });
    }
    await prisma.documentChecklist.deleteMany({ where: { product: { code: { startsWith: PREFIX.toUpperCase() } } } });
    await prisma.insuranceProduct.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.insuranceCompany.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    const testUsers = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
    if (testUsers.length > 0) {
      const ids = testUsers.map((u) => u.id);
      await prisma.customer.deleteMany({ where: { createdById: { in: ids } } });
    }
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });

    const passwordHash = await hash(PASSWORD);
    const up = (c: string) => prisma.permission.upsert({ where: { code: c }, update: {}, create: { code: c, description: c } });
    await Promise.all([
      up('job.view'), up('job.create'), up('job.submit'), up('job.update'), up('job.view_all'),
      up('customer.view'), up('customer.create'), up('quotation.create'), up('quotation.update'), up('quotation.select'),
      up('proposal.create'), up('proposal.send'), up('proposal.accept'), up('proposal.reject'),
      up('approval.approve'), up('policy.view'), up('policy.create'), up('payment.create'), up('payment.view'),
    ]);

    const role = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}AGENT`,
        name: 'E2E DocRisk Agent',
        permissions: {
          create: [
            'job.view', 'job.create', 'job.submit', 'job.update', 'job.view_all',
            'customer.view', 'customer.create', 'quotation.create', 'quotation.update', 'quotation.select',
            'proposal.create', 'proposal.send', 'proposal.accept', 'proposal.reject',
            'approval.approve', 'policy.view', 'policy.create', 'payment.create', 'payment.view',
          ].map((c) => ({ permission: { connect: { code: c } } })),
        },
      },
    });

    const agent = await prisma.user.create({
      data: {
        username: `${PREFIX}agent`,
        email: `${PREFIX}agent@test.com`,
        passwordHash,
        fullName: 'E2E DocRisk Agent',
        roles: { create: [{ role: { connect: { id: role.id } } }] },
      },
    });
    agentId = agent.id;

    await prisma.user.create({
      data: {
        username: `${PREFIX}approver`,
        email: `${PREFIX}approver@test.com`,
        passwordHash,
        fullName: 'E2E DocRisk Approver',
        roles: { create: [{ role: { connect: { id: role.id } } }] },
      },
    });
    const approverLogin = await http().post('/api/auth/login').send({ username: `${PREFIX}approver`, password: PASSWORD });
    approverToken = approverLogin.body.data.accessToken;

    const loginRes = await http().post('/api/auth/login').send({ username: `${PREFIX}agent`, password: PASSWORD });
    agentToken = loginRes.body.data.accessToken;

    const custRes = await http().post('/api/customers').set('Authorization', `Bearer ${agentToken}`)
      .send({ customerType: 'INDIVIDUAL', firstName: 'ทดสอบDocRisk', lastName: 'ลบDocRisk' });
    customerId = custRes.body.data.id;
  });

  afterAll(async () => { await app.close(); });

  // ── N8: Missing Required Document ─────────────────────────────────────────
  describe('N8 — Missing Required Document (spec §44)', () => {
    it('submit job when product requireDocsOnSubmit=true and no docs → 422 JOB_DOCUMENTS_MISSING', async () => {
      const iType = await prisma.insuranceType.findFirst({ where: { active: true } });

      // Create product that requires documents on submit
      const product = await prisma.insuranceProduct.create({
        data: {
          insuranceTypeId: iType!.id,
          code: `${PREFIX.toUpperCase()}DOCP`,
          name: 'E2E RequireDocs Product',
          requireDocsOnSubmit: true,  // ← requires docs
          requireDocsOnBind: false,
          documentChecklist: { create: [{ documentType: 'ID_CARD', isRequired: true }] },
        },
      });

      const jobRes = await http().post('/api/jobs').set('Authorization', `Bearer ${agentToken}`)
        .send({ customerId, insuranceTypeId: iType!.id, productId: product.id, agentId, effectiveDate: '2027-01-01', priority: 'NORMAL' });
      const jobId = jobRes.body.data.id as string;

      // Submit without uploading any documents
      const res = await http().post(`/api/jobs/${jobId}/submit`).set('Authorization', `Bearer ${agentToken}`).send({});

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('JOB_DOCUMENTS_MISSING');
    });
  });

  // ── N9: Missing Required Risk ───────────────────────────────────────────
  describe('N9 — Missing Required Risk (spec §44)', () => {
    it('submit MOTOR job without filling required risk fields → 422 JOB_RISK_INCOMPLETE', async () => {
      // MOTOR type has required risk fields (brand, model, year, license_plate, …)
      const motorType = await prisma.insuranceType.findFirst({ where: { code: 'MOTOR' } });

      if (!motorType) {
        console.warn('MOTOR insurance type not found in DB — skipping N9 (requires db:seed)');
        return;
      }

      const motorProduct = await prisma.insuranceProduct.findFirst({
        where: { code: 'MOTOR-001' }, // risk check runs before the document check
      });

      if (!motorProduct) {
        console.warn('MOTOR product not found — skipping N9');
        return;
      }

      const jobRes = await http().post('/api/jobs').set('Authorization', `Bearer ${agentToken}`)
        .send({ customerId, insuranceTypeId: motorType.id, productId: motorProduct.id, agentId, effectiveDate: '2027-02-01', priority: 'NORMAL' });
      expect(jobRes.status).toBe(201);
      const jobId = jobRes.body.data.id as string;

      // Submit without filling any risk fields (brand, model, year, license_plate are required)
      const res = await http().post(`/api/jobs/${jobId}/submit`).set('Authorization', `Bearer ${agentToken}`).send({});

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('JOB_RISK_INCOMPLETE');
    });
  });

  // ── N10: Duplicate Policy (issue on already POLICY_ISSUED job) ────────────
  describe('N10 — Duplicate Policy (spec §44)', () => {
    it('issuing policy on POLICY_ISSUED job → 409 state machine blocks', async () => {
      const iType = await prisma.insuranceType.findFirst({ where: { active: true } });
      const product = await prisma.insuranceProduct.create({
        data: {
          insuranceTypeId: iType!.id,
          code: `${PREFIX.toUpperCase()}POLDUP`,
          name: 'E2E DupPolicy Product',
          requireDocsOnSubmit: false,
          requireDocsOnBind: false,
        },
      });
      const company = await prisma.insuranceCompany.create({
        data: { code: `${PREFIX.toUpperCase()}DUP`, name: 'E2E DupPolicy Company' },
      });

      // Build a POLICY_ISSUED job
      const jobRes = await http().post('/api/jobs').set('Authorization', `Bearer ${agentToken}`)
        .send({ customerId, insuranceTypeId: iType!.id, productId: product.id, agentId, effectiveDate: '2027-03-01', priority: 'NORMAL' });
      const jobId = jobRes.body.data.id as string;

      const quoRes = await http().post(`/api/jobs/${jobId}/quotations`).set('Authorization', `Bearer ${agentToken}`)
        .send({ insuranceCompanyId: company.id, grossPremium: '10000.00', validUntil: '2027-12-31' });
      const quotationId = quoRes.body.data.id as string;

      await http().put(`/api/quotations/${quotationId}`).set('Authorization', `Bearer ${agentToken}`)
        .send({ grossPremium: '10000.00', quotationDate: '2026-10-01', validUntil: '2027-12-31' });

      const listRes = await http().get(`/api/jobs/${jobId}/quotations`).set('Authorization', `Bearer ${agentToken}`);
      const version = listRes.body.data[0].version as number;

      await http().post(`/api/quotations/${quotationId}/select`).set('Authorization', `Bearer ${agentToken}`)
        .send({ reason: 'dup policy test', version });

      const propRes = await http().post(`/api/jobs/${jobId}/proposal`).set('Authorization', `Bearer ${agentToken}`)
        .send({ validUntil: '2027-06-30', remark: 'dup policy test' });
      const proposalId = propRes.body.data.id as string;

      await http().post(`/api/proposals/${proposalId}/send`).set('Authorization', `Bearer ${agentToken}`);
      const accRes = await http().post(`/api/proposals/${proposalId}/accept`).set('Authorization', `Bearer ${agentToken}`);
      const approvalId = accRes.body.data.approvals[0].id as string;

      await http().post(`/api/approvals/${approvalId}/approve`).set('Authorization', `Bearer ${approverToken}`)
        .send({ reason: 'dup policy approve' });

      await http().post(`/api/jobs/${jobId}/bind`).set('Authorization', `Bearer ${agentToken}`)
        .send({ remark: 'dup policy bind' });

      const polRes = await http().post(`/api/jobs/${jobId}/policy`).set('Authorization', `Bearer ${agentToken}`)
        .send({ remark: 'dup policy issue' });
      expect(polRes.status).toBe(201);

      // Try to issue policy again — state machine blocks (POLICY_ISSUED → cannot bind/issue again)
      const dupRes = await http().post(`/api/jobs/${jobId}/policy`).set('Authorization', `Bearer ${agentToken}`)
        .send({ remark: 'dup policy second attempt' });

      expect([409, 422]).toContain(dupRes.status);
    });
  });
});
