/**
 * Acceptance Flow E2E (spec §47 steps 1–21)
 *
 * Full flow: Customer → Job → Quotation Select → Proposal → Send → Accept →
 * Approve → Bind → Issue Policy → Timeline
 *
 * Setup strategy: customer + job + quotation created via Prisma/API in beforeAll,
 * then API-level tests focus on the proposal → policy flow.
 */
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_accept_';
const PASSWORD = 'E2e@Accept123';

describe('Acceptance Flow (spec §47 steps 1–21)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agentToken: string;
  let agentId: string;
  let managerToken: string;

  // All state set up in beforeAll
  let jobId: string;
  let proposalId: string;
  let approvalId: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    // ─── Cleanup ────────────────────────────────────────────────────────────
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
      await prisma.proposal.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.quotationItem.deleteMany({ where: { quotation: { jobId: { in: prevJobIds } } } });
      await prisma.quotation.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.jobStatusHistory.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.activityLog.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.document.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.job.deleteMany({ where: { id: { in: prevJobIds } } });
    }
    await prisma.insuranceCompany.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.insuranceProduct.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    // Clean up customers (both API-created and Prisma-created)
    const testUsers = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
    if (testUsers.length > 0) {
      const testUserIds = testUsers.map((u) => u.id);
      await prisma.customer.deleteMany({ where: { createdById: { in: testUserIds } } });
    }
    await prisma.customer.deleteMany({ where: { customerCode: { startsWith: PREFIX.toUpperCase() } } });
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

    // ─── Permissions & roles ────────────────────────────────────────────────
    const passwordHash = await hash(PASSWORD);

    const upsertPerm = (code: string) =>
      prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } });

    await Promise.all([
      upsertPerm('job.view'), upsertPerm('job.create'), upsertPerm('job.submit'), upsertPerm('job.update'),
      upsertPerm('customer.view'), upsertPerm('customer.create'),
      upsertPerm('quotation.create'), upsertPerm('quotation.update'), upsertPerm('quotation.select'), upsertPerm('job.view_all'),
      upsertPerm('proposal.create'), upsertPerm('proposal.send'),
      upsertPerm('proposal.accept'), upsertPerm('proposal.reject'),
      upsertPerm('approval.approve'),
      upsertPerm('policy.view'), upsertPerm('policy.create'), upsertPerm('policy.update'),
    ]);

    // Agent role (all job permissions, no approval.approve)
    const agentRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}AGENT`,
        name: 'E2E Accept Agent',
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
            { permission: { connect: { code: 'policy.view' } } },
            { permission: { connect: { code: 'policy.create' } } },
          ],
        },
      },
    });

    // Manager role (can approve)
    const managerRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}MGR`,
        name: 'E2E Accept Manager',
        permissions: {
          create: [
            { permission: { connect: { code: 'approval.approve' } } },
            { permission: { connect: { code: 'job.view_all' } } },
          ],
        },
      },
    });

    const agent = await prisma.user.create({
      data: {
        username: `${PREFIX}agent`,
        email: `${PREFIX}agent@test.com`,
        passwordHash,
        fullName: 'E2E Accept Agent',
        roles: { create: [{ role: { connect: { id: agentRole.id } } }] },
      },
    });
    agentId = agent.id;

    await prisma.user.create({
      data: {
        username: `${PREFIX}manager`,
        email: `${PREFIX}manager@test.com`,
        passwordHash,
        fullName: 'E2E Accept Manager',
        roles: { create: [{ role: { connect: { id: managerRole.id } } }] },
      },
    });

    const iType = await prisma.insuranceType.findFirst({ where: { active: true } });
    const product = await prisma.insuranceProduct.create({
      data: {
        insuranceTypeId: iType!.id,
        code: `${PREFIX.toUpperCase()}PROD`,
        name: 'E2E Accept Product',
        requireDocsOnSubmit: false,
        requireDocsOnBind: false,
      },
    });

    const company = await prisma.insuranceCompany.create({
      data: { code: `${PREFIX.toUpperCase()}CO`, name: 'E2E Accept Company' },
    });

    // Create customer directly via Prisma for deterministic cleanup
    const customer = await prisma.customer.create({
      data: {
        customerCode: `${PREFIX.toUpperCase()}C001`,
        customerType: 'INDIVIDUAL',
        firstName: 'ยอดAccept',
        lastName: 'ยิ้มAccept',
      },
    });

    // Login both users
    const agentLogin = await http().post('/api/auth/login').send({ username: `${PREFIX}agent`, password: PASSWORD });
    agentToken = agentLogin.body.data.accessToken;

    const mgrLogin = await http().post('/api/auth/login').send({ username: `${PREFIX}manager`, password: PASSWORD });
    managerToken = mgrLogin.body.data.accessToken;

    // ─── Set up Job in QUOTATION_SELECTED state via API ────────────────────
    const jobRes = await http()
      .post('/api/jobs')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ customerId: customer.id, insuranceTypeId: iType!.id, productId: product.id, agentId, effectiveDate: '2027-01-01' });

    if (jobRes.status !== 201) throw new Error(`Job creation failed: ${JSON.stringify(jobRes.body)}`);
    jobId = jobRes.body.data.id as string;

    const quoRes = await http()
      .post(`/api/jobs/${jobId}/quotations`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ insuranceCompanyId: company.id, grossPremium: '50000.00', validUntil: '2027-12-31' });

    if (quoRes.status !== 201) throw new Error(`Quotation creation failed: ${JSON.stringify(quoRes.body)}`);
    const quotationId = quoRes.body.data.id as string;

    const recRes = await http()
      .put(`/api/quotations/${quotationId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ grossPremium: '48000.00', quotationDate: '2026-10-01', validUntil: '2027-12-31' });

    if (recRes.status !== 200) throw new Error(`Quotation record failed: ${JSON.stringify(recRes.body)}`);
    const quoVersion = recRes.body.data.version as number;

    const selRes = await http()
      .post(`/api/quotations/${quotationId}/select`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ reason: 'ราคาดีที่สุด', version: quoVersion });

    if (selRes.status !== 201) throw new Error(`Quotation select failed: ${JSON.stringify(selRes.body)}`);
  });

  afterAll(async () => { await app.close(); });

  // ─── Step 1: Login ─────────────────────────────────────────────────────────

  it('Step 1: Login — both users receive access tokens', () => {
    expect(agentToken).toBeTruthy();
    expect(managerToken).toBeTruthy();
  });

  // ─── Step 2: Job in QUOTATION_SELECTED ────────────────────────────────────

  it('Step 2: Job is in QUOTATION_SELECTED state after setup', async () => {
    const res = await http().get(`/api/jobs/${jobId}`).set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('QUOTATION_SELECTED');
  });

  // ─── Step 16: Create Proposal ─────────────────────────────────────────────

  it('Step 16: Create Proposal (DRAFT)', async () => {
    const res = await http()
      .post(`/api/jobs/${jobId}/proposal`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ validUntil: '2027-06-30', remark: 'ใบเสนอ acceptance test' });

    expect(res.status, `Job ${jobId} proposal create failed: ${JSON.stringify(res.body)}`).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.proposalNo).toMatch(/^PP-\d{4}-\d+$/);
    proposalId = res.body.data.id;
  });

  // ─── Step 17: Send Proposal ────────────────────────────────────────────────

  it('Step 17: Send Proposal → WAITING_CUSTOMER', async () => {
    const res = await http()
      .post(`/api/proposals/${proposalId}/send`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('SENT');

    const jobRes = await http().get(`/api/jobs/${jobId}`).set('Authorization', `Bearer ${agentToken}`);
    expect(jobRes.body.data.status).toBe('WAITING_CUSTOMER');
  });

  // ─── Step 18: Customer Accept → creates PENDING approval ──────────────────

  it('Step 18: Customer Accept Proposal → WAITING_APPROVAL', async () => {
    const res = await http()
      .post(`/api/proposals/${proposalId}/accept`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('ACCEPTED');
    expect(res.body.data.approvals.length).toBeGreaterThanOrEqual(1);
    approvalId = res.body.data.approvals[0].id;

    const jobRes = await http().get(`/api/jobs/${jobId}`).set('Authorization', `Bearer ${agentToken}`);
    expect(jobRes.body.data.status).toBe('WAITING_APPROVAL');
  });

  // ─── Step 19: Approval by Manager ─────────────────────────────────────────

  it('Step 19: Manager approves → job APPROVED', async () => {
    // Manager is a different user from the requesting agent — satisfies self-approve prevention
    const res = await http()
      .post(`/api/approvals/${approvalId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: 'ราคาสมเหตุสมผล' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('APPROVED');

    const jobRes = await http().get(`/api/jobs/${jobId}`).set('Authorization', `Bearer ${agentToken}`);
    expect(jobRes.body.data.status).toBe('APPROVED');
  });

  // ─── Step 20: Binding ──────────────────────────────────────────────────────

  it('Step 20: All preconditions met — Bind → POLICY_PENDING', async () => {
    const precRes = await http()
      .get(`/api/jobs/${jobId}/bind/preconditions`)
      .set('Authorization', `Bearer ${agentToken}`);
    expect(precRes.status).toBe(200);

    const allMet = (precRes.body.data as Array<{ met: boolean }>).every((c) => c.met);
    expect(allMet).toBe(true);

    const bindRes = await http()
      .post(`/api/jobs/${jobId}/bind`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ remark: 'bind acceptance test' });

    expect(bindRes.status).toBe(201);
    expect(bindRes.body.data.jobId).toBe(jobId);

    const jobRes = await http().get(`/api/jobs/${jobId}`).set('Authorization', `Bearer ${agentToken}`);
    expect(jobRes.body.data.status).toBe('POLICY_PENDING');
  });

  // ─── Step 21: Issue Policy ─────────────────────────────────────────────────

  it('Step 21: Issue Policy → POLICY_ISSUED with policyNo', async () => {
    const res = await http()
      .post(`/api/jobs/${jobId}/policy`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ remark: 'policy acceptance test' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('ISSUED');
    expect(res.body.data.policyNo).toMatch(/^PL-\d{4}-\d+$/);
    expect(res.body.data.netPremium).toBeTruthy();

    const jobRes = await http().get(`/api/jobs/${jobId}`).set('Authorization', `Bearer ${agentToken}`);
    expect(jobRes.body.data.status).toBe('POLICY_ISSUED');
  });

  // ─── Step 25: Activity Timeline ───────────────────────────────────────────

  it('Step 25: Activity timeline records status milestones', async () => {
    const res = await http()
      .get(`/api/jobs/${jobId}/activities`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    const statusChanges = (res.body.data.items as Array<{ type: string; data: { toStatus?: string } }>)
      .filter((a) => a.type === 'STATUS_CHANGE')
      .map((a) => a.data.toStatus);

    // Key milestones in timeline (no QUOTATION_REQUESTED since job was never submitted — quotation created on DRAFT job)
    expect(statusChanges).toContain('QUOTATION_SELECTED');
    expect(statusChanges).toContain('WAITING_CUSTOMER');
    expect(statusChanges).toContain('WAITING_APPROVAL');
    expect(statusChanges).toContain('APPROVED');
    expect(statusChanges).toContain('POLICY_PENDING');
    expect(statusChanges).toContain('POLICY_ISSUED');
  });

  // ─── Policy retrievable via list endpoint ─────────────────────────────────

  it('Policy is retrievable via GET /policies?jobId=', async () => {
    const res = await http()
      .get(`/api/policies?jobId=${jobId}`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].policyNo).toMatch(/^PL-\d{4}-\d+$/);
  });
});
