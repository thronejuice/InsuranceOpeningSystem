import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_ins_';
const UP = PREFIX.toUpperCase();
const PASSWORD = 'E2e@Insurer1';

/** Phase 7 / Day 42 — insurer contacts, accepted products (+ commission rate) and performance stats. */
describe('Insurer management (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let reportToken: string;
  let viewerToken: string;
  let insurerId: string;
  let emptyInsurerId: string;
  let productA: string;
  let productB: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function cleanup() {
    const jobs = await prisma.job.findMany({ where: { jobNo: { startsWith: UP } }, select: { id: true } });
    const jobIds = jobs.map((j) => j.id);
    await prisma.policy.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.quotation.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
    await prisma.customer.deleteMany({ where: { customerCode: { startsWith: UP } } });
    const insurers = await prisma.insuranceCompany.findMany({ where: { code: { startsWith: UP } }, select: { id: true } });
    const ids = insurers.map((i) => i.id);
    await prisma.commissionRate.deleteMany({ where: { insuranceCompanyId: { in: ids } } });
    await prisma.insurerProduct.deleteMany({ where: { insuranceCompanyId: { in: ids } } });
    await prisma.insurerContact.deleteMany({ where: { insuranceCompanyId: { in: ids } } });
    await prisma.insuranceCompany.deleteMany({ where: { id: { in: ids } } });
    await prisma.insuranceProduct.deleteMany({ where: { code: { startsWith: UP } } });
    await prisma.insuranceType.deleteMany({ where: { code: { startsWith: UP } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: UP } } });
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    await cleanup();

    const perm = (code: string) => prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } });
    const [manage, report, jobView, rateView] = await Promise.all([perm('master.manage'), perm('report.view'), perm('job.view'), perm('commission.rate_view')]);
    const passwordHash = await hash(PASSWORD);
    const mkUser = async (suffix: string, permissionIds: string[]) => {
      const role = await prisma.role.create({
        data: { code: `${UP}${suffix}`, name: `E2E ${suffix}`, permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) } },
      });
      const user = await prisma.user.create({ data: { username: `${PREFIX}${suffix.toLowerCase()}`, email: `${PREFIX}${suffix.toLowerCase()}@test.com`, fullName: suffix, passwordHash } });
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
      const res = await http().post('/api/auth/login').send({ username: user.username, password: PASSWORD });
      return { id: user.id, token: res.body.data.accessToken as string };
    };
    const admin = await mkUser('ADMIN', [manage.id, report.id, jobView.id, rateView.id]);
    adminToken = admin.token;
    reportToken = (await mkUser('REPORT', [report.id, jobView.id])).token;
    viewerToken = (await mkUser('VIEWER', [jobView.id])).token;

    const type = await prisma.insuranceType.create({ data: { code: `${UP}T`, name: 'E2E insurer type' } });
    productA = (await prisma.insuranceProduct.create({ data: { code: `${UP}A`, name: 'Insurer product A', insuranceTypeId: type.id } })).id;
    productB = (await prisma.insuranceProduct.create({ data: { code: `${UP}B`, name: 'Insurer product B', insuranceTypeId: type.id } })).id;
    insurerId = (await prisma.insuranceCompany.create({ data: { code: `${UP}MAIN`, name: 'E2E Insurer' } })).id;
    emptyInsurerId = (await prisma.insuranceCompany.create({ data: { code: `${UP}EMPTY`, name: 'E2E Empty Insurer' } })).id;

    // Business for the stats: 6 quotations (2 requested, 1 cancelled, 2 received, 1 selected), 2 policies
    const customer = await prisma.customer.create({ data: { customerCode: `${UP}C1`, customerType: 'INDIVIDUAL', firstName: 'Stat', lastName: 'Customer' } });
    const mkJob = (n: number) =>
      prisma.job.create({
        data: { jobNo: `${UP}J${n}`, customerId: customer.id, insuranceTypeId: type.id, productId: productA, agentId: admin.id, effectiveDate: new Date('2027-01-01') },
      });
    const statuses = ['REQUESTED', 'REQUESTED', 'CANCELLED', 'RECEIVED', 'RECEIVED', 'SELECTED'] as const;
    const quotes = [];
    for (const [i, status] of statuses.entries()) {
      const job = await mkJob(i);
      quotes.push(await prisma.quotation.create({ data: { jobId: job.id, insuranceCompanyId: insurerId, quotationNo: `${UP}Q${i}`, status } }));
    }
    const mkPolicy = (i: number, status: 'ACTIVE' | 'CANCELLED', premium: string) =>
      prisma.policy.create({
        data: {
          policyNo: `${UP}P${i}`, jobId: quotes[i].jobId, quotationId: quotes[i].id, insuranceCompanyId: insurerId,
          effectiveDate: new Date('2027-01-01'), status, totalPremium: premium,
        },
      });
    await mkPolicy(3, 'ACTIVE', '10000.10');
    await mkPolicy(5, 'CANCELLED', '2500.50');
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  // ─── Contacts ──────────────────────────────────────────────────────────────

  it('C1: contacts — create, one primary at a time, underwriter filter', async () => {
    const base = `/api/master/companies/${insurerId}/contacts`;
    const first = await http().post(base).set(auth(adminToken)).send({ name: 'Somchai', position: 'Sales', isPrimary: true });
    expect(first.status).toBe(201);
    const second = await http().post(base).set(auth(adminToken)).send({ name: 'Malee', isUnderwriter: true, isPrimary: true });
    expect(second.status).toBe(201);

    const list = (await http().get(base).set(auth(viewerToken))).body.data as { id: string; name: string; isPrimary: boolean }[];
    expect(list).toHaveLength(2);
    expect(list.filter((c) => c.isPrimary).map((c) => c.name)).toEqual(['Malee']); // the newest primary wins
    expect(list[0].name).toBe('Malee'); // primary listed first

    const uw = (await http().get(base).query({ underwriter: 'true' }).set(auth(viewerToken))).body.data as { name: string }[];
    expect(uw.map((c) => c.name)).toEqual(['Malee']);

    // Making the first one primary again moves the flag
    const back = await http().put(`/api/master/companies/contacts/${first.body.data.id}`).set(auth(adminToken)).send({ isPrimary: true });
    expect(back.status).toBe(200);
    expect(await prisma.insurerContact.count({ where: { insuranceCompanyId: insurerId, isPrimary: true, deletedAt: null } })).toBe(1);
  });

  it('C2: the database refuses two primary contacts even if the application slips', async () => {
    await expect(
      prisma.insurerContact.createMany({ data: [{ insuranceCompanyId: emptyInsurerId, name: 'A', isPrimary: true }, { insuranceCompanyId: emptyInsurerId, name: 'B', isPrimary: true }] }),
    ).rejects.toThrow();
  });

  it('C3: contacts validate input, deactivated underwriters are not offered, delete is soft; writes need master.manage', async () => {
    const base = `/api/master/companies/${insurerId}/contacts`;
    expect((await http().post(base).set(auth(adminToken)).send({ position: 'no name' })).status).toBe(422);
    expect((await http().post(base).set(auth(viewerToken)).send({ name: 'X' })).status).toBe(403);

    const uwId = (await prisma.insurerContact.findFirstOrThrow({ where: { insuranceCompanyId: insurerId, isUnderwriter: true } })).id;
    await http().put(`/api/master/companies/contacts/${uwId}`).set(auth(adminToken)).send({ active: false });
    const offered = (await http().get(base).query({ underwriter: 'true' }).set(auth(viewerToken))).body.data as unknown[];
    expect(offered).toHaveLength(0);

    expect((await http().delete(`/api/master/companies/contacts/${uwId}`).set(auth(adminToken))).status).toBe(204);
    expect((await prisma.insurerContact.findUniqueOrThrow({ where: { id: uwId } })).deletedAt).not.toBeNull();
    expect((await http().get(`/api/master/companies/${'00000000-0000-7000-8000-000000000000'}/contacts`).set(auth(adminToken))).status).toBe(404);
  });

  // ─── Accepted products + commission rate ───────────────────────────────────

  it('P1: add accepted products; duplicates, unknown products and missing permission are rejected', async () => {
    const base = `/api/insurers/${insurerId}/products`;
    const added = await http().post(base).set(auth(adminToken)).send({ productId: productA, remark: 'Motor desk' });
    expect(added.status).toBe(201);
    expect(added.body.data).toMatchObject({ productId: productA, productCode: `${UP}A`, remark: 'Motor desk', currentRate: null, rates: [] });

    const dup = await http().post(base).set(auth(adminToken)).send({ productId: productA });
    expect([dup.status, dup.body.code]).toEqual([409, 'INSURER_PRODUCT_EXISTS']);
    expect((await http().post(base).set(auth(adminToken)).send({ productId: '00000000-0000-7000-8000-000000000000' })).status).toBe(404);
    expect((await http().post(base).set(auth(adminToken)).send({ productId: 'nope' })).status).toBe(422);
    expect((await http().post(base).set(auth(viewerToken)).send({ productId: productB })).status).toBe(403);
    expect((await http().get(base)).status).toBe(401);
  });

  it('P2: the list shows the commission rate effective today and the rate history', async () => {
    await http().post(`/api/insurers/${insurerId}/products`).set(auth(adminToken)).send({ productId: productB });
    const rate = (body: object) => http().post('/api/master/commission-rates').set(auth(adminToken)).send({ insuranceCompanyId: insurerId, productId: productA, ...body });
    expect((await rate({ rate: '10.0000', effectiveFrom: '2020-01-01', effectiveTo: '2025-12-31' })).status).toBe(201);
    expect((await rate({ rate: '12.5000', effectiveFrom: '2026-01-01' })).status).toBe(201);
    expect((await rate({ rate: '15.0000', effectiveFrom: '2099-01-01' })).status).toBe(201);

    // Without commission.rate_view the products are listed but the broker's margin stays hidden
    const hidden = (await http().get(`/api/insurers/${insurerId}/products`).set(auth(viewerToken))).body.data as { currentRate: string | null; rates: unknown[] }[];
    expect(hidden.length).toBe(2);
    expect(hidden.every((p) => p.currentRate === null && p.rates.length === 0)).toBe(true);

    const list = (await http().get(`/api/insurers/${insurerId}/products`).set(auth(adminToken))).body.data as {
      productId: string; currentRate: string | null; rates: { rate: string }[];
    }[];
    expect(list.map((p) => p.productId).sort()).toEqual([productA, productB].sort());
    const a = list.find((p) => p.productId === productA)!;
    expect(a.currentRate).toBe('12.5000');
    expect(a.rates.map((r) => r.rate)).toEqual(['15.0000', '12.5000', '10.0000']); // newest first
    expect(list.find((p) => p.productId === productB)!.currentRate).toBeNull();
  });

  it('P3: removing a product is soft, can be repeated once, and can be re-added; audit entries exist', async () => {
    const url = `/api/insurers/${insurerId}/products/${productB}`;
    expect((await http().delete(url).set(auth(viewerToken))).status).toBe(403);
    expect((await http().delete(url).set(auth(adminToken))).status).toBe(204);
    expect((await http().delete(url).set(auth(adminToken))).status).toBe(404);
    expect((await http().get(`/api/insurers/${insurerId}/products`).set(auth(adminToken))).body.data).toHaveLength(1);

    expect((await http().post(`/api/insurers/${insurerId}/products`).set(auth(adminToken)).send({ productId: productB })).status).toBe(201);
    expect(await prisma.insurerProduct.count({ where: { insuranceCompanyId: insurerId, productId: productB } })).toBe(2); // one soft-deleted
    const actions = (await prisma.activityLog.findMany({ where: { entityId: insurerId } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['ADD_INSURER_PRODUCT', 'REMOVE_INSURER_PRODUCT']));
  });

  // ─── Stats ─────────────────────────────────────────────────────────────────

  it('S1: stats — conversion and issued premium are exact', async () => {
    const res = await http().get(`/api/insurers/${insurerId}/stats`).set(auth(reportToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      quotations: { total: 6, received: 3, selected: 1 },
      winRatePct: '33.33',
      policies: { issued: 1, cancelled: 1 },
      issuedPremium: '10000.10',
      cancelledPremium: '2500.50',
    });
  });

  it('S2: stats for an insurer with no business, permission, and unknown insurer', async () => {
    const empty = await http().get(`/api/insurers/${emptyInsurerId}/stats`).set(auth(reportToken));
    expect(empty.body.data).toMatchObject({ winRatePct: '0.00', issuedPremium: '0.00', quotations: { total: 0 } });
    expect((await http().get(`/api/insurers/${insurerId}/stats`).set(auth(viewerToken))).status).toBe(403);
    expect((await http().get(`/api/insurers/${insurerId}/stats`)).status).toBe(401);
    expect((await http().get('/api/insurers/00000000-0000-7000-8000-000000000000/stats').set(auth(reportToken))).status).toBe(404);
  });
});
