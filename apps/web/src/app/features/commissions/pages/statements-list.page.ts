import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { ExportService } from '../../../core/api/export.service';
import { FormsModule } from '@angular/forms';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { UiButton, UiDialog, UiInput, UiMessage, UiSelect } from '../../../shared/ui';
import { CommissionsApi, type Statement } from '../data/commissions.api';

const STATUS_OPTIONS = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'DRAFT', label: 'ร่าง' },
  { value: 'CONFIRMED', label: 'ยืนยันแล้ว' },
  { value: 'PAID', label: 'จ่ายแล้ว' },
  { value: 'CANCELLED', label: 'ยกเลิก' },
];

const currentMonth = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date()).slice(0, 7);

@Component({
  selector: 'app-statements-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, UiButton, UiDialog, UiInput, UiMessage, UiSelect, HasPermissionDirective, AppPageHeaderComponent, AppStateComponent, AppStatusBadgeComponent, MoneyPipe],
  template: `
    <app-page-header title="ใบสรุปค่าคอมมิชชัน" subtitle="สรุปยอดจ่ายรายเดือนต่อผู้รับ">
      <ui-button *appHasPermission="'report.view'" label="Export Excel" icon="pi pi-file-excel" severity="secondary" [outlined]="true" size="small" (onClick)="exportExcel()" />
      <ui-button *appHasPermission="'commission.statement'" label="สร้างใบสรุป" icon="pi pi-plus" size="small" (onClick)="openCreate()" />
    </app-page-header>

    <div class="filters">
      <ui-select inputId="st-status" [(ngModel)]="status" [options]="statusOptions" optionLabel="label" optionValue="value" (ngModelChange)="reload()" />
      <label>เดือน <input uiInput type="month" [(ngModel)]="period" (ngModelChange)="reload()" /></label>
    </div>

    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else if (items().length === 0) {
      <app-state state="empty" emptyMessage="ยังไม่มีใบสรุปค่าคอม" />
    } @else {
      <div class="card">
        <table class="data-table">
          <thead>
            <tr>
              <th>เลขที่</th><th>ผู้รับ</th><th>เดือน</th><th class="num">ค่าคอม</th><th class="num">ปรับปรุง</th>
              <th class="num">ส่วนแบ่ง</th><th class="num">WHT</th><th class="num">ยอดจ่ายสุทธิ</th><th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            @for (s of items(); track s.id) {
              <tr>
                <td><a class="link mono" [routerLink]="['/commission-statements', s.id]">{{ s.statementNo }}</a></td>
                <td>{{ s.agent?.fullName ?? '-' }}</td>
                <td>{{ s.period }}</td>
                <td class="num">{{ s.commissionCount }}</td>
                <td class="num">{{ s.adjustmentCount }}</td>
                <td class="num">{{ s.shareTotal | money }}</td>
                <td class="num">{{ s.whtTotal | money }}</td>
                <td class="num"><strong>{{ s.netTotal | money }}</strong></td>
                <td><app-status-badge [status]="s.status" /></td>
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

    <ui-dialog [(visible)]="createVisible" header="สร้างใบสรุปค่าคอม" icon="pi pi-wallet" [modal]="true" [style]="{ width: '420px' }">
      <div class="form">
        <div class="field">
          <label for="st-agent">ผู้รับ <span class="req">*</span></label>
          <ui-select class="w-full" inputId="st-agent" [(ngModel)]="newAgentId" [options]="payees()" optionLabel="fullName" optionValue="id" placeholder="เลือกผู้รับ" />
        </div>
        <div class="field">
          <label for="st-period">เดือน <span class="req">*</span></label>
          <input uiInput id="st-period" type="month" [(ngModel)]="newPeriod" class="w-full" />
          <small class="hint">รวมทุกรายการที่พร้อมจ่ายภายในสิ้นเดือนนี้ พร้อมรายการปรับปรุงที่ค้างอยู่</small>
        </div>
        @if (formError()) { <ui-message severity="error">{{ formError() }}</ui-message> }
      </div>
      <ng-template #footer>
        <ui-button label="ปิด" severity="secondary" [text]="true" (onClick)="createVisible.set(false)" [disabled]="saving()" />
        <ui-button label="สร้าง" icon="pi pi-check" (onClick)="create()" [loading]="saving()" [disabled]="saving() || !newAgentId" />
      </ng-template>
    </ui-dialog>
  `,
  styles: [`
    .filters { display: flex; gap: 1rem; align-items: end; margin-bottom: 1rem; flex-wrap: wrap; font-size: 0.85rem; }
    .filters label { display: flex; flex-direction: column; gap: 0.2rem; }
    .card { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 8px; padding: 1.5rem; overflow-x: auto; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .data-table th { text-align: left; padding: 0.5rem 0.75rem; background: var(--surface-ground); border-bottom: 2px solid var(--surface-border); font-size: 0.8rem; color: var(--text-color-secondary); white-space: nowrap; }
    .data-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--surface-border); }
    .num { text-align: right; }
    .mono { font-family: monospace; }
    .link { color: var(--primary-color); text-decoration: none; }
    .pager { display: flex; gap: 0.5rem; align-items: center; justify-content: flex-end; margin-top: 1rem; font-size: 0.85rem; }
    .form { display: flex; flex-direction: column; gap: 0.75rem; }
    .field { display: flex; flex-direction: column; gap: 0.3rem; }
    .hint { color: var(--text-color-secondary); }
    label { font-size: 0.875rem; font-weight: 500; }
    .req { color: var(--red-500, #ef4444); }
  `],
})
export class StatementsListPage implements OnInit {
  private readonly api = inject(CommissionsApi);
  private readonly router = inject(Router);
  private readonly exportSvc = inject(ExportService);

  exportExcel(): void {
    this.exportSvc.download('commission-statements');
  }

  private readonly perPage = 20;

  readonly statusOptions = STATUS_OPTIONS;
  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly items = signal<Statement[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  status = '';
  period = '';

  readonly createVisible = signal(false);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  /** Payees with something payable — taken from the summary so finance needs no user-admin permission. */
  readonly payees = signal<{ id: string; fullName: string }[]>([]);
  newAgentId = '';
  newPeriod = currentMonth();

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

  private load(): void {
    this.state.set('loading');
    this.api.listStatements({ status: this.status, period: this.period, page: this.page(), perPage: this.perPage }).subscribe({
      next: (r) => { this.items.set(r.items); this.total.set(r.total); this.state.set('none'); },
      error: () => this.state.set('error'),
    });
  }

  openCreate(): void {
    this.newAgentId = '';
    this.newPeriod = currentMonth();
    this.formError.set(null);
    this.createVisible.set(true);
    this.api.summary({ groupBy: 'agent', status: 'PAYABLE', perPage: 100 }).subscribe((r) =>
      this.payees.set(r.items.map((g) => ({ id: g.key, fullName: g.label }))),
    );
  }

  create(): void {
    this.saving.set(true);
    this.formError.set(null);
    this.api.createStatement({ agentId: this.newAgentId, period: this.newPeriod }).subscribe({
      next: (s) => {
        this.saving.set(false);
        this.createVisible.set(false);
        void this.router.navigate(['/commission-statements', s.id]);
      },
      error: (e: HttpErrorResponse) => {
        this.saving.set(false);
        this.formError.set((e.error as { message?: string } | null)?.message ?? 'ไม่สามารถสร้างได้');
      },
    });
  }
}
