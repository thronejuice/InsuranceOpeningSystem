/**
 * Mock data: งานต่ออายุ (Renewal) และงานติดตาม (Task)
 * รัน: npm run db:seed:mock:renewal -w apps/api   (ต้องรัน db:seed ก่อน; ไม่ต้องพึ่ง db:seed:mock)
 * รันซ้ำได้: ถ้ามีลูกค้า "Demo Renewal" อยู่แล้วจะข้าม
 */
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '../src/generated/prisma/client.js';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

const prisma = new PrismaClient();
const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY);
const dateOnly = (d: Date) => new Date(d.toISOString().slice(0, 10));
const YEAR = new Date().getFullYear();

async function nextSeq(prefix: string, year: number): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ last_value: number }>>`
    UPDATE document_sequences SET last_value = last_value + 1, updated_at = NOW()
    WHERE prefix = ${prefix} AND year = ${year} RETURNING last_value`;
  let value = rows[0]?.last_value;
  if (value === undefined) {
    await prisma.$executeRaw`
      INSERT INTO document_sequences (prefix, year, last_value, updated_at) VALUES (${prefix}, ${year}, 1, NOW())`;
    value = 1;
  }
  return `${prefix}${year > 0 ? `-${year}-` : '-'}${String(value).padStart(6, '0')}`;
}

async function main() {
  const existing = await prisma.customer.findFirst({ where: { companyName: { startsWith: 'Demo Renewal' } } });
  if (existing) {
    console.log('Demo Renewal data already exists — skipped');
    return;
  }

  const user = async (username: string) => (await prisma.user.findUniqueOrThrow({ where: { username } })).id;
  const [admin, agent01, staff, supervisor] = await Promise.all([
    user('admin'), user('agent01'), user('staff'), user('supervisor'),
  ]);
  const company = await prisma.insuranceCompany.findFirstOrThrow({ where: { code: 'INS-TH001' } });
  const product = await prisma.insuranceProduct.findUniqueOrThrow({ where: { code: 'PA-001' } });

  const customer = await prisma.customer.create({
    data: {
      customerCode: await nextSeq('CUS', 0),
      customerType: 'CORPORATE',
      companyName: 'Demo Renewal บริษัท ต่ออายุ จำกัด',
      taxId: '0105559999999',
      email: 'renewal@demo.local',
      phone: '021112222',
      createdById: admin,
    },
  });

  // กรมธรรม์ 4 ฉบับ หมดอายุต่างกัน เพื่อให้เห็นทั้งใกล้หมด/เลยกำหนด
  const policySpecs = [
    { label: 'เลยกำหนด 5 วัน', expiryIn: -5, renewal: 'PENDING' as const },
    { label: 'อีก 10 วัน', expiryIn: 10, renewal: 'IN_PROGRESS' as const },
    { label: 'อีก 30 วัน', expiryIn: 30, renewal: 'CUSTOMER_CONTACTED' as const },
    { label: 'อีก 60 วัน', expiryIn: 60, renewal: 'QUOTATION' as const },
  ];

  const jobs: { id: string; jobNo: string }[] = [];
  for (const spec of policySpecs) {
    const expiry = dateOnly(daysFromNow(spec.expiryIn));
    const effective = dateOnly(new Date(expiry.getTime() - 365 * DAY));

    const job = await prisma.job.create({
      data: {
        jobNo: await nextSeq('JOB', YEAR),
        customerId: customer.id,
        insuranceTypeId: product.insuranceTypeId,
        productId: product.id,
        agentId: agent01,
        assignedTo: staff,
        status: 'POLICY_ISSUED',
        effectiveDate: effective,
        expiryDate: expiry,
        remark: `Demo Renewal — ${spec.label}`,
        createdById: admin,
      },
    });
    const quotation = await prisma.quotation.create({
      data: {
        quotationNo: await nextSeq('QT', YEAR),
        jobId: job.id,
        insuranceCompanyId: company.id,
        quotationDate: effective,
        status: 'SELECTED',
        grossPremium: '8000', netPremium: '8000', tax: '560', stampDuty: '40', totalAmount: '8600',
        requestedById: staff,
      },
    });
    await prisma.job.update({ where: { id: job.id }, data: { selectedQuotationId: quotation.id } });
    const policy = await prisma.policy.create({
      data: {
        policyNo: await nextSeq('POL', YEAR),
        jobId: job.id,
        quotationId: quotation.id,
        insuranceCompanyId: company.id,
        effectiveDate: effective,
        expiryDate: expiry,
        grossPremium: '8000', netPremium: '8000', tax: '560', stampDuty: '40', totalPremium: '8600',
        status: 'ISSUED',
        issuedAt: effective,
        createdById: admin,
      },
    });
    await prisma.renewal.create({
      data: {
        previousPolicyId: policy.id,
        renewalDate: dateOnly(new Date(expiry.getTime() - 45 * DAY)),
        targetExpiryDate: expiry,
        status: spec.renewal,
        assignedTo: staff,
        remark: `Demo — ${spec.label}`,
      },
    });
    jobs.push({ id: job.id, jobNo: job.jobNo });
  }

  // งานติดตาม หลายประเภท/สถานะ/กำหนดส่ง (รวมเลยกำหนดและวันนี้)
  const tasks = [
    { job: 0, taskType: 'RENEWAL', subject: 'โทรหาลูกค้าเรื่องต่ออายุ (เลยกำหนดแล้ว)', dueIn: -3, priority: 'URGENT', status: 'TODO', assignee: staff },
    { job: 0, taskType: 'FOLLOW_UP_POLICY', subject: 'ตรวจสอบเงื่อนไขกรมธรรม์เดิมก่อนต่ออายุ', dueIn: -1, priority: 'HIGH', status: 'IN_PROGRESS', assignee: staff },
    { job: 1, taskType: 'REQUEST_QUOTATION', subject: 'ขอใบเสนอราคาต่ออายุจากบริษัทประกัน', dueIn: 0, priority: 'HIGH', status: 'TODO', assignee: staff },
    { job: 1, taskType: 'REQUEST_DOCUMENT', subject: 'ขอเอกสารอัปเดตจากลูกค้า', dueIn: 2, priority: 'MEDIUM', status: 'TODO', assignee: agent01 },
    { job: 2, taskType: 'CALL_CUSTOMER', subject: 'นัดหมายลูกค้าเพื่อสรุปแผนความคุ้มครอง', dueIn: 5, priority: 'MEDIUM', status: 'IN_PROGRESS', assignee: agent01 },
    { job: 2, taskType: 'SEND_PROPOSAL', subject: 'ส่ง Proposal ต่ออายุให้ลูกค้า', dueIn: 7, priority: 'MEDIUM', status: 'TODO', assignee: staff },
    { job: 3, taskType: 'FOLLOW_UP_QUOTATION', subject: 'ติดตามใบเสนอราคาที่ยังไม่ตอบกลับ', dueIn: 10, priority: 'LOW', status: 'TODO', assignee: supervisor },
    { job: 3, taskType: 'FOLLOW_UP_PAYMENT', subject: 'ติดตามการชำระเบี้ยงวดก่อน', dueIn: -7, priority: 'MEDIUM', status: 'DONE', assignee: staff },
    { job: 3, taskType: 'OTHER', subject: 'งานที่ยกเลิกแล้ว (ตัวอย่าง)', dueIn: 3, priority: 'LOW', status: 'CANCELLED', assignee: staff },
  ] as const;

  for (const t of tasks) {
    await prisma.task.create({
      data: {
        jobId: jobs[t.job].id,
        assignedTo: t.assignee,
        taskType: t.taskType,
        subject: t.subject,
        dueDate: daysFromNow(t.dueIn),
        priority: t.priority,
        status: t.status,
        completedAt: t.status === 'DONE' ? daysFromNow(t.dueIn) : null,
        completedById: t.status === 'DONE' ? t.assignee : null,
        createdById: admin,
      },
    });
  }

  console.log(`Created customer ${customer.customerCode}, ${jobs.length} policies/renewals, ${tasks.length} tasks`);
  for (const j of jobs) console.log(`  ${j.jobNo}`);
  console.log('Login: admin / Password@123');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
