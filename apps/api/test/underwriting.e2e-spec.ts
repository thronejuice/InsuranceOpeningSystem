import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_uw_';
const PASSWORD = 'E2e@Uw123';

describe('Underwriting API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agentToken: string;
  let agentId: string;
  let underwriterToken: string;
  let jobId: string;
  let jobIdReject: string;
  let companyId: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    // Cleanup previous runs
    const prevJobs = await prisma.job.findMany({ where: { agent: { username: { startsWith: PREFIX } } }, select: { id: true } });
    const prevJobIds = prevJobs.map((j) => j.id);
    if (prevJobIds.length > 0) {
      await prisma.underwriting.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.quotationItem.deleteMany({ where: { quotation: { jobId: { in: prevJobIds } } } });
      await prisma.quotation.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.jobStatusHistory.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.activityLog.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.document.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.task.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.job.deleteMany({ where: { id: { in: prevJobIds } } });
    }
    await prisma.insuranceProduct.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.insuranceCompany.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.customer.deleteMany({ where: { customerCode: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });

    const passwordHash = await hash(PASSWORD);

    const upsertPerm = (code: string) =>
      prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } });

    await Promise.all([
      upsertPerm('job.view'), upsertPerm('job.create'), upsertPerm('job.update'), upsertPerm('job.submit'),
      upsertPerm('customer.view'), upsertPerm('quotation.create'), upsertPerm('underwriting.review'),
    ]);

    const agentRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}AGENT`,
        name: 'E2E UW Agent',
        permissions: {
          create: [
            { permission: { connect: { code: 'job.view' } } },
            { permission: { connect: { code: 'job.create' } } },
            { permission: { connect: { code: 'job.update' } } },
            { permission: { connect: { code: 'job.submit' } } },
            { permission: { connect: { code: 'customer.view' } } },
            { permission: { connect: { code: 'quotation.create' } } },
            // Granted here only so the e2e suite can exercise the maker-checker
            // violation (the requester attempting to review their own request).
            { permission: { connect: { code: 'underwriting.review' } } },
          ],
        },
      },
    });

    const underwriterRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}UW`,
        name: 'E2E Underwriter',
        // Underwriters are BROKER_STAFF/SUPERVISOR/MANAGER in real seed data (ASSIGNED/TEAM/ALL
        // scope, never OWN), so they can see jobs they don't own. Mirror that here with ALL.
        dataScope: 'ALL',
        permissions: {
          create: [
            { permission: { connect: { code: 'job.view' } } },
            { permission: { connect: { code: 'underwriting.review' } } },
          ],
        },
      },
    });

    const agentUser = await prisma.user.create({
      data: {
        username: `${PREFIX}agent`, email: `${PREFIX}agent@test.com`,
        passwordHash, fullName: 'E2E UW Agent',
        roles: { create: [{ role: { connect: { id: agentRole.id } } }] },
      },
    });
    agentId = agentUser.id;

    await prisma.user.create({
      data: {
        username: `${PREFIX}underwriter`, email: `${PREFIX}uw@test.com`,
        passwordHash, fullName: 'E2E Underwriter',
        roles: { create: [{ role: { connect: { id: underwriterRole.id } } }] },
      },
    });

    const [agentLogin, uwLogin] = await Promise.all([
      http().post('/api/auth/login').send({ username: `${PREFIX}agent`, password: PASSWORD }),
      http().post('/api/auth/login').send({ username: `${PREFIX}underwriter`, password: PASSWORD }),
    ]);
    agentToken = agentLogin.body.data.accessToken;
    underwriterToken = uwLogin.body.data.accessToken;

    const insType = await prisma.insuranceType.findFirst({ where: { code: 'FIRE' } });

    // Dedicated product that requires underwriting and has no risk fields / doc checklist,
    // so the only thing blocking requestQuotation is the underwriting gate itself.
    const product = await prisma.insuranceProduct.create({
      data: {
        insuranceTypeId: insType!.id,
        code: `${PREFIX.toUpperCase()}PROD`,
        name: 'E2E Underwriting Product',
        requireDocsOnSubmit: false,
        requireUnderwriting: true,
      },
    });

    const customer = await prisma.customer.create({
      data: { customerCode: `${PREFIX.toUpperCase()}C001`, customerType: 'INDIVIDUAL', firstName: 'UW', lastName: 'Test' },
    });

    const company = await prisma.insuranceCompany.create({
      data: { code: `${PREFIX.toUpperCase()}INS`, name: 'E2E UW Insurance Co.' },
    });

    // Seed data creates demo quotations with hardcoded QT-2026-NNNNNN numbers that never
    // went through SequenceService, so its counter can start behind the highest seeded
    // number. Push it past any plausible seeded range so our real request doesn't collide.
    const businessYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric' }).format(new Date()));
    await prisma.$executeRawUnsafe(
      `INSERT INTO document_sequences (prefix, year, last_value, updated_at)
       VALUES ('QT', $1, 100000, now())
       ON CONFLICT (prefix, year) DO UPDATE SET last_value = GREATEST(document_sequences.last_value, 100000)`,
      businessYear,
    );
    companyId = company.id;

    const jobRes = await http()
      .post('/api/jobs')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        customerId: customer.id,
        insuranceTypeId: insType!.id,
        productId: product.id,
        agentId,
        effectiveDate: '2027-01-01',
      });
    jobId = jobRes.body.data.id;

    const submitJob = async (jId: string) => {
      const res = await http()
        .post(`/api/jobs/${jId}/submit`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({});
      if (res.status >= 400) {
        throw new Error(`Setup failed: could not submit job ${jId} to OPEN — ${JSON.stringify(res.body)}`);
      }
    };
    await submitJob(jobId);

    // Second job, dedicated to the reject → CLOSED scenario.
    const jobRejectRes = await http()
      .post('/api/jobs')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        customerId: customer.id,
        insuranceTypeId: insType!.id,
        productId: product.id,
        agentId,
        effectiveDate: '2027-01-01',
      });
    jobIdReject = jobRejectRes.body.data.id;
    await submitJob(jobIdReject);
  });

  afterAll(async () => {
    await app.close();
  });

  it('requestQuotation is blocked with 422 UNDERWRITING_REQUIRED while no underwriting has been approved', async () => {
    const res = await http()
      .post(`/api/jobs/${jobId}/quotations`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ insuranceCompanyId: companyId, grossPremium: '10000.00' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('UNDERWRITING_REQUIRED');
  });

  it('POST /jobs/:jobId/underwriting/request-review creates a PENDING underwriting (v1)', async () => {
    const res = await http()
      .post(`/api/jobs/${jobId}/underwriting/request-review`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ reason: 'Please review this risk' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.version).toBe(1);
  });

  it('the requester cannot review their own request (maker-checker)', async () => {
    const res = await http()
      .post(`/api/jobs/${jobId}/underwriting/require-info`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ reason: 'need more docs' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('MAKER_CHECKER_VIOLATION');
  });

  it('require-info moves the Job to WAITING_INFORMATION', async () => {
    const res = await http()
      .post(`/api/jobs/${jobId}/underwriting/require-info`)
      .set('Authorization', `Bearer ${underwriterToken}`)
      .send({ reason: 'Need proof of address' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('INFO_REQUIRED');

    const jobRes = await http()
      .get(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${agentToken}`);
    expect(jobRes.body.data.status).toBe('WAITING_INFORMATION');
  });

  it('resume sends the Job back to OPEN and the underwriting back to PENDING', async () => {
    const res = await http()
      .post(`/api/jobs/${jobId}/underwriting/resume`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ reason: 'Provided the missing document' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');

    const jobRes = await http()
      .get(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${agentToken}`);
    expect(jobRes.body.data.status).toBe('OPEN');
  });

  it('approve requires a riskLevel → 422 RISK_LEVEL_REQUIRED', async () => {
    const res = await http()
      .post(`/api/jobs/${jobId}/underwriting/approve`)
      .set('Authorization', `Bearer ${underwriterToken}`)
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('RISK_LEVEL_REQUIRED');
  });

  it('approve with riskLevel approves the underwriting', async () => {
    const res = await http()
      .post(`/api/jobs/${jobId}/underwriting/approve`)
      .set('Authorization', `Bearer ${underwriterToken}`)
      .send({ riskLevel: 'LOW', riskScore: 90 });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('APPROVED');
    expect(res.body.data.riskLevel).toBe('LOW');
  });

  it('requestQuotation now succeeds once underwriting is APPROVED', async () => {
    const res = await http()
      .post(`/api/jobs/${jobId}/quotations`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ insuranceCompanyId: companyId, grossPremium: '10000.00' });

    expect(res.status).toBe(201);

    const jobRes = await http()
      .get(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${agentToken}`);
    expect(jobRes.body.data.status).toBe('QUOTATION_REQUESTED');
  });

  it('reject closes the Job (on a separate job/underwriting cycle)', async () => {
    const reqRes = await http()
      .post(`/api/jobs/${jobIdReject}/underwriting/request-review`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ reason: 'Please review this risk' });
    expect(reqRes.status).toBe(201);
    expect(reqRes.body.data.version).toBe(1);

    const res = await http()
      .post(`/api/jobs/${jobIdReject}/underwriting/reject`)
      .set('Authorization', `Bearer ${underwriterToken}`)
      .send({ reason: 'Risk not acceptable' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('REJECTED');

    const jobRes = await http()
      .get(`/api/jobs/${jobIdReject}`)
      .set('Authorization', `Bearer ${agentToken}`);
    expect(jobRes.body.data.status).toBe('CLOSED');
  });
});
