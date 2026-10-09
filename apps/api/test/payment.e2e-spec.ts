/**
 * Payment / Receipt / AR API E2E (Phase 4 Day 24)
 *
 * Sets up a policy with invoices directly via Prisma, then tests:
 * - payments are recorded against an invoice, bounded by its outstanding amount (OQ-4)
 * - partial → PARTIALLY_PAID, full → PAID + a receipt per payment, over/zero → 422
 * - cancel → payment CANCELLED + receipt VOID (nothing deleted), invoice status recomputed
 * - idempotency key, attachment must belong to the policy's job, 403/401, data-scope isolation
 * - daily job: past due → OVERDUE, PAYMENT_OVERDUE / PAYMENT_DUE notified once
 * - GET /receivables aging buckets
 */
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClsService } from 'nestjs-cls';
import { AppModule } from '../src/app.module.js';
import type { AppClsStore } from '../src/common/cls/app-cls-store.js';
import { BillingDocumentService } from '../src/modules/invoice/billing-document.service.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_pay_';
const PASSWORD = 'E2e@Pay123';

describe('Payment API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let payerToken: string;
  let viewerToken: string;
  let policyId: string;
  let customerId: string;
  let otherJobDocumentId: string;
  let payerId: string;
  let inv1: string; // 600.00, due far in the future
  let inv2: string; // 400.00, already past due

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
      await prisma.receipt.deleteMany({ where: { invoice: { policy: { jobId: { in: prevJobIds } } } } });
      await prisma.payment.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.invoice.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
      await prisma.policyCoverage.deleteMany({ where: { policy: { jobId: { in: prevJobIds } } } });
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
      upsertPerm('invoice.view'),
      upsertPerm('invoice.update'),
      upsertPerm('receivable.view'),
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
            { permission: { connect: { code: 'invoice.view' } } },
            { permission: { connect: { code: 'invoice.update' } } },
            { permission: { connect: { code: 'receivable.view' } } },
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
            { permission: { connect: { code: 'invoice.view' } } },
            { permission: { connect: { code: 'receivable.view' } } },
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
    customerId = customer.id;
    payerId = payer.id;

    const mkInvoice = (no: string, installmentNo: number, amount: string, dueDate: string) =>
      prisma.invoice.create({
        data: {
          invoiceNo: no,
          policyId: policy.id,
          customerId: customer.id,
          installmentNo,
          amount,
          netAmount: amount,
          dueDate: new Date(dueDate),
          status: 'PENDING',
        },
      });
    inv1 = (await mkInvoice('INV-PAYTEST-001', 1, '600.00', '2099-01-01')).id;
    inv2 = (await mkInvoice('INV-PAYTEST-002', 2, '400.00', '2020-01-01')).id;

    // A document that belongs to a DIFFERENT job — must never be accepted as an attachment
    const otherJob = await prisma.job.create({
      data: {
        jobNo: 'JOB-PAYTEST-002',
        insuranceTypeId: iType!.id,
        productId: product.id,
        customerId: customer.id,
        agentId: payer.id,
        effectiveDate: new Date('2027-01-01'),
        status: 'OPEN',
        version: 1,
      },
    });
    otherJobDocumentId = (
      await prisma.document.create({
        data: {
          jobId: otherJob.id,
          documentType: 'OTHER',
          originalName: 'slip.pdf',
          storedName: 'slip.pdf',
          mimeType: 'application/pdf',
          size: 10,
          storagePath: 'dummy/slip.pdf',
          status: 'UPLOADED',
          uploadedById: payer.id,
        },
      })
    ).id;

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

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const pay = (invoiceId: string, body: Record<string, unknown>, token = payerToken, headers: Record<string, string> = {}) =>
    http().post(`/api/invoices/${invoiceId}/payments`).set(auth(token)).set(headers).send(body);
  const getInvoice = async (id: string) =>
    (await http().get(`/api/invoices/${id}`).set(auth(payerToken))).body.data;

  it('I1: policy invoices start unpaid with the full amount outstanding', async () => {
    const res = await http().get(`/api/policies/${policyId}/invoices`).set(auth(payerToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    for (const inv of res.body.data) {
      expect(inv.paidAmount).toBe('0.00');
      expect(Number(inv.outstandingAmount)).toBe(Number(inv.amount));
    }
  });

  it('P1: partial payment → 201, PARTIALLY_PAID, outstanding reduced, receipt RC- issued', async () => {
    const res = await pay(inv1, {
      amount: '200.00',
      paymentMethod: 'TRANSFER',
      paymentDate: '2027-02-01',
      bank: 'KBank',
      referenceNo: 'TXN-001',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.invoice.status).toBe('PARTIALLY_PAID');
    expect(res.body.data.invoice.paidAmount).toBe('200.00');
    expect(res.body.data.invoice.outstandingAmount).toBe('400.00');
    expect(res.body.data.payment.amount).toBe('200');
    expect(res.body.data.payment.bank).toBe('KBank');
    expect(res.body.data.payment.referenceNo).toBe('TXN-001');
    expect(res.body.data.payment.createdById).toBe(payerId);
    expect(res.body.data.payment.receipt.receiptNo).toMatch(/^RC-\d{4}-\d{6}$/);
    expect(res.body.data.payment.receipt.status).toBe('ISSUED');
    expect(res.body.data.payment.receipt.amount).toBe('200');
  });

  it('P2: paying more than outstanding → 422 PAYMENT_EXCEEDS_OUTSTANDING (OQ-4), nothing recorded', async () => {
    const res = await pay(inv1, { amount: '400.01', paymentMethod: 'CASH' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PAYMENT_EXCEEDS_OUTSTANDING');
    expect((await getInvoice(inv1)).paidAmount).toBe('200.00');
  });

  it('P3: zero amount → 422 PAYMENT_INVALID_AMOUNT', async () => {
    const res = await pay(inv1, { amount: '0.00', paymentMethod: 'CASH' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PAYMENT_INVALID_AMOUNT');
  });

  let secondPaymentId: string;
  it('P4: paying the rest → PAID, a second receipt, both listed against the invoice', async () => {
    const res = await pay(inv1, { amount: '400.00', paymentMethod: 'CASH' });
    expect(res.status).toBe(201);
    secondPaymentId = res.body.data.payment.id;
    expect(res.body.data.invoice.status).toBe('PAID');
    expect(res.body.data.invoice.outstandingAmount).toBe('0.00');

    const receipts = await http().get('/api/receipts').query({ invoiceId: inv1 }).set(auth(payerToken));
    expect(receipts.status).toBe(200);
    expect(receipts.body.data.total).toBe(2);
    expect(receipts.body.data.items.every((r: { status: string }) => r.status === 'ISSUED')).toBe(true);

    const payments = await http().get(`/api/invoices/${inv1}/payments`).set(auth(payerToken));
    expect(payments.body.data.items).toHaveLength(2);
  });

  it('P5: any payment on a fully paid invoice → 409 INVOICE_ALREADY_PAID', async () => {
    const res = await pay(inv1, { amount: '1.00', paymentMethod: 'CASH' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVOICE_ALREADY_PAID');
  });

  let firstPaymentId: string;
  it('P6: cancel a payment → CANCELLED, receipt VOID (kept), invoice drops back to PARTIALLY_PAID', async () => {
    const list = await http().get(`/api/invoices/${inv1}/payments`).set(auth(payerToken));
    firstPaymentId = list.body.data.items.find((p: { id: string }) => p.id !== secondPaymentId).id;

    const res = await http()
      .post(`/api/payments/${firstPaymentId}/cancel`)
      .set(auth(payerToken))
      .send({ cancelReason: 'Slip was wrong' });
    expect(res.status).toBe(201);
    expect(res.body.data.payment.status).toBe('CANCELLED');
    expect(res.body.data.payment.receipt.status).toBe('VOID');
    expect(res.body.data.payment.receipt.voidReason).toBe('Slip was wrong');
    expect(res.body.data.payment.receipt.voidedAt).not.toBeNull();
    expect(res.body.data.invoice.status).toBe('PARTIALLY_PAID');
    expect(res.body.data.invoice.paidAmount).toBe('400.00');
    expect(res.body.data.invoice.outstandingAmount).toBe('200.00');

    const receipt = await prisma.receipt.findUnique({ where: { paymentId: firstPaymentId } });
    expect(receipt).not.toBeNull(); // voided, never deleted
  });

  it('P7: cancel the same payment again → 409 PAYMENT_ALREADY_CANCELLED', async () => {
    const res = await http()
      .post(`/api/payments/${firstPaymentId}/cancel`)
      .set(auth(payerToken))
      .send({ cancelReason: 'Again' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PAYMENT_ALREADY_CANCELLED');
  });

  it('P8: an invoice that has live payments cannot be cancelled', async () => {
    const res = await http().post(`/api/invoices/${inv1}/cancel`).set(auth(payerToken)).send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVOICE_HAS_PAYMENTS');
  });

  it('P9: the same Idempotency-Key replays the first result and records only one payment', async () => {
    const key = `${PREFIX}idem-${Date.now()}`;
    const first = await pay(inv1, { amount: '50.00', paymentMethod: 'CASH' }, payerToken, { 'Idempotency-Key': key });
    const second = await pay(inv1, { amount: '50.00', paymentMethod: 'CASH' }, payerToken, { 'Idempotency-Key': key });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.payment.id).toBe(first.body.data.payment.id);
    expect((await getInvoice(inv1)).paidAmount).toBe('450.00');
  });

  it('P10: an attachment from another job is rejected → 404 DOCUMENT_NOT_FOUND', async () => {
    const res = await pay(inv1, { amount: '10.00', paymentMethod: 'TRANSFER', attachmentId: otherJobDocumentId });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('DOCUMENT_NOT_FOUND');
    expect((await getInvoice(inv1)).paidAmount).toBe('450.00');
  });

  it('P11: without payment.create → 403; unauthenticated → 401', async () => {
    const forbidden = await pay(inv1, { amount: '1.00', paymentMethod: 'CASH' }, viewerToken);
    expect(forbidden.status).toBe(403);
    const anon = await http().get(`/api/policies/${policyId}/payments`);
    expect(anon.status).toBe(401);
  });

  it('S1: a user who does not own the job cannot see or pay its invoices', async () => {
    const seeInvoice = await http().get(`/api/invoices/${inv1}`).set(auth(viewerToken));
    expect(seeInvoice.status).toBe(404);
    const receivables = await http().get('/api/receivables').query({ policyId }).set(auth(viewerToken));
    expect(receivables.status).toBe(200);
    expect(receivables.body.data.items).toEqual([]);
    expect(receivables.body.data.summary.outstanding).toBe('0.00');
  });

  // ─── Daily job ──────────────────────────────────────────────────────────────

  const notificationCount = (type: 'PAYMENT_OVERDUE' | 'PAYMENT_DUE', entityId: string) =>
    prisma.notification.count({ where: { userId: payerId, type, entityId } });
  const daysFromNow = (n: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  let invDueSoon: string;
  let invLate: string;
  it('D1: daily job marks past-due invoices OVERDUE and notifies the job owner once', async () => {
    const run = await http().post('/api/invoices/process-daily').set(auth(payerToken)).send({});
    expect(run.status).toBe(201);
    expect(run.body.data.overdueCount).toBeGreaterThanOrEqual(1);

    expect((await getInvoice(inv2)).status).toBe('OVERDUE');
    expect(await notificationCount('PAYMENT_OVERDUE', inv2)).toBe(1);

    const again = await http().post('/api/invoices/process-daily').set(auth(payerToken)).send({});
    expect(again.status).toBe(201);
    expect(await notificationCount('PAYMENT_OVERDUE', inv2)).toBe(1); // not re-notified
  });

  it('D2: an invoice due within 3 days gets exactly one PAYMENT_DUE reminder', async () => {
    const mk = (no: string, n: number, amount: string, due: string) =>
      prisma.invoice.create({
        data: { invoiceNo: no, policyId, customerId, installmentNo: n, amount, netAmount: amount, dueDate: new Date(due), status: 'PENDING' },
      });
    invDueSoon = (await mk('INV-PAYTEST-003', 3, '100.00', daysFromNow(2))).id;
    // Due 45 days ago: lands in the 31–60 aging bucket once the job marks it OVERDUE
    invLate = (await mk('INV-PAYTEST-004', 4, '80.00', daysFromNow(-45))).id;

    await http().post('/api/invoices/process-daily').set(auth(payerToken)).send({});
    expect(await notificationCount('PAYMENT_DUE', invDueSoon)).toBe(1);
    expect((await getInvoice(invDueSoon)).status).toBe('PENDING');
    expect((await getInvoice(invLate)).status).toBe('OVERDUE');

    await http().post('/api/invoices/process-daily').set(auth(payerToken)).send({});
    expect(await notificationCount('PAYMENT_DUE', invDueSoon)).toBe(1);
  });

  it('D3: part-paying an overdue invoice keeps it OVERDUE; settling it makes it PAID', async () => {
    const partial = await pay(inv2, { amount: '100.00', paymentMethod: 'CASH' });
    expect(partial.body.data.invoice.status).toBe('OVERDUE');
    expect(partial.body.data.invoice.outstandingAmount).toBe('300.00');

    const rest = await pay(inv2, { amount: '300.00', paymentMethod: 'CASH' });
    expect(rest.body.data.invoice.status).toBe('PAID');
  });

  // ─── Receivables / aging ────────────────────────────────────────────────────

  it('R1: receivables by policy — outstanding and aging buckets exclude paid invoices', async () => {
    const res = await http().get('/api/receivables').query({ groupBy: 'policy', policyId }).set(auth(payerToken));
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);

    const g = res.body.data.items[0];
    expect(g.policyNo).toBe('PL-PAYTEST-001');
    expect(g.invoiceCount).toBe(3); // inv1 (150 left), due-soon (100), late (80); inv2 is PAID
    expect(g.outstanding).toBe('330.00');
    expect(g.aging).toEqual({ NOT_DUE: '250.00', D0_30: '0.00', D31_60: '80.00', D61_90: '0.00', D90_PLUS: '0.00' });
    expect(res.body.data.summary.outstanding).toBe('330.00');
  });

  it('R2: receivables by customer rolls the same invoices up per customer', async () => {
    const res = await http().get('/api/receivables').query({ customerId }).set(auth(payerToken));
    expect(res.status).toBe(200);
    expect(res.body.data.groupBy).toBe('customer');
    expect(res.body.data.items[0].customerId).toBe(customerId);
    expect(res.body.data.items[0].outstanding).toBe('330.00');
  });

  // ─── Billing PDFs (Day 25) ──────────────────────────────────────────────────

  const getPdf = (path: string, token = payerToken) =>
    http()
      .get(path)
      .set(auth(token))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
  /** The document data builders read the caller from CLS, exactly as a request would set it. */
  const asPayer = <T>(fn: (svc: BillingDocumentService) => Promise<T>) =>
    app.get(ClsService<AppClsStore>).runWith(
      { userId: payerId, permissions: ['invoice.view', 'payment.view'], dataScope: 'OWN', teamUserIds: [] },
      () => fn(app.get(BillingDocumentService)),
    );
  const expectPdf = (res: { status: number; headers: Record<string, string>; body: Buffer }, fileName: string) => {
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toContain(encodeURIComponent(fileName));
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(res.body.length).toBeGreaterThan(5_000);
  };

  let pdfInvoice: string;
  const pdfReceipts: string[] = [];
  it('G1: invoice PDF renders and its data equals what the database holds', async () => {
    pdfInvoice = (
      await prisma.invoice.create({
        data: {
          invoiceNo: 'INV-PAYTEST-006',
          policyId,
          customerId,
          installmentNo: 2,
          amount: '1000.00',
          netAmount: '900.00',
          stampDuty: '4.00',
          vat: '96.00',
          dueDate: new Date('2099-01-01'),
          status: 'PENDING',
        },
      })
    ).id;
    for (const amount of ['300.00', '200.00']) {
      const res = await pay(pdfInvoice, { amount, paymentMethod: 'TRANSFER', bank: 'KBank', referenceNo: `REF-${amount}` });
      pdfReceipts.push(res.body.data.payment.receipt.id);
    }

    expectPdf(await getPdf(`/api/invoices/${pdfInvoice}/pdf`), 'INV-PAYTEST-006.pdf');

    const data = await asPayer((svc) => svc.buildInvoiceData(pdfInvoice));
    expect(data.kind).toBe('INVOICE');
    expect(data.invoice).toMatchObject({ invoiceNo: 'INV-PAYTEST-006', status: 'PARTIALLY_PAID', installmentNo: 2 });
    expect(data.amounts).toEqual({ net: '900', stampDuty: '4', vat: '96', total: '1000' });
    expect(data.paid).toBe('500.00');
    expect(data.outstanding).toBe('500.00');
    expect(data.policy.policyNo).toBe('PL-PAYTEST-001');
    expect(data.customer.name).toContain('ยอดPay');
  });

  it('G2: receipt PDF renders and its balance is as of that payment, unaffected by later ones', async () => {
    expectPdf(await getPdf(`/api/receipts/${pdfReceipts[0]}/pdf`), '.pdf');

    const first = await asPayer((svc) => svc.buildReceiptData(pdfReceipts[0]));
    expect(first.receipt.status).toBe('ISSUED');
    expect(first.amount).toBe('300');
    expect(first.payment).toMatchObject({ method: 'TRANSFER', bank: 'KBank', referenceNo: 'REF-300.00' });
    expect(first.invoice).toMatchObject({ invoiceNo: 'INV-PAYTEST-006', amount: '1000', paidToDate: '300.00', balance: '700.00' });

    const second = await asPayer((svc) => svc.buildReceiptData(pdfReceipts[1]));
    expect(second.invoice).toMatchObject({ paidToDate: '500.00', balance: '500.00' });

    // A third payment must not rewrite the first two receipts
    await pay(pdfInvoice, { amount: '100.00', paymentMethod: 'CASH' });
    const firstAgain = await asPayer((svc) => svc.buildReceiptData(pdfReceipts[0]));
    expect(firstAgain.invoice).toMatchObject({ paidToDate: '300.00', balance: '700.00' });
  });

  it('G3: a voided receipt still prints, as VOID with its reason', async () => {
    const cancel = await http()
      .post(`/api/payments/${(await prisma.receipt.findUniqueOrThrow({ where: { id: pdfReceipts[1] } })).paymentId}/cancel`)
      .set(auth(payerToken))
      .send({ cancelReason: 'Cheque bounced' });
    expect(cancel.status).toBe(201);

    expectPdf(await getPdf(`/api/receipts/${pdfReceipts[1]}/pdf`), '.pdf');
    const data = await asPayer((svc) => svc.buildReceiptData(pdfReceipts[1]));
    expect(data.receipt).toMatchObject({ status: 'VOID', voidReason: 'Cheque bounced' });
    expect(data.invoice.paidToDate).toBe('0.00');
  });

  it('G4: debit and credit notes use their own document type', async () => {
    for (const [type, no] of [['DEBIT_NOTE', 'INV-PAYTEST-007'], ['CREDIT_NOTE', 'INV-PAYTEST-008']] as const) {
      const note = await prisma.invoice.create({
        data: { invoiceNo: no, policyId, customerId, type, amount: '107.00', netAmount: '100.00', stampDuty: '0', vat: '7.00', dueDate: new Date('2099-01-01'), status: 'PENDING' },
      });
      expectPdf(await getPdf(`/api/invoices/${note.id}/pdf`), `${no}.pdf`);
      const data = await asPayer((svc) => svc.buildInvoiceData(note.id));
      expect(data.kind).toBe(type);
      expect(data.amounts.total).toBe('107');
    }
  });

  it('G5: billing PDFs respect data scope and authentication', async () => {
    expect((await getPdf(`/api/invoices/${pdfInvoice}/pdf`, viewerToken)).status).toBe(404);
    expect((await getPdf(`/api/receipts/${pdfReceipts[0]}/pdf`, viewerToken)).status).toBe(404);
    expect((await http().get(`/api/invoices/${pdfInvoice}/pdf`)).status).toBe(401);
    expect((await http().get(`/api/receipts/${pdfReceipts[0]}/pdf`)).status).toBe(401);
    expect((await getPdf('/api/invoices/00000000-0000-7000-8000-000000000000/pdf')).status).toBe(404);
  });

  it('C1: two simultaneous payments cannot both pass the outstanding check (row lock)', async () => {
    const inv = await prisma.invoice.create({
      data: {
        invoiceNo: 'INV-PAYTEST-005',
        policyId,
        customerId,
        installmentNo: 5,
        amount: '500.00',
        netAmount: '500.00',
        dueDate: new Date('2099-01-01'),
        status: 'PENDING',
      },
    });

    const [a, b] = await Promise.all([
      pay(inv.id, { amount: '300.00', paymentMethod: 'CASH' }),
      pay(inv.id, { amount: '300.00', paymentMethod: 'CASH' }),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 422]);
    const rejected = a.status === 422 ? a : b;
    expect(rejected.body.code).toBe('PAYMENT_EXCEEDS_OUTSTANDING');

    const after = await getInvoice(inv.id);
    expect(after.paidAmount).toBe('300.00');
    expect(after.outstandingAmount).toBe('200.00');
    expect(await prisma.receipt.count({ where: { invoiceId: inv.id } })).toBe(1);
  });

  it('R3: receivables and receipts require authentication → 401', async () => {
    expect((await http().get('/api/receivables')).status).toBe(401);
    expect((await http().get('/api/receipts')).status).toBe(401);
  });
});
