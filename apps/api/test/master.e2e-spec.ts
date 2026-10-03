import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_mst_';
const PASSWORD = 'E2e@Master1';

describe('Master Data (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let viewerToken: string;
  let motorProductId: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    // Clean up
    await prisma.insuranceCompany.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.insuranceType.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });

    const passwordHash = await hash(PASSWORD);

    // Upsert needed permissions
    const upsertPerm = (code: string) =>
      prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
    const [pManage, pView, pCustomerView] = await Promise.all([
      upsertPerm('master.manage'),
      upsertPerm('job.view'),
      upsertPerm('customer.view'),
    ]);

    // Admin role (has master.manage)
    const adminRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}ADMIN`,
        name: 'E2E Master Admin',
        permissions: { create: [{ permissionId: pManage.id }, { permissionId: pView.id }, { permissionId: pCustomerView.id }] },
      },
    });

    // Viewer role (no master.manage)
    const viewerRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}VIEWER`,
        name: 'E2E Master Viewer',
        permissions: { create: [{ permissionId: pView.id }, { permissionId: pCustomerView.id }] },
      },
    });

    const adminUser = await prisma.user.create({
      data: { username: `${PREFIX}admin`, email: `${PREFIX}admin@test.com`, fullName: 'Admin', passwordHash },
    });
    await prisma.userRole.create({ data: { userId: adminUser.id, roleId: adminRole.id } });

    const viewerUser = await prisma.user.create({
      data: { username: `${PREFIX}viewer`, email: `${PREFIX}viewer@test.com`, fullName: 'Viewer', passwordHash },
    });
    await prisma.userRole.create({ data: { userId: viewerUser.id, roleId: viewerRole.id } });

    // Login
    const adminRes = await http().post('/api/auth/login').send({ username: `${PREFIX}admin`, password: PASSWORD });
    adminToken = adminRes.body.data.accessToken as string;
    const viewerRes = await http().post('/api/auth/login').send({ username: `${PREFIX}viewer`, password: PASSWORD });
    viewerToken = viewerRes.body.data.accessToken as string;

    // Seed test insurance type + product + risk fields
    const motor = await prisma.insuranceType.upsert({
      where: { code: 'MOTOR' },
      update: {},
      create: { code: 'MOTOR', name: 'ประกันภัยรถยนต์' },
    });
    const product = await prisma.insuranceProduct.upsert({
      where: { code: 'MOTOR-001' },
      update: {},
      create: { code: 'MOTOR-001', name: 'ประกันภัยรถยนต์ชั้น 1', insuranceTypeId: motor.id },
    });
    motorProductId = product.id;

    const motorFields = [
      { fieldCode: 'brand', fieldName: 'ยี่ห้อรถ', fieldType: 'TEXT' as const, isRequired: true, sortOrder: 1 },
      { fieldCode: 'model', fieldName: 'รุ่นรถ', fieldType: 'TEXT' as const, isRequired: true, sortOrder: 2 },
      { fieldCode: 'year', fieldName: 'ปีรถ', fieldType: 'NUMBER' as const, isRequired: true, sortOrder: 3 },
      { fieldCode: 'license_plate', fieldName: 'ทะเบียนรถ', fieldType: 'TEXT' as const, isRequired: true, sortOrder: 4 },
      { fieldCode: 'engine_no', fieldName: 'เลขเครื่องยนต์', fieldType: 'TEXT' as const, isRequired: false, sortOrder: 5 },
      { fieldCode: 'chassis_no', fieldName: 'เลขตัวถัง', fieldType: 'TEXT' as const, isRequired: false, sortOrder: 6 },
      { fieldCode: 'vehicle_type', fieldName: 'ประเภทรถ', fieldType: 'SELECT' as const, isRequired: true, sortOrder: 7 },
      { fieldCode: 'usage_type', fieldName: 'ประเภทการใช้งาน', fieldType: 'SELECT' as const, isRequired: true, sortOrder: 8 },
      { fieldCode: 'sum_insured', fieldName: 'ทุนประกันภัย', fieldType: 'NUMBER' as const, isRequired: true, sortOrder: 9 },
    ];
    for (const f of motorFields) {
      await prisma.riskFieldDefinition.upsert({
        where: { productId_fieldCode: { productId: motorProductId, fieldCode: f.fieldCode } },
        update: { sortOrder: f.sortOrder },
        create: { productId: motorProductId, ...f },
      });
    }
  });

  afterAll(async () => {
    await prisma.insuranceCompany.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.insuranceType.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await app.close();
  });

  // ─── Insurance Types ─────────────────────────────────────────────────────

  describe('GET /master/insurance-types', () => {
    it('returns insurance types for any authenticated role', async () => {
      const res = await http().get('/api/master/insurance-types').set('Authorization', `Bearer ${viewerToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      const codes = (res.body.data as { code: string }[]).map((t) => t.code);
      expect(codes).toContain('MOTOR');
    });

    it('returns 401 without token', async () => {
      const res = await http().get('/api/master/insurance-types');
      expect(res.status).toBe(401);
    });
  });

  // ─── Risk Fields for Product (Done criteria) ─────────────────────────────

  describe('GET /master/products/:id/risk-fields', () => {
    it('returns Motor risk fields sorted by sortOrder — Done criteria', async () => {
      const res = await http()
        .get(`/api/master/products/${motorProductId}/risk-fields`)
        .set('Authorization', `Bearer ${viewerToken}`);
      expect(res.status).toBe(200);
      const fields = res.body.data as { fieldCode: string; sortOrder: number }[];
      expect(fields.length).toBe(9);
      // Verify ascending sort
      for (let i = 1; i < fields.length; i++) {
        expect(fields[i].sortOrder).toBeGreaterThanOrEqual(fields[i - 1].sortOrder);
      }
      const codes = fields.map((f) => f.fieldCode);
      expect(codes).toEqual(expect.arrayContaining(['brand', 'model', 'year', 'license_plate', 'sum_insured']));
    });
  });

  // ─── Permission guard — non-admin cannot mutate ──────────────────────────

  describe('master.manage permission', () => {
    it('403 when viewer POSTs to insurance-types', async () => {
      const res = await http()
        .post('/api/master/insurance-types')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ code: 'BLOCKED', name: 'Blocked' });
      expect(res.status).toBe(403);
    });

    it('ADMIN can create type and gets 409 on duplicate code', async () => {
      const code = `${PREFIX}TYPE`.toUpperCase();
      const first = await http()
        .post('/api/master/insurance-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code, name: 'Test Type' });
      expect(first.status).toBe(201);

      const dup = await http()
        .post('/api/master/insurance-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code, name: 'Dup Type' });
      expect(dup.status).toBe(409);
    });
  });

  // ─── Company soft-delete ─────────────────────────────────────────────────

  describe('Company CRUD', () => {
    it('403 when viewer deletes company', async () => {
      const res = await http()
        .delete('/api/master/companies/00000000-0000-0000-0000-000000000001')
        .set('Authorization', `Bearer ${viewerToken}`);
      expect(res.status).toBe(403);
    });

    it('ADMIN creates, then soft-deletes; deleted company returns 404', async () => {
      const createRes = await http()
        .post('/api/master/companies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: `${PREFIX}CO`, name: 'E2E Company' });
      expect(createRes.status).toBe(201);
      const id = createRes.body.data.id as string;

      await http().delete(`/api/master/companies/${id}`).set('Authorization', `Bearer ${adminToken}`).expect(204);

      const getRes = await http().get(`/api/master/companies/${id}`).set('Authorization', `Bearer ${adminToken}`);
      expect(getRes.status).toBe(404);
    });
  });
});
