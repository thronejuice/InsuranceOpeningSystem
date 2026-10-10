import { ExportService } from '../../../core/api/export.service';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { UiButton, UiSelect } from '../../../shared/ui';
import { AGING_BUCKETS, BillingApi, type ReceivableList } from '../data/billing.api';

@Component({
  selector: 'app-receivables-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HasPermissionDirective, RouterLink, FormsModule, UiButton, UiSelect, AppPageHeaderComponent, AppStateComponent, MoneyPipe],
  template: `
    <app-page-header title="ลูกหนี้คงค้าง (AR)" subtitle="ยอดค้างชำระแยกตามอายุหนี้">
      <ui-button *appHasPermission="'report.view'" label="Export Excel" icon="pi pi-file-excel" severity="secondary" [outlined]="true" size="small" (onClick)="exportExcel()" />
    </app-page-header>

    <div class="filters">
      <ui-select inputId="ar-group" [(ngModel)]="groupBy" [options]="groupOptions" optionLabel="label" optionValue="value" (ngModelChange)="reload()" />
    </div>

    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else if (data(); as d) {
      <div class="cards">
        <div class="kpi"><span>ค้างชำระรวม</span><strong>{{ d.summary.outstanding | money }}</strong></div>
        @for (b of buckets; track b.key) {
          <div class="kpi"><span>{{ b.label }}</span><strong>{{ d.summary.aging[b.key] | money }}</strong></div>
        }
      </div>

      @if (d.items.length === 0) {
        <app-state state="empty" emptyMessage="ไม่มียอดค้างชำระ" />
      } @else {
        <div class="card">
          <table class="data-table">
            <thead>
              <tr>
                <th>ลูกค้า</th>
                @if (d.groupBy === 'policy') { <th>กรมธรรม์</th> }
                <th class="num">ใบแจ้งหนี้</th><th class="num">ค้างชำระ</th>
                @for (b of buckets; track b.key) { <th class="num">{{ b.label }}</th> }
              </tr>
            </thead>
            <tbody>
              @for (g of d.items; track g.key) {
                <tr>
                  <td>{{ g.customerName }}</td>
                  @if (d.groupBy === 'policy') {
                    <td><a class="link" [routerLink]="['/policies', g.policyId]">{{ g.policyNo }}</a></td>
                  }
                  <td class="num">{{ g.invoiceCount }}</td>
                  <td class="num"><strong>{{ g.outstanding | money }}</strong></td>
                  @for (b of buckets; track b.key) { <td class="num">{{ g.aging[b.key] | money }}</td> }
                </tr>
              }
            </tbody>
          </table>
          <div class="pager">
            <span>{{ d.total }} กลุ่ม · หน้า {{ d.page }}/{{ pages() }} · ณ วันที่ {{ d.asOf.slice(0, 10) }}</span>
            <ui-button icon="pi pi-chevron-left" size="small" [text]="true" [disabled]="d.page <= 1" (onClick)="go(d.page - 1)" />
            <ui-button icon="pi pi-chevron-right" size="small" [text]="true" [disabled]="d.page >= pages()" (onClick)="go(d.page + 1)" />
          </div>
        </div>
      }
    }
  `,
  styles: [`
    .filters { margin-bottom: 1rem; max-width: 220px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
    .kpi { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 8px; padding: 0.75rem 1rem; display: flex; flex-direction: column; gap: 0.25rem; }
    .kpi span { font-size: 0.75rem; color: var(--text-color-secondary); }
    .kpi strong { font-size: 1.05rem; }
    .card { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 8px; padding: 1.5rem; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .data-table th { text-align: left; padding: 0.5rem 0.75rem; background: var(--surface-ground); border-bottom: 2px solid var(--surface-border); font-size: 0.8rem; color: var(--text-color-secondary); white-space: nowrap; }
    .data-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--surface-border); }
    .num { text-align: right; }
    .link { color: var(--primary-color); text-decoration: none; }
    .pager { display: flex; gap: 0.5rem; align-items: center; justify-content: flex-end; margin-top: 1rem; font-size: 0.85rem; }
  `],
})
export class ReceivablesPage implements OnInit {
  private readonly exportSvc = inject(ExportService);

  exportExcel(): void {
    this.exportSvc.download('receivables');
  }

  private readonly api = inject(BillingApi);

  readonly buckets = AGING_BUCKETS;
  readonly groupOptions = [
    { value: 'customer', label: 'แยกตามลูกค้า' },
    { value: 'policy', label: 'แยกตามกรมธรรม์' },
  ];
  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly data = signal<ReceivableList | null>(null);
  groupBy: 'customer' | 'policy' = 'customer';
  private page = 1;

  pages(): number {
    const d = this.data();
    return d ? Math.max(1, Math.ceil(d.total / d.perPage)) : 1;
  }

  ngOnInit(): void {
    this.load();
  }

  reload(): void {
    this.page = 1;
    this.load();
  }

  go(p: number): void {
    this.page = p;
    this.load();
  }

  private load(): void {
    this.state.set('loading');
    this.api.receivables({ groupBy: this.groupBy, page: this.page, perPage: 20 }).subscribe({
      next: (d) => { this.data.set(d); this.state.set('none'); },
      error: () => this.state.set('error'),
    });
  }
}
