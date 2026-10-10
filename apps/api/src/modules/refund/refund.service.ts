import { Injectable, Optional } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { NotificationService } from '../notification/notification.service.js';
import { Decimal } from 'decimal.js';
import { RefundStatus, NotificationType } from '../../generated/prisma/enums.js';
import { RefundRepository } from './refund.repository.js';
import type { CreateRefundDto, ListRefundQueryDto, ProcessRefundDto, RejectRefundDto } from './dto/refund.dto.js';
import { toRefundResponse, type RefundResponse } from './dto/refund.response.js';

@Injectable()
export class RefundService {
  constructor(
    private readonly repo: RefundRepository,
    private readonly sequence: SequenceService,
    private readonly audit: AuditService,
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly cls: ClsService<AppClsStore>,
    private readonly scope: DataScopeService,
    @Optional() private readonly notifications?: NotificationService,
  ) {}

  private async assertPolicyAccess(policyId: string) {
    const policy = await this.txHost.tx.policy.findFirst({
      where: {
        id: policyId,
        job: { deletedAt: null, ...this.scope.jobViewScope() },
      },
    });
    if (!policy) throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    return policy;
  }

  async list(dto: ListRefundQueryDto): Promise<{ items: RefundResponse[]; total: number }> {
    const page = dto.page ?? 1;
    const perPage = dto.perPage ?? 20;
    const skip = (page - 1) * perPage;

    const where = {
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.policyId
        ? {
            creditNote: {
              policyId: dto.policyId,
              policy: { job: { deletedAt: null, ...this.scope.jobViewScope() } },
            },
          }
        : {
            creditNote: {
              policy: { job: { deletedAt: null, ...this.scope.jobViewScope() } },
            },
          }),
    };

    const [items, total] = await Promise.all([
      this.repo.findMany(where, skip, perPage),
      this.repo.count(where),
    ]);

    return {
      items: items.map(toRefundResponse),
      total,
    };
  }

  async getById(id: string): Promise<RefundResponse> {
    const refund = await this.repo.findById(id);
    if (!refund) throw new BusinessException('REFUND_NOT_FOUND', 'Refund not found', 404);
    await this.assertPolicyAccess(refund.creditNote.policyId);
    return toRefundResponse(refund);
  }

  @Transactional()
  async requestRefund(dto: CreateRefundDto): Promise<RefundResponse> {
    const userId = this.cls.get('userId')!;
    const creditNote = await this.txHost.tx.invoice.findUnique({
      where: { id: dto.creditNoteId },
      include: { policy: true },
    });
    if (!creditNote) throw new BusinessException('INVOICE_NOT_FOUND', 'Credit note not found', 404);
    if (creditNote.type !== 'CREDIT_NOTE') {
      throw new BusinessException('INVOICE_NOT_CREDIT_NOTE', 'Refund can only be requested against a CREDIT_NOTE', 400);
    }
    await this.assertPolicyAccess(creditNote.policyId);

    const existingRefund = await this.repo.findByCreditNoteId(dto.creditNoteId);
    if (existingRefund && existingRefund.status !== RefundStatus.REJECTED) {
      throw new BusinessException('REFUND_ALREADY_EXISTS', 'Active refund already exists for this credit note', 409);
    }

    const refundNo = await this.sequence.next('REFUND');
    const created = await this.repo.create({
      refundNo,
      creditNote: { connect: { id: dto.creditNoteId } },
      amount: new Decimal(dto.amount),
      status: RefundStatus.REQUESTED,
      reason: dto.reason,
      requestedBy: userId ? { connect: { id: userId } } : undefined,
    });

    // Notify FINANCE role about refund waiting for approval (Day 34)
    if (this.notifications) {
      const financeUsers = await this.txHost.tx.user.findMany({
        where: {
          roles: { some: { role: { code: 'FINANCE' } } },
          isActive: true,
        },
        select: { id: true },
      });
      const recipientIds = financeUsers.map((u) => u.id).filter((id) => id !== userId);
      if (recipientIds.length > 0) {
        await this.notifications.emit(
          NotificationType.APPROVAL_REQUIRED,
          recipientIds,
          {
            title: `คำขอคืนเงินรออนุมัติ (${refundNo})`,
            message: `มีคำขอคืนเงินจำนวน ${created.amount.toString()} บาท รอการอนุมัติ`,
            entityType: 'REFUND',
            entityId: created.id,
            jobId: creditNote.policy.jobId,
          },
        );
      }
    }

    await this.audit.log({
      action: 'REQUEST_REFUND',
      entityType: 'REFUND',
      entityId: created.id,
      jobId: creditNote.policy.jobId,
      after: created,
    });

    return toRefundResponse(created);
  }

  @Transactional()
  async approveRefund(id: string): Promise<RefundResponse> {
    const userId = this.cls.get('userId')!;
    const refund = await this.repo.findById(id);
    if (!refund) throw new BusinessException('REFUND_NOT_FOUND', 'Refund not found', 404);
    await this.assertPolicyAccess(refund.creditNote.policyId);

    if (refund.status !== RefundStatus.REQUESTED) {
      throw new BusinessException('REFUND_INVALID_STATUS', `Cannot approve refund in status ${refund.status}`, 409);
    }

    // Maker-checker rule (D-16): approver !== requester
    if (refund.requestedById && refund.requestedById === userId) {
      throw new BusinessException(
        'SELF_APPROVAL_NOT_ALLOWED',
        'Cannot approve refund requested by yourself (Maker-Checker violation)',
        422,
      );
    }

    const updated = await this.repo.update(id, {
      status: RefundStatus.APPROVED,
      approvedBy: { connect: { id: userId } },
      approvedAt: new Date(),
    });

    await this.audit.log({
      action: 'APPROVE_REFUND',
      entityType: 'REFUND',
      entityId: id,
      jobId: refund.creditNote.policy.jobId,
      before: { status: refund.status },
      after: { status: updated.status },
    });

    return toRefundResponse(updated);
  }

  @Transactional()
  async rejectRefund(id: string, dto: RejectRefundDto): Promise<RefundResponse> {
    const userId = this.cls.get('userId')!;
    const refund = await this.repo.findById(id);
    if (!refund) throw new BusinessException('REFUND_NOT_FOUND', 'Refund not found', 404);
    await this.assertPolicyAccess(refund.creditNote.policyId);

    if (refund.status !== RefundStatus.REQUESTED) {
      throw new BusinessException('REFUND_INVALID_STATUS', `Cannot reject refund in status ${refund.status}`, 409);
    }

    const updated = await this.repo.update(id, {
      status: RefundStatus.REJECTED,
      rejectionReason: dto.reason,
    });

    await this.audit.log({
      action: 'REJECT_REFUND',
      entityType: 'REFUND',
      entityId: id,
      jobId: refund.creditNote.policy.jobId,
      before: { status: refund.status },
      after: { status: updated.status },
      remark: dto.reason,
    });

    return toRefundResponse(updated);
  }

  @Transactional()
  async processRefund(id: string, dto: ProcessRefundDto): Promise<RefundResponse> {
    const userId = this.cls.get('userId')!;
    const roles = (this.cls.get('roles') as string[]) ?? [];
    const isFinanceOrAdmin = roles.includes('FINANCE') || roles.includes('ADMIN');

    if (!isFinanceOrAdmin) {
      throw new BusinessException('FORBIDDEN', 'Only FINANCE or ADMIN can process refund payouts (D-16)', 403);
    }

    const refund = await this.repo.findById(id);
    if (!refund) throw new BusinessException('REFUND_NOT_FOUND', 'Refund not found', 404);
    await this.assertPolicyAccess(refund.creditNote.policyId);

    if (refund.status !== RefundStatus.APPROVED) {
      throw new BusinessException('REFUND_NOT_APPROVED', `Cannot process refund in status ${refund.status}. Must be APPROVED.`, 409);
    }

    const updated = await this.repo.update(id, {
      status: RefundStatus.PROCESSED,
      processedBy: { connect: { id: userId } },
      processedAt: new Date(),
      paymentMethod: dto.paymentMethod,
      bank: dto.bank,
      referenceNo: dto.referenceNo,
      attachment: dto.attachmentId ? { connect: { id: dto.attachmentId } } : undefined,
    });

    // Mark the credit note invoice as PAID
    await this.txHost.tx.invoice.update({
      where: { id: refund.creditNoteId },
      data: {
        status: 'PAID',
      },
    });

    await this.audit.log({
      action: 'PROCESS_REFUND',
      entityType: 'REFUND',
      entityId: id,
      jobId: refund.creditNote.policy.jobId,
      before: { status: refund.status },
      after: { status: updated.status },
      remark: `Processed via ${dto.paymentMethod} (Ref: ${dto.referenceNo ?? '-'})`,
    });

    return toRefundResponse(updated);
  }
}
