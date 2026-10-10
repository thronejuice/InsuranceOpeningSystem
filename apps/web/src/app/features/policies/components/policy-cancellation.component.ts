import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { MessageService, UiButton, UiDialog, UiInput, UiMessage } from '../../../shared/ui';
import {
  PoliciesExtendedApi,
  type CancellationCalcResult,
  type RequestCancellationDto,
  type ApproveCancellationDto,
} from '../data/policies-extended.api';
import { JobsApi, type PolicyResponse } from '../../jobs/data/jobs.api';

@Component({
  selector: 'app-policy-cancellation',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MoneyPipe,
    UiButton,
    UiDialog,
    UiInput,
    UiMessage,
  ],
  template: `
    <div class="cancellation-box">
      @if (policy().status === 'ACTIVE' || policy().status === 'EXPIRING') {
        <div class="flex items-center justify-between">
          <div>
            <div class="font-semibold text-sm">การขอยกเลิกกรมธรรม์ (Policy Cancellation)</div>
            <div class="text-xs text-secondary">
              สามารถยื่นคำขอยกเลิกกรมธรรม์ก่อนกำหนด และคำนวณเงินคืนเบี้ยตามตาราง Short-rate
            </div>
          </div>
          <ui-button
            label="ขอยกเลิกกรมธรรม์"
            icon="pi pi-times-circle"
            severity="danger"
            size="small"
            [outlined]="true"
            (onClick)="openRequestDialog()"
          />
        </div>
      } @else if (policy().status === 'CANCEL_REQUESTED') {
        <div class="cancel-pending-banner">
          <div class="banner-content">
            <i class="pi pi-exclamation-triangle warn-icon"></i>
            <div>
              <div class="font-bold text-sm text-yellow-800">มีคำขอยกเลิกกรมธรรม์อยู่ระหว่างรออนุมัติ</div>
              <div class="text-xs text-yellow-700 mt-1">
                เหตุผล: {{ policy().cancelReason ?? '-' }} |
                วันที่มีผล: {{ policy().cancelEffectiveDate ?? '-' }} |
                ยอดคืนคำนวณได้: {{ (policy().cancelRefundAmount ?? '0') | money }} บาท
              </div>
            </div>
          </div>
          <div class="banner-actions">
            <ui-button
              label="อนุมัติยกเลิกกรมธรรม์"
              icon="pi pi-check"
              severity="danger"
              size="small"
              (onClick)="openApproveDialog()"
            />
            <ui-button
              label="ปฏิเสธคำขอ"
              size="small"
              severity="secondary"
              [outlined]="true"
              (onClick)="openRejectDialog()"
            />
          </div>
        </div>
      } @else if (policy().status === 'CANCELLED') {
        <div class="cancel-done-banner">
          <i class="pi pi-ban ban-icon"></i>
          <div>
            <div class="font-bold text-sm text-red-800">กรมธรรม์นี้ถูกยกเลิกแล้ว (Cancelled)</div>
            <div class="text-xs text-red-700 mt-1">
              เหตุผล: {{ policy().cancelReason ?? '-' }} |
              ยอดคืนเบี้ย: {{ (policy().cancelRefundAmount ?? '0') | money }} บาท
            </div>
          </div>
        </div>
      }
    </div>

    <!-- Request Cancellation Dialog -->
    <ui-dialog
      header="ยื่นคำขอยกเลิกกรมธรรม์"
      [visible]="requestDialogVisible()"
      [modal]="true"
      [style]="{ width: '560px' }"
      (onHide)="requestDialogVisible.set(false)"
    >
      <div class="form-container">
        @if (dialogError()) {
          <ui-message severity="error" class="mb-3">{{ dialogError() }}</ui-message>
        }

        <div class="field">
          <label>วันที่ยื่นคำขอ *</label>
          <input uiInput type="date" [(ngModel)]="requestDate" class="w-full" />
        </div>

        <div class="field">
          <label>วันที่มีผลยกเลิก *</label>
          <input uiInput type="date" [(ngModel)]="effectiveDate" class="w-full" />
        </div>

        <div class="field">
          <label>เหตุผลในการยกเลิก *</label>
          <textarea uiInput rows="2" [(ngModel)]="reason" placeholder="ระบุเหตุผลที่ขอยกเลิกกรมธรรม์" class="w-full"></textarea>
        </div>

        <!-- Short-Rate Calculation Box -->
        <div class="calc-section">
          <div class="flex justify-between items-center mb-2">
            <span class="font-semibold text-xs">คำนวณเบี้ยคืน (Short-rate Table)</span>
            <ui-button
              label="คำนวณอัตโนมัติ"
              icon="pi pi-calculator"
              size="small"
              [outlined]="true"
              [loading]="calculating()"
              (onClick)="calculateRefund()"
            />
          </div>

          @if (calcResult(); as res) {
            <div class="bg-ground p-3 rounded text-xs space-y-1">
              <div class="flex justify-between"><span>ใช้ความคุ้มครองไปแล้ว:</span> <strong>{{ res.daysUsed }} / {{ res.totalDays }} วัน</strong></div>
              <div class="flex justify-between"><span>บริษัทประกันหักไว้ (Short-rate):</span> <strong>{{ res.retentionPercent }}%</strong></div>
              <div class="flex justify-between"><span>เบี้ยสุทธิที่คืน / อากร / ภาษี:</span> <span>{{ res.refundNet | money }} / {{ res.stampDuty | money }} / {{ res.vat | money }}</span></div>
              <div class="flex justify-between text-primary font-bold"><span>เบี้ยประกันที่ต้องคืน:</span> <span>{{ res.totalRefund | money }} บาท</span></div>
            </div>
          }
        </div>
      </div>

      <ng-template #footer>
        <div class="dialog-actions">
          <ui-button label="ยกเลิก" [text]="true" (onClick)="requestDialogVisible.set(false)" />
          <ui-button
            label="ยื่นคำขอยกเลิก"
            severity="danger"
            icon="pi pi-send"
            [disabled]="!reason.trim()"
            [loading]="submitting()"
            (onClick)="submitRequest()"
          />
        </div>
      </ng-template>
    </ui-dialog>

    <!-- Approve Cancellation Dialog -->
    <ui-dialog
      header="อนุมัติการยกเลิกกรมธรรม์"
      [visible]="approveDialogVisible()"
      [modal]="true"
      [style]="{ width: '500px' }"
      (onHide)="approveDialogVisible.set(false)"
    >
      <div class="form-container">
        @if (dialogError()) {
          <ui-message severity="error" class="mb-3">{{ dialogError() }}</ui-message>
        }

        <p class="text-sm">
          การอนุมัติยกเลิกจะทำการยกเลิกใบแจ้งหนี้ที่ยังไม่ได้ชำระ, ออกใบลดหนี้ (Credit Note) และสร้างรายการขอคืนเงิน (Refund) ให้ฝ่ายการเงิน
        </p>

        <div class="field mt-2">
          <label>เอกสารยืนยันจากบริษัทประกัน (แนบไฟล์) *</label>
          <input type="file" (change)="onFileSelected($event)" class="file-input" />
          <span class="text-xs text-secondary mt-1">ต้องแนบเอกสารยืนยันการยกเลิกจากบริษัทประกัน</span>
        </div>
      </div>

      <ng-template #footer>
        <div class="dialog-actions">
          <ui-button label="ยกเลิก" [text]="true" (onClick)="approveDialogVisible.set(false)" />
          <ui-button
            label="ยืนยันอนุมัติยกเลิก"
            severity="danger"
            icon="pi pi-check"
            [disabled]="!selectedFile"
            [loading]="submitting()"
            (onClick)="submitApprove()"
          />
        </div>
      </ng-template>
    </ui-dialog>

    <!-- Reject Cancellation Dialog -->
    <ui-dialog
      header="ปฏิเสธคำขอยกเลิกกรมธรรม์"
      [visible]="rejectDialogVisible()"
      [modal]="true"
      [style]="{ width: '450px' }"
      (onHide)="rejectDialogVisible.set(false)"
    >
      <div class="form-container">
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
            severity="secondary"
            [disabled]="!rejectReason.trim()"
            [loading]="submitting()"
            (onClick)="submitReject()"
          />
        </div>
      </ng-template>
    </ui-dialog>
  `,
  styles: [`
    .cancellation-box {
      border-top: 1px solid var(--surface-border);
      padding-top: 1.25rem;
      margin-top: 1.5rem;
    }
    .cancel-pending-banner {
      background: #fefce8;
      border: 1px solid #fef08a;
      border-radius: 6px;
      padding: 0.85rem 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .banner-content { display: flex; gap: 0.75rem; align-items: center; }
    .warn-icon { font-size: 1.5rem; color: #ca8a04; }
    .banner-actions { display: flex; gap: 0.5rem; }
    .cancel-done-banner {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 6px;
      padding: 0.85rem 1rem;
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }
    .ban-icon { font-size: 1.5rem; color: #dc2626; }
    .form-container { display: flex; flex-direction: column; gap: 0.85rem; padding-top: 0.5rem; }
    .field { display: flex; flex-direction: column; gap: 0.3rem; }
    label { font-size: 0.85rem; font-weight: 500; }
    .calc-section { border: 1px solid var(--surface-border); border-radius: 6px; padding: 0.75rem; background: var(--surface-ground); }
    .dialog-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
    .bg-ground { background: var(--surface-card); }
    .p-3 { padding: 0.75rem; }
    .rounded { border-radius: 6px; }
    .space-y-1 > * + * { margin-top: 0.25rem; }
    .file-input { font-size: 0.85rem; }
    .flex { display: flex; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .text-yellow-800 { color: #854d0e; }
    .text-yellow-700 { color: #a16207; }
    .text-red-800 { color: #991b1b; }
    .text-red-700 { color: #b91c1c; }
    .text-secondary { color: var(--text-color-secondary); }
    .mt-1 { margin-top: 0.25rem; }
    .mt-2 { margin-top: 0.5rem; }
    .mb-2 { margin-bottom: 0.5rem; }
    .mb-3 { margin-bottom: 0.75rem; }
  `],
})
export class PolicyCancellationComponent {
  private readonly extendedApi = inject(PoliciesExtendedApi);
  private readonly jobsApi = inject(JobsApi);
  private readonly toast = inject(MessageService);

  readonly policy = input.required<PolicyResponse>();
  readonly updated = output<void>();

  readonly requestDialogVisible = signal(false);
  readonly approveDialogVisible = signal(false);
  readonly rejectDialogVisible = signal(false);

  readonly calculating = signal(false);
  readonly submitting = signal(false);
  readonly dialogError = signal<string | null>(null);

  // Form State
  requestDate = new Date().toISOString().slice(0, 10);
  effectiveDate = new Date().toISOString().slice(0, 10);
  reason = '';
  calcResult = signal<CancellationCalcResult | null>(null);

  selectedFile: File | null = null;
  rejectReason = '';

  openRequestDialog(): void {
    this.dialogError.set(null);
    this.requestDate = new Date().toISOString().slice(0, 10);
    this.effectiveDate = new Date().toISOString().slice(0, 10);
    this.reason = '';
    this.calcResult.set(null);
    this.requestDialogVisible.set(true);
  }

  calculateRefund(): void {
    this.calculating.set(true);
    this.extendedApi.calculateCancellation(this.policy().id, {
      cancelEffectiveDate: this.effectiveDate,
      method: 'SHORT_RATE',
    }).subscribe({
      next: (res) => {
        this.calculating.set(false);
        this.calcResult.set(res);
        this.toast.add({ severity: 'info', summary: 'คำนวณเบี้ยคืนสำเร็จ' });
      },
      error: (e: HttpErrorResponse) => {
        this.calculating.set(false);
        this.toast.add({ severity: 'error', summary: 'คำนวณไม่สำเร็จ', detail: e.error?.message });
      },
    });
  }

  submitRequest(): void {
    this.dialogError.set(null);
    this.submitting.set(true);

    const refundAmt = this.calcResult()?.totalRefund;
    const dto: RequestCancellationDto = {
      cancelReason: this.reason,
      cancelRequestDate: this.requestDate,
      cancelEffectiveDate: this.effectiveDate,
      cancelRefundAmount: refundAmt,
    };

    this.extendedApi.requestCancellation(this.policy().id, dto).subscribe({
      next: () => {
        this.submitting.set(false);
        this.requestDialogVisible.set(false);
        this.toast.add({ severity: 'success', summary: 'ยื่นคำขอยกเลิกสำเร็จ' });
        this.updated.emit();
      },
      error: (e: HttpErrorResponse) => {
        this.submitting.set(false);
        this.dialogError.set(e.error?.message ?? 'ยื่นคำขอยกเลิกไม่สำเร็จ');
      },
    });
  }

  openApproveDialog(): void {
    this.dialogError.set(null);
    this.selectedFile = null;
    this.approveDialogVisible.set(true);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
    }
  }

  submitApprove(): void {
    if (!this.selectedFile) return;
    this.dialogError.set(null);
    this.submitting.set(true);

    // Upload document under policy's job first
    this.jobsApi.uploadDocument(this.policy().jobId, 'OTHER', this.selectedFile).subscribe({
      next: (doc) => {
        const dto: ApproveCancellationDto = {
          cancelInsurerDocumentId: doc.id,
        };
        this.extendedApi.approveCancellation(this.policy().id, dto).subscribe({
          next: () => {
            this.submitting.set(false);
            this.approveDialogVisible.set(false);
            this.toast.add({ severity: 'success', summary: 'อนุมัติยกเลิกกรมธรรม์แล้ว' });
            this.updated.emit();
          },
          error: (e: HttpErrorResponse) => {
            this.submitting.set(false);
            this.dialogError.set(e.error?.message ?? 'อนุมัติไม่สำเร็จ');
          },
        });
      },
      error: (e: HttpErrorResponse) => {
        this.submitting.set(false);
        this.dialogError.set(e.error?.message ?? 'อัปโหลดเอกสารไม่สำเร็จ');
      },
    });
  }

  openRejectDialog(): void {
    this.rejectReason = '';
    this.rejectDialogVisible.set(true);
  }

  submitReject(): void {
    this.submitting.set(true);
    this.extendedApi.rejectCancellation(this.policy().id, { reason: this.rejectReason }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.rejectDialogVisible.set(false);
        this.toast.add({ severity: 'warn', summary: 'ปฏิเสธคำขอยกเลิกแล้ว' });
        this.updated.emit();
      },
      error: (e: HttpErrorResponse) => {
        this.submitting.set(false);
        this.toast.add({ severity: 'error', summary: 'เกิดข้อผิดพลาด', detail: e.error?.message });
      },
    });
  }
}

