import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import { MessageService, UiButton, UiDialog, UiInput, UiMessage, UiSelect } from '../../../shared/ui';
import { BillingApi, type BillingPayment, type BillingPaymentMethod, type Invoice } from '../data/billing.api';

const METHODS: { value: BillingPaymentMethod; label: string }[] = [
  { value: 'TRANSFER', label: 'โอนเงิน' },
  { value: 'CASH', label: 'เงินสด' },
  { value: 'CHEQUE', label: 'เช็ค' },
  { value: 'CREDIT_CARD', label: 'บัตรเครดิต' },
  { value: 'ONLINE', label: 'ออนไลน์' },
  { value: 'OTHER', label: 'อื่นๆ' },
];

/** Invoices of one policy: instalments, status, outstanding, record/cancel payment, PDF download. */
@Component({
  selector: 'app-policy-invoices',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, UiButton, UiDialog, UiInput, UiMessage, UiSelect, AppStateComponent, AppStatusBadgeComponent, HasPermissionDirective, MoneyPipe, ThDatePipe],
  template: `
    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else if (invoices().length === 0) {
      <app-state state="empty" emptyMessage="ยังไม่มีใบแจ้งหนี้ (ออกหลังออกกรมธรรม์)" />
    } @else {
      <div class="summary">
        <span>ยอดรวมใบแจ้งหนี้ <strong>{{ totals().amount | money }}</strong></span>
        <span>ชำระแล้ว <strong>{{ totals().paid | money }}</strong></span>
        <span>ค้างชำระ <strong class="owed">{{ totals().outstanding | money }}</strong></span>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>เลขที่</th><th>ประเภท</th><th>งวด</th><th>ครบกำหนด</th>
            <th class="num">ยอด</th><th class="num">ชำระแล้ว</th><th class="num">ค้างชำระ</th>
            <th>สถานะ</th><th></th>
          </tr>
        </thead>
        <tbody>
          @for (inv of invoices(); track inv.id) {
            <tr>
              <td class="mono">{{ inv.invoiceNo }}</td>
              <td>{{ typeLabel(inv.type) }}</td>
              <td>{{ inv.installmentNo ?? '-' }}</td>
              <td>{{ inv.dueDate | thDate }}</td>
              <td class="num">{{ inv.amount | money }}</td>
              <td class="num">{{ inv.paidAmount | money }}</td>
              <td class="num"><strong>{{ inv.outstandingAmount | money }}</strong></td>
              <td><app-status-badge [status]="inv.status" /></td>
              <td class="actions">
                <ui-button icon="pi pi-file-pdf" size="small" [text]="true" severity="secondary" label="PDF" (onClick)="pdf('invoices', inv.id)" />
                <ui-button [label]="expanded() === inv.id ? 'ซ่อน' : 'การชำระ'" size="small" [text]="true" (onClick)="toggle(inv)" />
                @if (canPay(inv)) {
                  <ui-button *appHasPermission="'payment.create'" label="บันทึกการชำระ" icon="pi pi-plus" size="small" (onClick)="openPay(inv)" />
                }
              </td>
            </tr>
            @if (expanded() === inv.id) {
              <tr class="sub">
                <td colspan="9">
                  @if (payments().length === 0) {
                    <span class="muted">ยังไม่มีการชำระเงิน</span>
                  } @else {
                    <table class="data-table inner">
                      <thead><tr><th>เลขที่</th><th>วันที่</th><th class="num">จำนวน</th><th>วิธี</th><th>อ้างอิง</th><th>ใบเสร็จ</th><th>สถานะ</th><th></th></tr></thead>
                      <tbody>
                        @for (p of payments(); track p.id) {
                          <tr>
                            <td class="mono">{{ p.paymentNo }}</td>
                            <td>{{ p.paymentDate | thDate }}</td>
                            <td class="num">{{ p.amount | money }}</td>
                            <td>{{ methodLabel(p.paymentMethod) }}</td>
                            <td>{{ p.referenceNo ?? '-' }}</td>
                            <td>
                              @if (p.receipt) {
                                <button type="button" class="linkbtn" (click)="pdf('receipts', p.receipt.id)">{{ p.receipt.receiptNo }}</button>
                                @if (p.receipt.status === 'VOID') { <span class="muted"> (void)</span> }
                              } @else { - }
                            </td>
                            <td><app-status-badge [status]="p.status" /></td>
                            <td>
                              @if (p.status === 'ACTIVE') {
                                <ui-button *appHasPermission="'payment.create'" label="ยกเลิก" severity="danger" size="small" [text]="true" (onClick)="openCancel(p)" />
                              }
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  }
                </td>
              </tr>
            }
          }
        </tbody>
      </table>
    }

    <ui-dialog [(visible)]="payVisible" header="บันทึกการชำระเงิน" icon="pi pi-wallet" [modal]="true" [style]="{ width: '440px' }">
      <div class="form">
        <div class="field">
          <label for="pay-amount">จำนวนเงิน <span class="req">*</span></label>
          <input uiInput id="pay-amount" [(ngModel)]="payAmount" class="w-full" inputmode="decimal" />
        </div>
        <div class="field">
          <label for="pay-method">วิธีชำระ</label>
          <ui-select class="w-full" inputId="pay-method" [(ngModel)]="payMethod" [options]="methods" optionLabel="label" optionValue="value" />
        </div>
        <div class="field">
          <label for="pay-date">วันที่ชำระ</label>
          <input uiInput id="pay-date" type="date" [(ngModel)]="payDate" class="w-full" />
        </div>
        <div class="field">
          <label for="pay-bank">ธนาคาร</label>
          <input uiInput id="pay-bank" [(ngModel)]="payBank" class="w-full" />
        </div>
        <div class="field">
          <label for="pay-ref">เลขอ้างอิง</label>
          <input uiInput id="pay-ref" [(ngModel)]="payRef" class="w-full" />
        </div>
        @if (formError()) { <ui-message severity="error">{{ formError() }}</ui-message> }
      </div>
      <ng-template #footer>
        <ui-button label="ปิด" severity="secondary" [text]="true" (onClick)="payVisible.set(false)" [disabled]="saving()" />
        <ui-button label="บันทึก" icon="pi pi-check" (onClick)="submitPay()" [loading]="saving()" [disabled]="saving()" />
      </ng-template>
    </ui-dialog>

    <ui-dialog [(visible)]="cancelVisible" header="ยกเลิกการชำระเงิน" icon="pi pi-exclamation-triangle" [modal]="true" [style]="{ width: '420px' }">
      <div class="form">
        <label for="cancel-reason">เหตุผล <span class="req">*</span></label>
        <textarea uiInput id="cancel-reason" [(ngModel)]="cancelReason" rows="3" class="w-full"></textarea>
        @if (formError()) { <ui-message severity="error">{{ formError() }}</ui-message> }
      </div>
      <ng-template #footer>
        <ui-button label="ปิด" severity="secondary" [text]="true" (onClick)="cancelVisible.set(false)" [disabled]="saving()" />
        <ui-button label="ยืนยันยกเลิก" severity="danger" (onClick)="submitCancel()" [loading]="saving()" [disabled]="saving()" />
      </ng-template>
    </ui-dialog>
  `,
  styles: [`
    .summary { display: flex; gap: 2rem; margin-bottom: 1rem; font-size: 0.9rem; flex-wrap: wrap; }
    .owed { color: var(--red-600, #dc2626); }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .data-table th { text-align: left; padding: 0.5rem 0.75rem; background: var(--surface-ground); border-bottom: 1px solid var(--surface-border); font-size: 0.8rem; color: var(--text-color-secondary); white-space: nowrap; }
    .data-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--surface-border); vertical-align: middle; }
    .num { text-align: right; }
    .mono { font-family: monospace; }
    .actions { white-space: nowrap; text-align: right; }
    .sub > td { background: var(--surface-ground); }
    .inner { background: var(--surface-card); }
    .muted { color: var(--text-color-secondary); }
    .linkbtn { background: none; border: 0; padding: 0; font: inherit; color: var(--primary-color); cursor: pointer; text-decoration: underline; }
    .form { display: flex; flex-direction: column; gap: 0.75rem; }
    .field { display: flex; flex-direction: column; gap: 0.3rem; }
    label { font-size: 0.875rem; font-weight: 500; }
    .req { color: var(--red-500, #ef4444); }
  `],
})
export class PolicyInvoicesComponent implements OnInit {
  private readonly api = inject(BillingApi);
  private readonly toast = inject(MessageService);

  readonly policyId = input.required<string>();

  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly invoices = signal<Invoice[]>([]);
  readonly expanded = signal<string | null>(null);
  readonly payments = signal<BillingPayment[]>([]);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly methods = METHODS;

  readonly payVisible = signal(false);
  readonly cancelVisible = signal(false);
  payInvoice: Invoice | null = null;
  payAmount = '';
  payMethod: BillingPaymentMethod = 'TRANSFER';
  payDate = '';
  payBank = '';
  payRef = '';
  cancelTarget: BillingPayment | null = null;
  cancelReason = '';
  private idempotencyKey = '';

  readonly totals = computed(() => {
    // credit notes are money owed *to* the customer (refunds), so they are not part of what the customer owes
    const live = this.invoices().filter((i) => i.status !== 'CANCELLED' && i.type !== 'CREDIT_NOTE');
    // Money stays a string end to end; sum in whole satang (integers) rather than floats.
    const satang = (v: string) => {
      const [baht, frac = ''] = v.split('.');
      return Number(baht) * 100 + Number(frac.padEnd(2, '0').slice(0, 2)) * (v.startsWith('-') ? -1 : 1);
    };
    const fmt = (n: number) => `${n < 0 ? '-' : ''}${Math.floor(Math.abs(n) / 100)}.${String(Math.abs(n) % 100).padStart(2, '0')}`;
    const sum = (pick: (i: Invoice) => string) => fmt(live.reduce((acc, i) => acc + satang(pick(i)), 0));
    return { amount: sum((i) => i.amount), paid: sum((i) => i.paidAmount), outstanding: sum((i) => i.outstandingAmount) };
  });

  ngOnInit(): void {
    this.load();
  }

  methodLabel(m: string): string {
    return METHODS.find((x) => x.value === m)?.label ?? m;
  }

  canPay(inv: Invoice): boolean {
    return inv.type !== 'CREDIT_NOTE' && inv.status !== 'PAID' && inv.status !== 'CANCELLED';
  }

  typeLabel(type: Invoice['type']): string {
    return { INVOICE: 'ใบแจ้งหนี้', DEBIT_NOTE: 'ใบเพิ่มหนี้', CREDIT_NOTE: 'ใบลดหนี้' }[type] ?? type;
  }

  pdf(kind: 'invoices' | 'receipts', id: string): void {
    this.api.openPdf(kind, id);
  }

  private load(keepOpen = false): void {
    this.api.invoicesByPolicy(this.policyId()).subscribe({
      next: (list) => {
        this.invoices.set(list);
        this.state.set('none');
        const open = this.expanded();
        if (keepOpen && open) this.loadPayments(open);
      },
      error: () => this.state.set('error'),
    });
  }

  private loadPayments(invoiceId: string): void {
    this.api.paymentsByInvoice(invoiceId).subscribe({ next: (r) => this.payments.set(r.items) });
  }

  toggle(inv: Invoice): void {
    if (this.expanded() === inv.id) {
      this.expanded.set(null);
      return;
    }
    this.payments.set([]);
    this.expanded.set(inv.id);
    this.loadPayments(inv.id);
  }

  openPay(inv: Invoice): void {
    this.payInvoice = inv;
    this.payAmount = inv.outstandingAmount;
    this.payMethod = 'TRANSFER';
    this.payDate = '';
    this.payBank = '';
    this.payRef = '';
    this.formError.set(null);
    this.idempotencyKey = crypto.randomUUID();
    this.payVisible.set(true);
  }

  submitPay(): void {
    if (!this.payInvoice) return;
    this.saving.set(true);
    this.formError.set(null);
    this.api
      .recordPayment(
        this.payInvoice.id,
        {
          amount: this.payAmount.trim(),
          paymentMethod: this.payMethod,
          ...(this.payDate ? { paymentDate: this.payDate } : {}),
          ...(this.payBank.trim() ? { bank: this.payBank.trim() } : {}),
          ...(this.payRef.trim() ? { referenceNo: this.payRef.trim() } : {}),
        },
        this.idempotencyKey,
      )
      .subscribe({
        next: (res) => {
          this.saving.set(false);
          this.payVisible.set(false);
          this.toast.add({ severity: 'success', summary: 'บันทึกการชำระแล้ว', detail: res.payment.receipt?.receiptNo });
          this.expanded.set(res.payment.invoiceId);
          this.load(true);
        },
        error: (e: HttpErrorResponse) => {
          this.saving.set(false);
          this.formError.set((e.error as { message?: string } | null)?.message ?? 'ไม่สามารถบันทึกได้');
        },
      });
  }

  openCancel(p: BillingPayment): void {
    this.cancelTarget = p;
    this.cancelReason = '';
    this.formError.set(null);
    this.cancelVisible.set(true);
  }

  submitCancel(): void {
    if (!this.cancelTarget) return;
    if (!this.cancelReason.trim()) {
      this.formError.set('กรุณาระบุเหตุผล');
      return;
    }
    this.saving.set(true);
    this.api.cancelPayment(this.cancelTarget.id, this.cancelReason.trim()).subscribe({
      next: () => {
        this.saving.set(false);
        this.cancelVisible.set(false);
        this.toast.add({ severity: 'success', summary: 'ยกเลิกการชำระแล้ว' });
        this.load(true);
      },
      error: (e: HttpErrorResponse) => {
        this.saving.set(false);
        this.formError.set((e.error as { message?: string } | null)?.message ?? 'ไม่สามารถยกเลิกได้');
      },
    });
  }
}
