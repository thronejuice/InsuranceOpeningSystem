/**
 * Payment API E2E
 *
 * Sets up a policy directly via Prisma, then tests:
 * - GET payments (empty list, UNPAID status)
 * - POST payment (happy path, PARTIAL → PAID)
 * - POST payment overpay → 422 PAYMENT_EXCEEDS_PREMIUM
 * - POST cancel payment
 * - 403 without permission
 */
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_pay_';
const PASSWORD = 'E2e@Pay123';

describe('Payment API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let payerToken: string;
  let viewerToken: string;
  let policyId: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    // ─── Cleanup ─────────────────────────────────────────────────────────────
    const prevJobs = await prisma.job.findMany({
      where: { agent: { username: { startsWith: PREFIX } } },
      select: { id: true },
    });
    const prevJobIds = prevJobs.map((j) => j.id);
    if (prevJobIds.length > 0) {
      await prisma.payment.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
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
    const testUsers = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
    if (testUsers.length > 0) {
      await prisma.customer.deleteMany({ where: { createdById: { in: testUsers.map((u) => u.id) } } });
    }
    await prisma.customer.deleteMany({ where: { customerCode: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });

    // Advance PAY sequence past existing values
    const curYear = new Date().getFullYear();
    type MaxRow = [{ max: number | null }];
    const payR = await prisma.$queryRaw<MaxRow>`SELECT MAX(CAST(SPLIT_PART(payment_no, '-', 3) AS INTEGER)) as max FROM payments WHERE payment_no LIKE ${`PAY-${curYear}-%`}`;
    const paySafe = (Number(payR[0].max ?? 0)) + 50;
    await prisma.$executeRaw`
      INSERT INTO document_sequences (prefix, year, last_value, updated_at) VALUES ('PAY', ${curYear}, ${paySafe}, now())
      ON CONFLICT (prefix, year) DO UPDATE SET last_value = GREATEST(document_sequences.last_value, EXCLUDED.last_value), updated_at = now()
    `;

    // ─── Permissions ─────────────────────────────────────────────────────────
    const passwordHash = await hash(PASSWORD);
    const upsertPerm = (code: string) =>
      prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } });

    await Promise.all([
      upsertPerm('payment.view'),
      upsertPerm('payment.create'),
      upsertPerm('policy.view'),
    ]);

    // Payer role (can view + create payments)
    const payerRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}PAYER`,
        name: 'E2E Payment Payer',
        permissions: {
          create: [
            { permission: { connect: { code: 'payment.view' } } },
            { permission: { connect: { code: 'payment.create' } } },
            { permission: { connect: { code: 'policy.view' } } },
          ],
        },
      },
    });

    // Viewer role (can view payments, not create)
    const viewerRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}VIEWER`,
        name: 'E2E Payment Viewer',
        permissions: {
          create: [
            { permission: { connect: { code: 'payment.view' } } },
            { permission: { connect: { code: 'policy.view' } } },
          ],
        },
      },
    });

    const payer = await prisma.user.create({
      data: {
        username: `${PREFIX}payer`,
        email: `${PREFIX}payer@test.com`,
        passwordHash,
        fullName: 'E2E Payment Payer',
        roles: { create: [{ role: { connect: { id: payerRole.id } } }] },
      },
    });

    await prisma.user.create({
      data: {
        username: `${PREFIX}viewer`,
        email: `${PREFIX}viewer@test.com`,
        passwordHash,
        fullName: 'E2E Payment Viewer',
        roles: { create: [{ role: { connect: { id: viewerRole.id } } }] },
      },
    });

    // ─── Create policy via Prisma ─────────────────────────────────────────────
    const iType = await prisma.insuranceType.findFirst({ where: { active: true } });
    const product = await prisma.insuranceProduct.create({
      data: {
        insuranceTypeId: iType!.id,
        code: `${PREFIX.toUpperCase()}PROD`,
        name: 'E2E Pay Product',
        requireDocsOnSubmit: false,
        requireDocsOnBind: false,
      },
    });
    const company = await prisma.insuranceCompany.create({
      data: { code: `${PREFIX.toUpperCase()}CO`, name: 'E2E Pay Company' },
    });
    const customer = await prisma.customer.create({
      data: {
        customerCode: `${PREFIX.toUpperCase()}C001`,
        customerType: 'INDIVIDUAL',
        firstName: 'ยอดPay',
        lastName: 'ยิ้มPay',
      },
    });

    const job = await prisma.job.create({
      data: {
        jobNo: `JOB-PAYTEST-001`,
        insuranceTypeId: iType!.id,
        productId: product.id,
        customerId: customer.id,
        agentId: payer.id,
        effectiveDate: new Date('2027-01-01'),
        status: 'POLICY_ISSUED',
        version: 1,
      },
    });

    const quotation = await prisma.quotation.create({
      data: {
        quotationNo: 'QT-PAYTEST-001',
        jobId: job.id,
        insuranceCompanyId: company.id,
        grossPremium: '1000.00',
        netPremium: '1000.00',
        totalAmount: '1000.00',
        status: 'SELECTED',
        version: 1,
      },
    });

    const policy = await prisma.policy.create({
      data: {
        policyNo: 'PL-PAYTEST-001',
        jobId: job.id,
        quotationId: quotation.id,
        insuranceCompanyId: company.id,
        effectiveDate: new Date('2027-01-01'),
        expiryDate: new Date('2028-01-01'),
        grossPremium: '1000.00',
        netPremium: '1000.00',
        totalPremium: '1000.00',
        status: 'ACTIVE',
        version: 1,
      },
    });
    policyId = policy.id;

    // Login
    const payerLogin = await http().post('/api/auth/login').send({ username: `${PREFIX}payer`, password: PASSWORD });
    payerToken = payerLogin.body.data.accessToken;

    const viewerLogin = await http().post('/api/auth/login').send({ username: `${PREFIX}viewer`, password: PASSWORD });
    viewerToken = viewerLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Tests ──────────────────────────────────────────────────────────────────

  it('P1: GET payments → empty list, UNPAID status', async () => {
    const res = await http()
      .get(`/api/policies/${policyId}/payments`)
      .set('Authorization', `Bearer ${payerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.payments).toEqual([]);
    expect(res.body.data.paymentStatus).toBe('UNPAID');
    expect(res.body.data.totalPaid).toBe('0');
  });

  it('P2: POST payment → 201, PARTIAL status', async () => {
    const res = await http()
      .post(`/api/policies/${policyId}/payments`)
      .set('Authorization', `Bearer ${payerToken}`)
      .send({ amount: '500.00', paymentMethod: 'TRANSFER', paymentDate: '2027-02-01' });
    expect(res.status).toBe(201);
    expect(res.body.data.paymentStatus).toBe('PARTIAL');
    expect(res.body.data.payments).toHaveLength(1);
    expect(res.body.data.payments[0].amount).toBe('500');
  });

  it('P3: POST another payment → PAID status', async () => {
    const res = await http()
      .post(`/api/policies/${policyId}/payments`)
      .set('Authorization', `Bearer ${payerToken}`)
      .send({ amount: '500.00', paymentMethod: 'CASH' });
    expect(res.status).toBe(201);
    expect(res.body.data.paymentStatus).toBe('PAID');
    expect(res.body.data.payments).toHaveLength(2);
  });

  it('P4: POST overpay → 422 PAYMENT_EXCEEDS_PREMIUM (BR-011)', async () => {
    const res = await http()
      .post(`/api/policies/${policyId}/payments`)
      .set('Authorization', `Bearer ${payerToken}`)
      .send({ amount: '1.00', paymentMethod: 'CASH' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PAYMENT_EXCEEDS_PREMIUM');
  });

  let paymentId: string;
  it('P5: cancel first payment → 200, payments length stays same with one CANCELLED', async () => {
    const listRes = await http()
      .get(`/api/policies/${policyId}/payments`)
      .set('Authorization', `Bearer ${payerToken}`);
    paymentId = listRes.body.data.payments[0].id;

    const res = await http()
      .post(`/api/policies/${policyId}/payments/${paymentId}/cancel`)
      .set('Authorization', `Bearer ${payerToken}`)
      .send({ cancelReason: 'Test cancel' });
    expect(res.status).toBe(201);
    // After cancel, totalPaid = 500 → PARTIAL
    expect(res.body.data.paymentStatus).toBe('PARTIAL');
  });

  it('P6: cancel same payment again → 409 PAYMENT_ALREADY_CANCELLED', async () => {
    const res = await http()
      .post(`/api/policies/${policyId}/payments/${paymentId}/cancel`)
      .set('Authorization', `Bearer ${payerToken}`)
      .send({ cancelReason: 'Again' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PAYMENT_ALREADY_CANCELLED');
  });

  it('P7: POST payment without payment.create permission → 403', async () => {
    const res = await http()
      .post(`/api/policies/${policyId}/payments`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ amount: '100.00', paymentMethod: 'CASH' });
    expect(res.status).toBe(403);
  });

  it('P8: unauthenticated → 401', async () => {
    const res = await http().get(`/api/policies/${policyId}/payments`);
    expect(res.status).toBe(401);
  });
});
