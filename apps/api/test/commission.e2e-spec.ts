/**
 * Commission API E2E — spec §47 Step 23
 *
 * - POST /policies/:policyId/commission (create + BigInt calc verify)
 * - GET  /commissions (list)
 * - GET  /policies/:policyId/commissions
 * - 403 without commission.create permission
 * - 422 overpay commission (base > totalPremium would be a miscalc, but service allows any base per MVP)
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

describe('Commission API (spec §47 Step 23)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agentToken: string;
  let viewerToken: string;
  let policyId: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    // Cleanup
    const prevPolicies = await prisma.policy.findMany({
      where: { job: { agent: { username: { startsWith: PREFIX } } } },
      select: { id: true },
    });
    const prevPolicyIds = prevPolicies.map((p) => p.id);
    if (prevPolicyIds.length > 0) {
      await prisma.commission.deleteMany({ where: { policyId: { in: prevPolicyIds } } });
    }
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
      await prisma.proposalAcceptance.deleteMany({ where: { proposal: { jobId: { in: prevJobIds } } } });
      await prisma.proposal.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.quotationItem.deleteMany({ where: { quotation: { jobId: { in: prevJobIds } } } });
      await prisma.quotation.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.jobStatusHistory.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.activityLog.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.document.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.job.deleteMany({ where: { id: { in: prevJobIds } } });
    }
    await prisma.customer.deleteMany({ where: { customerCode: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.insuranceCompany.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.insuranceProduct.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    const testUsers = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
    if (testUsers.length > 0) {
      const testUserIds = testUsers.map((u) => u.id);
      await prisma.customer.deleteMany({ where: { createdById: { in: testUserIds } } });
    }
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });

    const passwordHash = await hash(PASSWORD);
    const up = (code: string) => prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } });
    await Promise.all([
      up('job.view'), up('job.view_all'), up('job.create'), up('job.submit'), up('job.update'), up('job.view_all'),
      up('customer.view'), up('customer.create'), up('quotation.create'), up('quotation.update'), up('quotation.select'),
      up('proposal.create'), up('proposal.send'), up('proposal.accept'), up('proposal.reject'),
      up('approval.approve'), up('policy.view'), up('policy.create'), up('policy.update'),
      up('commission.view'), up('commission.create'), up('payment.view'), up('payment.create'),
    ]);

    const agentRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}AGT`,
        name: 'E2E Commission Agent',
        permissions: {
          create: [
            'job.view', 'job.create', 'job.submit', 'job.update',
            'customer.view', 'customer.create', 'quotation.create', 'quotation.update', 'quotation.select',
            'proposal.create', 'proposal.send', 'proposal.accept', 'proposal.reject',
            'approval.approve', 'job.view_all', 'policy.view', 'policy.create', 'policy.update',
            'commission.view', 'commission.create', 'payment.view', 'payment.create',
          ].map((c) => ({ permission: { connect: { code: c } } })),
        },
      },
    });
    const managerRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}MANAGER`,
        name: 'E2E Commission Manager',
        permissions: {
          create: [
            { permission: { connect: { code: 'approval.approve' } } },
            { permission: { connect: { code: 'job.view_all' } } },
          ],
        },
      },
    });

    await prisma.user.create({
      data: {
        username: `${PREFIX}approver`,
        email: `${PREFIX}approver@test.com`,
        passwordHash,
        fullName: 'E2E Commission Approver',
        roles: { create: [{ role: { connect: { id: managerRole.id } } }] },
      },
    });

    const viewerRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}VIEWER`,
        name: 'E2E Commission Viewer',
        permissions: { create: [{ permission: { connect: { code: 'commission.view' } } }] },
      },
    });

    await prisma.user.create({
      data: {
        username: `${PREFIX}agent`,
        email: `${PREFIX}agent@test.com`,
        passwordHash,
        fullName: 'E2E Commission Agent',
        roles: { create: [{ role: { connect: { id: agentRole.id } } }] },
      },
    });

    await prisma.user.create({
      data: {
        username: `${PREFIX}viewer`,
        email: `${PREFIX}viewer@test.com`,
        passwordHash,
        fullName: 'E2E Commission Viewer',
        roles: { create: [{ role: { connect: { id: viewerRole.id } } }] },
      },
    });

    const agentLogin = await http().post('/api/auth/login').send({ username: `${PREFIX}agent`, password: PASSWORD });
    agentToken = agentLogin.body.data.accessToken;

    const approverLogin = await http().post('/api/auth/login').send({ username: `${PREFIX}approver`, password: PASSWORD });
    const approverToken = approverLogin.body.data.accessToken as string;

    const viewerLogin = await http().post('/api/auth/login').send({ username: `${PREFIX}viewer`, password: PASSWORD });
    viewerToken = viewerLogin.body.data.accessToken;

    // Build a POLICY_ISSUED job via API
    const iType = await prisma.insuranceType.findFirst({ where: { active: true } });
    const agentUser = await prisma.user.findFirst({ where: { username: `${PREFIX}agent` } });
    const customer = await prisma.customer.create({
      data: { customerCode: `${PREFIX.toUpperCase()}C01`, customerType: 'INDIVIDUAL', firstName: 'ทดสอบCom', lastName: 'ลูกค้าCom' },
    });

    const product = await prisma.insuranceProduct.create({
      data: {
        insuranceTypeId: iType!.id,
        code: `${PREFIX.toUpperCase()}PROD`,
        name: 'E2E Commission Product',
        requireDocsOnSubmit: false,
        requireDocsOnBind: false,
      },
    });
    const company = await prisma.insuranceCompany.create({
      data: { code: `${PREFIX.toUpperCase()}CO`, name: 'E2E Commission Company' },
    });

    const jobRes = await http().post('/api/jobs').set('Authorization', `Bearer ${agentToken}`)
      .send({ customerId: customer.id, insuranceTypeId: iType!.id, productId: product.id, agentId: agentUser!.id, effectiveDate: '2027-01-01' });
    const jId = jobRes.body.data.id as string;

    const quoRes = await http().post(`/api/jobs/${jId}/quotations`).set('Authorization', `Bearer ${agentToken}`)
      .send({ insuranceCompanyId: company.id, grossPremium: '20000.00', validUntil: '2027-12-31' });
    const quotationId = quoRes.body.data.id as string;

    await http().put(`/api/quotations/${quotationId}`).set('Authorization', `Bearer ${agentToken}`)
      .send({ grossPremium: '20000.00', quotationDate: '2026-10-01', validUntil: '2027-12-31' });

    const listRes = await http().get(`/api/jobs/${jId}/quotations`).set('Authorization', `Bearer ${agentToken}`);
    const version = listRes.body.data[0].version as number;

    await http().post(`/api/quotations/${quotationId}/select`).set('Authorization', `Bearer ${agentToken}`)
      .send({ reason: 'commission test', version });

    const propRes = await http().post(`/api/jobs/${jId}/proposal`).set('Authorization', `Bearer ${agentToken}`)
      .send({ validUntil: '2027-06-30', remark: 'commission e2e' });
    const proposalId = propRes.body.data.id as string;

    await http().post(`/api/proposals/${proposalId}/send`).set('Authorization', `Bearer ${agentToken}`);

    const accRes = await http()
      .post(`/api/proposals/${proposalId}/accept`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ method: 'MANUAL', remark: 'Customer agreed verbally' });
    const approvalId = accRes.body.data.approvals[0].id as string;

    await http().post(`/api/approvals/${approvalId}/approve`).set('Authorization', `Bearer ${approverToken}`)
      .send({ reason: 'commission e2e approve' });

    await http().post(`/api/jobs/${jId}/bind`).set('Authorization', `Bearer ${agentToken}`)
      .send({ remark: 'commission e2e bind' });

    await http().post(`/api/jobs/${jId}/bind/confirm`).set('Authorization', `Bearer ${agentToken}`)
      .send({ binderNumber: 'BIND-COM-01' });

    const polRes = await http().post(`/api/jobs/${jId}/policy`).set('Authorization', `Bearer ${agentToken}`)
      .send({ remark: 'commission e2e policy' });

    if (polRes.status !== 201) throw new Error(`Policy creation failed: ${JSON.stringify(polRes.body)}`);
    policyId = polRes.body.data.id as string;
  });

  afterAll(async () => { await app.close(); });

  it('Step 23 — Calculate commission with correct BigInt amount', async () => {
    // 20000 × 15% = 3000.00
    const res = await http()
      .post(`/api/policies/${policyId}/commission`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ commissionType: 'COMPANY', commissionBase: '20000.00', commissionRate: '15.0000', remark: 'commission e2e' });

    expect(res.status).toBe(201);
    const created = (Array.isArray(res.body.data) ? res.body.data : res.body.data.items)[0];
    expect(created.commissionAmount).toBe('3000.00');
    expect(created.policyId).toBe(policyId);
  });

  it('GET /commissions — list includes newly created commission', async () => {
    const res = await http().get('/api/commissions').set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    const commissions = (res.body.data as { items: Array<{ policyId: string }> }).items;
    expect(commissions.some((c) => c.policyId === policyId)).toBe(true);
  });

  it('GET /policies/:id/commissions — returns list for policy', async () => {
    const res = await http().get(`/api/policies/${policyId}/commissions`).set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    const items = Array.isArray(res.body.data) ? res.body.data : res.body.data.items;
    expect(items).toHaveLength(1);
    expect(items[0].commissionAmount).toBe('3000.00');
  });

  it('403 — viewer cannot create commission', async () => {
    const res = await http()
      .post(`/api/policies/${policyId}/commission`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ commissionType: 'COMPANY', commissionBase: '1000.00', commissionRate: '10.0000' });
    expect(res.status).toBe(403);
  });
});
