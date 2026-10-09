import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { Decimal } from 'decimal.js';
import { ClsService } from 'nestjs-cls';
import { DataScopeService } from '../../common/access/data-scope.service.js';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import { renderDocumentFooter, type LetterheadCompany } from '../../common/pdf/document-parts.js';
import { PdfRendererService } from '../../common/pdf/pdf-renderer.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { CompanyProfileService } from '../company-profile/company-profile.service.js';
import { maskThaiId } from '../customer/domain/thai-id.validator.js';
import {
  renderInvoiceHtml,
  renderReceiptHtml,
  type BillingCustomer,
  type InvoiceDocumentData,
  type ReceiptDocumentData,
} from './domain/billing-template.js';
import { outstandingAmount } from './domain/invoice-status.js';
import { InvoiceRepository } from './invoice.repository.js';

type Tx = TransactionalAdapterPrisma<PrismaService>;

const CUSTOMER_INCLUDE = {
  addresses: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
  contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
} satisfies Prisma.CustomerInclude;

/**
 * Invoice / Debit Note / Credit Note / Receipt PDFs. Rendered from the database on every request —
 * not stored — so the printed numbers can never drift from what the system holds, and a cancelled
 * invoice or voided receipt is always watermarked as such.
 */
@Injectable()
export class BillingDocumentService {
  constructor(
    private readonly txHost: TransactionHost<Tx>,
    private readonly repo: InvoiceRepository,
    private readonly pdf: PdfRendererService,
    private readonly companyProfile: CompanyProfileService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly scope: DataScopeService,
  ) {}

  private get db() {
    return this.txHost.tx;
  }

  /** GET /invoices/:id/pdf */
  async invoicePdf(id: string, now: Date = new Date()): Promise<{ buffer: Buffer; fileName: string }> {
    const data = await this.buildInvoiceData(id, now);
    const html = renderInvoiceHtml(data, this.pdf.sarabunFontCss);
    const buffer = await this.pdf.render(html, { footerTemplate: renderDocumentFooter(data.invoice.invoiceNo) });
    return { buffer, fileName: `${data.invoice.invoiceNo}.pdf` };
  }

  /** GET /receipts/:id/pdf */
  async receiptPdf(id: string): Promise<{ buffer: Buffer; fileName: string }> {
    const data = await this.buildReceiptData(id);
    const html = renderReceiptHtml(data, this.pdf.sarabunFontCss);
    const buffer = await this.pdf.render(html, { footerTemplate: renderDocumentFooter(data.receipt.receiptNo) });
    return { buffer, fileName: `${data.receipt.receiptNo}.pdf` };
  }

  async buildInvoiceData(id: string, _now: Date = new Date()): Promise<InvoiceDocumentData> {
    const inv = await this.db.invoice.findFirst({
      where: { id, policy: { job: { deletedAt: null, ...this.scope.jobViewScope() } } },
      include: {
        customer: { include: CUSTOMER_INCLUDE },
        policy: { include: { insuranceCompany: true, job: { include: { product: true } } } },
      },
    });
    if (!inv) throw new BusinessException('INVOICE_NOT_FOUND', 'Invoice not found', 404);

    const paid = (await this.repo.sumActivePayments([inv.id])).get(inv.id) ?? '0';
    const installmentTotal = await this.installmentTotal(inv.policyId);

    return {
      company: await this.company(),
      kind: inv.type,
      invoice: {
        invoiceNo: inv.invoiceNo,
        issueDate: inv.createdAt,
        dueDate: inv.dueDate,
        installmentNo: inv.installmentNo,
        installmentTotal,
        status: inv.status,
      },
      policy: {
        policyNo: inv.policy.policyNo,
        jobNo: inv.policy.job.jobNo,
        insurerName: inv.policy.insuranceCompany.name,
        productName: inv.policy.job.product.name,
        effectiveDate: inv.policy.effectiveDate,
        expiryDate: inv.policy.expiryDate,
      },
      customer: this.customerBlock(inv.customer),
      amounts: {
        net: inv.netAmount.toString(),
        stampDuty: inv.stampDuty.toString(),
        vat: inv.vat.toString(),
        total: inv.amount.toString(),
      },
      paid: new Decimal(paid).toFixed(2),
      outstanding: outstandingAmount(inv.amount.toString(), paid).toFixed(2),
      bankAccounts: (await this.companyProfile.load()).bankAccounts,
    };
  }

  async buildReceiptData(id: string): Promise<ReceiptDocumentData> {
    const receipt = await this.db.receipt.findFirst({
      where: { id, payment: { policy: { job: { deletedAt: null, ...this.scope.jobViewScope() } } } },
      include: {
        payment: {
          include: {
            createdBy: { select: { fullName: true } },
            policy: { include: { insuranceCompany: true, job: { include: { product: true } } } },
          },
        },
        invoice: { include: { customer: { include: CUSTOMER_INCLUDE } } },
      },
    });
    if (!receipt) throw new BusinessException('RECEIPT_NOT_FOUND', 'Receipt not found', 404);

    const { payment, invoice } = receipt;
    const isVoid = receipt.status === 'VOID';

    // Balance as it stood when this payment was taken, so reprinting an old receipt never changes it.
    let paidToDate = new Decimal(0);
    if (!isVoid) {
      const sum = await this.db.payment.aggregate({
        where: {
          invoiceId: invoice.id,
          status: 'ACTIVE',
          OR: [
            { createdAt: { lt: payment.createdAt } },
            { createdAt: payment.createdAt, id: { lte: payment.id } },
          ],
        },
        _sum: { amount: true },
      });
      paidToDate = new Decimal((sum._sum.amount ?? 0).toString());
    }

    return {
      company: await this.company(),
      receipt: {
        receiptNo: receipt.receiptNo,
        issuedAt: receipt.issuedAt,
        status: receipt.status,
        voidedAt: receipt.voidedAt,
        voidReason: receipt.voidReason,
      },
      payment: {
        paymentNo: payment.paymentNo,
        paymentDate: payment.paymentDate,
        method: payment.paymentMethod,
        bank: payment.bank,
        referenceNo: payment.referenceNo,
        remark: payment.remark,
        recordedBy: payment.createdBy?.fullName ?? null,
      },
      invoice: {
        invoiceNo: invoice.invoiceNo,
        installmentNo: invoice.installmentNo,
        installmentTotal: await this.installmentTotal(invoice.policyId),
        amount: invoice.amount.toString(),
        paidToDate: paidToDate.toFixed(2),
        balance: outstandingAmount(invoice.amount.toString(), paidToDate).toFixed(2),
      },
      policy: {
        policyNo: payment.policy.policyNo,
        insurerName: payment.policy.insuranceCompany.name,
        productName: payment.policy.job.product.name,
      },
      customer: this.customerBlock(invoice.customer),
      amount: receipt.amount.toString(),
    };
  }

  private async installmentTotal(policyId: string): Promise<number> {
    const agg = await this.db.invoice.aggregate({
      where: { policyId, type: 'INVOICE' },
      _max: { installmentNo: true },
    });
    return agg._max.installmentNo ?? 1;
  }

  private async company(): Promise<LetterheadCompany> {
    const profile = await this.companyProfile.load();
    const logo = await this.companyProfile.readLogo(profile);
    return {
      nameTh: profile.nameTh,
      nameEn: profile.nameEn,
      addressTh: profile.addressTh,
      addressEn: profile.addressEn,
      taxId: profile.taxId,
      brokerLicenseNo: profile.brokerLicenseNo,
      phone: profile.phone,
      email: profile.email,
      website: profile.website,
      logoDataUri: logo ? `data:${logo.mimeType};base64,${logo.buffer.toString('base64')}` : null,
    };
  }

  /** Same masking rule as the proposal PDF: full ID only for users with customer.view_sensitive. */
  private customerBlock(c: {
    customerType: string;
    customerCode: string;
    companyName: string | null;
    firstName: string | null;
    lastName: string | null;
    taxId: string | null;
    citizenId: string | null;
    phone: string | null;
    mobile: string | null;
    email: string | null;
    addresses: { addressLine: string | null; subDistrict: string | null; district: string | null; province: string | null; postalCode: string | null }[];
  }): BillingCustomer {
    const isCorporate = c.customerType === 'CORPORATE';
    const name = isCorporate
      ? c.companyName ?? ''
      : `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || (c.companyName ?? '');
    const rawId = c.taxId ?? c.citizenId;
    const canSeeId = (this.cls.get('permissions') ?? []).includes('customer.view_sensitive');
    const a = c.addresses[0];
    return {
      name,
      customerCode: c.customerCode,
      idLabel: isCorporate ? 'เลขประจำตัวผู้เสียภาษี / Tax ID' : 'เลขประจำตัวประชาชน / ID No.',
      idNo: rawId ? (canSeeId ? rawId : maskThaiId(rawId)) : null,
      address: a ? [a.addressLine, a.subDistrict, a.district, a.province, a.postalCode].filter(Boolean).join(' ') : null,
      phone: c.mobile ?? c.phone,
      email: c.email,
    };
  }
}
