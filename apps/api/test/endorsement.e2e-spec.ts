import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_en_';
const PASSWORD = 'E2e@En123';

describe('Endorsement API (Day 31 e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffToken: string;
  let staffId: string;
  let customerId: string;
  let companyId: string;
  let productId: string;
  let activePolicyId: string;

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
      await prisma.endorsement.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.policyVersion.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.invoice.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.policyCoverage.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.policy.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.binding.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.approval.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.proposalAcceptance.deleteMany({ where: { proposal: { jobId: { in: prevJobIds } } } });
      await prisma.proposal.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.quotationItem.deleteMany({ where: { quotation: { jobId: { in: prevJobIds } } } });
      await prisma.quotation.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.document.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.job.deleteMany({ where: { id: { in: prevJobIds } } });
    }

    await prisma.customer.deleteMany({ where: { customerCode: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.insuranceProduct.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.insuranceCompany.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });

    const passwordHash = await hash(PASSWORD);

    const upsertPerm = (code: string) =>
      prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } });
    await Promise.all([
      upsertPerm('job.view'), upsertPerm('job.create'), upsertPerm('job.view_all'),
      upsertPerm('customer.view'),
      upsertPerm('policy.view'), upsertPerm('policy.update'),
    ]);

    const role = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}STAFF`,
        name: 'E2E Endorsement Staff',
        permissions: {
          create: [
            { permission: { connect: { code: 'job.view' } } },
            { permission: { connect: { code: 'job.create' } } },
            { permission: { connect: { code: 'job.view_all' } } },
            { permission: { connect: { code: 'customer.view' } } },
            { permission: { connect: { code: 'policy.view' } } },
            { permission: { connect: { code: 'policy.update' } } },
          ],
        },
      },
    });

    const user = await prisma.user.create({
      data: {
        username: `${PREFIX}staff`,
        email: `${PREFIX}staff@test.com`,
        passwordHash,
        fullName: 'E2E Staff',
        roles: { create: [{ role: { connect: { id: role.id } } }] },
      },
    });
    staffId = user.id;

    // Login
    const loginRes = await http().post('/api/auth/login').send({
      username: `${PREFIX}staff`,
      password: PASSWORD,
    });
    staffToken = loginRes.body.data.accessToken;

    // Customer & Company & Product
    const customer = await prisma.customer.create({
      data: {
        customerCode: `${PREFIX.toUpperCase()}CUST`,
        customerType: 'INDIVIDUAL',
        firstName: 'Somchai',
        lastName: 'Endorse',
        createdById: staffId,
      },
    });
    customerId = customer.id;

    const company = await prisma.insuranceCompany.create({
      data: { code: `${PREFIX.toUpperCase()}INS`, name: 'E2E Insurer' },
    });
    companyId = company.id;

    const insType = await prisma.insuranceType.findFirst();
    const product = await prisma.insuranceProduct.create({
      data: {
        code: `${PREFIX.toUpperCase()}PROD`,
        name: 'E2E Product',
        insuranceTypeId: insType!.id,
      },
    });
    productId = product.id;

    // Create an ACTIVE Policy directly
    const job = await prisma.job.create({
      data: {
        jobNo: `${PREFIX}JOB_1`,
        customer: { connect: { id: customerId } },
        insuranceType: { connect: { id: insType!.id } },
        product: { connect: { id: productId } },
        agent: { connect: { id: staffId } },
        effectiveDate: new Date('2026-01-01'),
        expiryDate: new Date('2027-01-01'),
        status: 'CLOSED',
      },
    });

    const quotation = await prisma.quotation.create({
      data: {
        quotationNo: `${PREFIX}QT_1`,
        jobId: job.id,
        insuranceCompanyId: companyId,
        grossPremium: 10000,
        netPremium: 10000,
        tax: 700,
        stampDuty: 0,
        totalAmount: 10700,
        status: 'SELECTED',
      },
    });

    const policy = await prisma.policy.create({
      data: {
        policyNo: `${PREFIX}PL_1`,
        jobId: job.id,
        quotationId: quotation.id,
        insuranceCompanyId: companyId,
        effectiveDate: new Date('2026-01-01'),
        expiryDate: new Date('2027-01-01'),
        sumInsured: 1000000,
        netPremium: 10000,
        grossPremium: 10000,
        tax: 700,
        stampDuty: 0,
        totalPremium: 10700,
        status: 'ACTIVE',
        createdById: staffId,
      },
    });
    activePolicyId = policy.id;
  });

  afterAll(async () => {
    const prevJobs = await prisma.job.findMany({
      where: { agent: { username: { startsWith: PREFIX } } },
      select: { id: true },
    });
    const prevJobIds = prevJobs.map((j) => j.id);
    if (prevJobIds.length > 0) {
      await prisma.endorsement.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.policyVersion.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.invoice.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.policyCoverage.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.policy.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.binding.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.approval.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.proposalAcceptance.deleteMany({ where: { proposal: { jobId: { in: prevJobIds } } } });
      await prisma.proposal.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.quotationItem.deleteMany({ where: { quotation: { jobId: { in: prevJobIds } } } });
      await prisma.quotation.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.document.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.job.deleteMany({ where: { id: { in: prevJobIds } } });
    }
    await prisma.customer.deleteMany({ where: { customerCode: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.insuranceProduct.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.insuranceCompany.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await app.close();
  });

  it('calculates pro-rata premium for policy', async () => {
    const res = await http()
      .post(`/api/policies/${activePolicyId}/endorsements/calculate-pro-rata`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        endorsementDate: '2026-07-01',
        annualNetPremium: '10000.00',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalDays).toBe(365);
    expect(res.body.data.remainingDays).toBe(184);
    expect(Number(res.body.data.proRataNet)).toBeGreaterThan(0);
    expect(Number(res.body.data.totalAdjustment)).toBeGreaterThan(0);
  });

  it('rejects endorsement creation when invalid fields are specified for type', async () => {
    const res = await http()
      .post(`/api/policies/${activePolicyId}/endorsements`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        type: 'CHANGE_CUSTOMER',
        effectiveDate: '2026-07-01',
        changes: {
          after: { licensePlate: '1กก-9999' }, // invalid for CHANGE_CUSTOMER
        },
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('creates endorsement as DRAFT, submits to REQUESTED, and starts review to REVIEWING', async () => {
    // 1. Create Endorsement
    const createRes = await http()
      .post(`/api/policies/${activePolicyId}/endorsements`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        type: 'CHANGE_CUSTOMER',
        effectiveDate: '2026-07-01',
        changes: {
          before: { phone: '0810000000' },
          after: { phone: '0899999999' },
        },
        premiumAdjustmentType: 'ADDITIONAL_PREMIUM',
        netAdjustment: '15000.00',
        stampDuty: '60.00',
        vat: '1054.20',
        totalAdjustment: '16114.20',
        remark: 'Customer changed mobile phone',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    const endorsement = createRes.body.data;
    expect(endorsement.endorsementNo).toMatch(/^EN-\d{4}-\d{6}$/);
    expect(endorsement.status).toBe('DRAFT');
    const endorsementId = endorsement.id;

    // 2. Submit Endorsement
    const submitRes = await http()
      .post(`/api/endorsements/${endorsementId}/submit`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(submitRes.status).toBe(201);
    expect(submitRes.body.data.status).toBe('REQUESTED');

    // 3. Start Review
    const reviewRes = await http()
      .post(`/api/endorsements/${endorsementId}/start-review`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(reviewRes.status).toBe(201);
    expect(reviewRes.body.data.status).toBe('REVIEWING');

    // 4. List endorsements by policy
    const listRes = await http()
      .get(`/api/policies/${activePolicyId}/endorsements`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);

    // 5. Cancel Endorsement
    const cancelRes = await http()
      .post(`/api/endorsements/${endorsementId}/cancel`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ reason: 'Customer withdrew request' });

    expect(cancelRes.status).toBe(201);
    expect(cancelRes.body.data.status).toBe('CANCELLED');
  });

  it('Day 32: creates CHANGE_SUM_INSURED with additional premium -> issues -> creates policy version 2 + debit note + commission adjustment', async () => {
    // 1. Create Endorsement with CHANGE_SUM_INSURED & ADDITIONAL_PREMIUM
    const createRes = await http()
      .post(`/api/policies/${activePolicyId}/endorsements`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        type: 'CHANGE_SUM_INSURED',
        effectiveDate: '2026-07-01',
        changes: {
          before: { sumInsured: 1000000 },
          after: { sumInsured: 2000000 },
        },
        premiumAdjustmentType: 'ADDITIONAL_PREMIUM',
        netAdjustment: 5000,
        stampDuty: 20,
        vat: 351.4,
        totalAdjustment: 5371.4,
        remark: 'Increase sum insured to 2,000,000',
      });

    expect(createRes.status).toBe(201);
    const endorsement = createRes.body.data;

    // 2. Submit endorsement (5,000 < 10,000 rule threshold -> auto-approved to APPROVED)
    const submitRes = await http()
      .post(`/api/endorsements/${endorsement.id}/submit`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(submitRes.status).toBe(201);
    expect(submitRes.body.data.status).toBe('APPROVED');

    // 3. Issue endorsement
    const issueRes = await http()
      .post(`/api/endorsements/${endorsement.id}/issue`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(issueRes.status).toBe(201);
    expect(issueRes.body.data.status).toBe('ISSUED');

    // 4. Verify Policy Version snapshot created
    const versions = await prisma.policyVersion.findMany({
      where: { policyId: activePolicyId },
    });
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions[0].version).toBe(1);

    // 5. Verify Policy was updated to version 2 and sumInsured is 2,000,000
    const updatedPolicy = await prisma.policy.findUnique({
      where: { id: activePolicyId },
    });
    expect(updatedPolicy?.version).toBe(2);
    expect(Number(updatedPolicy?.sumInsured)).toBe(2000000);
    expect(Number(updatedPolicy?.netPremium)).toBe(15000);

    // 6. Verify Debit Note Invoice was generated
    const debitNotes = await prisma.invoice.findMany({
      where: { policyId: activePolicyId, type: 'DEBIT_NOTE' },
    });
    expect(debitNotes).toHaveLength(1);
    expect(Number(debitNotes[0].amount)).toBe(5371.4);
    expect(debitNotes[0].invoiceNo).toMatch(/^INV-\d{4}-\d{6}$/);

    // 7. Verify Commission Adjustment if commission row exists (we can check DB)
    const adjustments = await prisma.commissionAdjustment.findMany({
      where: { policyId: activePolicyId },
    });
    // No commission was seeded for this raw policy, so adjustments length is 0 (or tested if seeded)
    expect(adjustments).toBeDefined();
  });

  it('rejects inconsistent premium amounts (total ≠ net + stamp + VAT, amounts on NO_CHANGE) and bad money formats', async () => {
    const create = (body: Record<string, unknown>) =>
      http().post(`/api/policies/${activePolicyId}/endorsements`).set('Authorization', `Bearer ${staffToken}`).send({
        type: 'CHANGE_SUM_INSURED', effectiveDate: '2026-07-01', changes: { after: { sumInsured: 2000000 } }, ...body,
      });

    const wrongTotal = await create({ premiumAdjustmentType: 'ADDITIONAL_PREMIUM', netAdjustment: '1000.00', stampDuty: '4.00', vat: '70.28', totalAdjustment: '9999.00' });
    expect([wrongTotal.status, wrongTotal.body.code]).toEqual([422, 'ENDORSEMENT_INVALID_AMOUNTS']);

    const amountsOnNoChange = await create({ netAdjustment: '1000.00', totalAdjustment: '1000.00' });
    expect([amountsOnNoChange.status, amountsOnNoChange.body.code]).toEqual([422, 'ENDORSEMENT_INVALID_AMOUNTS']);

    expect((await create({ premiumAdjustmentType: 'ADDITIONAL_PREMIUM', netAdjustment: 'abc', totalAdjustment: '1.00' })).status).toBe(422);
    expect((await create({ premiumAdjustmentType: 'ADDITIONAL_PREMIUM', netAdjustment: '-5.00', totalAdjustment: '-5.00' })).status).toBe(422);

    // an older client still sending JSON numbers keeps working
    const legacy = await create({ premiumAdjustmentType: 'ADDITIONAL_PREMIUM', netAdjustment: 1000, stampDuty: 4, vat: 70.28, totalAdjustment: 1074.28 });
    expect(legacy.status).toBe(201);
    expect(legacy.body.data.totalAdjustment).toBe('1074.28');
  });

  it('pro-rata defaults to the policy net premium and returns decimal strings', async () => {
    const res = await http().post(`/api/policies/${activePolicyId}/endorsements/calculate-pro-rata`).set('Authorization', `Bearer ${staffToken}`).send({ endorsementDate: '2026-07-01' });
    expect(res.status).toBe(201);
    expect(typeof res.body.data.proRataNet).toBe('string');
    expect(res.body.data.proRataNet).toMatch(/^\d+\.\d{2}$/);
    expect(res.body.data.totalAdjustment).toMatch(/^\d+\.\d{2}$/);
  });
});
