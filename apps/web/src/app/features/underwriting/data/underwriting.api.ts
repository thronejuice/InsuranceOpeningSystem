import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';

export type UnderwritingStatus = 'PENDING' | 'INFO_REQUIRED' | 'APPROVED' | 'REJECTED';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface UnderwritingUserSummary {
  id: string;
  username: string;
  fullName: string;
}

export interface UnderwritingRecord {
  id: string;
  jobId: string;
  version: number;
  status: UnderwritingStatus;
  riskLevel: RiskLevel | null;
  riskScore: number | null;
  requestedById: string | null;
  requestedBy: UnderwritingUserSummary | null;
  requestedAt: string;
  underwriterId: string | null;
  underwriter: UnderwritingUserSummary | null;
  reviewedAt: string | null;
  reason: string | null;
  condition: string | null;
  exclusion: string | null;
  deductible: string | null;
  requiredSurvey: boolean;
  requiredDocuments: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface UnderwritingByJobResponse {
  latest: UnderwritingRecord | null;
  history: UnderwritingRecord[];
}

export interface UnderwritingInboxItem extends UnderwritingRecord {
  job: {
    id: string;
    jobNo: string;
    status: string;
    priority: string;
    customer: { id: string; firstName: string | null; lastName: string | null; companyName: string | null };
    product: { id: string; code: string; name: string };
    agent: { id: string; username: string; fullName: string };
  };
}

export interface ReviewUnderwritingDto {
  riskLevel?: RiskLevel;
  riskScore?: number;
  reason?: string;
  condition?: string;
  exclusion?: string;
  deductible?: string | number;
  requiredSurvey?: boolean;
  requiredDocuments?: string[];
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class UnderwritingApi {
  private readonly http = inject(HttpClient);

  getByJob(jobId: string): Observable<UnderwritingByJobResponse> {
    return this.http
      .get<ApiResponse<UnderwritingByJobResponse>>(`/api/jobs/${jobId}/underwriting`)
      .pipe(map((r) => r.data));
  }

  getInbox(): Observable<UnderwritingInboxItem[]> {
    return this.http
      .get<ApiResponse<UnderwritingInboxItem[]>>('/api/underwriting/inbox')
      .pipe(map((r) => r.data));
  }

  requestReview(jobId: string, reason?: string): Observable<UnderwritingRecord> {
    return this.http
      .post<ApiResponse<UnderwritingRecord>>(`/api/jobs/${jobId}/underwriting/request-review`, { reason })
      .pipe(map((r) => r.data));
  }

  approve(jobId: string, dto: ReviewUnderwritingDto): Observable<UnderwritingRecord> {
    return this.http
      .post<ApiResponse<UnderwritingRecord>>(`/api/jobs/${jobId}/underwriting/approve`, dto)
      .pipe(map((r) => r.data));
  }

  requireInfo(jobId: string, dto: ReviewUnderwritingDto): Observable<UnderwritingRecord> {
    return this.http
      .post<ApiResponse<UnderwritingRecord>>(`/api/jobs/${jobId}/underwriting/require-info`, dto)
      .pipe(map((r) => r.data));
  }

  reject(jobId: string, dto: ReviewUnderwritingDto): Observable<UnderwritingRecord> {
    return this.http
      .post<ApiResponse<UnderwritingRecord>>(`/api/jobs/${jobId}/underwriting/reject`, dto)
      .pipe(map((r) => r.data));
  }

  resume(jobId: string, reason?: string): Observable<UnderwritingRecord> {
    return this.http
      .post<ApiResponse<UnderwritingRecord>>(`/api/jobs/${jobId}/underwriting/resume`, { reason })
      .pipe(map((r) => r.data));
  }
}
