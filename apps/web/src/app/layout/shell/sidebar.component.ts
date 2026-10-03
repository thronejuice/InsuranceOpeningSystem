import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';

interface MenuItem {
  label: string;
  icon: string;
  route: string;
  permission?: string;
}

const MENU_ITEMS: MenuItem[] = [
  { label: 'Dashboard', icon: 'pi pi-home', route: '/dashboard' },
  { label: 'ลูกค้า', icon: 'pi pi-users', route: '/customers', permission: 'customer.view' },
  { label: 'งานประกัน', icon: 'pi pi-briefcase', route: '/jobs', permission: 'job.view' },
  { label: 'ใบเสนอราคา', icon: 'pi pi-file', route: '/quotations', permission: 'job.view' },
  { label: 'กรมธรรม์', icon: 'pi pi-shield', route: '/policies', permission: 'policy.view' },
  { label: 'การชำระเงิน', icon: 'pi pi-credit-card', route: '/payments', permission: 'payment.view' },
  { label: 'ค่าคอมมิชชั่น', icon: 'pi pi-dollar', route: '/commissions', permission: 'commission.view' },
  { label: 'การอนุมัติ', icon: 'pi pi-check-circle', route: '/approvals', permission: 'approval.manage' },
  { label: 'งาน/ติดตาม', icon: 'pi pi-calendar-check', route: '/tasks' },
  { label: 'ต่ออายุ', icon: 'pi pi-refresh', route: '/renewals', permission: 'renewal.view' },
  { label: 'Import', icon: 'pi pi-upload', route: '/imports', permission: 'import.create' },
  { label: 'ข้อมูลหลัก', icon: 'pi pi-database', route: '/master', permission: 'master.manage' },
  { label: 'ผู้ใช้งาน', icon: 'pi pi-user-edit', route: '/users', permission: 'user.manage' },
];

@Component({
  selector: 'app-sidebar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="sidebar">
      <div class="sidebar-logo">
        <span class="logo-text">Insurance</span>
      </div>
      <ul class="sidebar-menu">
        @for (item of visibleMenu(); track item.route) {
          <li>
            <a
              [routerLink]="item.route"
              routerLinkActive="active"
              class="menu-item"
            >
              <i [class]="item.icon"></i>
              <span>{{ item.label }}</span>
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
  styles: [`
    .sidebar {
      width: 220px;
      background: var(--surface-card);
      border-right: 1px solid var(--surface-border);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }
    .sidebar-logo {
      padding: 1.25rem 1rem;
      font-weight: 700;
      font-size: 1.1rem;
      color: var(--primary-color);
      border-bottom: 1px solid var(--surface-border);
    }
    .sidebar-menu {
      list-style: none;
      padding: 0.5rem 0;
      margin: 0;
    }
    .menu-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.65rem 1rem;
      text-decoration: none;
      color: var(--text-color);
      border-radius: 6px;
      margin: 0.1rem 0.5rem;
      transition: background 0.15s;
      font-size: 0.9rem;
    }
    .menu-item:hover {
      background: var(--surface-hover);
    }
    .menu-item.active {
      background: var(--primary-color);
      color: #fff;
    }
  `],
})
export class SidebarComponent {
  private readonly store = inject(AuthStore);

  readonly visibleMenu = computed(() =>
    MENU_ITEMS.filter(
      (item) => !item.permission || this.store.hasPermission(item.permission),
    ),
  );
}
