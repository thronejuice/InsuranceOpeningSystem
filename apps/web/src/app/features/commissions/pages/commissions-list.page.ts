import { ChangeDetectionStrategy, Component, inject, OnInit, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import { ExportService } from '../../../core/api/export.service';
import { MessageService, UiButton, UiInput, UiSelect } from '../../../shared/ui';
import { AdjustDialogComponent } from '../components/adjust-dialog.component';
import { TYPE_LABELS } from '../components/policy-commissions.component';
import { CommissionsApi, type CommissionRow, type CommissionSummary, type SummaryGroupBy } from '../data/commissions.api';

const STATUS_OPTIONS = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'CALCULATED', label: 'คำนวณแล้ว' },
  { value: 'APPROVED', label: 'อนุมัติแล้ว' },
  { value: 'PAYABLE', label: 'พร้อมจ่าย' },
  { value: 'PAID', label: 'จ่ายแล้ว' },
  { value: 'CANCELLED', label: 'ยกเลิก' },
];

const GROUP_OPTIONS: { value: SummaryGroupBy; label: string }[] = [
  { value: 'agent', label: 'ตามผู้รับ (Agent)' },
  { value: 'policy', label: 'ตามกรมธรรม์' },
  { value: 'insurer', label: 'ตามบริษัทประกัน' },
  { value: 'product', label: 'ตามผลิตภัณฑ์' },
  { value: 'period', label: 'ตามเดือนที่ออกกรมธรรม์' },
];

@Component({
  selector: 'app-commissions-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, UiButton, UiInput, UiSelect, HasPermissionDirective, AppPageHeaderComponent, AppStateComponent, AppStatusBadgeComponent, ThDatePipe, MoneyPipe, AdjustDialogComponent],
  template: `
    <app-page-header title="ค่าคอมมิชชัน" subtitle="รายการและสรุปค่าคอมมิชชัน">
      <ui-button label="ใบสรุปค่าคอม" icon="pi pi-wallet" severity="secondary" [outlined]="true" size="small" link="/commission-statements" />
      <ui-button label="Export Excel" icon="pi pi-file-excel" severity="secondary" [outlined]="true" size="small" (onClick)="export()" />
    </app-page-header>

    <div class="mode">
      <ui-button label="รายการ" size="small" [outlined]="mode() !== 'list'" (onClick)="mode.set('list')" />
      <ui-button label="สรุป" size="small" [outlined]="mode() !== 'summary'" (onClick)="showSummary()" />
    </div>

    <div class="filters">
      <ui-select inputId="c-status" [(ngModel)]="status" [options]="statusOptions" optionLabel="label" optionValue="value" (ngModelChange)="reload()" />
      @if (mode() === 'summary') {
        <ui-select inputId="c-group" [(ngModel)]="groupBy" [options]="groupOptions" optionLabel="label" optionValue="value" (ngModelChange)="reload()" />
        <label>ตั้งแต่เดือน <input uiInput type="month" [(ngModel)]="from" (ngModelChange)="reload()" /></label>
        <label>ถึงเดือน <input uiInput type="month" [(ngModel)]="to" (ngModelChange)="reload()" /></label>
      }
    </div>

    @if (error()) { <p class="err">{{ error() }}</p> }

    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else if (mode() === 'list') {
      @if (rows().length === 0) {
        <app-state state="empty" emptyMessage="ยังไม่มีข้อมูลค่าคอมมิชชัน" />
      } @else {
        <div class="card">
          <table class="data-table">
            <thead>
              <tr>
                <th>กรมธรรม์</th><th>ผู้รับ</th><th>ประเภท</th>
                <th class="num">ส่วนแบ่ง</th><th class="num">WHT</th><th class="num">สุทธิ</th>
                <th>สถานะ</th><th>วันที่จ่าย</th><th></th>
              </tr>
            </thead>
            <tbody>
              @for (c of rows(); track c.id) {
                <tr>
                  <td>@if (c.policy) { <a class="link" [routerLink]="['/policies', c.policy.id]">{{ c.policy.policyNo }}</a> }</td>
                  <td>{{ c.agent?.fullName ?? '-' }}</td>
                  <td>{{ typeLabel(c.commissionType) }}</td>
                  <td class="num">{{ c.commissionAmount | money }}</td>
                  <td class="num">{{ c.whtAmount ? (c.whtAmount | money) : '-' }}</td>
                  <td class="num"><strong>{{ c.netAmount ? (c.netAmount | money) : '-' }}</strong></td>
                  <td><app-status-badge [status]="c.status" /></td>
                  <td>{{ c.paidDate ? (c.paidDate | thDate) : '-' }}</td>
                  <td class="actions">
                    @if (c.status === 'CALCULATED') {
                      <ui-button *appHasPermission="'commission.approve'" label="อนุมัติ" size="small" icon="pi pi-check" (onClick)="approve(c)" />
                    }
                    @if (c.netAmount !== null && (c.status === 'APPROVED' || c.status === 'PAYABLE' || c.status === 'PAID')) {
                      <ui-button *appHasPermission="'commission.adjust'" label="ปรับปรุง" size="small" [text]="true" icon="pi pi-sliders-h" (onClick)="dialog().open(c)" />
                    }
                  </td>
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
    } @else if (summary(); as s) {
      <div class="card">
        <table class="data-table">
          <thead>
            <tr>
              <th>กลุ่ม</th><th class="num">รายการ</th><th class="num">ค่าคอมรวม</th><th class="num">ส่วน Broker</th>
              <th class="num">ส่วนแบ่งผู้รับ</th><th class="num">WHT</th><th class="num">สุทธิ</th>
              <th class="num">ปรับปรุง</th><th class="num">สุทธิรวม</th>
            </tr>
          </thead>
          <tbody>
            @for (g of s.items; track g.key) {
              <tr>
                <td>{{ g.label }}</td>
                <td class="num">{{ g.commissionCount }}</td>
                <td class="num">{{ g.grossAmount | money }}</td>
                <td class="num">{{ g.brokerShareAmount | money }}</td>
                <td class="num">{{ g.shareAmount | money }}</td>
                <td class="num">{{ g.whtAmount | money }}</td>
                <td class="num">{{ g.netAmount | money }}</td>
                <td class="num">{{ g.adjustmentNet | money }}</td>
                <td class="num"><strong>{{ g.totalNet | money }}</strong></td>
              </tr>
            } @empty {
              <tr><td colspan="9" class="empty">ไม่พบข้อมูล</td></tr>
            }
          </tbody>
          <tfoot>
            <tr>
              <td><strong>รวมทั้งหมด</strong></td>
              <td class="num">{{ s.summary.commissionCount }}</td>
              <td class="num">{{ s.summary.grossAmount | money }}</td>
              <td class="num">{{ s.summary.brokerShareAmount | money }}</td>
              <td class="num">{{ s.summary.shareAmount | money }}</td>
              <td class="num">{{ s.summary.whtAmount | money }}</td>
              <td class="num">{{ s.summary.netAmount | money }}</td>
              <td class="num">{{ s.summary.adjustmentNet | money }}</td>
              <td class="num"><strong>{{ s.summary.totalNet | money }}</strong></td>
            </tr>
          </tfoot>
        </table>
        <div class="pager">
          <span>{{ s.total }} กลุ่ม · หน้า {{ page() }}/{{ pages() }}</span>
          <ui-button icon="pi pi-chevron-left" size="small" [text]="true" [disabled]="page() <= 1" (onClick)="go(page() - 1)" />
          <ui-button icon="pi pi-chevron-right" size="small" [text]="true" [disabled]="page() >= pages()" (onClick)="go(page() + 1)" />
        </div>
      </div>
    }

    <app-adjust-dialog (done)="load()" />
  `,
  styles: [`
    .mode { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
    .filters { display: flex; gap: 1rem; align-items: end; margin-bottom: 1rem; flex-wrap: wrap; font-size: 0.85rem; }
    .filters label { display: flex; flex-direction: column; gap: 0.2rem; }
    .card { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 8px; padding: 1.5rem; overflow-x: auto; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .data-table th { text-align: left; padding: 0.5rem 0.75rem; background: var(--surface-ground); border-bottom: 2px solid var(--surface-border); font-size: 0.8rem; color: var(--text-color-secondary); white-space: nowrap; }
    .data-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--surface-border); }
    .data-table tfoot td { border-top: 2px solid var(--surface-border); background: var(--surface-ground); }
    .num { text-align: right; }
    .actions { white-space: nowrap; text-align: right; }
    .link { color: var(--primary-color); text-decoration: none; }
    .empty { text-align: center; padding: 2rem; color: var(--text-color-secondary); }
    .err { color: var(--red-600, #dc2626); font-size: 0.85rem; }
    .pager { display: flex; gap: 0.5rem; align-items: center; justify-content: flex-end; margin-top: 1rem; font-size: 0.85rem; }
  `],
})
export class CommissionsListPage implements OnInit {
  private readonly api = inject(CommissionsApi);
  private readonly exportSvc = inject(ExportService);
  private readonly toast = inject(MessageService);
  private readonly perPage = 20;

  readonly dialog = viewChild.required(AdjustDialogComponent);
  readonly statusOptions = STATUS_OPTIONS;
  readonly groupOptions = GROUP_OPTIONS;

  readonly mode = signal<'list' | 'summary'>('list');
  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly rows = signal<CommissionRow[]>([]);
  readonly summary = signal<CommissionSummary | null>(null);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly error = signal<string | null>(null);
  status = '';
  groupBy: SummaryGroupBy = 'agent';
  from = '';
  to = '';

  typeLabel(t: string): string {
    return TYPE_LABELS[t] ?? t;
  }

  pages(): number {
    return Math.max(1, Math.ceil(this.total() / this.perPage));
  }

  ngOnInit(): void {
    this.load();
  }

  showSummary(): void {
    this.mode.set('summary');
    this.reload();
  }

  reload(): void {
    this.page.set(1);
    this.load();
  }

  go(p: number): void {
    this.page.set(p);
    this.load();
  }

  load(): void {
    this.state.set('loading');
    if (this.mode() === 'summary') {
      this.api
        .summary({ groupBy: this.groupBy, status: this.status, from: this.from, to: this.to, page: this.page(), perPage: this.perPage })
        .subscribe({
          next: (s) => { this.summary.set(s); this.total.set(s.total); this.state.set('none'); },
          error: () => this.state.set('error'),
        });
      return;
    }
    this.api.list({ status: this.status, page: this.page(), perPage: this.perPage }).subscribe({
      next: (r) => { this.rows.set(r.items); this.total.set(r.total); this.state.set('none'); },
      error: () => this.state.set('error'),
    });
  }

  approve(c: CommissionRow): void {
    this.error.set(null);
    this.api.approve(c.id).subscribe({
      next: () => { this.toast.add({ severity: 'success', summary: 'อนุมัติค่าคอมแล้ว' }); this.load(); },
      error: (e: HttpErrorResponse) => this.error.set((e.error as { message?: string } | null)?.message ?? 'อนุมัติไม่สำเร็จ'),
    });
  }

  export(): void {
    this.exportSvc.download('commissions', { status: this.status });
  }
}
