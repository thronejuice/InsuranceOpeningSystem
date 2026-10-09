/**
 * HTML building blocks shared by every customer-facing PDF (proposal, invoice, receipt): escaping,
 * the Company Profile letterhead, and the common A4 stylesheet. Pure — no I/O.
 */

export interface LetterheadCompany {
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
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const e = escapeHtml;
export const orDash = (v: string | null | undefined) => (v && v.trim() ? e(v) : '-');
/** Multi-line text (addresses, remarks) keeps its line breaks. */
export const lines = (v: string | null | undefined) => (v ? e(v).replace(/\r?\n/g, '<br>') : '');

export function label(th: string, en: string): string {
  return `<span class="th">${th}</span><span class="en">${en}</span>`;
}

export function infoRow(th: string, en: string, value: string): string {
  return `<tr><th>${label(th, en)}</th><td>${value}</td></tr>`;
}

/** `allowBreak` lets long tables split across pages; other sections stay on one page. */
export function section(no: number, th: string, en: string, body: string, allowBreak = false): string {
  return `<section class="block${allowBreak ? ' allow-break' : ''}"><h2><span class="no">${no}</span>${th} <span class="en">/ ${en}</span></h2>${body}</section>`;
}

export const DOCUMENT_STYLES = `
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


export function renderLetterhead(c: LetterheadCompany): string {
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
  return letterhead;
}

/**
 * Puppeteer footer: document number left, page x/y right. Footer templates cannot use the page's
 * @font-face, so it stays ASCII-only to render the same on hosts without Thai system fonts.
 */
export function renderDocumentFooter(label: string): string {
  return `<div style="width:100%;font-family:sans-serif;font-size:7.5pt;color:#6b7785;padding:0 14mm;display:flex;justify-content:space-between">
    <span>${escapeHtml(label)}</span>
    <span>Page <span class="pageNumber"></span>/<span class="totalPages"></span></span>
  </div>`;
}
