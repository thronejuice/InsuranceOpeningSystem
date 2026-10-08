import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AuthStore } from '../../core/auth/auth.store';
import { NotificationBellComponent } from '../../features/notifications/components/notification-bell.component';
import { NotificationPreferencesDialogComponent } from '../../features/notifications/components/notification-preferences-dialog.component';
import { UiButton, UiDivider, UiPopover } from '../../shared/ui';
import { SidebarService } from './sidebar.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiButton, UiDivider, UiPopover, NotificationBellComponent, NotificationPreferencesDialogComponent],
  template: `
    <header class="topbar">
      <div class="topbar-left">
        <button
          type="button"
          class="topbar-toggle-btn"
          (click)="sidebarService.toggle()"
          [attr.aria-label]="sidebarService.isHidden() ? 'แสดงเมนู' : 'ซ่อนเมนู'"
          [attr.title]="sidebarService.isHidden() ? 'แสดงเมนู' : 'ซ่อนเมนู'"
        >
          <i class="pi pi-bars"></i>
        </button>
        <div class="breadcrumb-context">
          <span class="system-title">ระบบจัดการงานเปิดประกัน</span>
        </div>
      </div>

      <div class="topbar-right">
        <div class="system-status-badge">
          <span class="status-pulse-dot"></span>
          <span class="status-text">ออนไลน์</span>
        </div>

        @if (store.user(); as user) {
          <app-notification-bell />

          <div class="topbar-divider"></div>

          <!-- Profile Trigger -->
          <button
            type="button"
            class="profile-btn"
            (click)="profilePanel.toggle($event)"
            title="ดูข้อมูลโปรไฟล์"
            aria-label="User Profile"
          >
            <div class="avatar-circle">
              {{ getInitials(user.fullName) }}
            </div>
            <div class="profile-info">
              <span class="user-fullname">{{ user.fullName }}</span>
              <span class="user-role-badge">{{ getPrimaryRole(user.roles) }}</span>
            </div>
            <i class="pi pi-angle-down profile-chevron"></i>
          </button>

          <!-- Profile Details Popover Panel -->
          <ui-popover #profilePanel>
            <div class="profile-panel">
              <div class="profile-card-header">
                <div class="profile-card-avatar">
                  {{ getInitials(user.fullName) }}
                </div>
                <div class="profile-card-user">
                  <div class="profile-card-name">{{ user.fullName }}</div>
                  <div class="profile-card-email">{{ user.email }}</div>
                  <div class="profile-card-role-tag">
                    <i class="pi pi-shield"></i>
                    <span>{{ getPrimaryRole(user.roles) }}</span>
                  </div>
                </div>
              </div>

              <ui-divider styleClass="my-2" />

              <div class="profile-details-list">
                <div class="profile-detail-item">
                  <span class="detail-label"><i class="pi pi-user mr-1"></i> ชื่อผู้ใช้</span>
                  <span class="detail-value">&#64;{{ user.username }}</span>
                </div>
                <div class="profile-detail-item">
                  <span class="detail-label"><i class="pi pi-envelope mr-1"></i> อีเมล</span>
                  <span class="detail-value">{{ user.email }}</span>
                </div>
                <div class="profile-detail-item">
                  <span class="detail-label"><i class="pi pi-id-card mr-1"></i> บทบาท</span>
                  <span class="detail-value">
                    @for (role of user.roles; track role) {
                      <span class="role-pill">{{ role }}</span>
                    }
                  </span>
                </div>
              </div>

              <ui-divider styleClass="my-2" />

              <div class="profile-card-actions" style="margin-bottom: 0.5rem;">
                <ui-button
                  label="ตั้งค่าการแจ้งเตือน"
                  icon="pi pi-bell"
                  [outlined]="true"
                  size="small"
                  styleClass="w-full"
                  (onClick)="showPreferencesDialog.set(true); profilePanel.hide()"
                />
              </div>

              <div class="profile-card-footer">
                <ui-button
                  label="ออกจากระบบ"
                  icon="pi pi-sign-out"
                  severity="danger"
                  [outlined]="true"
                  size="small"
                  styleClass="w-full"
                  (onClick)="logout(); profilePanel.hide()"
                />
              </div>
            </div>
          </ui-popover>

          <app-notification-preferences-dialog [(visible)]="showPreferencesDialog" />
        }
      </div>
    </header>
  `,
  styles: [`
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 1.5rem;
      height: 60px;
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--surface-border);
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .topbar-left {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .breadcrumb-context {
      display: flex;
      align-items: center;
    }
    .system-title {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-color);
      letter-spacing: 0.02em;
    }
    .topbar-toggle-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: 1px solid var(--surface-border);
      background: var(--surface-card);
      border-radius: var(--radius-md);
      cursor: pointer;
      color: var(--text-color-secondary);
      font-size: 0.95rem;
      transition: all 0.2s ease;

      &:hover {
        background-color: var(--surface-hover);
        color: var(--text-color);
        border-color: #cbd5e1;
      }
    }
    .topbar-right {
      display: flex;
      align-items: center;
      gap: 0.85rem;
    }
    .system-status-badge {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.2rem 0.6rem;
      background: var(--green-50);
      border: 1px solid var(--green-100);
      border-radius: var(--radius-full);
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--green-700);
    }
    .status-pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--green-500);
      box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.25);
    }
    .topbar-divider {
      width: 1px;
      height: 24px;
      background: var(--surface-border);
      margin: 0 0.25rem;
    }
    .profile-btn {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      background: transparent;
      border: 1px solid transparent;
      padding: 3px 8px 3px 3px;
      border-radius: var(--radius-full);
      cursor: pointer;
      transition: all 0.2s ease;
      color: var(--text-color);

      &:hover {
        background-color: var(--surface-hover);
        border-color: var(--surface-border);
      }
    }
    .avatar-circle {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--primary-color), #0284c7);
      color: #ffffff;
      font-size: 0.8rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      letter-spacing: 0.5px;
      flex-shrink: 0;
    }
    .profile-info {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      line-height: 1.2;
      text-align: left;
    }
    .user-fullname {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-color);
    }
    .user-role-badge {
      font-size: 0.7rem;
      color: var(--text-color-secondary);
    }
    .profile-chevron {
      font-size: 0.75rem;
      color: var(--text-color-secondary);
    }

    /* Popover Profile Card */
    .profile-panel {
      min-width: 280px;
      max-width: 320px;
      padding: 0.25rem;
    }
    .profile-card-header {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      padding: 0.5rem 0.25rem;
    }
    .profile-card-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--primary-color), #0284c7);
      color: #ffffff;
      font-size: 1.1rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(25, 118, 210, 0.25);
    }
    .profile-card-user {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .profile-card-name {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text-color);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .profile-card-email {
      font-size: 0.8rem;
      color: var(--text-color-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .profile-card-role-tag {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      margin-top: 0.25rem;
      font-size: 0.72rem;
      color: var(--primary-color);
      font-weight: 600;
    }
    .profile-details-list {
      padding: 0.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .profile-detail-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.82rem;
    }
    .detail-label {
      color: var(--text-color-secondary);
      display: flex;
      align-items: center;
    }
    .detail-value {
      font-weight: 500;
      color: var(--text-color);
    }
    .role-pill {
      display: inline-block;
      padding: 0.1rem 0.45rem;
      border-radius: 4px;
      background: var(--primary-50);
      color: var(--primary-color);
      font-size: 0.75rem;
      font-weight: 600;
    }
    .profile-card-footer {
      padding-top: 0.25rem;
    }

    @media (max-width: 640px) {
      .profile-info {
        display: none;
      }
    }
  `],
})
export class TopbarComponent {
  protected readonly store = inject(AuthStore);
  protected readonly sidebarService = inject(SidebarService);
  readonly showPreferencesDialog = signal(false);

  getInitials(name?: string): string {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  getPrimaryRole(roles?: string[]): string {
    if (!roles || roles.length === 0) return 'ผู้ใช้งานทั่วไป';
    const r = roles[0].toUpperCase();
    const roleMap: Record<string, string> = {
      ADMIN: 'ผู้ดูแลระบบ (Admin)',
      MANAGER: 'ผู้จัดการ (Manager)',
      SUPERVISOR: 'หัวหน้างาน (Supervisor)',
      AGENT: 'ตัวแทน (Agent)',
      BROKER: 'นายหน้า (Broker)',
      OPERATOR: 'เจ้าหน้าที่ (Operator)',
      ACCOUNTING: 'ฝ่ายการเงิน/บัญชี',
    };
    return roleMap[r] || r;
  }

  logout(): void {
    void this.store.logout();
  }
}


