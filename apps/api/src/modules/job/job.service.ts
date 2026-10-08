import { Injectable } from '@nestjs/common';
import { TransactionHost, Transactional } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { AssignmentRole } from '../../generated/prisma/enums.js';
import { AuditService } from '../../common/audit/audit.service.js';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import { Paginated } from '../../common/http/pagination.dto.js';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { JobRepository } from './job.repository.js';
import type { AssignJobDto } from './dto/assign-job.dto.js';
import type { CreateJobDto } from './dto/create-job.dto.js';
import type { JobQueryDto } from './dto/job-query.dto.js';
import type { UpdateJobDto } from './dto/update-job.dto.js';
import { toJobResponse, type JobResponse } from './dto/job.response.js';
import { TaskService } from '../task/task.service.js';
import { NotificationService } from '../notification/notification.service.js';
import { EDITABLE_STATUSES, type JobStatus } from './domain/job-status.js';

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
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
  ) {}

  async list(query: JobQueryDto): Promise<Paginated<JobResponse>> {
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
    if (!job || !this.scope.canViewJob(job)) {
      throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);
    }
    const permissions = this.cls.get('permissions') ?? [];
    return toJobResponse(job, permissions, this.scope.canUpdateJob(job.agentId));
  }

  @Transactional()
  async create(dto: CreateJobDto): Promise<JobResponse> {
    const userId = this.cls.get('userId')!;
    const permissions = this.cls.get('permissions') ?? [];
    if (!permissions.includes('job.view_all') && dto.agentId !== userId) {
      throw new BusinessException('FORBIDDEN', 'Agents may only create jobs for themselves', 403);
    }
    const jobNo = await this.sequence.next('JOB');
    const branchId = dto.branchId ?? this.cls.get('branchId');
    const job = await this.repo.create({
      jobNo,
      customer: { connect: { id: dto.customerId } },
      insuranceType: { connect: { id: dto.insuranceTypeId } },
      product: { connect: { id: dto.productId } },
      agent: { connect: { id: dto.agentId } },
      ...(branchId && { branch: { connect: { id: branchId } } }),
      ...(dto.brokerStaffId && {
        brokerStaff: { connect: { id: dto.brokerStaffId } },
        assignee: { connect: { id: dto.brokerStaffId } },
      }),
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
    if (!EDITABLE_STATUSES.includes(job.status as JobStatus)) {
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
  async assign(id: string, dto: AssignJobDto): Promise<JobResponse> {
    const userId = this.cls.get('userId')!;
    const permissions = this.cls.get('permissions') ?? [];
    const job = await this.repo.findById(id);
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);
    if (!this.scope.canAssignJob(job.agentId)) {
      throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    }

    const targetRole = dto.role ?? AssignmentRole.BROKER_STAFF;
    const assigneeId = dto.assigneeId ?? null;

    let fromUserId: string | null = null;
    let updateData: Prisma.JobUpdateInput = { updatedById: userId };

    if (targetRole === AssignmentRole.AGENT) {
      fromUserId = job.agentId;
      if (!assigneeId) {
        throw new BusinessException('INVALID_ASSIGNMENT', 'Agent cannot be unassigned', 422);
      }
      updateData = {
        ...updateData,
        agent: { connect: { id: assigneeId } },
      };
    } else if (targetRole === AssignmentRole.BROKER_STAFF) {
      fromUserId = job.brokerStaffId ?? job.assignedTo ?? null;
      updateData = {
        ...updateData,
        brokerStaff: assigneeId ? { connect: { id: assigneeId } } : { disconnect: true },
        assignee: assigneeId ? { connect: { id: assigneeId } } : { disconnect: true },
      };
    } else if (targetRole === AssignmentRole.MANAGER) {
      fromUserId = null;
    }

    const updated = await this.repo.update(id, updateData);

    await this.txHost.tx.jobAssignmentHistory.create({
      data: {
        jobId: id,
        role: targetRole,
        fromUserId,
        toUserId: assigneeId,
        reason: dto.reason ?? null,
        changedById: userId,
      },
    });

    await this.audit.log({
      action: 'ASSIGN_JOB',
      entityType: 'JOB',
      entityId: id,
      jobId: id,
      newValue: { assigneeId, role: targetRole, reason: dto.reason },
    });

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

  async getAssignmentHistories(id: string) {
    const job = await this.repo.findById(id);
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);
    const userId = this.cls.get('userId')!;
    const permissions = this.cls.get('permissions') ?? [];
    if (
      !permissions.includes('job.view_all') &&
      job.agentId !== userId &&
      job.assignedTo !== userId &&
      job.brokerStaffId !== userId
    ) {
      throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    }
    return this.txHost.tx.jobAssignmentHistory.findMany({
      where: { jobId: id },
      include: {
        fromUser: { select: { id: true, username: true, fullName: true } },
        toUser: { select: { id: true, username: true, fullName: true } },
        changedBy: { select: { id: true, username: true, fullName: true } },
      },
      orderBy: { changedAt: 'asc' },
    });
  }
}
