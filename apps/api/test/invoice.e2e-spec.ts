import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_inv_';
const PASSWORD = 'E2e@Inv123';

describe('Invoice API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userToken: string;
  let userId: string;
  let customerId: string;
  let companyId: string;
  let productId: string;
  let paymentTerm3Id: string;

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
      await prisma.idempotencyKey.deleteMany({ where: { entityId: { in: prevJobIds } } });
      await prisma.invoice.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.policyCoverage.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.policy.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.binding.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.approval.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.proposalAcceptance.deleteMany({ where: { proposal: { jobId: { in: prevJobIds } } } });
      await prisma.proposal.deleteMany({ where: { proposalNo: { startsWith: PREFIX } } });
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
    await prisma.insuranceProduct.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });

    const passwordHash = await hash(PASSWORD);

    const upsertPerm = (code: string) =>
      prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } });
    await Promise.all([
      upsertPerm('job.view'), upsertPerm('job.create'), upsertPerm('job.view_all'),
      upsertPerm('customer.view'),
      upsertPerm('quotation.create'), upsertPerm('quotation.update'), upsertPerm('quotation.select'),
      upsertPerm('proposal.create'), upsertPerm('proposal.send'),
      upsertPerm('proposal.accept'),
      upsertPerm('approval.approve'),
      upsertPerm('policy.view'), upsertPerm('policy.create'), upsertPerm('policy.update'),
      upsertPerm('invoice.view'), upsertPerm('invoice.update'),
    ]);

    const role = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}STAFF`,
        name: 'E2E Inv Staff',
        permissions: {
          create: [
            { permission: { connect: { code: 'job.view' } } },
            { permission: { connect: { code: 'job.create' } } },
            { permission: { connect: { code: 'job.view_all' } } },
            { permission: { connect: { code: 'customer.view' } } },
            { permission: { connect: { code: 'quotation.create' } } },
            { permission: { connect: { code: 'quotation.update' } } },
            { permission: { connect: { code: 'quotation.select' } } },
            { permission: { connect: { code: 'proposal.create' } } },
            { permission: { connect: { code: 'proposal.send' } } },
            { permission: { connect: { code: 'proposal.accept' } } },
            { permission: { connect: { code: 'approval.approve' } } },
            { permission: { connect: { code: 'policy.view' } } },
            { permission: { connect: { code: 'policy.create' } } },
            { permission: { connect: { code: 'policy.update' } } },
            { permission: { connect: { code: 'invoice.view' } } },
            { permission: { connect: { code: 'invoice.update' } } },
          ],
        },
      },
    });

    const user = await prisma.user.create({
      data: {
        username: `${PREFIX}staff`,
        email: `${PREFIX}staff@test.com`,
        passwordHash,
        fullName: 'E2E Inv Staff',
        roles: { create: [{ role: { connect: { id: role.id } } }] },
      },
    });
    userId = user.id;

    // Login
    const loginRes = await http().post('/api/auth/login').send({
      username: `${PREFIX}staff`,
      password: PASSWORD,
    });
    userToken = loginRes.body.data.accessToken;

    // Customer
    const customer = await prisma.customer.create({
      data: {
        customerCode: `${PREFIX.toUpperCase()}CUST`,
        customerType: 'INDIVIDUAL',
        firstName: 'Somchai',
        lastName: 'Billing',
        status: 'ACTIVE',
        createdById: userId,
      },
    });
    customerId = customer.id;

    // Company & product
    const company = await prisma.insuranceCompany.create({
      data: {
        code: `${PREFIX.toUpperCase()}INS`,
        name: 'E2E Invoice Insurer',
      },
    });
    companyId = company.id;

    const insType = await prisma.insuranceType.findFirst();
    const product = await prisma.insuranceProduct.create({
      data: {
        code: `${PREFIX.toUpperCase()}PROD`,
        name: 'E2E Invoice Product',
        insuranceTypeId: insType!.id,
        requireDocsOnSubmit: false,
        requireDocsOnBind: false,
      },
    });
    productId = product.id;

    // Payment Term 3 installments
    const term3 = await prisma.paymentTerm.findFirst({
      where: { installments: 3 },
    });
    if (term3) {
      paymentTerm3Id = term3.id;
    } else {
      const createdTerm = await prisma.paymentTerm.create({
        data: {
          code: `${PREFIX.toUpperCase()}TERM3`,
          name: 'ผ่อน 3 งวด',
          installments: 3,
          intervalMonths: 1,
          firstDueDays: 30,
        },
      });
      paymentTerm3Id = createdTerm.id;
    }
  });

  afterAll(async () => {
    const prevJobs = await prisma.job.findMany({
      where: { agent: { username: { startsWith: PREFIX } } },
      select: { id: true },
    });
    const prevJobIds = prevJobs.map((j) => j.id);
    if (prevJobIds.length > 0) {
      await prisma.idempotencyKey.deleteMany({ where: { entityId: { in: prevJobIds } } });
      await prisma.invoice.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.policyCoverage.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.policy.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.binding.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.approval.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.proposalAcceptance.deleteMany({ where: { proposal: { jobId: { in: prevJobIds } } } });
      await prisma.proposal.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.quotationItem.deleteMany({ where: { quotation: { jobId: { in: prevJobIds } } } });
      await prisma.quotation.deleteMany({ where: { quotationNo: { startsWith: PREFIX } } });
      await prisma.quotation.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.jobStatusHistory.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.activityLog.deleteMany({ where: { jobId: { in: prevJobIds } } });
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

  it('issues policy with 3 installments payment term -> generates 3 invoices with total matching gross premium', async () => {
    // 1. Create Job in POLICY_PENDING
    const insType = await prisma.insuranceType.findFirst({ where: { active: true } });
    const job = await prisma.job.create({
      data: {
        jobNo: `${PREFIX}JOB_1`,
        customer: { connect: { id: customerId } },
        insuranceType: { connect: { id: insType!.id } },
        product: { connect: { id: productId } },
        agent: { connect: { id: userId } },
        effectiveDate: new Date('2027-01-01'),
        expiryDate: new Date('2028-01-01'),
        status: 'POLICY_PENDING',
      },
    });

    // 2. Create Quotation with totalAmount = 10,700 (net 10,000 + vat 700)
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

    await prisma.job.update({
      where: { id: job.id },
      data: { selectedQuotationId: quotation.id },
    });

    // 3. Create Proposal with PaymentTerm = 3 installments and status ACCEPTED
    await prisma.proposal.create({
      data: {
        proposalNo: `${PREFIX}PP_1`,
        jobId: job.id,
        quotationId: quotation.id,
        customerId,
        paymentTermId: paymentTerm3Id,
        status: 'ACCEPTED',
        createdById: userId,
      },
    });

    // 4. Issue Policy via API
    const issueRes = await http()
      .post(`/api/jobs/${job.id}/policy`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        remark: 'Policy with 3 installments test',
      });

    expect(issueRes.status).toBe(201);
    expect(issueRes.body.success).toBe(true);
    const policyId = issueRes.body.data.id;

    // 5. Query invoices by policy via API: GET /api/policies/:id/invoices
    const invoicesRes = await http()
      .get(`/api/policies/${policyId}/invoices`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(invoicesRes.status).toBe(200);
    expect(invoicesRes.body.success).toBe(true);
    const invoices = invoicesRes.body.data;

    expect(invoices).toHaveLength(3);
    expect(invoices[0].installmentNo).toBe(1);
    expect(invoices[1].installmentNo).toBe(2);
    expect(invoices[2].installmentNo).toBe(3);

    // Sum of amounts should exactly equal totalAmount (10,700)
    const sumAmount = invoices.reduce((sum: number, inv: { amount: string }) => sum + Number(inv.amount), 0);
    expect(sumAmount).toBeCloseTo(10700, 2);

    // Sum of net amounts should equal 10,000
    const sumNet = invoices.reduce((sum: number, inv: { netAmount: string }) => sum + Number(inv.netAmount), 0);
    expect(sumNet).toBeCloseTo(10000, 2);

    // Verify invoice fields
    expect(invoices[0].invoiceNo).toMatch(/^INV-\d{4}-\d{6}$/);
    expect(invoices[0].status).toBe('PENDING');
    expect(Number(invoices[0].outstandingAmount)).toBe(Number(invoices[0].amount));

    // 6. Test GET /api/invoices with filters
    const listRes = await http()
      .get(`/api/invoices?policyId=${policyId}&status=PENDING`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.data.items).toHaveLength(3);
    expect(listRes.body.data.total).toBe(3);

    // 7. Test Cancel Invoice: POST /api/invoices/:id/cancel
    const firstInvoiceId = invoices[0].id;
    const cancelRes = await http()
      .post(`/api/invoices/${firstInvoiceId}/cancel`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ reason: 'Incorrect customer address' });

    expect(cancelRes.status).toBe(201);
    expect(cancelRes.body.success).toBe(true);
    expect(cancelRes.body.data.status).toBe('CANCELLED');
    expect(cancelRes.body.data.cancelledAt).toBeDefined();
  });
});
