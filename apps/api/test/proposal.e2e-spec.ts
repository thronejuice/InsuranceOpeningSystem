import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_prop_';
const PASSWORD = 'E2e@Prop123';

describe('Proposal API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agentToken: string;
  let agentId: string;

  // Job with premium 50,000 → Supervisor
  let jobSupId: string;
  let proposalSupId: string;

  // Job with premium 150,000 → Manager
  let jobMgrId: string;
  let proposalMgrId: string;

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
      await prisma.approval.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.proposal.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.quotationItem.deleteMany({ where: { quotation: { jobId: { in: prevJobIds } } } });
      await prisma.quotation.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.jobStatusHistory.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.activityLog.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.job.deleteMany({ where: { id: { in: prevJobIds } } });
    }
    await prisma.insuranceCompany.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.customer.deleteMany({ where: { customerCode: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });

    const passwordHash = await hash(PASSWORD);

    const upsertPerm = (code: string) =>
      prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } });
    await Promise.all([
      upsertPerm('job.view'), upsertPerm('job.create'), upsertPerm('customer.view'),
      upsertPerm('quotation.create'), upsertPerm('quotation.update'), upsertPerm('quotation.select'),
      upsertPerm('proposal.create'), upsertPerm('proposal.send'),
      upsertPerm('proposal.accept'), upsertPerm('proposal.reject'),
    ]);

    const role = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}AGENT`,
        name: 'E2E Prop Agent',
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
          ],
        },
      },
    });

    const agent = await prisma.user.create({
      data: {
        username: `${PREFIX}agent`,
        email: `${PREFIX}agent@test.com`,
        passwordHash,
        fullName: 'E2E Prop Agent',
        roles: { create: [{ role: { connect: { id: role.id } } }] },
      },
    });
    agentId = agent.id;

    const loginRes = await http().post('/api/auth/login').send({ username: `${PREFIX}agent`, password: PASSWORD });
    agentToken = loginRes.body.data.accessToken;

    const iType = await prisma.insuranceType.findFirst({ where: { code: 'FIRE' } });
    const product = await prisma.insuranceProduct.findFirst({ where: { code: 'FIRE-001' } });
    const company = await prisma.insuranceCompany.create({
      data: { code: `${PREFIX.toUpperCase()}CO`, name: 'E2E Prop Company' },
    });

    const customer = await prisma.customer.create({
      data: { customerCode: `${PREFIX.toUpperCase()}C001`, customerType: 'INDIVIDUAL', firstName: 'Prop', lastName: 'Test' },
    });

    // Helper: create job → create quotation → record → select → ready for proposal
    async function prepareJob(grossPremium: string): Promise<string> {
      const jobRes = await http()
        .post('/api/jobs')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ customerId: customer.id, insuranceTypeId: iType!.id, productId: product!.id, agentId, effectiveDate: '2027-01-01' });
      const jId = jobRes.body.data.id;

      const quoCreate = await http()
        .post(`/api/jobs/${jId}/quotations`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ insuranceCompanyId: company.id, grossPremium, validUntil: '2027-12-31' });
      const quoId = quoCreate.body.data.id;

      const quoRec = await http()
        .put(`/api/quotations/${quoId}`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ grossPremium });
      const quoVer = quoRec.body.data.version;

      await http()
        .post(`/api/quotations/${quoId}/select`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ reason: 'เลือก', version: quoVer });

      return jId;
    }

    jobSupId = await prepareJob('50000.00');
    jobMgrId = await prepareJob('150000.00');
  });

  afterAll(async () => { await app.close(); });

  // ─── Create proposal ──────────────────────────────────────────────────────

  it('POST /jobs/:jobId/proposal — creates proposal DRAFT', async () => {
    const res = await http()
      .post(`/api/jobs/${jobSupId}/proposal`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ validUntil: '2027-06-30', remark: 'ทดสอบ' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.jobId).toBe(jobSupId);
    proposalSupId = res.body.data.id;
  });

  it('POST /jobs/:jobId/proposal — BR-006: no selected quotation → 422', async () => {
    // Create a fresh job (DRAFT) which has no selected quotation
    const iType = await prisma.insuranceType.findFirst({ where: { code: 'FIRE' } });
    const product = await prisma.insuranceProduct.findFirst({ where: { code: 'FIRE-001' } });
    const cust = await prisma.customer.findFirst({ where: { customerCode: `${PREFIX.toUpperCase()}C001` } });
    const jobRes = await http()
      .post('/api/jobs')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ customerId: cust!.id, insuranceTypeId: iType!.id, productId: product!.id, agentId, effectiveDate: '2027-01-01' });
    const bareJobId = jobRes.body.data.id;

    const res = await http()
      .post(`/api/jobs/${bareJobId}/proposal`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PROPOSAL_NO_SELECTED_QUOTATION');
  });

  // ─── Send proposal ────────────────────────────────────────────────────────

  it('POST /proposals/:id/send — transitions job to WAITING_CUSTOMER', async () => {
    // Create proposal for manager job first
    const createRes = await http()
      .post(`/api/jobs/${jobMgrId}/proposal`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ validUntil: '2027-06-30' });
    proposalMgrId = createRes.body.data.id;

    const res = await http()
      .post(`/api/proposals/${proposalSupId}/send`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('SENT');

    // Job should now be WAITING_CUSTOMER
    const jobRes = await http().get(`/api/jobs/${jobSupId}`).set('Authorization', `Bearer ${agentToken}`);
    expect(jobRes.body.data.status).toBe('WAITING_CUSTOMER');
  });

  // ─── Accept proposal — triggers Supervisor approval ───────────────────────

  it('POST /proposals/:id/accept — premium 50,000 → approval PENDING (SUPERVISOR)', async () => {
    const res = await http()
      .post(`/api/proposals/${proposalSupId}/accept`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('ACCEPTED');
    expect(res.body.data.approvals).toHaveLength(1);
    expect(res.body.data.approvals[0].approvalType).toBe('SUPERVISOR');
    expect(res.body.data.approvals[0].status).toBe('PENDING');

    const jobRes = await http().get(`/api/jobs/${jobSupId}`).set('Authorization', `Bearer ${agentToken}`);
    expect(jobRes.body.data.status).toBe('WAITING_APPROVAL');
  });

  // ─── Accept proposal — triggers Manager approval ──────────────────────────

  it('POST /proposals/:id/accept — premium 150,000 → approval PENDING (MANAGER)', async () => {
    // Send the manager proposal first
    await http().post(`/api/proposals/${proposalMgrId}/send`).set('Authorization', `Bearer ${agentToken}`);

    const res = await http()
      .post(`/api/proposals/${proposalMgrId}/accept`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('ACCEPTED');
    expect(res.body.data.approvals).toHaveLength(1);
    expect(res.body.data.approvals[0].approvalType).toBe('MANAGER');
    expect(res.body.data.approvals[0].status).toBe('PENDING');

    const jobRes = await http().get(`/api/jobs/${jobMgrId}`).set('Authorization', `Bearer ${agentToken}`);
    expect(jobRes.body.data.status).toBe('WAITING_APPROVAL');
  });

  // ─── Reject proposal — reason required ────────────────────────────────────

  it('POST /proposals/:id/reject — missing rejectReason → 422', async () => {
    // Create and send a fresh proposal
    const iType = await prisma.insuranceType.findFirst({ where: { code: 'FIRE' } });
    const product = await prisma.insuranceProduct.findFirst({ where: { code: 'FIRE-001' } });
    const cust = await prisma.customer.findFirst({ where: { customerCode: `${PREFIX.toUpperCase()}C001` } });
    const company = await prisma.insuranceCompany.findFirst({ where: { code: `${PREFIX.toUpperCase()}CO` } });

    const jobRes = await http()
      .post('/api/jobs')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ customerId: cust!.id, insuranceTypeId: iType!.id, productId: product!.id, agentId, effectiveDate: '2027-01-01' });
    const rejJobId = jobRes.body.data.id;

    const quoRes = await http()
      .post(`/api/jobs/${rejJobId}/quotations`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ insuranceCompanyId: company!.id, grossPremium: '30000.00', validUntil: '2027-12-31' });
    const quoId = quoRes.body.data.id;

    const recRes = await http()
      .put(`/api/quotations/${quoId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ grossPremium: '30000.00' });

    await http()
      .post(`/api/quotations/${quoId}/select`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ reason: 'เลือก', version: recRes.body.data.version });

    const propRes = await http()
      .post(`/api/jobs/${rejJobId}/proposal`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ validUntil: '2027-06-30' });
    const rejPropId = propRes.body.data.id;

    await http().post(`/api/proposals/${rejPropId}/send`).set('Authorization', `Bearer ${agentToken}`);

    // Reject without rejectReason → 422
    const res = await http()
      .post(`/api/proposals/${rejPropId}/reject`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({});
    expect(res.status).toBe(422);

    // Reject with valid rejectReason → 201
    const res2 = await http()
      .post(`/api/proposals/${rejPropId}/reject`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ rejectReason: 'PRICE' });
    expect(res2.status).toBe(201);
    expect(res2.body.data.status).toBe('REJECTED');
    expect(res2.body.data.rejectReason).toBe('PRICE');

    const jobFinal = await http().get(`/api/jobs/${rejJobId}`).set('Authorization', `Bearer ${agentToken}`);
    expect(jobFinal.body.data.status).toBe('CUSTOMER_REJECTED');
  });
});
