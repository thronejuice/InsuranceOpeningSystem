import { Injectable } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { computeQuotation } from './domain/quotation-calc.js';
import { calculateCommission } from '../commission/domain/commission-calc.js';
import { QuotationRepository } from './quotation.repository.js';
import type { CreateQuotationDto } from './dto/create-quotation.dto.js';
import type { UpdateQuotationDto, WithdrawQuotationDto } from './dto/update-quotation.dto.js';
import type { SelectQuotationDto } from './dto/select-quotation.dto.js';
import {
  toQuotationResponse,
  formatDecimal,
  formatDateString,
  type QuotationResponse,
} from './dto/quotation.response.js';
import type { CompanyColumn, QuotationComparisonResponse } from './dto/comparison.response.js';
import type { ListQuotationDto } from './dto/list-quotation.dto.js';

import { JobWorkflowService } from '../job/job-workflow.service.js';
import { NotificationService } from '../notification/notification.service.js';
import { NotificationType } from '../../generated/prisma/enums.js';

@Injectable()
export class QuotationService {
  constructor(
    private readonly repo: QuotationRepository,
    private readonly sequence: SequenceService,
    private readonly audit: AuditService,
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly cls: ClsService<AppClsStore>,
    private readonly scope: DataScopeService,
    private readonly workflow: JobWorkflowService,
    private readonly notifications: NotificationService,
  ) {}

  async listAll(dto: ListQuotationDto): Promise<QuotationResponse[]> {
    const where: Record<string, unknown> = { job: { deletedAt: null, ...this.scope.jobViewScope() } };
    if (dto.insuranceCompanyId) where['insuranceCompanyId'] = dto.insuranceCompanyId;
    if (dto.status) where['status'] = dto.status;
    if (dto.validUntilFrom || dto.validUntilTo) {
      where['validUntil'] = {
        ...(dto.validUntilFrom && { gte: new Date(dto.validUntilFrom) }),
        ...(dto.validUntilTo && { lte: new Date(dto.validUntilTo) }),
      };
    }
    const items = await this.repo.findAll(where as Parameters<typeof this.repo.findAll>[0]);
    return items.map(toQuotationResponse);
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

    // 1. Insurer required validation
    if (!dto.insuranceCompanyId?.trim()) {
      throw new BusinessException('INSURER_REQUIRED', 'Insurer is required', 422);
    }

    // 2. Date validation: validUntil > quotationDate
    if (dto.quotationDate && dto.validUntil) {
      const qDate = new Date(dto.quotationDate);
      const vDate = new Date(dto.validUntil);
      if (vDate.getTime() <= qDate.getTime()) {
        throw new BusinessException(
          'INVALID_DATE_RANGE',
          'Valid until date must be after quotation date',
          422,
        );
      }
    }

    // 3. Underwriting check
    const product = await this.txHost.tx.insuranceProduct?.findFirst?.({
      where: { id: job.productId },
      select: { requireUnderwriting: true },
    });
    if (product?.requireUnderwriting) {
      const latestUw = await this.txHost.tx.underwriting?.findFirst?.({
        where: { jobId, deletedAt: null },
        orderBy: { version: 'desc' },
      });
      if (!latestUw || latestUw.status !== 'APPROVED') {
        throw new BusinessException(
          'UNDERWRITING_REQUIRED',
          'Underwriting approval is required before requesting quotation',
          422,
        );
      }
    }

    // 4. Insurer existence check
    if (this.txHost.tx.insuranceCompany?.findFirst) {
      const company = await this.txHost.tx.insuranceCompany.findFirst({
        where: { id: dto.insuranceCompanyId, deletedAt: null },
      });
      if (!company) {
        throw new BusinessException('COMPANY_NOT_FOUND', 'Insurance company not found', 404);
      }
    }

    const existing = await this.repo.findByJobAndCompany(jobId, dto.insuranceCompanyId);
    if (existing) {
      throw new BusinessException('QUOTATION_COMPANY_DUPLICATE', 'บริษัทประกันนี้มีใบเสนอราคาในงานนี้แล้ว', 400);
    }

    // 5. Premium validation via computeQuotation
    let calc;
    try {
      calc = computeQuotation({
        gross: dto.grossPremium,
        discount: dto.discount ?? '0',
        stampDuty: dto.stampDuty,
        tax: dto.tax,
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (
          err.message === 'PREMIUM_NEGATIVE' ||
          err.message === 'NET_PREMIUM_NEGATIVE' ||
          err.message === 'DISCOUNT_NEGATIVE'
        ) {
          throw new BusinessException('PREMIUM_NEGATIVE', 'Premium cannot be negative', 422);
        }
        if (err.message === 'QUOTATION_TOTAL_NEGATIVE') {
          throw new BusinessException('QUOTATION_TOTAL_NEGATIVE', 'Total amount cannot be negative', 422);
        }
      }
      throw err;
    }

    // 6. Commission rate default from master
    const qDate = dto.quotationDate ? new Date(dto.quotationDate) : new Date();
    let resolvedCommissionRate = dto.commissionRate ?? null;
    if (!resolvedCommissionRate && this.txHost.tx.commissionRate?.findFirst) {
      const masterRate = await this.txHost.tx.commissionRate.findFirst({
        where: {
          insuranceCompanyId: dto.insuranceCompanyId,
          productId: job.productId,
          effectiveFrom: { lte: qDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: qDate } }],
          deletedAt: null,
        },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (masterRate) {
        resolvedCommissionRate = masterRate.rate.toString();
      }
    }
    const resolvedCommissionAmount =
      dto.commissionAmount ??
      (resolvedCommissionRate != null ? calculateCommission(calc.net, resolvedCommissionRate) : null);

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
      versions: {
        create: {
          version: 1,
          status: 'ACTIVE',
          ...(dto.quotationDate && { quotationDate: new Date(dto.quotationDate) }),
          ...(dto.validUntil && { validUntil: new Date(dto.validUntil) }),
          grossPremium: dto.grossPremium,
          discount: dto.discount ?? '0',
          netPremium: calc.net,
          stampDuty: calc.stampDuty,
          tax: calc.tax,
          totalAmount: calc.total,
          commissionRate: resolvedCommissionRate,
          commissionAmount: resolvedCommissionAmount,
          deductible: dto.deductible,
          exclusion: dto.exclusion,
          specialCondition: dto.specialCondition,
          insurerReference: dto.insurerReference,
          underwriter: dto.underwriter,
          attachment: dto.attachment,
          remark: dto.remark,
          createdBy: userId ? { connect: { id: userId } } : undefined,
        },
      },
    });

    const createdVersion = quotation.versions?.[0];
    if (dto.items?.length && createdVersion) {
      await this.txHost.tx.quotationItem.createMany({
        data: dto.items.map((item) => ({
          quotationId: quotation.id,
          quotationVersionId: createdVersion.id,
          coverageId: item.coverageId ?? null,
          coverageName: item.coverageName,
          sumInsured: item.sumInsured,
          rate: item.rate ?? null,
          deductible: item.deductible ?? null,
          premium: item.premium,
          remark: item.remark ?? null,
        })),
      });
    }

    // If first quotation for this job, transition job → QUOTATION_REQUESTED
    if (job.status === 'OPEN' || job.status === 'WAITING_INFORMATION') {
      const totalCount = await this.repo.countRequestedForJob(jobId);
      if (totalCount === 1) {
        await this.workflow.transitionInTx(job, 'QUOTATION_REQUESTED', userId);
      }
    }

    await this.audit.log({
      action: 'CREATE_QUOTATION',
      entityType: 'QUOTATION',
      entityId: quotation.id,
      jobId,
    });

    const refreshed = await this.repo.findById(quotation.id);
    return toQuotationResponse(refreshed ?? quotation);
  }

  @Transactional()
  async update(id: string, dto: UpdateQuotationDto): Promise<QuotationResponse> {
    return this.recordReceived(id, dto);
  }

  @Transactional()
  async recordReceived(id: string, dto: UpdateQuotationDto): Promise<QuotationResponse> {
    const userId = this.cls.get('userId')!;
    const quotation = await this.repo.findById(id);
    if (!quotation) throw new BusinessException('QUOTATION_NOT_FOUND', 'Quotation not found', 404);

    await this.assertJobAccess(quotation.jobId);

    if (quotation.status !== 'REQUESTED' && quotation.status !== 'RECEIVED') {
      throw new BusinessException(
        'QUOTATION_INVALID_STATUS',
        `Cannot record received for quotation in status ${quotation.status}`,
        409,
      );
    }

    // Date validation
    const qDate = dto.quotationDate
      ? new Date(dto.quotationDate)
      : (quotation.quotationDate ?? new Date());
    if (dto.validUntil && qDate) {
      const vDate = new Date(dto.validUntil);
      if (vDate.getTime() <= qDate.getTime()) {
        throw new BusinessException('INVALID_DATE_RANGE', 'Valid until date must be after quotation date', 422);
      }
    }

    const gross = dto.grossPremium ?? quotation.grossPremium.toString();
    const discount = dto.discount ?? quotation.discount.toString();
    let calc;
    try {
      calc = computeQuotation({ gross, discount, stampDuty: dto.stampDuty, tax: dto.tax });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (
          err.message === 'PREMIUM_NEGATIVE' ||
          err.message === 'NET_PREMIUM_NEGATIVE' ||
          err.message === 'DISCOUNT_NEGATIVE'
        ) {
          throw new BusinessException('PREMIUM_NEGATIVE', 'Premium cannot be negative', 422);
        }
        if (err.message === 'QUOTATION_TOTAL_NEGATIVE') {
          throw new BusinessException('QUOTATION_TOTAL_NEGATIVE', 'Total amount cannot be negative', 422);
        }
      }
      throw err;
    }

    // 1. Mark existing ACTIVE versions as SUPERSEDED (V2 §9.1)
    if (this.txHost.tx.quotationVersion?.updateMany) {
      await this.txHost.tx.quotationVersion.updateMany({
        where: { quotationId: id, status: 'ACTIVE' },
        data: { status: 'SUPERSEDED' },
      });
    }

    // 2. Next version number
    let nextVersion = quotation.version + 1;
    if (this.txHost.tx.quotationVersion?.findFirst) {
      const latestVersionRecord = await this.txHost.tx.quotationVersion.findFirst({
        where: { quotationId: id, deletedAt: null },
        orderBy: { version: 'desc' },
      });
      if (latestVersionRecord) {
        nextVersion = latestVersionRecord.version + 1;
      }
    }

    // 3. Commission rate resolution
    const job = await this.getJobOrThrow(quotation.jobId);
    let resolvedCommissionRate = dto.commissionRate ?? null;
    if (!resolvedCommissionRate && this.txHost.tx.commissionRate?.findFirst) {
      const masterRate = await this.txHost.tx.commissionRate.findFirst({
        where: {
          insuranceCompanyId: quotation.insuranceCompanyId,
          productId: job.productId,
          effectiveFrom: { lte: qDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: qDate } }],
          deletedAt: null,
        },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (masterRate) {
        resolvedCommissionRate = masterRate.rate.toString();
      }
    }
    const resolvedCommissionAmount =
      dto.commissionAmount ??
      (resolvedCommissionRate != null ? calculateCommission(calc.net, resolvedCommissionRate) : null);

    // 4. Create new QuotationVersion
    let newVersion: any = null;
    if (this.txHost.tx.quotationVersion?.create) {
      newVersion = await this.txHost.tx.quotationVersion.create({
        data: {
          quotationId: id,
          version: nextVersion,
          status: 'ACTIVE',
          quotationDate: dto.quotationDate ? new Date(dto.quotationDate) : quotation.quotationDate,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : quotation.validUntil,
          grossPremium: gross,
          discount,
          netPremium: calc.net,
          stampDuty: calc.stampDuty,
          tax: calc.tax,
          totalAmount: calc.total,
          commissionRate: resolvedCommissionRate,
          commissionAmount: resolvedCommissionAmount,
          deductible: dto.deductible,
          exclusion: dto.exclusion,
          specialCondition: dto.specialCondition,
          insurerReference: dto.insurerReference,
          underwriter: dto.underwriter,
          attachment: dto.attachment,
          remark: dto.remark ?? quotation.remark,
          createdById: userId ?? null,
        },
      });
    }

    // 5. Create new coverage items for this version
    if (dto.items?.length && this.txHost.tx.quotationItem?.createMany) {
      await this.txHost.tx.quotationItem.createMany({
        data: dto.items.map((item) => ({
          quotationId: id,
          quotationVersionId: newVersion?.id ?? null,
          coverageId: item.coverageId ?? null,
          coverageName: item.coverageName,
          sumInsured: item.sumInsured,
          rate: item.rate ?? null,
          deductible: item.deductible ?? null,
          premium: item.premium,
          remark: item.remark ?? null,
        })),
      });
    }

    // 6. Update Quotation header
    const updated = await this.repo.update(id, {
      status: 'RECEIVED',
      version: nextVersion,
      ...(dto.quotationDate && { quotationDate: new Date(dto.quotationDate) }),
      ...(dto.validUntil && { validUntil: new Date(dto.validUntil) }),
      grossPremium: gross,
      discount,
      netPremium: calc.net,
      stampDuty: calc.stampDuty,
      tax: calc.tax,
      totalAmount: calc.total,
      ...(dto.remark !== undefined && { remark: dto.remark }),
    });

    // If first RECEIVED quotation for this job, transition job → QUOTATION_RECEIVED
    if (job.status === 'QUOTATION_REQUESTED') {
      const receivedCount = await this.repo.countReceivedForJob(quotation.jobId);
      if (receivedCount === 1) {
        await this.workflow.transitionInTx(job, 'QUOTATION_RECEIVED', userId);
      }
    }

    await this.audit.log({
      action: quotation.status === 'RECEIVED' ? 'UPDATE_QUOTATION' : 'QUOTATION_RECEIVED',
      entityType: 'QUOTATION',
      entityId: id,
      jobId: quotation.jobId,
      before: quotation,
      after: updated,
      remark: dto.remark,
    });

    const recipientIds = [job.agentId, job.brokerStaffId].filter((agentId): agentId is string => Boolean(agentId));
    if (recipientIds.length > 0) {
      await this.notifications.emit(
        NotificationType.QUOTATION_RECEIVED,
        recipientIds,
        {
          title: `ใบเสนอราคาสำหรับงาน ${job.jobNo}`,
          message: `ใบเสนอราคา ${updated.quotationNo} ได้รับการบันทึกข้อมูลเรียบร้อยแล้ว`,
          entityType: 'QUOTATION',
          entityId: id,
          jobId: quotation.jobId,
        },
      );
    }

    const refreshed = await this.repo.findById(id);
    return toQuotationResponse(refreshed ?? updated);
  }

  @Transactional()
  async select(id: string, dto: SelectQuotationDto): Promise<QuotationResponse> {
    const userId = this.cls.get('userId')!;
    const quotation = await this.repo.findById(id);
    if (!quotation) throw new BusinessException('QUOTATION_NOT_FOUND', 'Quotation not found', 404);

    await this.assertJobAccess(quotation.jobId);

    if (quotation.status === 'SELECTED') {
      return toQuotationResponse(quotation);
    }
    if (quotation.status === 'WITHDRAWN') {
      throw new BusinessException('QUOTATION_WITHDRAWN', 'ไม่สามารถเลือกใบเสนอราคาที่ถูกเพิกถอนแล้วได้', 422);
    }
    if (quotation.status === 'EXPIRED') {
      throw new BusinessException('QUOTATION_EXPIRED', 'ใบเสนอราคาหมดอายุแล้ว', 422);
    }
    if (quotation.status === 'REJECTED') {
      throw new BusinessException('QUOTATION_REJECTED', 'ไม่สามารถเลือกใบเสนอราคาที่ถูกปฏิเสธแล้วได้', 422);
    }

    if (quotation.status !== 'RECEIVED') {
      throw new BusinessException(
        'QUOTATION_INVALID_STATUS',
        `Cannot select quotation in status ${quotation.status}`,
        409,
      );
    }

    // Version check:
    // The selected version must be the latest version (not an old/superseded version)
    const sortedVersions = quotation.versions && quotation.versions.length > 0
      ? [...quotation.versions].sort((a, b) => b.version - a.version)
      : [];
    const latestVersionRecord = sortedVersions[0] ?? (
      this.txHost.tx.quotationVersion?.findFirst ?
      await this.txHost.tx.quotationVersion.findFirst({
        where: { quotationId: id, deletedAt: null },
        orderBy: { version: 'desc' },
      }) : null
    );

    if (latestVersionRecord) {
      if (dto.version != null && latestVersionRecord.version !== dto.version) {
        throw new BusinessException(
          'OLD_VERSION_CANNOT_BE_SELECTED',
          'ไม่สามารถเลือกใบเสนอราคาเวอร์ชันเก่าที่ถูกแทนที่แล้วได้',
          422,
        );
      }
      if (latestVersionRecord.status === 'SUPERSEDED') {
        throw new BusinessException(
          'OLD_VERSION_CANNOT_BE_SELECTED',
          'ไม่สามารถเลือกใบเสนอราคาเวอร์ชันเก่าที่ถูกแทนที่แล้วได้',
          422,
        );
      }
    }

    // Check expiry (validUntil < today Bangkok time)
    const effectiveValidUntil = latestVersionRecord?.validUntil ?? quotation.validUntil;
    if (effectiveValidUntil) {
      const todayBkk = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
      const validUntilStr = (effectiveValidUntil as Date).toISOString().slice(0, 10);
      if (validUntilStr < todayBkk) {
        throw new BusinessException('QUOTATION_EXPIRED', 'Quotation has expired', 422);
      }
    }

    // Optimistic lock on quotation.version
    const { count } = await this.txHost.tx.quotation.updateMany({
      where: { id, version: quotation.version, status: 'RECEIVED' },
      data: { status: 'SELECTED', version: { increment: 1 } },
    });
    if (count === 0) {
      throw new BusinessException('CONCURRENT_MODIFICATION', 'Quotation was modified by another user', 409);
    }

    // Update active version status to SELECTED
    if (this.txHost.tx.quotationVersion?.updateMany) {
      await this.txHost.tx.quotationVersion.updateMany({
        where: { quotationId: id, status: 'ACTIVE' },
        data: { status: 'SELECTED' },
      });
    }

    const job = await this.getJobOrThrow(quotation.jobId);

    // Update job.selectedQuotationId + transition to QUOTATION_SELECTED
    await this.txHost.tx.job.update({
      where: { id: quotation.jobId },
      data: { selectedQuotationId: id },
    });
    await this.workflow.transitionInTx(job, 'QUOTATION_SELECTED', userId);

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

  @Transactional()
  async withdraw(id: string, dto?: WithdrawQuotationDto): Promise<QuotationResponse> {
    const quotation = await this.repo.findById(id);
    if (!quotation) throw new BusinessException('QUOTATION_NOT_FOUND', 'Quotation not found', 404);

    await this.assertJobAccess(quotation.jobId);
    const job = await this.getJobOrThrow(quotation.jobId);

    if (quotation.status === 'SELECTED' || job.selectedQuotationId === id) {
      throw new BusinessException(
        'QUOTATION_CANNOT_WITHDRAW_SELECTED',
        'ไม่สามารถถอนใบเสนอราคาที่ถูกเลือกแล้วได้',
        422,
      );
    }

    if (quotation.status === 'WITHDRAWN') {
      return toQuotationResponse(quotation);
    }

    const updated = await this.repo.update(id, {
      status: 'WITHDRAWN',
    });

    if (this.txHost.tx.quotationVersion?.updateMany) {
      await this.txHost.tx.quotationVersion.updateMany({
        where: { quotationId: id, status: 'ACTIVE' },
        data: { status: 'WITHDRAWN' },
      });
    }

    await this.audit.log({
      action: 'QUOTATION_WITHDRAWN',
      entityType: 'QUOTATION',
      entityId: id,
      jobId: quotation.jobId,
      oldValue: { status: quotation.status },
      newValue: { status: 'WITHDRAWN' },
      description: dto?.reason,
    });

    const refreshed = await this.repo.findById(id);
    return toQuotationResponse(refreshed ?? updated);
  }

  @Transactional()
  async expireOutdatedQuotations(now = new Date()): Promise<{ count: number }> {
    const bkkFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' });
    const todayBkkStr = bkkFormatter.format(now);
    const todayBkk = new Date(`${todayBkkStr}T00:00:00+07:00`);

    const outdated = await this.repo.findOutdated(todayBkk);
    if (!outdated || outdated.length === 0) return { count: 0 };

    const ids = outdated.map((q) => q.id);
    await this.txHost.tx.quotation.updateMany({
      where: { id: { in: ids } },
      data: { status: 'EXPIRED' },
    });

    if (this.txHost.tx.quotationVersion?.updateMany) {
      await this.txHost.tx.quotationVersion.updateMany({
        where: { quotationId: { in: ids }, status: 'ACTIVE' },
        data: { status: 'EXPIRED' },
      });
    }

    for (const q of outdated) {
      await this.audit.log({
        action: 'QUOTATION_EXPIRED',
        entityType: 'QUOTATION',
        entityId: q.id,
        jobId: q.jobId,
        oldValue: { status: q.status },
        newValue: { status: 'EXPIRED' },
        description: 'Expired by daily check',
      });
    }

    return { count: ids.length };
  }

  async notifyExpiringQuotations(now = new Date()): Promise<{ count: number }> {
    const bkkFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' });
    const todayBkkStr = bkkFormatter.format(now);
    const todayBkk = new Date(`${todayBkkStr}T00:00:00+07:00`);

    const in3Days = new Date(todayBkk);
    in3Days.setDate(in3Days.getDate() + 3);
    const in3DaysEnd = new Date(in3Days);
    in3DaysEnd.setHours(23, 59, 59, 999);

    const expiring = await this.repo.findExpiring(todayBkk, in3DaysEnd);
    if (!expiring || expiring.length === 0) return { count: 0 };

    let count = 0;
    for (const q of expiring) {
      const job = q.job;
      if (!job) continue;
      const recipients = [job.agentId, job.brokerStaffId].filter((u): u is string => Boolean(u));
      if (recipients.length === 0) continue;

      const validUntilStr = q.validUntil ? bkkFormatter.format(q.validUntil) : todayBkkStr;
      await this.notifications.emit(
        NotificationType.QUOTATION_EXPIRING,
        recipients,
        {
          title: `ใบเสนอราคาใกล้หมดอายุสำหรับงาน ${job.jobNo}`,
          message: `ใบเสนอราคา ${q.quotationNo} (${q.insuranceCompany?.name ?? ''}) กำลังจะหมดอายุในวันที่ ${validUntilStr}`,
          entityType: 'QUOTATION',
          entityId: q.id,
          jobId: q.jobId,
        },
      );
      count++;
    }

    return { count };
  }

  async processDaily(now = new Date()): Promise<{ expiredCount: number; expiringCount: number }> {
    const expired = await this.expireOutdatedQuotations(now);
    const expiring = await this.notifyExpiringQuotations(now);
    return {
      expiredCount: expired.count,
      expiringCount: expiring.count,
    };
  }

  @Transactional()
  async delete(id: string): Promise<void> {
    const quotation = await this.repo.findById(id);
    if (!quotation) throw new BusinessException('QUOTATION_NOT_FOUND', 'Quotation not found', 404);

    await this.assertJobAccess(quotation.jobId);
    const job = await this.getJobOrThrow(quotation.jobId);

    if (quotation.status === 'SELECTED' || job.selectedQuotationId === id) {
      throw new BusinessException('QUOTATION_CANNOT_DELETE_SELECTED', 'ไม่สามารถลบใบเสนอราคาที่ถูกเลือกแล้วได้', 400);
    }

    const proposalCount = await this.txHost.tx.proposal.count({ where: { quotationId: id } });
    if (proposalCount > 0) {
      throw new BusinessException('QUOTATION_REFERENCED_BY_PROPOSAL', 'ไม่สามารถลบใบเสนอราคาที่ถูกนำไปสร้างใบเสนอแล้วได้', 400);
    }

    const bindingCount = await this.txHost.tx.binding.count({ where: { quotationId: id } });
    if (bindingCount > 0) {
      throw new BusinessException('QUOTATION_REFERENCED_BY_BINDING', 'ไม่สามารถลบใบเสนอราคาที่มีการยืนยันการรับประกันแล้วได้', 400);
    }

    const policyCount = await this.txHost.tx.policy.count({ where: { quotationId: id } });
    if (policyCount > 0) {
      throw new BusinessException('QUOTATION_REFERENCED_BY_POLICY', 'ไม่สามารถลบใบเสนอราคาที่มีการออกกรมธรรม์แล้วได้', 400);
    }

    await this.txHost.tx.quotationItem.deleteMany({ where: { quotationId: id } });
    await this.repo.delete(id);

    await this.audit.log({
      action: 'DELETE_QUOTATION',
      entityType: 'QUOTATION',
      entityId: id,
      jobId: quotation.jobId,
    });
  }

  async comparison(jobId: string): Promise<QuotationComparisonResponse> {
    await this.assertJobAccess(jobId);

    const quotations = await this.repo.findAllByJob(jobId);
    const receivedOrSelected = quotations.filter((q) =>
      q.status === 'RECEIVED' || q.status === 'SELECTED',
    );

    // Collect all unique coverage names across the latest versions of receivedOrSelected quotations
    const allCoverageNames: string[] = [];
    for (const q of receivedOrSelected) {
      const sorted = q.versions ? [...q.versions].sort((a, b) => b.version - a.version) : [];
      const items = sorted[0]?.items ?? q.items ?? [];
      for (const item of items) {
        if (!allCoverageNames.includes(item.coverageName)) {
          allCoverageNames.push(item.coverageName);
        }
      }
    }

    let minAmount: number | null = null;
    let minQuotationId: string | null = null;
    if (receivedOrSelected.length > 1) {
      for (const q of receivedOrSelected) {
        const sorted = q.versions ? [...q.versions].sort((a, b) => b.version - a.version) : [];
        const v = sorted[0];
        const amt = Number(v?.totalAmount ?? q.totalAmount);
        if (minAmount == null || amt < minAmount) {
          minAmount = amt;
          minQuotationId = q.id;
        }
      }
    }

    const companies: CompanyColumn[] = receivedOrSelected.map((q) => {
      const sorted = q.versions ? [...q.versions].sort((a, b) => b.version - a.version) : [];
      const v = sorted[0];
      const total = v?.totalAmount ?? q.totalAmount;
      return {
        quotationId: q.id,
        quotationNo: q.quotationNo,
        insuranceCompanyId: q.insuranceCompanyId,
        insuranceCompanyName: q.insuranceCompany?.name ?? '',
        status: q.status,
        version: v?.version ?? q.version,
        quotationDate: formatDateString(v?.quotationDate ?? q.quotationDate),
        validUntil: formatDateString(v?.validUntil ?? q.validUntil),
        grossPremium: formatDecimal(v?.grossPremium ?? q.grossPremium, 2) ?? '0.00',
        discount: formatDecimal(v?.discount ?? q.discount, 2) ?? '0.00',
        netPremium: formatDecimal(v?.netPremium ?? q.netPremium, 2) ?? '0.00',
        stampDuty: formatDecimal(v?.stampDuty ?? q.stampDuty, 2) ?? '0.00',
        tax: formatDecimal(v?.tax ?? q.tax, 2) ?? '0.00',
        totalAmount: formatDecimal(total, 2) ?? '0.00',
        deductible: formatDecimal(v?.deductible, 2),
        commissionRate: formatDecimal(v?.commissionRate, 4),
        commissionAmount: formatDecimal(v?.commissionAmount, 2),
        exclusion: v?.exclusion ?? null,
        specialCondition: v?.specialCondition ?? null,
        underwriter: v?.underwriter ?? null,
        insurerReference: v?.insurerReference ?? null,
        isLowest: q.id === minQuotationId,
      };
    });

    const coverages = allCoverageNames.map((coverageName) => ({
      coverageName,
      cells: receivedOrSelected.map((q) => {
        const sorted = q.versions ? [...q.versions].sort((a, b) => b.version - a.version) : [];
        const items = sorted[0]?.items ?? q.items ?? [];
        const item = items.find((i) => i.coverageName === coverageName);
        return {
          sumInsured: item ? formatDecimal(item.sumInsured, 2) : null,
          rate: item ? formatDecimal(item.rate, 6) : null,
          deductible: item ? formatDecimal(item.deductible, 2) : null,
          premium: item ? formatDecimal(item.premium, 2) : null,
          remark: item?.remark ?? null,
        };
      }),
    }));

    return { jobId, companies, coverages };
  }

  private async getJobOrThrow(jobId: string) {
    const job = await this.txHost.tx.job.findFirst({
      where: { id: jobId, deletedAt: null, ...this.scope.jobViewScope() },
    });
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);
    return job;
  }

  private async assertJobAccess(jobId: string) {
    const job = await this.txHost.tx.job.findFirst({
      where: { id: jobId, deletedAt: null, ...this.scope.jobViewScope() },
    });
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);
    return job;
  }
}
