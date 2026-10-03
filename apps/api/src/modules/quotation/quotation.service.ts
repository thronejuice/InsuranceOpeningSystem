import { Injectable } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import type { JobStatus } from '../../generated/prisma/enums.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { computeQuotation } from './domain/quotation-calc.js';
import { QuotationRepository } from './quotation.repository.js';
import type { CreateQuotationDto } from './dto/create-quotation.dto.js';
import type { UpdateQuotationDto } from './dto/update-quotation.dto.js';
import type { SelectQuotationDto } from './dto/select-quotation.dto.js';
import { toQuotationResponse, type QuotationResponse } from './dto/quotation.response.js';
import type { QuotationComparisonResponse } from './dto/comparison.response.js';
import type { ListQuotationDto } from './dto/list-quotation.dto.js';

@Injectable()
export class QuotationService {
  constructor(
    private readonly repo: QuotationRepository,
    private readonly sequence: SequenceService,
    private readonly audit: AuditService,
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async listAll(dto: ListQuotationDto): Promise<{ data: QuotationResponse[] }> {
    const where: Record<string, unknown> = {};
    if (dto.insuranceCompanyId) where['insuranceCompanyId'] = dto.insuranceCompanyId;
    if (dto.status) where['status'] = dto.status;
    if (dto.validUntilFrom || dto.validUntilTo) {
      where['validUntil'] = {
        ...(dto.validUntilFrom && { gte: new Date(dto.validUntilFrom) }),
        ...(dto.validUntilTo && { lte: new Date(dto.validUntilTo) }),
      };
    }
    const items = await this.repo.findAll(where as Parameters<typeof this.repo.findAll>[0]);
    return { data: items.map(toQuotationResponse) };
  }

  async listByJob(jobId: string): Promise<QuotationResponse[]> {
    await this.assertJobAccess(jobId);
    const items = await this.repo.findAllByJob(jobId);
    return items.map(toQuotationResponse);
  }

  @Transactional()
  async create(jobId: string, dto: CreateQuotationDto): Promise<QuotationResponse> {
    const userId = this.cls.get('userId')!;
    const job = await this.getJobOrThrow(jobId);

    let calc;
    try {
      calc = computeQuotation({ gross: dto.grossPremium, discount: dto.discount ?? '0', stampDuty: dto.stampDuty, tax: dto.tax });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'QUOTATION_TOTAL_NEGATIVE') {
        throw new BusinessException('QUOTATION_TOTAL_NEGATIVE', 'Total amount cannot be negative', 422);
      }
      throw err;
    }

    const quotationNo = await this.sequence.next('QUOTATION');
    const quotation = await this.repo.create({
      quotationNo,
      job: { connect: { id: jobId } },
      insuranceCompany: { connect: { id: dto.insuranceCompanyId } },
      ...(dto.quotationDate && { quotationDate: new Date(dto.quotationDate) }),
      ...(dto.validUntil && { validUntil: new Date(dto.validUntil) }),
      grossPremium: dto.grossPremium,
      discount: dto.discount ?? '0',
      netPremium: calc.net,
      stampDuty: calc.stampDuty,
      tax: calc.tax,
      totalAmount: calc.total,
      remark: dto.remark,
      requestedBy: userId ? { connect: { id: userId } } : undefined,
    });

    // If first quotation for this job, transition job → QUOTATION_REQUESTED
    if (job.status === 'OPEN' || job.status === 'WAITING_INFORMATION') {
      const totalCount = await this.repo.countRequestedForJob(jobId);
      if (totalCount === 1) {
        await this.transitionJob(jobId, job.status, job.version, 'QUOTATION_REQUESTED', userId);
      }
    }

    await this.audit.log({
      action: 'CREATE_QUOTATION',
      entityType: 'QUOTATION',
      entityId: quotation.id,
      jobId,
    });

    return toQuotationResponse(quotation);
  }

  @Transactional()
  async recordReceived(id: string, dto: UpdateQuotationDto): Promise<QuotationResponse> {
    const userId = this.cls.get('userId')!;
    const quotation = await this.repo.findById(id);
    if (!quotation) throw new BusinessException('QUOTATION_NOT_FOUND', 'Quotation not found', 404);

    await this.assertJobAccess(quotation.jobId);

    if (quotation.status !== 'REQUESTED') {
      throw new BusinessException(
        'QUOTATION_INVALID_STATUS',
        `Cannot record received for quotation in status ${quotation.status}`,
        409,
      );
    }

    const gross = dto.grossPremium ?? quotation.grossPremium.toString();
    const discount = dto.discount ?? quotation.discount.toString();
    let calc;
    try {
      calc = computeQuotation({ gross, discount, stampDuty: dto.stampDuty, tax: dto.tax });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'QUOTATION_TOTAL_NEGATIVE') {
        throw new BusinessException('QUOTATION_TOTAL_NEGATIVE', 'Total amount cannot be negative', 422);
      }
      throw err;
    }

    // Delete existing items and replace
    await this.txHost.tx.quotationItem.deleteMany({ where: { quotationId: id } });

    const updated = await this.repo.update(id, {
      status: 'RECEIVED',
      version: { increment: 1 },
      ...(dto.quotationDate && { quotationDate: new Date(dto.quotationDate) }),
      ...(dto.validUntil && { validUntil: new Date(dto.validUntil) }),
      grossPremium: gross,
      discount,
      netPremium: calc.net,
      stampDuty: calc.stampDuty,
      tax: calc.tax,
      totalAmount: calc.total,
      ...(dto.remark !== undefined && { remark: dto.remark }),
      items: dto.items?.length
        ? {
            create: dto.items.map((item) => ({
              coverageId: item.coverageId ?? null,
              coverageName: item.coverageName,
              sumInsured: item.sumInsured,
              rate: item.rate ?? null,
              deductible: item.deductible ?? null,
              premium: item.premium,
              remark: item.remark ?? null,
            })),
          }
        : undefined,
    });

    // If first RECEIVED quotation for this job, transition job → QUOTATION_RECEIVED
    const job = await this.getJobOrThrow(quotation.jobId);
    if (job.status === 'QUOTATION_REQUESTED') {
      const receivedCount = await this.repo.countReceivedForJob(quotation.jobId);
      if (receivedCount === 1) {
        await this.transitionJob(quotation.jobId, job.status, job.version, 'QUOTATION_RECEIVED', userId);
      }
    }

    await this.audit.log({
      action: 'QUOTATION_RECEIVED',
      entityType: 'QUOTATION',
      entityId: id,
      jobId: quotation.jobId,
    });

    return toQuotationResponse(updated);
  }

  @Transactional()
  async select(id: string, dto: SelectQuotationDto): Promise<QuotationResponse> {
    const userId = this.cls.get('userId')!;
    const quotation = await this.repo.findById(id);
    if (!quotation) throw new BusinessException('QUOTATION_NOT_FOUND', 'Quotation not found', 404);

    await this.assertJobAccess(quotation.jobId);

    if (quotation.status !== 'RECEIVED') {
      throw new BusinessException(
        'QUOTATION_INVALID_STATUS',
        `Cannot select quotation in status ${quotation.status}`,
        409,
      );
    }

    // Check expiry (validUntil < today Bangkok time)
    if (quotation.validUntil) {
      const todayBkk = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
      const validUntilStr = (quotation.validUntil as Date).toISOString().slice(0, 10);
      if (validUntilStr < todayBkk) {
        throw new BusinessException('QUOTATION_EXPIRED', 'Quotation has expired', 422);
      }
    }

    // Optimistic lock on quotation.version
    const { count } = await this.txHost.tx.quotation.updateMany({
      where: { id, version: dto.version, status: 'RECEIVED' },
      data: { status: 'SELECTED', version: { increment: 1 } },
    });
    if (count === 0) {
      throw new BusinessException('CONCURRENT_MODIFICATION', 'Quotation was modified by another user', 409);
    }

    const job = await this.getJobOrThrow(quotation.jobId);

    // Update job.selectedQuotationId + transition to QUOTATION_SELECTED
    await this.txHost.tx.job.update({
      where: { id: quotation.jobId },
      data: { selectedQuotationId: id },
    });
    await this.transitionJob(quotation.jobId, job.status, job.version, 'QUOTATION_SELECTED', userId);

    await this.audit.log({
      action: 'QUOTATION_SELECTED',
      entityType: 'QUOTATION',
      entityId: id,
      jobId: quotation.jobId,
      description: dto.reason,
    });

    const updated = await this.repo.findById(id);
    return toQuotationResponse(updated!);
  }

  async comparison(jobId: string): Promise<QuotationComparisonResponse> {
    await this.assertJobAccess(jobId);

    const quotations = await this.repo.findAllByJob(jobId);
    const receivedOrSelected = quotations.filter((q) =>
      q.status === 'RECEIVED' || q.status === 'SELECTED',
    );

    // Collect all unique coverage names across all quotations
    const allCoverageNames: string[] = [];
    for (const q of receivedOrSelected) {
      for (const item of q.items ?? []) {
        if (!allCoverageNames.includes(item.coverageName)) {
          allCoverageNames.push(item.coverageName);
        }
      }
    }

    const companies = receivedOrSelected.map((q) => ({
      quotationId: q.id,
      quotationNo: q.quotationNo,
      insuranceCompanyId: q.insuranceCompanyId,
      insuranceCompanyName: q.insuranceCompany?.name ?? '',
      status: q.status,
      validUntil: q.validUntil ? (q.validUntil as Date).toISOString().slice(0, 10) : null,
      totalAmount: q.totalAmount.toFixed(2),
      netPremium: q.netPremium.toFixed(2),
      stampDuty: q.stampDuty.toFixed(2),
      tax: q.tax.toFixed(2),
    }));

    const coverages = allCoverageNames.map((coverageName) => ({
      coverageName,
      cells: receivedOrSelected.map((q) => {
        const item = (q.items ?? []).find((i) => i.coverageName === coverageName);
        return {
          sumInsured: item ? (item.sumInsured as { toFixed(n: number): string }).toFixed(2) : null,
          deductible: item?.deductible ? (item.deductible as { toFixed(n: number): string }).toFixed(2) : null,
          premium: item ? (item.premium as { toFixed(n: number): string }).toFixed(2) : null,
        };
      }),
    }));

    return { jobId, companies, coverages };
  }

  private async getJobOrThrow(jobId: string) {
    const job = await this.txHost.tx.job.findFirst({ where: { id: jobId, deletedAt: null } });
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);
    return job;
  }

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

  private async transitionJob(jobId: string, fromStatus: string, version: number, toStatus: JobStatus, userId: string) {
    const { count } = await this.txHost.tx.job.updateMany({
      where: { id: jobId, version },
      data: { status: toStatus, version: { increment: 1 }, updatedById: userId },
    });
    if (count === 0) {
      throw new BusinessException('CONCURRENT_MODIFICATION', 'Job was modified by another user', 409);
    }
    await this.txHost.tx.jobStatusHistory.create({
      data: { jobId, fromStatus: fromStatus as JobStatus, toStatus, changedById: userId },
    });
  }
}
