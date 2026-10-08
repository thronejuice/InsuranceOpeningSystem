import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import { v4 as uuidv4 } from 'uuid';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import { PdfRendererService } from '../../common/pdf/pdf-renderer.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { StorageService } from '../../common/storage/storage.service.js';
import { CompanyProfileService } from '../company-profile/company-profile.service.js';
import { maskThaiId } from '../customer/domain/thai-id.validator.js';
import { HIDDEN_RISK_FIELD_TYPES, formatRiskValue } from './domain/proposal-format.js';
import { renderProposalFooter, renderProposalHtml, type ProposalDocumentData } from './domain/proposal-template.js';

type Tx = TransactionalAdapterPrisma<PrismaService>;

/**
 * Customer-facing proposal PDF. A DRAFT renders live with a watermark; on send the final PDF is
 * stored as a PROPOSAL Document on the job, and later downloads return that stored copy so the
 * customer and the system always refer to the same file.
 */
@Injectable()
export class ProposalDocumentService {
  constructor(
    private readonly txHost: TransactionHost<Tx>,
    private readonly pdf: PdfRendererService,
    private readonly storage: StorageService,
    private readonly companyProfile: CompanyProfileService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  private get db() { return this.txHost.tx; }

  static fileName(proposalNo: string) {
    return `${proposalNo}.pdf`;
  }

  /** GET /proposals/:id/pdf — stored copy once sent, otherwise rendered on the fly. */
  async download(proposalId: string): Promise<{ buffer: Buffer; fileName: string }> {
    const proposal = await this.db.proposal.findFirst({
      where: { id: proposalId },
      select: { id: true, proposalNo: true, status: true, jobId: true },
    });
    if (!proposal) throw new BusinessException('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
    await this.assertJobAccess(proposal.jobId);

    const fileName = ProposalDocumentService.fileName(proposal.proposalNo);
    if (proposal.status !== 'DRAFT') {
      const stored = await this.findStored(proposal.jobId, fileName);
      if (stored) {
        try {
          return { buffer: await this.storage.read(stored.storagePath), fileName };
        } catch {
          // Stored file missing (e.g. storage wiped) — fall through and re-render.
        }
      }
    }
    return { buffer: await this.render(proposalId), fileName };
  }

  /**
   * Final (non-draft) PDF for sending. Rendered before ProposalService opens its transaction so
   * the headless browser never holds a DB transaction open.
   */
  async renderFinal(proposalId: string): Promise<Buffer> {
    const proposal = await this.db.proposal.findFirst({ where: { id: proposalId }, select: { jobId: true } });
    if (!proposal) throw new BusinessException('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
    await this.assertJobAccess(proposal.jobId);
    return this.render(proposalId, { forceFinal: true });
  }

  /**
   * Attaches the final PDF to the job as a PROPOSAL document. Called inside ProposalService's
   * send transaction, so the Document row rolls back with the status change.
   */
  async storeFinal(proposalId: string, buffer: Buffer): Promise<void> {
    const proposal = await this.db.proposal.findFirstOrThrow({
      where: { id: proposalId },
      select: { proposalNo: true, jobId: true },
    });
    const fileName = ProposalDocumentService.fileName(proposal.proposalNo);
    const storedName = `${uuidv4()}.pdf`;
    const now = new Date();
    const storagePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${proposal.jobId}/${storedName}`;
    await this.storage.save(storagePath, buffer);

    // A re-sent proposal (should not happen today) keeps one active copy: retire older ones.
    await this.db.document.updateMany({
      where: { jobId: proposal.jobId, documentType: 'PROPOSAL', originalName: fileName, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    const userId = this.cls.get('userId');
    await this.db.document.create({
      data: {
        job: { connect: { id: proposal.jobId } },
        documentType: 'PROPOSAL',
        originalName: fileName,
        storedName,
        mimeType: 'application/pdf',
        size: buffer.length,
        storagePath,
        uploadedBy: userId ? { connect: { id: userId } } : undefined,
      },
    });
  }

  private findStored(jobId: string, fileName: string) {
    return this.db.document.findFirst({
      where: { jobId, documentType: 'PROPOSAL', originalName: fileName, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { storagePath: true },
    });
  }

  private async render(proposalId: string, opts: { forceFinal?: boolean } = {}): Promise<Buffer> {
    const data = await this.buildData(proposalId, opts.forceFinal ?? false);
    const html = renderProposalHtml(data, this.pdf.sarabunFontCss);
    return this.pdf.render(html, { footerTemplate: renderProposalFooter(data.proposal.proposalNo, data.proposal.version) });
  }

  async buildData(proposalId: string, forceFinal = false): Promise<ProposalDocumentData> {
    const p = await this.db.proposal.findFirst({
      where: { id: proposalId },
      include: {
        paymentTerm: true,
        customer: {
          include: {
            addresses: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
            contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
          },
        },
        job: {
          include: {
            insuranceType: true,
            product: { include: { riskFields: { where: { active: true }, orderBy: { sortOrder: 'asc' } } } },
            agent: { select: { fullName: true, email: true } },
            risk: { include: { values: true } },
          },
        },
        quotation: {
          include: { insuranceCompany: true, items: { orderBy: { createdAt: 'asc' } } },
        },
      },
    });
    if (!p) throw new BusinessException('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);

    const profile = await this.companyProfile.load();
    const logo = await this.companyProfile.readLogo(profile);

    const cust = p.customer;
    const isCorporate = cust.customerType === 'CORPORATE';
    const customerName = isCorporate
      ? cust.companyName ?? ''
      : `${cust.firstName ?? ''} ${cust.lastName ?? ''}`.trim() || (cust.companyName ?? '');
    const rawId = cust.taxId ?? cust.citizenId;
    const canSeeId = (this.cls.get('permissions') ?? []).includes('customer.view_sensitive');
    const address = cust.addresses[0];
    const contact = cust.contacts[0];

    const riskValues = new Map((p.job.risk?.values ?? []).map((v) => [v.fieldCode, v.fieldValue]));
    const risks = p.job.product.riskFields
      .filter((f) => !HIDDEN_RISK_FIELD_TYPES.has(f.fieldType))
      .map((f) => ({ label: f.fieldName, value: formatRiskValue(f.fieldType, riskValues.get(f.fieldCode)) }));

    const q = p.quotation;
    const totalAmount = Number(q.totalAmount);
    let paymentTermData: ProposalDocumentData['paymentTerm'] = null;

    if (p.paymentTerm) {
      const installments = Math.max(1, p.paymentTerm.installments);
      const intervalMonths = p.paymentTerm.intervalMonths;
      const firstDueDays = p.paymentTerm.firstDueDays;

      const baseDate = p.proposalDate ?? p.createdAt;
      const firstDueDate = new Date(baseDate);
      firstDueDate.setDate(firstDueDate.getDate() + firstDueDays);

      const schedule: Array<{ installmentNo: number; dueDate: Date | null; amount: string }> = [];
      const baseInstallmentAmount = Math.floor((totalAmount / installments) * 100) / 100;
      let runningSum = 0;

      for (let i = 1; i <= installments; i++) {
        let dueDate: Date | null = null;
        if (i === 1) {
          dueDate = new Date(firstDueDate);
        } else {
          dueDate = new Date(firstDueDate);
          dueDate.setMonth(dueDate.getMonth() + (i - 1) * intervalMonths);
        }

        let amount: number;
        if (i === installments) {
          amount = Math.round((totalAmount - runningSum) * 100) / 100;
        } else {
          amount = baseInstallmentAmount;
          runningSum += amount;
        }

        schedule.push({
          installmentNo: i,
          dueDate,
          amount: amount.toFixed(2),
        });
      }

      paymentTermData = {
        name: p.paymentTerm.name,
        code: p.paymentTerm.code,
        description: p.paymentTerm.description,
        installments: p.paymentTerm.installments,
        intervalMonths: p.paymentTerm.intervalMonths,
        firstDueDays: p.paymentTerm.firstDueDays,
        schedule,
      };
    }

    const terms = (profile.proposalTerms ?? '')
      .split(/\r?\n/)
      .map((t) => t.trim())
      .filter(Boolean);

    return {
      company: {
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
      },
      proposal: {
        proposalNo: p.proposalNo,
        version: p.version,
        proposalDate: p.proposalDate ?? p.createdAt,
        validUntil: p.validUntil,
        remark: p.remark,
        isDraft: !forceFinal && p.status === 'DRAFT',
      },
      paymentTerm: paymentTermData,
      jobNo: p.job.jobNo,
      customer: {
        name: customerName,
        customerCode: cust.customerCode,
        idLabel: isCorporate ? 'เลขประจำตัวผู้เสียภาษี / Tax ID' : 'เลขประจำตัวประชาชน / ID No.',
        idNo: rawId ? (canSeeId ? rawId : maskThaiId(rawId)) : null,
        address: address
          ? [address.addressLine, address.subDistrict, address.district, address.province, address.postalCode]
            .filter(Boolean)
            .join(' ')
          : null,
        contactName: isCorporate ? contact?.contactName ?? null : null,
        phone: (isCorporate ? contact?.mobile ?? contact?.phone : null) ?? cust.mobile ?? cust.phone,
        email: (isCorporate ? contact?.email : null) ?? cust.email,
      },
      insurance: {
        insuranceTypeName: p.job.insuranceType.name,
        productName: p.job.product.name,
        insurerName: q.insuranceCompany.name,
        quotationNo: q.quotationNo,
        effectiveDate: p.job.effectiveDate,
        expiryDate: p.job.expiryDate,
      },
      risks,
      coverages: q.items.map((it) => ({
        name: it.coverageName,
        sumInsured: it.sumInsured.toString(),
        rate: it.rate?.toString() ?? null,
        deductible: it.deductible?.toString() ?? null,
        premium: it.premium.toString(),
        remark: it.remark,
      })),
      premium: {
        gross: q.grossPremium.toString(),
        discount: q.discount.toString(),
        net: q.netPremium.toString(),
        stampDuty: q.stampDuty.toString(),
        vat: q.tax.toString(),
        total: q.totalAmount.toString(),
      },
      terms,
      bankAccounts: profile.bankAccounts,
      agent: { name: p.job.agent.fullName, email: p.job.agent.email },
    };
  }

  /** BR-014: same rule as ProposalService — agents only see their own / assigned jobs. */
  private async assertJobAccess(jobId: string) {
    const userId = this.cls.get('userId')!;
    const permissions = this.cls.get('permissions') ?? [];
    const job = await this.db.job.findFirst({ where: { id: jobId, deletedAt: null }, select: { agentId: true, assignedTo: true } });
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);
    if (!permissions.includes('job.view_all') && job.agentId !== userId && job.assignedTo !== userId) {
      throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    }
  }
}
