import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { Decimal } from 'decimal.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import type { JobQueryDto } from '../job/dto/job-query.dto.js';
import type { ListQuotationDto } from '../quotation/dto/list-quotation.dto.js';
import type { ListPolicyDto } from '../policy/dto/list-policy.dto.js';
import type { CommissionQueryDto } from '../commission/dto/commission-query.dto.js';
import type { RenewalQueryDto } from '../renewal/dto/renewal-query.dto.js';
import { CommissionStatementService } from '../commission/commission-statement.service.js';
import { ListStatementDto } from '../commission/dto/statement.dto.js';
import { agingBucket, daysOverdue } from '../invoice/domain/aging.js';
import { outstandingAmount } from '../invoice/domain/invoice-status.js';

const MONEY_FMT = '#,##0.00';
const DATE_FMT = 'dd/mm/yyyy';

@Injectable()
export class ReportService {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly scope: DataScopeService,
    private readonly statements: CommissionStatementService,
  ) {}

  private get db() {
    return this.txHost.tx;
  }

  /** Jobs the caller may see (BR-014 / D-21). Every export is filtered through this — no report bypasses data scope. */
  private jobScope() {
    return { deletedAt: null, ...this.scope.jobViewScope() };
  }

  private customerName(c: { companyName: string | null; firstName: string | null; lastName: string | null } | null | undefined): string {
    if (!c) return '';
    return c.companyName || [c.firstName, c.lastName].filter(Boolean).join(' ');
  }

  /** Money leaves the API as strings; Excel needs numbers so it can be summed — every value is an exact 2dp string. */
  private num(v: { toString(): string } | string | null | undefined): number {
    return v == null ? 0 : Number(v.toString());
  }

  private startWorkbook(res: Response, filename: string): ExcelJS.stream.xlsx.WorkbookWriter {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res as any, useStyles: true, useSharedStrings: true });
  }

  // ─── Jobs ──────────────────────────────────────────────────────────────────

  async exportJobs(query: JobQueryDto, res: Response): Promise<void> {
    const where = {
      ...this.jobScope(),
      ...(query.status && { status: query.status }),
      ...(query.customerId && { customerId: query.customerId }),
      ...(query.agentId && { agentId: query.agentId }),
      ...(query.productId && { productId: query.productId }),
      ...(query.insuranceTypeId && { insuranceTypeId: query.insuranceTypeId }),
      ...(query.priority && { priority: query.priority }),
      ...(query.effectiveDateFrom || query.effectiveDateTo
        ? {
            effectiveDate: {
              ...(query.effectiveDateFrom && { gte: new Date(query.effectiveDateFrom) }),
              ...(query.effectiveDateTo && { lte: new Date(query.effectiveDateTo) }),
            },
          }
        : {}),
    };

    const rows = await this.db.job.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { customerCode: true, firstName: true, lastName: true, companyName: true } },
        insuranceType: { select: { name: true } },
        product: { select: { name: true } },
        agent: { select: { fullName: true } },
      },
    });

    const wb = this.startWorkbook(res, 'jobs.xlsx');
    const ws = wb.addWorksheet('Jobs');
    ws.columns = [
      { header: 'Job No.', key: 'jobNo', width: 18 },
      { header: 'Status', key: 'status', width: 20 },
      { header: 'Priority', key: 'priority', width: 12 },
      { header: 'Customer', key: 'customer', width: 30 },
      { header: 'Insurance Type', key: 'insuranceType', width: 20 },
      { header: 'Product', key: 'product', width: 20 },
      { header: 'Agent', key: 'agent', width: 20 },
      { header: 'Effective Date', key: 'effectiveDate', width: 14, style: { numFmt: DATE_FMT } },
      { header: 'Expiry Date', key: 'expiryDate', width: 14, style: { numFmt: DATE_FMT } },
      { header: 'Created At', key: 'createdAt', width: 16, style: { numFmt: DATE_FMT } },
    ];

    for (const r of rows) {
      ws.addRow({
        jobNo: r.jobNo,
        status: r.status,
        priority: r.priority,
        customer: r.customer
          ? r.customer.companyName ?? `${r.customer.firstName ?? ''} ${r.customer.lastName ?? ''}`.trim()
          : '',
        insuranceType: r.insuranceType?.name ?? '',
        product: r.product?.name ?? '',
        agent: r.agent?.fullName ?? '',
        effectiveDate: r.effectiveDate,
        expiryDate: r.expiryDate ?? '',
        createdAt: r.createdAt,
      }).commit();
    }

    await wb.commit();
  }

  // ─── Quotations ────────────────────────────────────────────────────────────

  async exportQuotations(query: ListQuotationDto, res: Response): Promise<void> {
    const where = {
      job: this.jobScope(),
      ...(query.insuranceCompanyId && { insuranceCompanyId: query.insuranceCompanyId }),
      ...(query.status && { status: query.status as never }),
      ...(query.validUntilFrom || query.validUntilTo
        ? {
            validUntil: {
              ...(query.validUntilFrom && { gte: new Date(query.validUntilFrom) }),
              ...(query.validUntilTo && { lte: new Date(query.validUntilTo) }),
            },
          }
        : {}),
    };

    const rows = await this.db.quotation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { insuranceCompany: { select: { name: true } } },
    });

    const wb = this.startWorkbook(res, 'quotations.xlsx');
    const ws = wb.addWorksheet('Quotations');
    ws.columns = [
      { header: 'Quotation No.', key: 'quotationNo', width: 20 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Insurance Company', key: 'company', width: 28 },
      { header: 'Quotation Date', key: 'quotationDate', width: 14, style: { numFmt: DATE_FMT } },
      { header: 'Valid Until', key: 'validUntil', width: 14, style: { numFmt: DATE_FMT } },
      { header: 'Gross Premium', key: 'grossPremium', width: 16, style: { numFmt: MONEY_FMT } },
      { header: 'Discount', key: 'discount', width: 14, style: { numFmt: MONEY_FMT } },
      { header: 'Net Premium', key: 'netPremium', width: 14, style: { numFmt: MONEY_FMT } },
      { header: 'Tax', key: 'tax', width: 12, style: { numFmt: MONEY_FMT } },
      { header: 'Stamp Duty', key: 'stampDuty', width: 12, style: { numFmt: MONEY_FMT } },
      { header: 'Total Amount', key: 'totalAmount', width: 14, style: { numFmt: MONEY_FMT } },
    ];

    for (const r of rows) {
      ws.addRow({
        quotationNo: r.quotationNo,
        status: r.status,
        company: r.insuranceCompany?.name ?? '',
        quotationDate: r.quotationDate ?? '',
        validUntil: r.validUntil ?? '',
        grossPremium: parseFloat(r.grossPremium.toString()),
        discount: parseFloat(r.discount.toString()),
        netPremium: parseFloat(r.netPremium.toString()),
        tax: parseFloat(r.tax.toString()),
        stampDuty: parseFloat(r.stampDuty.toString()),
        totalAmount: parseFloat(r.totalAmount.toString()),
      }).commit();
    }

    await wb.commit();
  }

  // ─── Policies ──────────────────────────────────────────────────────────────

  async exportPolicies(query: ListPolicyDto, res: Response): Promise<void> {
    const where = {
      job: this.jobScope(),
      ...(query.insuranceCompanyId && { insuranceCompanyId: query.insuranceCompanyId }),
      ...(query.status && { status: query.status as never }),
      ...(query.jobId && { jobId: query.jobId }),
    };

    const rows = await this.db.policy.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { insuranceCompany: { select: { name: true } } },
    });

    const wb = this.startWorkbook(res, 'policies.xlsx');
    const ws = wb.addWorksheet('Policies');
    ws.columns = [
      { header: 'Policy No.', key: 'policyNo', width: 22 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Policy Type', key: 'policyType', width: 16 },
      { header: 'Insurance Company', key: 'company', width: 28 },
      { header: 'Effective Date', key: 'effectiveDate', width: 14, style: { numFmt: DATE_FMT } },
      { header: 'Expiry Date', key: 'expiryDate', width: 14, style: { numFmt: DATE_FMT } },
      { header: 'Sum Insured', key: 'sumInsured', width: 16, style: { numFmt: MONEY_FMT } },
      { header: 'Net Premium', key: 'netPremium', width: 14, style: { numFmt: MONEY_FMT } },
      { header: 'Total Premium', key: 'totalPremium', width: 14, style: { numFmt: MONEY_FMT } },
      { header: 'Created At', key: 'createdAt', width: 16, style: { numFmt: DATE_FMT } },
    ];

    for (const r of rows) {
      ws.addRow({
        policyNo: r.policyNo,
        status: r.status,
        policyType: r.policyType ?? '',
        company: r.insuranceCompany?.name ?? '',
        effectiveDate: r.effectiveDate,
        expiryDate: r.expiryDate ?? '',
        sumInsured: r.sumInsured ? parseFloat(r.sumInsured.toString()) : '',
        netPremium: r.netPremium ? parseFloat(r.netPremium.toString()) : '',
        totalPremium: r.totalPremium ? parseFloat(r.totalPremium.toString()) : '',
        createdAt: r.createdAt,
      }).commit();
    }

    await wb.commit();
  }

  // ─── Payments ──────────────────────────────────────────────────────────────

  async exportPayments(res: Response): Promise<void> {
    const rows = await this.db.payment.findMany({
      where: { policy: { job: this.jobScope() } },
      orderBy: { paymentDate: 'desc' },
    });

    const wb = this.startWorkbook(res, 'payments.xlsx');
    const ws = wb.addWorksheet('Payments');
    ws.columns = [
      { header: 'Payment No.', key: 'paymentNo', width: 22 },
      { header: 'Payment Method', key: 'paymentMethod', width: 18 },
      { header: 'Amount', key: 'amount', width: 16, style: { numFmt: MONEY_FMT } },
      { header: 'Payment Date', key: 'paymentDate', width: 14, style: { numFmt: DATE_FMT } },
      { header: 'Reference No.', key: 'referenceNo', width: 20 },
      { header: 'Status', key: 'status', width: 14 },
    ];

    for (const r of rows) {
      ws.addRow({
        paymentNo: r.paymentNo,
        paymentMethod: r.paymentMethod,
        amount: parseFloat(r.amount.toString()),
        paymentDate: r.paymentDate,
        referenceNo: r.referenceNo ?? '',
        status: r.status,
      }).commit();
    }

    await wb.commit();
  }

  // ─── Commissions ───────────────────────────────────────────────────────────

  async exportCommissions(query: CommissionQueryDto, res: Response): Promise<void> {
    const where = {
      policy: { job: this.jobScope() },
      ...(query.agentId && { agentId: query.agentId }),
      ...(query.status && { status: query.status as never }),
      ...(query.fromDate || query.toDate
        ? {
            createdAt: {
              ...(query.fromDate && { gte: new Date(query.fromDate) }),
              ...(query.toDate && { lte: new Date(query.toDate) }),
            },
          }
        : {}),
    };

    const rows = await this.db.commission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { agent: { select: { fullName: true } }, policy: { select: { policyNo: true } } },
    });

    const wb = this.startWorkbook(res, 'commissions.xlsx');
    const ws = wb.addWorksheet('Commissions');
    ws.columns = [
      { header: 'Policy No.', key: 'policyNo', width: 22 },
      { header: 'Agent', key: 'agent', width: 22 },
      { header: 'Commission Type', key: 'commissionType', width: 18 },
      { header: 'Commission Rate (%)', key: 'commissionRate', width: 20, style: { numFmt: '0.00' } },
      { header: 'Commission Base', key: 'commissionBase', width: 18, style: { numFmt: MONEY_FMT } },
      { header: 'Commission Amount', key: 'commissionAmount', width: 20, style: { numFmt: MONEY_FMT } },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Paid Date', key: 'paidDate', width: 14, style: { numFmt: DATE_FMT } },
    ];

    for (const r of rows) {
      ws.addRow({
        policyNo: r.policy?.policyNo ?? '',
        agent: r.agent?.fullName ?? '',
        commissionType: r.commissionType,
        commissionRate: parseFloat(r.commissionRate.toString()),
        commissionBase: parseFloat(r.commissionBase.toString()),
        commissionAmount: parseFloat(r.commissionAmount.toString()),
        status: r.status,
        paidDate: r.paidDate ?? '',
      }).commit();
    }

    await wb.commit();
  }

  // ─── Renewals ──────────────────────────────────────────────────────────────

  async exportRenewals(query: RenewalQueryDto, res: Response): Promise<void> {
    const where = {
      previousPolicy: { job: this.jobScope() },
      ...(query.status && { status: query.status }),
      ...(query.assignedTo && { assignedTo: query.assignedTo }),
    };

    const rows = await this.db.renewal.findMany({
      where,
      orderBy: { renewalDate: 'desc' },
      include: {
        previousPolicy: { select: { policyNo: true } },
        assignee: { select: { fullName: true } },
      },
    });

    const wb = this.startWorkbook(res, 'renewals.xlsx');
    const ws = wb.addWorksheet('Renewals');
    ws.columns = [
      { header: 'Previous Policy No.', key: 'previousPolicyNo', width: 24 },
      { header: 'Status', key: 'status', width: 20 },
      { header: 'Renewal Date', key: 'renewalDate', width: 14, style: { numFmt: DATE_FMT } },
      { header: 'Target Expiry Date', key: 'targetExpiryDate', width: 18, style: { numFmt: DATE_FMT } },
      { header: 'Assigned To', key: 'assignee', width: 22 },
      { header: 'Remark', key: 'remark', width: 30 },
    ];

    for (const r of rows) {
      ws.addRow({
        previousPolicyNo: r.previousPolicy?.policyNo ?? '',
        status: r.status,
        renewalDate: r.renewalDate,
        targetExpiryDate: r.targetExpiryDate,
        assignee: r.assignee?.fullName ?? '',
        remark: r.remark ?? '',
      }).commit();
    }

    await wb.commit();
  }

  // ─── Invoices ──────────────────────────────────────────────────────────────

  /** Invoices, debit notes and credit notes with what was paid and what is still owed (D-14 / Phase 4). */
  async exportInvoices(res: Response): Promise<void> {
    const invoices = await this.db.invoice.findMany({
      where: { policy: { job: this.jobScope() } },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { companyName: true, firstName: true, lastName: true } },
        policy: { select: { policyNo: true } },
      },
    });
    const paid = await this.paidByInvoice(invoices.map((i) => i.id));

    const wb = this.startWorkbook(res, 'invoices.xlsx');
    const ws = wb.addWorksheet('Invoices');
    ws.columns = [
      { header: 'Invoice No.', key: 'invoiceNo', width: 20 },
      { header: 'Policy No.', key: 'policyNo', width: 22 },
      { header: 'Customer', key: 'customer', width: 30 },
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Installment', key: 'installment', width: 12 },
      { header: 'Due Date', key: 'dueDate', width: 14, style: { numFmt: DATE_FMT } },
      { header: 'Amount', key: 'amount', width: 16, style: { numFmt: MONEY_FMT } },
      { header: 'Paid', key: 'paid', width: 16, style: { numFmt: MONEY_FMT } },
      { header: 'Outstanding', key: 'outstanding', width: 16, style: { numFmt: MONEY_FMT } },
      { header: 'Status', key: 'status', width: 16 },
    ];
    for (const r of invoices) {
      const paidAmount = new Decimal(paid.get(r.id) ?? 0);
      ws.addRow({
        invoiceNo: r.invoiceNo,
        policyNo: r.policy?.policyNo ?? '',
        customer: this.customerName(r.customer),
        type: r.type,
        installment: r.installmentNo ?? '',
        dueDate: r.dueDate,
        amount: this.num(r.amount),
        paid: this.num(paidAmount.toFixed(2)),
        outstanding: r.status === 'CANCELLED' ? 0 : this.num(outstandingAmount(r.amount.toString(), paidAmount).toFixed(2)),
        status: r.status,
      }).commit();
    }
    ws.commit();
    await wb.commit();
  }

  private async paidByInvoice(invoiceIds: string[]): Promise<Map<string, string>> {
    if (invoiceIds.length === 0) return new Map();
    const rows = await this.db.payment.groupBy({
      by: ['invoiceId'],
      where: { invoiceId: { in: invoiceIds }, status: 'ACTIVE' },
      _sum: { amount: true },
    });
    return new Map(rows.filter((r) => r.invoiceId).map((r) => [r.invoiceId as string, (r._sum.amount ?? 0).toString()]));
  }

  // ─── Receivables (Aging) ───────────────────────────────────────────────────

  /** Open invoices with their aging bucket (OQ-12), plus a per-bucket summary sheet. */
  async exportReceivables(res: Response): Promise<void> {
    const now = new Date();
    const invoices = await this.db.invoice.findMany({
      where: {
        status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
        type: { in: ['INVOICE', 'DEBIT_NOTE'] },
        policy: { job: this.jobScope() },
      },
      orderBy: { dueDate: 'asc' },
      include: {
        customer: { select: { companyName: true, firstName: true, lastName: true } },
        policy: { select: { policyNo: true } },
      },
    });
    const paid = await this.paidByInvoice(invoices.map((i) => i.id));

    const wb = this.startWorkbook(res, 'receivables_aging.xlsx');
    const ws = wb.addWorksheet('Aging');
    ws.columns = [
      { header: 'Invoice No.', key: 'invoiceNo', width: 20 },
      { header: 'Customer', key: 'customer', width: 30 },
      { header: 'Policy No.', key: 'policyNo', width: 22 },
      { header: 'Due Date', key: 'dueDate', width: 14, style: { numFmt: DATE_FMT } },
      { header: 'Days Overdue', key: 'days', width: 14 },
      { header: 'Aging Bucket', key: 'bucket', width: 18 },
      { header: 'Outstanding', key: 'outstanding', width: 18, style: { numFmt: MONEY_FMT } },
      { header: 'Status', key: 'status', width: 16 },
    ];
    const totals = new Map<string, Decimal>();
    for (const r of invoices) {
      const outstanding = outstandingAmount(r.amount.toString(), new Decimal(paid.get(r.id) ?? 0));
      const bucket = agingBucket(r.dueDate, now);
      totals.set(bucket, (totals.get(bucket) ?? new Decimal(0)).plus(outstanding));
      ws.addRow({
        invoiceNo: r.invoiceNo,
        customer: this.customerName(r.customer),
        policyNo: r.policy?.policyNo ?? '',
        dueDate: r.dueDate,
        days: Math.max(0, daysOverdue(r.dueDate, now)),
        bucket,
        outstanding: this.num(outstanding.toFixed(2)),
        status: r.status,
      }).commit();
    }
    ws.commit();

    const summary = wb.addWorksheet('Summary');
    summary.columns = [
      { header: 'Aging Bucket', key: 'bucket', width: 20 },
      { header: 'Outstanding', key: 'outstanding', width: 18, style: { numFmt: MONEY_FMT } },
    ];
    let grand = new Decimal(0);
    for (const bucket of ['NOT_DUE', 'D0_30', 'D31_60', 'D61_90', 'D90_PLUS']) {
      const v = totals.get(bucket) ?? new Decimal(0);
      grand = grand.plus(v);
      summary.addRow({ bucket, outstanding: this.num(v.toFixed(2)) }).commit();
    }
    summary.addRow({ bucket: 'TOTAL', outstanding: this.num(grand.toFixed(2)) }).commit();
    summary.commit();
    await wb.commit();
  }

  // ─── Commission statements ─────────────────────────────────────────────────

  /** One row per statement. Visibility follows the statements list: payees see only their own. */
  async exportCommissionStatements(res: Response): Promise<void> {
    const rows = [];
    for (let page = 1; ; page++) {
      const batch = await this.statements.list(Object.assign(new ListStatementDto(), { page, perPage: 100 }));
      rows.push(...batch.items);
      if (rows.length >= batch.total || batch.items.length === 0) break;
    }

    const wb = this.startWorkbook(res, 'commission_statements.xlsx');
    const ws = wb.addWorksheet('Statements');
    ws.columns = [
      { header: 'Statement No.', key: 'statementNo', width: 22 },
      { header: 'Payee', key: 'agent', width: 25 },
      { header: 'Period', key: 'period', width: 12 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Commissions', key: 'commissionCount', width: 13 },
      { header: 'Adjustments', key: 'adjustmentCount', width: 13 },
      { header: 'Share Total', key: 'shareTotal', width: 16, style: { numFmt: MONEY_FMT } },
      { header: 'WHT Total', key: 'whtTotal', width: 16, style: { numFmt: MONEY_FMT } },
      { header: 'Net Total', key: 'netTotal', width: 16, style: { numFmt: MONEY_FMT } },
      { header: 'Paid Date', key: 'paidDate', width: 14 },
      { header: 'Payment Ref', key: 'paymentRef', width: 20 },
    ];
    for (const r of rows) {
      ws.addRow({
        statementNo: r.statementNo,
        agent: r.agent?.fullName ?? '',
        period: r.period,
        status: r.status,
        commissionCount: r.commissionCount,
        adjustmentCount: r.adjustmentCount,
        shareTotal: this.num(r.shareTotal),
        whtTotal: this.num(r.whtTotal),
        netTotal: this.num(r.netTotal),
        paidDate: r.paidDate ?? '',
        paymentRef: r.paymentRef ?? '',
      }).commit();
    }
    ws.commit();
    await wb.commit();
  }

  // ─── Endorsements ──────────────────────────────────────────────────────────

  async exportEndorsements(res: Response): Promise<void> {
    const rows = await this.db.endorsement.findMany({
      where: { policy: { job: this.jobScope() } },
      orderBy: { createdAt: 'desc' },
      include: { policy: { select: { policyNo: true } } },
    });

    const wb = this.startWorkbook(res, 'endorsements.xlsx');
    const ws = wb.addWorksheet('Endorsements');
    ws.columns = [
      { header: 'Endorsement No.', key: 'endorsementNo', width: 20 },
      { header: 'Policy No.', key: 'policyNo', width: 22 },
      { header: 'Type', key: 'type', width: 24 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Effective Date', key: 'effectiveDate', width: 14, style: { numFmt: DATE_FMT } },
      { header: 'Premium Adjustment', key: 'adjustmentType', width: 20 },
      { header: 'Net', key: 'net', width: 16, style: { numFmt: MONEY_FMT } },
      { header: 'Stamp Duty', key: 'stamp', width: 14, style: { numFmt: MONEY_FMT } },
      { header: 'VAT', key: 'vat', width: 14, style: { numFmt: MONEY_FMT } },
      { header: 'Total Adjustment', key: 'total', width: 18, style: { numFmt: MONEY_FMT } },
      { header: 'Requested At', key: 'requestedAt', width: 16, style: { numFmt: DATE_FMT } },
      { header: 'Issued At', key: 'issuedAt', width: 16, style: { numFmt: DATE_FMT } },
    ];
    for (const r of rows) {
      ws.addRow({
        endorsementNo: r.endorsementNo,
        policyNo: r.policy?.policyNo ?? '',
        type: r.type,
        status: r.status,
        effectiveDate: r.effectiveDate,
        adjustmentType: r.premiumAdjustmentType,
        net: this.num(r.netAdjustment),
        stamp: this.num(r.stampDuty),
        vat: this.num(r.vat),
        total: this.num(r.totalAdjustment),
        requestedAt: r.requestedAt ?? '',
        issuedAt: r.issuedAt ?? '',
      }).commit();
    }
    ws.commit();
    await wb.commit();
  }

  // ─── Refunds ───────────────────────────────────────────────────────────────

  async exportRefunds(res: Response): Promise<void> {
    const rows = await this.db.refund.findMany({
      where: { creditNote: { policy: { job: this.jobScope() } } },
      orderBy: { createdAt: 'desc' },
      include: { creditNote: { select: { invoiceNo: true, policy: { select: { policyNo: true } } } } },
    });

    const wb = this.startWorkbook(res, 'refunds.xlsx');
    const ws = wb.addWorksheet('Refunds');
    ws.columns = [
      { header: 'Refund No.', key: 'refundNo', width: 20 },
      { header: 'Credit Note', key: 'creditNote', width: 20 },
      { header: 'Policy No.', key: 'policyNo', width: 22 },
      { header: 'Amount', key: 'amount', width: 16, style: { numFmt: MONEY_FMT } },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Requested At', key: 'requestedAt', width: 16, style: { numFmt: DATE_FMT } },
      { header: 'Approved At', key: 'approvedAt', width: 16, style: { numFmt: DATE_FMT } },
      { header: 'Processed At', key: 'processedAt', width: 16, style: { numFmt: DATE_FMT } },
      { header: 'Method', key: 'method', width: 14 },
      { header: 'Bank', key: 'bank', width: 16 },
      { header: 'Reference', key: 'reference', width: 22 },
      { header: 'Reason', key: 'reason', width: 30 },
    ];
    for (const r of rows) {
      ws.addRow({
        refundNo: r.refundNo,
        creditNote: r.creditNote?.invoiceNo ?? '',
        policyNo: r.creditNote?.policy?.policyNo ?? '',
        amount: this.num(r.amount),
        status: r.status,
        requestedAt: r.requestedAt,
        approvedAt: r.approvedAt ?? '',
        processedAt: r.processedAt ?? '',
        method: r.paymentMethod ?? '',
        bank: r.bank ?? '',
        reference: r.referenceNo ?? '',
        reason: r.reason ?? '',
      }).commit();
    }
    ws.commit();
    await wb.commit();
  }
}
