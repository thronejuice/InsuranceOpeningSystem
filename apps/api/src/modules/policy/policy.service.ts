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
import { PolicyRepository } from './policy.repository.js';
import type { BindDto } from './dto/bind.dto.js';
import type { CreatePolicyDto } from './dto/create-policy.dto.js';
import type { UpdatePolicyDto } from './dto/update-policy.dto.js';
import type { ListPolicyDto } from './dto/list-policy.dto.js';
import {
  toBindingResponse, toPolicyResponse,
  type BindingResponse, type PolicyResponse, type PreconditionCheck,
} from './dto/policy.response.js';

@Injectable()
export class PolicyService {
  constructor(
    private readonly repo: PolicyRepository,
    private readonly sequence: SequenceService,
    private readonly audit: AuditService,
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  // ─── Preconditions ──────────────────────────────────────────────────────────

  async getPreconditions(jobId: string): Promise<PreconditionCheck[]> {
    const job = await this.txHost.tx.job.findFirst({
      where: { id: jobId, deletedAt: null },
      include: {
        product: true,
        proposals: { where: { status: 'ACCEPTED' } },
        approvals: true,
        documents: { where: { status: 'ACTIVE' } },
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

    // BR-008: required documents (only if product.requireDocsOnBind)
    if (job.product?.requireDocsOnBind) {
      const checklist = await this.txHost.tx.documentChecklist.findMany({
        where: { productId: job.productId, isRequired: true, active: true },
      });
      const uploadedTypes = new Set(job.documents.map((d) => d.documentType));
      const missing = checklist.filter((c) => !uploadedTypes.has(c.documentType));
      checks.push({
        code: 'DOCUMENTS_COMPLETE',
        label: 'เอกสารครบตามที่กำหนด',
        met: missing.length === 0,
        details: missing.length > 0 ? `ขาดเอกสาร: ${missing.map((m) => m.documentType).join(', ')}` : undefined,
      });
    }

    return checks;
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

    // BR-008: required documents
    const product = await this.txHost.tx.insuranceProduct.findFirst({ where: { id: job.productId } });
    if (product?.requireDocsOnBind) {
      const checklist = await this.txHost.tx.documentChecklist.findMany({
        where: { productId: job.productId, isRequired: true, active: true },
      });
      if (checklist.length > 0) {
        const docs = await this.txHost.tx.document.findMany({ where: { jobId, status: 'ACTIVE' } });
        const uploadedTypes = new Set(docs.map((d) => d.documentType));
        const missing = checklist.filter((c) => !uploadedTypes.has(c.documentType));
        if (missing.length > 0) {
          throw new BusinessException(
            'BINDING_MISSING_DOCUMENTS',
            `Missing required documents: ${missing.map((m) => m.documentType).join(', ')}`,
            422,
            Object.fromEntries(missing.map((m) => [m.documentType, ['Document required']])),
          );
        }
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const quotation = await this.txHost.tx.quotation.findFirst({ where: { id: job.selectedQuotationId } });

    const binding = await this.repo.createBinding({
      job: { connect: { id: jobId } },
      quotation: { connect: { id: job.selectedQuotationId } },
      bindingDate: new Date(dto.bindingDate ?? today),
      effectiveDate: new Date((quotation?.quotationDate as Date | null)?.toISOString().slice(0, 10) ?? today),
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
      confirmedBy: userId ? { connect: { id: userId } } : undefined,
      remark: dto.remark,
      ...(idempotencyKey && { idempotencyKey }),
    });

    if (idempotencyKey) {
      await this.repo.saveIdempotencyKey(idempotencyKey, 'BINDING', binding.id);
    }

    // Two-hop transition: CUSTOMER_ACCEPTED/APPROVED → BINDING → POLICY_PENDING
    await this.transitionJob(jobId, job.status, job.version, 'BINDING', userId);
    const refreshed = await this.txHost.tx.job.findFirst({ where: { id: jobId } });
    await this.transitionJob(jobId, 'BINDING', refreshed!.version, 'POLICY_PENDING', userId);

    await this.audit.log({ action: 'BIND', entityType: 'BINDING', entityId: binding.id, jobId });

    return toBindingResponse(binding);
  }

  // ─── Policy CRUD ─────────────────────────────────────────────────────────────

  async listPolicies(dto: ListPolicyDto): Promise<PolicyResponse[]> {
    const where = {
      ...(dto.insuranceCompanyId && { insuranceCompanyId: dto.insuranceCompanyId }),
      ...(dto.status && { status: dto.status as never }),
      ...(dto.jobId && { jobId: dto.jobId }),
    };
    const items = await this.repo.findPolicies(where);
    return items.map(toPolicyResponse);
  }

  async getPolicyById(id: string): Promise<PolicyResponse> {
    const policy = await this.repo.findPolicyById(id);
    if (!policy) throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    return toPolicyResponse(policy);
  }

  @Transactional()
  async createPolicy(jobId: string, dto: CreatePolicyDto): Promise<PolicyResponse> {
    const userId = this.cls.get('userId')!;
    const job = await this.getJobOrThrow(jobId);
    await this.assertJobAccess(jobId);

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

    const policy = await this.repo.createPolicy({
      policyNo,
      job: { connect: { id: jobId } },
      quotation: { connect: { id: quotation.id } },
      insuranceCompany: { connect: { id: quotation.insuranceCompanyId } },
      effectiveDate: job.effectiveDate,
      expiryDate: job.expiryDate ?? null,
      grossPremium: quotation.grossPremium,
      discount: quotation.discount,
      netPremium: quotation.netPremium,
      tax: quotation.tax,
      stampDuty: quotation.stampDuty,
      totalPremium: quotation.totalAmount,
      status: 'ISSUED',
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

    // Transition job POLICY_PENDING → POLICY_ISSUED
    await this.transitionJob(jobId, job.status, job.version, 'POLICY_ISSUED', userId);

    await this.audit.log({ action: 'ISSUE_POLICY', entityType: 'POLICY', entityId: policy.id, jobId });

    return toPolicyResponse(policy);
  }

  @Transactional()
  async updatePolicy(id: string, dto: UpdatePolicyDto): Promise<PolicyResponse> {
    const userId = this.cls.get('userId')!;
    const policy = await this.repo.findPolicyById(id);
    if (!policy) throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);

    const updated = await this.repo.updatePolicy(id, {
      ...(dto.paymentDueDate !== undefined && {
        paymentDueDate: dto.paymentDueDate ? new Date(dto.paymentDueDate) : null,
      }),
      ...(dto.remark !== undefined && { remark: dto.remark }),
      updatedById: userId,
      version: { increment: 1 },
    });

    await this.audit.log({ action: 'UPDATE_POLICY', entityType: 'POLICY', entityId: id, jobId: policy.jobId });

    return toPolicyResponse(updated);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

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
