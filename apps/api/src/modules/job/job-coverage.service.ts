import { Injectable } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { CreateJobCoverageDto, UpdateJobCoverageDto, JobCoverageResponse } from './dto/coverage.dto.js';
import { Decimal } from 'decimal.js';

function toCoverageResponse(row: {
  id: string;
  jobId: string;
  coverageId: string;
  sumInsured: unknown;
  deductible: unknown;
  remark: string | null;
  createdAt: Date;
  updatedAt: Date;
  coverage: { code: string; name: string };
}): JobCoverageResponse {
  return {
    id: row.id,
    jobId: row.jobId,
    coverageId: row.coverageId,
    coverageCode: row.coverage.code,
    coverageName: row.coverage.name,
    sumInsured: row.sumInsured != null ? String(row.sumInsured) : null,
    deductible: row.deductible != null ? String(row.deductible) : null,
    remark: row.remark,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class JobCoverageService {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly scope: DataScopeService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  private get db() { return this.txHost.tx; }

  private async resolveJob(jobId: string) {
    const job = await this.db.job.findFirst({ where: { id: jobId, deletedAt: null }, select: { id: true, agentId: true } });
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);
    return job;
  }

  private assertViewScope(agentId: string) {
    const userId = this.cls.get('userId')!;
    const permissions = this.cls.get('permissions') ?? [];
    if (!permissions.includes('job.view_all') && agentId !== userId) {
      throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    }
  }

  async listCoverages(jobId: string): Promise<JobCoverageResponse[]> {
    const job = await this.resolveJob(jobId);
    this.assertViewScope(job.agentId);

    const rows = await this.db.jobCoverage.findMany({
      where: { jobId },
      include: { coverage: { select: { code: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toCoverageResponse);
  }

  @Transactional()
  async addCoverage(jobId: string, dto: CreateJobCoverageDto): Promise<JobCoverageResponse> {
    const job = await this.resolveJob(jobId);
    if (!this.scope.canUpdateJob(job.agentId)) {
      throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    }

    const coverage = await this.db.insuranceCoverage.findFirst({ where: { id: dto.coverageId, active: true } });
    if (!coverage) throw new BusinessException('COVERAGE_NOT_FOUND', 'Coverage not found', 404);

    const existing = await this.db.jobCoverage.findFirst({ where: { jobId, coverageId: dto.coverageId } });
    if (existing) throw new BusinessException('COVERAGE_DUPLICATE', 'Coverage already added to this job', 409);

    const row = await this.db.jobCoverage.create({
      data: {
        jobId,
        coverageId: dto.coverageId,
        sumInsured: dto.sumInsured ? new Decimal(dto.sumInsured) : null,
        deductible: dto.deductible ? new Decimal(dto.deductible) : null,
        remark: dto.remark ?? null,
      },
      include: { coverage: { select: { code: true, name: true } } },
    });
    return toCoverageResponse(row);
  }

  @Transactional()
  async updateCoverage(jobId: string, coverageId: string, dto: UpdateJobCoverageDto): Promise<JobCoverageResponse> {
    const job = await this.resolveJob(jobId);
    if (!this.scope.canUpdateJob(job.agentId)) {
      throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    }

    const existing = await this.db.jobCoverage.findFirst({ where: { jobId, coverageId } });
    if (!existing) throw new BusinessException('COVERAGE_NOT_FOUND', 'Job coverage not found', 404);

    const row = await this.db.jobCoverage.update({
      where: { id: existing.id },
      data: {
        ...(dto.sumInsured !== undefined && { sumInsured: dto.sumInsured ? new Decimal(dto.sumInsured) : null }),
        ...(dto.deductible !== undefined && { deductible: dto.deductible ? new Decimal(dto.deductible) : null }),
        ...(dto.remark !== undefined && { remark: dto.remark }),
      },
      include: { coverage: { select: { code: true, name: true } } },
    });
    return toCoverageResponse(row);
  }

  @Transactional()
  async removeCoverage(jobId: string, coverageId: string): Promise<void> {
    const job = await this.resolveJob(jobId);
    if (!this.scope.canUpdateJob(job.agentId)) {
      throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    }

    const existing = await this.db.jobCoverage.findFirst({ where: { jobId, coverageId } });
    if (!existing) throw new BusinessException('COVERAGE_NOT_FOUND', 'Job coverage not found', 404);

    await this.db.jobCoverage.delete({ where: { id: existing.id } });
  }
}
