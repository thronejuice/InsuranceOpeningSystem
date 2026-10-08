import { Injectable } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { evaluateApprovalRules } from './domain/approval-eval.js';
import { ProposalRepository } from './proposal.repository.js';
import type { CreateProposalDto } from './dto/create-proposal.dto.js';
import type { RejectProposalDto } from './dto/reject-proposal.dto.js';
import type { AcceptProposalDto } from './dto/accept-proposal.dto.js';
import {
  toProposalResponse,
  type ProposalResponse,
  type ProposalAcceptanceResponse,
} from './dto/proposal.response.js';
import { validateAcceptanceEvidence } from './domain/proposal-acceptance.js';
import { Decimal } from 'decimal.js';

import { JobWorkflowService } from '../job/job-workflow.service.js';
import { ProposalDocumentService } from './proposal-document.service.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';
import { NotificationService } from '../notification/notification.service.js';
import { NotificationType, type AcceptanceMethod } from '../../generated/prisma/enums.js';
import { StorageService } from '../../common/storage/storage.service.js';

@Injectable()
export class ProposalService {
  constructor(
    private readonly repo: ProposalRepository,
    private readonly sequence: SequenceService,
    private readonly audit: AuditService,
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly cls: ClsService<AppClsStore>,
    private readonly workflow: JobWorkflowService,
    private readonly document: ProposalDocumentService,
    private readonly scope: DataScopeService,
    private readonly notifications: NotificationService,
    private readonly storage: StorageService,
  ) {}

  private viewer() {
    return {
      userId: this.cls.get('userId'),
      permissions: this.cls.get('permissions') ?? [],
      roles: this.cls.get('roles') ?? [],
    };
  }

  async listByJob(jobId: string): Promise<ProposalResponse[]> {
    await this.assertJobAccess(jobId);
    const items = await this.repo.findByJob(jobId);
    const viewer = this.viewer();
    return items.map((p) => toProposalResponse(p, viewer));
  }

  @Transactional()
  async create(jobId: string, dto: CreateProposalDto): Promise<ProposalResponse> {
    const userId = this.cls.get('userId')!;
    const job = await this.getJobOrThrow(jobId);

    // BR-006: job must have a selected quotation
    if (!job.selectedQuotationId) {
      throw new BusinessException('PROPOSAL_NO_SELECTED_QUOTATION', 'Job does not have a selected quotation', 422);
    }

    if (job.status !== 'QUOTATION_SELECTED') {
      throw new BusinessException('JOB_INVALID_STATUS', `Cannot create proposal for job in status ${job.status}`, 409);
    }

    const quotation = await this.txHost.tx.quotation.findFirst({
      where: { id: job.selectedQuotationId },
      include: { versions: { orderBy: { version: 'desc' } } },
    });
    if (!quotation) {
      throw new BusinessException('QUOTATION_NOT_FOUND', 'Selected quotation not found', 404);
    }

    // Resolve quotation version
    let quotationVersionId = dto.quotationVersionId;
    if (quotationVersionId) {
      const qv = quotation.versions.find((v) => v.id === quotationVersionId);
      if (!qv) {
        throw new BusinessException('QUOTATION_VERSION_NOT_FOUND', 'Quotation version not found for selected quotation', 404);
      }
    } else {
      const activeOrSelected =
        quotation.versions.find((v) => v.status === 'SELECTED') ??
        quotation.versions.find((v) => v.status === 'ACTIVE') ??
        quotation.versions[0];
      quotationVersionId = activeOrSelected?.id;
    }

    // Resolve payment term
    if (dto.paymentTermId) {
      const pt = await this.txHost.tx.paymentTerm.findFirst({
        where: { id: dto.paymentTermId, active: true },
      });
      if (!pt) {
        throw new BusinessException('PAYMENT_TERM_NOT_FOUND', 'Payment term not found or inactive', 404);
      }
    }

    // Date range validation
    if (dto.proposalDate && dto.validUntil && new Date(dto.validUntil) <= new Date(dto.proposalDate)) {
      throw new BusinessException('INVALID_DATE_RANGE', 'Valid until date must be after proposal date', 422);
    }

    // Calculate version per Job (Proposal V1, Proposal V2, etc.)
    const maxProposal = await this.repo.findMaxVersionByJob(jobId);
    const version = (maxProposal?.version ?? 0) + 1;

    const proposalNo = await this.sequence.next('PROPOSAL');
    const proposal = await this.repo.create({
      proposalNo,
      job: { connect: { id: jobId } },
      quotation: { connect: { id: job.selectedQuotationId } },
      ...(quotationVersionId && { quotationVersion: { connect: { id: quotationVersionId } } }),
      ...(dto.paymentTermId && { paymentTerm: { connect: { id: dto.paymentTermId } } }),
      customer: { connect: { id: job.customerId } },
      version,
      ...(dto.proposalDate && { proposalDate: new Date(dto.proposalDate) }),
      ...(dto.validUntil && { validUntil: new Date(dto.validUntil) }),
      coverageSummary: dto.coverageSummary,
      terms: dto.terms,
      conditions: dto.conditions,
      remark: dto.remark,
      createdBy: userId ? { connect: { id: userId } } : undefined,
    });

    await this.audit.log({
      action: 'CREATE_PROPOSAL',
      entityType: 'PROPOSAL',
      entityId: proposal.id,
      jobId,
      after: {
        version,
        proposalNo,
        quotationVersionId,
        paymentTermId: dto.paymentTermId,
      },
    });

    return toProposalResponse(proposal, this.viewer());
  }

  async send(id: string): Promise<ProposalResponse> {
    const pdf = await this.document.renderFinal(id);
    return this.sendWithPdf(id, pdf);
  }

  @Transactional()
  private async sendWithPdf(id: string, pdf: Buffer): Promise<ProposalResponse> {
    const userId = this.cls.get('userId')!;
    const proposal = await this.repo.findById(id);
    if (!proposal) throw new BusinessException('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);

    await this.assertJobAccess(proposal.jobId);

    if (proposal.status !== 'DRAFT') {
      throw new BusinessException('PROPOSAL_INVALID_STATUS', `Cannot send proposal in status ${proposal.status}`, 409);
    }

    const job = await this.getJobOrThrow(proposal.jobId);
    if (job.status !== 'QUOTATION_SELECTED') {
      throw new BusinessException('JOB_INVALID_STATUS', `Cannot send proposal for job in status ${job.status}`, 409);
    }

    const updated = await this.repo.update(id, {
      status: 'SENT',
      sentAt: new Date(),
    });

    // Transition job QUOTATION_SELECTED → PROPOSAL_SENT → WAITING_CUSTOMER (Q3: two hops, same tx)
    await this.workflow.transitionInTx(job, 'PROPOSAL_SENT', userId);
    const updatedJob = await this.txHost.tx.job.findFirst({ where: { id: proposal.jobId } });
    await this.workflow.transitionInTx(updatedJob!, 'WAITING_CUSTOMER', userId);

    // Snapshot of exactly what the customer receives (spec §12.1 document type PROPOSAL)
    await this.document.storeFinal(id, pdf);

    await this.audit.log({ action: 'SEND_PROPOSAL', entityType: 'PROPOSAL', entityId: id, jobId: proposal.jobId });

    return toProposalResponse(updated, this.viewer());
  }

  @Transactional()
  async accept(
    id: string,
    dto?: AcceptProposalDto,
    file?: Express.Multer.File,
    ipAddress?: string,
  ): Promise<ProposalResponse> {
    const userId = this.cls.get('userId')!;
    const proposal = await this.repo.findById(id);
    if (!proposal) throw new BusinessException('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);

    await this.assertJobAccess(proposal.jobId);

    if (proposal.status !== 'SENT') {
      throw new BusinessException('PROPOSAL_INVALID_STATUS', `Cannot accept proposal in status ${proposal.status}`, 409);
    }

    // Check expiry
    if (proposal.validUntil) {
      const todayBkk = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
      const validUntilStr = (proposal.validUntil as Date).toISOString().slice(0, 10);
      if (validUntilStr < todayBkk) {
        throw new BusinessException('PROPOSAL_EXPIRED', 'Proposal has expired', 422);
      }
    }

    // Evidence processing
    let evidenceFileId = dto?.evidenceFileId;

    if (file) {
      const now = new Date();
      const safeOriginalName = file.originalname || 'acceptance-evidence.pdf';
      const storedName = `${Date.now()}-${safeOriginalName}`;
      const storagePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${proposal.jobId}/${storedName}`;
      await this.storage.save(storagePath, file.buffer);

      const doc = await this.txHost.tx.document.create({
        data: {
          jobId: proposal.jobId,
          documentType: 'OTHER',
          originalName: safeOriginalName,
          storedName,
          mimeType: file.mimetype || 'application/octet-stream',
          size: file.size,
          storagePath,
          status: 'VERIFIED',
          uploadedById: userId,
          remark: `Acceptance evidence for proposal ${proposal.proposalNo}`,
        },
      });
      evidenceFileId = doc.id;
    }

    if (evidenceFileId && !file) {
      const existingDoc = await this.txHost.tx.document.findFirst({
        where: { id: evidenceFileId, jobId: proposal.jobId, deletedAt: null },
      });
      if (!existingDoc) {
        throw new BusinessException('DOCUMENT_NOT_FOUND', 'Evidence document not found for this job', 404);
      }
    }

    const method = (dto?.method ?? 'EMAIL') as AcceptanceMethod;
    validateAcceptanceEvidence({
      method,
      hasEvidenceFile: Boolean(evidenceFileId),
      remark: dto?.remark,
    });

    const acceptedAtDate = dto?.acceptedAt ? new Date(dto.acceptedAt) : new Date();

    // Determine acceptedByName
    const job = await this.getJobOrThrow(proposal.jobId);
    let acceptedByName = dto?.acceptedByName?.trim();
    if (!acceptedByName) {
      const cust = this.txHost.tx.customer
        ? await this.txHost.tx.customer.findFirst({ where: { id: proposal.customerId } })
        : null;
      if (cust) {
        acceptedByName = cust.companyName || `${cust.firstName ?? ''} ${cust.lastName ?? ''}`.trim() || 'ลูกค้า';
      } else {
        acceptedByName = 'ลูกค้า';
      }
    }

    await this.repo.update(id, {
      status: 'ACCEPTED',
      acceptedAt: acceptedAtDate,
    });

    // Create ProposalAcceptance record
    if (this.txHost.tx.proposalAcceptance?.create) {
      await this.txHost.tx.proposalAcceptance.create({
        data: {
          proposalId: id,
          proposalVersion: proposal.version,
          acceptedByName,
          acceptedAt: acceptedAtDate,
          method,
          ipAddress: ipAddress ?? null,
          evidenceFileId: evidenceFileId ?? null,
          remark: dto?.remark?.trim() || null,
          recordedById: userId ?? null,
        },
      });
    }

    // Evaluate approval rules
    const quotation = await this.txHost.tx.quotation.findFirst({ where: { id: proposal.quotationId } });
    const approverRole = await this.evaluateRules(quotation!);

    if (approverRole) {
      // Create approval + job → WAITING_APPROVAL
      const approval = await this.txHost.tx.approval.create({
        data: {
          job: { connect: { id: proposal.jobId } },
          proposal: { connect: { id } },
          approvalType: approverRole as never,
          requestedBy: userId ? { connect: { id: userId } } : undefined,
        },
      });
      await this.workflow.transitionInTx(job, 'WAITING_APPROVAL', userId);

      // Find approvers to notify (users with matching role or MANAGER/ADMIN)
      const approverUsers = await this.txHost.tx.user.findMany({
        where: {
          roles: {
            some: {
              role: {
                code: { in: [approverRole, 'MANAGER', 'ADMIN'] },
              },
            },
          },
          deletedAt: null,
        },
        select: { id: true },
      });
      const approverIds = approverUsers.map((u) => u.id);

      if (approverIds.length > 0) {
        await this.notifications.emit(
          NotificationType.APPROVAL_REQUESTED,
          approverIds,
          {
            title: `ขออนุมัติส่วนลดสำหรับงาน ${job.jobNo}`,
            message: `ใบเสนอราคา ${proposal.proposalNo} สำหรับงาน ${job.jobNo} ต้องการการอนุมัติระดับ ${approverRole}`,
            entityType: 'APPROVAL',
            entityId: approval.id,
            jobId: proposal.jobId,
          },
        );
      }
    } else {
      // No approval needed → CUSTOMER_ACCEPTED
      await this.workflow.transitionInTx(job, 'CUSTOMER_ACCEPTED', userId);
    }

    // Emit CUSTOMER_ACCEPTED notification to job owner + staff
    const recipients = [job.createdById, job.brokerStaffId, job.assignedTo].filter((uid): uid is string => Boolean(uid));
    const uniqueRecipients = [...new Set(recipients)];
    if (uniqueRecipients.length > 0) {
      await this.notifications.emit(
        NotificationType.CUSTOMER_ACCEPTED,
        uniqueRecipients,
        {
          title: `ลูกค้ายอมรับข้อเสนอสำหรับงาน ${job.jobNo}`,
          message: `ลูกค้า ${acceptedByName} ได้ยอมรับข้อเสนอ ${proposal.proposalNo} (วิธี: ${method})`,
          entityType: 'PROPOSAL',
          entityId: proposal.id,
          jobId: job.id,
        },
      );
    }

    await this.audit.log({
      action: 'ACCEPT_PROPOSAL',
      entityType: 'PROPOSAL',
      entityId: id,
      jobId: proposal.jobId,
      before: { status: proposal.status },
      after: {
        status: 'ACCEPTED',
        method,
        evidenceFileId,
        acceptedByName,
      },
      remark: dto?.remark,
    });

    // Reload to include new approval
    const final = await this.repo.findById(id);
    return toProposalResponse(final!, this.viewer());
  }

  async getAcceptance(id: string): Promise<ProposalAcceptanceResponse> {
    const proposal = await this.repo.findById(id);
    if (!proposal) throw new BusinessException('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
    await this.assertJobAccess(proposal.jobId);

    const resp = toProposalResponse(proposal, this.viewer());
    if (!resp.latestAcceptance) {
      throw new BusinessException('ACCEPTANCE_NOT_FOUND', 'Proposal has no acceptance record', 404);
    }
    return resp.latestAcceptance;
  }

  @Transactional()
  async reject(id: string, dto: RejectProposalDto): Promise<ProposalResponse> {
    const userId = this.cls.get('userId')!;
    const proposal = await this.repo.findById(id);
    if (!proposal) throw new BusinessException('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);

    await this.assertJobAccess(proposal.jobId);

    if (proposal.status !== 'SENT') {
      throw new BusinessException('PROPOSAL_INVALID_STATUS', `Cannot reject proposal in status ${proposal.status}`, 409);
    }

    const updated = await this.repo.update(id, {
      status: 'REJECTED',
      rejectReason: dto.rejectReason as never,
      rejectedAt: new Date(),
      ...(dto.remark !== undefined && { remark: dto.remark }),
    });

    const job = await this.getJobOrThrow(proposal.jobId);
    await this.workflow.transitionInTx(job, 'CUSTOMER_REJECTED', userId);

    // Emit CUSTOMER_REJECTED notification to job owner + staff
    const recipients = [job.createdById, job.brokerStaffId, job.assignedTo].filter((uid): uid is string => Boolean(uid));
    const uniqueRecipients = [...new Set(recipients)];
    if (uniqueRecipients.length > 0) {
      await this.notifications.emit(
        NotificationType.CUSTOMER_REJECTED,
        uniqueRecipients,
        {
          title: `ลูกค้าปฏิเสธข้อเสนอสำหรับงาน ${job.jobNo}`,
          message: `ลูกค้าได้ปฏิเสธข้อเสนอ ${proposal.proposalNo}${dto.rejectReason ? ` (เหตุผล: ${dto.rejectReason})` : ''}`,
          entityType: 'PROPOSAL',
          entityId: proposal.id,
          jobId: job.id,
        },
      );
    }

    await this.audit.log({
      action: 'REJECT_PROPOSAL',
      entityType: 'PROPOSAL',
      entityId: id,
      jobId: proposal.jobId,
      description: dto.rejectReason,
    });

    return toProposalResponse(updated, this.viewer());
  }

  @Transactional()
  async revise(id: string, dto: { reason?: string } = {}): Promise<ProposalResponse> {
    const proposal = await this.repo.findById(id);
    if (!proposal) throw new BusinessException('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);

    await this.assertJobAccess(proposal.jobId);
    await this.workflow.revise(proposal.jobId, { reason: dto.reason });

    const updated = await this.repo.findById(id);
    await this.audit.log({
      action: 'REVISE_PROPOSAL',
      entityType: 'PROPOSAL',
      entityId: id,
      jobId: proposal.jobId,
      before: { status: proposal.status },
      after: { status: 'SUPERSEDED' },
      description: dto.reason,
    });

    return toProposalResponse(updated!, this.viewer());
  }

  @Transactional()
  async expireOutdatedProposals(now = new Date()): Promise<{ count: number }> {
    const bkkFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' });
    const todayBkkStr = bkkFormatter.format(now);
    const todayBkk = new Date(`${todayBkkStr}T00:00:00+07:00`);

    const outdated = await this.repo.findOutdated(todayBkk);
    if (!outdated || outdated.length === 0) return { count: 0 };

    const ids = outdated.map((p) => p.id);
    await this.txHost.tx.proposal.updateMany({
      where: { id: { in: ids } },
      data: { status: 'EXPIRED' },
    });

    for (const p of outdated) {
      await this.audit.log({
        action: 'PROPOSAL_EXPIRED',
        entityType: 'PROPOSAL',
        entityId: p.id,
        jobId: p.jobId,
        oldValue: { status: p.status },
        newValue: { status: 'EXPIRED' },
        description: 'Expired by daily check',
      });
    }

    return { count: ids.length };
  }

  async processDaily(now = new Date()): Promise<{ expiredCount: number }> {
    const expired = await this.expireOutdatedProposals(now);
    return { expiredCount: expired.count };
  }

  private async evaluateRules(quotation: {
    netPremium: { toString(): string };
    grossPremium: { toString(): string };
    discount: { toString(): string };
  }) {
    const rules = await this.txHost.tx.approvalRule.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });
    const gross = new Decimal(quotation.grossPremium.toString());
    const discountAmt = new Decimal(quotation.discount.toString());
    const discountPct = gross.isZero() ? new Decimal(0) : discountAmt.div(gross).times(100);
    return evaluateApprovalRules(quotation.netPremium.toString(), discountPct.toFixed(4), rules);
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
