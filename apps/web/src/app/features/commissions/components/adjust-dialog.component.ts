import { ChangeDetectionStrategy, Component, inject, model, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MessageService, UiButton, UiDialog, UiInput, UiMessage } from '../../../shared/ui';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { CommissionsApi, type CommissionRow } from '../data/commissions.api';

/** Records a signed adjustment (+/−) against an approved commission. The original row is never edited. */
@Component({
  selector: 'app-adjust-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, UiButton, UiDialog, UiInput, UiMessage, MoneyPipe],
  template: `
    <ui-dialog [(visible)]="visible" header="ปรับปรุงค่าคอมมิชชัน" icon="pi pi-sliders-h" [modal]="true" [style]="{ width: '440px' }">
      @if (target(); as c) {
        <div class="form">
          <p class="hint">
            {{ c.policy?.policyNo }} · {{ c.agent?.fullName }} · ส่วนแบ่งเดิม <strong>{{ c.commissionAmount | money }}</strong>
            · WHT {{ c.whtRate ?? '0' }}%
          </p>
          <div class="field">
            <label for="adj-amount">จำนวนเงิน (ก่อนหัก WHT) <span class="req">*</span></label>
            <input uiInput id="adj-amount" [(ngModel)]="amount" class="w-full" placeholder="เช่น -500.00 (หักคืน) หรือ 250.00 (เพิ่ม)" inputmode="decimal" />
          </div>
          <div class="field">
            <label for="adj-reason">เหตุผล <span class="req">*</span></label>
            <textarea uiInput id="adj-reason" [(ngModel)]="reason" rows="3" class="w-full"></textarea>
          </div>
          @if (error()) { <ui-message severity="error">{{ error() }}</ui-message> }
        </div>
      }
      <ng-template #footer>
        <ui-button label="ปิด" severity="secondary" [text]="true" (onClick)="visible.set(false)" [disabled]="saving()" />
        <ui-button label="บันทึก" icon="pi pi-check" (onClick)="submit()" [loading]="saving()" [disabled]="saving()" />
      </ng-template>
    </ui-dialog>
  `,
  styles: [`
    .form { display: flex; flex-direction: column; gap: 0.75rem; }
    .field { display: flex; flex-direction: column; gap: 0.3rem; }
    .hint { font-size: 0.85rem; color: var(--text-color-secondary); margin: 0; }
    label { font-size: 0.875rem; font-weight: 500; }
    .req { color: var(--red-500, #ef4444); }
  `],
})
export class AdjustDialogComponent {
  private readonly api = inject(CommissionsApi);
  private readonly toast = inject(MessageService);

  readonly visible = model(false);
  readonly done = output<void>();
  readonly target = signal<CommissionRow | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  amount = '';
  reason = '';

  open(row: CommissionRow): void {
    this.target.set(row);
    this.amount = '';
    this.reason = '';
    this.error.set(null);
    this.visible.set(true);
  }

  submit(): void {
    const row = this.target();
    if (!row) return;
    this.saving.set(true);
    this.error.set(null);
    this.api.adjust(row.id, { amount: this.amount.trim(), reason: this.reason.trim() }).subscribe({
      next: () => {
        this.saving.set(false);
        this.visible.set(false);
        this.toast.add({ severity: 'success', summary: 'บันทึกการปรับปรุงแล้ว', detail: 'จะรวมในใบสรุปค่าคอมถัดไป' });
        this.done.emit();
      },
      error: (e: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set((e.error as { message?: string } | null)?.message ?? 'ไม่สามารถบันทึกได้');
      },
    });
  }
}
