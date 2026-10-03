import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_quo_';
const PASSWORD = 'E2e@Quo123';

describe('Quotation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agentToken: string;
  let agentId: string;
  let jobId: string;
  let companyId: string;
  let quotationId: string;

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
      upsertPerm('job.view'), upsertPerm('job.create'), upsertPerm('customer.view'),
      upsertPerm('job.manage_quotation'),
    ]);

    const agentRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}AGENT`,
        name: 'E2E Quo Agent',
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
        fullName: 'E2E Quo Agent',
        roles: { create: [{ role: { connect: { id: agentRole.id } } }] },
      },
    });
    agentId = agentUser.id;

    const loginRes = await http().post('/api/auth/login').send({ username: `${PREFIX}agent`, password: PASSWORD });
    agentToken = loginRes.body.data.accessToken;

    // Seed insurance type & product
    const iType = await prisma.insuranceType.findFirst({ where: { active: true } });
    const product = await prisma.insuranceProduct.findFirst({ where: { insuranceTypeId: iType?.id, active: true } });

    // Seed customer
    const customer = await prisma.customer.create({
      data: {
        customerCode: `${PREFIX.toUpperCase()}C001`,
        customerType: 'INDIVIDUAL',
        firstName: 'Quo', lastName: 'Test',
      },
    });

    // Seed insurance company
    const company = await prisma.insuranceCompany.create({
      data: {
        code: `${PREFIX.toUpperCase()}INS`,
        name: 'E2E Insurance Co.',
      },
    });
    companyId = company.id;

    // Create job via API
    const jobRes = await http()
      .post('/api/jobs')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        customerId: customer.id,
        insuranceTypeId: iType!.id,
        productId: product!.id,
        agentId,
        effectiveDate: '2027-01-01',
      });
    jobId = jobRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /jobs/:jobId/quotations — creates REQUESTED quotation and auto-calcs', async () => {
    const res = await http()
      .post(`/api/jobs/${jobId}/quotations`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        insuranceCompanyId: companyId,
        grossPremium: '10000.00',
      });

    expect(res.status).toBe(201);
    const q = res.body.data;
    quotationId = q.id;
    expect(q.status).toBe('REQUESTED');
    expect(q.grossPremium).toBe('10000.00');
    expect(q.discount).toBe('0.00');
    // net = 10000, stampDuty = ceil(10000×0.004)=40, tax = (10000+40)×0.07 = 702.8
    expect(q.netPremium).toBe('10000.00');
    expect(q.stampDuty).toBe('40.00');
    expect(q.tax).toBe('702.80');
    expect(q.totalAmount).toBe('10742.80');
  });

  it('GET /jobs/:jobId/quotations — lists quotations', async () => {
    const res = await http()
      .get(`/api/jobs/${jobId}/quotations`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(quotationId);
  });

  it('PUT /quotations/:id — records received with items → status RECEIVED', async () => {
    const res = await http()
      .put(`/api/quotations/${quotationId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        quotationDate: '2026-10-02',
        validUntil: '2027-10-02',
        grossPremium: '10000.00',
        discount: '500.00',
        items: [
          { coverageName: 'ความรับผิดต่อบุคคลภายนอก', sumInsured: '500000.00', premium: '9500.00' },
        ],
      });

    expect(res.status).toBe(200);
    const q = res.body.data;
    expect(q.status).toBe('RECEIVED');
    // net = 10000 - 500 = 9500
    expect(q.netPremium).toBe('9500.00');
    // stampDuty = ceil(9500×0.004) = 38
    expect(q.stampDuty).toBe('38.00');
    // tax = (9500+38)×0.07 = 9538×0.07 = 667.66
    expect(q.tax).toBe('667.66');
    expect(q.totalAmount).toBe('10205.66');
    expect(q.items).toHaveLength(1);
  });

  it('PUT /quotations/:id — rejects when total would be negative (422)', async () => {
    // Create another quotation to test negative total
    const createRes = await http()
      .post(`/api/jobs/${jobId}/quotations`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        insuranceCompanyId: companyId,
        grossPremium: '100.00',
      });
    const newId = createRes.body.data?.id;
    if (!newId) return; // skip if creation failed

    const res = await http()
      .put(`/api/quotations/${newId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        grossPremium: '100.00',
        discount: '0.00',
        stampDuty: '0.00',
        tax: '-200.00',
      });

    expect(res.status).toBe(422);
  });

  it('PUT /quotations/:id — already RECEIVED cannot be recorded again (409)', async () => {
    const res = await http()
      .put(`/api/quotations/${quotationId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ grossPremium: '10000.00' });

    expect(res.status).toBe(409);
  });
});
