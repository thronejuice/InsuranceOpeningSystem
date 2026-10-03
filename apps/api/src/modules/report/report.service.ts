import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import type { JobQueryDto } from '../job/dto/job-query.dto.js';
import type { ListQuotationDto } from '../quotation/dto/list-quotation.dto.js';
import type { ListPolicyDto } from '../policy/dto/list-policy.dto.js';
import type { CommissionQueryDto } from '../commission/dto/commission-query.dto.js';
import type { RenewalQueryDto } from '../renewal/dto/renewal-query.dto.js';

const MONEY_FMT = '#,##0.00';
const DATE_FMT = 'dd/mm/yyyy';

@Injectable()
export class ReportService {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
  ) {}

  private get db() {
    return this.txHost.tx;
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
      deletedAt: null,
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
}
