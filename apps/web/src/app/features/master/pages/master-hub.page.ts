import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

const TABS = [
  { label: 'ประเภทประกันภัย', route: 'insurance-types' },
  { label: 'ผลิตภัณฑ์', route: 'products' },
  { label: 'บริษัทประกันภัย', route: 'companies' },
  { label: 'Risk Fields', route: 'risk-fields' },
  { label: 'ข้อมูลบริษัท (หัวกระดาษ)', route: 'company-profile' },
];

@Component({
  selector: 'app-master-hub-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="master-tabs">
      @for (tab of tabs; track tab.route) {
        <a [routerLink]="tab.route" routerLinkActive="active" class="tab-item">{{ tab.label }}</a>
      }
    </div>
    <div class="master-content">
      <router-outlet />
    </div>
  `,
  styles: [`
    .master-tabs {
      display: flex;
      gap: 0;
      border-bottom: 2px solid var(--surface-border);
      margin-bottom: 1.5rem;
    }
    .tab-item {
      padding: 0.6rem 1.25rem;
      text-decoration: none;
      color: var(--text-color-secondary);
      font-size: 0.9rem;
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      transition: color 0.15s, border-color 0.15s;
    }
    .tab-item:hover { color: var(--text-color); }
    .tab-item.active { color: var(--primary-color); border-bottom-color: var(--primary-color); font-weight: 600; }
  `],
})
export class MasterHubPage {
  readonly tabs = TABS;
}
