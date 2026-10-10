import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import type { Paged } from '../../billing/data/billing.api';

export type CommissionStatus = 'PENDING' | 'CALCULATED' | 'APPROVED' | 'PAYABLE' | 'PAID' | 'CANCELLED';
export type AdjustmentStatus = 'PENDING' | 'IN_STATEMENT' | 'SETTLED';
export type StatementStatus = 'DRAFT' | 'CONFIRMED' | 'PAID' | 'CANCELLED';
export type SummaryGroupBy = 'agent' | 'policy' | 'insurer' | 'period' | 'product';

export interface CommissionRow {
  id: string;
  policyId: string;
  agentId: string | null;
  commissionType: string;
  commissionRate: string;
  commissionBase: string;
  commissionAmount: string;
  grossAmount: string | null;
  brokerShareAmount: string | null;
  sharePct: string | null;
  whtRate: string | null;
  whtAmount: string | null;
  netAmount: string | null;
  status: CommissionStatus;
  statementId: string | null;
  paidDate: string | null;
  agent: { id: string; fullName: string } | null;
  policy: { id: string; policyNo: string } | null;
}

export interface Adjustment {
  id: string;
  commissionId: string;
  policyId: string;
  agentId: string;
  amount: string;
  whtRate: string;
  whtAmount: string;
  netAmount: string;
  reason: string;
  refType: string | null;
  refId: string | null;
  status: AdjustmentStatus;
  statementId: string | null;
  createdAt: string;
}

export interface Statement {
  id: string;
  statementNo: string;
  agentId: string;
  agent: { id: string; fullName: string } | null;
  period: string;
  status: StatementStatus;
  shareTotal: string;
  whtTotal: string;
  netTotal: string;
  confirmedAt: string | null;
  paidAt: string | null;
  paidDate: string | null;
  paymentRef: string | null;
  cancelReason: string | null;
  createdAt: string;
  commissionCount: number;
  adjustmentCount: number;
}

export interface StatementDetail extends Statement {
  commissions: CommissionRow[];
  adjustments: Adjustment[];
}

export interface SummaryGroup {
  key: string;
  label: string;
  commissionCount: number;
  grossAmount: string;
  brokerShareAmount: string;
  shareAmount: string;
  whtAmount: string;
  netAmount: string;
  adjustmentNet: string;
  totalNet: string;
}

export interface CommissionSummary {
  groupBy: SummaryGroupBy;
  items: SummaryGroup[];
  total: number;
  summary: Omit<SummaryGroup, 'key' | 'label'>;
}

export interface SystemSetting {
  key: string;
  value: string;
  description?: string;
  isDefault?: boolean;
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
export class CommissionsApi {
  private readonly http = inject(HttpClient);

  list(q: { agentId?: string; status?: string; policyId?: string; page?: number; perPage?: number }): Observable<{ items: CommissionRow[]; total: number }> {
    return this.http.get<Envelope<{ items: CommissionRow[]; total: number }>>('/api/commissions', { params: toParams(q) }).pipe(map((r) => r.data));
  }

  byPolicy(policyId: string): Observable<{ items: CommissionRow[]; total: number }> {
    return this.http.get<Envelope<{ items: CommissionRow[]; total: number }>>(`/api/policies/${policyId}/commissions`).pipe(map((r) => r.data));
  }

  calculate(policyId: string): Observable<{ items: CommissionRow[]; total: number }> {
    return this.http.post<Envelope<{ items: CommissionRow[]; total: number }>>(`/api/policies/${policyId}/commissions/calculate`, {}).pipe(map((r) => r.data));
  }

  approve(id: string): Observable<CommissionRow> {
    return this.http.post<Envelope<CommissionRow>>(`/api/commissions/${id}/approve`, {}).pipe(map((r) => r.data));
  }

  adjust(id: string, body: { amount: string; reason: string; refType?: string; refId?: string }): Observable<Adjustment> {
    return this.http.post<Envelope<Adjustment>>(`/api/commissions/${id}/adjustments`, body).pipe(map((r) => r.data));
  }

  adjustments(commissionId: string): Observable<Adjustment[]> {
    return this.http.get<Envelope<Adjustment[]>>(`/api/commissions/${commissionId}/adjustments`).pipe(map((r) => r.data));
  }

  listAdjustments(q: { agentId?: string; status?: string; page?: number; perPage?: number }): Observable<Paged<Adjustment>> {
    return this.http.get<Envelope<Paged<Adjustment>>>('/api/commission-adjustments', { params: toParams(q) }).pipe(map((r) => r.data));
  }

  summary(q: { groupBy: SummaryGroupBy; agentId?: string; status?: string; from?: string; to?: string; page?: number; perPage?: number }): Observable<CommissionSummary> {
    return this.http.get<Envelope<CommissionSummary>>('/api/commissions/summary', { params: toParams(q) }).pipe(map((r) => r.data));
  }

  listStatements(q: { agentId?: string; status?: string; period?: string; page?: number; perPage?: number }): Observable<Paged<Statement>> {
    return this.http.get<Envelope<Paged<Statement>>>('/api/commission-statements', { params: toParams(q) }).pipe(map((r) => r.data));
  }

  getStatement(id: string): Observable<StatementDetail> {
    return this.http.get<Envelope<StatementDetail>>(`/api/commission-statements/${id}`).pipe(map((r) => r.data));
  }

  createStatement(body: { agentId: string; period: string }): Observable<StatementDetail> {
    return this.http.post<Envelope<StatementDetail>>('/api/commission-statements', body).pipe(map((r) => r.data));
  }

  confirmStatement(id: string): Observable<StatementDetail> {
    return this.http.post<Envelope<StatementDetail>>(`/api/commission-statements/${id}/confirm`, {}).pipe(map((r) => r.data));
  }

  markStatementPaid(id: string, body: { paidDate?: string; paymentRef?: string }): Observable<StatementDetail> {
    return this.http.post<Envelope<StatementDetail>>(`/api/commission-statements/${id}/mark-paid`, body).pipe(map((r) => r.data));
  }

  cancelStatement(id: string, reason: string): Observable<StatementDetail> {
    return this.http.post<Envelope<StatementDetail>>(`/api/commission-statements/${id}/cancel`, { reason }).pipe(map((r) => r.data));
  }

  /** Downloads the statement as an Excel file using the caller's token. */
  exportStatement(id: string, fallbackName: string): void {
    this.http.get(`/api/commission-statements/${id}/export`, { responseType: 'blob', observe: 'response' }).subscribe((resp) => {
      const match = (resp.headers.get('content-disposition') ?? '').match(/filename="?([^"]+)"?/);
      const url = URL.createObjectURL(resp.body!);
      const a = document.createElement('a');
      a.href = url;
      a.download = match?.[1] ?? `${fallbackName}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  listSettings(): Observable<SystemSetting[]> {
    return this.http.get<Envelope<SystemSetting[]>>('/api/system-settings').pipe(map((r) => r.data));
  }

  updateSetting(key: string, value: string): Observable<SystemSetting> {
    return this.http.put<Envelope<SystemSetting>>(`/api/system-settings/${key}`, { value }).pipe(map((r) => r.data));
  }
}
