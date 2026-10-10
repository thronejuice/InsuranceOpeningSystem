import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { ItemResponse } from '../../jobs/data/jobs.api';

export type RefundStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'PROCESSED';

export type PaymentMethod = 'TRANSFER' | 'CASH' | 'CHEQUE' | 'CREDIT_CARD' | 'ONLINE' | 'OTHER';

export interface RefundResponse {
  id: string;
  refundNo: string;
  creditNoteId: string;
  creditNoteNo?: string;
  policyId?: string;
  policyNo?: string;
  customerId?: string;
  amount: string;
  status: RefundStatus;
  reason: string | null;
  rejectionReason: string | null;
  requestedById: string | null;
  requestedByName: string | null;
  requestedAt: string;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  processedById: string | null;
  processedByName: string | null;
  processedAt: string | null;
  paymentMethod: PaymentMethod | null;
  bank: string | null;
  referenceNo: string | null;
  attachmentId: string | null;
  attachmentName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListRefundQuery {
  status?: RefundStatus;
  policyId?: string;
  page?: number;
  perPage?: number;
}

export interface ProcessRefundDto {
  paymentMethod: PaymentMethod;
  bank?: string;
  referenceNo?: string;
  attachmentId?: string;
}

@Injectable({ providedIn: 'root' })
export class RefundsApi {
  private readonly http = inject(HttpClient);

  list(query?: ListRefundQuery): Observable<{ items: RefundResponse[]; total: number }> {
    let params = new HttpParams();
    if (query?.status) params = params.set('status', query.status);
    if (query?.policyId) params = params.set('policyId', query.policyId);
    if (query?.page) params = params.set('page', query.page);
    if (query?.perPage) params = params.set('perPage', query.perPage);

    return this.http.get<ItemResponse<{ items: RefundResponse[]; total: number }>>('/api/refunds', { params }).pipe(
      map((r) => r.data),
    );
  }

  getById(id: string): Observable<RefundResponse> {
    return this.http.get<ItemResponse<RefundResponse>>(`/api/refunds/${id}`).pipe(map((r) => r.data));
  }

  approve(id: string): Observable<RefundResponse> {
    return this.http.post<ItemResponse<RefundResponse>>(`/api/refunds/${id}/approve`, {}).pipe(map((r) => r.data));
  }

  reject(id: string, reason: string): Observable<RefundResponse> {
    return this.http.post<ItemResponse<RefundResponse>>(`/api/refunds/${id}/reject`, { reason }).pipe(map((r) => r.data));
  }

  process(id: string, dto: ProcessRefundDto): Observable<RefundResponse> {
    return this.http.post<ItemResponse<RefundResponse>>(`/api/refunds/${id}/process`, dto).pipe(map((r) => r.data));
  }
}

