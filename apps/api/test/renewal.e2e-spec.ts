/**
 * Renewal API E2E
 *
 * - GET /renewals → list
 * - POST /policies/:policyId/renew → creates new job, renewal record, transitions old job → RENEWAL
 * - Idempotency: calling runDailyRenewalCheck twice must not create duplicate renewal records
 * - 403 without permission
 * - 409 when renewal already exists for policy
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { RenewalService } from '../src/modules/renewal/renewal.service.js';

const PREFIX = 'e2e_ren_';
const PASSWORD = 'E2e@Ren123';

describe('Renewal API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let renewalService: RenewalService;
  let renewerToken: string;
  let viewerToken: string;
  let policyId: string;
  let jobId: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    renewalService = app.get(RenewalService);

    // ─── Cleanup ─────────────────────────────────────────────────────────────
    const prevJobs = await prisma.job.findMany({
      where: { agent: { username: { startsWith: PREFIX } } },
      select: { id: true },
    });
    const prevJobIds = prevJobs.map((j) => j.id);
    if (prevJobIds.length > 0) {
      await prisma.renewal.deleteMany({ where: { previousPolicy: { jobId: { in: prevJobIds } } } });
      await prisma.renewal.deleteMany({ where: { newJob: { id: { in: prevJobIds } } } });
      await prisma.task.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.policyCoverage.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.payment.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.policy.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.binding.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.quotationItem.deleteMany({ where: { quotation: { jobId: { in: prevJobIds } } } });
      await prisma.quotation.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.jobStatusHistory.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.activityLog.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.job.deleteMany({ where: { id: { in: prevJobIds } } });
    }
    await prisma.insuranceCompany.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.insuranceProduct.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.customer.deleteMany({ where: { customerCode: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });

    // Advance JOB sequence
    const curYear = new Date().getFullYear();
    type MaxRow = [{ max: number | null }];
    const [jobR] = await prisma.$queryRaw<MaxRow>`SELECT MAX(CAST(SPLIT_PART(job_no, '-', 3) AS INTEGER)) as max FROM jobs WHERE job_no LIKE ${`JOB-${curYear}-%`}`;
    const jobSafe = (Number(jobR.max ?? 0)) + 50;
    await prisma.$executeRaw`
      INSERT INTO document_sequences (prefix, year, last_value, updated_at) VALUES ('JOB', ${curYear}, ${jobSafe}, now())
      ON CONFLICT (prefix, year) DO UPDATE SET last_value = GREATEST(document_sequences.last_value, EXCLUDED.last_value), updated_at = now()
    `;

    // ─── Permissions ─────────────────────────────────────────────────────────
    const passwordHash = await hash(PASSWORD);
    const upsertPerm = (code: string) =>
      prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } });

    await Promise.all([
      upsertPerm('renewal.view'),
      upsertPerm('renewal.create'),
      upsertPerm('policy.view'),
    ]);

    const renewerRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}RENEWER`,
        name: 'E2E Renewal Renewer',
        permissions: {
          create: [
            { permission: { connect: { code: 'renewal.view' } } },
            { permission: { connect: { code: 'renewal.create' } } },
            { permission: { connect: { code: 'policy.view' } } },
          ],
        },
      },
    });

    const viewerRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}VIEWER`,
        name: 'E2E Renewal Viewer',
        permissions: {
          create: [
            { permission: { connect: { code: 'renewal.view' } } },
          ],
        },
      },
    });

    const renewer = await prisma.user.create({
      data: {
        username: `${PREFIX}renewer`,
        email: `${PREFIX}renewer@test.com`,
        passwordHash,
        fullName: 'E2E Renewer',
        roles: { create: [{ role: { connect: { id: renewerRole.id } } }] },
      },
    });

    await prisma.user.create({
      data: {
        username: `${PREFIX}viewer`,
        email: `${PREFIX}viewer@test.com`,
        passwordHash,
        fullName: 'E2E Renewal Viewer',
        roles: { create: [{ role: { connect: { id: viewerRole.id } } }] },
      },
    });

    // ─── Create policy directly via Prisma ───────────────────────────────────
    const iType = await prisma.insuranceType.findFirst({ where: { active: true } });
    const product = await prisma.insuranceProduct.create({
      data: {
        insuranceTypeId: iType!.id,
        code: `${PREFIX.toUpperCase()}PROD`,
        name: 'E2E Renewal Product',
        requireDocsOnSubmit: false,
        requireDocsOnBind: false,
      },
    });
    const company = await prisma.insuranceCompany.create({
      data: { code: `${PREFIX.toUpperCase()}CO`, name: 'E2E Renewal Company' },
    });
    const customer = await prisma.customer.create({
      data: {
        customerCode: `${PREFIX.toUpperCase()}C001`,
        customerType: 'INDIVIDUAL',
        firstName: 'ทดสอบ',
        lastName: 'ต่ออายุ',
      },
    });

    const job = await prisma.job.create({
      data: {
        jobNo: `JOB-RENTEST-001`,
        insuranceTypeId: iType!.id,
        productId: product.id,
        customerId: customer.id,
        agentId: renewer.id,
        effectiveDate: new Date('2026-01-01'),
        expiryDate: new Date('2027-01-01'),
        status: 'POLICY_ISSUED',
        version: 1,
      },
    });
    jobId = job.id;

    const quotation = await prisma.quotation.create({
      data: {
        quotationNo: 'QT-RENTEST-001',
        jobId: job.id,
        insuranceCompanyId: company.id,
        grossPremium: '5000.00',
        netPremium: '5000.00',
        totalAmount: '5000.00',
        status: 'SELECTED',
        version: 1,
      },
    });

    const policy = await prisma.policy.create({
      data: {
        policyNo: 'PL-RENTEST-001',
        jobId: job.id,
        quotationId: quotation.id,
        insuranceCompanyId: company.id,
        effectiveDate: new Date('2026-01-01'),
        expiryDate: new Date('2027-01-01'),
        grossPremium: '5000.00',
        netPremium: '5000.00',
        totalPremium: '5000.00',
        status: 'ISSUED',
        version: 1,
      },
    });
    policyId = policy.id;

    // Login
    const renewerLogin = await http().post('/api/auth/login').send({ username: `${PREFIX}renewer`, password: PASSWORD });
    renewerToken = renewerLogin.body.data.accessToken;

    const viewerLogin = await http().post('/api/auth/login').send({ username: `${PREFIX}viewer`, password: PASSWORD });
    viewerToken = viewerLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Tests ──────────────────────────────────────────────────────────────────

  it('R1: GET /renewals → 200 with list', async () => {
    const res = await http()
      .get('/api/renewals')
      .set('Authorization', `Bearer ${renewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('items');
  });

  it('R2: GET /renewals without token → 401', async () => {
    const res = await http().get('/api/renewals');
    expect(res.status).toBe(401);
  });

  it('R3: POST /policies/:id/renew without renewal.create → 403', async () => {
    const res = await http()
      .post(`/api/policies/${policyId}/renew`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);
  });

  it('R4: POST /policies/:id/renew → 201, creates new job and renewal (BR-013)', async () => {
    const res = await http()
      .post(`/api/policies/${policyId}/renew`)
      .set('Authorization', `Bearer ${renewerToken}`);
    expect(res.status).toBe(201);
    expect(res.body.data.previousPolicyId).toBe(policyId);
    expect(res.body.data.newJobId).toBeTruthy();
    expect(res.body.data.status).toBe('IN_PROGRESS');

    // Verify original job transitioned to RENEWAL
    const oldJob = await prisma.job.findFirst({ where: { id: jobId } });
    expect(oldJob?.status).toBe('RENEWAL');

    // Verify new job links back to previous policy (BR-013)
    const newJob = await prisma.job.findFirst({ where: { id: res.body.data.newJobId } });
    expect(newJob?.previousPolicyId).toBe(policyId);
  });

  it('R5: POST /policies/:id/renew again → 409 duplicate renewal', async () => {
    const res = await http()
      .post(`/api/policies/${policyId}/renew`)
      .set('Authorization', `Bearer ${renewerToken}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RENEWAL_ALREADY_EXISTS');
  });

  it('R6: GET /renewals → list includes the new renewal', async () => {
    const res = await http()
      .get('/api/renewals')
      .set('Authorization', `Bearer ${renewerToken}`);
    expect(res.status).toBe(200);
    const items: { previousPolicyId: string }[] = res.body.data.items;
    const found = items.some((r) => r.previousPolicyId === policyId);
    expect(found).toBe(true);
  });

  it('R7: runDailyRenewalCheck idempotency — running twice must not create duplicate renewals', async () => {
    // Create a policy expiring in 30 days (within threshold)
    const iType = await prisma.insuranceType.findFirst({ where: { active: true } });
    const product = await prisma.insuranceProduct.findFirst({ where: { code: `${PREFIX.toUpperCase()}PROD` } });
    const company = await prisma.insuranceCompany.findFirst({ where: { code: `${PREFIX.toUpperCase()}CO` } });
    const customer = await prisma.customer.findFirst({ where: { customerCode: `${PREFIX.toUpperCase()}C001` } });
    const renewer = await prisma.user.findFirst({ where: { username: `${PREFIX}renewer` } });

    const target = new Date();
    target.setDate(target.getDate() + 30);

    const job = await prisma.job.create({
      data: {
        jobNo: `JOB-RENTEST-IDEM`,
        insuranceTypeId: iType!.id,
        productId: product!.id,
        customerId: customer!.id,
        agentId: renewer!.id,
        effectiveDate: new Date(target.getTime() - 365 * 24 * 60 * 60 * 1000),
        expiryDate: target,
        status: 'POLICY_ISSUED',
        version: 1,
      },
    });

    const quotation = await prisma.quotation.create({
      data: {
        quotationNo: 'QT-RENTEST-IDEM',
        jobId: job.id,
        insuranceCompanyId: company!.id,
        grossPremium: '3000.00',
        netPremium: '3000.00',
        totalAmount: '3000.00',
        status: 'SELECTED',
        version: 1,
      },
    });

    await prisma.policy.create({
      data: {
        policyNo: 'PL-RENTEST-IDEM',
        jobId: job.id,
        quotationId: quotation.id,
        insuranceCompanyId: company!.id,
        effectiveDate: new Date(target.getTime() - 365 * 24 * 60 * 60 * 1000),
        expiryDate: target,
        grossPremium: '3000.00',
        netPremium: '3000.00',
        totalPremium: '3000.00',
        status: 'ISSUED',
        version: 1,
      },
    });

    // Run daily check twice
    await renewalService.runDailyRenewalCheck();
    await renewalService.runDailyRenewalCheck();

    // Should only have 1 renewal for this policy
    const renewals = await prisma.renewal.findMany({
      where: { previousPolicy: { jobId: job.id } },
    });
    expect(renewals).toHaveLength(1);
  });
});
