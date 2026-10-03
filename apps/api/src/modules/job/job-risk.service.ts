import { Injectable } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { validateRiskValues, getMissingRequiredFields } from './domain/risk-validator.js';
import type { SaveRiskDto, JobRiskResponse } from './dto/risk.dto.js';

@Injectable()
export class JobRiskService {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly scope: DataScopeService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  private get db() { return this.txHost.tx; }

  async getFieldDefs(productId: string) {
    return this.db.riskFieldDefinition.findMany({
      where: { productId, active: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getRisk(jobId: string): Promise<JobRiskResponse> {
    const job = await this.db.job.findFirst({ where: { id: jobId, deletedAt: null }, select: { id: true, productId: true, agentId: true } });
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);

    const userId = this.cls.get('userId')!;
    const permissions = this.cls.get('permissions') ?? [];
    if (!permissions.includes('job.view_all') && job.agentId !== userId) {
      throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    }

    const fieldDefs = await this.getFieldDefs(job.productId);
    const risk = await this.db.jobRisk.findUnique({
      where: { jobId },
      include: { values: true },
    });

    const values: Record<string, string | null> = {};
    for (const v of risk?.values ?? []) {
      values[v.fieldCode] = v.fieldValue;
    }

    return {
      jobId,
      fieldDefs: fieldDefs.map((f) => ({
        id: f.id,
        fieldCode: f.fieldCode,
        fieldName: f.fieldName,
        fieldType: f.fieldType,
        isRequired: f.isRequired,
        validationRule: f.validationRule,
        sortOrder: f.sortOrder,
      })),
      values,
    };
  }

  @Transactional()
  async saveRisk(jobId: string, dto: SaveRiskDto): Promise<JobRiskResponse> {
    const job = await this.db.job.findFirst({ where: { id: jobId, deletedAt: null }, select: { id: true, productId: true, agentId: true, status: true } });
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);

    if (!this.scope.canUpdateJob(job.agentId)) {
      throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    }

    const fieldDefs = await this.getFieldDefs(job.productId);
    const incoming = dto.values ?? {};

    // Validate against field definitions
    const errors = validateRiskValues(
      fieldDefs.map((f) => ({ fieldCode: f.fieldCode, fieldName: f.fieldName, fieldType: f.fieldType, isRequired: f.isRequired, validationRule: f.validationRule })),
      incoming,
    );

    if (errors.length > 0) {
      const errMap = Object.fromEntries(errors.map((e) => [e.field, [e.message]]));
      throw new BusinessException('VALIDATION_FAILED', 'Risk validation failed', 422, errMap);
    }

    // Upsert the job_risk header
    const risk = await this.db.jobRisk.upsert({
      where: { jobId },
      create: { jobId },
      update: { updatedAt: new Date() },
    });

    // Upsert each value
    for (const [fieldCode, fieldValue] of Object.entries(incoming)) {
      await this.db.jobRiskValue.upsert({
        where: { jobRiskId_fieldCode: { jobRiskId: risk.id, fieldCode } },
        create: { jobRiskId: risk.id, fieldCode, fieldValue: fieldValue ?? null },
        update: { fieldValue: fieldValue ?? null },
      });
    }

    return this.getRisk(jobId);
  }

  async checkRiskComplete(jobId: string): Promise<string[]> {
    const job = await this.db.job.findFirst({ where: { id: jobId, deletedAt: null }, select: { productId: true } });
    if (!job) return [];

    const fieldDefs = await this.getFieldDefs(job.productId);
    const risk = await this.db.jobRisk.findUnique({ where: { jobId }, include: { values: true } });
    const values: Record<string, string | null> = {};
    for (const v of risk?.values ?? []) {
      values[v.fieldCode] = v.fieldValue;
    }

    return getMissingRequiredFields(
      fieldDefs.map((f) => ({ fieldCode: f.fieldCode, fieldName: f.fieldName, fieldType: f.fieldType, isRequired: f.isRequired, validationRule: f.validationRule })),
      values,
    );
  }
}
