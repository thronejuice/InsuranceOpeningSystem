import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_rf_';
const PASSWORD = 'E2e@Refund123';

describe('Refund API (Day 34 e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffToken: string;
  let staffId: string;
  let managerToken: string;
  let managerId: string;
  let financeToken: string;
  let financeId: string;

  let creditNoteId: string;
  let refundId: string;

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
      await prisma.refund.deleteMany({ where: { creditNote: { policy: { jobId: { in: prevJobIds } } } } });
      await prisma.invoice.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.policy.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.quotation.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.job.deleteMany({ where: { id: { in: prevJobIds } } });
    }

    await prisma.customer.deleteMany({ where: { customerCode: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.insuranceProduct.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.insuranceCompany.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });

    const passwordHash = await hash(PASSWORD);

    // Roles
    const brokerStaffRole = await prisma.role.findFirst({ where: { code: 'BROKER_STAFF' } });
    const managerRole = await prisma.role.findFirst({ where: { code: 'MANAGER' } });
    const financeRole = await prisma.role.findFirst({ where: { code: 'FINANCE' } });

    const manager = await prisma.user.create({
      data: {
        username: `${PREFIX}mgr`,
        email: `${PREFIX}mgr@test.com`,
        passwordHash,
        fullName: 'E2E Refund Manager',
        roles: { create: [{ role: { connect: { id: managerRole!.id } } }] },
      },
    });
    managerId = manager.id;

    const staff = await prisma.user.create({
      data: {
        username: `${PREFIX}staff`,
        email: `${PREFIX}staff@test.com`,
        passwordHash,
        fullName: 'E2E Refund Staff',
        managerId: manager.id,
        roles: { create: [{ role: { connect: { id: brokerStaffRole!.id } } }] },
      },
    });
    staffId = staff.id;

    const finance = await prisma.user.create({
      data: {
        username: `${PREFIX}fin`,
        email: `${PREFIX}fin@test.com`,
        passwordHash,
        fullName: 'E2E Refund Finance',
        roles: { create: [{ role: { connect: { id: financeRole!.id } } }] },
      },
    });
    financeId = finance.id;

    const staffLogin = await http().post('/api/auth/login').send({ username: `${PREFIX}staff`, password: PASSWORD });
    staffToken = staffLogin.body.data.accessToken;

    const mgrLogin = await http().post('/api/auth/login').send({ username: `${PREFIX}mgr`, password: PASSWORD });
    managerToken = mgrLogin.body.data.accessToken;

    const finLogin = await http().post('/api/auth/login').send({ username: `${PREFIX}fin`, password: PASSWORD });
    financeToken = finLogin.body.data.accessToken;

    // Master data
    const customer = await prisma.customer.create({
      data: {
        customerCode: `${PREFIX.toUpperCase()}CUS`,
        customerType: 'INDIVIDUAL',
        firstName: 'Refund',
        lastName: 'Customer',
      },
    });

    const company = await prisma.insuranceCompany.create({
      data: { code: `${PREFIX.toUpperCase()}INS`, name: 'Refund Insurance' },
    });

    const insType = await prisma.insuranceType.findFirst();
    const product = await prisma.insuranceProduct.create({
      data: {
        code: `${PREFIX.toUpperCase()}PROD`,
        name: 'Refund Product',
        insuranceTypeId: insType!.id,
      },
    });

    const job = await prisma.job.create({
      data: {
        jobNo: `${PREFIX}JOB_1`,
        customer: { connect: { id: customer.id } },
        insuranceType: { connect: { id: insType!.id } },
        product: { connect: { id: product.id } },
        agent: { connect: { id: staff.id } },
        effectiveDate: new Date('2026-01-01'),
        status: 'CLOSED',
      },
    });

    const quotation = await prisma.quotation.create({
      data: {
        quotationNo: `${PREFIX}QT_1`,
        jobId: job.id,
        insuranceCompanyId: company.id,
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
        insuranceCompanyId: company.id,
        effectiveDate: new Date('2026-01-01'),
        expiryDate: new Date('2027-01-01'),
        grossPremium: 10000,
        netPremium: 10000,
        tax: 700,
        stampDuty: 0,
        totalPremium: 10700,
        status: 'ACTIVE',
      },
    });

    // Create a CREDIT_NOTE invoice
    const creditNote = await prisma.invoice.create({
      data: {
        invoiceNo: `${PREFIX}CN_1`,
        policyId: policy.id,
        customerId: customer.id,
        type: 'CREDIT_NOTE',
        amount: '3000.00',
        netAmount: '2800.00',
        vat: '196.00',
        stampDuty: '12.00',
        dueDate: new Date(),
        status: 'PENDING',
      },
    });
    creditNoteId = creditNote.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /refunds — creates refund in REQUESTED status', async () => {
    const res = await http()
      .post('/api/refunds')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        creditNoteId,
        amount: '3000.00',
        reason: 'Customer cancelled early',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.refundNo).toMatch(/^RF-\d{4}-\d+$/);
    expect(res.body.data.status).toBe('REQUESTED');
    expect(Number(res.body.data.amount)).toBe(3000);
    expect(res.body.data.requestedById).toBe(staffId);
    refundId = res.body.data.id;
  });


  it('POST /refunds/:id/approve — self-approval rejected with 422 (Maker-Checker D-16)', async () => {
    const res = await http()
      .post(`/api/refunds/${refundId}/approve`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('SELF_APPROVAL_NOT_ALLOWED');
  });

  it('POST /refunds/:id/approve — manager approves refund', async () => {
    const res = await http()
      .post(`/api/refunds/${refundId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('APPROVED');
    expect(res.body.data.approvedById).toBe(managerId);
  });

  it('POST /refunds/:id/process — non-finance user cannot process (403)', async () => {
    const res = await http()
      .post(`/api/refunds/${refundId}/process`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        paymentMethod: 'TRANSFER',
        bank: 'KBANK',
        referenceNo: 'TX-REF-9999',
      });

    expect(res.status).toBe(403);
  });

  it('POST /refunds/:id/process — finance processes payout → status PROCESSED, credit note marked PAID (D-16)', async () => {
    const res = await http()
      .post(`/api/refunds/${refundId}/process`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        paymentMethod: 'TRANSFER',
        bank: 'KBANK',
        referenceNo: 'TX-REF-9999',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PROCESSED');
    expect(res.body.data.processedById).toBe(financeId);
    expect(res.body.data.paymentMethod).toBe('TRANSFER');
    expect(res.body.data.bank).toBe('KBANK');
    expect(res.body.data.referenceNo).toBe('TX-REF-9999');

    // Verify credit note invoice is marked PAID
    const updatedCn = await prisma.invoice.findUnique({ where: { id: creditNoteId } });
    expect(updatedCn?.status).toBe('PAID');
  });

  it('GET /refunds — lists refunds with filters', async () => {
    const res = await http()
      .get('/api/refunds?status=PROCESSED')
      .set('Authorization', `Bearer ${financeToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.items[0].id).toBe(refundId);
  });
});
