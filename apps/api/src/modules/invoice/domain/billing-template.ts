import {
  DOCUMENT_STYLES,
  e,
  infoRow,
  label,
  lines,
  orDash,
  renderLetterhead,
  type LetterheadCompany,
} from '../../../common/pdf/document-parts.js';
import { formatMoney, formatThaiDate, thaiBahtText } from '../../proposal/domain/proposal-format.js';

/**
 * Invoice / Debit Note / Credit Note and Receipt documents (A4, Thai/English). Pure: takes the
 * assembled data and returns a self-contained HTML string for PdfRendererService. Every value is
 * escaped, and every amount is printed exactly as stored (Decimal strings, never re-computed here).
 */

export type BillingNoteKind = 'INVOICE' | 'DEBIT_NOTE' | 'CREDIT_NOTE';

export interface BillingCustomer {
  name: string;
  customerCode: string;
  idLabel: string;
  idNo: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

export interface BillingBankAccount {
  bankName: string;
  branch?: string;
  accountName: string;
  accountNo: string;
}

export interface InvoiceDocumentData {
  company: LetterheadCompany;
  kind: BillingNoteKind;
  invoice: {
    invoiceNo: string;
    issueDate: Date;
    dueDate: Date | string;
    installmentNo: number | null;
    installmentTotal: number;
    status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  };
  policy: {
    policyNo: string;
    jobNo: string;
    insurerName: string;
    productName: string;
    effectiveDate: Date | null;
    expiryDate: Date | null;
  };
  customer: BillingCustomer;
  amounts: { net: string; stampDuty: string; vat: string; total: string };
  paid: string;
  outstanding: string;
  bankAccounts: BillingBankAccount[];
}

export interface ReceiptDocumentData {
  company: LetterheadCompany;
  receipt: {
    receiptNo: string;
    issuedAt: Date;
    status: 'ISSUED' | 'VOID';
    voidedAt: Date | null;
    voidReason: string | null;
  };
  payment: {
    paymentNo: string;
    paymentDate: Date;
    method: string;
    bank: string | null;
    referenceNo: string | null;
    remark: string | null;
    recordedBy: string | null;
  };
  invoice: {
    invoiceNo: string;
    installmentNo: number | null;
    installmentTotal: number;
    amount: string;
    /** Still-active payments recorded no later than this one; payments made afterwards never change it. */
    paidToDate: string;
    balance: string;
  };
  policy: { policyNo: string; insurerName: string; productName: string };
  customer: BillingCustomer;
  amount: string;
}

const NOTE_TITLES: Record<BillingNoteKind, { th: string; en: string; description: string }> = {
  INVOICE: { th: 'ใบแจ้งหนี้', en: 'INVOICE', description: 'เบี้ยประกันภัย' },
  DEBIT_NOTE: { th: 'ใบเพิ่มหนี้', en: 'DEBIT NOTE', description: 'เบี้ยประกันภัยเพิ่มเติม' },
  CREDIT_NOTE: { th: 'ใบลดหนี้', en: 'CREDIT NOTE', description: 'ลดเบี้ยประกันภัย' },
};

const STATUS_LABELS: Record<InvoiceDocumentData['invoice']['status'], string> = {
  PENDING: 'รอชำระ / Pending',
  PARTIALLY_PAID: 'ชำระบางส่วน / Partially paid',
  PAID: 'ชำระครบแล้ว / Paid',
  OVERDUE: 'เกินกำหนดชำระ / Overdue',
  CANCELLED: 'ยกเลิก / Cancelled',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'เงินสด / Cash',
  TRANSFER: 'โอนเงิน / Bank transfer',
  CREDIT_CARD: 'บัตรเครดิต / Credit card',
  CHEQUE: 'เช็ค / Cheque',
  ONLINE: 'ชำระออนไลน์ / Online',
  OTHER: 'อื่น ๆ / Other',
};

const STAMP_STYLES = `
  .stamp{display:inline-block;border:2px solid;border-radius:6px;padding:2px 12px;font-weight:700;letter-spacing:2px;transform:rotate(-6deg)}
  .stamp.paid{color:#1b7a3d;border-color:#1b7a3d}
  .stamp.void{color:#b42318;border-color:#b42318}
  .status-line{margin-top:6px;font-size:9.5pt}
`;

function installmentLabel(no: number | null, total: number): string {
  return no && total > 1 ? ` (งวดที่ ${no}/${total})` : '';
}

function titleBlock(th: string, en: string): string {
  return `<div class="title"><h1>${th}</h1><div class="en">${en}</div></div>`;
}

function customerCard(cu: BillingCustomer, heading: string): string {
  return `
      <div class="card">
        <h3>${heading}</h3>
        <div class="cust-name">${e(cu.name)}</div>
        <div class="small">รหัสลูกค้า / Customer code: ${e(cu.customerCode)}</div>
        ${cu.address ? `<div class="small">${lines(cu.address)}</div>` : ''}
        ${cu.idNo ? `<div class="small">${e(cu.idLabel)}: ${e(cu.idNo)}</div>` : ''}
        ${cu.phone || cu.email ? `<div class="small">${[cu.phone && `โทร ${e(cu.phone)}`, cu.email && e(cu.email)].filter(Boolean).join(' · ')}</div>` : ''}
      </div>`;
}

function wrap(title: string, fontCss: string, body: string, watermark?: string): string {
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>${e(title)}</title>
<style>${fontCss}${DOCUMENT_STYLES}${STAMP_STYLES}</style></head>
<body>
${watermark ? `<div class="watermark">${watermark}</div>` : ''}
${body}
</body></html>`;
}

export function renderInvoiceHtml(d: InvoiceDocumentData, fontCss: string): string {
  const t = NOTE_TITLES[d.kind];
  const inv = d.invoice;
  const cancelled = inv.status === 'CANCELLED';
  const paidInFull = inv.status === 'PAID';

  const head = `
    <div class="head-grid">
      ${customerCard(d.customer, 'ลูกค้า <span class="en">/ Bill to</span>')}
      <div class="card">
        <table class="kv">
          ${infoRow('เลขที่', `${t.en} No.`, `<b>${e(inv.invoiceNo)}</b>`)}
          ${infoRow('วันที่ออก', 'Issue date', e(formatThaiDate(inv.issueDate)))}
          ${d.kind === 'INVOICE' ? infoRow('ครบกำหนดชำระ', 'Due date', `<b>${e(formatThaiDate(inv.dueDate))}</b>`) : ''}
          ${infoRow('กรมธรรม์เลขที่', 'Policy No.', e(d.policy.policyNo))}
          ${infoRow('เลขที่งาน', 'Job No.', e(d.policy.jobNo))}
        </table>
      </div>
    </div>`;

  const description = `${t.description}${installmentLabel(inv.installmentNo, inv.installmentTotal)}`;
  const items = `
    <table class="grid">
      <thead><tr>
        <th style="width:24px">#</th>
        <th>${label('รายการ', 'Description')}</th>
        <th class="num">${label('จำนวนเงิน (บาท)', 'Amount (THB)')}</th>
      </tr></thead>
      <tbody><tr>
        <td>1</td>
        <td>
          <b>${e(description)}</b><br>
          <span class="en">${e(d.policy.productName)} · ${e(d.policy.insurerName)}<br>
          ระยะเวลาคุ้มครอง ${e(formatThaiDate(d.policy.effectiveDate))} – ${e(formatThaiDate(d.policy.expiryDate))}</span>
        </td>
        <td class="num">${e(formatMoney(d.amounts.net))}</td>
      </tr></tbody>
    </table>`;

  const sign = d.kind === 'CREDIT_NOTE' ? '-' : '';
  const summary = `
    <div class="summary" style="margin-top:10px">
      <div class="words">
        <span class="en">จำนวนเงินรวมทั้งสิ้น (ตัวอักษร) / Total amount in words</span>
        <b>(${e(thaiBahtText(d.amounts.total))})</b>
        <div class="status-line">สถานะ / Status: <b>${e(STATUS_LABELS[inv.status])}</b></div>
        ${paidInFull ? '<div style="margin-top:6px"><span class="stamp paid">ชำระแล้ว PAID</span></div>' : ''}
      </div>
      <table class="sum">
        <tr><th>มูลค่าก่อนภาษี<span class="en">Net premium</span></th><td class="num">${sign}${e(formatMoney(d.amounts.net))}</td></tr>
        <tr><th>อากรแสตมป์<span class="en">Stamp duty</span></th><td class="num">${sign}${e(formatMoney(d.amounts.stampDuty))}</td></tr>
        <tr><th>ภาษีมูลค่าเพิ่ม<span class="en">VAT</span></th><td class="num">${sign}${e(formatMoney(d.amounts.vat))}</td></tr>
        <tr class="total"><th>รวมทั้งสิ้น<span class="en">Total (THB)</span></th><td class="num">${sign}${e(formatMoney(d.amounts.total))}</td></tr>
        ${d.kind === 'INVOICE' ? `
        <tr class="sub"><th>ชำระแล้ว<span class="en">Paid</span></th><td class="num">${e(formatMoney(d.paid))}</td></tr>
        <tr><th>ยอดค้างชำระ<span class="en">Balance due</span></th><td class="num"><b>${e(formatMoney(d.outstanding))}</b></td></tr>` : ''}
      </table>
    </div>`;

  const bank = d.kind === 'INVOICE' && !paidInFull && !cancelled
    ? `<section class="block"><h2>ช่องทางการชำระเงิน <span class="en">/ Payment Methods</span></h2>${
      d.bankAccounts.length
        ? `<table class="grid"><thead><tr>
            <th>${label('ธนาคาร', 'Bank')}</th><th>${label('สาขา', 'Branch')}</th>
            <th>${label('ชื่อบัญชี', 'Account name')}</th><th>${label('เลขที่บัญชี', 'Account no.')}</th>
          </tr></thead><tbody>${d.bankAccounts
            .map((b) => `<tr><td>${e(b.bankName)}</td><td>${orDash(b.branch)}</td><td>${e(b.accountName)}</td><td><b>${e(b.accountNo)}</b></td></tr>`)
            .join('')}</tbody></table>`
        : '<p class="empty">โปรดติดต่อผู้ออกเอกสารเพื่อรับข้อมูลการชำระเงิน / Please contact us for payment details.</p>'
    }</section>`
    : '';

  const body = `${renderLetterhead(d.company)}${titleBlock(t.th, t.en)}${head}${items}${summary}${bank}`;
  return wrap(inv.invoiceNo, fontCss, body, cancelled ? 'ยกเลิก CANCELLED' : undefined);
}

export function renderReceiptHtml(d: ReceiptDocumentData, fontCss: string): string {
  const r = d.receipt;
  const pay = d.payment;
  const inv = d.invoice;
  const isVoid = r.status === 'VOID';

  const head = `
    <div class="head-grid">
      ${customerCard(d.customer, 'ได้รับเงินจาก <span class="en">/ Received from</span>')}
      <div class="card">
        <table class="kv">
          ${infoRow('เลขที่', 'Receipt No.', `<b>${e(r.receiptNo)}</b>`)}
          ${infoRow('วันที่รับเงิน', 'Payment date', e(formatThaiDate(pay.paymentDate)))}
          ${infoRow('อ้างอิงใบแจ้งหนี้', 'Invoice ref.', e(inv.invoiceNo))}
          ${infoRow('กรมธรรม์เลขที่', 'Policy No.', e(d.policy.policyNo))}
        </table>
      </div>
    </div>`;

  const items = `
    <table class="grid">
      <thead><tr>
        <th style="width:24px">#</th>
        <th>${label('รายการ', 'Description')}</th>
        <th class="num">${label('จำนวนเงิน (บาท)', 'Amount (THB)')}</th>
      </tr></thead>
      <tbody><tr>
        <td>1</td>
        <td>
          <b>ชำระเบี้ยประกันภัย${e(installmentLabel(inv.installmentNo, inv.installmentTotal))}</b><br>
          <span class="en">ตามใบแจ้งหนี้ ${e(inv.invoiceNo)} · ${e(d.policy.productName)} · ${e(d.policy.insurerName)}</span>
        </td>
        <td class="num">${e(formatMoney(d.amount))}</td>
      </tr></tbody>
    </table>`;

  const method = `
    <section class="block"><h2>รายละเอียดการชำระเงิน <span class="en">/ Payment Details</span></h2>
      <table class="kv wide">
        ${infoRow('วิธีชำระเงิน', 'Method', e(PAYMENT_METHOD_LABELS[pay.method] ?? pay.method))}
        ${pay.bank ? infoRow('ธนาคาร', 'Bank', e(pay.bank)) : ''}
        ${pay.referenceNo ? infoRow('เลขที่อ้างอิง', 'Reference', e(pay.referenceNo)) : ''}
        ${infoRow('เลขที่รายการชำระ', 'Payment No.', e(pay.paymentNo))}
        ${pay.remark ? infoRow('หมายเหตุ', 'Remark', lines(pay.remark)) : ''}
      </table>
    </section>`;

  const summary = `
    <div class="summary">
      <div class="words">
        <span class="en">จำนวนเงินที่ได้รับ (ตัวอักษร) / Amount received in words</span>
        <b>(${e(thaiBahtText(d.amount))})</b>
        ${isVoid ? `<div style="margin-top:6px"><span class="stamp void">ยกเลิก VOID</span><div class="status-line">เหตุผล / Reason: ${e(r.voidReason ?? '-')}${r.voidedAt ? ` · ${e(formatThaiDate(r.voidedAt))}` : ''}</div></div>` : ''}
      </div>
      <table class="sum">
        <tr><th>ยอดใบแจ้งหนี้<span class="en">Invoice amount</span></th><td class="num">${e(formatMoney(inv.amount))}</td></tr>
        ${isVoid ? '' : `
        <tr><th>ชำระสะสมถึงครั้งนี้<span class="en">Paid to date</span></th><td class="num">${e(formatMoney(inv.paidToDate))}</td></tr>
        <tr class="sub"><th>คงเหลือ<span class="en">Balance</span></th><td class="num">${e(formatMoney(inv.balance))}</td></tr>`}
        <tr class="total"><th>จำนวนเงินที่ได้รับ<span class="en">Received (THB)</span></th><td class="num">${e(formatMoney(d.amount))}</td></tr>
      </table>
    </div>`;

  const signs = `
    <div class="signs">
      <div class="sign">
        <div class="stmt">ผู้รับเงิน / Received by</div>
        <div class="line"></div>
        <div class="who">( ${e(pay.recordedBy ?? d.company.nameTh)} )</div>
        <div class="en">${e(d.company.nameTh)}</div>
        <div class="date">วันที่ / Date ${e(formatThaiDate(r.issuedAt))}</div>
      </div>
    </div>`;

  const body = `${renderLetterhead(d.company)}${titleBlock('ใบเสร็จรับเงิน', 'RECEIPT')}${head}${items}${method}${summary}${signs}`;
  return wrap(r.receiptNo, fontCss, body, isVoid ? 'ยกเลิก VOID' : undefined);
}
