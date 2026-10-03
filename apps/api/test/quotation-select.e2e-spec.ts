import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_sel_';
const PASSWORD = 'E2e@Sel123';

describe('Quotation Select & Comparison (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agentToken: string;
  let agentId: string;
  let jobId: string;
  let companyAId: string;
  let companyBId: string;
  let quotationAId: string;
  let quotationBId: string;
  let quotationAVersion: number;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    // Cleanup
    const prevJobs = await prisma.job.findMany({ where: { agent: { username: { startsWith: PREFIX } } }, select: { id: true } });
    const prevJobIds = prevJobs.map((j) => j.id);
    if (prevJobIds.length > 0) {
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
      upsertPerm('job.view'), upsertPerm('job.create'),
      upsertPerm('customer.view'), upsertPerm('job.manage_quotation'),
    ]);

    const agentRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}AGENT`,
        name: 'E2E Sel Agent',
        permissions: {
          create: [
            { permission: { connect: { code: 'job.view' } } },
            { permission: { connect: { code: 'job.create' } } },
            { permission: { connect: { code: 'customer.view' } } },
            { permission: { connect: { code: 'job.manage_quotation' } } },
          ],
        },
      },
    });

    const agentUser = await prisma.user.create({
      data: {
        username: `${PREFIX}agent`,
        email: `${PREFIX}agent@test.com`,
        passwordHash,
        fullName: 'E2E Sel Agent',
        roles: { create: [{ role: { connect: { id: agentRole.id } } }] },
      },
    });
    agentId = agentUser.id;

    const loginRes = await http().post('/api/auth/login').send({ username: `${PREFIX}agent`, password: PASSWORD });
    agentToken = loginRes.body.data.accessToken;

    const iType = await prisma.insuranceType.findFirst({ where: { active: true } });
    const product = await prisma.insuranceProduct.findFirst({ where: { insuranceTypeId: iType?.id, active: true } });

    const customer = await prisma.customer.create({
      data: { customerCode: `${PREFIX.toUpperCase()}C001`, customerType: 'INDIVIDUAL', firstName: 'Sel', lastName: 'Test' },
    });

    const [compA, compB] = await Promise.all([
      prisma.insuranceCompany.create({ data: { code: `${PREFIX.toUpperCase()}A`, name: 'Company A' } }),
      prisma.insuranceCompany.create({ data: { code: `${PREFIX.toUpperCase()}B`, name: 'Company B' } }),
    ]);
    companyAId = compA.id;
    companyBId = compB.id;

    const jobRes = await http()
      .post('/api/jobs')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ customerId: customer.id, insuranceTypeId: iType!.id, productId: product!.id, agentId, effectiveDate: '2027-01-01' });
    jobId = jobRes.body.data.id;

    // Create 2 quotations and record both as RECEIVED
    const quoACreate = await http()
      .post(`/api/jobs/${jobId}/quotations`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ insuranceCompanyId: companyAId, grossPremium: '10000.00', validUntil: '2027-12-31' });
    quotationAId = quoACreate.body.data.id;

    const quoBCreate = await http()
      .post(`/api/jobs/${jobId}/quotations`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ insuranceCompanyId: companyBId, grossPremium: '9000.00', validUntil: '2027-12-31' });
    quotationBId = quoBCreate.body.data.id;

    const quoAReceive = await http()
      .put(`/api/quotations/${quotationAId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        grossPremium: '10000.00',
        items: [
          { coverageName: 'ความรับผิดต่อบุคคลภายนอก', sumInsured: '500000.00', premium: '8000.00' },
          { coverageName: 'ค่ารักษาพยาบาล', sumInsured: '100000.00', premium: '2000.00' },
        ],
      });
    quotationAVersion = quoAReceive.body.data.version;

    await http()
      .put(`/api/quotations/${quotationBId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        grossPremium: '9000.00',
        items: [
          { coverageName: 'ความรับผิดต่อบุคคลภายนอก', sumInsured: '300000.00', premium: '7500.00' },
        ],
      });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /jobs/:jobId/quotation-comparison — returns matrix', async () => {
    const res = await http()
      .get(`/api/jobs/${jobId}/quotation-comparison`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.jobId).toBe(jobId);
    expect(data.companies).toHaveLength(2);
    expect(data.coverages.length).toBeGreaterThanOrEqual(2);

    // Check company A appears
    const compA = data.companies.find((c: any) => c.insuranceCompanyName === 'Company A');
    expect(compA).toBeDefined();
    expect(compA.totalAmount).toBe('10742.80'); // 10000 + 40 + 702.8

    // Coverage row for "ความรับผิดต่อบุคคลภายนอก" should have cells for both companies
    const covRow = data.coverages.find((c: any) => c.coverageName === 'ความรับผิดต่อบุคคลภายนอก');
    expect(covRow).toBeDefined();
    expect(covRow.cells).toHaveLength(2);
    // Company A cell: sumInsured 500000, premium 8000
    const compAIdx = data.companies.findIndex((c: any) => c.insuranceCompanyName === 'Company A');
    expect(covRow.cells[compAIdx].sumInsured).toBe('500000.00');
    expect(covRow.cells[compAIdx].premium).toBe('8000.00');
  });

  it('POST /quotations/:id/select — selects quotation A, job → QUOTATION_SELECTED', async () => {
    const res = await http()
      .post(`/api/quotations/${quotationAId}/select`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ reason: 'ราคาดีที่สุด', version: quotationAVersion });

    expect(res.status).toBe(201);
    const q = res.body.data;
    expect(q.status).toBe('SELECTED');

    // Verify job.selectedQuotationId is set and job status changed
    const jobRes = await http().get(`/api/jobs/${jobId}`).set('Authorization', `Bearer ${agentToken}`);
    expect(jobRes.body.data.selectedQuotationId).toBe(quotationAId);
    expect(jobRes.body.data.status).toBe('QUOTATION_SELECTED');
  });

  it('POST /quotations/:id/select — concurrency: second select on same job → 409', async () => {
    // quotationB is still RECEIVED; try to select it — should fail because partial unique index
    const res = await http()
      .post(`/api/quotations/${quotationBId}/select`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ reason: 'ลองเลือกอีกใบ', version: 1 });

    // The partial unique index (job_id WHERE status='SELECTED') causes P2002 → 409 DUPLICATE_ENTRY
    expect(res.status).toBe(409);
  });

  it('POST /quotations/:id/select — expired quotation → 422', async () => {
    // Create a new job and quotation with past validUntil
    const iType = await prisma.insuranceType.findFirst({ where: { active: true } });
    const product = await prisma.insuranceProduct.findFirst({ where: { insuranceTypeId: iType?.id, active: true } });
    const customer = await prisma.customer.findFirst({ where: { customerCode: `${PREFIX.toUpperCase()}C001` } });

    const jobRes = await http()
      .post('/api/jobs')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ customerId: customer!.id, insuranceTypeId: iType!.id, productId: product!.id, agentId, effectiveDate: '2027-01-01' });
    const expJobId = jobRes.body.data.id;

    const createRes = await http()
      .post(`/api/jobs/${expJobId}/quotations`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ insuranceCompanyId: companyAId, grossPremium: '5000.00', validUntil: '2020-01-01' });
    const expQuoId = createRes.body.data.id;

    const receiveRes = await http()
      .put(`/api/quotations/${expQuoId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ grossPremium: '5000.00' });
    const expVer = receiveRes.body.data.version;

    const res = await http()
      .post(`/api/quotations/${expQuoId}/select`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ reason: 'ทดสอบ', version: expVer });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('QUOTATION_EXPIRED');
  });
});
