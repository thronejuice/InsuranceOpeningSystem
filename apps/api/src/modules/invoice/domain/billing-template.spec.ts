import { describe, expect, it } from 'vitest';
import {
  renderInvoiceHtml,
  renderReceiptHtml,
  type InvoiceDocumentData,
  type ReceiptDocumentData,
} from './billing-template.js';

const company = {
  nameTh: 'บริษัท นายหน้า จำกัด',
  nameEn: 'Broker Co., Ltd.',
  addressTh: '1 ถนนทดสอบ',
  addressEn: null,
  taxId: '0105551234567',
  brokerLicenseNo: 'ว.0001',
  phone: '02-000-0000',
  email: 'info@example.com',
  website: null,
  logoDataUri: null,
};
const customer = {
  name: 'สมชาย ใจดี',
  customerCode: 'CUS-000001',
  idLabel: 'เลขประจำตัวประชาชน / ID No.',
  idNo: '1-2345-xxxxx-xx-9',
  address: '99 ถนนสุขุมวิท',
  phone: '081-111-1111',
  email: null,
};

const invoiceData = (over: Partial<InvoiceDocumentData> = {}): InvoiceDocumentData => ({
  company,
  kind: 'INVOICE',
  invoice: {
    invoiceNo: 'INV-2026-000007',
    issueDate: new Date('2026-10-09T05:00:00Z'),
    dueDate: new Date('2026-11-08T00:00:00Z'),
    installmentNo: 2,
    installmentTotal: 3,
    status: 'PENDING',
  },
  policy: {
    policyNo: 'PL-2026-000003',
    jobNo: 'JOB-2026-000010',
    insurerName: 'บริษัท ไทยประกันภัย จำกัด',
    productName: 'ประกันอัคคีภัยที่อยู่อาศัย',
    effectiveDate: new Date('2027-01-01T00:00:00Z'),
    expiryDate: new Date('2028-01-01T00:00:00Z'),
  },
  customer,
  amounts: { net: '3333.33', stampDuty: '13.00', vat: '233.34', total: '3579.67' },
  paid: '1000.00',
  outstanding: '2579.67',
  bankAccounts: [{ bankName: 'ธนาคารกสิกรไทย', accountName: 'บจก. นายหน้า', accountNo: '123-4-56789-0' }],
  ...over,
});

const receiptData = (over: Partial<ReceiptDocumentData> = {}): ReceiptDocumentData => ({
  company,
  receipt: { receiptNo: 'RC-2026-000004', issuedAt: new Date('2026-10-09T05:00:00Z'), status: 'ISSUED', voidedAt: null, voidReason: null },
  payment: {
    paymentNo: 'PAY-2026-000009',
    paymentDate: new Date('2026-10-09T00:00:00Z'),
    method: 'TRANSFER',
    bank: 'KBank',
    referenceNo: 'TXN-77',
    remark: null,
    recordedBy: 'Sample Finance',
  },
  invoice: { invoiceNo: 'INV-2026-000007', installmentNo: 2, installmentTotal: 3, amount: '3579.67', paidToDate: '1000.00', balance: '2579.67' },
  policy: { policyNo: 'PL-2026-000003', insurerName: 'บริษัท ไทยประกันภัย จำกัด', productName: 'ประกันอัคคีภัย' },
  customer,
  amount: '1000.00',
  ...over,
});

describe('renderInvoiceHtml', () => {
  it('prints the stored amounts, baht text, due date and the company letterhead', () => {
    const html = renderInvoiceHtml(invoiceData(), 'FONT');
    expect(html).toContain('ใบแจ้งหนี้');
    expect(html).toContain('INV-2026-000007');
    expect(html).toContain('3,579.67');
    expect(html).toContain('2,579.67');
    expect(html).toContain('สามพันห้าร้อยเจ็ดสิบเก้าบาทหกสิบเจ็ดสตางค์');
    expect(html).toContain('บริษัท นายหน้า จำกัด');
    expect(html).toContain('0105551234567');
    expect(html).toContain('(งวดที่ 2/3)');
    expect(html).toContain('ครบกำหนดชำระ');
    expect(html).toContain('123-4-56789-0');
    expect(html).not.toContain('class="watermark"');
  });

  it('omits the installment label for a single-installment invoice', () => {
    const html = renderInvoiceHtml(
      invoiceData({ invoice: { ...invoiceData().invoice, installmentNo: null, installmentTotal: 1 } }),
      'FONT',
    );
    expect(html).not.toContain('งวดที่');
  });

  it('marks a cancelled invoice with a watermark and drops the payment instructions', () => {
    const html = renderInvoiceHtml(invoiceData({ invoice: { ...invoiceData().invoice, status: 'CANCELLED' } }), 'FONT');
    expect(html).toContain('class="watermark">ยกเลิก CANCELLED');
    expect(html).not.toContain('123-4-56789-0');
  });

  it('stamps a fully paid invoice PAID and drops the payment instructions', () => {
    const html = renderInvoiceHtml(
      invoiceData({ invoice: { ...invoiceData().invoice, status: 'PAID' }, paid: '3579.67', outstanding: '0.00' }),
      'FONT',
    );
    expect(html).toContain('stamp paid');
    expect(html).not.toContain('123-4-56789-0');
  });

  it('renders a debit note and a credit note with their own titles', () => {
    const debit = renderInvoiceHtml(invoiceData({ kind: 'DEBIT_NOTE' }), 'FONT');
    expect(debit).toContain('ใบเพิ่มหนี้');
    expect(debit).toContain('DEBIT NOTE');
    expect(debit).not.toContain('ครบกำหนดชำระ');
    expect(debit).not.toContain('ยอดค้างชำระ');

    const credit = renderInvoiceHtml(invoiceData({ kind: 'CREDIT_NOTE' }), 'FONT');
    expect(credit).toContain('ใบลดหนี้');
    expect(credit).toContain('CREDIT NOTE');
    expect(credit).toContain('-3,579.67');
  });

  it('escapes every dynamic value', () => {
    const html = renderInvoiceHtml(
      invoiceData({ customer: { ...customer, name: '<script>alert(1)</script>', address: '"><img src=x>' } }),
      'FONT',
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('renderReceiptHtml', () => {
  it('prints the receipt, payment details, baht text and the balance as of this payment', () => {
    const html = renderReceiptHtml(receiptData(), 'FONT');
    expect(html).toContain('ใบเสร็จรับเงิน');
    expect(html).toContain('RC-2026-000004');
    expect(html).toContain('INV-2026-000007');
    expect(html).toContain('โอนเงิน / Bank transfer');
    expect(html).toContain('TXN-77');
    expect(html).toContain('หนึ่งพันบาทถ้วน');
    expect(html).toContain('2,579.67');
    expect(html).not.toContain('class="watermark"');
  });

  it('marks a voided receipt with a watermark and the reason, and hides the running balance', () => {
    const html = renderReceiptHtml(
      receiptData({
        receipt: {
          receiptNo: 'RC-2026-000004',
          issuedAt: new Date('2026-10-09T05:00:00Z'),
          status: 'VOID',
          voidedAt: new Date('2026-10-10T05:00:00Z'),
          voidReason: 'Slip was wrong',
        },
      }),
      'FONT',
    );
    expect(html).toContain('class="watermark">ยกเลิก VOID');
    expect(html).toContain('Slip was wrong');
    expect(html).not.toContain('ชำระสะสมถึงครั้งนี้');
  });

  it('falls back to the raw method code for an unknown payment method', () => {
    expect(renderReceiptHtml(receiptData({ payment: { ...receiptData().payment, method: 'CRYPTO' } }), 'FONT')).toContain('CRYPTO');
  });

  it('escapes the remark and reference', () => {
    const html = renderReceiptHtml(
      receiptData({ payment: { ...receiptData().payment, remark: '<b>x</b>', referenceNo: '<i>y</i>' } }),
      'FONT',
    );
    expect(html).not.toContain('<b>x</b>');
    expect(html).not.toContain('<i>y</i>');
  });
});
