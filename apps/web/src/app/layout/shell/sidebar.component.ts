import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { SidebarService } from './sidebar.service';

interface MenuItem {
  label: string;
  icon: string;
  route: string;
  permission?: string;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

const MENU_SECTIONS: MenuSection[] = [
  {
    title: 'ภาพรวม',
    items: [
      { label: 'แดชบอร์ด', icon: 'pi pi-chart-pie', route: '/dashboard' },
    ],
  },
  {
    title: 'งานและกรมธรรม์',
    items: [
      { label: 'งานประกันภัย', icon: 'pi pi-briefcase', route: '/jobs', permission: 'job.view' },
      { label: 'ข้อมูลลูกค้า', icon: 'pi pi-users', route: '/customers', permission: 'customer.view' },
      { label: 'ใบเสนอราคา', icon: 'pi pi-file', route: '/quotations', permission: 'job.view' },
      { label: 'กรมธรรม์', icon: 'pi pi-shield', route: '/policies', permission: 'policy.view' },
      { label: 'งานต่ออายุ', icon: 'pi pi-refresh', route: '/renewals', permission: 'renewal.view' },
      { label: 'ติดตามงาน', icon: 'pi pi-check-square', route: '/tasks' },
    ],
  },
  {
    title: 'การเงินและอนุมัติ',
    items: [
      { label: 'การชำระเงิน', icon: 'pi pi-credit-card', route: '/payments', permission: 'payment.view' },
      { label: 'ค่าคอมมิชชั่น', icon: 'pi pi-dollar', route: '/commissions', permission: 'commission.view' },
      { label: 'การอนุมัติ', icon: 'pi pi-check-circle', route: '/approvals', permission: 'approval.manage' },
      { label: 'Underwriting', icon: 'pi pi-shield', route: '/underwriting', permission: 'underwriting.review' },
    ],
  },
  {
    title: 'จัดการระบบ',
    items: [
      { label: 'นำเข้าข้อมูล', icon: 'pi pi-upload', route: '/imports', permission: 'import.create' },
      { label: 'ข้อมูลหลัก', icon: 'pi pi-database', route: '/master', permission: 'master.manage' },
      { label: 'ผู้ใช้งาน', icon: 'pi pi-user-edit', route: '/users', permission: 'user.manage' },
      { label: 'บันทึกประวัติ (Audit)', icon: 'pi pi-history', route: '/audit-logs', permission: 'audit.view' },
    ],
  },
];

@Component({
  selector: 'app-sidebar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  host: {
    '[class.sidebar-hidden]': 'sidebarService.isHidden()',
    '[class.sidebar-collapsed]': 'sidebarService.isCollapsed() && !sidebarService.isMobile()',
    '[attr.inert]': 'sidebarService.isHidden() ? "" : null',
    '[attr.aria-hidden]': 'sidebarService.isHidden()',
  },
  template: `
    <nav class="sidebar" [class.collapsed]="sidebarService.isCollapsed() && !sidebarService.isMobile()">
      <!-- Logo Header -->
      <div class="sidebar-logo">
        <a routerLink="/dashboard" class="logo-link" title="InsureOps System">
          <div class="logo-icon">
            <svg width="30" height="30" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="shieldGrad" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#2563eb" />
                  <stop offset="100%" stop-color="#3b82f6" />
                </linearGradient>
              </defs>
              <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#shieldGrad)" />
              <path d="M16 6.5L9.5 9.5V15.2C9.5 19.3 12.3 23.1 16 24.5C19.7 23.1 22.5 19.3 22.5 15.2V9.5L16 6.5Z" fill="white" fill-opacity="0.25" />
              <path d="M16 8L11 10.3V14.8C11 18.2 13.1 21.3 16 22.6C18.9 21.3 21 18.2 21 14.8V10.3L16 8Z" stroke="white" stroke-width="1.5" stroke-linejoin="round" />
              <path d="M13.8 15.2L15.3 16.7L18.5 13.3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>
          @if (!sidebarService.isCollapsed() || sidebarService.isMobile()) {
            <div class="logo-text-group">
              <span class="logo-brand">INSURE<span class="logo-accent">OPS</span></span>
              <span class="logo-sub">OPENING SYSTEM</span>
            </div>
          }
        </a>
      </div>

      <!-- Navigation Menu Groups -->
      <div class="sidebar-scroll">
        @for (section of visibleSections(); track section.title) {
          @if (section.items.length > 0) {
            <div class="menu-section">
              @if (!sidebarService.isCollapsed() || sidebarService.isMobile()) {
                <div class="section-header">{{ section.title }}</div>
              } @else {
                <div class="section-divider"></div>
              }
              <ul class="section-list">
                @for (item of section.items; track item.route) {
                  <li>
                    <a
                      [routerLink]="item.route"
                      routerLinkActive="active"
                      class="menu-item"
                      [title]="item.label"
                    >
                      <i [class]="item.icon" class="item-icon"></i>
                      @if (!sidebarService.isCollapsed() || sidebarService.isMobile()) {
                        <span class="item-label">{{ item.label }}</span>
                      }
                    </a>
                  </li>
                }
              </ul>
            </div>
          }
        }
      </div>

      <!-- Sidebar Footer with Collapse Toggle -->
      @if (!sidebarService.isMobile()) {
        <div class="sidebar-footer">
          <button
            type="button"
            class="collapse-btn"
            (click)="sidebarService.toggleCollapse()"
            [title]="sidebarService.isCollapsed() ? 'ขยายเมนู' : 'ย่อเมนู'"
          >
            <i [class]="sidebarService.isCollapsed() ? 'pi pi-angle-double-right' : 'pi pi-angle-double-left'"></i>
            @if (!sidebarService.isCollapsed()) {
              <span>ย่อแถบเมนู</span>
            }
          </button>
        </div>
      }
    </nav>
  `,
  styles: [`
    :host {
      display: flex;
      flex-shrink: 0;
      height: 100%;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 20;
    }
    :host(.sidebar-hidden) {
      margin-left: -260px;
    }
    :host(.sidebar-collapsed) {
      width: 72px;
    }
    .sidebar {
      width: 250px;
      height: 100%;
      background: var(--surface-card);
      border-right: 1px solid var(--surface-border);
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .sidebar.collapsed {
      width: 72px;
    }
    .sidebar-logo {
      padding: 0 1rem;
      height: 60px;
      border-bottom: 1px solid var(--surface-border-subtle);
      display: flex;
      align-items: center;
      box-sizing: border-box;
    }
    .logo-link {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      text-decoration: none;
      min-width: 0;
      flex: 1;
    }
    .collapsed .logo-link {
      justify-content: center;
      gap: 0;
    }
    .logo-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: transform 0.2s ease;
    }
    .logo-link:hover .logo-icon {
      transform: scale(1.05);
    }
    .logo-text-group {
      display: flex;
      flex-direction: column;
      line-height: 1.15;
      min-width: 0;
    }
    .logo-brand {
      font-weight: 800;
      font-size: 0.95rem;
      letter-spacing: 0.05em;
      color: var(--text-color);
    }
    .logo-accent {
      color: var(--primary-color);
    }
    .logo-sub {
      font-size: 0.58rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: var(--text-color-secondary);
      text-transform: uppercase;
    }
    .sidebar-scroll {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 0.75rem 0.6rem;
    }
    .menu-section {
      margin-bottom: 1.25rem;
    }
    .section-header {
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-color-tertiary);
      padding: 0.35rem 0.75rem;
      margin-bottom: 0.25rem;
    }
    .section-divider {
      height: 1px;
      background: var(--surface-border-subtle);
      margin: 0.5rem 0.4rem;
    }
    .section-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .menu-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem 0.75rem;
      text-decoration: none;
      color: var(--text-color-secondary);
      border-radius: var(--radius-md);
      transition: all 0.2s ease;
      font-size: 0.88rem;
      font-weight: 500;
      position: relative;
    }
    .collapsed .menu-item {
      justify-content: center;
      padding: 0.65rem 0;
    }
    .item-icon {
      font-size: 1rem;
      flex-shrink: 0;
      transition: transform 0.2s ease;
    }
    .item-label {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .menu-item:hover {
      background: var(--surface-hover);
      color: var(--text-color);
    }
    .menu-item:hover .item-icon {
      transform: scale(1.1);
    }
    .menu-item.active {
      background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-hover) 100%);
      color: #ffffff;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.22);
    }
    .menu-item.active .item-icon {
      color: #ffffff;
    }
    .sidebar-footer {
      padding: 0.5rem 0.6rem;
      border-top: 1px solid var(--surface-border-subtle);
    }
    .collapse-btn {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.5rem 0.75rem;
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-md);
      color: var(--text-color-secondary);
      cursor: pointer;
      font-size: 0.82rem;
      font-family: inherit;
      transition: all 0.2s ease;
    }
    .collapsed .collapse-btn {
      justify-content: center;
      padding: 0.5rem 0;
    }
    .collapse-btn:hover {
      background: var(--surface-hover);
      color: var(--text-color);
    }
    @media (max-width: 768px) {
      :host {
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        z-index: 50;
        box-shadow: 4px 0 24px rgba(0, 0, 0, 0.14);
      }
      :host(.sidebar-hidden) {
        margin-left: -260px;
      }
    }
  `],
})
export class SidebarComponent {
  private readonly store = inject(AuthStore);
  protected readonly sidebarService = inject(SidebarService);

  readonly visibleSections = computed(() =>
    MENU_SECTIONS.map((section) => ({
      title: section.title,
      items: section.items.filter(
        (item) => !item.permission || this.store.hasPermission(item.permission),
      ),
    })),
  );
}

