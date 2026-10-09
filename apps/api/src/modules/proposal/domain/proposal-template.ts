import {
  DOCUMENT_STYLES,
  e,
  escapeHtml,
  infoRow,
  label,
  lines,
  orDash,
  renderDocumentFooter,
  renderLetterhead,
  section,
} from '../../../common/pdf/document-parts.js';
import { formatMoney, formatRate, formatThaiDate, thaiBahtText } from './proposal-format.js';

export { escapeHtml };

/**
 * Customer-facing proposal document (A4, Thai/English). Pure: takes the assembled data and
 * returns a self-contained HTML string for PdfRendererService. Every dynamic value is escaped.
 */

export interface ProposalDocumentData {
  company: {
    nameTh: string;
    nameEn: string | null;
    addressTh: string | null;
    addressEn: string | null;
    taxId: string | null;
    brokerLicenseNo: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    logoDataUri: string | null;
  };
  proposal: {
    proposalNo: string;
    version?: number;
    proposalDate: Date | null;
    validUntil: Date | null;
    remark: string | null;
    /** DRAFT → watermark "ฉบับร่าง / DRAFT" */
    isDraft: boolean;
  };
  paymentTerm?: {
    name: string;
    code: string;
    description: string | null;
    installments: number;
    intervalMonths: number;
    firstDueDays: number;
    schedule: Array<{
      installmentNo: number;
      dueDate: Date | null;
      amount: string;
    }>;
  } | null;
  jobNo: string;
  customer: {
    name: string;
    customerCode: string;
    idLabel: string;
    idNo: string | null;
    address: string | null;
    contactName: string | null;
    phone: string | null;
    email: string | null;
  };
  insurance: {
    insuranceTypeName: string;
    productName: string;
    insurerName: string;
    quotationNo: string;
    effectiveDate: Date | null;
    expiryDate: Date | null;
  };
  risks: Array<{ label: string; value: string }>;
  coverages: Array<{
    name: string;
    sumInsured: string;
    rate: string | null;
    deductible: string | null;
    premium: string;
    remark: string | null;
  }>;
  premium: {
    gross: string;
    discount: string;
    net: string;
    stampDuty: string;
    vat: string;
    total: string;
  };
  terms: string[];
  bankAccounts: Array<{ bankName: string; branch?: string; accountName: string; accountNo: string }>;
  agent: { name: string; email: string | null };
}

export function renderProposalHtml(d: ProposalDocumentData, fontCss: string): string {
  const c = d.company;
  const letterhead = renderLetterhead(c);

  const title = `
    <div class="title">
      <h1>ใบเสนอเบี้ยประกันภัย</h1>
      <div class="en">INSURANCE PROPOSAL</div>
    </div>`;

  const cu = d.customer;
  const head = `
    <div class="head-grid">
      <div class="card">
        <h3>เรียน <span class="en">/ To</span></h3>
        <div class="cust-name">${e(cu.name)}</div>
        <div class="small">รหัสลูกค้า / Customer code: ${e(cu.customerCode)}</div>
        ${cu.address ? `<div class="small">${lines(cu.address)}</div>` : ''}
        ${cu.idNo ? `<div class="small">${e(cu.idLabel)}: ${e(cu.idNo)}</div>` : ''}
        ${cu.contactName ? `<div class="small">ผู้ติดต่อ / Attn: ${e(cu.contactName)}</div>` : ''}
        ${cu.phone || cu.email ? `<div class="small">${[cu.phone && `โทร ${e(cu.phone)}`, cu.email && e(cu.email)].filter(Boolean).join(' · ')}</div>` : ''}
      </div>
      <div class="card">
        <table class="kv">
          ${infoRow('เลขที่', 'Proposal No.', `<b>${e(d.proposal.proposalNo)}</b>`)}
          ${d.proposal.version ? infoRow('ฉบับที่', 'Version', `<b>v${d.proposal.version}</b>`) : ''}
          ${infoRow('วันที่', 'Date', e(formatThaiDate(d.proposal.proposalDate)))}
          ${infoRow('ยืนราคาถึง', 'Valid until', e(formatThaiDate(d.proposal.validUntil)))}
          ${infoRow('เลขที่งาน', 'Job No.', e(d.jobNo))}
        </table>
      </div>
    </div>`;

  const ins = d.insurance;
  const insurance = section(1, 'รายละเอียดการประกันภัย', 'Insurance Details', `
    <table class="kv wide">
      ${infoRow('ประเภทประกันภัย', 'Class of insurance', e(ins.insuranceTypeName))}
      ${infoRow('แบบประกันภัย', 'Product', e(ins.productName))}
      ${infoRow('บริษัทผู้รับประกันภัย', 'Insurer', `<b>${e(ins.insurerName)}</b>`)}
      ${infoRow('ระยะเวลาประกันภัย', 'Period of insurance', `${e(formatThaiDate(ins.effectiveDate))} – ${e(formatThaiDate(ins.expiryDate))}`)}
      ${infoRow('อ้างอิงใบเสนอราคาบริษัทประกัน', 'Insurer quotation ref.', e(ins.quotationNo))}
    </table>`);

  const risks = section(2, 'รายละเอียดสิ่งที่เอาประกันภัย', 'Risk Details', d.risks.length
    ? `<div class="risk-grid">${d.risks
      .map((r) => `<div class="item"><div class="lbl">${e(r.label)}</div><div class="val">${lines(r.value) || '-'}</div></div>`)
      .join('')}</div>`
    : '<p class="empty">ไม่มีข้อมูล / Not specified</p>', true);

  const coverageRows = d.coverages
    .map((cv, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${e(cv.name)}</td>
        <td class="num">${e(formatMoney(cv.sumInsured))}</td>
        <td class="num">${cv.rate ? e(formatRate(cv.rate)) : '-'}</td>
        <td class="num">${cv.deductible ? e(formatMoney(cv.deductible)) : '-'}</td>
        <td class="num">${e(formatMoney(cv.premium))}</td>
        <td>${orDash(cv.remark)}</td>
      </tr>`)
    .join('');
  const coverages = section(3, 'ความคุ้มครอง', 'Coverage', `
    <table class="grid">
      <thead><tr>
        <th style="width:24px">#</th>
        <th>${label('ความคุ้มครอง', 'Coverage')}</th>
        <th class="num">${label('ทุนประกันภัย (บาท)', 'Sum insured (THB)')}</th>
        <th class="num">${label('อัตรา (%)', 'Rate')}</th>
        <th class="num">${label('ความเสียหายส่วนแรก', 'Deductible')}</th>
        <th class="num">${label('เบี้ยประกันภัย', 'Premium')}</th>
        <th>${label('หมายเหตุ', 'Remark')}</th>
      </tr></thead>
      <tbody>${coverageRows || '<tr><td colspan="7" class="empty">ไม่มีรายการ / No coverage items</td></tr>'}</tbody>
    </table>`, true);

  const p = d.premium;
  const hasDiscount = Number(p.discount) > 0;
  const premium = section(4, 'สรุปเบี้ยประกันภัย', 'Premium Summary', `
    <div class="summary">
      <div class="words">
        <span class="en">จำนวนเงินรวมทั้งสิ้น (ตัวอักษร) / Total amount in words</span>
        <b>(${e(thaiBahtText(p.total))})</b>
      </div>
      <table class="sum">
        <tr><th>เบี้ยประกันภัย<span class="en">Gross premium</span></th><td class="num">${e(formatMoney(p.gross))}</td></tr>
        ${hasDiscount ? `<tr><th>ส่วนลด<span class="en">Discount</span></th><td class="num">-${e(formatMoney(p.discount))}</td></tr>` : ''}
        <tr class="sub"><th>เบี้ยประกันภัยสุทธิ<span class="en">Net premium</span></th><td class="num">${e(formatMoney(p.net))}</td></tr>
        <tr><th>อากรแสตมป์<span class="en">Stamp duty</span></th><td class="num">${e(formatMoney(p.stampDuty))}</td></tr>
        <tr><th>ภาษีมูลค่าเพิ่ม<span class="en">VAT</span></th><td class="num">${e(formatMoney(p.vat))}</td></tr>
        <tr class="total"><th>รวมทั้งสิ้น<span class="en">Total (THB)</span></th><td class="num">${e(formatMoney(p.total))}</td></tr>
      </table>
    </div>`);

  const pt = d.paymentTerm;
  let paymentTermBody = '';
  if (pt) {
    const isInstallment = pt.installments > 1;
    paymentTermBody = `
      <div style="margin-bottom:8px">
        <span style="font-weight:600">เงื่อนไขการชำระเงิน / Payment Term:</span>
        <b>${e(pt.name)}</b>
        ${pt.description ? `<span class="en">(${e(pt.description)})</span>` : ''}
        <span class="en">· ${isInstallment ? `จำนวน ${pt.installments} งวด (ทุก ${pt.intervalMonths} เดือน)` : 'ชำระเต็มจำนวน'}</span>
      </div>
      <table class="grid">
        <thead><tr>
          <th style="width:80px">งวดที่ / No.</th>
          <th>กำหนดชำระ / Due date</th>
          <th class="num">ยอดชำระต่องวด (บาท) / Amount (THB)</th>
        </tr></thead>
        <tbody>
          ${pt.schedule
            .map(
              (s) => `
            <tr>
              <td>งวดที่ ${s.installmentNo}</td>
              <td>${s.dueDate ? e(formatThaiDate(s.dueDate)) : '-'}</td>
              <td class="num"><b>${e(formatMoney(s.amount))}</b></td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>`;
  } else {
    paymentTermBody = '<p class="empty">ชำระเต็มจำนวน / Full Payment (ไม่มีเงื่อนไขผ่อนชำระพิเศษ)</p>';
  }

  const paymentTermsSection = section(5, 'เงื่อนไขและการแบ่งงวดชำระ', 'Payment Terms & Installments', paymentTermBody);

  const payment = section(6, 'ช่องทางการชำระเงิน', 'Payment Methods', d.bankAccounts.length
    ? `<table class="grid">
        <thead><tr>
          <th>${label('ธนาคาร', 'Bank')}</th>
          <th>${label('สาขา', 'Branch')}</th>
          <th>${label('ชื่อบัญชี', 'Account name')}</th>
          <th>${label('เลขที่บัญชี', 'Account no.')}</th>
        </tr></thead>
        <tbody>${d.bankAccounts
          .map((b) => `<tr><td>${e(b.bankName)}</td><td>${orDash(b.branch)}</td><td>${e(b.accountName)}</td><td><b>${e(b.accountNo)}</b></td></tr>`)
          .join('')}</tbody>
      </table>`
    : '<p class="empty">โปรดติดต่อผู้เสนอเพื่อรับข้อมูลการชำระเงิน / Please contact us for payment details.</p>');

  const termsBody = [
    d.terms.length ? `<ol class="terms">${d.terms.map((t) => `<li>${e(t)}</li>`).join('')}</ol>` : '',
    d.proposal.remark ? `<div class="remark"><b>หมายเหตุเพิ่มเติม / Additional remark:</b> ${lines(d.proposal.remark)}</div>` : '',
  ].join('');
  const terms = termsBody ? section(7, 'เงื่อนไขและหมายเหตุ', 'Terms & Remarks', termsBody) : '';

  const signs = `
    <div class="signs">
      <div class="sign">
        <div class="stmt">ผู้เสนอ / Proposed by</div>
        <div class="line"></div>
        <div class="who">( ${e(d.agent.name)} )</div>
        <div class="en">${c.nameTh ? e(c.nameTh) : ''}${d.agent.email ? ` · ${e(d.agent.email)}` : ''}</div>
        <div class="date">วันที่ / Date ____/____/________</div>
      </div>
      <div class="sign">
        <div class="stmt">ข้าพเจ้าได้อ่านและตกลงทำประกันภัยตามข้อเสนอนี้<br><span class="en">I have read and accept this proposal.</span></div>
        <div class="line"></div>
        <div class="who">( ${e(cu.name)} )</div>
        <div class="en">ผู้เอาประกันภัย / The Insured</div>
        <div class="date">วันที่ / Date ____/____/________</div>
      </div>
    </div>`;

  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>${e(d.proposal.proposalNo)}</title>
<style>${fontCss}${DOCUMENT_STYLES}</style></head>
<body>
${d.proposal.isDraft ? '<div class="watermark">ฉบับร่าง DRAFT</div>' : ''}
${letterhead}${title}${head}${insurance}${risks}${coverages}${premium}${paymentTermsSection}${payment}${terms}${signs}
</body></html>`;
}

export function renderProposalFooter(proposalNo: string, version?: number): string {
  return renderDocumentFooter(version ? `${proposalNo} (v${version})` : proposalNo);
}
