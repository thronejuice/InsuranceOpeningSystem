import { driveJob, invoicesOf, payAll, payInvoice, type Driven, type InvoiceRow } from './flows.js';
import { isoDate, type World } from './world.js';

export interface Scenario {
  name: string;
  run: (w: World) => Promise<string | void>;
}

/** A Thai 13-digit tax/citizen id with a correct checksum from its first 12 digits. */
function thaiId(first12: string): string {
  const sum = [...first12].reduce((n, d, i) => n + Number(d) * (13 - i), 0);
  return `${first12}${(11 - (sum % 11)) % 10}`;
}

const customerIndex = (w: World, i: number) => w.customers[i % w.customers.length];

/** Moves one invoice's due date into the past — the only way to age an invoice without waiting (documented time travel). */
async function backdateInvoice(w: World, invoiceId: string, daysAgo: number) {
  await w.prisma.invoice.update({ where: { id: invoiceId }, data: { dueDate: new Date(isoDate(-daysAgo)) } });
}

async function pendingApproval(w: World, jobId: string) {
  const row = await w.prisma.approval.findFirst({ where: { jobId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } });
  if (!row) throw new Error(`No pending approval on job ${jobId}`);
  return row.id;
}

export const scenarios: Scenario[] = [
  // ─── Master data ─────────────────────────────────────────────────────────────
  {
    name: 'Master: insurers (contacts, accepted products), demo products, rates, settings',
    async run(w) {
      const { admin, master } = w;
      const fire = master.types['FIRE'];
      const mkProduct = (code: string, name: string, requireUnderwriting = false) =>
        admin.post<{ id: string }>('/api/master/products', {
          insuranceTypeId: fire,
          code,
          name,
          requireDocsOnSubmit: false,
          requireDocsOnBind: false,
          requireUnderwriting,
        });
      master.products['DEMO-PLAIN'] = (await mkProduct('DEMO-PLAIN', 'Demo — ประกันทั่วไป (ไม่ต้องเอกสาร)')).id;
      master.products['DEMO-UW'] = (await mkProduct('DEMO-UW', 'Demo — ต้องผ่าน Underwriting', true)).id;
      master.types['DEMO'] = fire;

      for (const company of master.companies) {
        await admin.post(`/api/master/companies/${company.id}/contacts`, { name: `ฝ่ายขาย ${company.code}`, position: 'Sales Manager', phone: '02-000-1000', email: `sales@${company.code.toLowerCase()}.example.com`, isPrimary: true });
        await admin.post(`/api/master/companies/${company.id}/contacts`, { name: `Underwriter ${company.code}`, position: 'Senior Underwriter', phone: '02-000-2000', email: `uw@${company.code.toLowerCase()}.example.com`, isUnderwriter: true });
        for (const code of ['DEMO-PLAIN', 'DEMO-UW', 'FIRE-001', 'MOTOR-001']) {
          if (!master.products[code]) continue;
          await admin.post(`/api/insurers/${company.id}/products`, { productId: master.products[code], remark: 'Demo' });
        }
        for (const code of ['DEMO-PLAIN', 'DEMO-UW']) {
          await admin.post('/api/master/commission-rates', {
            insuranceCompanyId: company.id,
            productId: master.products[code],
            rate: '12.5',
            effectiveFrom: isoDate(-365),
          });
        }
      }

      // Commission settings: 10% override for the team lead, and a custom share for one agent
      await admin.put('/api/system-settings/commission.override_rate', { value: '10' });
      await admin.put(`/api/users/${w.agent01.id}`, { agentSharePct: '60.00' });
      return `${master.companies.length} insurers`;
    },
  },

  // ─── Customers ───────────────────────────────────────────────────────────────
  {
    name: 'Customers: 6 individuals and 4 companies',
    async run(w) {
      const people = ['สมชาย', 'สมหญิง', 'วิชัย', 'มาลี', 'ประยุทธ์', 'นภา'];
      for (const [i, name] of people.entries()) {
        const c = await w.agent01.post<{ id: string }>('/api/customers', {
          customerType: 'INDIVIDUAL',
          firstName: `Demo ${name}`,
          lastName: `ตัวอย่าง${i + 1}`,
          mobile: `08100000${String(i).padStart(2, '0')}`,
          email: `demo.person${i + 1}@example.com`,
        });
        w.customers.push(c.id);
      }
      for (const [i, name] of ['ก่อสร้าง', 'ขนส่ง', 'อาหาร', 'เทคโนโลยี'].entries()) {
        const c = await w.agent.post<{ id: string }>('/api/customers', {
          customerType: 'CORPORATE',
          companyName: `Demo บริษัท ${name} จำกัด`,
          taxId: thaiId(`01055600${String(i).padStart(4, '0')}`),
          email: `demo.company${i + 1}@example.com`,
        });
        w.customers.push(c.id);
      }
      return `${w.customers.length} customers`;
    },
  },

  // ─── Documents ───────────────────────────────────────────────────────────────
  {
    name: 'Documents: upload, verify, reject + re-upload on a motor job',
    async run(w) {
      const d = await driveJob(w, { customerId: customerIndex(w, 0), productCode: 'MOTOR-001', agentId: w.agent01.id, stage: 'draft' });
      const required = await w.prisma.documentChecklist.findMany({ where: { product: { code: 'MOTOR-001' }, isRequired: true, active: true } });
      const docs: { id: string }[] = [];
      for (const item of required) {
        docs.push(await w.agent01.upload<{ id: string }>(`/api/jobs/${d.jobId}/documents`, { documentType: item.documentType }));
      }
      await w.staff.post(`/api/documents/${docs[0].id}/verify`, { remark: 'Matches the original' });
      if (docs[1]) {
        await w.staff.post(`/api/documents/${docs[1].id}/reject`, { reason: 'Image is blurry — please upload again' });
        await w.agent01.upload(`/api/jobs/${d.jobId}/documents`, { documentType: required[1].documentType }, 'resubmitted.pdf');
      }
      return `${required.length} required documents`;
    },
  },

  // ─── Job states before quotation ─────────────────────────────────────────────
  {
    name: 'Jobs: DRAFT, OPEN, WAITING_INFORMATION (→ resumed), CANCELLED',
    async run(w) {
      await driveJob(w, { customerId: customerIndex(w, 1), productCode: 'DEMO-PLAIN', typeCode: 'DEMO', agentId: w.agent01.id, stage: 'draft', remark: 'Demo draft' });
      await driveJob(w, { customerId: customerIndex(w, 2), productCode: 'DEMO-PLAIN', typeCode: 'DEMO', agentId: w.agent01.id, stage: 'open', remark: 'Demo open' });

      const waiting = await driveJob(w, { customerId: customerIndex(w, 3), productCode: 'DEMO-PLAIN', typeCode: 'DEMO', agentId: w.agent.id, stage: 'open', remark: 'Demo waiting information' });
      await w.staff.post(`/api/jobs/${waiting.jobId}/request-info`, { reason: 'Need the building floor plan' });

      const resumed = await driveJob(w, { customerId: customerIndex(w, 3), productCode: 'DEMO-PLAIN', typeCode: 'DEMO', agentId: w.agent.id, stage: 'open', remark: 'Demo resumed' });
      await w.staff.post(`/api/jobs/${resumed.jobId}/request-info`, { reason: 'Need ID copy' });
      await w.agent.post(`/api/jobs/${resumed.jobId}/resume`, { reason: 'Customer sent the copy' });

      const cancelled = await driveJob(w, { customerId: customerIndex(w, 4), productCode: 'DEMO-PLAIN', typeCode: 'DEMO', agentId: w.agent.id, stage: 'open', remark: 'Demo cancelled' });
      await w.agent.post(`/api/jobs/${cancelled.jobId}/cancel`, { reason: 'Customer bought elsewhere' });
    },
  },

  // ─── Underwriting ────────────────────────────────────────────────────────────
  {
    name: 'Underwriting: pending, info required (→ resumed), approved, rejected',
    async run(w) {
      const mk = async (i: number, remark: string) => {
        const d = await driveJob(w, { customerId: customerIndex(w, i), productCode: 'DEMO-UW', typeCode: 'DEMO', agentId: w.agent01.id, stage: 'open', remark });
        await w.agent01.post(`/api/jobs/${d.jobId}/underwriting/request-review`, { reason: 'High-value building' });
        return d.jobId;
      };
      await mk(5, 'Demo UW pending');

      const info = await mk(6, 'Demo UW info required');
      await w.staff.post(`/api/jobs/${info}/underwriting/require-info`, { reason: 'Need a fire-safety certificate', requiredDocuments: ['RISK_SURVEY'], requiredSurvey: true });
      await w.agent01.post(`/api/jobs/${info}/underwriting/resume`, { reason: 'Certificate attached' });

      const approved = await mk(7, 'Demo UW approved');
      await w.staff.post(`/api/jobs/${approved}/underwriting/approve`, { riskLevel: 'LOW', riskScore: 20, reason: 'Standard risk', condition: 'Annual survey', deductible: '10000' });

      const rejected = await mk(8, 'Demo UW rejected');
      await w.staff.post(`/api/jobs/${rejected}/underwriting/reject`, { riskLevel: 'HIGH', riskScore: 90, reason: 'Outside the insurer appetite' });
    },
  },

  // ─── Quotations ──────────────────────────────────────────────────────────────
  {
    name: 'Quotations: requested, received, revised version, withdrawn, selected',
    async run(w) {
      const requestOnly = await driveJob(w, { customerId: customerIndex(w, 0), productCode: 'DEMO-PLAIN', typeCode: 'DEMO', agentId: w.agent01.id, stage: 'quotation_requested', remark: 'Demo quotation requested' });
      void requestOnly;

      // One job compared across three insurers
      const base = await driveJob(w, { customerId: customerIndex(w, 1), productCode: 'DEMO-PLAIN', typeCode: 'DEMO', agentId: w.agent01.id, stage: 'open', remark: 'Demo quotation comparison' });
      const prices = ['18500.00', '21000.00', '19750.00'];
      const ids: string[] = [];
      for (const [i, company] of w.master.companies.entries()) {
        const q = await w.staff.post<{ id: string }>(`/api/jobs/${base.jobId}/quotations`, { insuranceCompanyId: company.id, grossPremium: prices[i], validUntil: isoDate(120) });
        await w.staff.put(`/api/quotations/${q.id}`, { grossPremium: prices[i], quotationDate: isoDate(-2), validUntil: isoDate(120), deductible: '5000.00', exclusion: 'War, nuclear', specialCondition: 'Fire alarm required', underwriter: `Underwriter ${company.code}` });
        ids.push(q.id);
      }
      // Insurer revises its price → version 2
      await w.staff.post(`/api/quotations/${ids[1]}/versions`, { grossPremium: '19900.00', quotationDate: isoDate(-1), validUntil: isoDate(120), remark: 'Better price after negotiation' });
      // Insurer withdraws its offer
      await w.staff.post(`/api/quotations/${ids[2]}/withdraw`, { reason: 'Insurer withdrew the offer' });
      const list = await w.staff.get<{ id: string; version: number }[]>(`/api/jobs/${base.jobId}/quotations`);
      const winner = list.find((q) => q.id === ids[0]) ?? list[0];
      await w.staff.post(`/api/quotations/${winner.id}/select`, { reason: 'Lowest premium, same cover', version: winner.version });
      return '3 insurers compared';
    },
  },

  // ─── Proposals ───────────────────────────────────────────────────────────────
  {
    name: 'Proposals: sent (waiting), customer rejected, revised',
    async run(w) {
      await driveJob(w, { customerId: customerIndex(w, 2), productCode: 'DEMO-PLAIN', typeCode: 'DEMO', agentId: w.agent01.id, stage: 'proposal_sent', premium: '24000.00', termCode: 'INSTALLMENT_3', remark: 'Demo proposal waiting' });

      const rejected = await driveJob(w, { customerId: customerIndex(w, 3), productCode: 'DEMO-PLAIN', typeCode: 'DEMO', agentId: w.agent01.id, stage: 'proposal_sent', premium: '26000.00', remark: 'Demo proposal rejected' });
      await w.staff.post(`/api/proposals/${rejected.proposalId}/reject`, { rejectReason: 'PRICE', remark: 'Customer found a cheaper offer' });

      const revised = await driveJob(w, { customerId: customerIndex(w, 4), productCode: 'DEMO-PLAIN', typeCode: 'DEMO', agentId: w.agent01.id, stage: 'proposal_sent', premium: '28000.00', remark: 'Demo proposal revised' });
      await w.staff.post(`/api/proposals/${revised.proposalId}/revise`, { reason: 'Customer asked for different cover' });
    },
  },

  // ─── Approvals ───────────────────────────────────────────────────────────────
  {
    name: 'Approvals: pending, rejected, rejected → resubmitted → approved',
    async run(w) {
      await driveJob(w, { customerId: customerIndex(w, 5), productCode: 'DEMO-PLAIN', typeCode: 'DEMO', agentId: w.agent01.id, stage: 'accepted', premium: '150000.00', leavePendingApproval: true, remark: 'Demo approval pending' });

      const rejected = await driveJob(w, { customerId: customerIndex(w, 6), productCode: 'DEMO-PLAIN', typeCode: 'DEMO', agentId: w.agent01.id, stage: 'accepted', premium: '160000.00', leavePendingApproval: true, remark: 'Demo approval rejected' });
      await w.manager.post(`/api/approvals/${rejected.approvals[0].id}/reject`, { rejectReason: 'Premium too high without a survey', comment: 'Please attach a risk survey' });

      const again = await driveJob(w, { customerId: customerIndex(w, 7), productCode: 'DEMO-PLAIN', typeCode: 'DEMO', agentId: w.agent01.id, stage: 'accepted', premium: '170000.00', leavePendingApproval: true, remark: 'Demo approval resubmitted' });
      await w.manager.post(`/api/approvals/${again.approvals[0].id}/reject`, { rejectReason: 'Need the survey', comment: 'Survey missing' });
      await w.staff.post(`/api/approvals/${again.approvals[0].id}/resubmit`, { reason: 'Survey attached', comment: 'See the document tab' });
      await w.manager.post(`/api/approvals/${await pendingApproval(w, again.jobId)}/approve`, { reason: 'Survey reviewed' });
    },
  },

  // ─── Binding ─────────────────────────────────────────────────────────────────
  {
    name: 'Binding: submitted, rejected by insurer, confirmed (policy pending)',
    async run(w) {
      await driveJob(w, { customerId: customerIndex(w, 8), productCode: 'DEMO-PLAIN', typeCode: 'DEMO', agentId: w.agent01.id, stage: 'binding_submitted', remark: 'Demo binding submitted' });

      const rejected = await driveJob(w, { customerId: customerIndex(w, 9), productCode: 'DEMO-PLAIN', typeCode: 'DEMO', agentId: w.agent01.id, stage: 'binding_submitted', remark: 'Demo binding rejected' });
      await w.staff.post(`/api/jobs/${rejected.jobId}/bind/reject`, { reason: 'Insurer asks for a survey report first' });

      await driveJob(w, { customerId: customerIndex(w, 0), productCode: 'DEMO-PLAIN', typeCode: 'DEMO', agentId: w.agent01.id, stage: 'binding_confirmed', remark: 'Demo binding confirmed' });
    },
  },

  // ─── Job cancellation after binding ──────────────────────────────────────────
  {
    name: 'Job cancellation: request → approved, request → rejected',
    async run(w) {
      const a = await driveJob(w, { customerId: customerIndex(w, 1), productCode: 'DEMO-PLAIN', typeCode: 'DEMO', agentId: w.agent01.id, stage: 'binding_confirmed', remark: 'Demo cancel approved' });
      await w.agent01.post(`/api/jobs/${a.jobId}/cancel-request`, { reason: 'Customer withdrew after binding' });
      await w.manager.post(`/api/jobs/${a.jobId}/cancel-approve`, { reason: 'Insurer agrees to void the binder' });

      const b = await driveJob(w, { customerId: customerIndex(w, 2), productCode: 'DEMO-PLAIN', typeCode: 'DEMO', agentId: w.agent01.id, stage: 'binding_confirmed', remark: 'Demo cancel rejected' });
      await w.agent01.post(`/api/jobs/${b.jobId}/cancel-request`, { reason: 'Customer hesitating' });
      await w.manager.post(`/api/jobs/${b.jobId}/cancel-reject`, { reason: 'Binder already confirmed — proceed' });
    },
  },

  // ─── Policies + billing ──────────────────────────────────────────────────────
  {
    name: 'Billing: paid in full, partial, 3 instalments, overdue, cancelled payment/invoice',
    async run(w) {
      const base = { productCode: 'DEMO-PLAIN', typeCode: 'DEMO', stage: 'policy' as const };

      // A — one invoice, paid in full (commission becomes payable)
      const paid = await driveJob(w, { ...base, customerId: customerIndex(w, 3), agentId: w.agent01.id, premium: '30000.00', remark: 'Demo paid in full' });
      await payAll(w, paid.policyId!);

      // B — three instalments: first paid, second part-paid, third open
      const inst = await driveJob(w, { ...base, customerId: customerIndex(w, 4), agentId: w.agent01.id, premium: '45000.00', termCode: 'INSTALLMENT_3', remark: 'Demo three instalments' });
      const invB = (await invoicesOf(w, inst.policyId!)).filter((i) => i.type !== 'CREDIT_NOTE');
      await payInvoice(w, invB[0].id, invB[0].outstandingAmount);
      await w.finance.post(`/api/invoices/${invB[1].id}/payments`, { amount: '5000.00', paymentMethod: 'CASH', remark: 'Deposit' });

      // C — three instalments, nothing paid, first one overdue
      const overdue = await driveJob(w, { ...base, customerId: customerIndex(w, 5), agentId: w.agent.id, premium: '36000.00', termCode: 'INSTALLMENT_3', remark: 'Demo overdue' });
      const invC = await invoicesOf(w, overdue.policyId!);
      await backdateInvoice(w, invC[0].id, 20); // time travel: the system only ages invoices as real days pass
      await w.admin.post('/api/invoices/process-daily');

      // D — a payment taken in error is cancelled (its receipt is voided)
      const cancelledPay = await driveJob(w, { ...base, customerId: customerIndex(w, 6), agentId: w.agent.id, premium: '22000.00', remark: 'Demo cancelled payment' });
      const invD = (await invoicesOf(w, cancelledPay.policyId!))[0];
      const wrong = await payInvoice(w, invD.id, invD.outstandingAmount, 'CHEQUE');
      await w.finance.post(`/api/payments/${wrong.payment.id}/cancel`, { cancelReason: 'Cheque bounced' });

      // E — an invoice cancelled before any payment
      const cancelledInv = await driveJob(w, { ...base, customerId: customerIndex(w, 7), agentId: w.agent.id, premium: '18000.00', termCode: 'INSTALLMENT_3', remark: 'Demo cancelled invoice' });
      const invE = await invoicesOf(w, cancelledInv.policyId!);
      await w.finance.post(`/api/invoices/${invE[2].id}/cancel`, { reason: 'Instalment waived by agreement' });

      // F — a policy that starts in the future stays PENDING
      await driveJob(w, { ...base, customerId: customerIndex(w, 8), agentId: w.agent01.id, premium: '27000.00', startOffsetDays: 20, remark: 'Demo future start' });
      return '6 policies';
    },
  },

  // ─── Commission ──────────────────────────────────────────────────────────────
  {
    name: 'Commission: approved, payable, adjustments, statements (draft/confirmed/paid/cancelled)',
    async run(w) {
      // Extra fully-paid policies so each payee has something to be paid
      for (const [i, [agent, premium]] of ([[w.agent01, '52000.00'], [w.agent01, '41000.00'], [w.agent, '33000.00'], [w.agent, '29000.00']] as const).entries()) {
        const d = await driveJob(w, { customerId: customerIndex(w, i), productCode: 'DEMO-PLAIN', typeCode: 'DEMO', agentId: agent.id, stage: 'policy', premium, remark: `Demo commission ${i + 1}` });
        await payAll(w, d.policyId!);
      }

      const rows = await w.prisma.commission.findMany({ where: { status: 'CALCULATED', policy: { job: { remark: { startsWith: 'Demo' } } } }, orderBy: { createdAt: 'asc' } });
      for (const row of rows) {
        // leave the last rows CALCULATED so the approval step is visible in the UI
        if (row.id !== rows[rows.length - 1].id) await w.finance.post(`/api/commissions/${row.id}/approve`);
      }

      // Adjustments: a claw-back and a top-up on already-approved commissions
      const approved = await w.prisma.commission.findMany({ where: { status: { in: ['PAYABLE', 'APPROVED'] }, commissionType: 'AGENT', netAmount: { not: null } }, orderBy: { createdAt: 'asc' } });
      if (approved[0]) await w.finance.post(`/api/commissions/${approved[0].id}/adjustments`, { amount: '-500.00', reason: 'Premium refunded on endorsement' });
      if (approved[1]) await w.finance.post(`/api/commissions/${approved[1].id}/adjustments`, { amount: '250.00', reason: 'Additional premium on endorsement' });

      const period = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date()).slice(0, 7);
      const summary = await w.finance.get<{ items: { key: string; label: string }[] }>('/api/commissions/summary?groupBy=agent&status=PAYABLE&perPage=50');
      const payee = (id: string) => summary.items.find((g) => g.key === id);

      // agent01 → paid; agent → confirmed; supervisor (override) → cancelled then re-created as a draft
      const created: Record<string, string> = {};
      for (const [name, actor] of [['agent01', w.agent01], ['agent', w.agent], ['supervisor', w.supervisor]] as const) {
        if (!payee(actor.id)) continue;
        created[name] = (await w.finance.post<{ id: string }>('/api/commission-statements', { agentId: actor.id, period })).id;
      }
      if (created['agent01']) {
        await w.finance.post(`/api/commission-statements/${created['agent01']}/confirm`);
        await w.finance.post(`/api/commission-statements/${created['agent01']}/mark-paid`, { paymentRef: 'BANK-DEMO-0001' });
      }
      if (created['agent']) await w.finance.post(`/api/commission-statements/${created['agent']}/confirm`);
      if (created['supervisor']) {
        await w.finance.post(`/api/commission-statements/${created['supervisor']}/cancel`, { reason: 'Created for the wrong month — regenerate' });
        await w.finance.post('/api/commission-statements', { agentId: w.supervisor.id, period });
      }
      return `${Object.keys(created).length} statements`;
    },
  },

  // ─── Endorsements ────────────────────────────────────────────────────────────
  {
    name: 'Endorsements: draft, approved, requested, reviewing, issued (debit note), rejected, cancelled',
    async run(w) {
      const d = await driveJob(w, { customerId: customerIndex(w, 9), productCode: 'DEMO-PLAIN', typeCode: 'DEMO', agentId: w.agent01.id, stage: 'policy', premium: '80000.00', remark: 'Demo endorsements' });
      const policy = d.policyId!;
      const create = (body: Record<string, unknown>) => w.staff.post<{ id: string }>(`/api/policies/${policy}/endorsements`, { effectiveDate: isoDate(0), ...body });

      await create({ type: 'CHANGE_ADDRESS', changes: { before: { addressLine1: '1 ถนนสุขุมวิท', province: 'กรุงเทพมหานคร' }, after: { addressLine1: '99 ถนนนิมมานเหมินท์', province: 'เชียงใหม่' } }, remark: 'Demo draft' });

      // No premium effect → auto-approved on submit, waiting to be issued
      const approvedOnly = await create({ type: 'CHANGE_CUSTOMER', changes: { before: { phone: '0810000000' }, after: { phone: '0899999999' } }, remark: 'Demo approved, not issued' });
      await w.staff.post(`/api/endorsements/${approvedOnly.id}/submit`);

      // ≥ 10,000 of additional premium matches the approval rule → REQUESTED until a manager acts
      const bigChange = (from: number, to: number, net: number, remark: string) =>
        create({
          type: 'CHANGE_SUM_INSURED',
          changes: { before: { sumInsured: from }, after: { sumInsured: to } },
          premiumAdjustmentType: 'ADDITIONAL_PREMIUM',
          netAdjustment: net,
          stampDuty: Math.ceil(net / 1000) * 4,
          vat: Number((net * 0.07).toFixed(2)),
          totalAdjustment: Number((net + Math.ceil(net / 1000) * 4 + net * 0.07).toFixed(2)),
          remark,
        });

      const requested = await bigChange(1000000, 1500000, 12000, 'Demo requested');
      await w.staff.post(`/api/endorsements/${requested.id}/submit`);

      const reviewing = await bigChange(1000000, 1600000, 15000, 'Demo reviewing');
      await w.staff.post(`/api/endorsements/${reviewing.id}/submit`);
      await w.staff.post(`/api/endorsements/${reviewing.id}/start-review`);

      const approvedBig = await bigChange(1000000, 2000000, 20000, 'Demo approved by manager');
      await w.staff.post(`/api/endorsements/${approvedBig.id}/submit`);
      await w.staff.post(`/api/endorsements/${approvedBig.id}/start-review`);
      await w.manager.post(`/api/endorsements/${approvedBig.id}/approve`, { reason: 'Value verified' });
      await w.staff.post(`/api/endorsements/${approvedBig.id}/issue`);

      const rejected = await bigChange(1000000, 1700000, 14000, 'Demo rejected');
      await w.staff.post(`/api/endorsements/${rejected.id}/submit`);
      await w.staff.post(`/api/endorsements/${rejected.id}/start-review`);
      await w.manager.post(`/api/endorsements/${rejected.id}/reject`, { reason: 'Insurer declined the change' });

      // Small additional premium: nothing to approve → issued straight away, with a debit note
      const small = await create({
        type: 'CHANGE_SUM_INSURED',
        changes: { before: { sumInsured: 1000000 }, after: { sumInsured: 1200000 } },
        premiumAdjustmentType: 'ADDITIONAL_PREMIUM',
        netAdjustment: 4000, stampDuty: 16, vat: 280, totalAdjustment: 4296,
        remark: 'Demo issued',
      });
      await w.staff.post(`/api/endorsements/${small.id}/submit`);
      await w.staff.post(`/api/endorsements/${small.id}/issue`);

      const cancelled = await create({ type: 'OTHER', changes: { after: { remark: 'cancel me' } }, remark: 'Demo cancelled' });
      await w.staff.post(`/api/endorsements/${cancelled.id}/cancel`, { reason: 'Customer changed their mind' });
      return '8 endorsements';
    },
  },

  // ─── Policy cancellation + refunds ───────────────────────────────────────────
  {
    name: 'Cancellation & refunds: cancel-requested, rejected, cancelled with refund REQUESTED/APPROVED/PROCESSED/REJECTED',
    async run(w) {
      const base = { productCode: 'DEMO-PLAIN', typeCode: 'DEMO', stage: 'policy' as const, termCode: 'INSTALLMENT_3', agentId: w.agent01.id };

      /** A 3-instalment policy with the first instalment paid, ready to be cancelled. */
      const prepared = async (i: number, premium: string, remark: string) => {
        const d = await driveJob(w, { ...base, customerId: customerIndex(w, i), premium, remark });
        const first = (await invoicesOf(w, d.policyId!))[0];
        await payInvoice(w, first.id, first.outstandingAmount);
        return d;
      };
      const requestCancel = async (d: Driven, reason: string) => {
        const calc = await w.agent01.post<{ totalRefund: string }>(`/api/policies/${d.policyId}/cancel-calculate`, { cancelEffectiveDate: isoDate(10), method: 'SHORT_RATE' });
        await w.staff.post(`/api/policies/${d.policyId}/cancel-request`, {
          cancelReason: reason,
          cancelRequestDate: isoDate(0),
          cancelEffectiveDate: isoDate(10),
          cancelRefundAmount: calc.totalRefund,
        });
      };
      const approveCancel = async (d: Driven) => {
        const doc = await w.staff.upload<{ id: string }>(`/api/jobs/${d.jobId}/documents`, { documentType: 'OTHER' }, 'insurer-cancellation-notice.pdf');
        await w.manager.post(`/api/policies/${d.policyId}/cancel-approve`, { cancelInsurerDocumentId: doc.id, remark: 'Insurer confirmed the cancellation' });
      };
      const refundOf = async (d: Driven) => {
        const r = await w.prisma.refund.findFirst({ where: { creditNote: { policyId: d.policyId } }, orderBy: { createdAt: 'desc' } });
        if (!r) throw new Error(`No refund for policy ${d.policyNo}`);
        return r.id;
      };

      const processed = await prepared(0, '60000.00', 'Demo cancel → refund processed');
      await requestCancel(processed, 'Customer sold the property');
      await approveCancel(processed);
      const processedRefund = await refundOf(processed);
      await w.admin.post(`/api/refunds/${processedRefund}/approve`);
      await w.finance.post(`/api/refunds/${processedRefund}/process`, { paymentMethod: 'TRANSFER', bank: 'Demo Bank', referenceNo: 'REFUND-DEMO-0001' });

      const requested = await prepared(1, '48000.00', 'Demo cancel → refund requested');
      await requestCancel(requested, 'Customer moved abroad');
      await approveCancel(requested);

      const approvedRefund = await prepared(2, '54000.00', 'Demo cancel → refund approved');
      await requestCancel(approvedRefund, 'Duplicate policy');
      await approveCancel(approvedRefund);
      await w.admin.post(`/api/refunds/${await refundOf(approvedRefund)}/approve`);

      const rejectedRefund = await prepared(3, '42000.00', 'Demo cancel → refund rejected');
      await requestCancel(rejectedRefund, 'Customer cancelled within the cooling-off period');
      await approveCancel(rejectedRefund);
      await w.admin.post(`/api/refunds/${await refundOf(rejectedRefund)}/reject`, { reason: 'Refund already settled with the insurer directly' });

      const waiting = await prepared(4, '39000.00', 'Demo cancel requested');
      await requestCancel(waiting, 'Customer asked to cancel');

      const declined = await prepared(5, '36000.00', 'Demo cancel declined');
      await requestCancel(declined, 'Customer unsure');
      await w.manager.post(`/api/policies/${declined.policyId}/cancel-reject`, { reason: 'Documents not clear — keep the policy active' });
      return '6 cancellations';
    },
  },

  // ─── Renewals, tasks, daily maintenance ──────────────────────────────────────
  {
    name: 'Renewals, tasks and daily jobs: expiring policies, renewal pipeline, overdue tasks, notifications',
    async run(w) {
      const base = { productCode: 'DEMO-PLAIN', typeCode: 'DEMO', stage: 'policy' as const, agentId: w.agent01.id, premium: '25000.00' };

      // Policies that expire in 45 / 20 days; one already past its end date
      const in45 = await driveJob(w, { ...base, customerId: customerIndex(w, 6), startOffsetDays: -320, remark: 'Demo expires in 45 days' });
      const in20 = await driveJob(w, { ...base, customerId: customerIndex(w, 7), startOffsetDays: -345, remark: 'Demo expires in 20 days' });
      const ended = await driveJob(w, { ...base, customerId: customerIndex(w, 8), startOffsetDays: -360, remark: 'Demo expired' });
      // time travel: the policy end date is moved into the past so the nightly job can expire it
      await w.prisma.policy.update({ where: { id: ended.policyId! }, data: { expiryDate: new Date(isoDate(-3)) } });

      await w.admin.post('/api/policies/process-daily'); // ACTIVE → EXPIRING / EXPIRED, expiring notifications
      await w.admin.post('/api/renewals/process-daily'); // renewal pipeline + follow-up tasks for 45 days out

      // Broker staff renew one policy by hand → a renewal job linked to the old policy
      const renewalJob = await w.staff.post<{ newJobId: string }>(`/api/policies/${in20.policyId}/renew`, {});
      // …and the renewal is won: the new job goes all the way to a policy, which completes the renewal
      await driveJob(w, { ...base, jobId: renewalJob.newJobId, customerId: customerIndex(w, 7), startOffsetDays: 20 });
      const renewal = await w.prisma.renewal.findFirst({ where: { previousPolicyId: in45.policyId! } });
      if (renewal) await w.staff.post(`/api/renewals/${renewal.id}/contact-customer`);

      // Tasks in every state
      const task = (body: Record<string, unknown>) => w.staff.post<{ id: string }>('/api/tasks', body);
      await task({ taskType: 'CALL_CUSTOMER', subject: 'Demo — โทรแจ้งผลการพิจารณา', dueDate: isoDate(2), priority: 'MEDIUM', assignedTo: w.agent01.id, customerId: customerIndex(w, 0) });
      const done = await task({ taskType: 'REQUEST_DOCUMENT', subject: 'Demo — ขอสำเนาบัตรประชาชน', dueDate: isoDate(1), priority: 'HIGH', assignedTo: w.agent01.id, customerId: customerIndex(w, 1) });
      await w.agent01.post(`/api/tasks/${done.id}/complete`);
      const dropped = await task({ taskType: 'FOLLOW_UP_INSURER', subject: 'Demo — ติดตามผลกับบริษัทประกัน', dueDate: isoDate(5), priority: 'LOW', assignedTo: w.staff.id, customerId: customerIndex(w, 2) });
      await w.staff.post(`/api/tasks/${dropped.id}/cancel`);
      const late = await task({ taskType: 'FOLLOW_UP_PAYMENT', subject: 'Demo — ติดตามค่าเบี้ย (เลยกำหนด)', dueDate: isoDate(3), priority: 'URGENT', assignedTo: w.agent01.id, policyId: in45.policyId });
      // time travel: due date moved into the past so the nightly job raises the overdue notification
      await w.prisma.task.update({ where: { id: late.id }, data: { dueDate: new Date(isoDate(-2)) } });
      await w.admin.post('/api/tasks/process-daily');

      // An offer nobody answered: its validity date passes (time travel) and the nightly job expires it
      const stale = await driveJob(w, { ...base, customerId: customerIndex(w, 9), stage: 'quotation_received', remark: 'Demo quotation expires' });
      await w.prisma.quotation.update({ where: { id: stale.quotationId! }, data: { validUntil: new Date(isoDate(-1)) } });

      // Other nightly jobs
      await w.admin.post('/api/invoices/process-daily');
      await w.admin.post('/api/proposals/daily-check');
      await w.admin.post('/api/quotations/process-daily');
      return 'renewals + 4 tasks';
    },
  },
];
