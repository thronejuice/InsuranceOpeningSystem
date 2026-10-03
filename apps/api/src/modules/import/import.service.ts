import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import ExcelJS from 'exceljs';

export interface RowError {
  row: number;
  field?: string;
  message: string;
}

export interface ImportResult {
  importedCount: number;
  errors: RowError[];
}

@Injectable()
export class ImportService {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly sequence: SequenceService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  private get db() {
    return this.txHost.tx;
  }

  private str(cell: ExcelJS.Cell): string {
    return cell.text?.toString().trim() ?? '';
  }

  private reqStr(cells: ExcelJS.Row, col: number, rowIdx: number, name: string, errors: RowError[]): string {
    const v = (cells.getCell(col).text ?? '').toString().trim();
    if (!v) errors.push({ row: rowIdx, field: name, message: `Missing ${name}` });
    return v;
  }

  // ─── Customer Import ──────────────────────────────────────────────────────

  @Transactional()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async importCustomers(buffer: any, dryRun: boolean): Promise<ImportResult> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const ws = wb.worksheets[0];
    if (!ws) throw new BusinessException('IMPORT_INVALID_FILE', 'No worksheet found', 422);

    const errors: RowError[] = [];
    const rows: { customerCode: string; customerType: string; firstName?: string; lastName?: string; companyName?: string; taxId?: string; citizenId?: string; phone?: string; mobile?: string; email?: string; remark?: string }[] = [];

    const VALID_TYPES = new Set(['INDIVIDUAL', 'CORPORATE']);

    ws.eachRow((row, idx) => {
      if (idx === 1) return; // header

      const customerType = this.str(row.getCell(1)).toUpperCase();
      const firstName    = this.str(row.getCell(2));
      const lastName     = this.str(row.getCell(3));
      const companyName  = this.str(row.getCell(4));
      const taxId        = this.str(row.getCell(5));
      const citizenId    = this.str(row.getCell(6));
      const phone        = this.str(row.getCell(7));
      const mobile       = this.str(row.getCell(8));
      const email        = this.str(row.getCell(9));
      const remark       = this.str(row.getCell(10));

      if (!customerType && !firstName && !companyName) return; // blank row

      if (!VALID_TYPES.has(customerType)) {
        errors.push({ row: idx, field: 'customerType', message: `Invalid Customer Type: "${customerType}"` });
      }
      if (customerType === 'INDIVIDUAL' && !firstName) {
        errors.push({ row: idx, field: 'firstName', message: 'Missing First Name for INDIVIDUAL' });
      }
      if (customerType === 'CORPORATE' && !companyName) {
        errors.push({ row: idx, field: 'companyName', message: 'Missing Company Name for CORPORATE' });
      }

      rows.push({ customerCode: '', customerType, firstName: firstName || undefined, lastName: lastName || undefined, companyName: companyName || undefined, taxId: taxId || undefined, citizenId: citizenId || undefined, phone: phone || undefined, mobile: mobile || undefined, email: email || undefined, remark: remark || undefined });
    });

    if (errors.length > 0 || dryRun) return { importedCount: dryRun ? 0 : 0, errors };

    const userId = this.cls.get('userId')!;
    let count = 0;
    for (const r of rows) {
      const customerCode = await this.sequence.next('CUSTOMER');
      await this.db.customer.create({
        data: {
          customerCode,
          customerType: r.customerType as never,
          firstName: r.firstName,
          lastName: r.lastName,
          companyName: r.companyName,
          taxId: r.taxId,
          citizenId: r.citizenId,
          phone: r.phone,
          mobile: r.mobile,
          email: r.email,
          remark: r.remark,
          createdById: userId,
        },
      });
      count++;
    }

    return { importedCount: count, errors: [] };
  }

  // ─── Customer Address Import ───────────────────────────────────────────────

  @Transactional()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async importCustomerAddresses(buffer: any, dryRun: boolean): Promise<ImportResult> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const ws = wb.worksheets[0];
    if (!ws) throw new BusinessException('IMPORT_INVALID_FILE', 'No worksheet found', 422);

    const errors: RowError[] = [];
    const VALID_TYPES = new Set(['HOME', 'OFFICE', 'BILLING', 'SHIPPING', 'OTHER']);
    type AddressRow = { customerId: string; addressType: string; addressLine: string; subDistrict?: string; district?: string; province?: string; postalCode?: string; isPrimary: boolean };
    const rows: AddressRow[] = [];

    ws.eachRow((row, idx) => {
      if (idx === 1) return;

      const customerCode = this.str(row.getCell(1));
      const addressType  = this.str(row.getCell(2)).toUpperCase();
      const addressLine  = this.str(row.getCell(3));
      const subDistrict  = this.str(row.getCell(4));
      const district     = this.str(row.getCell(5));
      const province     = this.str(row.getCell(6));
      const postalCode   = this.str(row.getCell(7));
      const isPrimary    = this.str(row.getCell(8)).toUpperCase() === 'TRUE';

      if (!customerCode && !addressLine) return;

      if (!customerCode) errors.push({ row: idx, field: 'customerCode', message: 'Missing Customer Code' });
      if (!VALID_TYPES.has(addressType)) errors.push({ row: idx, field: 'addressType', message: `Invalid Address Type: "${addressType}"` });
      if (!addressLine) errors.push({ row: idx, field: 'addressLine', message: 'Missing Address Line' });

      rows.push({ customerId: customerCode, addressType, addressLine, subDistrict: subDistrict || undefined, district: district || undefined, province: province || undefined, postalCode: postalCode || undefined, isPrimary });
    });

    if (errors.length > 0 || dryRun) return { importedCount: 0, errors };

    let count = 0;
    for (const r of rows) {
      const customer = await this.db.customer.findFirst({ where: { customerCode: r.customerId, deletedAt: null } });
      if (!customer) {
        errors.push({ row: count + 2, message: `Customer not found: "${r.customerId}"` });
        continue;
      }
      await this.db.customerAddress.create({
        data: {
          customerId: customer.id,
          addressType: r.addressType as never,
          addressLine: r.addressLine,
          subDistrict: r.subDistrict,
          district: r.district,
          province: r.province,
          postalCode: r.postalCode,
          isPrimary: r.isPrimary,
        },
      });
      count++;
    }

    if (errors.length > 0) {
      throw new BusinessException('IMPORT_PARTIAL_FAILURE', 'Some addresses could not be imported', 422);
    }

    return { importedCount: count, errors: [] };
  }

  // ─── Job Import (with Motor Risk values) ─────────────────────────────────

  @Transactional()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async importJobs(buffer: any, dryRun: boolean): Promise<ImportResult> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const ws = wb.worksheets[0];
    if (!ws) throw new BusinessException('IMPORT_INVALID_FILE', 'No worksheet found', 422);

    const errors: RowError[] = [];
    const VALID_PRIORITIES = new Set(['NORMAL', 'HIGH', 'LOW']);

    type JobRow = {
      customerCode: string; insuranceTypeCode: string; productCode: string;
      agentUsername: string; priority: string; effectiveDate: string; expiryDate?: string;
      source?: string; remark?: string;
      // Motor risk fields
      regNo?: string; brand?: string; model?: string; year?: string; cc?: string;
    };
    const rows: JobRow[] = [];

    ws.eachRow((row, idx) => {
      if (idx === 1) return;

      const customerCode      = this.str(row.getCell(1));
      const insuranceTypeCode = this.str(row.getCell(2));
      const productCode       = this.str(row.getCell(3));
      const agentUsername     = this.str(row.getCell(4));
      const priority          = (this.str(row.getCell(5)) || 'NORMAL').toUpperCase();
      const effectiveDate     = this.str(row.getCell(6));
      const expiryDate        = this.str(row.getCell(7));
      const source            = this.str(row.getCell(8));
      const remark            = this.str(row.getCell(9));
      // Motor risk (columns 10–14)
      const regNo  = this.str(row.getCell(10));
      const brand  = this.str(row.getCell(11));
      const model  = this.str(row.getCell(12));
      const year   = this.str(row.getCell(13));
      const cc     = this.str(row.getCell(14));

      if (!customerCode && !insuranceTypeCode) return;

      if (!customerCode) errors.push({ row: idx, field: 'customerCode', message: 'Missing Customer Code' });
      if (!insuranceTypeCode) errors.push({ row: idx, field: 'insuranceTypeCode', message: 'Missing Insurance Type' });
      if (!productCode) errors.push({ row: idx, field: 'productCode', message: 'Missing Product Code' });
      if (!agentUsername) errors.push({ row: idx, field: 'agentUsername', message: 'Missing Agent Username' });
      if (!VALID_PRIORITIES.has(priority)) errors.push({ row: idx, field: 'priority', message: `Invalid Priority: "${priority}"` });
      if (!effectiveDate) {
        errors.push({ row: idx, field: 'effectiveDate', message: 'Missing Effective Date' });
      } else if (isNaN(Date.parse(effectiveDate))) {
        errors.push({ row: idx, field: 'effectiveDate', message: `Invalid Effective Date: "${effectiveDate}"` });
      }

      rows.push({ customerCode, insuranceTypeCode, productCode, agentUsername, priority, effectiveDate, expiryDate: expiryDate || undefined, source: source || undefined, remark: remark || undefined, regNo: regNo || undefined, brand: brand || undefined, model: model || undefined, year: year || undefined, cc: cc || undefined });
    });

    if (errors.length > 0 || dryRun) return { importedCount: 0, errors };

    const userId = this.cls.get('userId')!;
    let count = 0;

    for (const r of rows) {
      const [customer, insuranceType, product, agent] = await Promise.all([
        this.db.customer.findFirst({ where: { customerCode: r.customerCode, deletedAt: null } }),
        this.db.insuranceType.findFirst({ where: { code: r.insuranceTypeCode } }),
        this.db.insuranceProduct.findFirst({ where: { code: r.productCode } }),
        this.db.user.findFirst({ where: { username: r.agentUsername } }),
      ]);

      const refErrors: RowError[] = [];
      if (!customer)      refErrors.push({ row: count + 2, message: `Customer not found: "${r.customerCode}"` });
      if (!insuranceType) refErrors.push({ row: count + 2, message: `Insurance Type not found: "${r.insuranceTypeCode}"` });
      if (!product)       refErrors.push({ row: count + 2, message: `Product not found: "${r.productCode}"` });
      if (!agent)         refErrors.push({ row: count + 2, message: `Agent not found: "${r.agentUsername}"` });

      if (refErrors.length > 0) {
        errors.push(...refErrors);
        continue;
      }

      const jobNo = await this.sequence.next('JOB');
      const job = await this.db.job.create({
        data: {
          jobNo,
          customerId: customer!.id,
          insuranceTypeId: insuranceType!.id,
          productId: product!.id,
          agentId: agent!.id,
          priority: r.priority as never,
          effectiveDate: new Date(r.effectiveDate),
          expiryDate: r.expiryDate ? new Date(r.expiryDate) : null,
          source: r.source,
          remark: r.remark,
          createdById: userId,
        },
      });

      // Motor risk values if any motor-risk columns provided
      if (r.regNo || r.brand || r.model || r.year || r.cc) {
        const jobRisk = await this.db.jobRisk.create({ data: { jobId: job.id } });
        const motorValues: { fieldCode: string; fieldValue: string }[] = [];
        if (r.regNo)  motorValues.push({ fieldCode: 'REG_NO',    fieldValue: r.regNo });
        if (r.brand)  motorValues.push({ fieldCode: 'BRAND',     fieldValue: r.brand });
        if (r.model)  motorValues.push({ fieldCode: 'MODEL',     fieldValue: r.model });
        if (r.year)   motorValues.push({ fieldCode: 'YEAR',      fieldValue: r.year });
        if (r.cc)     motorValues.push({ fieldCode: 'ENGINE_CC', fieldValue: r.cc });
        await this.db.jobRiskValue.createMany({
          data: motorValues.map((v) => ({ ...v, jobRiskId: jobRisk.id })),
        });
      }

      count++;
    }

    if (errors.length > 0) {
      throw new BusinessException('IMPORT_REF_FAILURE', 'Some rows could not be imported due to invalid references', 422);
    }

    return { importedCount: count, errors: [] };
  }

  // ─── Template generation ──────────────────────────────────────────────────

  async buildTemplate(type: 'customers' | 'customer-addresses' | 'jobs'): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'InsuranceOpening System';

    if (type === 'customers') {
      const ws = wb.addWorksheet('Customers');
      ws.columns = [
        { header: 'Customer Type *\n(INDIVIDUAL/CORPORATE)', key: 'customerType', width: 28 },
        { header: 'First Name', key: 'firstName', width: 20 },
        { header: 'Last Name', key: 'lastName', width: 20 },
        { header: 'Company Name', key: 'companyName', width: 30 },
        { header: 'Tax ID', key: 'taxId', width: 16 },
        { header: 'Citizen ID', key: 'citizenId', width: 16 },
        { header: 'Phone', key: 'phone', width: 14 },
        { header: 'Mobile', key: 'mobile', width: 14 },
        { header: 'Email', key: 'email', width: 24 },
        { header: 'Remark', key: 'remark', width: 30 },
      ];
    } else if (type === 'customer-addresses') {
      const ws = wb.addWorksheet('Customer Addresses');
      ws.columns = [
        { header: 'Customer Code *', key: 'customerCode', width: 20 },
        { header: 'Address Type *\n(HOME/OFFICE/BILLING/SHIPPING/OTHER)', key: 'addressType', width: 36 },
        { header: 'Address Line *', key: 'addressLine', width: 40 },
        { header: 'Sub-district', key: 'subDistrict', width: 18 },
        { header: 'District', key: 'district', width: 18 },
        { header: 'Province', key: 'province', width: 18 },
        { header: 'Postal Code', key: 'postalCode', width: 12 },
        { header: 'Is Primary (TRUE/FALSE)', key: 'isPrimary', width: 22 },
      ];
    } else {
      const ws = wb.addWorksheet('Jobs');
      ws.columns = [
        { header: 'Customer Code *', key: 'customerCode', width: 18 },
        { header: 'Insurance Type Code *', key: 'insuranceTypeCode', width: 22 },
        { header: 'Product Code *', key: 'productCode', width: 18 },
        { header: 'Agent Username *', key: 'agentUsername', width: 20 },
        { header: 'Priority\n(NORMAL/HIGH/LOW)', key: 'priority', width: 22 },
        { header: 'Effective Date * (YYYY-MM-DD)', key: 'effectiveDate', width: 26 },
        { header: 'Expiry Date (YYYY-MM-DD)', key: 'expiryDate', width: 24 },
        { header: 'Source', key: 'source', width: 14 },
        { header: 'Remark', key: 'remark', width: 24 },
        { header: 'Motor: Reg No', key: 'regNo', width: 16 },
        { header: 'Motor: Brand', key: 'brand', width: 16 },
        { header: 'Motor: Model', key: 'model', width: 16 },
        { header: 'Motor: Year', key: 'year', width: 12 },
        { header: 'Motor: Engine CC', key: 'cc', width: 16 },
      ];
    }

    // Style header row
    const ws2 = wb.worksheets[0];
    const headerRow = ws2.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { wrapText: true, vertical: 'middle' };
    headerRow.height = 40;
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF93C5FD' } } };
    });

    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }
}
