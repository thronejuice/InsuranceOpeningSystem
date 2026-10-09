import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
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
import { InvoiceStatus, NotificationType } from '../../generated/prisma/enums.js';
import { NotificationService } from '../notification/notification.service.js';
import { CommissionService } from '../commission/commission.service.js';
import { InvoiceRepository } from './invoice.repository.js';
import type { ListInvoiceDto } from './dto/list-invoice.dto.js';
import { toInvoiceResponse, type InvoiceResponse } from './dto/invoice.response.js';
import { bangkokDateString, computeInvoiceStatus } from './domain/invoice-status.js';

const REMINDER_DAYS_BEFORE_DUE = 3;
const OPEN_STATUSES: InvoiceStatus[] = [InvoiceStatus.PENDING, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE];

export interface InvoiceDailyResult {
  overdueCount: number;
  overdueNotifiedCount: number;
  dueSoonNotifiedCount: number;
}

@Injectable()
export class InvoiceService {
  constructor(
    private readonly repo: InvoiceRepository,
    private readonly sequence: SequenceService,
    private readonly audit: AuditService,
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly cls: ClsService<AppClsStore>,
    private readonly scope: DataScopeService,
    private readonly notifications: NotificationService,
    private readonly commissions: CommissionService,
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

  private async toResponses(
    invoices: Parameters<typeof toInvoiceResponse>[0][],
  ): Promise<InvoiceResponse[]> {
    const paid = await this.repo.sumActivePayments(invoices.map((i) => i.id));
    return invoices.map((inv) => toInvoiceResponse(inv, paid.get(inv.id) ?? '0'));
  }

  async listInvoices(dto: ListInvoiceDto): Promise<{ items: InvoiceResponse[]; total: number; page: number; perPage: number }> {
    const page = dto.page ?? 1;
    const perPage = dto.perPage ?? 20;
    const skip = (page - 1) * perPage;

    if (dto.policyId) {
      await this.assertPolicyAccess(dto.policyId);
    }

    const where: Prisma.InvoiceWhereInput = {
      ...(dto.policyId ? { policyId: dto.policyId } : {}),
      ...(dto.customerId ? { customerId: dto.customerId } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.type ? { type: dto.type } : {}),
      ...(dto.dueBefore || dto.dueAfter
        ? {
            dueDate: {
              ...(dto.dueBefore ? { lte: new Date(dto.dueBefore) } : {}),
              ...(dto.dueAfter ? { gte: new Date(dto.dueAfter) } : {}),
            },
          }
        : {}),
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

    return { items: await this.toResponses(data), total, page, perPage };
  }

  async getInvoicesByPolicy(policyId: string): Promise<InvoiceResponse[]> {
    await this.assertPolicyAccess(policyId);
    const invoices = await this.repo.findByPolicy(policyId);
    return this.toResponses(invoices);
  }

  async getInvoiceById(id: string): Promise<InvoiceResponse> {
    const invoice = await this.repo.findById(id);
    if (!invoice) {
      throw new BusinessException('INVOICE_NOT_FOUND', 'Invoice not found', 404);
    }
    await this.assertPolicyAccess(invoice.policyId);
    return (await this.toResponses([invoice]))[0];
  }

  /**
   * For recording a payment: checks the caller may see the invoice's policy, then takes a row lock
   * so two concurrent payments cannot both pass the outstanding check. Must run inside a transaction.
   */
  async loadForPayment(id: string) {
    const found = await this.repo.findById(id);
    if (!found) throw new BusinessException('INVOICE_NOT_FOUND', 'Invoice not found', 404);
    await this.assertPolicyAccess(found.policyId);

    await this.repo.lockForUpdate(id);
    const invoice = await this.repo.findById(id);
    const paid = (await this.repo.sumActivePayments([id])).get(id) ?? '0';
    return { invoice: invoice!, paid };
  }

  /**
   * Recomputes and persists the status from the ACTIVE payments on the invoice. Call after any
   * payment is created or cancelled, inside that payment's transaction.
   */
  async refreshStatus(id: string, now: Date = new Date()): Promise<InvoiceResponse> {
    const invoice = await this.repo.findById(id);
    if (!invoice) throw new BusinessException('INVOICE_NOT_FOUND', 'Invoice not found', 404);

    const paid = (await this.repo.sumActivePayments([id])).get(id) ?? '0';
    const next = computeInvoiceStatus({
      status: invoice.status,
      amount: invoice.amount.toString(),
      paid,
      dueDate: invoice.dueDate,
      now,
    });

    let current = invoice;
    if (next !== invoice.status) {
      current = { ...invoice, ...(await this.repo.update(id, { status: next })) };
      await this.audit.log({
        action: 'INVOICE_STATUS_CHANGED',
        entityType: 'INVOICE',
        entityId: id,
        jobId: invoice.policy?.jobId,
        before: { status: invoice.status },
        after: { status: next },
      });
      // D-13: commission turns PAYABLE when every invoice of the policy is PAID (and back if one stops being)
      await this.commissions.syncPayable(invoice.policyId);
    }
    return toInvoiceResponse(current, paid);
  }

  @Transactional()
  async cancelInvoice(id: string, reason?: string): Promise<InvoiceResponse> {
    const userId = this.cls.get('userId')!;
    const invoice = await this.repo.findById(id);
    if (!invoice) {
      throw new BusinessException('INVOICE_NOT_FOUND', 'Invoice not found', 404);
    }
    await this.assertPolicyAccess(invoice.policyId);

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BusinessException('INVOICE_ALREADY_PAID', 'Cannot cancel a fully paid invoice', 409);
    }
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BusinessException('INVOICE_ALREADY_CANCELLED', 'Invoice is already cancelled', 409);
    }

    const paid = (await this.repo.sumActivePayments([id])).get(id);
    if (paid && new Decimal(paid).greaterThan(0)) {
      throw new BusinessException(
        'INVOICE_HAS_PAYMENTS',
        'Cancel the payments recorded against this invoice before cancelling it',
        409,
      );
    }

    const updated = await this.repo.update(id, {
      status: InvoiceStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelledBy: userId ? { connect: { id: userId } } : undefined,
    });

    await this.audit.log({
      action: 'CANCEL_INVOICE',
      entityType: 'INVOICE',
      entityId: id,
      after: updated,
      remark: reason,
    });
    await this.commissions.syncPayable(invoice.policyId);

    return toInvoiceResponse(updated);
  }

  // ─── Daily job ──────────────────────────────────────────────────────────────

  /**
   * Past due and still owed → OVERDUE (+ one PAYMENT_OVERDUE notification per invoice);
   * due within the next 3 days → one PAYMENT_DUE reminder per invoice. The *_At columns make a
   * re-run (or a missed day) harmless instead of re-notifying every night.
   */
  async processDaily(now: Date = new Date()): Promise<InvoiceDailyResult> {
    const today = bangkokDateString(now);
    const todayDate = new Date(`${today}T00:00:00Z`);
    const reminderEnd = new Date(todayDate);
    reminderEnd.setUTCDate(reminderEnd.getUTCDate() + REMINDER_DAYS_BEFORE_DUE);

    const pastDue = await this.repo.findOpenDueBefore(todayDate, OPEN_STATUSES);
    let overdueCount = 0;
    let overdueNotifiedCount = 0;
    for (const inv of pastDue) {
      const result = await this.processOverdueInvoice(inv.id, now);
      if (result.becameOverdue) overdueCount++;
      if (result.notified) overdueNotifiedCount++;
    }

    const dueSoon = await this.repo.findDueSoonUnreminded(todayDate, reminderEnd);
    let dueSoonNotifiedCount = 0;
    for (const inv of dueSoon) {
      if (await this.sendDueReminder(inv.id)) dueSoonNotifiedCount++;
    }

    return { overdueCount, overdueNotifiedCount, dueSoonNotifiedCount };
  }

  @Transactional()
  protected async processOverdueInvoice(id: string, now: Date): Promise<{ becameOverdue: boolean; notified: boolean }> {
    const invoice = await this.repo.findForNotification(id);
    if (!invoice) return { becameOverdue: false, notified: false };

    const before = invoice.status;
    const refreshed = await this.refreshStatus(id, now);
    const becameOverdue = refreshed.status === InvoiceStatus.OVERDUE && before !== InvoiceStatus.OVERDUE;

    let notified = false;
    if (refreshed.status === InvoiceStatus.OVERDUE && !invoice.overdueNotifiedAt) {
      const recipients = this.recipientsOf(invoice);
      if (recipients.length > 0) {
        await this.notifications.emit(NotificationType.PAYMENT_OVERDUE, recipients, {
          title: `ใบแจ้งหนี้เกินกำหนดชำระ (${invoice.invoiceNo})`,
          message: `ใบแจ้งหนี้ ${invoice.invoiceNo} กรมธรรม์ ${invoice.policy.policyNo} ครบกำหนดชำระเมื่อ ${bangkokDateString(invoice.dueDate)} ยอดค้างชำระ ${refreshed.outstandingAmount} บาท`,
          entityType: 'INVOICE',
          entityId: invoice.id,
          jobId: invoice.policy.jobId,
        });
        await this.repo.update(id, { overdueNotifiedAt: new Date() });
        notified = true;
      }
    }
    return { becameOverdue, notified };
  }

  @Transactional()
  protected async sendDueReminder(id: string): Promise<boolean> {
    const invoice = await this.repo.findForNotification(id);
    if (!invoice) return false;
    const recipients = this.recipientsOf(invoice);
    if (recipients.length === 0) return false;

    await this.notifications.emit(NotificationType.PAYMENT_DUE, recipients, {
      title: `ใบแจ้งหนี้ใกล้ครบกำหนดชำระ (${invoice.invoiceNo})`,
      message: `ใบแจ้งหนี้ ${invoice.invoiceNo} กรมธรรม์ ${invoice.policy.policyNo} จะครบกำหนดชำระในวันที่ ${bangkokDateString(invoice.dueDate)}`,
      entityType: 'INVOICE',
      entityId: invoice.id,
      jobId: invoice.policy.jobId,
    });
    await this.repo.update(id, { dueReminderSentAt: new Date() });
    return true;
  }

  private recipientsOf(invoice: { policy: { job: { agentId: string | null; brokerStaffId: string | null } } }): string[] {
    const { agentId, brokerStaffId } = invoice.policy.job;
    return [agentId, brokerStaffId].filter((u): u is string => Boolean(u));
  }
}
