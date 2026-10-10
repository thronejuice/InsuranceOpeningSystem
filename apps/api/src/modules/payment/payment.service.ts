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
import { InvoiceStatus, InvoiceType } from '../../generated/prisma/enums.js';
import { InvoiceService } from '../invoice/invoice.service.js';
import { bangkokDateString, outstandingAmount } from '../invoice/domain/invoice-status.js';
import { checkPaymentAmount } from './domain/payment-amount.js';
import { derivePaymentStatus } from './domain/payment-status.js';
import { PaymentRepository } from './payment.repository.js';
import type { CreatePaymentDto } from './dto/create-payment.dto.js';
import type { CancelPaymentDto } from './dto/cancel-payment.dto.js';
import {
  toPaymentResponse,
  type InvoicePaymentResponse,
  type PaymentListResponse,
  type PaymentResponse,
} from './dto/payment.response.js';

@Injectable()
export class PaymentService {
  constructor(
    private readonly repo: PaymentRepository,
    private readonly sequence: SequenceService,
    private readonly audit: AuditService,
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly cls: ClsService<AppClsStore>,
    private readonly scope: DataScopeService,
    private readonly invoices: InvoiceService,
  ) {}

  private async assertJobAccess(jobId: string) {
    const job = await this.txHost.tx.job.findFirst({
      where: { id: jobId, deletedAt: null, ...this.scope.jobViewScope() },
    });
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);
    return job;
  }

  private async assertPolicyAccess(policyId: string) {
    const policy = await this.txHost.tx.policy.findFirst({ where: { id: policyId } });
    if (!policy) throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    try {
      await this.assertJobAccess(policy.jobId);
    } catch {
      throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    }
    return policy;
  }

  async listAll(query: {
    policyId?: string;
    invoiceId?: string;
    page?: number;
    perPage?: number;
    limit?: number;
  }): Promise<{ items: PaymentResponse[]; total: number; page: number; perPage: number }> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? query.limit ?? 20;

    if (query.policyId) {
      await this.assertPolicyAccess(query.policyId);
    }
    if (query.invoiceId) {
      // a stranger asking for another agent's invoice gets "not found", not an empty list
      const invoice = await this.txHost.tx.invoice.findFirst({ where: { id: query.invoiceId }, select: { policyId: true } });
      if (!invoice) throw new BusinessException('INVOICE_NOT_FOUND', 'Invoice not found', 404);
      await this.assertPolicyAccess(invoice.policyId);
    }

    const where: Prisma.PaymentWhereInput = {
      ...(query.policyId ? { policyId: query.policyId } : {}),
      ...(query.invoiceId ? { invoiceId: query.invoiceId } : {}),
      policy: { job: { deletedAt: null, ...this.scope.jobViewScope() } },
    };
    const { items, total } = await this.repo.findMany({ where, skip: (page - 1) * perPage, take: perPage });

    return { items: items.map(toPaymentResponse), total, page, perPage };
  }

  async listByPolicy(policyId: string): Promise<PaymentListResponse> {
    const policy = await this.assertPolicyAccess(policyId);

    const payments = await this.repo.findByPolicy(policyId);
    const totalPaid = await this.repo.sumActive(policyId);

    const paymentStatus = derivePaymentStatus({
      totalPremium: policy.totalPremium.toString(),
      totalPaid,
      paymentDueDate: policy.paymentDueDate,
    });

    return { payments: payments.map(toPaymentResponse), totalPaid, paymentStatus };
  }

  /** OQ-4: bounded by the invoice's outstanding amount; a payment is always against exactly one invoice. */
  @Transactional()
  async createForInvoice(
    invoiceId: string,
    dto: CreatePaymentDto,
    idempotencyKey?: string,
  ): Promise<InvoicePaymentResponse> {
    const userId = this.cls.get('userId')!;

    if (idempotencyKey) {
      const existing = await this.txHost.tx.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
      if (existing?.entityType === 'PAYMENT' && existing.entityId) {
        const prior = await this.repo.findById(existing.entityId);
        if (prior?.invoiceId === invoiceId) return this.invoiceResult(prior.id, invoiceId);
        throw new BusinessException('IDEMPOTENCY_KEY_REUSED', 'Idempotency key was used for a different request', 409);
      }
    }

    const { invoice, paid } = await this.invoices.loadForPayment(invoiceId);

    if (invoice.type === InvoiceType.CREDIT_NOTE) {
      throw new BusinessException('INVOICE_NOT_PAYABLE', 'A credit note cannot receive payments', 409);
    }
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BusinessException('INVOICE_CANCELLED', 'Cannot add payment to a cancelled invoice', 409);
    }
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BusinessException('INVOICE_ALREADY_PAID', 'Invoice is already fully paid', 409);
    }

    const policy = await this.txHost.tx.policy.findFirst({ where: { id: invoice.policyId } });
    if (!policy) throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    if (policy.status === 'CANCELLED') {
      throw new BusinessException('POLICY_INVALID_STATUS', 'Cannot add payment to a cancelled policy', 409);
    }

    const outstanding = outstandingAmount(invoice.amount.toString(), paid);
    const check = checkPaymentAmount(dto.amount, outstanding);
    if (check === 'NOT_POSITIVE') {
      throw new BusinessException('PAYMENT_INVALID_AMOUNT', 'Amount must be greater than zero', 422);
    }
    if (check === 'EXCEEDS_OUTSTANDING') {
      throw new BusinessException(
        'PAYMENT_EXCEEDS_OUTSTANDING',
        `Payment would exceed the outstanding amount of ${outstanding.toFixed(2)} on this invoice`,
        422,
      );
    }

    await this.assertAttachmentBelongsToJob(dto.attachmentId, policy.jobId);

    const paymentNo = await this.sequence.next('PAYMENT');
    const payment = await this.repo.create({
      paymentNo,
      policy: { connect: { id: policy.id } },
      invoice: { connect: { id: invoice.id } },
      paymentDate: new Date(dto.paymentDate ?? bangkokDateString(new Date())),
      amount: dto.amount,
      paymentMethod: dto.paymentMethod,
      bank: dto.bank,
      referenceNo: dto.referenceNo,
      attachment: dto.attachmentId ? { connect: { id: dto.attachmentId } } : undefined,
      remark: dto.remark,
      createdBy: userId ? { connect: { id: userId } } : undefined,
    });

    const receipt = await this.repo.createReceipt({
      receiptNo: await this.sequence.next('RECEIPT'),
      payment: { connect: { id: payment.id } },
      invoice: { connect: { id: invoice.id } },
      amount: dto.amount,
      createdBy: userId ? { connect: { id: userId } } : undefined,
    });

    if (idempotencyKey) {
      await this.txHost.tx.idempotencyKey.create({
        data: { key: idempotencyKey, entityType: 'PAYMENT', entityId: payment.id },
      });
    }

    await this.audit.log({
      action: 'CREATE_PAYMENT',
      entityType: 'PAYMENT',
      entityId: payment.id,
      jobId: policy.jobId,
      after: payment,
      remark: dto.remark,
    });
    await this.audit.log({
      action: 'ISSUE_RECEIPT',
      entityType: 'RECEIPT',
      entityId: receipt.id,
      jobId: policy.jobId,
      after: receipt,
    });

    return this.invoiceResult(payment.id, invoice.id);
  }

  /** Cancelling never deletes: the payment is marked CANCELLED and its receipt VOID, then the invoice is re-evaluated. */
  @Transactional()
  async cancel(id: string, dto: CancelPaymentDto): Promise<InvoicePaymentResponse> {
    const userId = this.cls.get('userId')!;
    const found = await this.repo.findById(id);
    if (!found) throw new BusinessException('PAYMENT_NOT_FOUND', 'Payment not found', 404);
    const policy = await this.assertPolicyAccess(found.policyId);

    if (found.invoiceId) {
      await this.invoices.loadForPayment(found.invoiceId);
    }
    const payment = (await this.repo.findById(id))!;
    if (payment.status === 'CANCELLED') {
      throw new BusinessException('PAYMENT_ALREADY_CANCELLED', 'Payment is already cancelled', 409);
    }

    const updated = await this.repo.update(id, { status: 'CANCELLED', cancelReason: dto.cancelReason });

    if (payment.receipt) {
      const voided = await this.repo.voidReceiptOfPayment(id, {
        status: 'VOID',
        voidedAt: new Date(),
        voidReason: dto.cancelReason,
        voidedBy: userId ? { connect: { id: userId } } : undefined,
      });
      await this.audit.log({
        action: 'VOID_RECEIPT',
        entityType: 'RECEIPT',
        entityId: voided.id,
        jobId: policy.jobId,
        before: payment.receipt,
        after: voided,
        remark: dto.cancelReason,
      });
    }

    await this.audit.log({
      action: 'CANCEL_PAYMENT',
      entityType: 'PAYMENT',
      entityId: id,
      jobId: policy.jobId,
      before: payment,
      after: updated,
      remark: dto.cancelReason,
    });

    if (!payment.invoiceId) {
      // Legacy V1 payment recorded against the policy only: nothing to recompute.
      return { payment: toPaymentResponse((await this.repo.findById(id))!), invoice: null };
    }
    return this.invoiceResult(id, payment.invoiceId);
  }

  private async invoiceResult(paymentId: string, invoiceId: string): Promise<InvoicePaymentResponse> {
    const invoice = await this.invoices.refreshStatus(invoiceId);
    const payment = await this.repo.findById(paymentId);
    return { payment: toPaymentResponse(payment!), invoice };
  }

  /** The attachment must be a live document of this policy's own job — never someone else's file. */
  private async assertAttachmentBelongsToJob(attachmentId: string | undefined, jobId: string): Promise<void> {
    if (!attachmentId) return;
    const doc = await this.txHost.tx.document.findFirst({ where: { id: attachmentId, jobId, deletedAt: null } });
    if (!doc) throw new BusinessException('DOCUMENT_NOT_FOUND', 'Attachment not found for this policy', 404);
  }
}
