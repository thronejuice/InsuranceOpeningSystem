import { Injectable } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import { v4 as uuidv4 } from 'uuid';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { StorageService } from '../../common/storage/storage.service.js';
import { validateFile } from '../document/domain/file-validator.js';
import type { BankAccount, CompanyProfileResponse, UpdateCompanyProfileDto } from './dto/company-profile.dto.js';

const PROFILE_ID = 'default';
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Printed until an admin edits the terms — typical wording on Thai broker proposals. */
export const DEFAULT_PROPOSAL_TERMS = [
  'เบี้ยประกันภัยและเงื่อนไขความคุ้มครองเป็นไปตามที่บริษัทประกันภัยพิจารณารับประกัน / Premium and coverage are subject to the insurer\'s final underwriting.',
  'ความคุ้มครอง เงื่อนไข และข้อยกเว้นเป็นไปตามกรมธรรม์ที่บริษัทประกันภัยออกให้ / Coverage, conditions and exclusions are as stated in the policy issued by the insurer.',
  'ข้อเสนอนี้มีผลถึงวันที่ยืนราคาที่ระบุไว้ข้างต้น / This proposal is valid until the date stated above.',
  'ความคุ้มครองจะเริ่มเมื่อบริษัทประกันภัยตอบรับการประกันภัยและได้รับชำระเบี้ยประกันภัยแล้ว / Cover commences once accepted by the insurer and the premium is paid.',
].join('\n');

export interface CompanyProfileData {
  nameTh: string;
  nameEn: string | null;
  addressTh: string | null;
  addressEn: string | null;
  taxId: string | null;
  brokerLicenseNo: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  proposalTerms: string | null;
  bankAccounts: BankAccount[];
  logoPath: string | null;
  logoMimeType: string | null;
  configured: boolean;
  updatedAt: Date | null;
}

const EMPTY_PROFILE: CompanyProfileData = {
  nameTh: '',
  nameEn: null,
  addressTh: null,
  addressEn: null,
  taxId: null,
  brokerLicenseNo: null,
  phone: null,
  email: null,
  website: null,
  proposalTerms: DEFAULT_PROPOSAL_TERMS,
  bankAccounts: [],
  logoPath: null,
  logoMimeType: null,
  configured: false,
  updatedAt: null,
};

function toResponse(p: CompanyProfileData): CompanyProfileResponse {
  return {
    nameTh: p.nameTh,
    nameEn: p.nameEn,
    addressTh: p.addressTh,
    addressEn: p.addressEn,
    taxId: p.taxId,
    brokerLicenseNo: p.brokerLicenseNo,
    phone: p.phone,
    email: p.email,
    website: p.website,
    proposalTerms: p.proposalTerms,
    bankAccounts: p.bankAccounts,
    hasLogo: !!p.logoPath,
    configured: p.configured,
    updatedAt: p.updatedAt?.toISOString() ?? null,
  };
}

const emptyToNull = (v: string | undefined) => (v?.trim() ? v.trim() : null);

@Injectable()
export class CompanyProfileService {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  private get db() { return this.txHost.tx; }

  /** Letterhead data used by the proposal PDF; falls back to an empty profile with default terms. */
  async load(): Promise<CompanyProfileData> {
    const row = await this.db.companyProfile.findUnique({ where: { id: PROFILE_ID } });
    if (!row) return EMPTY_PROFILE;
    return {
      nameTh: row.nameTh,
      nameEn: row.nameEn,
      addressTh: row.addressTh,
      addressEn: row.addressEn,
      taxId: row.taxId,
      brokerLicenseNo: row.brokerLicenseNo,
      phone: row.phone,
      email: row.email,
      website: row.website,
      proposalTerms: row.proposalTerms,
      bankAccounts: (row.bankAccounts as unknown as BankAccount[]) ?? [],
      logoPath: row.logoPath,
      logoMimeType: row.logoMimeType,
      configured: true,
      updatedAt: row.updatedAt,
    };
  }

  async get(): Promise<CompanyProfileResponse> {
    return toResponse(await this.load());
  }

  @Transactional()
  async update(dto: UpdateCompanyProfileDto): Promise<CompanyProfileResponse> {
    const before = await this.load();
    const data = {
      nameTh: dto.nameTh.trim(),
      nameEn: emptyToNull(dto.nameEn),
      addressTh: emptyToNull(dto.addressTh),
      addressEn: emptyToNull(dto.addressEn),
      taxId: emptyToNull(dto.taxId),
      brokerLicenseNo: emptyToNull(dto.brokerLicenseNo),
      phone: emptyToNull(dto.phone),
      email: emptyToNull(dto.email),
      website: emptyToNull(dto.website),
      proposalTerms: emptyToNull(dto.proposalTerms),
      bankAccounts: dto.bankAccounts.map((a) => ({
        bankName: a.bankName.trim(),
        ...(a.branch?.trim() && { branch: a.branch.trim() }),
        accountName: a.accountName.trim(),
        accountNo: a.accountNo.trim(),
      })) as unknown as Prisma.InputJsonValue,
      updatedById: this.cls.get('userId') ?? null,
    };
    await this.db.companyProfile.upsert({
      where: { id: PROFILE_ID },
      create: { id: PROFILE_ID, ...data },
      update: data,
    });
    await this.audit.log({
      action: 'UPDATE_COMPANY_PROFILE',
      entityType: 'COMPANY_PROFILE',
      entityId: PROFILE_ID,
      oldValue: before.configured ? { ...before, logoPath: undefined } : undefined,
      newValue: data,
    });
    return this.get();
  }

  @Transactional()
  async uploadLogo(file: Express.Multer.File): Promise<CompanyProfileResponse> {
    const current = await this.load();
    if (!current.configured) {
      throw new BusinessException('COMPANY_PROFILE_NOT_CONFIGURED', 'Save the company profile before uploading a logo', 422);
    }
    if (file.buffer.length > LOGO_MAX_BYTES) {
      throw new BusinessException('INVALID_FILE', 'Logo must be 2 MB or smaller', 422);
    }
    const validation = await validateFile(file.originalname, file.buffer);
    if (!validation.ok || !validation.mime.startsWith('image/')) {
      throw new BusinessException('INVALID_FILE', validation.ok ? 'Logo must be a PNG or JPG image' : validation.reason, 422);
    }

    const logoPath = `company/logo-${uuidv4()}.${validation.ext}`;
    await this.storage.save(logoPath, file.buffer);
    await this.db.companyProfile.update({
      where: { id: PROFILE_ID },
      data: { logoPath, logoMimeType: validation.mime, updatedById: this.cls.get('userId') ?? null },
    });
    await this.audit.log({ action: 'UPLOAD_COMPANY_LOGO', entityType: 'COMPANY_PROFILE', entityId: PROFILE_ID });
    return this.get();
  }

  @Transactional()
  async removeLogo(): Promise<CompanyProfileResponse> {
    const current = await this.load();
    if (current.logoPath) {
      await this.db.companyProfile.update({
        where: { id: PROFILE_ID },
        data: { logoPath: null, logoMimeType: null, updatedById: this.cls.get('userId') ?? null },
      });
      await this.audit.log({ action: 'REMOVE_COMPANY_LOGO', entityType: 'COMPANY_PROFILE', entityId: PROFILE_ID });
    }
    return this.get();
  }

  /** Logo bytes for the settings page and the PDF; null when none is set. */
  async readLogo(profile?: CompanyProfileData): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const p = profile ?? (await this.load());
    if (!p.logoPath || !p.logoMimeType) return null;
    try {
      return { buffer: await this.storage.read(p.logoPath), mimeType: p.logoMimeType };
    } catch {
      return null;
    }
  }
}
