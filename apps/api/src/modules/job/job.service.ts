import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { ClsService } from 'nestjs-cls';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../../common/audit/audit.service.js';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import { Paginated } from '../../common/http/pagination.dto.js';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { JobRepository } from './job.repository.js';
import type { CreateJobDto } from './dto/create-job.dto.js';
import type { JobQueryDto } from './dto/job-query.dto.js';
import type { UpdateJobDto } from './dto/update-job.dto.js';
import { toJobResponse, type JobResponse } from './dto/job.response.js';
import { TaskService } from '../task/task.service.js';
import { NotificationService } from '../notification/notification.service.js';

const EDITABLE_STATUSES = new Set(['DRAFT', 'OPEN', 'WAITING_INFORMATION']);

@Injectable()
export class JobService {
  constructor(
    private readonly repo: JobRepository,
    private readonly sequence: SequenceService,
    private readonly audit: AuditService,
    private readonly scope: DataScopeService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly taskSvc: TaskService,
    private readonly notifSvc: NotificationService,
  ) {}

  async list(query: JobQueryDto): Promise<Paginated<JobResponse>> {
    const userId = this.cls.get('userId')!;
    const permissions = this.cls.get('permissions') ?? [];
    const scopeWhere = this.scope.jobViewScope();

    const search = query.q?.trim();
    const searchWhere: Prisma.JobWhereInput = search
      ? { OR: [{ jobNo: { contains: search, mode: 'insensitive' } }] }
      : {};

    const filterWhere: Prisma.JobWhereInput = {
      ...(query.customerId && { customerId: query.customerId }),
      ...(query.status && { status: query.status }),
      ...(query.agentId && { agentId: query.agentId }),
      ...(query.productId && { productId: query.productId }),
      ...(query.insuranceTypeId && { insuranceTypeId: query.insuranceTypeId }),
      ...(query.priority && { priority: query.priority }),
      ...(query.effectiveDateFrom || query.effectiveDateTo
        ? { effectiveDate: { ...(query.effectiveDateFrom && { gte: new Date(query.effectiveDateFrom) }), ...(query.effectiveDateTo && { lte: new Date(query.effectiveDateTo) }) } }
        : {}),
    };

    const where: Prisma.JobWhereInput = { deletedAt: null, AND: [scopeWhere, searchWhere, filterWhere] };
    const orderBy: Prisma.JobOrderByWithRelationInput[] = [{ createdAt: 'desc' }];

    const [items, total] = await this.repo.findAll(where, orderBy, query.skip, query.take);
    return Paginated.of(
      items.map((j) => toJobResponse(j, permissions, this.scope.canUpdateJob(j.agentId))),
      total,
      query,
    );
  }

  async getOne(id: string): Promise<JobResponse> {
    const job = await this.repo.findById(id);
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);
    const userId = this.cls.get('userId')!;
    const permissions = this.cls.get('permissions') ?? [];
    if (!permissions.includes('job.view_all') && job.agentId !== userId && job.assignedTo !== userId) {
      throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    }
    return toJobResponse(job, permissions, this.scope.canUpdateJob(job.agentId));
  }

  @Transactional()
  async create(dto: CreateJobDto): Promise<JobResponse> {
    const userId = this.cls.get('userId')!;
    const permissions = this.cls.get('permissions') ?? [];
    const jobNo = await this.sequence.next('JOB');
    const job = await this.repo.create({
      jobNo,
      customer: { connect: { id: dto.customerId } },
      insuranceType: { connect: { id: dto.insuranceTypeId } },
      product: { connect: { id: dto.productId } },
      agent: { connect: { id: dto.agentId } },
      ...(dto.expiryDate !== undefined && { expiryDate: new Date(dto.expiryDate) }),
      effectiveDate: new Date(dto.effectiveDate),
      priority: dto.priority,
      source: dto.source,
      remark: dto.remark,
      createdById: userId,
      updatedById: userId,
    });
    await this.audit.log({ action: 'CREATE_JOB', entityType: 'JOB', entityId: job.id, jobId: job.id });
    return toJobResponse(job, permissions, true);
  }

  @Transactional()
  async update(id: string, dto: UpdateJobDto): Promise<JobResponse> {
    const userId = this.cls.get('userId')!;
    const permissions = this.cls.get('permissions') ?? [];
    const job = await this.repo.findById(id);
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);
    if (!this.scope.canUpdateJob(job.agentId)) {
      throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    }
    if (!EDITABLE_STATUSES.has(job.status)) {
      throw new BusinessException('JOB_NOT_EDITABLE', `Job in status ${job.status} cannot be edited`, 409);
    }
    const updated = await this.repo.update(id, {
      ...(dto.effectiveDate && { effectiveDate: new Date(dto.effectiveDate) }),
      ...(dto.expiryDate !== undefined && { expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null }),
      ...(dto.priority && { priority: dto.priority }),
      ...(dto.source !== undefined && { source: dto.source }),
      ...(dto.remark !== undefined && { remark: dto.remark }),
      updatedById: userId,
    });
    await this.audit.log({ action: 'UPDATE_JOB', entityType: 'JOB', entityId: id, jobId: id });
    return toJobResponse(updated, permissions, true);
  }

  @Transactional()
  async assign(id: string, assigneeId: string | null): Promise<JobResponse> {
    const userId = this.cls.get('userId')!;
    const permissions = this.cls.get('permissions') ?? [];
    const job = await this.repo.findById(id);
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);
    if (!this.scope.canUpdateJob(job.agentId)) {
      throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    }
    const updated = await this.repo.update(id, {
      assignee: assigneeId ? { connect: { id: assigneeId } } : { disconnect: true },
      updatedById: userId,
    });
    await this.audit.log({ action: 'ASSIGN_JOB', entityType: 'JOB', entityId: id, jobId: id });

    if (assigneeId) {
      await this.taskSvc.createAutoTask(id, 'CALL_CUSTOMER', 'โทรติดต่อลูกค้า', assigneeId);
      await this.notifSvc.notify({
        userId: assigneeId,
        type: 'JOB_ASSIGNED',
        title: 'งานถูกมอบหมายให้คุณ',
        message: `Job ${updated.jobNo} ถูกมอบหมายให้คุณ`,
        entityType: 'JOB',
        entityId: id,
      });
    }

    return toJobResponse(updated, permissions, true);
  }
}
