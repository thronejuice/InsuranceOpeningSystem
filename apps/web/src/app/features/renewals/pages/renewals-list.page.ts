import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { ExportService } from '../../../core/api/export.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { JobsApi, type RenewalRecord } from '../../jobs/data/jobs.api';
import { MessageService, UiButton, UiDatepicker, UiDialog, UiMessage } from '../../../shared/ui';

/** yyyy-mm-dd ↔ local-midnight Date (avoids the UTC shift of `new Date('yyyy-mm-dd')`) */
function parseDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

@Component({
  selector: 'app-renewals-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, RouterLink, AppPageHeaderComponent, AppStateComponent, AppStatusBadgeComponent,
    ThDatePipe, MoneyPipe, UiButton, UiDatepicker, UiDialog, UiMessage,
  ],
  template: `
    <app-page-header title="ต่ออายุประกัน" subtitle="รายการต่ออายุกรมธรรม์ทั้งหมด">
      <ui-button label="Export Excel" icon="pi pi-file-excel" severity="secondary" [outlined]="true" size="small" (onClick)="export()" />
    </app-page-header>

    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else if (renewals().length === 0) {
      <app-state state="empty" emptyMessage="ยังไม่มีรายการต่ออายุ" />
    } @else {
      <div class="card">
        <table class="data-table">
          <thead>
            <tr>
              <th>กรมธรรม์เดิม</th>
              <th>ลูกค้า</th>
              <th>ผลิตภัณฑ์ / บริษัทประกัน</th>
              <th class="num">เบี้ยรวม</th>
              <th>วันหมดอายุ</th>
              <th>งานใหม่</th>
              <th>สถานะ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (r of renewals(); track r.id) {
              <tr>
                <td>
                  <a [routerLink]="['/jobs', r.previousJobId]" class="job-link">{{ r.previousPolicyNo }}</a>
                  <div class="sub">{{ r.previousJobNo }}</div>
                </td>
                <td>{{ r.customerName }}</td>
                <td>{{ r.productName }}<div class="sub">{{ r.insuranceCompanyName }}</div></td>
                <td class="num">{{ r.totalPremium | money }}</td>
                <td>{{ (r.policyExpiryDate ?? r.targetExpiryDate) | thDate }}</td>
                <td>
                  @if (r.newJobId) {
                    <a [routerLink]="['/jobs', r.newJobId]" class="job-link">{{ r.newJobNo }}</a>
                  } @else {
                    -
                  }
                </td>
                <td><app-status-badge [status]="r.status" /></td>
                <td class="actions">
                  @if (r.canRenew && canCreate) {
                    <ui-button label="ต่ออายุ" icon="pi pi-refresh" size="small" (onClick)="openRenew(r)" />
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    <ui-dialog
      [(visible)]="showDialog"
      header="ต่ออายุกรมธรรม์"
      icon="pi pi-refresh"
      [modal]="true"
      [style]="{ width: '480px' }"
    >
      @if (target(); as t) {
        <div class="renew-form">
          <div class="summary">
            <div><span class="label">กรมธรรม์เดิม</span> {{ t.previousPolicyNo }}</div>
            <div><span class="label">ลูกค้า</span> {{ t.customerName }}</div>
            <div><span class="label">ผลิตภัณฑ์</span> {{ t.productName }}</div>
            <div><span class="label">บริษัทประกัน / เบี้ยเดิม</span> {{ t.insuranceCompanyName }} · {{ t.totalPremium | money }} บาท</div>
          </div>
          <p class="hint">ระบบจะสร้างงานใหม่ (สถานะร่าง) โดยดึงลูกค้า ความเสี่ยง ความคุ้มครอง ผู้รับผิดชอบ และเอกสารลูกค้าจากงานเดิม</p>

          <label for="renew-effective">วันที่เริ่มคุ้มครอง</label>
          <ui-datepicker class="w-full" inputId="renew-effective" dateFormat="dd/mm/yy" [(ngModel)]="effectiveDate" />
          <label for="renew-expiry">วันที่สิ้นสุดคุ้มครอง</label>
          <ui-datepicker class="w-full" inputId="renew-expiry" dateFormat="dd/mm/yy" [(ngModel)]="expiryDate" />

          @if (dialogError()) {
            <ui-message severity="error">{{ dialogError() }}</ui-message>
          }
        </div>
      }
      <ng-template #footer>
        <ui-button label="ยกเลิก" icon="pi pi-times" severity="danger" (onClick)="closeDialog()" [disabled]="renewing()" />
        <ui-button label="ยืนยันต่ออายุ" icon="pi pi-check" (onClick)="confirmRenew()" [loading]="renewing()" [disabled]="renewing()" />
      </ng-template>
    </ui-dialog>
  `,
  styles: [`
    .card { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 8px; padding: 1.5rem; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .data-table th { text-align: left; padding: 0.5rem 0.75rem; background: var(--surface-ground); border-bottom: 2px solid var(--surface-border); font-size: 0.8rem; color: var(--text-color-secondary); white-space: nowrap; }
    .data-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--surface-border); vertical-align: middle; }
    .num { text-align: right; white-space: nowrap; }
    .actions { text-align: right; white-space: nowrap; }
    .sub { font-size: 0.75rem; color: var(--text-color-secondary); }
    .job-link { color: var(--primary-color); text-decoration: none; }
    .job-link:hover { text-decoration: underline; }
    .renew-form { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.25rem 0; }
    .summary { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.75rem; background: var(--surface-ground); border-radius: 6px; font-size: 0.875rem; }
    .label { display: inline-block; min-width: 9rem; color: var(--text-color-secondary); }
    .hint { margin: 0.25rem 0; font-size: 0.8rem; color: var(--text-color-secondary); }
  `],
})
export class RenewalsListPage implements OnInit {
  private readonly api = inject(JobsApi);
  private readonly exportSvc = inject(ExportService);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly auth = inject(AuthStore);

  readonly canCreate = this.auth.hasPermission('renewal.create');

  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly renewals = signal<RenewalRecord[]>([]);

  readonly showDialog = signal(false);
  readonly target = signal<RenewalRecord | null>(null);
  readonly renewing = signal(false);
  readonly dialogError = signal<string | null>(null);
  effectiveDate: Date | null = null;
  expiryDate: Date | null = null;

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.listRenewals().subscribe({
      next: (res) => { this.renewals.set(res.items); this.state.set('none'); },
      error: () => this.state.set('error'),
    });
  }

  openRenew(r: RenewalRecord): void {
    this.target.set(r);
    this.effectiveDate = parseDate(r.suggestedEffectiveDate);
    this.expiryDate = parseDate(r.suggestedExpiryDate);
    this.dialogError.set(null);
    this.showDialog.set(true);
  }

  closeDialog(): void {
    this.showDialog.set(false);
  }

  confirmRenew(): void {
    const r = this.target();
    if (!r || !this.effectiveDate || !this.expiryDate) {
      this.dialogError.set('กรุณาระบุวันที่เริ่มและสิ้นสุดคุ้มครอง');
      return;
    }
    if (this.expiryDate <= this.effectiveDate) {
      this.dialogError.set('วันที่สิ้นสุดต้องอยู่หลังวันที่เริ่มคุ้มครอง');
      return;
    }

    this.renewing.set(true);
    this.dialogError.set(null);
    this.api.renewPolicy(r.previousPolicyId, {
      effectiveDate: formatDate(this.effectiveDate),
      expiryDate: formatDate(this.expiryDate),
    }).subscribe({
      next: (res) => {
        this.renewing.set(false);
        this.showDialog.set(false);
        this.toast.add({ severity: 'success', summary: 'สร้างงานต่ออายุแล้ว', detail: res.newJobNo ?? undefined });
        if (res.newJobId) void this.router.navigate(['/jobs', res.newJobId]);
        else this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.renewing.set(false);
        const body = e.error as { message?: string } | null;
        this.dialogError.set(body?.message ?? 'เกิดข้อผิดพลาด');
      },
    });
  }

  export(): void {
    this.exportSvc.download('renewals');
  }
}
