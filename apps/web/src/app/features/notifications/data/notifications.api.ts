import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';

export interface NotificationRecord {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationRecord[];
  total: number;
  unreadCount: number;
}

export type NotificationType =
  | 'JOB_ASSIGNED'
  | 'DOCUMENT_MISSING'
  | 'QUOTATION_RECEIVED'
  | 'APPROVAL_REQUIRED'
  | 'APPROVAL_REQUESTED'
  | 'PROPOSAL_SENT'
  | 'CUSTOMER_ACCEPTED'
  | 'CUSTOMER_REJECTED'
  | 'POLICY_ISSUED'
  | 'PAYMENT_OVERDUE'
  | 'TASK_DUE'
  | 'RENEWAL_DUE';

export interface NotificationPreferenceItem {
  type: NotificationType;
  email: boolean;
  inApp: boolean;
}

export interface UpdateNotificationPreferencesDto {
  preferences: {
    type: NotificationType;
    email?: boolean;
    inApp?: boolean;
  }[];
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class NotificationsApi {
  private readonly http = inject(HttpClient);

  list(page = 1, perPage = 20): Observable<NotificationListResponse> {
    return this.http
      .get<ApiResponse<NotificationListResponse>>('/api/notifications', {
        params: { page, perPage },
      })
      .pipe(map((r) => r.data));
  }

  unreadCount(): Observable<{ count: number }> {
    return this.http
      .get<ApiResponse<{ count: number }>>('/api/notifications/unread-count')
      .pipe(map((r) => r.data));
  }

  markRead(id: string): Observable<NotificationRecord> {
    return this.http
      .post<ApiResponse<NotificationRecord>>(`/api/notifications/${id}/read`, {})
      .pipe(map((r) => r.data));
  }

  markAllRead(): Observable<{ updated: number }> {
    return this.http
      .post<ApiResponse<{ updated: number }>>('/api/notifications/read-all', {})
      .pipe(map((r) => r.data));
  }

  getPreferences(): Observable<NotificationPreferenceItem[]> {
    return this.http
      .get<ApiResponse<NotificationPreferenceItem[]>>('/api/notifications/preferences')
      .pipe(map((r) => r.data));
  }

  updatePreferences(dto: UpdateNotificationPreferencesDto): Observable<NotificationPreferenceItem[]> {
    return this.http
      .put<ApiResponse<NotificationPreferenceItem[]>>('/api/notifications/preferences', dto)
      .pipe(map((r) => r.data));
  }
}
