import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';

export type InvoiceStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export type InvoiceType = 'INVOICE' | 'DEBIT_NOTE' | 'CREDIT_NOTE';
export type AgingBucket = 'NOT_DUE' | 'D0_30' | 'D31_60' | 'D61_90' | 'D90_PLUS';
export type BillingPaymentMethod = 'CASH' | 'TRANSFER' | 'CREDIT_CARD' | 'CHEQUE' | 'ONLINE' | 'OTHER';

export const AGING_BUCKETS: { key: AgingBucket; label: string }[] = [
  { key: 'NOT_DUE', label: 'ยังไม่ถึงกำหนด' },
  { key: 'D0_30', label: '0–30 วัน' },
  { key: 'D31_60', label: '31–60 วัน' },
  { key: 'D61_90', label: '61–90 วัน' },
  { key: 'D90_PLUS', label: '90+ วัน' },
];

export interface Invoice {
  id: string;
  invoiceNo: string;
  policyId: string;
  customerId: string;
  type: InvoiceType;
  installmentNo: number | null;
  amount: string;
  netAmount: string;
  stampDuty: string;
  vat: string;
  dueDate: string;
  status: InvoiceStatus;
  paidAmount: string;
  outstandingAmount: string;
  customer?: { id: string; customerCode: string; name: string };
  policy?: { id: string; policyNo: string; jobId: string };
}

export interface Receipt {
  id: string;
  receiptNo: string;
  paymentId: string;
  invoiceId: string;
  amount: string;
  status: 'ISSUED' | 'VOID';
  issuedAt: string;
}

export interface BillingPayment {
  id: string;
  paymentNo: string;
  policyId: string;
  invoiceId: string | null;
  paymentDate: string;
  amount: string;
  paymentMethod: BillingPaymentMethod;
  bank: string | null;
  referenceNo: string | null;
  status: 'ACTIVE' | 'CANCELLED';
  cancelReason: string | null;
  remark: string | null;
  receipt: Receipt | null;
}

export interface InvoicePaymentResult {
  payment: BillingPayment;
  invoice: Invoice | null;
}

export interface RecordPaymentBody {
  amount: string;
  paymentMethod: BillingPaymentMethod;
  paymentDate?: string;
  bank?: string;
  referenceNo?: string;
  remark?: string;
}

export interface ReceivableGroup {
  key: string;
  customerId: string;
  customerName: string;
  policyId: string | null;
  policyNo: string | null;
  invoiceCount: number;
  outstanding: string;
  aging: Record<AgingBucket, string>;
}

export interface ReceivableList {
  groupBy: 'customer' | 'policy';
  asOf: string;
  items: ReceivableGroup[];
  total: number;
  page: number;
  perPage: number;
  summary: { outstanding: string; aging: Record<AgingBucket, string> };
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

function toParams(q: Record<string, string | number | undefined | null>): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(q)) if (v != null && v !== '') p = p.set(k, String(v));
  return p;
}

@Injectable({ providedIn: 'root' })
export class BillingApi {
  private readonly http = inject(HttpClient);

  listInvoices(q: { policyId?: string; customerId?: string; status?: string; type?: string; dueBefore?: string; dueAfter?: string; page?: number; perPage?: number }): Observable<Paged<Invoice>> {
    return this.http.get<Envelope<Paged<Invoice>>>('/api/invoices', { params: toParams(q) }).pipe(map((r) => r.data));
  }

  invoicesByPolicy(policyId: string): Observable<Invoice[]> {
    return this.http.get<Envelope<Invoice[]>>(`/api/policies/${policyId}/invoices`).pipe(map((r) => r.data));
  }

  cancelInvoice(id: string, reason: string): Observable<Invoice> {
    return this.http.post<Envelope<Invoice>>(`/api/invoices/${id}/cancel`, { reason }).pipe(map((r) => r.data));
  }

  paymentsByInvoice(invoiceId: string): Observable<Paged<BillingPayment>> {
    return this.http.get<Envelope<Paged<BillingPayment>>>(`/api/invoices/${invoiceId}/payments`, { params: toParams({ perPage: 100 }) }).pipe(map((r) => r.data));
  }

  recordPayment(invoiceId: string, body: RecordPaymentBody, idempotencyKey: string): Observable<InvoicePaymentResult> {
    return this.http
      .post<Envelope<InvoicePaymentResult>>(`/api/invoices/${invoiceId}/payments`, body, { headers: { 'Idempotency-Key': idempotencyKey } })
      .pipe(map((r) => r.data));
  }

  cancelPayment(paymentId: string, cancelReason: string): Observable<InvoicePaymentResult> {
    return this.http.post<Envelope<InvoicePaymentResult>>(`/api/payments/${paymentId}/cancel`, { cancelReason }).pipe(map((r) => r.data));
  }

  listPayments(q: { policyId?: string; invoiceId?: string; page?: number; perPage?: number }): Observable<Paged<BillingPayment>> {
    return this.http.get<Envelope<Paged<BillingPayment>>>('/api/payments', { params: toParams(q) }).pipe(map((r) => r.data));
  }

  receivables(q: { groupBy?: 'customer' | 'policy'; customerId?: string; policyId?: string; page?: number; perPage?: number }): Observable<ReceivableList> {
    return this.http.get<Envelope<ReceivableList>>('/api/receivables', { params: toParams(q) }).pipe(map((r) => r.data));
  }

  /** Fetches the PDF with the user's token and opens it in a new tab. */
  openPdf(kind: 'invoices' | 'receipts', id: string): void {
    const tab = window.open('', '_blank');
    this.http.get(`/api/${kind}/${id}/pdf`, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        if (tab) tab.location.href = url;
        else window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: () => tab?.close(),
    });
  }
}
