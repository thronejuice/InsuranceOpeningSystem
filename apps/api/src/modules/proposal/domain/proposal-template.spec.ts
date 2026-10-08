import { describe, expect, it } from 'vitest';
import { renderProposalFooter, renderProposalHtml, type ProposalDocumentData } from './proposal-template.js';

describe('ProposalTemplate', () => {
  const baseData: ProposalDocumentData = {
    company: {
      nameTh: 'บริษัท โบรกเกอร์ ประกันภัย จำกัด',
      nameEn: 'Broker Insurance Co., Ltd.',
      addressTh: '123 ถนนสุขุมวิท กรุงเทพฯ',
      addressEn: '123 Sukhumvit Rd, Bangkok',
      taxId: '0105550000000',
      brokerLicenseNo: 'ว00001/2560',
      phone: '02-123-4567',
      email: 'info@broker.co.th',
      website: 'www.broker.co.th',
      logoDataUri: null,
    },
    proposal: {
      proposalNo: 'PROP-2026-0001',
      version: 2,
      proposalDate: new Date('2026-10-01T00:00:00Z'),
      validUntil: new Date('2026-10-31T00:00:00Z'),
      remark: 'หมายเหตุพิเศษสำหรับข้อเสนอนี้',
      isDraft: false,
    },
    jobNo: 'JOB-2026-0001',
    customer: {
      name: 'สมชาย ใจดี',
      customerCode: 'CUST-001',
      idLabel: 'เลขประจำตัวประชาชน / ID No.',
      idNo: '1-1001-00000-00-1',
      address: '456 ถ.พหลโยธิน กรุงเทพฯ',
      contactName: null,
      phone: '081-234-5678',
      email: 'somchai@example.com',
    },
    insurance: {
      insuranceTypeName: 'ประกันภัยรถยนต์',
      productName: 'ประกันรถยนต์ชั้น 1',
      insurerName: 'วิริยะประกันภัย',
      quotationNo: 'QUOT-V-001',
      effectiveDate: new Date('2026-11-01T00:00:00Z'),
      expiryDate: new Date('2027-11-01T00:00:00Z'),
    },
    risks: [{ label: 'ทะเบียนรถ', value: '1กก 9999 กทม.' }],
    coverages: [
      {
        name: 'ความเสียหายต่อตัวรถยนต์',
        sumInsured: '500000',
        rate: null,
        deductible: null,
        premium: '15000',
        remark: null,
      },
    ],
    premium: {
      gross: '15000.00',
      discount: '0.00',
      net: '15000.00',
      stampDuty: '60.00',
      vat: '1054.20',
      total: '16114.20',
    },
    paymentTerm: {
      name: 'ผ่อนชำระ 3 งวด',
      code: 'INSTALLMENT_3',
      description: 'ผ่อน 3 งวด ห่างงวดละ 1 เดือน',
      installments: 3,
      intervalMonths: 1,
      firstDueDays: 30,
      schedule: [
        { installmentNo: 1, dueDate: new Date('2026-10-31T00:00:00Z'), amount: '5371.40' },
        { installmentNo: 2, dueDate: new Date('2026-11-30T00:00:00Z'), amount: '5371.40' },
        { installmentNo: 3, dueDate: new Date('2026-12-31T00:00:00Z'), amount: '5371.40' },
      ],
    },
    terms: ['ความคุ้มครองเริ่มมีผลเมื่อชำระเบี้ยประกันภัยครบถ้วน'],
    bankAccounts: [
      { bankName: 'กสิกรไทย', branch: 'สยาม', accountName: 'บจก. โบรกเกอร์', accountNo: '123-4-56789-0' },
    ],
    agent: { name: 'วิชัย ตัวแทน', email: 'wichai@broker.co.th' },
  };

  it('renders proposal version in header card', () => {
    const html = renderProposalHtml(baseData, '');
    expect(html).toContain('PROP-2026-0001');
    expect(html).toContain('v2');
    expect(html).toContain('ฉบับที่');
  });

  it('renders payment term and installments schedule', () => {
    const html = renderProposalHtml(baseData, '');
    expect(html).toContain('ผ่อนชำระ 3 งวด');
    expect(html).toContain('จำนวน 3 งวด');
    expect(html).toContain('งวดที่ 1');
    expect(html).toContain('งวดที่ 2');
    expect(html).toContain('งวดที่ 3');
    expect(html).toContain('5,371.40');
  });

  it('renders fallback when no payment term specified', () => {
    const dataWithoutTerm = { ...baseData, paymentTerm: null };
    const html = renderProposalHtml(dataWithoutTerm, '');
    expect(html).toContain('ชำระเต็มจำนวน / Full Payment');
  });

  it('renders proposal footer with version', () => {
    const footer = renderProposalFooter('PROP-2026-0001', 2);
    expect(footer).toContain('PROP-2026-0001 (v2)');
  });
});

