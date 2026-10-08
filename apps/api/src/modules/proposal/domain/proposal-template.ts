import { formatMoney, formatRate, formatThaiDate, thaiBahtText } from './proposal-format.js';

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
    proposalDate: Date | null;
    validUntil: Date | null;
    remark: string | null;
    /** DRAFT → watermark "ฉบับร่าง / DRAFT" */
    isDraft: boolean;
  };
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

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const e = escapeHtml;
const orDash = (v: string | null | undefined) => (v && v.trim() ? e(v) : '-');
/** Multi-line text (addresses, remarks) keeps its line breaks. */
const lines = (v: string | null | undefined) => (v ? e(v).replace(/\r?\n/g, '<br>') : '');

function label(th: string, en: string): string {
  return `<span class="th">${th}</span><span class="en">${en}</span>`;
}

function infoRow(th: string, en: string, value: string): string {
  return `<tr><th>${label(th, en)}</th><td>${value}</td></tr>`;
}

/** `allowBreak` lets long tables split across pages; other sections stay on one page. */
function section(no: number, th: string, en: string, body: string, allowBreak = false): string {
  return `<section class="block${allowBreak ? ' allow-break' : ''}"><h2><span class="no">${no}</span>${th} <span class="en">/ ${en}</span></h2>${body}</section>`;
}

const STYLES = `
  *{box-sizing:border-box;margin:0;padding:0}
  html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:'Sarabun',sans-serif;font-size:10.5pt;line-height:1.45;color:#1f2933}
  .en{color:#6b7785;font-size:8.5pt;font-weight:400}
  th .th,th .en,.lbl .th,.lbl .en{display:block}
  th .en,.lbl .en{line-height:1.15}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  header.letterhead{display:flex;gap:14px;align-items:flex-start;padding-bottom:10px;border-bottom:2.5px solid #1d3f72}
  .logo{width:70px;height:70px;object-fit:contain;flex:none}
  .company{flex:1}
  .company .name{font-size:14pt;font-weight:700;color:#1d3f72;line-height:1.25}
  .company .name-en{font-size:10pt;font-weight:600;color:#1d3f72}
  .company .meta{font-size:8.5pt;color:#46525e;margin-top:2px}
  .company .meta span+span::before{content:" · "}
  .title{text-align:center;margin:14px 0 10px}
  .title h1{font-size:16pt;font-weight:700;color:#1d3f72;letter-spacing:.3px}
  .title .en{font-size:10pt;letter-spacing:2px;font-weight:600}
  .head-grid{display:grid;grid-template-columns:1.35fr 1fr;gap:10px;margin-bottom:12px}
  .card{border:1px solid #cfd8e3;border-radius:6px;padding:8px 10px}
  .card h3{font-size:9pt;font-weight:600;color:#1d3f72;margin-bottom:4px}
  .card h3 .en{font-size:8pt}
  .card .cust-name{font-size:11.5pt;font-weight:700}
  .card .small{font-size:9pt;color:#46525e}
  table.kv{width:100%;border-collapse:collapse}
  table.kv th{text-align:left;font-weight:600;vertical-align:top;padding:2px 8px 2px 0;width:42%;font-size:9pt}
  table.kv td{vertical-align:top;padding:2px 0}
  table.kv.wide th{width:30%}
  section.block{margin-top:12px;break-inside:avoid}
  section.block.allow-break{break-inside:auto}
  h2{font-size:11pt;font-weight:700;color:#1d3f72;border-bottom:1px solid #cfd8e3;padding-bottom:3px;margin-bottom:6px}
  h2 .no{display:inline-block;min-width:18px;height:18px;border-radius:9px;background:#1d3f72;color:#fff;font-size:9pt;text-align:center;line-height:18px;margin-right:6px}
  table.grid{width:100%;border-collapse:collapse;font-size:9.5pt}
  table.grid thead th{background:#1d3f72;color:#fff;font-weight:600;padding:5px 6px;text-align:left;vertical-align:bottom}
  table.grid thead th .en{color:#c9d6ea}
  table.grid thead th.num{text-align:right}
  table.grid tbody td{padding:5px 6px;border-bottom:1px solid #e3e8ef;vertical-align:top}
  table.grid tbody tr:nth-child(even) td{background:#f6f8fb}
  table.grid tr{break-inside:avoid}
  .risk-grid{display:grid;grid-template-columns:1fr 1fr;column-gap:18px}
  .risk-grid .item{display:flex;gap:8px;padding:3px 0;border-bottom:1px dotted #d5dce5;break-inside:avoid}
  .risk-grid .lbl{width:45%;font-weight:600;font-size:9pt}
  .risk-grid .val{flex:1}
  .summary{display:flex;gap:14px;align-items:flex-start}
  .summary .words{flex:1;align-self:flex-end;background:#f2f5fa;border-left:3px solid #1d3f72;padding:8px 10px;font-size:9.5pt}
  .summary .words b{display:block;font-size:10.5pt;color:#1d3f72}
  table.sum{width:58%;border-collapse:collapse}
  table.sum th{text-align:left;font-weight:500;padding:3px 8px;font-size:9.5pt}
  table.sum th .en{display:inline;margin-left:4px}
  table.sum td{padding:3px 8px}
  table.sum tr.sub td,table.sum tr.sub th{border-top:1px solid #cfd8e3}
  table.sum tr.total th,table.sum tr.total td{background:#1d3f72;color:#fff;font-weight:700;font-size:11pt;padding:6px 8px}
  table.sum tr.total th .en{color:#c9d6ea}
  ol.terms{padding-left:18px;font-size:9pt;color:#36414c}
  ol.terms li{margin-bottom:2px}
  .remark{margin-top:6px;font-size:9.5pt;background:#fffbea;border:1px solid #f0e2a8;border-radius:4px;padding:6px 8px}
  .signs{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:22px;break-inside:avoid}
  .sign{border:1px solid #cfd8e3;border-radius:6px;padding:10px 12px;text-align:center;font-size:9.5pt}
  .sign .stmt{text-align:left;min-height:34px;font-size:9pt;color:#36414c}
  .sign .line{border-bottom:1px solid #1f2933;height:46px;margin:6px 20px 4px}
  .sign .who{font-weight:600}
  .sign .date{margin-top:6px}
  .watermark{position:fixed;top:40%;left:0;right:0;text-align:center;transform:rotate(-30deg);font-size:72pt;font-weight:700;color:rgba(200,30,30,.10);z-index:-1;letter-spacing:6px}
  .empty{color:#6b7785;font-style:italic;font-size:9.5pt}
`;

export function renderProposalHtml(d: ProposalDocumentData, fontCss: string): string {
  const c = d.company;
  const companyMeta = [
    c.taxId && `เลขประจำตัวผู้เสียภาษี ${e(c.taxId)}`,
    c.brokerLicenseNo && `ใบอนุญาตนายหน้า คปภ. ${e(c.brokerLicenseNo)}`,
  ].filter(Boolean);
  const contactMeta = [
    c.phone && `โทร ${e(c.phone)}`,
    c.email && e(c.email),
    c.website && e(c.website),
  ].filter(Boolean);

  const letterhead = `
    <header class="letterhead">
      ${c.logoDataUri ? `<img class="logo" src="${c.logoDataUri}" alt="">` : ''}
      <div class="company">
        <div class="name">${c.nameTh ? e(c.nameTh) : '(ยังไม่ได้ตั้งค่าข้อมูลบริษัท)'}</div>
        ${c.nameEn ? `<div class="name-en">${e(c.nameEn)}</div>` : ''}
        ${c.addressTh ? `<div class="meta">${lines(c.addressTh)}</div>` : ''}
        ${c.addressEn ? `<div class="meta">${lines(c.addressEn)}</div>` : ''}
        ${companyMeta.length ? `<div class="meta">${companyMeta.map((m) => `<span>${m}</span>`).join('')}</div>` : ''}
        ${contactMeta.length ? `<div class="meta">${contactMeta.map((m) => `<span>${m}</span>`).join('')}</div>` : ''}
      </div>
    </header>`;

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

  const payment = section(5, 'ช่องทางการชำระเงิน', 'Payment Methods', d.bankAccounts.length
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
  const terms = termsBody ? section(6, 'เงื่อนไขและหมายเหตุ', 'Terms & Remarks', termsBody) : '';

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
<style>${fontCss}${STYLES}</style></head>
<body>
${d.proposal.isDraft ? '<div class="watermark">ฉบับร่าง DRAFT</div>' : ''}
${letterhead}${title}${head}${insurance}${risks}${coverages}${premium}${payment}${terms}${signs}
</body></html>`;
}

/**
 * Puppeteer footer: document number left, page x/y right. Footer templates cannot use the page's
 * @font-face, so it stays ASCII-only to render the same on hosts without Thai system fonts.
 */
export function renderProposalFooter(proposalNo: string): string {
  return `<div style="width:100%;font-family:sans-serif;font-size:7.5pt;color:#6b7785;padding:0 14mm;display:flex;justify-content:space-between">
    <span>${escapeHtml(proposalNo)}</span>
    <span>Page <span class="pageNumber"></span>/<span class="totalPages"></span></span>
  </div>`;
}
