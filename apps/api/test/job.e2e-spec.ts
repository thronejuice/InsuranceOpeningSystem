import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_job_';
const PASSWORD = 'E2e@Job123';

// Minimal valid PDF buffer (magic bytes: %PDF)
const VALID_PDF_BUFFER = Buffer.from([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a,
  0x31, 0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a, 0x0a,
  0x3c, 0x3c, 0x2f, 0x54, 0x79, 0x70, 0x65, 0x20,
  0x2f, 0x43, 0x61, 0x74, 0x61, 0x6c, 0x6f, 0x67,
  0x3e, 0x3e, 0x0a, 0x65, 0x6e, 0x64, 0x6f, 0x62, 0x6a,
  0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46,
]);

describe('Job (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agentAToken: string;
  let agentBToken: string;
  let adminToken: string;
  let agentAId: string;
  let agentBId: string;
  let customerId: string;
  let insuranceTypeId: string;
  let productId: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    // Clean up previous runs
    const prevJobs = await prisma.job.findMany({ where: { agent: { username: { startsWith: PREFIX } } }, select: { id: true } });
    const prevJobIds = prevJobs.map((j) => j.id);
    const prevRisks = await prisma.jobRisk.findMany({ where: { jobId: { in: prevJobIds } }, select: { id: true } });
    await prisma.jobRiskValue.deleteMany({ where: { jobRiskId: { in: prevRisks.map((r) => r.id) } } });
    await prisma.jobRisk.deleteMany({ where: { id: { in: prevRisks.map((r) => r.id) } } });
    await prisma.jobCoverage.deleteMany({ where: { jobId: { in: prevJobIds } } });
    await prisma.document.deleteMany({ where: { jobId: { in: prevJobIds } } });
    await prisma.jobStatusHistory.deleteMany({ where: { jobId: { in: prevJobIds } } });
    await prisma.activityLog.deleteMany({ where: { jobId: { in: prevJobIds } } });
    await prisma.job.deleteMany({ where: { id: { in: prevJobIds } } });
    await prisma.customer.deleteMany({ where: { customerCode: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });

    const passwordHash = await hash(PASSWORD);

    const upsertPerm = (code: string) =>
      prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } });

    await Promise.all([
      upsertPerm('job.view'), upsertPerm('job.create'), upsertPerm('job.update'),
      upsertPerm('job.view_all'), upsertPerm('job.update_all'), upsertPerm('customer.view'),
      upsertPerm('job.submit'), upsertPerm('job.cancel'),
    ]);

    const agentRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}AGENT`,
        name: 'E2E Agent',
        permissions: {
          create: [
            { permission: { connect: { code: 'job.view' } } },
            { permission: { connect: { code: 'job.create' } } },
            { permission: { connect: { code: 'job.update' } } },
            { permission: { connect: { code: 'job.submit' } } },
            { permission: { connect: { code: 'job.cancel' } } },
            { permission: { connect: { code: 'customer.view' } } },
          ],
        },
      },
    });

    const adminRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}ADMIN`,
        name: 'E2E Admin',
        permissions: {
          create: [
            { permission: { connect: { code: 'job.view' } } },
            { permission: { connect: { code: 'job.view_all' } } },
            { permission: { connect: { code: 'job.create' } } },
            { permission: { connect: { code: 'job.update' } } },
            { permission: { connect: { code: 'job.update_all' } } },
            { permission: { connect: { code: 'job.submit' } } },
            { permission: { connect: { code: 'job.cancel' } } },
            { permission: { connect: { code: 'customer.view' } } },
          ],
        },
      },
    });

    const agentA = await prisma.user.create({
      data: { username: `${PREFIX}agent_a`, email: `${PREFIX}a@test.com`, fullName: 'Agent A', passwordHash, roles: { create: [{ roleId: agentRole.id }] } },
    });
    const agentB = await prisma.user.create({
      data: { username: `${PREFIX}agent_b`, email: `${PREFIX}b@test.com`, fullName: 'Agent B', passwordHash, roles: { create: [{ roleId: agentRole.id }] } },
    });
    await prisma.user.create({
      data: { username: `${PREFIX}admin`, email: `${PREFIX}admin@test.com`, fullName: 'Admin', passwordHash, roles: { create: [{ roleId: adminRole.id }] } },
    });

    agentAId = agentA.id;
    agentBId = agentB.id;

    const [resA, resB, resAdmin] = await Promise.all([
      http().post('/api/auth/login').send({ username: `${PREFIX}agent_a`, password: PASSWORD }),
      http().post('/api/auth/login').send({ username: `${PREFIX}agent_b`, password: PASSWORD }),
      http().post('/api/auth/login').send({ username: `${PREFIX}admin`, password: PASSWORD }),
    ]);

    agentAToken = resA.body.data.accessToken as string;
    agentBToken = resB.body.data.accessToken as string;
    adminToken = resAdmin.body.data.accessToken as string;

    // Create customer and get master data IDs
    const cus = await prisma.customer.create({
      data: { customerCode: `${PREFIX.toUpperCase()}C001`, customerType: 'INDIVIDUAL', firstName: 'E2E', lastName: 'Customer' },
    });
    customerId = cus.id;

    const insType = await prisma.insuranceType.findFirst({ where: { code: 'MOTOR' } });
    insuranceTypeId = insType!.id;

    const product = await prisma.insuranceProduct.findFirst({ where: { code: 'MOTOR-001' } });
    productId = product!.id;
  });

  afterAll(async () => {
    const jobs = await prisma.job.findMany({ where: { agent: { username: { startsWith: PREFIX } } }, select: { id: true } });
    const jobIds = jobs.map((j) => j.id);
    const risks = await prisma.jobRisk.findMany({ where: { jobId: { in: jobIds } }, select: { id: true } });
    const riskIds = risks.map((r) => r.id);
    await prisma.jobRiskValue.deleteMany({ where: { jobRiskId: { in: riskIds } } });
    await prisma.jobRisk.deleteMany({ where: { id: { in: riskIds } } });
    await prisma.jobCoverage.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.document.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.jobStatusHistory.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.activityLog.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
    await prisma.customer.deleteMany({ where: { customerCode: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await app.close();
  });

  // ─── Create ───────────────────────────────────────────────────────────────

  describe('POST /api/jobs', () => {
    it('Agent A creates a job in DRAFT status', async () => {
      const res = await http()
        .post('/api/jobs')
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ customerId, insuranceTypeId, productId, agentId: agentAId, effectiveDate: '2026-11-01' });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.jobNo).toMatch(/^JOB-\d{4}-\d{6}$/);
      expect(res.body.data.allowedActions).toContain('submit');
      expect(res.body.data.allowedActions).toContain('cancel');
    });

    it('422 when required fields are missing', async () => {
      const res = await http()
        .post('/api/jobs')
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ customerId });
      expect(res.status).toBe(422);
    });

    it('Agent A cannot create a job with Agent B id → 403', async () => {
      const res = await http()
        .post('/api/jobs')
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ customerId, insuranceTypeId, productId, agentId: agentBId, effectiveDate: '2026-11-01' });
      expect(res.status).toBe(403);
    });

    it('401 without token', async () => {
      const res = await http().post('/api/jobs').send({});
      expect(res.status).toBe(401);
    });
  });

  // ─── Data Scope (BR-014) ─────────────────────────────────────────────────

  describe('Data scope BR-014', () => {
    let jobIdByA: string;

    beforeAll(async () => {
      const res = await http()
        .post('/api/jobs')
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ customerId, insuranceTypeId, productId, agentId: agentAId, effectiveDate: '2026-11-15' });
      jobIdByA = res.body.data.id as string;
    });

    it('Agent A can GET their own job', async () => {
      const res = await http().get(`/api/jobs/${jobIdByA}`).set('Authorization', `Bearer ${agentAToken}`);
      expect(res.status).toBe(200);
    });

    it('Agent B (different agent) GET Agent A job → 403', async () => {
      const res = await http().get(`/api/jobs/${jobIdByA}`).set('Authorization', `Bearer ${agentBToken}`);
      expect(res.status).toBe(403);
    });

    it('Agent B (different agent) PUT Agent A job → 403', async () => {
      const res = await http()
        .put(`/api/jobs/${jobIdByA}`)
        .set('Authorization', `Bearer ${agentBToken}`)
        .send({ remark: 'attempt' });
      expect(res.status).toBe(403);
    });

    it('Admin (job.view_all) can GET Agent A job', async () => {
      const res = await http().get(`/api/jobs/${jobIdByA}`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });

    it('Agent B list jobs → only sees own jobs (not Agent A jobs)', async () => {
      const res = await http().get('/api/jobs').set('Authorization', `Bearer ${agentBToken}`);
      expect(res.status).toBe(200);
      const ids = (res.body.data as { id: string }[]).map((j) => j.id);
      expect(ids).not.toContain(jobIdByA);
    });
  });

  // ─── Update ───────────────────────────────────────────────────────────────

  describe('PUT /api/jobs/:id', () => {
    let jobId: string;

    beforeAll(async () => {
      const res = await http()
        .post('/api/jobs')
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ customerId, insuranceTypeId, productId, agentId: agentAId, effectiveDate: '2026-12-01' });
      jobId = res.body.data.id as string;
    });

    it('updates remark and priority', async () => {
      const res = await http()
        .put(`/api/jobs/${jobId}`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ remark: 'updated', priority: 'HIGH' });
      expect(res.status).toBe(200);
      expect(res.body.data.remark).toBe('updated');
      expect(res.body.data.priority).toBe('HIGH');
    });
  });

  // Helper: fill all required MOTOR risk fields so submit is allowed
  const fillRequiredRisk = (jobId: string) =>
    http()
      .put(`/api/jobs/${jobId}/risk`)
      .set('Authorization', `Bearer ${agentAToken}`)
      .send({
        values: {
          brand: 'Toyota',
          model: 'Camry',
          year: '2022',
          license_plate: 'กก-1234',
          vehicle_type: 'รถเก๋ง',
          usage_type: 'ส่วนบุคคล',
          sum_insured: '500000',
        },
      });

  // Helper: upload all required MOTOR documents (MOTOR-001 requireDocsOnSubmit=true)
  const fillRequiredDocs = async (jId: string) => {
    for (const [type, filename] of [
      ['ID_CARD', 'id_card.pdf'] as const,
      ['VEHICLE_BOOK', 'vehicle_book.pdf'] as const,
      ['VEHICLE_PHOTO', 'vehicle_photo.pdf'] as const,
    ]) {
      await http()
        .post(`/api/jobs/${jId}/documents`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .field('documentType', type)
        .attach('file', VALID_PDF_BUFFER, { filename, contentType: 'application/pdf' });
    }
  };

  // ─── Risk API ─────────────────────────────────────────────────────────────

  describe('GET/PUT /api/jobs/:id/risk', () => {
    let jobId: string;

    beforeAll(async () => {
      const res = await http()
        .post('/api/jobs')
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ customerId, insuranceTypeId, productId, agentId: agentAId, effectiveDate: '2027-05-01' });
      jobId = res.body.data.id as string;
    });

    it('GET returns empty values and field definitions', async () => {
      const res = await http().get(`/api/jobs/${jobId}/risk`).set('Authorization', `Bearer ${agentAToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.fieldDefs.length).toBeGreaterThan(0);
      expect(res.body.data.values).toEqual({});
    });

    it('PUT saves valid risk values', async () => {
      const res = await fillRequiredRisk(jobId);
      expect(res.status).toBe(200);
      expect(res.body.data.values.brand).toBe('Toyota');
      expect(res.body.data.values.year).toBe('2022');
    });

    it('PUT returns updated values on GET', async () => {
      const res = await http().get(`/api/jobs/${jobId}/risk`).set('Authorization', `Bearer ${agentAToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.values.model).toBe('Camry');
    });

    it('PUT with invalid NUMBER field → 422 per field', async () => {
      const res = await http()
        .put(`/api/jobs/${jobId}/risk`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ values: { year: 'not-a-number', brand: 'Toyota', model: 'Camry', license_plate: 'กก-1234', vehicle_type: 'รถเก๋ง', usage_type: 'ส่วนบุคคล', sum_insured: '500000' } });
      expect(res.status).toBe(422);
      expect(res.body.errors).toHaveProperty('year');
    });

    it('PUT with invalid SELECT option → 422 per field', async () => {
      const res = await http()
        .put(`/api/jobs/${jobId}/risk`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ values: { year: '2022', brand: 'Toyota', model: 'Camry', license_plate: 'กก-1234', vehicle_type: 'INVALID_VEHICLE_TYPE' } });
      expect(res.status).toBe(422);
      expect(res.body.errors).toHaveProperty('vehicle_type');
    });

    it('Agent B cannot GET risk for Agent A job → 403', async () => {
      const res = await http().get(`/api/jobs/${jobId}/risk`).set('Authorization', `Bearer ${agentBToken}`);
      expect(res.status).toBe(403);
    });
  });

  // ─── Coverage API ─────────────────────────────────────────────────────────

  describe('Coverage CRUD /api/jobs/:id/coverages', () => {
    let jobId: string;
    let coverageId: string;

    beforeAll(async () => {
      const jobRes = await http()
        .post('/api/jobs')
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ customerId, insuranceTypeId, productId, agentId: agentAId, effectiveDate: '2027-06-01' });
      jobId = jobRes.body.data.id as string;

      // Get a coverage id from master data
      const cov = await prisma.insuranceCoverage.findFirst({ where: { product: { code: 'MOTOR-001' } } });
      coverageId = cov!.id;
    });

    it('GET returns empty list initially', async () => {
      const res = await http().get(`/api/jobs/${jobId}/coverages`).set('Authorization', `Bearer ${agentAToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('POST adds a coverage', async () => {
      const res = await http()
        .post(`/api/jobs/${jobId}/coverages`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ coverageId, sumInsured: '500000.00' });
      expect(res.status).toBe(201);
      expect(res.body.data.coverageId).toBe(coverageId);
      expect(res.body.data.sumInsured).toBe('500000');
    });

    it('POST duplicate coverage → 409', async () => {
      const res = await http()
        .post(`/api/jobs/${jobId}/coverages`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ coverageId, sumInsured: '100000.00' });
      expect(res.status).toBe(409);
    });

    it('PUT updates sumInsured', async () => {
      const res = await http()
        .put(`/api/jobs/${jobId}/coverages/${coverageId}`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ sumInsured: '750000.00' });
      expect(res.status).toBe(200);
      expect(res.body.data.sumInsured).toBe('750000');
    });

    it('GET lists coverages', async () => {
      const res = await http().get(`/api/jobs/${jobId}/coverages`).set('Authorization', `Bearer ${agentAToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('DELETE removes coverage', async () => {
      const res = await http()
        .delete(`/api/jobs/${jobId}/coverages/${coverageId}`)
        .set('Authorization', `Bearer ${agentAToken}`);
      expect(res.status).toBe(204);
    });

    it('GET returns empty after delete', async () => {
      const res = await http().get(`/api/jobs/${jobId}/coverages`).set('Authorization', `Bearer ${agentAToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  // ─── Workflow Actions ─────────────────────────────────────────────────────

  describe('POST /api/jobs/:id/submit', () => {
    let jobId: string;

    beforeAll(async () => {
      const res = await http()
        .post('/api/jobs')
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ customerId, insuranceTypeId, productId, agentId: agentAId, effectiveDate: '2027-01-01' });
      jobId = res.body.data.id as string;
      await fillRequiredRisk(jobId);
      await fillRequiredDocs(jobId);
    });

    it('submit with incomplete risk → 422 JOB_RISK_INCOMPLETE with missing field names', async () => {
      // Create a new job and don't fill risk
      const bareRes = await http()
        .post('/api/jobs')
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ customerId, insuranceTypeId, productId, agentId: agentAId, effectiveDate: '2027-01-15' });
      const bareId = bareRes.body.data.id as string;
      const res = await http().post(`/api/jobs/${bareId}/submit`).set('Authorization', `Bearer ${agentAToken}`).send({});
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('JOB_RISK_INCOMPLETE');
      expect(res.body.errors).toHaveProperty('brand');
      expect(res.body.errors).toHaveProperty('license_plate');
    });

    it('submit DRAFT → OPEN', async () => {
      const res = await http().post(`/api/jobs/${jobId}/submit`).set('Authorization', `Bearer ${agentAToken}`).send({});
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('OPEN');
    });

    it('invalid transition OPEN → OPEN → 409 JOB_INVALID_TRANSITION', async () => {
      const res = await http().post(`/api/jobs/${jobId}/submit`).set('Authorization', `Bearer ${agentAToken}`).send({});
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('JOB_INVALID_TRANSITION');
    });

    it('cancel OPEN → CANCELLED with reason', async () => {
      // Create a fresh job, fill risk, submit it, then cancel
      const createRes = await http()
        .post('/api/jobs')
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ customerId, insuranceTypeId, productId, agentId: agentAId, effectiveDate: '2027-02-01' });
      const id = createRes.body.data.id as string;
      await http()
        .put(`/api/jobs/${id}/risk`)
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ values: { brand: 'Honda', model: 'Civic', year: '2021', license_plate: 'ขข-5678', vehicle_type: 'รถเก๋ง', usage_type: 'ส่วนบุคคล', sum_insured: '400000' } });
      await fillRequiredDocs(id);
      await http().post(`/api/jobs/${id}/submit`).set('Authorization', `Bearer ${agentAToken}`).send({});
      const cancelRes = await http().post(`/api/jobs/${id}/cancel`).set('Authorization', `Bearer ${agentAToken}`).send({ reason: 'test cancellation' });
      expect(cancelRes.status).toBe(201);
      expect(cancelRes.body.data.status).toBe('CANCELLED');
    });

    it('cancel without reason → 422', async () => {
      const res = await http().post(`/api/jobs/${jobId}/cancel`).set('Authorization', `Bearer ${agentAToken}`).send({});
      expect(res.status).toBe(422);
    });
  });

  // ─── Activities ───────────────────────────────────────────────────────────

  describe('GET /api/jobs/:id/activities', () => {
    let jobId: string;

    beforeAll(async () => {
      const res = await http()
        .post('/api/jobs')
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ customerId, insuranceTypeId, productId, agentId: agentAId, effectiveDate: '2027-03-01' });
      jobId = res.body.data.id as string;
      await fillRequiredRisk(jobId);
      await fillRequiredDocs(jobId);
      await http().post(`/api/jobs/${jobId}/submit`).set('Authorization', `Bearer ${agentAToken}`).send({});
    });

    it('returns timeline with STATUS_CHANGE entry', async () => {
      const res = await http().get(`/api/jobs/${jobId}/activities`).set('Authorization', `Bearer ${agentAToken}`);
      expect(res.status).toBe(200);
      const items = res.body.data.items as { type: string }[];
      expect(items.some((i) => i.type === 'STATUS_CHANGE')).toBe(true);
      expect(items.some((i) => i.type === 'ACTIVITY')).toBe(true);
    });

    it('Agent B cannot view activities for Agent A job → 403', async () => {
      const res = await http().get(`/api/jobs/${jobId}/activities`).set('Authorization', `Bearer ${agentBToken}`);
      expect(res.status).toBe(403);
    });
  });
});
