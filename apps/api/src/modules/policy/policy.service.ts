import { Injectable, Optional } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { PolicyRepository } from './policy.repository.js';
import type { BindDto } from './dto/bind.dto.js';
import { ConfirmBindingDto } from './dto/confirm-binding.dto.js';
import { RejectBindingDto } from './dto/reject-binding.dto.js';
import { isComplete } from '../document/domain/document-checklist.js';
import type { CreatePolicyDto } from './dto/create-policy.dto.js';
import type { UpdatePolicyDto } from './dto/update-policy.dto.js';
import type { ListPolicyDto } from './dto/list-policy.dto.js';
import {
  toBindingResponse, toPolicyResponse,
  type BindingResponse, type PolicyResponse, type PreconditionCheck,
} from './dto/policy.response.js';

import { DataScopeService } from '../../common/access/data-scope.service.js';
import { JobWorkflowService } from '../job/job-workflow.service.js';
import { todayInBangkok } from '../../common/utils/bangkok-date.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { NotificationService } from '../notification/notification.service.js';
import { NotificationType, PolicyStatus, InvoiceStatus } from '../../generated/prisma/enums.js';
import {
  evaluateInitialPolicyStatus,
  evaluatePolicyDailyStatus,
} from './domain/policy-status.js';
import { calculateInstallments } from '../invoice/domain/installments.js';
import { CommissionService } from '../commission/commission.service.js';
import {
  calculateCancellationRefund,
  type CancellationCalcResult,
} from './domain/cancellation-calc.js';
import type {
  CalculateCancellationRefundDto,
  RequestCancellationDto,
  ApproveCancellationDto,
  RejectCancellationDto,
} from './dto/cancel-policy.dto.js';
import { Decimal } from 'decimal.js';
import { InvoiceType, RefundStatus } from '../../generated/prisma/enums.js';
import { computeAdjustment } from '../commission/domain/adjustment.js';

@Injectable()
export class PolicyService {
  constructor(
    private readonly repo: PolicyRepository,
    private readonly sequence: SequenceService,
    private readonly audit: AuditService,
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly cls: ClsService<AppClsStore>,
    private readonly scope: DataScopeService,
    private readonly workflow: JobWorkflowService,
    @Optional() private readonly notifications?: NotificationService,
    @Optional() private readonly commissions?: CommissionService,
  ) {}

  // ─── Preconditions ──────────────────────────────────────────────────────────

  async getPreconditions(jobId: string): Promise<PreconditionCheck[]> {
    const job = await this.txHost.tx.job.findFirst({
      where: { id: jobId, deletedAt: null },
      include: {
        product: true,
        proposals: { where: { status: 'ACCEPTED' } },
        approvals: true,
        documents: { where: { deletedAt: null, status: { notIn: ['REJECTED', 'EXPIRED'] } } },
      },
    });
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);

    await this.assertJobAccess(jobId);

    const checks: PreconditionCheck[] = [];

    // BR-007: customer accepted proposal
    const hasAcceptedProposal = job.proposals.length > 0;
    checks.push({
      code: 'CUSTOMER_ACCEPTED_PROPOSAL',
      label: 'ลูกค้า Accept ใบเสนอราคาแล้ว',
      met: hasAcceptedProposal,
    });

    // BR-009: no pending approvals (if any exist)
    const pendingApprovals = job.approvals.filter((a) => a.status === 'PENDING');
    const hasApprovals = job.approvals.length > 0;
    const approvalMet = !hasApprovals || (pendingApprovals.length === 0 && job.approvals.some((a) => a.status === 'APPROVED'));
    checks.push({
      code: 'APPROVAL_CLEARED',
      label: 'ผ่านการอนุมัติแล้ว (ถ้าจำเป็น)',
      met: approvalMet,
      details: pendingApprovals.length > 0 ? `มี ${pendingApprovals.length} รายการรออนุมัติ` : undefined,
    });

    // BR-008 & D-22: required documents must be VERIFIED (only if product.requireDocsOnBind)
    if (job.product?.requireDocsOnBind) {
      const checklist = await this.txHost.tx.documentChecklist.findMany({
        where: { productId: job.productId, isRequired: true, active: true },
      });
      const docs = await this.txHost.tx.document.findMany({
        where: { jobId, deletedAt: null },
      });
      const checkResult = isComplete(checklist, docs, 'VERIFIED');
      checks.push({
        code: 'DOCUMENTS_COMPLETE',
        label: 'เอกสารครบตามที่กำหนด (VERIFIED)',
        met: checkResult.isComplete,
        details: checkResult.missing.length > 0 ? `ขาดเอกสาร (หรือยังไม่ VERIFIED): ${checkResult.missing.join(', ')}` : undefined,
      });
    }

    return checks;
  }

  async getBindingByJobId(jobId: string): Promise<BindingResponse | null> {
    await this.assertJobAccess(jobId);
    const binding = await this.repo.findBindingByJobId(jobId);
    return binding ? toBindingResponse(binding) : null;
  }

  // ─── Bind ────────────────────────────────────────────────────────────────────

  @Transactional()
  async bind(jobId: string, dto: BindDto, idempotencyKey?: string): Promise<BindingResponse> {
    const userId = this.cls.get('userId')!;

    // Idempotency check
    if (idempotencyKey) {
      const existing = await this.repo.findBindingByIdempotencyKey(idempotencyKey);
      if (existing) return toBindingResponse(existing);
    }

    const job = await this.getJobOrThrow(jobId);
    await this.assertJobAccess(jobId);
    await this.assertJobDocument(jobId, dto.binderDocumentId);

    if (job.status !== 'CUSTOMER_ACCEPTED' && job.status !== 'APPROVED') {
      throw new BusinessException('JOB_INVALID_STATUS', `Cannot bind job in status ${job.status}`, 409);
    }

    // BR-006: must have selected quotation
    if (!job.selectedQuotationId) {
      throw new BusinessException('BINDING_NO_SELECTED_QUOTATION', 'Job does not have a selected quotation', 422);
    }

    // BR-007: must have accepted proposal
    const acceptedProposal = await this.txHost.tx.proposal.findFirst({
      where: { jobId, status: 'ACCEPTED' },
    });
    if (!acceptedProposal) {
      throw new BusinessException('BINDING_NO_ACCEPTED_PROPOSAL', 'Customer has not accepted any proposal', 422);
    }

    // BR-009: no pending approvals
    const pendingApproval = await this.txHost.tx.approval.findFirst({
      where: { jobId, status: 'PENDING' },
    });
    if (pendingApproval) {
      throw new BusinessException('BINDING_PENDING_APPROVAL', 'There is a pending approval for this job', 422);
    }

    // BR-008 & D-22: required documents must be VERIFIED
    const product = await this.txHost.tx.insuranceProduct.findFirst({ where: { id: job.productId } });
    if (product?.requireDocsOnBind) {
      const checklist = await this.txHost.tx.documentChecklist.findMany({
        where: { productId: job.productId, isRequired: true, active: true },
      });
      if (checklist.length > 0) {
        const docs = await this.txHost.tx.document.findMany({
          where: { jobId, deletedAt: null },
        });
        const checkResult = isComplete(checklist, docs, 'VERIFIED');
        if (!checkResult.isComplete) {
          throw new BusinessException(
            'BINDING_DOCUMENTS_NOT_VERIFIED',
            `Required documents not verified: ${checkResult.missing.join(', ')}`,
            422,
            Object.fromEntries(checkResult.missing.map((m) => [m, ['Document must be VERIFIED']])),
          );
        }
      }
    }

    // Resolve quotation for default insurerId / premium if not provided
    const selectedQuotation = await this.txHost.tx.quotation.findFirst({
      where: { id: job.selectedQuotationId },
    });

    const today = todayInBangkok();

    // Check if there's an existing binding for this job (e.g. from previous rejected bind)
    let binding = await this.repo.findBindingByJobId(jobId);
    if (binding) {
      // Re-use or update existing binding to SUBMITTED
      binding = await this.repo.updateBinding(binding.id, {
        status: 'SUBMITTED',
        quotation: { connect: { id: job.selectedQuotationId } },
        bindingDate: new Date(dto.bindingDate ?? today),
        effectiveDate: new Date((job.effectiveDate as Date | null)?.toISOString().slice(0, 10) ?? today),
        expiryDate: dto.expiryDate
          ? new Date(dto.expiryDate)
          : job.expiryDate
            ? new Date(job.expiryDate)
            : null,
        binderNumber: dto.binderNumber ?? null,
        binderDate: dto.binderDate ? new Date(dto.binderDate) : null,
        insurer: dto.insurerId
          ? { connect: { id: dto.insurerId } }
          : selectedQuotation?.insuranceCompanyId
            ? { connect: { id: selectedQuotation.insuranceCompanyId } }
            : undefined,
        premium: dto.premium ?? (selectedQuotation?.totalAmount ? selectedQuotation.totalAmount.toString() : null),
        paymentCondition: dto.paymentCondition ?? null,
        underwriter: dto.underwriter ?? null,
        binderDocument: dto.binderDocumentId ? { connect: { id: dto.binderDocumentId } } : undefined,
        rejectionReason: null,
        cancelledAt: null,
        cancelledById: null,
        remark: dto.remark,
      });
    } else {
      binding = await this.repo.createBinding({
        job: { connect: { id: jobId } },
        quotation: { connect: { id: job.selectedQuotationId } },
        status: 'SUBMITTED',
        bindingDate: new Date(dto.bindingDate ?? today),
        effectiveDate: new Date((job.effectiveDate as Date | null)?.toISOString().slice(0, 10) ?? today),
        expiryDate: dto.expiryDate
          ? new Date(dto.expiryDate)
          : job.expiryDate
            ? new Date(job.expiryDate)
            : null,
        binderNumber: dto.binderNumber,
        binderDate: dto.binderDate ? new Date(dto.binderDate) : null,
        insurer: dto.insurerId
          ? { connect: { id: dto.insurerId } }
          : selectedQuotation?.insuranceCompanyId
            ? { connect: { id: selectedQuotation.insuranceCompanyId } }
            : undefined,
        premium: dto.premium ?? (selectedQuotation?.totalAmount ? selectedQuotation.totalAmount.toString() : null),
        paymentCondition: dto.paymentCondition,
        underwriter: dto.underwriter,
        binderDocument: dto.binderDocumentId ? { connect: { id: dto.binderDocumentId } } : undefined,
        confirmedBy: userId ? { connect: { id: userId } } : undefined,
        remark: dto.remark,
        ...(idempotencyKey && { idempotencyKey }),
      });
    }

    if (idempotencyKey) {
      await this.repo.saveIdempotencyKey(idempotencyKey, 'BINDING', binding.id);
    }

    // Day 19: Transition job to BINDING (Job stays at BINDING, does NOT auto-hop to POLICY_PENDING)
    await this.workflow.transitionInTx(job, 'BINDING', userId);

    await this.audit.log({ action: 'BIND', entityType: 'BINDING', entityId: binding.id, jobId });

    return toBindingResponse(binding);
  }

  // ─── Confirm Binding ──────────────────────────────────────────────────────────

  @Transactional()
  async confirmBinding(jobId: string, dto: ConfirmBindingDto): Promise<BindingResponse> {
    const userId = this.cls.get('userId')!;
    const job = await this.getJobOrThrow(jobId);
    await this.assertJobAccess(jobId);
    await this.assertJobDocument(jobId, dto.binderDocumentId);

    if (job.status !== 'BINDING') {
      throw new BusinessException('JOB_INVALID_STATUS', `Cannot confirm binding for job in status ${job.status}`, 409);
    }

    const binding = await this.repo.findBindingByJobId(jobId);
    if (!binding) {
      throw new BusinessException('BINDING_NOT_FOUND', 'No binding record found for this job', 404);
    }

    if (binding.status !== 'SUBMITTED' && binding.status !== 'PENDING') {
      throw new BusinessException('BINDING_INVALID_STATUS', `Cannot confirm binding in status ${binding.status}`, 409);
    }

    const updatedBinding = await this.repo.updateBinding(binding.id, {
      status: 'CONFIRMED',
      binderNumber: dto.binderNumber ?? binding.binderNumber,
      binderDate: dto.binderDate ? new Date(dto.binderDate) : binding.binderDate,
      insurer: dto.insurerId ? { connect: { id: dto.insurerId } } : undefined,
      premium: dto.premium ?? (binding.premium ? binding.premium.toString() : undefined),
      paymentCondition: dto.paymentCondition ?? binding.paymentCondition,
      underwriter: dto.underwriter ?? binding.underwriter,
      binderDocument: dto.binderDocumentId ? { connect: { id: dto.binderDocumentId } } : undefined,
      confirmedBy: userId ? { connect: { id: userId } } : undefined,
      remark: dto.remark ?? binding.remark,
    });

    // Transition job BINDING → POLICY_PENDING
    await this.workflow.transitionInTx(job, 'POLICY_PENDING', userId);

    await this.audit.log({
      action: 'CONFIRM_BINDING',
      entityType: 'BINDING',
      entityId: binding.id,
      jobId,
      after: updatedBinding,
    });

    return toBindingResponse(updatedBinding);
  }

  // ─── Insurer Reject Binding ───────────────────────────────────────────────────

  @Transactional()
  async insurerRejectBinding(jobId: string, dto: RejectBindingDto): Promise<BindingResponse> {
    const userId = this.cls.get('userId')!;
    const job = await this.getJobOrThrow(jobId);
    await this.assertJobAccess(jobId);

    if (job.status !== 'BINDING') {
      throw new BusinessException('JOB_INVALID_STATUS', `Cannot reject binding for job in status ${job.status}`, 409);
    }

    const binding = await this.repo.findBindingByJobId(jobId);
    if (!binding) {
      throw new BusinessException('BINDING_NOT_FOUND', 'No binding record found for this job', 404);
    }

    if (binding.status !== 'SUBMITTED' && binding.status !== 'PENDING') {
      throw new BusinessException('BINDING_INVALID_STATUS', `Cannot reject binding in status ${binding.status}`, 409);
    }

    const updatedBinding = await this.repo.updateBinding(binding.id, {
      status: 'REJECTED',
      rejectionReason: dto.reason,
    });

    // Determine target pre-bind status:
    // If job went through approval and was approved -> APPROVED, else CUSTOMER_ACCEPTED
    const approvedApproval = await this.txHost.tx.approval.findFirst({
      where: { jobId, status: 'APPROVED' },
    });
    const targetStatus = approvedApproval ? 'APPROVED' : 'CUSTOMER_ACCEPTED';

    await this.workflow.transitionInTx(job, targetStatus, userId, { reason: dto.reason });

    await this.audit.log({
      action: 'REJECT_BINDING',
      entityType: 'BINDING',
      entityId: binding.id,
      jobId,
      description: dto.reason,
    });

    return toBindingResponse(updatedBinding);
  }

  // ─── Policy CRUD ─────────────────────────────────────────────────────────────

  async listPolicies(dto: ListPolicyDto): Promise<PolicyResponse[]> {
    if (dto.jobId) {
      await this.assertJobAccess(dto.jobId);
    }
    const where: Prisma.PolicyWhereInput = {
      ...(dto.insuranceCompanyId && { insuranceCompanyId: dto.insuranceCompanyId }),
      ...(dto.status && { status: dto.status as never }),
      ...(dto.jobId && { jobId: dto.jobId }),
      job: { deletedAt: null, ...this.scope.jobViewScope() },
    };
    const items = await this.repo.findPolicies(where, dto.skip, dto.take);
    return items.map(toPolicyResponse);
  }

  async getPolicyById(id: string): Promise<PolicyResponse> {
    const policy = await this.repo.findPolicyById(id);
    if (!policy) throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    try {
      await this.assertJobAccess(policy.jobId);
    } catch {
      throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    }
    return toPolicyResponse(policy);
  }

  async getPolicyVersions(id: string) {
    const policy = await this.repo.findPolicyById(id);
    if (!policy) throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    await this.assertJobAccess(policy.jobId);

    const versions = await this.txHost.tx.policyVersion.findMany({
      where: { policyId: id },
      orderBy: { version: 'desc' },
    });

    return versions;
  }

  @Transactional()
  async createPolicy(jobId: string, dto: CreatePolicyDto): Promise<PolicyResponse> {
    const userId = this.cls.get('userId')!;
    const job = await this.getJobOrThrow(jobId);
    await this.assertJobAccess(jobId);
    await this.assertJobDocument(jobId, dto.policyDocumentId);

    if (job.status !== 'POLICY_PENDING') {
      throw new BusinessException('JOB_INVALID_STATUS', `Cannot issue policy for job in status ${job.status}`, 409);
    }

    // BR-010: must have selected quotation
    if (!job.selectedQuotationId) {
      throw new BusinessException('POLICY_NO_SELECTED_QUOTATION', 'Job does not have a selected quotation', 422);
    }

    const quotation = await this.txHost.tx.quotation.findFirst({
      where: { id: job.selectedQuotationId },
      include: { items: true, insuranceCompany: true },
    });
    if (!quotation) throw new BusinessException('QUOTATION_NOT_FOUND', 'Selected quotation not found', 404);

    const policyNo = await this.sequence.next('POLICY');
    const initialStatus = evaluateInitialPolicyStatus(job.effectiveDate);

    const policy = await this.repo.createPolicy({
      policyNo,
      job: { connect: { id: jobId } },
      quotation: { connect: { id: quotation.id } },
      insuranceCompany: { connect: { id: quotation.insuranceCompanyId } },
      effectiveDate: job.effectiveDate,
      expiryDate: job.expiryDate ?? null,
      sumInsured: dto.sumInsured ?? quotation.items.reduce<Prisma.Decimal | null>((acc, it) => {
        if (!it.sumInsured) return acc;
        return acc ? acc.add(it.sumInsured) : it.sumInsured;
      }, null),
      deductible: dto.deductible,
      policyDocument: dto.policyDocumentId ? { connect: { id: dto.policyDocumentId } } : undefined,
      grossPremium: quotation.grossPremium,
      discount: quotation.discount,
      netPremium: quotation.netPremium,
      tax: quotation.tax,
      stampDuty: quotation.stampDuty,
      totalPremium: quotation.totalAmount,
      status: initialStatus,
      issuedAt: new Date(),
      paymentDueDate: dto.paymentDueDate ? new Date(dto.paymentDueDate) : null,
      remark: dto.remark,
      createdBy: userId ? { connect: { id: userId } } : undefined,
      coverages: {
        create: quotation.items.map((item) => ({
          coverageId: item.coverageId,
          coverageName: item.coverageName,
          sumInsured: item.sumInsured,
          rate: item.rate,
          deductible: item.deductible,
          premium: item.premium,
        })),
      },
    });

    // Phase 4 Day 23: Generate Invoices in the same transaction
    const acceptedProposal = await this.txHost.tx.proposal.findFirst({
      where: { jobId, status: 'ACCEPTED' },
      include: { paymentTerm: true },
      orderBy: { updatedAt: 'desc' },
    });

    const paymentTerm = acceptedProposal?.paymentTerm ?? {
      installments: 1,
      intervalMonths: 0,
      firstDueDays: 30,
    };

    const installmentSchedules = calculateInstallments(
      policy.totalPremium,
      policy.netPremium,
      policy.stampDuty,
      policy.tax,
      paymentTerm,
      new Date(),
    );

    for (const schedule of installmentSchedules) {
      const invoiceNo = await this.sequence.next('INVOICE');
      await this.txHost.tx.invoice.create({
        data: {
          invoiceNo,
          policyId: policy.id,
          customerId: job.customerId,
          installmentNo: installmentSchedules.length > 1 ? schedule.installmentNo : null,
          amount: schedule.amount,
          netAmount: schedule.netAmount,
          stampDuty: schedule.stampDuty,
          vat: schedule.vat,
          dueDate: schedule.dueDate,
          status: InvoiceStatus.PENDING,
          createdById: userId,
        },
      });
    }

    // D26: commission is calculated by the system at issue time (same transaction). It never blocks
    // issuing: with no rate on file it records an audit entry and FINANCE can recalculate later.
    await this.commissions?.calculateForPolicy(policy.id, 'ISSUE');

    // D-10: In same transaction, transition job: POLICY_PENDING → POLICY_ISSUED → CLOSED
    await this.workflow.transitionInTx(job, 'POLICY_ISSUED', userId);
    const refreshedJob = await this.txHost.tx.job.findFirst({ where: { id: jobId } });
    if (refreshedJob) {
      await this.workflow.transitionInTx(refreshedJob, 'CLOSED', userId, {
        reason: 'Auto-closed upon policy issuance',
      });
    }

    await this.audit.log({
      action: 'ISSUE_POLICY',
      entityType: 'POLICY',
      entityId: policy.id,
      jobId,
      after: policy,
      remark: dto.remark,
    });

    if (this.notifications) {
      const recipientIds = [job.agentId, job.brokerStaffId].filter((id): id is string => Boolean(id));
      if (recipientIds.length > 0) {
        await this.notifications.emit(
          NotificationType.POLICY_ISSUED,
          recipientIds,
          {
            title: `กรมธรรม์ออกแล้ว (${policy.policyNo})`,
            message: `กรมธรรม์เลขที่ ${policy.policyNo} สำหรับงาน ${job.jobNo} ออกเรียบร้อยแล้ว`,
            entityType: 'POLICY',
            entityId: policy.id,
            jobId,
          },
        );
      }
    }

    return toPolicyResponse(policy);
  }

  @Transactional()
  async updatePolicy(id: string, dto: UpdatePolicyDto): Promise<PolicyResponse> {
    const userId = this.cls.get('userId')!;
    const policy = await this.repo.findPolicyById(id);
    if (!policy) throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    await this.assertJobAccess(policy.jobId);
    if (dto.policyDocumentId) await this.assertJobDocument(policy.jobId, dto.policyDocumentId);

    const updated = await this.repo.updatePolicy(id, {
      ...(dto.paymentDueDate !== undefined && {
        paymentDueDate: dto.paymentDueDate ? new Date(dto.paymentDueDate) : null,
      }),
      ...(dto.sumInsured !== undefined && {
        sumInsured: dto.sumInsured ? dto.sumInsured : null,
      }),
      ...(dto.deductible !== undefined && {
        deductible: dto.deductible ? dto.deductible : null,
      }),
      ...(dto.policyDocumentId !== undefined && {
        policyDocument: dto.policyDocumentId
          ? { connect: { id: dto.policyDocumentId } }
          : { disconnect: true },
      }),
      ...(dto.remark !== undefined && { remark: dto.remark }),
      updatedById: userId,
      version: { increment: 1 },
    });

    await this.audit.log({
      action: 'UPDATE_POLICY',
      entityType: 'POLICY',
      entityId: id,
      jobId: policy.jobId,
      before: policy,
      after: updated,
      remark: dto.remark,
    });

    return toPolicyResponse(updated);
  }

  @Transactional()
  async maintainPolicyStatuses(now = new Date()): Promise<{
    activatedCount: number;
    expiringCount: number;
    expiredCount: number;
  }> {
    const policies = await this.repo.findPoliciesForDailyStatusCheck();
    let activatedCount = 0;
    let expiringCount = 0;
    let expiredCount = 0;

    for (const p of policies) {
      const nextStatus = evaluatePolicyDailyStatus(
        {
          status: p.status as PolicyStatus,
          effectiveDate: p.effectiveDate,
          expiryDate: p.expiryDate,
        },
        now,
      );

      if (!nextStatus || nextStatus === p.status) continue;

      await this.repo.updatePolicy(p.id, {
        status: nextStatus,
      });

      if (nextStatus === PolicyStatus.ACTIVE) activatedCount++;
      if (nextStatus === PolicyStatus.EXPIRING) expiringCount++;
      if (nextStatus === PolicyStatus.EXPIRED) expiredCount++;

      await this.audit.log({
        action: 'POLICY_STATUS_CHANGED',
        entityType: 'POLICY',
        entityId: p.id,
        jobId: p.jobId,
        before: { status: p.status },
        after: { status: nextStatus },
        remark: `Daily status transition to ${nextStatus}`,
      });

      // Notification
      if (this.notifications && nextStatus === PolicyStatus.EXPIRING) {
        const recipientIds = [p.job?.agentId, p.job?.brokerStaffId].filter(
          (id): id is string => Boolean(id),
        );
        if (recipientIds.length > 0) {
          await this.notifications.emit(
            NotificationType.POLICY_EXPIRING,
            recipientIds,
            {
              title: `กรมธรรม์ใกล้หมดอายุ (${p.policyNo})`,
              message: `กรมธรรม์เลขที่ ${p.policyNo} กำลังจะหมดอายุในอีกไม่เกิน 90 วัน`,
              entityType: 'POLICY',
              entityId: p.id,
              jobId: p.jobId,
            },
          );
        }
      }
    }

    return { activatedCount, expiringCount, expiredCount };
  }

  // ─── Policy Cancellation (Day 33) ──────────────────────────────────────────

  async calculateCancellation(id: string, dto: CalculateCancellationRefundDto): Promise<CancellationCalcResult> {
    const policy = await this.repo.findPolicyById(id);
    if (!policy) throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    await this.assertJobAccess(policy.jobId);

    const shortRateEntries = await this.txHost.tx.shortRateTable.findMany({
      orderBy: { daysFrom: 'asc' },
    });

    return calculateCancellationRefund({
      effectiveDate: policy.effectiveDate,
      expiryDate: policy.expiryDate ?? new Date(policy.effectiveDate.getTime() + 365 * 24 * 60 * 60 * 1000),
      cancelEffectiveDate: dto.cancelEffectiveDate,
      annualNetPremium: policy.netPremium.toString(),
      shortRateTable: shortRateEntries,
      method: dto.method ?? 'SHORT_RATE',
    });
  }

  /** Most the customer could be refunded for cancelling on `cancelEffectiveDate` (pro-rata of the net premium + duty + VAT). */
  private async assertRefundWithinCeiling(
    policy: { effectiveDate: Date; expiryDate: Date | null; netPremium: { toString(): string } },
    cancelEffectiveDate: Date | string,
    refund: Decimal,
  ): Promise<void> {
    if (refund.isZero()) return;
    const ceiling = calculateCancellationRefund({
      effectiveDate: policy.effectiveDate,
      expiryDate: policy.expiryDate ?? new Date(policy.effectiveDate.getTime() + 365 * 24 * 60 * 60 * 1000),
      cancelEffectiveDate,
      annualNetPremium: policy.netPremium.toString(),
      method: 'PRO_RATA',
    }).totalRefund;
    if (refund.gt(ceiling)) {
      throw new BusinessException(
        'CANCEL_REFUND_EXCEEDS_LIMIT',
        `Refund ${refund.toFixed(2)} exceeds the most that can be refunded for this cancellation date (${ceiling.toFixed(2)})`,
        422,
      );
    }
  }

  @Transactional()
  async requestCancellation(id: string, dto: RequestCancellationDto): Promise<PolicyResponse> {
    const userId = this.cls.get('userId')!;
    const policy = await this.repo.findPolicyById(id);
    if (!policy) throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    await this.assertJobAccess(policy.jobId);

    if (policy.status !== PolicyStatus.ACTIVE && policy.status !== PolicyStatus.EXPIRING) {
      throw new BusinessException(
        'POLICY_INVALID_STATUS',
        `Cannot request cancellation for policy in status ${policy.status}. Must be ACTIVE or EXPIRING.`,
        409,
      );
    }

    // The refund is money leaving the company — never trust the amount the client typed. It may be lower than the
    // pro-rata ceiling (negotiated / short-rate) but never higher.
    const requestedRefund = dto.cancelRefundAmount ? new Decimal(dto.cancelRefundAmount) : new Decimal(0);
    if (requestedRefund.lt(0)) {
      throw new BusinessException('CANCEL_REFUND_INVALID', 'Refund amount cannot be negative', 422);
    }
    await this.assertRefundWithinCeiling(policy, dto.cancelEffectiveDate, requestedRefund);

    const updated = await this.repo.updatePolicy(id, {
      status: PolicyStatus.CANCEL_REQUESTED,
      cancelRequestedById: userId,
      cancelReason: dto.cancelReason,
      cancelRequestDate: new Date(dto.cancelRequestDate),
      cancelEffectiveDate: new Date(dto.cancelEffectiveDate),
      cancelRefundAmount: dto.cancelRefundAmount ? new Decimal(dto.cancelRefundAmount) : null,
      cancelOutstandingAmount: dto.cancelOutstandingAmount ? new Decimal(dto.cancelOutstandingAmount) : null,
      updatedById: userId,
    });

    await this.audit.log({
      action: 'REQUEST_POLICY_CANCELLATION',
      entityType: 'POLICY',
      entityId: id,
      jobId: policy.jobId,
      before: { status: policy.status },
      after: {
        status: updated.status,
        cancelReason: dto.cancelReason,
        cancelEffectiveDate: dto.cancelEffectiveDate,
        cancelRefundAmount: dto.cancelRefundAmount,
      },
    });

    return toPolicyResponse(updated);
  }

  @Transactional()
  async approveCancellation(id: string, dto: ApproveCancellationDto): Promise<PolicyResponse> {
    const userId = this.cls.get('userId')!;
    const roles = (this.cls.get('roles') as string[]) ?? [];
    const isManagerOrAdmin = roles.includes('MANAGER') || roles.includes('ADMIN');

    if (!isManagerOrAdmin) {
      throw new BusinessException(
        'FORBIDDEN',
        'Only MANAGER or ADMIN can approve policy cancellation',
        403,
      );
    }

    const policy = await this.repo.findPolicyById(id);
    if (!policy) throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    await this.assertJobAccess(policy.jobId);

    if (policy.status !== PolicyStatus.CANCEL_REQUESTED) {
      throw new BusinessException(
        'POLICY_INVALID_STATUS',
        `Cannot approve cancellation for policy in status ${policy.status}. Must be CANCEL_REQUESTED.`,
        409,
      );
    }

    // Maker-checker: whoever asked for the cancellation cannot approve it (unless explicitly allowed, e.g. ADMIN)
    const permissions = (this.cls.get('permissions') as string[] | undefined) ?? [];
    if (policy.cancelRequestedById && policy.cancelRequestedById === userId && !permissions.includes('approval.approve_own')) {
      throw new BusinessException('CANCEL_SELF_APPROVE', 'Cannot approve a cancellation you requested yourself', 422);
    }
    // The ceiling is checked again at approval time, in case the stored amount was changed in between
    await this.assertRefundWithinCeiling(
      policy,
      policy.cancelEffectiveDate ?? new Date(),
      policy.cancelRefundAmount ? new Decimal(policy.cancelRefundAmount.toString()) : new Decimal(0),
    );

    // Verify insurer document exists
    await this.assertJobDocument(policy.jobId, dto.cancelInsurerDocumentId);

    // 1. Update Policy status to CANCELLED
    const cancelEffDate = policy.cancelEffectiveDate ?? new Date();
    const updated = await this.repo.updatePolicy(id, {
      status: PolicyStatus.CANCELLED,
      cancelInsurerDocument: { connect: { id: dto.cancelInsurerDocumentId } },
      cancelledAt: new Date(),
      cancelledBy: { connect: { id: userId } },
      updatedById: userId,
    });

    // 2. Side effect D-17: Void/Cancel unpaid invoices due after cancel effective date
    const unpaidInvoices = await this.txHost.tx.invoice.findMany({
      where: {
        policyId: policy.id,
        status: { in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
        dueDate: { gt: cancelEffDate },
      },
    });

    for (const inv of unpaidInvoices) {
      await this.txHost.tx.invoice.update({
        where: { id: inv.id },
        data: {
          status: InvoiceStatus.CANCELLED,
          updatedById: userId,
        },
      });

      await this.audit.log({
        action: 'CANCEL_INVOICE',
        entityType: 'INVOICE',
        entityId: inv.id,
        jobId: policy.jobId,
        remark: `Cancelled due to policy cancellation (${policy.policyNo})`,
      });
    }

    // 3. Side effect D-17: If refund due (cancelRefundAmount > 0), create Credit Note + Refund
    const refundAmount = policy.cancelRefundAmount ? new Decimal(policy.cancelRefundAmount.toString()) : new Decimal(0);
    if (refundAmount.gt(0)) {
      const invNo = await this.sequence.next('INVOICE');
      const job = await this.txHost.tx.job.findUnique({ where: { id: policy.jobId } });

      // Approximate net/vat/stamp breakdown for Credit Note
      const netAmount = refundAmount.div('1.074').toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const stampDuty = netAmount.times('0.004').ceil();
      const vat = refundAmount.minus(netAmount).minus(stampDuty);

      const creditNote = await this.txHost.tx.invoice.create({
        data: {
          invoiceNo: invNo,
          policyId: policy.id,
          customerId: job!.customerId,
          type: InvoiceType.CREDIT_NOTE,
          amount: refundAmount,
          netAmount,
          stampDuty,
          vat,
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
          amount: refundAmount,
          status: RefundStatus.REQUESTED,
          reason: `Policy cancellation refund (${policy.policyNo}): ${policy.cancelReason ?? ''}`,
          requestedById: userId,
        },
      });

      await this.audit.log({
        action: 'CREATE_REFUND_REQUEST',
        entityType: 'REFUND',
        entityId: refundNo,
        jobId: policy.jobId,
        description: `Created Credit Note ${invNo} and Refund ${refundNo}`,
      });
    }

    // 4. Side effect D-17: Commission clawback adjustment (proportional to refund or net premium reduction)
    if (refundAmount.gt(0)) {
      const originalCommission = await this.txHost.tx.commission.findFirst({
        where: { policyId: policy.id, agentId: { not: null } },
      });
      if (originalCommission && originalCommission.agentId) {
        // Calculate proportional clawback on agent's commission
        // Proportional net refund = refundAmount / 1.074
        const netRefund = refundAmount.div('1.074').toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        const clawbackGross = netRefund.mul(originalCommission.commissionRate).div(100).toFixed(2);
        const whtSetting = await this.txHost.tx.systemSetting.findUnique({ where: { key: 'commission.wht_rate' } });
        const whtRate = whtSetting?.value ?? '3';
        const adjAmounts = computeAdjustment(`-${clawbackGross}`, whtRate);

        await this.txHost.tx.commissionAdjustment.create({
          data: {
            commissionId: originalCommission.id,
            policyId: policy.id,
            agentId: originalCommission.agentId,
            amount: new Decimal(adjAmounts.amount),
            whtRate: new Decimal(whtRate),
            whtAmount: new Decimal(adjAmounts.whtAmount),
            netAmount: new Decimal(adjAmounts.netAmount),
            reason: `Clawback from policy cancellation (${policy.policyNo})`,
            refType: 'POLICY_CANCEL',
            refId: policy.id,
            createdById: userId,
          },
        });
      }
    }

    // 5. Side effect D-17: Cancel any associated Renewal in pipeline
    const pendingRenewals = await this.txHost.tx.renewal.findMany({
      where: {
        previousPolicyId: policy.id,
        status: { notIn: ['RENEWED', 'LOST', 'CANCELLED'] },
      },
    });

    for (const ren of pendingRenewals) {
      await this.txHost.tx.renewal.update({
        where: { id: ren.id },
        data: {
          status: 'CANCELLED',
          remark: 'Original policy cancelled',
        },
      });

      await this.audit.log({
        action: 'CANCEL_RENEWAL',
        entityType: 'RENEWAL',
        entityId: ren.id,
        jobId: policy.jobId,
        remark: `Renewal cancelled due to policy cancellation (${policy.policyNo})`,
      });
    }

    // Sync commission payable status if any invoice changed
    await this.commissions?.syncPayable(policy.id);

    await this.audit.log({
      action: 'APPROVE_POLICY_CANCELLATION',
      entityType: 'POLICY',
      entityId: id,
      jobId: policy.jobId,
      before: { status: policy.status },
      after: { status: updated.status },
      remark: dto.remark,
    });

    return toPolicyResponse(updated);
  }

  @Transactional()
  async rejectCancellation(id: string, dto: RejectCancellationDto): Promise<PolicyResponse> {
    const userId = this.cls.get('userId')!;
    const roles = (this.cls.get('roles') as string[]) ?? [];
    const isManagerOrAdmin = roles.includes('MANAGER') || roles.includes('ADMIN');

    if (!isManagerOrAdmin) {
      throw new BusinessException(
        'FORBIDDEN',
        'Only MANAGER or ADMIN can reject policy cancellation',
        403,
      );
    }

    const policy = await this.repo.findPolicyById(id);
    if (!policy) throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    await this.assertJobAccess(policy.jobId);

    if (policy.status !== PolicyStatus.CANCEL_REQUESTED) {
      throw new BusinessException(
        'POLICY_INVALID_STATUS',
        `Cannot reject cancellation for policy in status ${policy.status}. Must be CANCEL_REQUESTED.`,
        409,
      );
    }

    // Determine reverted status: check whether ACTIVE or EXPIRING
    const dailyStatus = evaluatePolicyDailyStatus(
      {
        status: PolicyStatus.ACTIVE,
        effectiveDate: policy.effectiveDate,
        expiryDate: policy.expiryDate,
      },
      new Date(),
    );
    const revertedStatus = dailyStatus ?? PolicyStatus.ACTIVE;

    const updated = await this.repo.updatePolicy(id, {
      status: revertedStatus,
      updatedById: userId,
    });

    await this.audit.log({
      action: 'REJECT_POLICY_CANCELLATION',
      entityType: 'POLICY',
      entityId: id,
      jobId: policy.jobId,
      before: { status: policy.status },
      after: { status: updated.status },
      remark: dto.reason,
    });

    return toPolicyResponse(updated);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

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

  /** Guards against connecting a binder/policy document that was uploaded for a different job (IDOR). */
  private async assertJobDocument(jobId: string, documentId?: string): Promise<void> {
    if (!documentId) return;
    const doc = await this.txHost.tx.document.findFirst({
      where: { id: documentId, jobId, deletedAt: null },
    });
    if (!doc) throw new BusinessException('DOCUMENT_NOT_FOUND', 'Document not found for this job', 404);
  }
}
