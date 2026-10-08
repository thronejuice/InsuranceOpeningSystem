import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_cp_';
const PASSWORD = 'E2e@Company1';

// 1×1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('Company profile settings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let viewerToken: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.companyProfile.deleteMany({});
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });

    const passwordHash = await hash(PASSWORD);
    const pManage = await prisma.permission.upsert({ where: { code: 'master.manage' }, update: {}, create: { code: 'master.manage' } });
    const pView = await prisma.permission.upsert({ where: { code: 'job.view' }, update: {}, create: { code: 'job.view' } });

    const adminRole = await prisma.role.create({
      data: { code: `${PREFIX.toUpperCase()}ADMIN`, name: 'E2E CP Admin', permissions: { create: [{ permissionId: pManage.id }] } },
    });
    const viewerRole = await prisma.role.create({
      data: { code: `${PREFIX.toUpperCase()}VIEWER`, name: 'E2E CP Viewer', permissions: { create: [{ permissionId: pView.id }] } },
    });
    for (const [name, roleId] of [['admin', adminRole.id], ['viewer', viewerRole.id]] as const) {
      await prisma.user.create({
        data: {
          username: `${PREFIX}${name}`,
          email: `${PREFIX}${name}@test.com`,
          fullName: name,
          passwordHash,
          roles: { create: [{ roleId }] },
        },
      });
    }
    adminToken = (await http().post('/api/auth/login').send({ username: `${PREFIX}admin`, password: PASSWORD })).body.data.accessToken;
    viewerToken = (await http().post('/api/auth/login').send({ username: `${PREFIX}viewer`, password: PASSWORD })).body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.companyProfile.deleteMany({});
    await app.close();
  });

  const validBody = {
    nameTh: 'บริษัท ทดสอบ โบรกเกอร์ จำกัด',
    nameEn: 'Test Broker Co., Ltd.',
    taxId: '0105559999999',
    brokerLicenseNo: 'ว00012/2560',
    email: 'contact@example.com',
    proposalTerms: 'ข้อ 1\nข้อ 2',
    bankAccounts: [{ bankName: 'ธนาคารกสิกรไทย', branch: 'สีลม', accountName: 'บจก. ทดสอบ', accountNo: '123-4-56789-0' }],
  };

  it('GET /settings/company — unconfigured profile returns defaults', async () => {
    const res = await http().get('/api/settings/company').set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.configured).toBe(false);
    expect(res.body.data.nameTh).toBe('');
    expect(res.body.data.proposalTerms).toBeTruthy();
    expect(res.body.data.bankAccounts).toEqual([]);
  });

  it('POST /settings/company/logo — before the profile is saved → 422', async () => {
    const res = await http()
      .post('/api/settings/company/logo')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', PNG, 'logo.png');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('COMPANY_PROFILE_NOT_CONFIGURED');
  });

  it('PUT /settings/company — without master.manage → 403', async () => {
    const res = await http().put('/api/settings/company').set('Authorization', `Bearer ${viewerToken}`).send(validBody);
    expect(res.status).toBe(403);
  });

  it('PUT /settings/company — invalid bank account → 422', async () => {
    const res = await http()
      .put('/api/settings/company')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...validBody, bankAccounts: [{ bankName: 'X' }] });
    expect(res.status).toBe(422);
  });

  it('PUT /settings/company — admin saves the profile', async () => {
    const res = await http().put('/api/settings/company').set('Authorization', `Bearer ${adminToken}`).send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.data.configured).toBe(true);
    expect(res.body.data.nameTh).toBe(validBody.nameTh);
    expect(res.body.data.bankAccounts).toEqual(validBody.bankAccounts);
    expect(res.body.data.hasLogo).toBe(false);

    const log = await prisma.activityLog.findFirst({ where: { action: 'UPDATE_COMPANY_PROFILE' }, orderBy: { createdAt: 'desc' } });
    expect(log).not.toBeNull();
  });

  it('POST /settings/company/logo — rejects non-image content', async () => {
    const res = await http()
      .post('/api/settings/company/logo')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('%PDF-1.4 not an image'), 'logo.png');
    expect(res.status).toBe(422);
  });

  it('POST + GET + DELETE /settings/company/logo', async () => {
    const up = await http()
      .post('/api/settings/company/logo')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', PNG, 'logo.png');
    expect(up.status).toBe(201);
    expect(up.body.data.hasLogo).toBe(true);

    const get = await http().get('/api/settings/company/logo').set('Authorization', `Bearer ${viewerToken}`);
    expect(get.status).toBe(200);
    expect(get.headers['content-type']).toBe('image/png');

    const del = await http().delete('/api/settings/company/logo').set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(200);
    expect(del.body.data.hasLogo).toBe(false);

    const gone = await http().get('/api/settings/company/logo').set('Authorization', `Bearer ${viewerToken}`);
    expect(gone.status).toBe(404);
  });
});
