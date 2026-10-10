import { Injectable } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { Decimal } from 'decimal.js';
import {
  EndorsementStatus,
  PolicyStatus,
  PremiumAdjustmentType,
  InvoiceType,
  InvoiceStatus,
  RefundStatus,
} from '../../generated/prisma/enums.js';
import { canApproveType, evaluateApprovalRules, isSelfDecisionBlocked, type ApprovalViewer } from '../approval/domain/approval-rules.js';
import { computeAdjustment } from '../commission/domain/adjustment.js';
import { EndorsementRepository } from './endorsement.repository.js';
import { calculateProRataPremium } from './domain/pro-rata.js';
import { validateAdjustmentAmounts } from './domain/adjustment-amounts.js';
import { validateEndorsementChanges } from './domain/endorsement-fields.js';
import type { CalculateProRataDto, CreateEndorsementDto } from './dto/create-endorsement.dto.js';
import type { ListEndorsementDto } from './dto/list-endorsement.dto.js';
import { toEndorsementResponse, type EndorsementResponse } from './dto/endorsement.response.js';

/** Pro-rata result as the API returns it: money and rates are decimal strings. */
export interface ProRataResponse {
  totalDays: number;
  remainingDays: number;
  dailyRate: string;
  proRataNet: string;
  stampDuty: string;
  vat: string;
  totalAdjustment: string;
}

@Injectable()
export class EndorsementService {
  constructor(
    private readonly repo: EndorsementRepository,
    private readonly sequence: SequenceService,
    private readonly audit: AuditService,
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly cls: ClsService<AppClsStore>,
    private readonly scope: DataScopeService,
  ) {}

  private async assertPolicyAccess(policyId: string) {
    const policy = await this.txHost.tx.policy.findFirst({
      where: { id: policyId },
    });
    if (!policy) {
      throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    }
    const job = await this.txHost.tx.job.findFirst({
      where: { id: policy.jobId, deletedAt: null, ...this.scope.jobViewScope() },
    });
    if (!job) {
      throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    }
    return policy;
  }

  async calculateProRata(policyId: string, dto: CalculateProRataDto): Promise<ProRataResponse> {
    const policy = await this.assertPolicyAccess(policyId);
    if (!policy.expiryDate) {
      throw new BusinessException('POLICY_NO_EXPIRY', 'Policy has no expiry date for pro-rata calculation', 422);
    }

    const result = calculateProRataPremium({
      effectiveDate: policy.effectiveDate,
      expiryDate: policy.expiryDate,
      endorsementDate: dto.endorsementDate,
      annualNetPremium: dto.annualNetPremium ?? policy.netPremium.toString(),
    });
    return {
      totalDays: result.totalDays,
      remainingDays: result.remainingDays,
      dailyRate: result.dailyRate.toFixed(4),
      proRataNet: result.proRataNet.toFixed(2),
      stampDuty: result.stampDuty.toFixed(2),
      vat: result.vat.toFixed(2),
      totalAdjustment: result.totalAdjustment.toFixed(2),
    };
  }

  @Transactional()
  async createEndorsement(policyId: string, dto: CreateEndorsementDto): Promise<EndorsementResponse> {
    const userId = this.cls.get('userId')!;
    const policy = await this.assertPolicyAccess(policyId);

    // Rule: Endorsements can only be requested on ACTIVE or EXPIRING policies
    if (policy.status !== PolicyStatus.ACTIVE && policy.status !== PolicyStatus.EXPIRING) {
      throw new BusinessException(
        'POLICY_INVALID_STATUS',
        `Endorsement can only be created for ACTIVE or EXPIRING policy (current: ${policy.status})`,
        409,
      );
    }

    // Validate fields against endorsement type
    const validation = validateEndorsementChanges(dto.type, dto.changes);
    if (!validation.valid) {
      throw new BusinessException('ENDORSEMENT_INVALID_CHANGES', validation.errors.join('; '), 422);
    }

    const adjustmentType = dto.premiumAdjustmentType ?? PremiumAdjustmentType.NO_CHANGE;
    const amountProblems = validateAdjustmentAmounts({
      type: adjustmentType,
      net: dto.netAdjustment ?? '0',
      stampDuty: dto.stampDuty ?? '0',
      vat: dto.vat ?? '0',
      total: dto.totalAdjustment ?? '0',
    });
    if (amountProblems.length > 0) {
      throw new BusinessException('ENDORSEMENT_INVALID_AMOUNTS', amountProblems.join('; '), 422);
    }

    const endorsementNo = await this.sequence.next('ENDORSEMENT');

    const created = await this.repo.create({
      endorsementNo,
      policy: { connect: { id: policyId } },
      type: dto.type,
      status: EndorsementStatus.DRAFT,
      effectiveDate: new Date(dto.effectiveDate),
      changes: dto.changes as unknown as Prisma.InputJsonValue,
      premiumAdjustmentType: adjustmentType,
      netAdjustment: dto.netAdjustment ?? '0',
      stampDuty: dto.stampDuty ?? '0',
      vat: dto.vat ?? '0',
      totalAdjustment: dto.totalAdjustment ?? '0',
      remark: dto.remark,
      insurerDocument: dto.insurerDocumentId ? { connect: { id: dto.insurerDocumentId } } : undefined,
      requestedBy: userId ? { connect: { id: userId } } : undefined,
      requestedAt: new Date(),
    });

    await this.audit.log({
      action: 'CREATE_ENDORSEMENT',
      entityType: 'ENDORSEMENT',
      entityId: created.id,
      jobId: policy.jobId,
      after: created,
    });

    return toEndorsementResponse(created);
  }

  async listEndorsements(dto: ListEndorsementDto): Promise<{ items: EndorsementResponse[]; total: number; page: number; perPage: number }> {
    const page = dto.page ?? 1;
    const perPage = dto.perPage ?? 20;
    const skip = (page - 1) * perPage;

    if (dto.policyId) {
      await this.assertPolicyAccess(dto.policyId);
    }

    const where: Prisma.EndorsementWhereInput = {
      ...(dto.policyId ? { policyId: dto.policyId } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.type ? { type: dto.type } : {}),
      policy: {
        job: {
          deletedAt: null,
          ...this.scope.jobViewScope(),
        },
      },
    };

    const { data, total } = await this.repo.findMany({
      skip,
      take: perPage,
      where,
      orderBy: { createdAt: 'desc' },
    });

    const items = data.map((e) => toEndorsementResponse(e));
    return { items, total, page, perPage };
  }

  async getEndorsementsByPolicy(policyId: string): Promise<EndorsementResponse[]> {
    await this.assertPolicyAccess(policyId);
    const list = await this.repo.findByPolicy(policyId);
    return list.map((e) => toEndorsementResponse(e));
  }

  async getEndorsementById(id: string): Promise<EndorsementResponse> {
    const endorsement = await this.repo.findById(id);
    if (!endorsement) {
      throw new BusinessException('ENDORSEMENT_NOT_FOUND', 'Endorsement not found', 404);
    }
    await this.assertPolicyAccess(endorsement.policyId);
    return toEndorsementResponse(endorsement);
  }

  @Transactional()
  async submitEndorsement(id: string): Promise<EndorsementResponse> {
    const userId = this.cls.get('userId')!;
    const endorsement = await this.repo.findById(id);
    if (!endorsement) throw new BusinessException('ENDORSEMENT_NOT_FOUND', 'Endorsement not found', 404);
    await this.assertPolicyAccess(endorsement.policyId);

    if (endorsement.status !== EndorsementStatus.DRAFT) {
      throw new BusinessException('ENDORSEMENT_INVALID_STATUS', `Cannot submit endorsement in status ${endorsement.status}`, 409);
    }

    // Evaluate Approval Rules for ENDORSEMENT (Day 32 / OQ-9)
    const activeRules = await this.txHost.tx.approvalRule.findMany({
      where: { active: true, entityType: 'ENDORSEMENT' },
    });

    const netAdjustmentAbs = new Decimal(endorsement.netAdjustment.toString()).abs().toFixed(2);
    const requiredRole = evaluateApprovalRules({
      netPremium: netAdjustmentAbs,
      discountPercent: '0',
      entityType: 'ENDORSEMENT',
    }, activeRules);

    // If no rule matches, auto-approve immediately
    const nextStatus = requiredRole ? EndorsementStatus.REQUESTED : EndorsementStatus.APPROVED;

    const updated = await this.repo.update(id, {
      status: nextStatus,
      requiredApproverRole: requiredRole ?? null,
      requestedBy: userId ? { connect: { id: userId } } : undefined,
      requestedAt: new Date(),
      approvedBy: !requiredRole && userId ? { connect: { id: userId } } : undefined,
      approvedAt: !requiredRole ? new Date() : undefined,
    });

    await this.audit.log({
      action: !requiredRole ? 'AUTO_APPROVE_ENDORSEMENT' : 'SUBMIT_ENDORSEMENT',
      entityType: 'ENDORSEMENT',
      entityId: id,
      after: updated,
    });

    return toEndorsementResponse(updated);
  }

  /**
   * D-16: an endorsement that matched an approval rule is decided by someone at least as senior as the rule's role
   * (SUPERVISOR < MANAGER < ADMIN), and never by the person who requested it (maker-checker, same as job approvals).
   */
  private assertMayDecide(endorsement: { requestedById: string | null; requiredApproverRole: string | null }): void {
    const viewer: ApprovalViewer = {
      userId: this.cls.get('userId'),
      permissions: this.cls.get('permissions') ?? [],
      roles: this.cls.get('roles') ?? [],
    };
    if (isSelfDecisionBlocked(endorsement.requestedById, viewer)) {
      throw new BusinessException('ENDORSEMENT_SELF_APPROVE', 'Cannot decide an endorsement you requested yourself', 422);
    }
    if (!canApproveType(endorsement.requiredApproverRole, viewer.roles ?? [])) {
      throw new BusinessException('FORBIDDEN', `Insufficient role level — this endorsement needs ${endorsement.requiredApproverRole}`, 403);
    }
  }

  @Transactional()
  async approveEndorsement(id: string): Promise<EndorsementResponse> {
    const userId = this.cls.get('userId')!;
    const endorsement = await this.repo.findById(id);
    if (!endorsement) throw new BusinessException('ENDORSEMENT_NOT_FOUND', 'Endorsement not found', 404);
    await this.assertPolicyAccess(endorsement.policyId);

    if (endorsement.status !== EndorsementStatus.REQUESTED && endorsement.status !== EndorsementStatus.REVIEWING) {
      throw new BusinessException('ENDORSEMENT_INVALID_STATUS', `Cannot approve endorsement in status ${endorsement.status}`, 409);
    }
    this.assertMayDecide(endorsement);

    const updated = await this.repo.update(id, {
      status: EndorsementStatus.APPROVED,
      approvedBy: userId ? { connect: { id: userId } } : undefined,
      approvedAt: new Date(),
    });

    await this.audit.log({
      action: 'APPROVE_ENDORSEMENT',
      entityType: 'ENDORSEMENT',
      entityId: id,
      after: updated,
    });

    return toEndorsementResponse(updated);
  }

  @Transactional()
  async rejectEndorsement(id: string, reason?: string): Promise<EndorsementResponse> {
    const endorsement = await this.repo.findById(id);
    if (!endorsement) throw new BusinessException('ENDORSEMENT_NOT_FOUND', 'Endorsement not found', 404);
    await this.assertPolicyAccess(endorsement.policyId);

    if (endorsement.status !== EndorsementStatus.REQUESTED && endorsement.status !== EndorsementStatus.REVIEWING) {
      throw new BusinessException('ENDORSEMENT_INVALID_STATUS', `Cannot reject endorsement in status ${endorsement.status}`, 409);
    }
    this.assertMayDecide(endorsement);

    const updated = await this.repo.update(id, {
      status: EndorsementStatus.REJECTED,
      rejectionReason: reason,
    });

    await this.audit.log({
      action: 'REJECT_ENDORSEMENT',
      entityType: 'ENDORSEMENT',
      entityId: id,
      after: updated,
      remark: reason,
    });

    return toEndorsementResponse(updated);
  }

  @Transactional()
  async issueEndorsement(id: string): Promise<EndorsementResponse> {
    const userId = this.cls.get('userId')!;
    const endorsement = await this.repo.findById(id);
    if (!endorsement) throw new BusinessException('ENDORSEMENT_NOT_FOUND', 'Endorsement not found', 404);
    const policy = await this.assertPolicyAccess(endorsement.policyId);

    if (endorsement.status !== EndorsementStatus.APPROVED) {
      throw new BusinessException('ENDORSEMENT_NOT_APPROVED', `Cannot issue endorsement in status ${endorsement.status}`, 409);
    }

    // 1. Snapshot current Policy into PolicyVersion
    const currentCoverages = await this.txHost.tx.policyCoverage.findMany({
      where: { policyId: policy.id },
    });
    const snapshotData = {
      policy: {
        sumInsured: policy.sumInsured?.toString(),
        grossPremium: policy.grossPremium.toString(),
        netPremium: policy.netPremium.toString(),
        tax: policy.tax.toString(),
        stampDuty: policy.stampDuty.toString(),
        totalPremium: policy.totalPremium.toString(),
        effectiveDate: policy.effectiveDate,
        expiryDate: policy.expiryDate,
        version: policy.version,
      },
      coverages: currentCoverages.map((c) => ({
        coverageName: c.coverageName,
        sumInsured: c.sumInsured.toString(),
        premium: c.premium.toString(),
      })),
    };

    await this.txHost.tx.policyVersion.create({
      data: {
        policyId: policy.id,
        version: policy.version,
        snapshot: snapshotData,
        reason: `Snapshot before endorsement ${endorsement.endorsementNo}`,
        endorsementId: endorsement.id,
        createdById: userId,
      },
    });

    // 2. Apply modifications to Policy
    const changes = endorsement.changes as { after?: Record<string, unknown> };
    const after = changes?.after ?? {};
    const policyUpdateData: Record<string, unknown> = {
      version: policy.version + 1,
      updatedById: userId,
    };

    if (after.sumInsured !== undefined) {
      policyUpdateData.sumInsured = new Decimal(String(after.sumInsured));
    }
    if (after.effectiveDate) {
      policyUpdateData.effectiveDate = new Date(String(after.effectiveDate));
    }
    if (after.expiryDate) {
      policyUpdateData.expiryDate = new Date(String(after.expiryDate));
    }

    // If net adjustment exists, update policy premiums
    const netAdj = new Decimal(endorsement.netAdjustment.toString());
    const stampAdj = new Decimal(endorsement.stampDuty.toString());
    const vatAdj = new Decimal(endorsement.vat.toString());
    const totalAdj = new Decimal(endorsement.totalAdjustment.toString());

    if (endorsement.premiumAdjustmentType === PremiumAdjustmentType.ADDITIONAL_PREMIUM) {
      policyUpdateData.netPremium = policy.netPremium.plus(netAdj);
      policyUpdateData.stampDuty = policy.stampDuty.plus(stampAdj);
      policyUpdateData.tax = policy.tax.plus(vatAdj);
      policyUpdateData.totalPremium = policy.totalPremium.plus(totalAdj);
      policyUpdateData.grossPremium = policy.grossPremium.plus(netAdj);
    } else if (endorsement.premiumAdjustmentType === PremiumAdjustmentType.REFUND_PREMIUM) {
      policyUpdateData.netPremium = Decimal.max(0, policy.netPremium.minus(netAdj));
      policyUpdateData.stampDuty = Decimal.max(0, policy.stampDuty.minus(stampAdj));
      policyUpdateData.tax = Decimal.max(0, policy.tax.minus(vatAdj));
      policyUpdateData.totalPremium = Decimal.max(0, policy.totalPremium.minus(totalAdj));
      policyUpdateData.grossPremium = Decimal.max(0, policy.grossPremium.minus(netAdj));
    }

    await this.txHost.tx.policy.update({
      where: { id: policy.id },
      data: policyUpdateData,
    });

    // 3. Financial side effects
    // If ADDITIONAL_PREMIUM -> generate DEBIT_NOTE (invoice)
    let generatedInvoiceNo: string | undefined;
    if (endorsement.premiumAdjustmentType === PremiumAdjustmentType.ADDITIONAL_PREMIUM && totalAdj.gt(0)) {
      const invNo = await this.sequence.next('INVOICE');
      generatedInvoiceNo = invNo;
      const job = await this.txHost.tx.job.findUnique({ where: { id: policy.jobId } });
      await this.txHost.tx.invoice.create({
        data: {
          invoiceNo: invNo,
          policyId: policy.id,
          customerId: job!.customerId,
          type: InvoiceType.DEBIT_NOTE,
          amount: totalAdj,
          netAmount: netAdj,
          stampDuty: stampAdj,
          vat: vatAdj,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days due
          status: InvoiceStatus.PENDING,
          createdById: userId,
        },
      });
    }

    // If REFUND_PREMIUM -> generate CREDIT_NOTE (invoice) + Refund record in REQUESTED status
    if (endorsement.premiumAdjustmentType === PremiumAdjustmentType.REFUND_PREMIUM && totalAdj.gt(0)) {
      const invNo = await this.sequence.next('INVOICE');
      generatedInvoiceNo = invNo;
      const job = await this.txHost.tx.job.findUnique({ where: { id: policy.jobId } });
      const creditNote = await this.txHost.tx.invoice.create({
        data: {
          invoiceNo: invNo,
          policyId: policy.id,
          customerId: job!.customerId,
          type: InvoiceType.CREDIT_NOTE,
          amount: totalAdj,
          netAmount: netAdj,
          stampDuty: stampAdj,
          vat: vatAdj,
          dueDate: new Date(),
          status: InvoiceStatus.PENDING,
          createdById: userId,
        },
      });

      const refundNo = await this.sequence.next('REFUND');
      await this.txHost.tx.refund.create({
        data: {
          refundNo,
          creditNoteId: creditNote.id,
          amount: totalAdj,
          status: RefundStatus.REQUESTED,
          reason: `Refund from endorsement ${endorsement.endorsementNo}`,
          requestedById: userId,
        },
      });
    }

    // 4. Commission adjustment (D-14 / D-17)
    if (netAdj.gt(0)) {
      const originalCommission = await this.txHost.tx.commission.findFirst({
        where: { policyId: policy.id, agentId: { not: null } },
      });
      if (originalCommission && originalCommission.agentId) {
        // Compute adjustment using commission rate & wht
        const sign = endorsement.premiumAdjustmentType === PremiumAdjustmentType.REFUND_PREMIUM ? '-' : '';
        const adjAmount = `${sign}${netAdj.mul(originalCommission.commissionRate).div(100).toFixed(2)}`;
        const whtRate = await this.getWhtRate();
        const adjAmounts = computeAdjustment(adjAmount, whtRate);

        await this.txHost.tx.commissionAdjustment.create({
          data: {
            commissionId: originalCommission.id,
            policyId: policy.id,
            agentId: originalCommission.agentId,
            amount: new Decimal(adjAmounts.amount),
            whtRate: new Decimal(whtRate),
            whtAmount: new Decimal(adjAmounts.whtAmount),
            netAmount: new Decimal(adjAmounts.netAmount),
            reason: `Endorsement ${endorsement.endorsementNo} (${endorsement.type})`,
            refType: 'ENDORSEMENT',
            refId: endorsement.id,
            createdById: userId,
          },
        });
      }
    }

    // 5. Update Endorsement to ISSUED
    const updated = await this.repo.update(id, {
      status: EndorsementStatus.ISSUED,
      issuedBy: userId ? { connect: { id: userId } } : undefined,
      issuedAt: new Date(),
    });

    await this.audit.log({
      action: 'ISSUE_ENDORSEMENT',
      entityType: 'ENDORSEMENT',
      entityId: id,
      after: updated,
      description: generatedInvoiceNo ? `Generated invoice ${generatedInvoiceNo}` : undefined,
    });

    return toEndorsementResponse(updated);
  }

  private async getWhtRate(): Promise<string> {
    const setting = await this.txHost.tx.systemSetting.findUnique({
      where: { key: 'commission.wht_rate' },
    });
    return setting?.value ?? '3';
  }

  @Transactional()
  async startReview(id: string): Promise<EndorsementResponse> {
    const userId = this.cls.get('userId')!;
    const endorsement = await this.repo.findById(id);
    if (!endorsement) throw new BusinessException('ENDORSEMENT_NOT_FOUND', 'Endorsement not found', 404);
    await this.assertPolicyAccess(endorsement.policyId);

    if (endorsement.status !== EndorsementStatus.REQUESTED) {
      throw new BusinessException('ENDORSEMENT_INVALID_STATUS', `Cannot review endorsement in status ${endorsement.status}`, 409);
    }

    const updated = await this.repo.update(id, {
      status: EndorsementStatus.REVIEWING,
      reviewedBy: userId ? { connect: { id: userId } } : undefined,
      reviewedAt: new Date(),
    });

    await this.audit.log({
      action: 'REVIEW_ENDORSEMENT',
      entityType: 'ENDORSEMENT',
      entityId: id,
      after: updated,
    });

    return toEndorsementResponse(updated);
  }

  @Transactional()
  async cancelEndorsement(id: string, reason?: string): Promise<EndorsementResponse> {
    const endorsement = await this.repo.findById(id);
    if (!endorsement) throw new BusinessException('ENDORSEMENT_NOT_FOUND', 'Endorsement not found', 404);
    await this.assertPolicyAccess(endorsement.policyId);

    if (endorsement.status === EndorsementStatus.ISSUED || endorsement.status === EndorsementStatus.CANCELLED) {
      throw new BusinessException('ENDORSEMENT_INVALID_STATUS', `Cannot cancel endorsement in status ${endorsement.status}`, 409);
    }

    const updated = await this.repo.update(id, {
      status: EndorsementStatus.CANCELLED,
      rejectionReason: reason,
    });

    await this.audit.log({
      action: 'CANCEL_ENDORSEMENT',
      entityType: 'ENDORSEMENT',
      entityId: id,
      after: updated,
      remark: reason,
    });

    return toEndorsementResponse(updated);
  }
}
