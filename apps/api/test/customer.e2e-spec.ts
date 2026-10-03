import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_cust_';
const PASSWORD = 'E2e@Password1';

// Computed valid Thai IDs (checksum verified)
const VALID_CITIZEN_ID = '1234567890121'; // sum=352, check=1
const VALID_TAX_ID = '0105544090768';     // sum=245, check=8

describe('Customer (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminToken: string;  // has customer.view + create + update + delete + view_sensitive
  let viewerToken: string; // has only customer.view
  let createdId: string;

  const http = () => request(app.getHttpServer());

  const login = async (username: string) => {
    const res = await http().post('/api/auth/login').send({ username, password: PASSWORD });
    return res.body.data.accessToken as string;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);

    // Clean previous test data (including CUS-XXXXXX customers created by test users from prior runs)
    const prevUsers = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
    const prevUserIds = prevUsers.map((u) => u.id);
    // Delete by createdById (if test users still exist) AND by known test sentinel values
    await prisma.customerAddress.deleteMany({
      where: {
        OR: [
          ...(prevUserIds.length > 0 ? [{ customer: { createdById: { in: prevUserIds } } }] : []),
          { customer: { citizenId: VALID_CITIZEN_ID } },
          { customer: { taxId: VALID_TAX_ID } },
        ],
      },
    });
    await prisma.customer.deleteMany({
      where: {
        OR: [
          ...(prevUserIds.length > 0 ? [{ createdById: { in: prevUserIds } }] : []),
          { citizenId: VALID_CITIZEN_ID },
          { taxId: VALID_TAX_ID },
        ],
      },
    });
    // Clean up CUS-* customers that have no jobs (orphaned from failed test runs)
    const orphanedCus = await prisma.customer.findMany({
      where: { customerCode: { startsWith: 'CUS-' }, jobs: { none: {} } },
      select: { id: true },
    });
    const orphanedCusIds = orphanedCus.map((c) => c.id);
    if (orphanedCusIds.length > 0) {
      await prisma.customerAddress.deleteMany({ where: { customerId: { in: orphanedCusIds } } });
      await prisma.customerContact.deleteMany({ where: { customerId: { in: orphanedCusIds } } });
      await prisma.customer.deleteMany({ where: { id: { in: orphanedCusIds } } });
    }
    await prisma.customer.deleteMany({ where: { customerCode: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });

    const passwordHash = await hash(PASSWORD);

    // Upsert permissions needed
    const upsertPerm = (code: string) =>
      prisma.permission.upsert({ where: { code }, update: {}, create: { code } });

    const [pView, pCreate, pUpdate, pDelete, pSensitive] = await Promise.all([
      upsertPerm('customer.view'),
      upsertPerm('customer.create'),
      upsertPerm('customer.update'),
      upsertPerm('customer.delete'),
      upsertPerm('customer.view_sensitive'),
    ]);

    // Admin role: all customer permissions
    const adminRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}ADMIN`,
        name: 'E2E Customer Admin',
        permissions: {
          create: [
            { permissionId: pView.id },
            { permissionId: pCreate.id },
            { permissionId: pUpdate.id },
            { permissionId: pDelete.id },
            { permissionId: pSensitive.id },
          ],
        },
      },
    });

    // Viewer role: only customer.view
    const viewerRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}VIEWER`,
        name: 'E2E Customer Viewer',
        permissions: { create: [{ permissionId: pView.id }] },
      },
    });

    // Create test users
    await prisma.user.create({
      data: {
        username: `${PREFIX}admin`,
        email: `${PREFIX}admin@example.test`,
        fullName: 'E2E Admin',
        passwordHash,
        roles: { create: { roleId: adminRole.id } },
      },
    });
    await prisma.user.create({
      data: {
        username: `${PREFIX}viewer`,
        email: `${PREFIX}viewer@example.test`,
        fullName: 'E2E Viewer',
        passwordHash,
        roles: { create: { roleId: viewerRole.id } },
      },
    });

    adminToken = await login(`${PREFIX}admin`);
    viewerToken = await login(`${PREFIX}viewer`);
  });

  afterAll(async () => {
    const testUsers = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
    const testUserIds = testUsers.map((u) => u.id);
    await prisma.customerAddress.deleteMany({
      where: {
        OR: [
          ...(testUserIds.length > 0 ? [{ customer: { createdById: { in: testUserIds } } }] : []),
          { customer: { citizenId: VALID_CITIZEN_ID } },
          { customer: { taxId: VALID_TAX_ID } },
        ],
      },
    });
    await prisma.customer.deleteMany({
      where: {
        OR: [
          ...(testUserIds.length > 0 ? [{ createdById: { in: testUserIds } }] : []),
          { citizenId: VALID_CITIZEN_ID },
          { taxId: VALID_TAX_ID },
        ],
      },
    });
    await prisma.customer.deleteMany({ where: { customerCode: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await app.close();
  });

  // ─── CREATE ───────────────────────────────────────────────────────────────

  describe('POST /api/customers', () => {
    it('creates an INDIVIDUAL customer', async () => {
      const res = await http()
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerType: 'INDIVIDUAL',
          firstName: 'สมชาย',
          lastName: 'ใจดี',
          citizenId: VALID_CITIZEN_ID,
          mobile: '0812345678',
          email: 'somchai@example.com',
          addresses: [
            {
              addressType: 'HOME',
              addressLine: '123 ถ.รัชดา',
              province: 'กรุงเทพมหานคร',
              isPrimary: true,
            },
          ],
          contacts: [],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.customerCode).toMatch(/^CUS-\d{6}$/);
      expect(res.body.data.customerType).toBe('INDIVIDUAL');
      expect(res.body.data.firstName).toBe('สมชาย');
      // admin has view_sensitive so citizenId should be unmasked
      expect(res.body.data.citizenId).toBe(VALID_CITIZEN_ID);
      expect(res.body.data.addresses).toHaveLength(1);

      createdId = res.body.data.id;
    });

    it('creates a CORPORATE customer', async () => {
      const res = await http()
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerType: 'CORPORATE',
          companyName: 'บริษัท ABC จำกัด',
          taxId: VALID_TAX_ID,
          phone: '021234567',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.companyName).toBe('บริษัท ABC จำกัด');
    });

    it('returns 422 when INDIVIDUAL is missing firstName', async () => {
      const res = await http()
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ customerType: 'INDIVIDUAL', lastName: 'ใจดี' });

      expect(res.status).toBe(422);
    });

    it('returns 422 when CORPORATE is missing companyName', async () => {
      const res = await http()
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ customerType: 'CORPORATE' });

      expect(res.status).toBe(422);
    });

    it('returns 422 for invalid citizenId checksum', async () => {
      const res = await http()
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerType: 'INDIVIDUAL',
          firstName: 'ทดสอบ',
          lastName: 'ผิด',
          citizenId: '1234567890122', // wrong check digit
        });

      expect(res.status).toBe(422);
    });

    it('returns 403 when user lacks customer.create', async () => {
      const res = await http()
        .post('/api/customers')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ customerType: 'INDIVIDUAL', firstName: 'ทดสอบ', lastName: 'ทดสอบ' });

      expect(res.status).toBe(403);
    });

    it('returns 401 without token', async () => {
      const res = await http().post('/api/customers').send({ customerType: 'INDIVIDUAL' });
      expect(res.status).toBe(401);
    });
  });

  // ─── LIST ────────────────────────────────────────────────────────────────

  describe('GET /api/customers', () => {
    it('returns paginated list', async () => {
      const res = await http()
        .get('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta).toMatchObject({ page: 1 });
    });

    it('filters by customerType', async () => {
      const res = await http()
        .get('/api/customers?customerType=INDIVIDUAL')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((c: { customerType: string }) => c.customerType === 'INDIVIDUAL')).toBe(true);
    });

    it('searches by name', async () => {
      const res = await http()
        .get('/api/customers?q=สมชาย')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.some((c: { firstName: string }) => c.firstName === 'สมชาย')).toBe(true);
    });

    it('viewer can list customers', async () => {
      const res = await http()
        .get('/api/customers')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
    });
  });

  // ─── FIND ONE ────────────────────────────────────────────────────────────

  describe('GET /api/customers/:id', () => {
    it('returns the customer with relations', async () => {
      const res = await http()
        .get(`/api/customers/${createdId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(createdId);
      expect(res.body.data.addresses).toBeDefined();
      expect(res.body.data.contacts).toBeDefined();
    });

    it('masks citizenId for viewer without view_sensitive', async () => {
      const res = await http()
        .get(`/api/customers/${createdId}`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.citizenId).toMatch(/xxxxx/);
    });

    it('returns 404 for unknown id', async () => {
      const res = await http()
        .get('/api/customers/00000000-0000-7000-8000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ─── UPDATE ──────────────────────────────────────────────────────────────

  describe('PUT /api/customers/:id', () => {
    it('updates the customer', async () => {
      const res = await http()
        .put(`/api/customers/${createdId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ mobile: '0899999999' });

      expect(res.status).toBe(200);
      expect(res.body.data.mobile).toBe('0899999999');
    });

    it('returns 403 when user lacks customer.update', async () => {
      const res = await http()
        .put(`/api/customers/${createdId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ mobile: '0899999999' });

      expect(res.status).toBe(403);
    });
  });

  // ─── DELETE (soft delete) ─────────────────────────────────────────────────

  describe('DELETE /api/customers/:id', () => {
    it('soft-deletes the customer (204)', async () => {
      const res = await http()
        .delete(`/api/customers/${createdId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(204);
    });

    it('deleted customer does not appear in list', async () => {
      const res = await http()
        .get(`/api/customers?q=สมชาย`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((c: { id: string }) => c.id !== createdId)).toBe(true);
    });

    it('returns 404 when fetching a deleted customer', async () => {
      const res = await http()
        .get(`/api/customers/${createdId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 403 when user lacks customer.delete', async () => {
      const tempRes = await http()
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ customerType: 'INDIVIDUAL', firstName: 'ทดสอบ', lastName: 'ลบ' });
      expect(tempRes.status).toBe(201);
      const tempId = tempRes.body.data.id as string;

      const res = await http()
        .delete(`/api/customers/${tempId}`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
    });
  });
});
