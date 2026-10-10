import { ExportService } from '../../../core/api/export.service';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { MessageService, UiButton, UiDialog, UiInput, UiMessage, UiSelect } from '../../../shared/ui';
import {
  RefundsApi,
  type RefundResponse,
  type RefundStatus,
  type ProcessRefundDto,
  type PaymentMethod,
} from '../data/refunds.api';

@Component({
  selector: 'app-refunds-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HasPermissionDirective,
    FormsModule,
    AppPageHeaderComponent,
    AppStateComponent,
    AppStatusBadgeComponent,
    ThDatePipe,
    MoneyPipe,
    UiButton,
    UiDialog,
    UiInput,
    UiMessage,
    UiSelect,
  ],
  template: `
    <app-page-header title="การคืนเงิน (Refunds)" subtitle="รายการคำขอคืนเงินและสถานะการจ่ายเงิน">
      <div class="header-filters">
        <ui-button *appHasPermission="'report.view'" label="Export Excel" icon="pi pi-file-excel" severity="secondary" [outlined]="true" size="small" (onClick)="exportExcel()" />
        <ui-select
          [options]="statusFilterOptions"
          optionLabel="label"
          optionValue="value"
          [(ngModel)]="selectedStatus"
          (ngModelChange)="loadRefunds()"
          placeholder="สถานะทั้งหมด"
          class="status-filter"
        />
      </div>
    </app-page-header>

    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else if (refunds().length === 0) {
      <app-state state="empty" emptyMessage="ไม่พบรายการคำขอคืนเงิน" />
    } @else {
      <div class="card">
        <table class="data-table">
          <thead>
            <tr>
              <th>เลขที่คำขอคืนเงิน</th>
              <th>ใบลดหนี้ (Credit Note)</th>
              <th>กรมธรรม์</th>
              <th style="text-align:right">ยอดเงินคืน (บาท)</th>
              <th>สถานะ</th>
              <th>ผู้ขอ</th>
              <th>วันที่ขอ</th>
              <th>ผู้อนุมัติ</th>
              <th>ผู้จ่ายเงิน</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            @for (r of refunds(); track r.id) {
              <tr>
                <td class="font-bold mono">{{ r.refundNo }}</td>
                <td class="mono">{{ r.creditNoteNo ?? '-' }}</td>
                <td>{{ r.policyNo ?? '-' }}</td>
                <td style="text-align:right; font-weight:600; color: #dc2626;">{{ r.amount | money }}</td>
                <td><app-status-badge [status]="r.status" context="refund" /></td>
                <td>{{ r.requestedByName ?? '-' }}</td>
                <td>{{ r.requestedAt | thDate }}</td>
                <td>{{ r.approvedByName ? (r.approvedByName + ' (' + (r.approvedAt | thDate) + ')') : '-' }}</td>
                <td>{{ r.processedByName ? (r.processedByName + ' (' + (r.processedAt | thDate) + ')') : '-' }}</td>
                <td class="actions">
                  @if (r.status === 'REQUESTED') {
                    <ng-container *appHasPermission="'invoice.update'">
                      <ui-button
                        label="อนุมัติ"
                        size="small"
                        severity="success"
                        (onClick)="approve(r.id)"
                      />
                      <ui-button
                        label="ปฏิเสธ"
                        size="small"
                        severity="danger"
                        [outlined]="true"
                        (onClick)="openRejectDialog(r)"
                      />
                    </ng-container>
                  }
                  @if (r.status === 'APPROVED') {
                    <ng-container *appHasPermission="'payment.create'">
                      <ui-button
                        label="บันทึกจ่ายเงิน (Process)"
                        size="small"
                        severity="primary"
                        (onClick)="openProcessDialog(r)"
                      />
                    </ng-container>
                  }
                  @if (r.status === 'PROCESSED') {
                    <span class="text-xs text-green">จ่ายเงินแล้ว</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    <!-- Process Payout Dialog -->
    <ui-dialog
      header="บันทึกการจ่ายเงินคืนลูกค้า (Process Refund)"
      [visible]="processDialogVisible()"
      [modal]="true"
      [style]="{ width: '480px' }"
      (onHide)="processDialogVisible.set(false)"
    >
      @if (selectedRefund(); as r) {
        <div class="form-container">
          @if (dialogError()) {
            <ui-message severity="error" class="mb-3">{{ dialogError() }}</ui-message>
          }
          <div class="info-summary mb-2">
            <div>เลขที่คำขอ: <strong>{{ r.refundNo }}</strong></div>
            <div>ยอดที่ต้องจ่ายคืน: <strong class="text-red">{{ r.amount | money }} บาท</strong></div>
          </div>

          <div class="field">
            <label>ช่องทางการชำระเงิน *</label>
            <ui-select
              [options]="paymentMethodOptions"
              optionLabel="label"
              optionValue="value"
              [(ngModel)]="paymentMethod"
              class="w-full"
            />
          </div>

          <div class="field">
            <label>ธนาคาร (กรณีโอนเงิน)</label>
            <input uiInput [(ngModel)]="bankName" placeholder="เช่น กสิกรไทย, ไทยพาณิชย์" class="w-full" />
          </div>

          <div class="field">
            <label>เลขที่อ้างอิง / สลิปโอนเงิน</label>
            <input uiInput [(ngModel)]="referenceNo" placeholder="เลขที่อ้างอิงการโอน" class="w-full" />
          </div>
        </div>
      }
      <ng-template #footer>
        <div class="dialog-actions">
          <ui-button label="ยกเลิก" [text]="true" (onClick)="processDialogVisible.set(false)" />
          <ui-button
            label="ยืนยันการจ่ายเงิน"
            icon="pi pi-check"
            [loading]="submitting()"
            (onClick)="submitProcess()"
          />
        </div>
      </ng-template>
    </ui-dialog>

    <!-- Reject Dialog -->
    <ui-dialog
      header="ปฏิเสธคำขอคืนเงิน"
      [visible]="rejectDialogVisible()"
      [modal]="true"
      [style]="{ width: '450px' }"
      (onHide)="rejectDialogVisible.set(false)"
    >
      <div class="form-container">
        @if (dialogError()) {
          <ui-message severity="error" class="mb-3">{{ dialogError() }}</ui-message>
        }
        <div class="field">
          <label>ระบุเหตุผลในการปฏิเสธ *</label>
          <textarea uiInput rows="3" [(ngModel)]="rejectReason" class="w-full"></textarea>
        </div>
      </div>
      <ng-template #footer>
        <div class="dialog-actions">
          <ui-button label="ยกเลิก" [text]="true" (onClick)="rejectDialogVisible.set(false)" />
          <ui-button
            label="ยืนยันปฏิเสธ"
            severity="danger"
            [disabled]="!rejectReason.trim()"
            [loading]="submitting()"
            (onClick)="submitReject()"
          />
        </div>
      </ng-template>
    </ui-dialog>
  `,
  styles: [`
    .header-filters { display: flex; gap: 0.5rem; align-items: center; }
    .status-filter { min-width: 180px; }
    .card { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 8px; padding: 1.25rem; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .data-table th { text-align: left; padding: 0.5rem 0.75rem; background: var(--surface-ground); border-bottom: 1px solid var(--surface-border); font-size: 0.8rem; color: var(--text-color-secondary); }
    .data-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--surface-border); vertical-align: middle; }
    .actions { display: flex; gap: 0.35rem; align-items: center; }
    .mono { font-family: monospace; }
    .font-bold { font-weight: 600; }
    .text-red { color: #dc2626; }
    .text-green { color: #16a34a; font-weight: 500; }
    .form-container { display: flex; flex-direction: column; gap: 0.85rem; padding-top: 0.5rem; }
    .field { display: flex; flex-direction: column; gap: 0.3rem; }
    label { font-size: 0.85rem; font-weight: 500; }
    .dialog-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
    .info-summary { background: var(--surface-ground); border-radius: 6px; padding: 0.75rem; font-size: 0.875rem; }
    .mb-2 { margin-bottom: 0.5rem; }
    .mb-3 { margin-bottom: 0.75rem; }
  `],
})
export class RefundsListPage implements OnInit {
  private readonly api = inject(RefundsApi);
  private readonly exportSvc = inject(ExportService);

  exportExcel(): void {
    this.exportSvc.download('refunds');
  }

  private readonly toast = inject(MessageService);

  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly refunds = signal<RefundResponse[]>([]);
  readonly selectedRefund = signal<RefundResponse | null>(null);

  readonly processDialogVisible = signal(false);
  readonly rejectDialogVisible = signal(false);
  readonly submitting = signal(false);
  readonly dialogError = signal<string | null>(null);

  selectedStatus: RefundStatus | null = null;

  // Process Dialog Fields
  paymentMethod: PaymentMethod = 'TRANSFER';
  bankName = '';
  referenceNo = '';

  // Reject Dialog Fields
  rejectReason = '';

  readonly statusFilterOptions = [
    { label: 'ทุกสถานะ', value: null },
    { label: 'รออนุมัติ (REQUESTED)', value: 'REQUESTED' },
    { label: 'อนุมัติแล้ว (APPROVED)', value: 'APPROVED' },
    { label: 'จ่ายเงินแล้ว (PROCESSED)', value: 'PROCESSED' },
    { label: 'ปฏิเสธ (REJECTED)', value: 'REJECTED' },
  ];

  readonly paymentMethodOptions = [
    { label: 'โอนเงินผ่านธนาคาร (TRANSFER)', value: 'TRANSFER' },
    { label: 'เงินสด (CASH)', value: 'CASH' },
    { label: 'เช็คธนาคาร (CHEQUE)', value: 'CHEQUE' },
    { label: 'บัตรเครดิต (CREDIT_CARD)', value: 'CREDIT_CARD' },
    { label: 'ออนไลน์ (ONLINE)', value: 'ONLINE' },
    { label: 'อื่นๆ (OTHER)', value: 'OTHER' },
  ];

  ngOnInit(): void {
    this.loadRefunds();
  }

  loadRefunds(): void {
    this.state.set('loading');
    this.api.list({ status: this.selectedStatus ?? undefined }).subscribe({
      next: (res) => {
        this.refunds.set(res.items);
        this.state.set('none');
      },
      error: () => this.state.set('error'),
    });
  }

  approve(id: string): void {
    this.api.approve(id).subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'อนุมัติคำขอคืนเงินแล้ว' });
        this.loadRefunds();
      },
      error: (e: HttpErrorResponse) => {
        this.toast.add({ severity: 'error', summary: 'อนุมัติไม่สำเร็จ', detail: e.error?.message });
      },
    });
  }

  openRejectDialog(r: RefundResponse): void {
    this.selectedRefund.set(r);
    this.rejectReason = '';
    this.dialogError.set(null);
    this.rejectDialogVisible.set(true);
  }

  submitReject(): void {
    const r = this.selectedRefund();
    if (!r) return;
    this.submitting.set(true);
    this.api.reject(r.id, this.rejectReason).subscribe({
      next: () => {
        this.submitting.set(false);
        this.rejectDialogVisible.set(false);
        this.toast.add({ severity: 'warn', summary: 'ปฏิเสธคำขอคืนเงินแล้ว' });
        this.loadRefunds();
      },
      error: (e: HttpErrorResponse) => {
        this.submitting.set(false);
        this.dialogError.set(e.error?.message ?? 'ปฏิเสธไม่สำเร็จ');
      },
    });
  }

  openProcessDialog(r: RefundResponse): void {
    this.selectedRefund.set(r);
    this.paymentMethod = 'TRANSFER';
    this.bankName = '';
    this.referenceNo = '';
    this.dialogError.set(null);
    this.processDialogVisible.set(true);
  }

  submitProcess(): void {
    const r = this.selectedRefund();
    if (!r) return;
    this.submitting.set(true);
    const dto: ProcessRefundDto = {
      paymentMethod: this.paymentMethod,
      bank: this.bankName || undefined,
      referenceNo: this.referenceNo || undefined,
    };

    this.api.process(r.id, dto).subscribe({
      next: () => {
        this.submitting.set(false);
        this.processDialogVisible.set(false);
        this.toast.add({ severity: 'success', summary: 'บันทึกการจ่ายเงินคืนเรียบร้อยแล้ว' });
        this.loadRefunds();
      },
      error: (e: HttpErrorResponse) => {
        this.submitting.set(false);
        this.dialogError.set(e.error?.message ?? 'บันทึกจ่ายเงินไม่สำเร็จ');
      },
    });
  }
}

