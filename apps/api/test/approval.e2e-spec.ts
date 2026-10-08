import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_appr_';
const PASSWORD = 'E2e@Appr123';

describe('Approval API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agentToken: string;
  let agentId: string;
  let managerToken: string;
  let managerId: string;

  let approvalSupId: string;  // SUPERVISOR-type approval
  let approvalMgrId: string;  // MANAGER-type approval
  let customerId: string;
  let insuranceTypeId: string;
  let productId: string;
  let companyId: string;
  let passwordHash: string;

  const http = () => request(app.getHttpServer());

  async function prepareApproval(grossPremium: string): Promise<{ approvalId: string; jobId: string }> {
    const jobRes = await http()
      .post('/api/jobs')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ customerId, insuranceTypeId, productId, agentId, effectiveDate: '2027-01-01' });
    const jId = jobRes.body.data.id;

    const quoRes = await http()
      .post(`/api/jobs/${jId}/quotations`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ insuranceCompanyId: companyId, grossPremium, validUntil: '2027-12-31' });
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

    return {
      approvalId: acceptRes.body.data.approvals[0].id as string,
      jobId: jId,
    };
  }

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

    passwordHash = await hash(PASSWORD);

    const upsertPerm = (code: string) =>
      prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } });
    await Promise.all([
      upsertPerm('job.view'), upsertPerm('job.create'), upsertPerm('customer.view'),
      upsertPerm('quotation.create'), upsertPerm('quotation.update'), upsertPerm('quotation.select'), upsertPerm('job.view_all'),
      upsertPerm('proposal.create'), upsertPerm('proposal.send'),
      upsertPerm('proposal.accept'), upsertPerm('proposal.reject'),
      upsertPerm('approval.approve'),
      upsertPerm('approval.approve_own'),
    ]);

    // AGENT role — no approval.approve
    const agentRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}AGENT`,
        name: 'E2E Appr Agent',
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

    // MANAGER role — has approval.approve and job.view_all
    const managerRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}MANAGER`,
        name: 'E2E Appr Manager',
        permissions: {
          create: [
            { permission: { connect: { code: 'job.view' } } },
            { permission: { connect: { code: 'job.view_all' } } },
            { permission: { connect: { code: 'approval.approve' } } },
          ],
        },
      },
    });

    const agent = await prisma.user.create({
      data: {
        username: `${PREFIX}agent`,
        email: `${PREFIX}agent@test.com`,
        passwordHash,
        fullName: 'E2E Appr Agent',
        roles: { create: [{ role: { connect: { id: agentRole.id } } }] },
      },
    });
    agentId = agent.id;

    const manager = await prisma.user.create({
      data: {
        username: `${PREFIX}manager`,
        email: `${PREFIX}manager@test.com`,
        passwordHash,
        fullName: 'E2E Appr Manager',
        roles: { create: [{ role: { connect: { id: managerRole.id } } }] },
      },
    });
    managerId = manager.id;

    const [agentLogin, managerLogin] = await Promise.all([
      http().post('/api/auth/login').send({ username: `${PREFIX}agent`, password: PASSWORD }),
      http().post('/api/auth/login').send({ username: `${PREFIX}manager`, password: PASSWORD }),
    ]);
    agentToken = agentLogin.body.data.accessToken;
    managerToken = managerLogin.body.data.accessToken;

    const iType = await prisma.insuranceType.findFirst({ where: { code: 'FIRE' } });
    insuranceTypeId = iType!.id;
    const product = await prisma.insuranceProduct.findFirst({ where: { code: 'FIRE-001' } });
    productId = product!.id;
    const company = await prisma.insuranceCompany.create({
      data: { code: `${PREFIX.toUpperCase()}CO`, name: 'E2E Appr Company' },
    });
    companyId = company.id;
    const customer = await prisma.customer.create({
      data: { customerCode: `${PREFIX.toUpperCase()}C001`, customerType: 'INDIVIDUAL', firstName: 'Appr', lastName: 'Test' },
    });
    customerId = customer.id;

    const prepSup = await prepareApproval('50000.00');   // SUPERVISOR-type
    approvalSupId = prepSup.approvalId;
    const prepMgr = await prepareApproval('150000.00');  // MANAGER-type
    approvalMgrId = prepMgr.approvalId;
  });

  afterAll(async () => { await app.close(); });

  // ─── GET /approvals (inbox) ────────────────────────────────────────────────

  it('GET /approvals — AGENT (no approval.approve) → 403', async () => {
    const res = await http()
      .get('/api/approvals')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(403);
  });

  it('GET /approvals — MANAGER sees PENDING approvals', async () => {
    const res = await http()
      .get('/api/approvals')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
    // Should include both approvals created in setup
    const ids = res.body.data.map((a: { id: string }) => a.id);
    expect(ids).toContain(approvalSupId);
    expect(ids).toContain(approvalMgrId);
  });

  it('canDecide flag in /api/approvals and proposals (requester = false, approver = true)', async () => {
    const inbox = await http().get('/api/approvals?status=PENDING').set('Authorization', `Bearer ${managerToken}`);
    const supItem = inbox.body.data.find((a: { id: string }) => a.id === approvalSupId);
    expect(supItem.canDecide).toBe(true);

    const appSup = await prisma.approval.findUnique({ where: { id: approvalSupId } });
    const agentRes = await http().get(`/api/jobs/${appSup!.jobId}/proposals`).set('Authorization', `Bearer ${agentToken}`);
    const agentAppr = agentRes.body.data[0].approvals.find((a: { id: string }) => a.id === approvalSupId);
    expect(agentAppr.canDecide).toBe(false);

    const mgrRes = await http().get(`/api/jobs/${appSup!.jobId}/proposals`).set('Authorization', `Bearer ${managerToken}`);
    const mgrAppr = mgrRes.body.data[0].approvals.find((a: { id: string }) => a.id === approvalSupId);
    expect(mgrAppr.canDecide).toBe(true);
  });

  it('allowedActions of MANAGER who is not the job owner contains "approve" when WAITING_APPROVAL', async () => {
    const appSup = await prisma.approval.findUnique({ where: { id: approvalSupId } });
    const res = await http().get(`/api/jobs/${appSup!.jobId}`).set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.allowedActions).toContain('approve');
  });

  it('POST /approvals/:id/approve — self-approval without approval.approve_own → 422', async () => {
    await prisma.approval.update({
      where: { id: approvalSupId },
      data: { requestedById: managerId },
    });

    const res = await http()
      .post(`/api/approvals/${approvalSupId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: 'Self approve attempt' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('APPROVAL_SELF_APPROVE');

    // Restore requestedById to agentId
    await prisma.approval.update({
      where: { id: approvalSupId },
      data: { requestedById: agentId },
    });
  });

  it('POST /approvals/:id/approve — user WITH approval.approve_own can self-approve → 201', async () => {
    const adminRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}ADMIN`,
        name: 'E2E Appr Admin',
        permissions: {
          create: [
            { permission: { connect: { code: 'job.view' } } },
            { permission: { connect: { code: 'job.view_all' } } },
            { permission: { connect: { code: 'approval.approve' } } },
            { permission: { connect: { code: 'approval.approve_own' } } },
          ],
        },
      },
    });

    const adminUser = await prisma.user.create({
      data: {
        username: `${PREFIX}admin_self`,
        email: `${PREFIX}admin_self@test.com`,
        fullName: 'Admin Self Appr',
        passwordHash,
        roles: { create: [{ roleId: adminRole.id }] },
      },
    });

    const adminLogin = await http().post('/api/auth/login').send({ username: `${PREFIX}admin_self`, password: PASSWORD });
    const adminToken = adminLogin.body.data.accessToken;

    const { approvalId: ownApprId } = await prepareApproval('40000.00');
    await prisma.approval.update({
      where: { id: ownApprId },
      data: { requestedById: adminUser.id },
    });

    const res = await http()
      .post(`/api/approvals/${ownApprId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Admin self-approval allowed' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('APPROVED');
  });

  it('MANAGER approve → job status becomes APPROVED', async () => {
    const res = await http()
      .post(`/api/approvals/${approvalSupId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: 'อนุมัติ' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('APPROVED');
    expect(res.body.data.approverId).toBe(managerId);
    expect(res.body.data.reason).toBe('อนุมัติ');
    // The job for approvalSupId should now be APPROVED
    // Find it via approval record
    const approvalRec = await http()
      .get('/api/approvals?status=APPROVED')
      .set('Authorization', `Bearer ${managerToken}`);
    const approved = approvalRec.body.data.find((a: { id: string }) => a.id === approvalSupId);
    expect(approved).toBeDefined();

    // Fetch job to check status
    const jobId = approved.jobId;
    const jobRes = await http().get(`/api/jobs/${jobId}`).set('Authorization', `Bearer ${agentToken}`);
    expect(jobRes.body.data.status).toBe('APPROVED');
  });

  // ─── POST /approvals/:id/reject ───────────────────────────────────────────

  it('POST /approvals/:id/reject — missing reason → 422', async () => {
    const res = await http()
      .post(`/api/approvals/${approvalMgrId}/reject`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({});
    expect(res.status).toBe(422);
  });

  it('POST /approvals/:id/reject — MANAGER rejects with reason → 201, job stays WAITING_APPROVAL', async () => {
    // First verify job is WAITING_APPROVAL
    const approvalRec = await http()
      .get('/api/approvals?status=PENDING')
      .set('Authorization', `Bearer ${managerToken}`);
    const pending = approvalRec.body.data.find((a: { id: string }) => a.id === approvalMgrId);
    expect(pending).toBeDefined();
    const jobId = pending.jobId;

    const res = await http()
      .post(`/api/approvals/${approvalMgrId}/reject`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: 'เงื่อนไขยังไม่ครบ' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('REJECTED');
    expect(res.body.data.reason).toBe('เงื่อนไขยังไม่ครบ');

    // Q4: job stays at WAITING_APPROVAL after approval rejection
    const jobRes = await http().get(`/api/jobs/${jobId}`).set('Authorization', `Bearer ${agentToken}`);
    expect(jobRes.body.data.status).toBe('WAITING_APPROVAL');
  });

  it('POST /approvals/:id/reject — already rejected → 409', async () => {
    const res = await http()
      .post(`/api/approvals/${approvalMgrId}/reject`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: 'ซ้ำ' });
    expect(res.status).toBe(409);
  });
});
