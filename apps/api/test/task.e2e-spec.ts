import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const PREFIX = 'e2e_task_';
const PASSWORD = 'E2e@Task123';

describe('Task Data Scope (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agentAToken: string;
  let agentAId: string;
  let agentBToken: string;
  let jobIdA: string;
  let taskIdA: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    // Cleanup previous runs
    const prevJobs = await prisma.job.findMany({
      where: { agent: { username: { startsWith: PREFIX } } },
      select: { id: true },
    });
    const prevJobIds = prevJobs.map((j) => j.id);
    if (prevJobIds.length > 0) {
      await prisma.task.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.jobStatusHistory.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.activityLog.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.document.deleteMany({ where: { jobId: { in: prevJobIds } } });
      await prisma.job.deleteMany({ where: { id: { in: prevJobIds } } });
    }
    await prisma.customer.deleteMany({ where: { customerCode: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });

    const passwordHash = await hash(PASSWORD);
    const upsertPerm = (code: string) =>
      prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } });

    await Promise.all([
      upsertPerm('job.view'),
      upsertPerm('job.create'),
      upsertPerm('customer.view'),
      upsertPerm('task.view'),
      upsertPerm('task.create'),
      upsertPerm('task.update'),
    ]);

    const agentRole = await prisma.role.create({
      data: {
        code: `${PREFIX.toUpperCase()}AGENT`,
        name: 'E2E Task Agent',
        permissions: {
          create: [
            { permission: { connect: { code: 'job.view' } } },
            { permission: { connect: { code: 'job.create' } } },
            { permission: { connect: { code: 'customer.view' } } },
            { permission: { connect: { code: 'task.view' } } },
            { permission: { connect: { code: 'task.create' } } },
            { permission: { connect: { code: 'task.update' } } },
          ],
        },
      },
    });

    const agentA = await prisma.user.create({
      data: {
        username: `${PREFIX}agent_a`,
        email: `${PREFIX}a@test.com`,
        fullName: 'Task Agent A',
        passwordHash,
        roles: { create: [{ roleId: agentRole.id }] },
      },
    });
    agentAId = agentA.id;

    await prisma.user.create({
      data: {
        username: `${PREFIX}agent_b`,
        email: `${PREFIX}b@test.com`,
        fullName: 'Task Agent B',
        passwordHash,
        roles: { create: [{ roleId: agentRole.id }] },
      },
    });

    const [loginA, loginB] = await Promise.all([
      http().post('/api/auth/login').send({ username: `${PREFIX}agent_a`, password: PASSWORD }),
      http().post('/api/auth/login').send({ username: `${PREFIX}agent_b`, password: PASSWORD }),
    ]);

    agentAToken = loginA.body.data.accessToken;
    agentBToken = loginB.body.data.accessToken;

    const customer = await prisma.customer.create({
      data: {
        customerCode: `${PREFIX.toUpperCase()}C001`,
        customerType: 'INDIVIDUAL',
        firstName: 'Task',
        lastName: 'Cust',
      },
    });

    const iType = await prisma.insuranceType.findFirst({ where: { active: true } });
    const product = await prisma.insuranceProduct.findFirst({ where: { active: true } });

    const jobRes = await http()
      .post('/api/jobs')
      .set('Authorization', `Bearer ${agentAToken}`)
      .send({
        customerId: customer.id,
        insuranceTypeId: iType!.id,
        productId: product!.id,
        agentId: agentAId,
        effectiveDate: '2026-12-01',
      });
    jobIdA = jobRes.body.data.id;

    // Agent A creates a task on Job A
    const taskRes = await http()
      .post(`/api/jobs/${jobIdA}/tasks`)
      .set('Authorization', `Bearer ${agentAToken}`)
      .send({
        subject: 'ติดตามเอกสารจากลูกค้า',
        taskType: 'REQUEST_DOCUMENT',
        priority: 'HIGH',
      });
    expect(taskRes.status).toBe(201);
    taskIdA = taskRes.body.data.id;
  });

  afterAll(async () => {
    if (jobIdA) {
      await prisma.task.deleteMany({ where: { jobId: jobIdA } });
      await prisma.jobStatusHistory.deleteMany({ where: { jobId: jobIdA } });
      await prisma.activityLog.deleteMany({ where: { jobId: jobIdA } });
      await prisma.job.deleteMany({ where: { id: jobIdA } });
    }
    await prisma.customer.deleteMany({ where: { customerCode: { startsWith: PREFIX.toUpperCase() } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });
    await app.close();
  });

  it('Agent A can list tasks on their own job', async () => {
    const res = await http()
      .get(`/api/jobs/${jobIdA}/tasks`)
      .set('Authorization', `Bearer ${agentAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.some((t: { id: string }) => t.id === taskIdA)).toBe(true);
  });

  it('Agent B cannot list tasks on Agent A job → 403', async () => {
    const res = await http()
      .get(`/api/jobs/${jobIdA}/tasks`)
      .set('Authorization', `Bearer ${agentBToken}`);
    expect(res.status).toBe(403);
  });

  it('Agent B cannot create task on Agent A job → 403', async () => {
    const res = await http()
      .post(`/api/jobs/${jobIdA}/tasks`)
      .set('Authorization', `Bearer ${agentBToken}`)
      .send({
        subject: 'Agent B intruder task',
        taskType: 'CALL_CUSTOMER',
      });
    expect(res.status).toBe(403);
  });

  it('Agent B cannot complete task on Agent A job → 403', async () => {
    const res = await http()
      .post(`/api/tasks/${taskIdA}/complete`)
      .set('Authorization', `Bearer ${agentBToken}`);
    expect(res.status).toBe(403);
  });

  it('Agent A can complete task on their own job → 200', async () => {
    const res = await http()
      .post(`/api/tasks/${taskIdA}/complete`)
      .set('Authorization', `Bearer ${agentAToken}`);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DONE');
  });
});
