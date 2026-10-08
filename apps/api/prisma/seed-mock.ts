/**
 * Mock data: สร้าง Job ครอบคลุมทุก step ของ workflow
 * รัน: npm run db:seed:mock
 * ลบ mock data: ไปที่ DB แล้วลบ customer ที่ขึ้นต้น "Demo"
 */
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '../src/generated/prisma/client.js';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

const prisma = new PrismaClient();

// ─── IDs จาก seed ────────────────────────────────────────────────────────────
const USERS = {
  admin:   '01a0e7be-d481-74c3-a4fd-34d449d9d633',
  agent:   '01a0e7be-d48f-70b1-900a-573cd0ac83b5',
  agent01: '01a0fa26-3372-7283-aa12-c5767ad817a2',
  staff:   '01a0e7be-d496-7262-b41b-5229dd834368',
  manager: '01a0e7be-d4a8-75b0-a608-8cac02a15c01',
  finance: '01a0e7be-d4b0-7382-9b00-b64469fbd153',
};

const PRODUCTS = {
  FIRE:  '01a0fa26-33c2-77c0-a5ed-6dd2b50b78a0', // FIRE-001
  MOTOR: '01a0fa26-33be-7802-a4e0-743ade3450c6', // MOTOR-001
  PA:    '01a10bbc-ef9b-7871-8254-fe613fa01013', // PA-001
  CYBER: '01a10bbc-efb8-7e03-9fc5-f5cb012c4d7b', // CYBER-001
};

const TYPES = {
  FIRE:  '01a0fa26-33a2-7891-b536-87d9ba9277e0',
  MOTOR: '01a0fa26-339c-7d63-b035-a3d050197024',
  PA:    '01a0fa26-33ae-7310-b8c6-b305c96483aa',
  CYBER: '01a0fa26-33b4-7042-9465-5b7bf9b3d3e4',
};

const COMPANIES = {
  THAI_INSURANCE: '01a0fa26-3465-7012-acfa-29e6bf9a8426',
  ASIA_INSURANCE: '01a0fa26-346b-7422-bf0c-6b96e62db9af',
  SIAM_INSURANCE: '01a0fa26-346e-78b3-84a5-1ccab23b592f',
};

const COVERAGES = {
  FIRE_MAIN:    '01a0fa26-342d-7920-974f-31223d34e58c',
  FIRE_FLOOD:   '01a0fa26-3433-78a2-879c-645a85898db1',
  MOTOR_DAMAGE: '01a0fa26-341d-7af1-910b-35e069f2a4f9',
  MOTOR_LIAB:   '01a0fa26-3422-7aa3-8977-1be13c87049c',
  PA_DEATH:     '01a10c13-24de-7eb3-990f-5b73891c3c9a',
  PA_MED:       '01a10c13-24e1-7f73-8145-7465c1ce9fd3',
  CYBER_BREACH: '01a10c13-2511-73d2-a178-4408190f5a30',
  CYBER_RESP:   '01a10c13-2513-7ff3-ae55-5ca947ce1022',
};

// ─── Sequence helper (ต่อจากค่าล่าสุดใน DB) ──────────────────────────────────
async function nextSeq(prefix: string, year = 0): Promise<string> {
  const result = await prisma.$queryRaw<Array<{ last_value: number }>>`
    UPDATE document_sequences
    SET last_value = last_value + 1, updated_at = NOW()
    WHERE prefix = ${prefix} AND year = ${year}
    RETURNING last_value
  `;
  if (result.length === 0) {
    await prisma.$executeRaw`
      INSERT INTO document_sequences (prefix, year, last_value, updated_at)
      VALUES (${prefix}, ${year}, 1, NOW())
    `;
    return padSeq(prefix, year, 1);
  }
  return padSeq(prefix, year, result[0].last_value);
}

function padSeq(prefix: string, year: number, val: number): string {
  const yStr = year > 0 ? `-${year}-` : '-';
  return `${prefix}${yStr}${String(val).padStart(6, '0')}`;
}

async function nextJob()      { return nextSeq('JOB', 2026); }
async function nextQuote()    { return nextSeq('QT', 2026); }
async function nextProposal() { return nextSeq('PP', 2026); }
async function nextPolicy()   { return nextSeq('POL', 2026); }
async function nextPayment()  { return nextSeq('PAY', 2026); }
async function nextCustomer() { return nextSeq('CUS', 0); }

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 Creating mock data — all workflow steps...\n');

  // ─── Customers ────────────────────────────────────────────────────────────
  const custCorp = await prisma.customer.create({
    data: {
      customerCode: await nextCustomer(),
      customerType: 'CORPORATE',
      companyName: 'Demo บริษัท เทสต์คอร์ป จำกัด',
      taxId: '9876543210123',
      email: 'corp@demo.local',
      phone: '021234567',
      createdById: USERS.admin,
    },
  });

  const custIndiv = await prisma.customer.create({
    data: {
      customerCode: await nextCustomer(),
      customerType: 'INDIVIDUAL',
      firstName: 'Demo',
      lastName: 'สมชาย ใจดี',
      citizenId: '1234567890123',
      email: 'somchai@demo.local',
      mobile: '0812345678',
      createdById: USERS.admin,
    },
  });

  console.log('✅ Customers:', custCorp.customerCode, '|', custIndiv.customerCode);

  // ─── 1. DRAFT ─────────────────────────────────────────────────────────────
  const jobDraft = await prisma.job.create({
    data: {
      jobNo: await nextJob(),
      customerId: custCorp.id,
      insuranceTypeId: TYPES.FIRE,
      productId: PRODUCTS.FIRE,
      agentId: USERS.agent01,
      assignedTo: USERS.staff,
      status: 'DRAFT',
      effectiveDate: new Date('2026-11-01'),
      expiryDate: new Date('2027-11-01'),
      createdById: USERS.admin,
    },
  });
  console.log('✅ DRAFT:', jobDraft.jobNo);

  // ─── 2. OPEN ──────────────────────────────────────────────────────────────
  const jobOpen = await prisma.job.create({
    data: {
      jobNo: await nextJob(),
      customerId: custCorp.id,
      insuranceTypeId: TYPES.FIRE,
      productId: PRODUCTS.FIRE,
      agentId: USERS.agent01,
      assignedTo: USERS.staff,
      status: 'OPEN',
      effectiveDate: new Date('2026-11-01'),
      expiryDate: new Date('2027-11-01'),
      createdById: USERS.admin,
    },
  });
  console.log('✅ OPEN:', jobOpen.jobNo);

  // ─── 3. WAITING_INFORMATION ───────────────────────────────────────────────
  const jobWaiting = await prisma.job.create({
    data: {
      jobNo: await nextJob(),
      customerId: custIndiv.id,
      insuranceTypeId: TYPES.MOTOR,
      productId: PRODUCTS.MOTOR,
      agentId: USERS.agent01,
      status: 'WAITING_INFORMATION',
      effectiveDate: new Date('2026-11-01'),
      expiryDate: new Date('2027-11-01'),
      createdById: USERS.admin,
    },
  });
  console.log('✅ WAITING_INFORMATION:', jobWaiting.jobNo);

  // ─── 4. QUOTATION_REQUESTED ───────────────────────────────────────────────
  const jobQtReq = await prisma.job.create({
    data: {
      jobNo: await nextJob(),
      customerId: custCorp.id,
      insuranceTypeId: TYPES.PA,
      productId: PRODUCTS.PA,
      agentId: USERS.agent01,
      assignedTo: USERS.staff,
      status: 'QUOTATION_REQUESTED',
      effectiveDate: new Date('2026-11-01'),
      expiryDate: new Date('2027-11-01'),
      createdById: USERS.admin,
    },
  });
  const qtReq = await prisma.quotation.create({
    data: {
      quotationNo: await nextQuote(),
      jobId: jobQtReq.id,
      insuranceCompanyId: COMPANIES.THAI_INSURANCE,
      status: 'REQUESTED',
      requestedById: USERS.staff,
    },
  });
  console.log('✅ QUOTATION_REQUESTED:', jobQtReq.jobNo, '|', qtReq.quotationNo);

  // ─── 5. QUOTATION_RECEIVED ────────────────────────────────────────────────
  const jobQtRcv = await prisma.job.create({
    data: {
      jobNo: await nextJob(),
      customerId: custCorp.id,
      insuranceTypeId: TYPES.PA,
      productId: PRODUCTS.PA,
      agentId: USERS.agent01,
      assignedTo: USERS.staff,
      status: 'QUOTATION_RECEIVED',
      effectiveDate: new Date('2026-11-01'),
      expiryDate: new Date('2027-11-01'),
      createdById: USERS.admin,
    },
  });
  await prisma.quotation.create({
    data: {
      quotationNo: await nextQuote(),
      jobId: jobQtRcv.id,
      insuranceCompanyId: COMPANIES.THAI_INSURANCE,
      quotationDate: new Date('2026-10-05'),
      validUntil: new Date('2026-11-05'),
      status: 'RECEIVED',
      grossPremium: '12000',
      discount: '0',
      netPremium: '12000',
      tax: '840',
      stampDuty: '60',
      totalAmount: '12900',
      requestedById: USERS.staff,
      items: {
        create: [
          { coverageId: COVERAGES.PA_DEATH, coverageName: 'เสียชีวิต/สูญเสียอวัยวะ', sumInsured: '1000000', rate: '0.01', premium: '10000' },
          { coverageId: COVERAGES.PA_MED,   coverageName: 'ค่ารักษาพยาบาล',           sumInsured: '100000',  rate: '0.02', premium: '2000' },
        ],
      },
    },
  });
  await prisma.quotation.create({
    data: {
      quotationNo: await nextQuote(),
      jobId: jobQtRcv.id,
      insuranceCompanyId: COMPANIES.ASIA_INSURANCE,
      quotationDate: new Date('2026-10-05'),
      validUntil: new Date('2026-11-05'),
      status: 'RECEIVED',
      grossPremium: '11500',
      discount: '0',
      netPremium: '11500',
      tax: '805',
      stampDuty: '57',
      totalAmount: '12362',
      requestedById: USERS.staff,
      items: {
        create: [
          { coverageId: COVERAGES.PA_DEATH, coverageName: 'เสียชีวิต/สูญเสียอวัยวะ', sumInsured: '1000000', rate: '0.0095', premium: '9500' },
          { coverageId: COVERAGES.PA_MED,   coverageName: 'ค่ารักษาพยาบาล',           sumInsured: '100000',  rate: '0.02',   premium: '2000' },
        ],
      },
    },
  });
  console.log('✅ QUOTATION_RECEIVED:', jobQtRcv.jobNo, '(2 quotes)');

  // ─── 6. QUOTATION_SELECTED ────────────────────────────────────────────────
  const jobQtSel = await prisma.job.create({
    data: {
      jobNo: await nextJob(),
      customerId: custCorp.id,
      insuranceTypeId: TYPES.FIRE,
      productId: PRODUCTS.FIRE,
      agentId: USERS.agent01,
      assignedTo: USERS.staff,
      status: 'QUOTATION_SELECTED',
      effectiveDate: new Date('2026-11-01'),
      expiryDate: new Date('2027-11-01'),
      createdById: USERS.admin,
    },
  });
  const qtSelA = await prisma.quotation.create({
    data: {
      quotationNo: await nextQuote(),
      jobId: jobQtSel.id,
      insuranceCompanyId: COMPANIES.THAI_INSURANCE,
      quotationDate: new Date('2026-10-04'),
      validUntil: new Date('2026-11-04'),
      status: 'SELECTED',
      grossPremium: '45000',
      discount: '0',
      netPremium: '45000',
      tax: '3150',
      stampDuty: '225',
      totalAmount: '48375',
      requestedById: USERS.staff,
      items: {
        create: [
          { coverageId: COVERAGES.FIRE_MAIN,  coverageName: 'อัคคีภัย',   sumInsured: '5000000', rate: '0.005', premium: '25000' },
          { coverageId: COVERAGES.FIRE_FLOOD, coverageName: 'ภัยน้ำท่วม', sumInsured: '5000000', rate: '0.004', premium: '20000' },
        ],
      },
    },
  });
  await prisma.quotation.create({
    data: {
      quotationNo: await nextQuote(),
      jobId: jobQtSel.id,
      insuranceCompanyId: COMPANIES.ASIA_INSURANCE,
      quotationDate: new Date('2026-10-04'),
      validUntil: new Date('2026-11-04'),
      status: 'RECEIVED',
      grossPremium: '48000',
      discount: '0',
      netPremium: '48000',
      tax: '3360',
      stampDuty: '240',
      totalAmount: '51600',
      requestedById: USERS.staff,
      items: {
        create: [
          { coverageId: COVERAGES.FIRE_MAIN,  coverageName: 'อัคคีภัย',   sumInsured: '5000000', rate: '0.0056', premium: '28000' },
          { coverageId: COVERAGES.FIRE_FLOOD, coverageName: 'ภัยน้ำท่วม', sumInsured: '5000000', rate: '0.004',  premium: '20000' },
        ],
      },
    },
  });
  await prisma.job.update({
    where: { id: jobQtSel.id },
    data: { selectedQuotationId: qtSelA.id },
  });
  console.log('✅ QUOTATION_SELECTED:', jobQtSel.jobNo);

  // ─── 7. WAITING_CUSTOMER (Proposal Sent) ──────────────────────────────────
  const jobWaitCust = await prisma.job.create({
    data: {
      jobNo: await nextJob(),
      customerId: custCorp.id,
      insuranceTypeId: TYPES.MOTOR,
      productId: PRODUCTS.MOTOR,
      agentId: USERS.agent01,
      assignedTo: USERS.staff,
      status: 'WAITING_CUSTOMER',
      effectiveDate: new Date('2026-11-01'),
      expiryDate: new Date('2027-11-01'),
      createdById: USERS.admin,
    },
  });
  const qtMotor = await prisma.quotation.create({
    data: {
      quotationNo: await nextQuote(),
      jobId: jobWaitCust.id,
      insuranceCompanyId: COMPANIES.SIAM_INSURANCE,
      quotationDate: new Date('2026-10-03'),
      validUntil: new Date('2026-11-03'),
      status: 'SELECTED',
      grossPremium: '25000',
      netPremium: '25000',
      tax: '1750',
      stampDuty: '125',
      totalAmount: '26875',
      requestedById: USERS.staff,
      items: {
        create: [
          { coverageId: COVERAGES.MOTOR_DAMAGE, coverageName: 'ความเสียหายต่อรถ',        sumInsured: '500000', rate: '0.03', premium: '15000' },
          { coverageId: COVERAGES.MOTOR_LIAB,   coverageName: 'ความรับผิดต่อบุคคลภายนอก', sumInsured: '500000', rate: '0.02', premium: '10000' },
        ],
      },
    },
  });
  await prisma.job.update({
    where: { id: jobWaitCust.id },
    data: { selectedQuotationId: qtMotor.id },
  });
  await prisma.proposal.create({
    data: {
      proposalNo: await nextProposal(),
      jobId: jobWaitCust.id,
      quotationId: qtMotor.id,
      customerId: custCorp.id,
      proposalDate: new Date('2026-10-05'),
      validUntil: new Date('2026-11-05'),
      status: 'SENT',
      sentAt: new Date('2026-10-05'),
      createdById: USERS.staff,
    },
  });
  console.log('✅ WAITING_CUSTOMER:', jobWaitCust.jobNo);

  // ─── 8. WAITING_APPROVAL ──────────────────────────────────────────────────
  const jobWaitApproval = await prisma.job.create({
    data: {
      jobNo: await nextJob(),
      customerId: custCorp.id,
      insuranceTypeId: TYPES.FIRE,
      productId: PRODUCTS.FIRE,
      agentId: USERS.agent01,
      assignedTo: USERS.staff,
      status: 'WAITING_APPROVAL',
      effectiveDate: new Date('2026-11-01'),
      expiryDate: new Date('2027-11-01'),
      createdById: USERS.admin,
    },
  });
  const qtApproval = await prisma.quotation.create({
    data: {
      quotationNo: await nextQuote(),
      jobId: jobWaitApproval.id,
      insuranceCompanyId: COMPANIES.THAI_INSURANCE,
      quotationDate: new Date('2026-10-03'),
      validUntil: new Date('2026-11-03'),
      status: 'SELECTED',
      grossPremium: '120000',
      netPremium: '120000',
      tax: '8400',
      stampDuty: '600',
      totalAmount: '129000',
      requestedById: USERS.staff,
      items: {
        create: [
          { coverageId: COVERAGES.FIRE_MAIN,  coverageName: 'อัคคีภัย',   sumInsured: '20000000', rate: '0.003', premium: '60000' },
          { coverageId: COVERAGES.FIRE_FLOOD, coverageName: 'ภัยน้ำท่วม', sumInsured: '15000000', rate: '0.004', premium: '60000' },
        ],
      },
    },
  });
  await prisma.job.update({
    where: { id: jobWaitApproval.id },
    data: { selectedQuotationId: qtApproval.id },
  });
  const propApproval = await prisma.proposal.create({
    data: {
      proposalNo: await nextProposal(),
      jobId: jobWaitApproval.id,
      quotationId: qtApproval.id,
      customerId: custCorp.id,
      proposalDate: new Date('2026-10-04'),
      validUntil: new Date('2026-11-04'),
      status: 'ACCEPTED',
      sentAt: new Date('2026-10-04'),
      acceptedAt: new Date('2026-10-05'),
      createdById: USERS.staff,
    },
  });
  await prisma.approval.create({
    data: {
      jobId: jobWaitApproval.id,
      proposalId: propApproval.id,
      approvalType: 'MANAGER',
      requestedById: USERS.staff,
      status: 'PENDING',
    },
  });
  console.log('✅ WAITING_APPROVAL:', jobWaitApproval.jobNo);

  // ─── 9. APPROVED ──────────────────────────────────────────────────────────
  const jobApproved = await prisma.job.create({
    data: {
      jobNo: await nextJob(),
      customerId: custCorp.id,
      insuranceTypeId: TYPES.FIRE,
      productId: PRODUCTS.FIRE,
      agentId: USERS.agent01,
      assignedTo: USERS.staff,
      status: 'APPROVED',
      effectiveDate: new Date('2026-11-01'),
      expiryDate: new Date('2027-11-01'),
      createdById: USERS.admin,
    },
  });
  const qtApproved = await prisma.quotation.create({
    data: {
      quotationNo: await nextQuote(),
      jobId: jobApproved.id,
      insuranceCompanyId: COMPANIES.ASIA_INSURANCE,
      quotationDate: new Date('2026-10-02'),
      validUntil: new Date('2026-11-02'),
      status: 'SELECTED',
      grossPremium: '38000',
      netPremium: '38000',
      tax: '2660',
      stampDuty: '190',
      totalAmount: '40850',
      requestedById: USERS.staff,
      items: {
        create: [
          { coverageId: COVERAGES.FIRE_MAIN,  coverageName: 'อัคคีภัย',   sumInsured: '8000000', rate: '0.003', premium: '24000' },
          { coverageId: COVERAGES.FIRE_FLOOD, coverageName: 'ภัยน้ำท่วม', sumInsured: '7000000', rate: '0.002', premium: '14000' },
        ],
      },
    },
  });
  await prisma.job.update({
    where: { id: jobApproved.id },
    data: { selectedQuotationId: qtApproved.id },
  });
  const propApproved = await prisma.proposal.create({
    data: {
      proposalNo: await nextProposal(),
      jobId: jobApproved.id,
      quotationId: qtApproved.id,
      customerId: custCorp.id,
      proposalDate: new Date('2026-10-03'),
      status: 'ACCEPTED',
      sentAt: new Date('2026-10-03'),
      acceptedAt: new Date('2026-10-04'),
      createdById: USERS.staff,
    },
  });
  await prisma.approval.create({
    data: {
      jobId: jobApproved.id,
      proposalId: propApproved.id,
      approvalType: 'MANAGER',
      requestedById: USERS.staff,
      approverId: USERS.manager,
      status: 'APPROVED',
      approvedAt: new Date('2026-10-05'),
    },
  });
  console.log('✅ APPROVED:', jobApproved.jobNo);

  // ─── 10. POLICY_PENDING (Binding done) ───────────────────────────────────
  const jobPolicyPending = await prisma.job.create({
    data: {
      jobNo: await nextJob(),
      customerId: custCorp.id,
      insuranceTypeId: TYPES.MOTOR,
      productId: PRODUCTS.MOTOR,
      agentId: USERS.agent01,
      assignedTo: USERS.staff,
      status: 'POLICY_PENDING',
      effectiveDate: new Date('2026-11-01'),
      expiryDate: new Date('2027-11-01'),
      createdById: USERS.admin,
    },
  });
  const qtPolicyPending = await prisma.quotation.create({
    data: {
      quotationNo: await nextQuote(),
      jobId: jobPolicyPending.id,
      insuranceCompanyId: COMPANIES.SIAM_INSURANCE,
      quotationDate: new Date('2026-10-01'),
      validUntil: new Date('2026-11-01'),
      status: 'SELECTED',
      grossPremium: '18500',
      netPremium: '18500',
      tax: '1295',
      stampDuty: '92',
      totalAmount: '19887',
      requestedById: USERS.staff,
      items: {
        create: [
          { coverageId: COVERAGES.MOTOR_DAMAGE, coverageName: 'ความเสียหายต่อรถ',        sumInsured: '350000', rate: '0.025', premium: '8750' },
          { coverageId: COVERAGES.MOTOR_LIAB,   coverageName: 'ความรับผิดต่อบุคคลภายนอก', sumInsured: '500000', rate: '0.019', premium: '9750' },
        ],
      },
    },
  });
  await prisma.job.update({
    where: { id: jobPolicyPending.id },
    data: { selectedQuotationId: qtPolicyPending.id },
  });
  const propPP = await prisma.proposal.create({
    data: {
      proposalNo: await nextProposal(),
      jobId: jobPolicyPending.id,
      quotationId: qtPolicyPending.id,
      customerId: custCorp.id,
      proposalDate: new Date('2026-10-02'),
      status: 'ACCEPTED',
      sentAt: new Date('2026-10-02'),
      acceptedAt: new Date('2026-10-03'),
      createdById: USERS.staff,
    },
  });
  await prisma.approval.create({
    data: {
      jobId: jobPolicyPending.id,
      proposalId: propPP.id,
      approvalType: 'SUPERVISOR',
      requestedById: USERS.staff,
      approverId: USERS.manager,
      status: 'APPROVED',
      approvedAt: new Date('2026-10-03'),
    },
  });
  await prisma.binding.create({
    data: {
      jobId: jobPolicyPending.id,
      quotationId: qtPolicyPending.id,
      bindingDate: new Date('2026-10-04'),
      effectiveDate: new Date('2026-11-01'),
      expiryDate: new Date('2027-11-01'),
      confirmedById: USERS.staff,
    },
  });
  console.log('✅ POLICY_PENDING:', jobPolicyPending.jobNo);

  // ─── 11. POLICY_ISSUED (full journey + Payment + Commission) ──────────────
  const jobIssued = await prisma.job.create({
    data: {
      jobNo: await nextJob(),
      customerId: custIndiv.id,
      insuranceTypeId: TYPES.PA,
      productId: PRODUCTS.PA,
      agentId: USERS.agent01,
      assignedTo: USERS.staff,
      status: 'POLICY_ISSUED',
      effectiveDate: new Date('2026-10-01'),
      expiryDate: new Date('2027-10-01'),
      createdById: USERS.admin,
    },
  });
  const qtIssued = await prisma.quotation.create({
    data: {
      quotationNo: await nextQuote(),
      jobId: jobIssued.id,
      insuranceCompanyId: COMPANIES.THAI_INSURANCE,
      quotationDate: new Date('2026-09-25'),
      validUntil: new Date('2026-10-25'),
      status: 'SELECTED',
      grossPremium: '8000',
      netPremium: '8000',
      tax: '560',
      stampDuty: '40',
      totalAmount: '8600',
      requestedById: USERS.staff,
      items: {
        create: [
          { coverageId: COVERAGES.PA_DEATH, coverageName: 'เสียชีวิต/สูญเสียอวัยวะ/ทุพพลภาพ', sumInsured: '500000', rate: '0.008', premium: '4000' },
          { coverageId: COVERAGES.PA_MED,   coverageName: 'ค่ารักษาพยาบาลจากอุบัติเหตุ',       sumInsured: '200000', rate: '0.02',  premium: '4000' },
        ],
      },
    },
  });
  await prisma.job.update({
    where: { id: jobIssued.id },
    data: { selectedQuotationId: qtIssued.id },
  });
  const propIssued = await prisma.proposal.create({
    data: {
      proposalNo: await nextProposal(),
      jobId: jobIssued.id,
      quotationId: qtIssued.id,
      customerId: custIndiv.id,
      proposalDate: new Date('2026-09-26'),
      status: 'ACCEPTED',
      sentAt: new Date('2026-09-26'),
      acceptedAt: new Date('2026-09-27'),
      createdById: USERS.staff,
    },
  });
  await prisma.approval.create({
    data: {
      jobId: jobIssued.id,
      proposalId: propIssued.id,
      approvalType: 'SUPERVISOR',
      requestedById: USERS.staff,
      approverId: USERS.manager,
      status: 'APPROVED',
      approvedAt: new Date('2026-09-28'),
    },
  });
  await prisma.binding.create({
    data: {
      jobId: jobIssued.id,
      quotationId: qtIssued.id,
      bindingDate: new Date('2026-09-29'),
      effectiveDate: new Date('2026-10-01'),
      expiryDate: new Date('2027-10-01'),
      confirmedById: USERS.staff,
    },
  });
  const policyNo = await nextPolicy();
  const policy = await prisma.policy.create({
    data: {
      policyNo,
      jobId: jobIssued.id,
      quotationId: qtIssued.id,
      insuranceCompanyId: COMPANIES.THAI_INSURANCE,
      effectiveDate: new Date('2026-10-01'),
      expiryDate: new Date('2027-10-01'),
      grossPremium: '8000',
      netPremium: '8000',
      tax: '560',
      stampDuty: '40',
      totalPremium: '8600',
      status: 'ISSUED',
      issuedAt: new Date('2026-09-30'),
      paymentDueDate: new Date('2026-10-15'),
      createdById: USERS.admin,
      coverages: {
        create: [
          { coverageId: COVERAGES.PA_DEATH, coverageName: 'เสียชีวิต/สูญเสียอวัยวะ/ทุพพลภาพ', sumInsured: '500000', rate: '0.008', premium: '4000' },
          { coverageId: COVERAGES.PA_MED,   coverageName: 'ค่ารักษาพยาบาลจากอุบัติเหตุ',       sumInsured: '200000', rate: '0.02',  premium: '4000' },
        ],
      },
    },
  });
  const paymentNo = await nextPayment();
  await prisma.payment.create({
    data: {
      paymentNo,
      policyId: policy.id,
      paymentDate: new Date('2026-10-08'),
      amount: '8600',
      paymentMethod: 'TRANSFER',
      referenceNo: 'REF-20261008-001',
      status: 'ACTIVE',
      createdById: USERS.finance,
    },
  });
  await prisma.commission.create({
    data: {
      policyId: policy.id,
      agentId: USERS.agent01,
      commissionType: 'AGENT',
      commissionRate: '0.15',
      commissionBase: '8000',
      commissionAmount: '1200',
      status: 'CALCULATED',
      createdById: USERS.finance,
    },
  });
  console.log('✅ POLICY_ISSUED:', jobIssued.jobNo, '| Policy:', policyNo);

  // ─── 12. CUSTOMER_REJECTED → CLOSED ──────────────────────────────────────
  const jobRejected = await prisma.job.create({
    data: {
      jobNo: await nextJob(),
      customerId: custIndiv.id,
      insuranceTypeId: TYPES.MOTOR,
      productId: PRODUCTS.MOTOR,
      agentId: USERS.agent01,
      status: 'CUSTOMER_REJECTED',
      effectiveDate: new Date('2026-11-01'),
      expiryDate: new Date('2027-11-01'),
      createdById: USERS.admin,
    },
  });
  const qtRej = await prisma.quotation.create({
    data: {
      quotationNo: await nextQuote(),
      jobId: jobRejected.id,
      insuranceCompanyId: COMPANIES.ASIA_INSURANCE,
      quotationDate: new Date('2026-10-01'),
      validUntil: new Date('2026-11-01'),
      status: 'SELECTED',
      grossPremium: '32000',
      netPremium: '32000',
      tax: '2240',
      stampDuty: '160',
      totalAmount: '34400',
      requestedById: USERS.staff,
      items: {
        create: [
          { coverageId: COVERAGES.MOTOR_DAMAGE, coverageName: 'ความเสียหายต่อรถ', sumInsured: '700000', rate: '0.03', premium: '21000' },
          { coverageId: COVERAGES.MOTOR_LIAB,   coverageName: 'ความรับผิดต่อบุคคลภายนอก', sumInsured: '500000', rate: '0.022', premium: '11000' },
        ],
      },
    },
  });
  await prisma.job.update({
    where: { id: jobRejected.id },
    data: { selectedQuotationId: qtRej.id },
  });
  await prisma.proposal.create({
    data: {
      proposalNo: await nextProposal(),
      jobId: jobRejected.id,
      quotationId: qtRej.id,
      customerId: custIndiv.id,
      proposalDate: new Date('2026-10-02'),
      status: 'REJECTED',
      sentAt: new Date('2026-10-02'),
      rejectedAt: new Date('2026-10-04'),
      rejectReason: 'PRICE',
      createdById: USERS.staff,
    },
  });
  console.log('✅ CUSTOMER_REJECTED:', jobRejected.jobNo);

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n🎉 Mock data created successfully!\n');
  console.log('Jobs created:');
  const jobs = [
    jobDraft, jobOpen, jobWaiting, jobQtReq, jobQtRcv,
    jobQtSel, jobWaitCust, jobWaitApproval, jobApproved,
    jobPolicyPending, jobIssued, jobRejected,
  ];
  for (const j of jobs) {
    console.log(`  ${j.jobNo.padEnd(20)} → ${j.status}`);
  }
  console.log('\nLogin: admin / Password@123');
  console.log('URL: http://localhost:4200/jobs');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
