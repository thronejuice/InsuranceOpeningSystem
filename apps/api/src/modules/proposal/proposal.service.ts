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
import { evaluateApprovalRules } from './domain/approval-eval.js';
import { ProposalRepository } from './proposal.repository.js';
import type { CreateProposalDto } from './dto/create-proposal.dto.js';
import type { RejectProposalDto } from './dto/reject-proposal.dto.js';
import { toProposalResponse, type ProposalResponse } from './dto/proposal.response.js';
import { Decimal } from 'decimal.js';

@Injectable()
export class ProposalService {
  constructor(
    private readonly repo: ProposalRepository,
    private readonly sequence: SequenceService,
    private readonly audit: AuditService,
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  private viewer() {
    return { userId: this.cls.get('userId'), permissions: this.cls.get('permissions') ?? [] };
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

    const quotation = await this.txHost.tx.quotation.findFirst({ where: { id: job.selectedQuotationId } });
    if (!quotation) {
      throw new BusinessException('QUOTATION_NOT_FOUND', 'Selected quotation not found', 404);
    }

    const proposalNo = await this.sequence.next('PROPOSAL');
    const proposal = await this.repo.create({
      proposalNo,
      job: { connect: { id: jobId } },
      quotation: { connect: { id: job.selectedQuotationId } },
      customer: { connect: { id: job.customerId } },
      ...(dto.proposalDate && { proposalDate: new Date(dto.proposalDate) }),
      ...(dto.validUntil && { validUntil: new Date(dto.validUntil) }),
      remark: dto.remark,
      createdBy: userId ? { connect: { id: userId } } : undefined,
    });

    await this.audit.log({ action: 'CREATE_PROPOSAL', entityType: 'PROPOSAL', entityId: proposal.id, jobId });

    return toProposalResponse(proposal, this.viewer());
  }

  @Transactional()
  async send(id: string): Promise<ProposalResponse> {
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
      version: { increment: 1 },
    });

    // Transition job QUOTATION_SELECTED → PROPOSAL_SENT → WAITING_CUSTOMER (Q3: two hops, same tx)
    await this.transitionJob(proposal.jobId, job.status, job.version, 'PROPOSAL_SENT', userId);
    const updatedJob = await this.txHost.tx.job.findFirst({ where: { id: proposal.jobId } });
    await this.transitionJob(proposal.jobId, 'PROPOSAL_SENT', updatedJob!.version, 'WAITING_CUSTOMER', userId);

    await this.audit.log({ action: 'SEND_PROPOSAL', entityType: 'PROPOSAL', entityId: id, jobId: proposal.jobId });

    return toProposalResponse(updated, this.viewer());
  }

  @Transactional()
  async accept(id: string): Promise<ProposalResponse> {
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

    const updated = await this.repo.update(id, {
      status: 'ACCEPTED',
      acceptedAt: new Date(),
      version: { increment: 1 },
    });

    // Evaluate approval rules
    const quotation = await this.txHost.tx.quotation.findFirst({ where: { id: proposal.quotationId } });
    const job = await this.getJobOrThrow(proposal.jobId);

    const approverRole = await this.evaluateRules(quotation!);

    if (approverRole) {
      // Create approval + job → WAITING_APPROVAL
      await this.txHost.tx.approval.create({
        data: {
          job: { connect: { id: proposal.jobId } },
          proposal: { connect: { id } },
          approvalType: approverRole as never,
          requestedBy: userId ? { connect: { id: userId } } : undefined,
        },
      });
      await this.transitionJob(proposal.jobId, job.status, job.version, 'WAITING_APPROVAL', userId);
    } else {
      // No approval needed → CUSTOMER_ACCEPTED
      await this.transitionJob(proposal.jobId, job.status, job.version, 'CUSTOMER_ACCEPTED', userId);
    }

    await this.audit.log({ action: 'ACCEPT_PROPOSAL', entityType: 'PROPOSAL', entityId: id, jobId: proposal.jobId });

    // Reload to include new approval
    const final = await this.repo.findById(id);
    return toProposalResponse(final!, this.viewer());
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
      version: { increment: 1 },
    });

    const job = await this.getJobOrThrow(proposal.jobId);
    await this.transitionJob(proposal.jobId, job.status, job.version, 'CUSTOMER_REJECTED', userId);

    await this.audit.log({
      action: 'REJECT_PROPOSAL',
      entityType: 'PROPOSAL',
      entityId: id,
      jobId: proposal.jobId,
      description: dto.rejectReason,
    });

    return toProposalResponse(updated, this.viewer());
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
