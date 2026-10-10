import ExcelJS from 'exceljs';
import type { StatementDetailResponse } from './commission-statement.service.js';

const MONEY_FMT = '#,##0.00';
// Cells are numeric so the sheet can be summed; every value is an exact 2dp string from the API.
const num = (v: string | null) => (v == null ? null : Number(v));

/** One workbook per statement: a summary sheet, the commissions paid, and the adjustments netted in. */
export async function buildStatementWorkbook(s: StatementDetailResponse): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  const summary = wb.addWorksheet('Statement');
  summary.columns = [{ width: 22 }, { width: 34 }];
  summary.addRows([
    ['Statement No.', s.statementNo],
    ['Payee', s.agent?.fullName ?? ''],
    ['Period', s.period],
    ['Status', s.status],
    ['Paid date', s.paidDate ?? ''],
    ['Payment ref', s.paymentRef ?? ''],
    ['Share total', num(s.shareTotal)],
    ['WHT total', num(s.whtTotal)],
    ['Net total', num(s.netTotal)],
  ]);
  for (const r of [7, 8, 9]) summary.getCell(`B${r}`).numFmt = MONEY_FMT;
  summary.getColumn(1).font = { bold: true };

  const commissions = wb.addWorksheet('Commissions');
  commissions.columns = [
    { header: 'Policy No.', key: 'policyNo', width: 22 },
    { header: 'Type', key: 'type', width: 10 },
    { header: 'Gross', key: 'gross', width: 16, style: { numFmt: MONEY_FMT } },
    { header: 'Share', key: 'share', width: 16, style: { numFmt: MONEY_FMT } },
    { header: 'WHT', key: 'wht', width: 14, style: { numFmt: MONEY_FMT } },
    { header: 'Net', key: 'net', width: 16, style: { numFmt: MONEY_FMT } },
    { header: 'Status', key: 'status', width: 12 },
  ];
  for (const c of s.commissions) {
    commissions.addRow({
      policyNo: c.policy?.policyNo ?? '',
      type: c.commissionType,
      gross: num(c.grossAmount),
      share: num(c.commissionAmount),
      wht: num(c.whtAmount),
      net: num(c.netAmount),
      status: c.status,
    });
  }

  const adjustments = wb.addWorksheet('Adjustments');
  adjustments.columns = [
    { header: 'Reason', key: 'reason', width: 40 },
    { header: 'Reference', key: 'ref', width: 18 },
    { header: 'Amount', key: 'amount', width: 14, style: { numFmt: MONEY_FMT } },
    { header: 'WHT', key: 'wht', width: 14, style: { numFmt: MONEY_FMT } },
    { header: 'Net', key: 'net', width: 14, style: { numFmt: MONEY_FMT } },
    { header: 'Status', key: 'status', width: 14 },
  ];
  for (const a of s.adjustments) {
    adjustments.addRow({ reason: a.reason, ref: a.refType ?? '', amount: num(a.amount), wht: num(a.whtAmount), net: num(a.netAmount), status: a.status });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
