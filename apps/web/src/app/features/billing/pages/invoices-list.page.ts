import { ExportService } from '../../../core/api/export.service';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import { UiButton, UiInput, UiSelect } from '../../../shared/ui';
import { BillingApi, type Invoice } from '../data/billing.api';

const STATUS_OPTIONS = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'PENDING', label: 'รอชำระ' },
  { value: 'PARTIALLY_PAID', label: 'ชำระบางส่วน' },
  { value: 'OVERDUE', label: 'เกินกำหนด' },
  { value: 'PAID', label: 'ชำระครบ' },
  { value: 'CANCELLED', label: 'ยกเลิก' },
];

@Component({
  selector: 'app-invoices-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HasPermissionDirective, RouterLink, FormsModule, UiButton, UiInput, UiSelect, AppPageHeaderComponent, AppStateComponent, AppStatusBadgeComponent, MoneyPipe, ThDatePipe],
  template: `
    <app-page-header title="ใบแจ้งหนี้" subtitle="ใบแจ้งหนี้ทุกงวดของกรมธรรม์">
      <ui-button *appHasPermission="'report.view'" label="Export Excel" icon="pi pi-file-excel" severity="secondary" [outlined]="true" size="small" (onClick)="exportExcel()" />
    </app-page-header>

    <div class="filters">
      <ui-select inputId="inv-status" [(ngModel)]="status" [options]="statusOptions" optionLabel="label" optionValue="value" (ngModelChange)="reload()" />
      <label>ครบกำหนดก่อน <input uiInput type="date" [(ngModel)]="dueBefore" (ngModelChange)="reload()" /></label>
      <label>ครบกำหนดหลัง <input uiInput type="date" [(ngModel)]="dueAfter" (ngModelChange)="reload()" /></label>
    </div>

    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else if (items().length === 0) {
      <app-state state="empty" emptyMessage="ไม่พบใบแจ้งหนี้" />
    } @else {
      <div class="card">
        <table class="data-table">
          <thead>
            <tr>
              <th>เลขที่</th><th>ลูกค้า</th><th>กรมธรรม์</th><th>งวด</th><th>ครบกำหนด</th>
              <th class="num">ยอด</th><th class="num">ค้างชำระ</th><th>สถานะ</th><th></th>
            </tr>
          </thead>
          <tbody>
            @for (inv of items(); track inv.id) {
              <tr>
                <td class="mono">{{ inv.invoiceNo }}</td>
                <td>{{ inv.customer?.name ?? '-' }}</td>
                <td>@if (inv.policy) { <a class="link" [routerLink]="['/policies', inv.policyId]">{{ inv.policy.policyNo }}</a> }</td>
                <td>{{ inv.installmentNo ?? '-' }}</td>
                <td>{{ inv.dueDate | thDate }}</td>
                <td class="num">{{ inv.amount | money }}</td>
                <td class="num"><strong>{{ inv.outstandingAmount | money }}</strong></td>
                <td><app-status-badge [status]="inv.status" /></td>
                <td><ui-button icon="pi pi-file-pdf" label="PDF" size="small" [text]="true" severity="secondary" (onClick)="pdf(inv.id)" /></td>
              </tr>
            }
          </tbody>
        </table>
        <div class="pager">
          <span>{{ total() }} รายการ · หน้า {{ page() }}/{{ pages() }}</span>
          <ui-button icon="pi pi-chevron-left" size="small" [text]="true" [disabled]="page() <= 1" (onClick)="go(page() - 1)" />
          <ui-button icon="pi pi-chevron-right" size="small" [text]="true" [disabled]="page() >= pages()" (onClick)="go(page() + 1)" />
        </div>
      </div>
    }
  `,
  styles: [`
    .filters { display: flex; gap: 1rem; align-items: end; margin-bottom: 1rem; flex-wrap: wrap; font-size: 0.85rem; }
    .filters label { display: flex; flex-direction: column; gap: 0.2rem; }
    .card { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 8px; padding: 1.5rem; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .data-table th { text-align: left; padding: 0.5rem 0.75rem; background: var(--surface-ground); border-bottom: 2px solid var(--surface-border); font-size: 0.8rem; color: var(--text-color-secondary); white-space: nowrap; }
    .data-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--surface-border); }
    .num { text-align: right; }
    .mono { font-family: monospace; }
    .link { color: var(--primary-color); text-decoration: none; }
    .pager { display: flex; gap: 0.5rem; align-items: center; justify-content: flex-end; margin-top: 1rem; font-size: 0.85rem; }
  `],
})
export class InvoicesListPage implements OnInit {
  private readonly exportSvc = inject(ExportService);

  exportExcel(): void {
    this.exportSvc.download('invoices');
  }

  private readonly api = inject(BillingApi);
  private readonly perPage = 20;

  readonly statusOptions = STATUS_OPTIONS;
  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly items = signal<Invoice[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  status = '';
  dueBefore = '';
  dueAfter = '';

  pages(): number {
    return Math.max(1, Math.ceil(this.total() / this.perPage));
  }

  ngOnInit(): void {
    this.load();
  }

  reload(): void {
    this.page.set(1);
    this.load();
  }

  go(p: number): void {
    this.page.set(p);
    this.load();
  }

  pdf(id: string): void {
    this.api.openPdf('invoices', id);
  }

  private load(): void {
    this.state.set('loading');
    this.api
      .listInvoices({ status: this.status, dueBefore: this.dueBefore, dueAfter: this.dueAfter, page: this.page(), perPage: this.perPage })
      .subscribe({
        next: (r) => { this.items.set(r.items); this.total.set(r.total); this.state.set('none'); },
        error: () => this.state.set('error'),
      });
  }
}
