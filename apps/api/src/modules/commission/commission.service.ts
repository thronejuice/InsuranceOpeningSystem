import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { ClsService } from 'nestjs-cls';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { CommissionRepository } from './commission.repository.js';
import type { CreateCommissionDto } from './dto/create-commission.dto.js';
import type { CommissionQueryDto } from './dto/commission-query.dto.js';
import type { CommissionListResponse, CommissionResponse } from './dto/commission.response.js';
import { calculateCommission } from './domain/commission-calc.js';

import { DataScopeService } from '../../common/access/data-scope.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class CommissionService {
  constructor(
    private readonly repo: CommissionRepository,
    private readonly audit: AuditService,
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly cls: ClsService<AppClsStore>,
    private readonly scope: DataScopeService,
  ) {}

  private async assertJobAccess(jobId: string) {
    const userId = this.cls.get('userId')!;
    const permissions = this.cls.get('permissions') ?? [];
    const job = await this.txHost.tx.job.findFirst({ where: { id: jobId, deletedAt: null } });
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);
    if (!permissions.includes('job.view_all') && job.agentId !== userId && job.assignedTo !== userId) {
      throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    }
    return job;
  }

  private async assertPolicyAccess(policyId: string) {
    const policy = await this.txHost.tx.policy.findFirst({ where: { id: policyId } });
    if (!policy) throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    await this.assertJobAccess(policy.jobId);
    return policy;
  }

  async listByPolicy(policyId: string): Promise<CommissionListResponse> {
    await this.assertPolicyAccess(policyId);
    const commissions = await this.repo.findByPolicy(policyId);
    return {
      items: commissions.map(toResponse),
      total: commissions.length,
    };
  }

  async list(query: CommissionQueryDto): Promise<CommissionListResponse> {
    const page = query.page ?? 1;
    const limit = query.perPage ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.CommissionWhereInput = {
      ...(query.agentId ? { agentId: query.agentId } : {}),
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.fromDate || query.toDate
        ? { createdAt: { ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}), ...(query.toDate ? { lte: new Date(query.toDate) } : {}) } }
        : {}),
      policy: { job: { deletedAt: null, ...this.scope.jobViewScope() } },
    };

    const [items, total] = await Promise.all([
      this.repo.findMany(where, skip, limit),
      this.repo.count(where),
    ]);

    return { items: items.map(toResponse), total };
  }

  @Transactional()
  async create(policyId: string, dto: CreateCommissionDto): Promise<CommissionListResponse> {
    const userId = this.cls.get('userId')!;

    const policy = await this.assertPolicyAccess(policyId);
    if (policy.status === 'CANCELLED') {
      throw new BusinessException('POLICY_INVALID_STATUS', 'Cannot add commission to a cancelled policy', 409);
    }

    const commissionAmount = calculateCommission(dto.commissionBase, dto.commissionRate);

    const commission = await this.repo.create({
      policy: { connect: { id: policyId } },
      ...(dto.commissionBase && { agent: undefined }),
      commissionType: dto.commissionType,
      commissionRate: dto.commissionRate,
      commissionBase: dto.commissionBase,
      commissionAmount,
      paidDate: dto.paidDate ? new Date(dto.paidDate) : undefined,
      remark: dto.remark,
      createdBy: userId ? { connect: { id: userId } } : undefined,
    });

    await this.audit.log({
      action: 'CREATE_COMMISSION',
      entityType: 'COMMISSION',
      entityId: commission.id,
      jobId: policy.jobId,
    });

    return this.listByPolicy(policyId);
  }
}

function toResponse(c: {
  commissionRate: { toFixed(dp: number): string };
  commissionBase: { toFixed(dp: number): string };
  commissionAmount: { toFixed(dp: number): string };
  [key: string]: unknown;
}): CommissionResponse {
  return {
    ...c,
    commissionRate: c.commissionRate.toFixed(4),
    commissionBase: c.commissionBase.toFixed(2),
    commissionAmount: c.commissionAmount.toFixed(2),
  } as CommissionResponse;
}
