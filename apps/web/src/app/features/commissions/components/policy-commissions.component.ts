import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { MessageService, UiButton } from '../../../shared/ui';
import { CommissionsApi, type CommissionRow } from '../data/commissions.api';
import { AdjustDialogComponent } from './adjust-dialog.component';

export const TYPE_LABELS: Record<string, string> = {
  COMPANY: 'บริษัท', AGENT: 'ตัวแทน', TEAM: 'หัวหน้าทีม (override)', REFERRAL: 'ผู้แนะนำ', OTHER: 'อื่นๆ',
};

/** Commissions of one policy: breakdown per payee, approve, adjust. Amounts are calculated by the server. */
@Component({
  selector: 'app-policy-commissions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppStateComponent, AppStatusBadgeComponent, HasPermissionDirective, MoneyPipe, UiButton, AdjustDialogComponent],
  template: `
    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else {
      <div class="bar">
        <ui-button *appHasPermission="'commission.create'" label="คำนวณค่าคอมใหม่" icon="pi pi-calculator" size="small" severity="secondary" [outlined]="true" [loading]="busy()" (onClick)="recalc()" />
      </div>
      @if (rows().length === 0) {
        <app-state state="empty" emptyMessage="ยังไม่มีค่าคอมมิชชัน (คำนวณอัตโนมัติเมื่อออกกรมธรรม์)" />
      } @else {
        <table class="data-table">
          <thead>
            <tr>
              <th>ผู้รับ</th><th>ประเภท</th>
              <th class="num">ค่าคอมรวม</th><th class="num">ส่วนแบ่ง (%)</th><th class="num">ส่วนแบ่ง</th>
              <th class="num">WHT</th><th class="num">สุทธิ</th><th>สถานะ</th><th></th>
            </tr>
          </thead>
          <tbody>
            @for (c of rows(); track c.id) {
              <tr>
                <td>{{ c.agent?.fullName ?? '-' }}</td>
                <td>{{ typeLabel(c.commissionType) }}</td>
                <td class="num">{{ (c.grossAmount ?? c.commissionAmount) | money }}</td>
                <td class="num">{{ c.sharePct ?? '-' }}</td>
                <td class="num">{{ c.commissionAmount | money }}</td>
                <td class="num">{{ c.whtAmount ? (c.whtAmount | money) : '-' }}</td>
                <td class="num"><strong>{{ c.netAmount ? (c.netAmount | money) : '-' }}</strong></td>
                <td><app-status-badge [status]="c.status" /></td>
                <td class="actions">
                  @if (c.status === 'CALCULATED') {
                    <ui-button *appHasPermission="'commission.approve'" label="อนุมัติ" icon="pi pi-check" size="small" [loading]="busy()" (onClick)="approve(c)" />
                  }
                  @if (adjustable(c)) {
                    <ui-button *appHasPermission="'commission.adjust'" label="ปรับปรุง" icon="pi pi-sliders-h" size="small" [text]="true" (onClick)="dialog().open(c)" />
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    }
    @if (error()) { <p class="err">{{ error() }}</p> }
    <app-adjust-dialog (done)="load()" />
  `,
  styles: [`
    .bar { display: flex; justify-content: flex-end; margin-bottom: 0.75rem; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .data-table th { text-align: left; padding: 0.5rem 0.75rem; background: var(--surface-ground); border-bottom: 1px solid var(--surface-border); font-size: 0.8rem; color: var(--text-color-secondary); white-space: nowrap; }
    .data-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--surface-border); vertical-align: middle; }
    .num { text-align: right; }
    .actions { white-space: nowrap; text-align: right; }
    .err { color: var(--red-600, #dc2626); font-size: 0.85rem; }
  `],
})
export class PolicyCommissionsComponent implements OnInit {
  private readonly api = inject(CommissionsApi);
  private readonly toast = inject(MessageService);

  readonly policyId = input.required<string>();
  readonly dialog = viewChild.required(AdjustDialogComponent);

  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly rows = signal<CommissionRow[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  typeLabel(t: string): string {
    return TYPE_LABELS[t] ?? t;
  }

  /** Only V2 rows (they carry a WHT breakdown) that have been approved can be corrected. */
  adjustable(c: CommissionRow): boolean {
    return c.netAmount != null && ['APPROVED', 'PAYABLE', 'PAID'].includes(c.status);
  }

  load(): void {
    this.api.byPolicy(this.policyId()).subscribe({
      next: (r) => { this.rows.set(r.items); this.state.set('none'); },
      error: () => this.state.set('error'),
    });
  }

  approve(c: CommissionRow): void {
    this.run(this.api.approve(c.id), 'อนุมัติค่าคอมแล้ว');
  }

  recalc(): void {
    this.run(this.api.calculate(this.policyId()), 'คำนวณค่าคอมแล้ว');
  }

  private run(call: Observable<unknown>, okMessage: string): void {
    this.busy.set(true);
    this.error.set(null);
    call.subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: okMessage }); this.load(); },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set((e.error as { message?: string } | null)?.message ?? 'ดำเนินการไม่สำเร็จ');
      },
    });
  }
}
