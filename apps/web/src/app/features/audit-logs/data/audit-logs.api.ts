import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface AuditLogUser {
  id: string;
  username: string;
  fullName: string;
}

export interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  jobId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  source?: string | null;
  remark?: string | null;
  description?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  user?: AuditLogUser | null;
}

export interface AuditLogQuery {
  page?: number;
  perPage?: number;
  userId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
}

export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  lastPage: number;
}

export interface ListResponse<T> {
  success: boolean;
  data: T[];
  meta: PaginationMeta;
}

@Injectable({ providedIn: 'root' })
export class AuditLogsApi {
  private readonly http = inject(HttpClient);

  list(query: AuditLogQuery): Observable<ListResponse<AuditLogItem>> {
    let params = new HttpParams();
    if (query.page != null) params = params.set('page', query.page);
    if (query.perPage != null) params = params.set('perPage', query.perPage);
    if (query.userId) params = params.set('userId', query.userId);
    if (query.entityType) params = params.set('entityType', query.entityType);
    if (query.entityId) params = params.set('entityId', query.entityId);
    if (query.action) params = params.set('action', query.action);
    if (query.startDate) params = params.set('startDate', query.startDate);
    if (query.endDate) params = params.set('endDate', query.endDate);

    return this.http.get<ListResponse<AuditLogItem>>('/api/audit-logs', { params });
  }
}

