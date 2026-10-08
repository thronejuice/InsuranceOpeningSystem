import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import { JobsApi, type ApprovalResponse } from '../../jobs/data/jobs.api';
import { MessageService, UiButton, UiDialog, UiInput, UiMessage } from '../../../shared/ui';

const APPROVAL_TYPE_LABELS: Record<string, string> = {
  SUPERVISOR: 'หัวหน้างาน (Supervisor)',
  MANAGER: 'ผู้จัดการ (Manager)',
  ADMIN: 'ผู้ดูแลระบบ (Admin)',
};

@Component({
  selector: 'app-approvals-inbox-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, MoneyPipe, UiButton, UiDialog, UiInput, UiMessage, AppPageHeaderComponent, AppStateComponent, AppStatusBadgeComponent, ThDatePipe],
  template: `
    <app-page-header title="กล่องอนุมัติ" subtitle="รายการรอการอนุมัติ" />

    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else if (approvals().length === 0) {
      <app-state state="empty" emptyMessage="ไม่มีรายการรอการอนุมัติ" />
    } @else {
      <div class="card">
        <table class="data-table">
          <thead>
            <tr>
              <th>งานประกัน</th>
              <th>ลูกค้า</th>
              <th>ยอดเบี้ย</th>
              <th>ประเภทอนุมัติ</th>
              <th>สถานะ</th>
              <th>วันที่ขอ</th>
              <th>เหตุผล</th>
              <th style="width:160px"></th>
            </tr>
          </thead>
          <tbody>
            @for (a of approvals(); track a.id) {
              <tr>
                <td>
                  <a [routerLink]="['/jobs', a.jobId]" class="job-link">{{ a.jobNo || a.jobId }}</a>
                </td>
                <td>{{ a.customerName || '-' }}</td>
                <td>{{ a.totalPremium ? (a.totalPremium | money) + ' บาท' : '-' }}</td>
                <td><span class="type-tag">{{ getApprovalTypeLabel(a.approvalType) }}</span></td>
                <td><app-status-badge [status]="a.status" /></td>
                <td>{{ (a.requestedAt || a.createdAt) | thDate }}</td>
                <td>{{ a.reason ?? '-' }}</td>
                <td>
                  @if (a.canDecide) {
                    <div class="row-actions">
                      <ui-button label="อนุมัติ" icon="pi pi-check" size="small" severity="success" [loading]="approvingId() === a.id" (onClick)="doApprove(a)" />
                      <ui-button label="ปฏิเสธ" icon="pi pi-times" size="small" severity="danger" [outlined]="true" (onClick)="openReject(a)" />
                    </div>
                  } @else if (a.status === 'PENDING') {
                    <small class="text-secondary">รอผู้อนุมัติท่านอื่น</small>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (error()) {
      <ui-message severity="error" class="mt-2 block">{{ error() }}</ui-message>
    }

    <!-- Reject UiDialog -->
    <ui-dialog
      [(visible)]="showRejectDialog"
      header="ปฏิเสธการอนุมัติ"
      icon="pi pi-times-circle"
      [modal]="true"
      [style]="{ width: '420px' }"
    >
      <div class="reason-form">
        <label for="reject-reason">เหตุผล <span class="required">*</span></label>
        <textarea uiInput id="reject-reason" [(ngModel)]="rejectReason" rows="4" class="w-full" placeholder="กรอกเหตุผล..."></textarea>
        @if (rejectError()) {
          <small class="error-text">{{ rejectError() }}</small>
        }
      </div>
      <ng-template #footer>
        <ui-button label="ยกเลิก" icon="pi pi-times" severity="danger" [outlined]="true" (onClick)="closeReject()" [disabled]="rejecting()" />
        <ui-button label="ปฏิเสธ" icon="pi pi-times-circle" severity="danger" (onClick)="confirmReject()" [loading]="rejecting()" [disabled]="rejecting()" />
      </ng-template>
    </ui-dialog>
  `,
  styles: [`
    .card { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 8px; padding: 1.25rem; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    .data-table th { text-align: left; padding: 0.5rem 0.75rem; background: var(--surface-ground); border-bottom: 1px solid var(--surface-border); font-size: 0.8rem; color: var(--text-color-secondary); }
    .data-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--surface-border); vertical-align: middle; }
    .data-table tr:hover td { background: var(--surface-hover); }
    .row-actions { display: flex; gap: 0.25rem; }
    .job-link { color: var(--primary-color); text-decoration: none; font-size: 0.82rem; }
    .job-link:hover { text-decoration: underline; }
    .reason-form { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem 0; }
    .required { color: var(--red-500); }
    .error-text { color: var(--red-500); font-size: 0.8rem; }
    .mt-2 { margin-top: 0.5rem; }
  `],
})
export class ApprovalsInboxPage implements OnInit {
  private readonly api = inject(JobsApi);
  private readonly toast = inject(MessageService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly state = signal<'loading' | 'error' | 'none'>('none');
  readonly approvals = signal<ApprovalResponse[]>([]);
  readonly error = signal<string | null>(null);
  readonly approvingId = signal<string | null>(null);

  showRejectDialog = false;
  rejectTarget: ApprovalResponse | null = null;
  rejectReason = '';
  readonly rejectError = signal<string | null>(null);
  readonly rejecting = signal(false);

  ngOnInit(): void { this.load(); }

  getApprovalTypeLabel(type: string): string {
    return APPROVAL_TYPE_LABELS[type] ?? type;
  }

  private load(): void {
    this.state.set('loading');
    this.api.listApprovals({ status: 'PENDING' }).subscribe({
      next: (list) => { this.approvals.set(list); this.state.set('none'); },
      error: () => this.state.set('error'),
    });
  }

  doApprove(a: ApprovalResponse): void {
    this.approvingId.set(a.id);
    this.error.set(null);
    this.api.approveApproval(a.id).subscribe({
      next: () => {
        this.approvingId.set(null);
        this.approvals.update((list) => list.filter((x) => x.id !== a.id));
        this.toast.add({ severity: 'success', summary: 'อนุมัติแล้ว' });
      },
      error: (e: HttpErrorResponse) => {
        this.approvingId.set(null);
        const body = e.error as { message?: string } | null;
        this.error.set(body?.message ?? 'เกิดข้อผิดพลาด');
      },
    });
  }

  openReject(a: ApprovalResponse): void {
    this.rejectTarget = a;
    this.rejectReason = '';
    this.rejectError.set(null);
    this.showRejectDialog = true;
    this.cdr.markForCheck();
  }

  closeReject(): void {
    this.showRejectDialog = false;
    this.rejectError.set(null);
    this.rejectTarget = null;
    this.cdr.markForCheck();
  }

  confirmReject(): void {
    if (!this.rejectReason.trim()) { this.rejectError.set('กรุณากรอกเหตุผล'); return; }
    const a = this.rejectTarget;
    if (!a) return;
    this.rejecting.set(true);
    this.rejectError.set(null);
    this.api.rejectApproval(a.id, { reason: this.rejectReason.trim() }).subscribe({
      next: () => {
        this.rejecting.set(false);
        this.showRejectDialog = false;
        this.cdr.markForCheck();
        this.approvals.update((list) => list.filter((x) => x.id !== a.id));
        this.toast.add({ severity: 'info', summary: 'ปฏิเสธแล้ว' });
      },
      error: (e: HttpErrorResponse) => {
        this.rejecting.set(false);
        const body = e.error as { message?: string } | null;
        this.rejectError.set(body?.message ?? 'เกิดข้อผิดพลาด');
      },
    });
  }
}
