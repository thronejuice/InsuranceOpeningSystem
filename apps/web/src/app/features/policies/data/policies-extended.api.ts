import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { ItemResponse } from '../../jobs/data/jobs.api';

export type EndorsementType =
  | 'CHANGE_CUSTOMER'
  | 'CHANGE_ADDRESS'
  | 'CHANGE_COVERAGE'
  | 'CHANGE_SUM_INSURED'
  | 'ADD_ASSET'
  | 'REMOVE_ASSET'
  | 'CHANGE_VEHICLE'
  | 'CHANGE_EFFECTIVE_DATE'
  | 'OTHER';

export type EndorsementStatus = 'DRAFT' | 'REQUESTED' | 'REVIEWING' | 'APPROVED' | 'REJECTED' | 'ISSUED' | 'CANCELLED';

export type PremiumAdjustmentType = 'NO_CHANGE' | 'ADDITIONAL_PREMIUM' | 'REFUND_PREMIUM';

export interface EndorsementResponse {
  id: string;
  endorsementNo: string;
  policyId: string;
  policyNo?: string;
  type: EndorsementType;
  status: EndorsementStatus;
  effectiveDate: string;
  changes: {
    before?: Record<string, unknown>;
    after: Record<string, unknown>;
  };
  premiumAdjustmentType: PremiumAdjustmentType;
  netAdjustment: string;
  stampDuty: string;
  vat: string;
  totalAdjustment: string;
  remark: string | null;
  rejectionReason: string | null;
  insurerDocumentId: string | null;
  insurerDocumentName?: string | null;
  requestedById: string | null;
  requestedByName?: string | null;
  requestedAt: string | null;
  reviewedById: string | null;
  reviewedByName?: string | null;
  reviewedAt: string | null;
  approvedById: string | null;
  approvedByName?: string | null;
  approvedAt: string | null;
  issuedById: string | null;
  issuedByName?: string | null;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEndorsementDto {
  type: EndorsementType;
  effectiveDate: string;
  changes: {
    before?: Record<string, unknown>;
    after: Record<string, unknown>;
  };
  premiumAdjustmentType?: PremiumAdjustmentType;
  /** Money is a decimal string with at most 2 decimals — never a float. */
  netAdjustment?: string;
  stampDuty?: string;
  vat?: string;
  totalAdjustment?: string;
  remark?: string;
  insurerDocumentId?: string;
}

export interface CalculateProRataDto {
  endorsementDate: string;
  /** Annual net premium the change applies to; the server uses the policy's own when omitted. */
  annualNetPremium?: string;
}

export interface ProRataResult {
  remainingDays: number;
  totalDays: number;
  dailyRate: string;
  proRataNet: string;
  stampDuty: string;
  vat: string;
  totalAdjustment: string;
}

/** What the cancellation endpoints return: the policy with its new status. */
export interface PolicyCancellationResult {
  id: string;
  status: string;
  [key: string]: unknown;
}

export interface PolicyVersionResponse {
  id: string;
  policyId: string;
  version: number;
  snapshot: Record<string, unknown>;
  reason: string | null;
  endorsementId: string | null;
  createdById: string | null;
  createdAt: string;
}

export interface CalculateCancellationRefundDto {
  cancelEffectiveDate: string;
  method?: 'SHORT_RATE' | 'PRO_RATA';
}

/** Result of POST /policies/:id/cancel-calculate (money and percentages are decimal strings). */
export interface CancellationCalcResult {
  totalDays: number;
  daysUsed: number;
  remainingDays: number;
  retentionPercent: string;
  refundPercent: string;
  refundNet: string;
  stampDuty: string;
  vat: string;
  totalRefund: string;
  method: 'PRO_RATA' | 'SHORT_RATE';
}

export interface RequestCancellationDto {
  cancelReason: string;
  cancelRequestDate: string;
  cancelEffectiveDate: string;
  cancelRefundAmount?: string;
  cancelOutstandingAmount?: string;
}

export interface ApproveCancellationDto {
  cancelInsurerDocumentId: string;
}

export interface RejectCancellationDto {
  reason: string;
}

@Injectable({ providedIn: 'root' })
export class PoliciesExtendedApi {
  private readonly http = inject(HttpClient);

  // Endorsements
  getPolicyEndorsements(policyId: string): Observable<EndorsementResponse[]> {
    return this.http.get<ItemResponse<EndorsementResponse[]>>(`/api/policies/${policyId}/endorsements`).pipe(map((r) => r.data));
  }

  createEndorsement(policyId: string, dto: CreateEndorsementDto): Observable<EndorsementResponse> {
    return this.http.post<ItemResponse<EndorsementResponse>>(`/api/policies/${policyId}/endorsements`, dto).pipe(map((r) => r.data));
  }

  calculateProRata(policyId: string, dto: CalculateProRataDto): Observable<ProRataResult> {
    return this.http.post<ItemResponse<ProRataResult>>(`/api/policies/${policyId}/endorsements/calculate-pro-rata`, dto).pipe(map((r) => r.data));
  }

  submitEndorsement(id: string): Observable<EndorsementResponse> {
    return this.http.post<ItemResponse<EndorsementResponse>>(`/api/endorsements/${id}/submit`, {}).pipe(map((r) => r.data));
  }

  startReview(id: string): Observable<EndorsementResponse> {
    return this.http.post<ItemResponse<EndorsementResponse>>(`/api/endorsements/${id}/start-review`, {}).pipe(map((r) => r.data));
  }

  approveEndorsement(id: string): Observable<EndorsementResponse> {
    return this.http.post<ItemResponse<EndorsementResponse>>(`/api/endorsements/${id}/approve`, {}).pipe(map((r) => r.data));
  }

  rejectEndorsement(id: string, reason?: string): Observable<EndorsementResponse> {
    return this.http.post<ItemResponse<EndorsementResponse>>(`/api/endorsements/${id}/reject`, { reason }).pipe(map((r) => r.data));
  }

  issueEndorsement(id: string): Observable<EndorsementResponse> {
    return this.http.post<ItemResponse<EndorsementResponse>>(`/api/endorsements/${id}/issue`, {}).pipe(map((r) => r.data));
  }

  cancelEndorsement(id: string, reason?: string): Observable<EndorsementResponse> {
    return this.http.post<ItemResponse<EndorsementResponse>>(`/api/endorsements/${id}/cancel`, { reason }).pipe(map((r) => r.data));
  }

  // Versions
  getPolicyVersions(policyId: string): Observable<PolicyVersionResponse[]> {
    return this.http.get<ItemResponse<PolicyVersionResponse[]>>(`/api/policies/${policyId}/versions`).pipe(map((r) => r.data));
  }

  // Cancellation
  calculateCancellation(policyId: string, dto: CalculateCancellationRefundDto): Observable<CancellationCalcResult> {
    return this.http.post<ItemResponse<CancellationCalcResult>>(`/api/policies/${policyId}/cancel-calculate`, dto).pipe(map((r) => r.data));
  }

  requestCancellation(policyId: string, dto: RequestCancellationDto): Observable<PolicyCancellationResult> {
    return this.http.post<ItemResponse<PolicyCancellationResult>>(`/api/policies/${policyId}/cancel-request`, dto).pipe(map((r) => r.data));
  }

  approveCancellation(policyId: string, dto: ApproveCancellationDto): Observable<PolicyCancellationResult> {
    return this.http.post<ItemResponse<PolicyCancellationResult>>(`/api/policies/${policyId}/cancel-approve`, dto).pipe(map((r) => r.data));
  }

  rejectCancellation(policyId: string, dto: RejectCancellationDto): Observable<PolicyCancellationResult> {
    return this.http.post<ItemResponse<PolicyCancellationResult>>(`/api/policies/${policyId}/cancel-reject`, dto).pipe(map((r) => r.data));
  }
}

