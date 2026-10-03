import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthStore } from '../../core/auth/auth.store';
import { ButtonModule } from 'primeng/button';
import { NotificationBellComponent } from '../../features/notifications/components/notification-bell.component';

@Component({
  selector: 'app-topbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, NotificationBellComponent],
  template: `
    <header class="topbar">
      <div class="topbar-title"></div>
      <div class="topbar-right">
        @if (store.user(); as user) {
          <app-notification-bell />
          <span class="user-name">{{ user.fullName }}</span>
          <p-button
            label="ออกจากระบบ"
            icon="pi pi-sign-out"
            severity="secondary"
            size="small"
            (onClick)="logout()"
          />
        }
      </div>
    </header>
  `,
  styles: [`
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 1.25rem;
      height: 56px;
      background: var(--surface-card);
      border-bottom: 1px solid var(--surface-border);
    }
    .topbar-right {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .user-name {
      font-size: 0.9rem;
      color: var(--text-color-secondary);
    }
  `],
})
export class TopbarComponent {
  protected readonly store = inject(AuthStore);

  logout(): void {
    void this.store.logout();
  }
}
