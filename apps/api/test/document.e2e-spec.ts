import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_doc_';
const PASSWORD = 'E2e@Doc123';

// Minimal valid PDF buffer (starts with %PDF magic bytes)
const VALID_PDF_BUFFER = Buffer.from([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, // %PDF-1.4\n
  0x31, 0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a, 0x0a,       // 1 0 obj\n
  0x3c, 0x3c, 0x2f, 0x54, 0x79, 0x70, 0x65, 0x20,       // <</Type
  0x2f, 0x43, 0x61, 0x74, 0x61, 0x6c, 0x6f, 0x67,       // /Catalog
  0x3e, 0x3e, 0x0a, 0x65, 0x6e, 0x64, 0x6f, 0x62, 0x6a, // >>\nendobj
  0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46,                   // \n%%EOF
]);

// EXE buffer (starts with MZ — PE executable magic bytes)
const EXE_AS_PDF_BUFFER = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff]);

// 11MB of zeros
const BIG_FILE_BUFFER = Buffer.alloc(11 * 1024 * 1024, 0);

describe('Document API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agentAToken: string;
  let agentBToken: string;
  let checkerToken: string;
  let agentAId: string;
  let checkerId: string;
  let jobId: string;
  let uploadedDocId: string;
  let customerId: string;
  let insuranceTypeId: string;
  let productId: string;

  const http = () => request(app.getHttpServer());

  async function fillRequiredRisk(jId: string, token: string) {
    await http()
      .put(`/api/jobs/${jId}/risk`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        values: {
          brand: 'Toyota', model: 'Camry', year: '2024',
          license_plate: 'ABC-1234', vehicle_type: 'รถเก๋ง',
          usage_type: 'ส่วนบุคคล', sum_insured: '500000',
        },
      });
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    // Clean up previous runs
    const prevJobs = await prisma.job.findMany({
      where: { agent: { username: { startsWith: PREFIX } } },
      select: { id: true },
    });
    const prevJobIds = prevJobs.map((j) => j.id);
    if (prevJobIds.length > 0) {
      await prisma.document.deleteMany({ where: { jobId: { in: prevJobIds } } });
      const prevRisks = await prisma.jobRisk.findMany({ where: { jobId: { in: prevJobIds } }, select: { id: true } });
      await prisma.jobRiskValue.deleteMany({ where: { jobRiskId: { in: prevRisks.map((r) => r.id) } } });
      await prisma.jobRisk.deleteMany({ where: { id: { in: prevRisks.map((r) => r.id) } } });
      await prisma.jobCoverage.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.jobStatusHistory.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.activityLog.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.job.deleteMany({ where: { id: { in: prevJobIds } } });
    }
    await prisma.customer.deleteMany({ where: { customerCode: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });

    const passwordHash = await hash(PASSWORD);

    const upsertPerm = (code: string) =>
      prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } });

    await Promise.all([
      upsertPerm('job.view'), upsertPerm('job.create'), upsertPerm('job.update'),
      upsertPerm('job.view_all'), upsertPerm('job.submit'), upsertPerm('customer.view'),
      upsertPerm('document.verify'), upsertPerm('maintenance.run'),
    ]);

    const agentRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}AGENT`,
        name: 'E2E Doc Agent',
        permissions: {
          create: [
            { permission: { connect: { code: 'job.view' } } },
            { permission: { connect: { code: 'job.create' } } },
            { permission: { connect: { code: 'job.update' } } },
            { permission: { connect: { code: 'job.submit' } } },
            { permission: { connect: { code: 'customer.view' } } },
            { permission: { connect: { code: 'document.verify' } } },
          ],
        },
      },
    });

    const checkerRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}CHECKER`,
        name: 'E2E Doc Checker',
        permissions: {
          create: [
            { permission: { connect: { code: 'job.view' } } },
            { permission: { connect: { code: 'job.view_all' } } },
            { permission: { connect: { code: 'document.verify' } } },
            { permission: { connect: { code: 'maintenance.run' } } },
          ],
        },
      },
    });

    const agentA = await prisma.user.create({
      data: {
        username: `${PREFIX}agent_a`, email: `${PREFIX}a@test.com`,
        fullName: 'Doc Agent A', passwordHash,
        roles: { create: [{ roleId: agentRole.id }] },
      },
    });
    await prisma.user.create({
      data: {
        username: `${PREFIX}agent_b`, email: `${PREFIX}b@test.com`,
        fullName: 'Doc Agent B', passwordHash,
        roles: { create: [{ roleId: agentRole.id }] },
      },
    });
    const checker = await prisma.user.create({
      data: {
        username: `${PREFIX}checker`, email: `${PREFIX}checker@test.com`,
        fullName: 'Doc Checker', passwordHash,
        roles: { create: [{ roleId: checkerRole.id }] },
      },
    });

    agentAId = agentA.id;
    checkerId = checker.id;

    const [resA, resB, resC] = await Promise.all([
      http().post('/api/auth/login').send({ username: `${PREFIX}agent_a`, password: PASSWORD }),
      http().post('/api/auth/login').send({ username: `${PREFIX}agent_b`, password: PASSWORD }),
      http().post('/api/auth/login').send({ username: `${PREFIX}checker`, password: PASSWORD }),
    ]);
    agentAToken = resA.body.data.accessToken as string;
    agentBToken = resB.body.data.accessToken as string;
    checkerToken = resC.body.data.accessToken as string;

    const cus = await prisma.customer.create({
      data: { customerCode: `${PREFIX.toUpperCase()}C001`, customerType: 'INDIVIDUAL', firstName: 'Doc', lastName: 'Test' },
    });
    customerId = cus.id;

    const insType = await prisma.insuranceType.findFirst({ where: { code: 'MOTOR' } });
    insuranceTypeId = insType!.id;
    const product = await prisma.insuranceProduct.findFirst({ where: { code: 'MOTOR-001' } });
    productId = product!.id;

    // Create a DRAFT job owned by agentA for all tests
    const jobRes = await http()
      .post('/api/jobs')
      .set('Authorization', `Bearer ${agentAToken}`)
      .send({ customerId, insuranceTypeId, productId, agentId: agentAId, effectiveDate: '2027-01-01' });
    jobId = jobRes.body.data.id as string;
  });

  afterAll(async () => {
    if (!prisma) return;
    const jobs = await prisma.job.findMany({
      where: { agent: { username: { startsWith: PREFIX } } },
      select: { id: true },
    });
    const jobIds = jobs.map((j) => j.id);
    if (jobIds.length > 0) {
      await prisma.document.deleteMany({ where: { jobId: { in: jobIds } } });
      const risks = await prisma.jobRisk.findMany({ where: { jobId: { in: jobIds } }, select: { id: true } });
      await prisma.jobRiskValue.deleteMany({ where: { jobRiskId: { in: risks.map((r) => r.id) } } });
      await prisma.jobRisk.deleteMany({ where: { id: { in: risks.map((r) => r.id) } } });
      await prisma.jobCoverage.deleteMany({ where: { jobId: { in: jobIds } } });
      await prisma.jobStatusHistory.deleteMany({ where: { jobId: { in: jobIds } } });
      await prisma.activityLog.deleteMany({ where: { jobId: { in: jobIds } } });
      await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
    }
    await prisma.customer.deleteMany({ where: { customerCode: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await app.close();
  });

  // ─── File Validation ──────────────────────────────────────────────────

  describe('POST /api/jobs/:id/documents — file validation', () => {
    it('rejects .exe renamed as .pdf (magic bytes mismatch) → 422', async () => {
      const res = await http()
        .post(`/api/jobs/${jobId}/documents`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .field('documentType', 'ID_CARD')
        .attach('file', EXE_AS_PDF_BUFFER, { filename: 'id_card.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('INVALID_FILE');
    });

    it('rejects file > 10 MB → 422', async () => {
      const res = await http()
        .post(`/api/jobs/${jobId}/documents`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .field('documentType', 'ID_CARD')
        .attach('file', BIG_FILE_BUFFER, { filename: 'big.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('INVALID_FILE');
    });

    it('accepts valid PDF → 201', async () => {
      const res = await http()
        .post(`/api/jobs/${jobId}/documents`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .field('documentType', 'ID_CARD')
        .attach('file', VALID_PDF_BUFFER, { filename: 'id_card.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(201);
      expect(res.body.data.documentType).toBe('ID_CARD');
      expect(res.body.data.originalName).toBe('id_card.pdf');
      expect(res.body.data.version).toBe(1);
      expect(res.body.data.status).toBe('UPLOADED');
      uploadedDocId = res.body.data.id as string;
    });
  });

  // ─── Versioning ───────────────────────────────────────────────────────

  describe('POST /api/jobs/:id/documents — versioning', () => {
    it('uploading same documentType on same Job increments version to 2 and keeps version 1', async () => {
      const res = await http()
        .post(`/api/jobs/${jobId}/documents`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .field('documentType', 'ID_CARD')
        .attach('file', VALID_PDF_BUFFER, { filename: 'id_card_v2.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(201);
      expect(res.body.data.version).toBe(2);
      expect(res.body.data.status).toBe('UPLOADED');

      // Check that both versions exist in list
      const listRes = await http()
        .get(`/api/jobs/${jobId}/documents`)
        .set('Authorization', `Bearer ${agentAToken}`);
      expect(listRes.status).toBe(200);
      const idCards = listRes.body.data.filter((d: { documentType: string }) => d.documentType === 'ID_CARD');
      expect(idCards.length).toBe(2);
      expect(idCards.some((d: { version: number }) => d.version === 1)).toBe(true);
      expect(idCards.some((d: { version: number }) => d.version === 2)).toBe(true);
    });
  });

  // ─── Maker-Checker & Verification / Rejection ──────────────────────────

  describe('Verification & Maker-Checker rules', () => {
    it('uploader cannot verify own document → 422 MAKER_CHECKER_VIOLATION', async () => {
      const res = await http()
        .post(`/api/documents/${uploadedDocId}/verify`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ remark: 'Self verify' });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('MAKER_CHECKER_VIOLATION');
    });

    it('uploader cannot reject own document → 422 MAKER_CHECKER_VIOLATION', async () => {
      const res = await http()
        .post(`/api/documents/${uploadedDocId}/reject`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ reason: 'Self reject' });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('MAKER_CHECKER_VIOLATION');
    });

    it('checker can reject a document with reason → 201/200 REJECTED', async () => {
      const res = await http()
        .post(`/api/documents/${uploadedDocId}/reject`)
        .set('Authorization', `Bearer ${checkerToken}`)
        .send({ reason: 'Image blurry' });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('REJECTED');
      expect(res.body.data.remark).toBe('Image blurry');
    });

    it('checker can verify a document → 201/200 VERIFIED', async () => {
      const upRes = await http()
        .post(`/api/jobs/${jobId}/documents`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .field('documentType', 'TAX_DOCUMENT')
        .attach('file', VALID_PDF_BUFFER, { filename: 'tax.pdf', contentType: 'application/pdf' });
      const docIdToVerify = upRes.body.data.id;

      const res = await http()
        .post(`/api/documents/${docIdToVerify}/verify`)
        .set('Authorization', `Bearer ${checkerToken}`)
        .send({ remark: 'Approved by checker' });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('VERIFIED');
      expect(res.body.data.verifiedById).toBe(checkerId);
    });
  });

  // ─── Expiry Handling ───────────────────────────────────────────────────

  describe('Document Expiry', () => {
    it('expired documents are not counted as complete in checklist', async () => {
      const pastDate = '2020-01-01';
      const upRes = await http()
        .post(`/api/jobs/${jobId}/documents`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .field('documentType', 'VEHICLE_BOOK')
        .field('expiryDate', pastDate)
        .attach('file', VALID_PDF_BUFFER, { filename: 'expired_book.pdf', contentType: 'application/pdf' });
      expect(upRes.status).toBe(201);

      const chkRes = await http()
        .get(`/api/jobs/${jobId}/documents/checklist`)
        .set('Authorization', `Bearer ${agentAToken}`);
      expect(chkRes.status).toBe(200);
      expect(chkRes.body.data.missing).toContain('VEHICLE_BOOK');
    });

    it('cannot verify an expired document → 422 DOCUMENT_EXPIRED', async () => {
      const doc = await prisma.document.create({
        data: {
          jobId,
          documentType: 'OTHER',
          originalName: 'old.pdf',
          storedName: 'old.pdf',
          mimeType: 'application/pdf',
          size: 100,
          storagePath: 'dummy/old.pdf',
          status: 'EXPIRED',
          uploadedById: agentAId,
        },
      });

      const res = await http()
        .post(`/api/documents/${doc.id}/verify`)
        .set('Authorization', `Bearer ${checkerToken}`)
        .send({});
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('DOCUMENT_EXPIRED');
    });

    it('POST /api/documents/expire-outdated expires documents past their expiryDate', async () => {
      const res = await http()
        .post('/api/documents/expire-outdated')
        .set('Authorization', `Bearer ${checkerToken}`);
      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('count');
    });
  });

  // ─── List ─────────────────────────────────────────────────────────────

  describe('GET /api/jobs/:id/documents', () => {
    it('returns uploaded documents for owner', async () => {
      const res = await http()
        .get(`/api/jobs/${jobId}/documents`)
        .set('Authorization', `Bearer ${agentAToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((d: { id: string }) => d.id === uploadedDocId)).toBe(true);
    });

    it('returns 404 when agentB tries to list agentA job documents (out of data scope, D-21)', async () => {
      const res = await http()
        .get(`/api/jobs/${jobId}/documents`)
        .set('Authorization', `Bearer ${agentBToken}`);
      expect(res.status).toBe(404);
    });
  });

  // ─── Checklist ────────────────────────────────────────────────────────

  describe('GET /api/jobs/:id/documents/checklist', () => {
    it('returns checklist with correct missing/uploaded', async () => {
      const res = await http()
        .get(`/api/jobs/${jobId}/documents/checklist`)
        .set('Authorization', `Bearer ${agentAToken}`);
      expect(res.status).toBe(200);
      const { required, uploaded, missing } = res.body.data as {
        required: { documentType: string; isRequired: boolean }[];
        uploaded: { documentType: string }[];
        missing: string[];
      };
      // MOTOR-001 has ID_CARD, VEHICLE_BOOK, PREVIOUS_POLICY, VEHICLE_PHOTO in checklist
      expect(required.length).toBeGreaterThanOrEqual(4);
      // ID_CARD was uploaded
      expect(uploaded.some((u) => u.documentType === 'ID_CARD')).toBe(true);
      // VEHICLE_PHOTO is still missing
      expect(missing).toContain('VEHICLE_PHOTO');
    });
  });

  // ─── Download scope ───────────────────────────────────────────────────

  describe('GET /documents/:id/download', () => {
    it('allows owner to download', async () => {
      const res = await http()
        .get(`/api/documents/${uploadedDocId}/download`)
        .set('Authorization', `Bearer ${agentAToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/pdf/);
    });

    it('returns 404 when unauthorized agentB tries to download (out of data scope, D-21)', async () => {
      const res = await http()
        .get(`/api/documents/${uploadedDocId}/download`)
        .set('Authorization', `Bearer ${agentBToken}`);
      expect(res.status).toBe(404);
    });
  });

  // ─── Submit blocks on missing required docs ──────────────────────────

  describe('Submit with missing required documents → 422', () => {
    it('blocks submit when required docs are missing (MOTOR-001 requireDocsOnSubmit=true)', async () => {
      // Fill risk fields (required for submit)
      await fillRequiredRisk(jobId, agentAToken);

      // VEHICLE_PHOTO still missing
      const res = await http()
        .post(`/api/jobs/${jobId}/submit`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({});
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('JOB_DOCUMENTS_MISSING');
    });

    it('allows submit after uploading all required documents with valid expiry', async () => {
      // Upload valid VEHICLE_BOOK (replacing the expired one with version 2)
      await http()
        .post(`/api/jobs/${jobId}/documents`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .field('documentType', 'VEHICLE_BOOK')
        .field('expiryDate', '2030-01-01')
        .attach('file', VALID_PDF_BUFFER, { filename: 'valid_book.pdf', contentType: 'application/pdf' });

      // Upload VEHICLE_PHOTO
      await http()
        .post(`/api/jobs/${jobId}/documents`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .field('documentType', 'VEHICLE_PHOTO')
        .attach('file', VALID_PDF_BUFFER, { filename: 'vehicle_photo.pdf', contentType: 'application/pdf' });

      const res = await http()
        .post(`/api/jobs/${jobId}/submit`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({});
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('OPEN');
    });
  });
});
