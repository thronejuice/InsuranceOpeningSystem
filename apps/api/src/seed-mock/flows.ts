import { isoDate, type World } from './world.js';

/** How far a job is driven through the sales workflow. */
export const STAGES = [
  'draft',
  'open',
  'quotation_requested',
  'quotation_received',
  'quotation_selected',
  'proposal_sent',
  'accepted',
  'binding_submitted',
  'binding_confirmed',
  'policy',
] as const;
export type Stage = (typeof STAGES)[number];

export interface DriveOptions {
  customerId: string;
  productCode: string;
  typeCode?: string;
  /** Who owns the job (BR-014). */
  agentId: string;
  stage: Stage;
  /** Quoted gross premium; ≥ 100,000 sends the proposal acceptance to a manager (approval rule). */
  premium?: string;
  /** Position of the insurer in master order. */
  insurer?: number;
  termCode?: string;
  /** Policy start, as days from today. Negative = already in force. */
  startOffsetDays?: number;
  remark?: string;
  /** Stop at WAITING_APPROVAL instead of approving. */
  leavePendingApproval?: boolean;
  /** Continue an existing job (e.g. a renewal job created by the system) instead of creating a new one. */
  jobId?: string;
}

export interface Driven {
  jobId: string;
  quotationId?: string;
  proposalId?: string;
  approvals: { id: string }[];
  policyId?: string;
  policyNo?: string;
}


/** Drives one job through the real workflow endpoints, as the people who would do each step. */
export async function driveJob(w: World, opts: DriveOptions): Promise<Driven> {
  const { master } = w;
  const productId = master.products[opts.productCode];
  if (!productId) throw new Error(`Unknown product ${opts.productCode}`);
  const typeId = master.types[opts.typeCode ?? opts.productCode.split('-')[0]];
  const company = master.companies[opts.insurer ?? 0];
  const start = opts.startOffsetDays ?? -30;
  const premium = opts.premium ?? '20000.00';

  const job = opts.jobId
    ? { id: opts.jobId }
    : await w.admin.post<{ id: string }>('/api/jobs', {
        customerId: opts.customerId,
        insuranceTypeId: typeId,
        productId,
        agentId: opts.agentId,
        effectiveDate: isoDate(start),
        expiryDate: isoDate(start + 365),
        ...(opts.remark ? { remark: opts.remark } : {}),
      });
  const out: Driven = { jobId: job.id, approvals: [] };
  if (opts.stage === 'draft') return out;

  const current = await w.admin.get<{ status: string }>(`/api/jobs/${job.id}`);
  if (current.status === 'DRAFT') await w.admin.post(`/api/jobs/${job.id}/submit`);
  if (opts.stage === 'open') return out;

  const quotation = await w.staff.post<{ id: string }>(`/api/jobs/${job.id}/quotations`, {
    insuranceCompanyId: company.id,
    grossPremium: premium,
    validUntil: isoDate(180),
  });
  out.quotationId = quotation.id;
  if (opts.stage === 'quotation_requested') return out;

  await w.staff.put(`/api/quotations/${quotation.id}`, {
    grossPremium: premium,
    quotationDate: isoDate(-1),
    validUntil: isoDate(180),
    deductible: '5000.00',
    insurerReference: `REF-${quotation.id.slice(-6).toUpperCase()}`,
  });
  if (opts.stage === 'quotation_received') return out;

  const version = ((await w.staff.get<{ version: number }[]>(`/api/jobs/${job.id}/quotations`))[0]).version;
  await w.staff.post(`/api/quotations/${quotation.id}/select`, { reason: 'Best price for the customer', version });
  if (opts.stage === 'quotation_selected') return out;

  const proposal = await w.staff.post<{ id: string }>(`/api/jobs/${job.id}/proposal`, {
    validUntil: isoDate(30),
    ...(opts.termCode ? { paymentTermId: master.terms[opts.termCode] } : {}),
  });
  out.proposalId = proposal.id;
  await w.staff.post(`/api/proposals/${proposal.id}/send`);
  if (opts.stage === 'proposal_sent') return out;

  const accepted = await w.staff.post<{ approvals?: { id: string }[] }>(`/api/proposals/${proposal.id}/accept`, {
    method: 'MANUAL',
    acceptedByName: 'Customer',
    remark: 'Accepted by phone and confirmed by e-mail',
  });
  out.approvals = accepted.approvals ?? [];
  if (opts.stage === 'accepted' && opts.leavePendingApproval) return out;
  for (const a of out.approvals) await w.manager.post(`/api/approvals/${a.id}/approve`, { reason: 'Within authority' });
  if (opts.stage === 'accepted') return out;

  await w.staff.post(`/api/jobs/${job.id}/bind`, { remark: 'Submitted to the insurer' });
  if (opts.stage === 'binding_submitted') return out;

  await w.staff.post(`/api/jobs/${job.id}/bind/confirm`, {
    binderNumber: `BND-${job.id.slice(-8).toUpperCase()}`,
    underwriter: 'Insurer underwriter',
  });
  if (opts.stage === 'binding_confirmed') return out;

  const policy = await w.staff.post<{ id: string; policyNo: string }>(`/api/jobs/${job.id}/policy`, { sumInsured: '1000000.00' });
  out.policyId = policy.id;
  out.policyNo = policy.policyNo;
  return out;
}

/** Pays one invoice in full (as finance) and returns the payment. */
export async function payInvoice(w: World, invoiceId: string, outstanding: string, method = 'TRANSFER') {
  return w.finance.post<{ payment: { id: string } }>(`/api/invoices/${invoiceId}/payments`, {
    amount: outstanding,
    paymentMethod: method,
    referenceNo: `SLIP-${invoiceId.slice(-6).toUpperCase()}`,
    bank: 'Demo Bank',
  });
}

export interface InvoiceRow {
  id: string;
  invoiceNo: string;
  status: string;
  amount: string;
  outstandingAmount: string;
  type: string;
  installmentNo: number | null;
}

export const invoicesOf = (w: World, policyId: string) => w.finance.get<InvoiceRow[]>(`/api/policies/${policyId}/invoices`);

export async function payAll(w: World, policyId: string): Promise<void> {
  for (const inv of await invoicesOf(w, policyId)) {
    if (inv.type !== 'CREDIT_NOTE' && inv.status !== 'PAID' && inv.status !== 'CANCELLED') await payInvoice(w, inv.id, inv.outstandingAmount);
  }
}
