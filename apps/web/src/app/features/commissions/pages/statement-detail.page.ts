import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import type { Observable } from 'rxjs';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import { MessageService, UiButton, UiDialog, UiInput, UiMessage } from '../../../shared/ui';
import { TYPE_LABELS } from '../components/policy-commissions.component';
import { CommissionsApi, type StatementDetail } from '../data/commissions.api';

@Component({
  selector: 'app-statement-detail-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, UiButton, UiDialog, UiInput, UiMessage, HasPermissionDirective, AppPageHeaderComponent, AppStateComponent, AppStatusBadgeComponent, MoneyPipe, ThDatePipe],
  template: `
    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else if (st(); as s) {
      <app-page-header [title]="s.statementNo" [subtitle]="(s.agent?.fullName ?? '') + ' · เดือน ' + s.period">
        <app-status-badge [status]="s.status" />
        <ui-button label="Export Excel" icon="pi pi-file-excel" size="small" severity="secondary" [outlined]="true" (onClick)="export()" />
        @if (s.status === 'DRAFT') {
          <ui-button *appHasPermission="'commission.statement'" label="ยืนยัน" icon="pi pi-check" size="small" [loading]="busy()" (onClick)="run(api.confirmStatement(s.id), 'ยืนยันใบสรุปแล้ว')" />
        }
        @if (s.status === 'CONFIRMED') {
          <ui-button *appHasPermission="'commission.statement'" label="บันทึกว่าจ่ายแล้ว" icon="pi pi-wallet" size="small" (onClick)="openPaid()" />
        }
        @if (s.status === 'DRAFT' || s.status === 'CONFIRMED') {
          <ui-button *appHasPermission="'commission.statement'" label="ยกเลิก" icon="pi pi-times" size="small" severity="danger" [outlined]="true" (onClick)="openCancel()" />
        }
      </app-page-header>

      @if (error()) { <ui-message severity="error">{{ error() }}</ui-message> }

      <div class="cards">
        <div class="kpi"><span>ส่วนแบ่งรวม</span><strong>{{ s.shareTotal | money }}</strong></div>
        <div class="kpi"><span>หัก ณ ที่จ่าย</span><strong>{{ s.whtTotal | money }}</strong></div>
        <div class="kpi"><span>ยอดจ่ายสุทธิ</span><strong class="net">{{ s.netTotal | money }}</strong></div>
        @if (s.paidDate) { <div class="kpi"><span>จ่ายเมื่อ</span><strong>{{ s.paidDate | thDate }}</strong>@if (s.paymentRef) { <small>{{ s.paymentRef }}</small> }</div> }
        @if (s.cancelReason) { <div class="kpi"><span>เหตุผลที่ยกเลิก</span><strong>{{ s.cancelReason }}</strong></div> }
      </div>

      <h4 class="title">ค่าคอมมิชชัน ({{ s.commissions.length }})</h4>
      <div class="card">
        <table class="data-table">
          <thead><tr><th>กรมธรรม์</th><th>ประเภท</th><th class="num">ส่วนแบ่ง</th><th class="num">WHT</th><th class="num">สุทธิ</th><th>สถานะ</th></tr></thead>
          <tbody>
            @for (c of s.commissions; track c.id) {
              <tr>
                <td>@if (c.policy) { <a class="link" [routerLink]="['/policies', c.policy.id]">{{ c.policy.policyNo }}</a> }</td>
                <td>{{ typeLabel(c.commissionType) }}</td>
                <td class="num">{{ c.commissionAmount | money }}</td>
                <td class="num">{{ c.whtAmount ? (c.whtAmount | money) : '-' }}</td>
                <td class="num">{{ c.netAmount ? (c.netAmount | money) : '-' }}</td>
                <td><app-status-badge [status]="c.status" /></td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="empty">ไม่มีรายการ</td></tr>
            }
          </tbody>
        </table>
      </div>

      <h4 class="title">รายการปรับปรุง ({{ s.adjustments.length }})</h4>
      <div class="card">
        <table class="data-table">
          <thead><tr><th>เหตุผล</th><th>อ้างอิง</th><th class="num">จำนวน</th><th class="num">WHT</th><th class="num">สุทธิ</th><th>สถานะ</th></tr></thead>
          <tbody>
            @for (a of s.adjustments; track a.id) {
              <tr>
                <td>{{ a.reason }}</td>
                <td>{{ a.refType ?? '-' }}</td>
                <td class="num">{{ a.amount | money }}</td>
                <td class="num">{{ a.whtAmount | money }}</td>
                <td class="num">{{ a.netAmount | money }}</td>
                <td><app-status-badge [status]="a.status" /></td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="empty">ไม่มีรายการปรับปรุง</td></tr>
            }
          </tbody>
        </table>
      </div>

      <div class="back"><a class="link" routerLink="/commission-statements">← กลับไปรายการใบสรุป</a></div>
    }

    <ui-dialog [(visible)]="paidVisible" header="บันทึกว่าจ่ายแล้ว" icon="pi pi-wallet" [modal]="true" [style]="{ width: '420px' }">
      <div class="form">
        <div class="field"><label for="paid-date">วันที่จ่าย</label><input uiInput id="paid-date" type="date" [(ngModel)]="paidDate" class="w-full" /></div>
        <div class="field"><label for="paid-ref">เลขอ้างอิงการโอน</label><input uiInput id="paid-ref" [(ngModel)]="paymentRef" class="w-full" /></div>
        @if (formError()) { <ui-message severity="error">{{ formError() }}</ui-message> }
      </div>
      <ng-template #footer>
        <ui-button label="ปิด" severity="secondary" [text]="true" (onClick)="paidVisible.set(false)" [disabled]="busy()" />
        <ui-button label="ยืนยัน" icon="pi pi-check" (onClick)="markPaid()" [loading]="busy()" [disabled]="busy()" />
      </ng-template>
    </ui-dialog>

    <ui-dialog [(visible)]="cancelVisible" header="ยกเลิกใบสรุป" icon="pi pi-exclamation-triangle" [modal]="true" [style]="{ width: '420px' }">
      <div class="form">
        <label for="st-cancel">เหตุผล <span class="req">*</span></label>
        <textarea uiInput id="st-cancel" [(ngModel)]="cancelReason" rows="3" class="w-full"></textarea>
        <small class="hint">รายการทั้งหมดจะถูกปล่อยกลับไปรอใบสรุปใหม่</small>
        @if (formError()) { <ui-message severity="error">{{ formError() }}</ui-message> }
      </div>
      <ng-template #footer>
        <ui-button label="ปิด" severity="secondary" [text]="true" (onClick)="cancelVisible.set(false)" [disabled]="busy()" />
        <ui-button label="ยืนยันยกเลิก" severity="danger" (onClick)="cancel()" [loading]="busy()" [disabled]="busy()" />
      </ng-template>
    </ui-dialog>
  `,
  styles: [`
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 0.75rem; margin: 1rem 0; }
    .kpi { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 8px; padding: 0.75rem 1rem; display: flex; flex-direction: column; gap: 0.25rem; }
    .kpi span { font-size: 0.75rem; color: var(--text-color-secondary); }
    .kpi strong { font-size: 1.05rem; }
    .net { color: var(--primary-color); font-size: 1.2rem; }
    .title { font-size: 0.9rem; font-weight: 600; color: var(--primary-color); margin: 1.25rem 0 0.5rem; }
    .card { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 8px; padding: 1rem; overflow-x: auto; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .data-table th { text-align: left; padding: 0.5rem 0.75rem; background: var(--surface-ground); border-bottom: 1px solid var(--surface-border); font-size: 0.8rem; color: var(--text-color-secondary); }
    .data-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--surface-border); }
    .num { text-align: right; }
    .empty { text-align: center; color: var(--text-color-secondary); padding: 1rem; }
    .link { color: var(--primary-color); text-decoration: none; }
    .back { margin-top: 1.25rem; }
    .form { display: flex; flex-direction: column; gap: 0.75rem; }
    .field { display: flex; flex-direction: column; gap: 0.3rem; }
    .hint { color: var(--text-color-secondary); }
    label { font-size: 0.875rem; font-weight: 500; }
    .req { color: var(--red-500, #ef4444); }
  `],
})
export class StatementDetailPage implements OnInit {
  readonly api = inject(CommissionsApi);
  private readonly toast = inject(MessageService);

  readonly id = input.required<string>();
  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly st = signal<StatementDetail | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly formError = signal<string | null>(null);

  readonly paidVisible = signal(false);
  readonly cancelVisible = signal(false);
  paidDate = '';
  paymentRef = '';
  cancelReason = '';

  typeLabel(t: string): string {
    return TYPE_LABELS[t] ?? t;
  }

  ngOnInit(): void {
    this.api.getStatement(this.id()).subscribe({
      next: (s) => { this.st.set(s); this.state.set('none'); },
      error: () => this.state.set('error'),
    });
  }

  export(): void {
    const s = this.st();
    if (s) this.api.exportStatement(s.id, s.statementNo);
  }

  openPaid(): void {
    this.paidDate = '';
    this.paymentRef = '';
    this.formError.set(null);
    this.paidVisible.set(true);
  }

  openCancel(): void {
    this.cancelReason = '';
    this.formError.set(null);
    this.cancelVisible.set(true);
  }

  markPaid(): void {
    const s = this.st();
    if (!s) return;
    this.run(
      this.api.markStatementPaid(s.id, {
        ...(this.paidDate ? { paidDate: this.paidDate } : {}),
        ...(this.paymentRef.trim() ? { paymentRef: this.paymentRef.trim() } : {}),
      }),
      'บันทึกการจ่ายแล้ว',
      this.paidVisible,
    );
  }

  cancel(): void {
    const s = this.st();
    if (!s) return;
    if (!this.cancelReason.trim()) {
      this.formError.set('กรุณาระบุเหตุผล');
      return;
    }
    this.run(this.api.cancelStatement(s.id, this.cancelReason.trim()), 'ยกเลิกใบสรุปแล้ว', this.cancelVisible);
  }

  run(call: Observable<StatementDetail>, okMessage: string, dialog?: { set(v: boolean): void }): void {
    this.busy.set(true);
    this.error.set(null);
    this.formError.set(null);
    call.subscribe({
      next: (s) => {
        this.busy.set(false);
        this.st.set(s);
        dialog?.set(false);
        this.toast.add({ severity: 'success', summary: okMessage });
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        const msg = (e.error as { message?: string } | null)?.message ?? 'ดำเนินการไม่สำเร็จ';
        if (dialog) this.formError.set(msg);
        else this.error.set(msg);
      },
    });
  }
}
