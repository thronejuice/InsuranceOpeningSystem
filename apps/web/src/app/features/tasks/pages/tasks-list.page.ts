import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import { MessageService, UiButton, UiDatepicker, UiDialog } from '../../../shared/ui';
import { JobsApi, type TaskRecord, type CreateTaskDto, type TaskType, type TaskPriority } from '../../jobs/data/jobs.api';

@Component({
  selector: 'app-tasks-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    AppPageHeaderComponent,
    AppStateComponent,
    AppStatusBadgeComponent,
    ThDatePipe,
    UiButton,
    UiDatepicker,
    UiDialog,
  ],
  template: `
    <app-page-header title="งานทั้งหมด" subtitle="ติดตามและจัดการภาระงานในระบบ">
      <ui-button label="สร้างงานใหม่" icon="pi pi-plus" size="small" (onClick)="openCreateDialog()" />
    </app-page-header>

    <div class="filter-bar">
      <div class="filter-group">
        <label>โหมด:</label>
        <select [ngModel]="mineOnly()" (ngModelChange)="onMineChange($event)" class="filter-select">
          <option [ngValue]="true">งานของฉัน</option>
          <option [ngValue]="false">งานทั้งหมด</option>
        </select>
      </div>

      <div class="filter-group">
        <label>สถานะ:</label>
        <select [ngModel]="selectedStatus()" (ngModelChange)="onStatusChange($event)" class="filter-select">
          <option value="">ทั้งหมด</option>
          <option value="TODO">รอดำเนินการ (TODO)</option>
          <option value="IN_PROGRESS">กำลังดำเนินการ (IN_PROGRESS)</option>
          <option value="DONE">เสร็จสิ้น (DONE)</option>
          <option value="CANCELLED">ยกเลิก (CANCELLED)</option>
        </select>
      </div>

      <div class="filter-group">
        <label>
          <input type="checkbox" [ngModel]="overdueOnly()" (ngModelChange)="onOverdueChange($event)" />
          เฉพาะงานเกินกำหนด
        </label>
      </div>
    </div>

    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else if (tasks().length === 0) {
      <app-state state="empty" emptyMessage="ไม่พบรายการงานตามเงื่อนไข" />
    } @else {
      <div class="card">
        <table class="data-table">
          <thead>
            <tr>
              <th>ประเภท</th>
              <th>หัวข้อ</th>
              <th>ความเชื่อมโยง</th>
              <th>กำหนด</th>
              <th>ความสำคัญ</th>
              <th>สถานะ</th>
              <th class="actions-col">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            @for (task of tasks(); track task.id) {
              <tr [class.overdue-row]="task.overdue">
                <td>{{ typeLabel(task.taskType) }}</td>
                <td>
                  <strong>{{ task.subject }}</strong>
                  @if (task.description) {
                    <div class="sub">{{ task.description }}</div>
                  }
                </td>
                <td>
                  @if (task.jobId) {
                    <div><a [routerLink]="['/jobs', task.jobId]" class="link">ใบงาน: {{ task.jobId.slice(0, 8) }}...</a></div>
                  }
                  @if (task.customerId) {
                    <div class="sub">ลูกค้า: {{ task.customerId.slice(0, 8) }}...</div>
                  }
                  @if (task.policyId) {
                    <div class="sub">กรมธรรม์: {{ task.policyId.slice(0, 8) }}...</div>
                  }
                  @if (!task.jobId && !task.customerId && !task.policyId) {
                    <span class="sub">-</span>
                  }
                </td>
                <td>
                  {{ task.dueDate ? (task.dueDate | thDate) : '-' }}
                  @if (task.overdue) { <span class="badge-overdue">เกินกำหนด</span> }
                </td>
                <td><app-status-badge [status]="task.priority" /></td>
                <td><app-status-badge [status]="task.status" /></td>
                <td class="actions-col">
                  @if (task.status !== 'DONE' && task.status !== 'CANCELLED') {
                    <ui-button label="เสร็จสิ้น" icon="pi pi-check" size="small" severity="success" (onClick)="completeTask(task)" />
                    <ui-button label="ยกเลิก" icon="pi pi-times" size="small" severity="danger" [outlined]="true" (onClick)="cancelTask(task)" />
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    <!-- Create Task Dialog -->
    <ui-dialog
      [(visible)]="showCreateDialog"
      header="สร้างงานใหม่"
      icon="pi pi-plus"
      [modal]="true"
      [style]="{ width: '480px' }"
    >
      <div class="form-container">
        <label>ประเภทงาน *</label>
        <select [(ngModel)]="newTaskType" class="form-input">
          <option value="CALL_CUSTOMER">โทรติดต่อลูกค้า</option>
          <option value="REQUEST_DOCUMENT">ขอเอกสาร</option>
          <option value="REQUEST_QUOTATION">ขอใบเสนอราคา</option>
          <option value="FOLLOW_UP_QUOTATION">ติดตามใบเสนอราคา</option>
          <option value="FOLLOW_UP_INSURER">ติดตามบริษัทประกัน</option>
          <option value="SEND_PROPOSAL">ส่งใบเสนอราคา</option>
          <option value="FOLLOW_UP_CUSTOMER">ติดตามลูกค้า</option>
          <option value="FOLLOW_UP_PAYMENT">ติดตามการชำระเงิน</option>
          <option value="FOLLOW_UP_POLICY">ติดตามกรมธรรม์</option>
          <option value="RENEWAL_FOLLOW_UP">ติดตามการต่ออายุ</option>
          <option value="CLAIM_FOLLOW_UP">ติดตามการเคลม</option>
          <option value="OTHER">อื่นๆ</option>
        </select>

        <label>หัวข้องาน *</label>
        <input type="text" [(ngModel)]="newTaskSubject" class="form-input" placeholder="ระบุหัวข้องาน" />

        <label>รายละเอียด</label>
        <textarea [(ngModel)]="newTaskDescription" class="form-input" rows="3" placeholder="รายละเอียดเพิ่มเติม"></textarea>

        <label>ระดับความสำคัญ</label>
        <select [(ngModel)]="newTaskPriority" class="form-input">
          <option value="LOW">ต่ำ</option>
          <option value="MEDIUM">ปานกลาง</option>
          <option value="HIGH">สูง</option>
          <option value="URGENT">ด่วนที่สุด</option>
        </select>

        <label>กำหนดเสร็จ (Due Date)</label>
        <ui-datepicker class="w-full" dateFormat="dd/mm/yy" [(ngModel)]="newTaskDueDate" />

        <label>รหัสลูกค้า (Customer ID)</label>
        <input type="text" [(ngModel)]="newTaskCustomerId" class="form-input" placeholder="ระบุ UUID ลูกค้า (ถ้ามี)" />

        <label>รหัสใบงาน (Job ID)</label>
        <input type="text" [(ngModel)]="newTaskJobId" class="form-input" placeholder="ระบุ UUID ใบงาน (ถ้ามี)" />
      </div>

      <ng-template #footer>
        <ui-button label="ยกเลิก" icon="pi pi-times" severity="secondary" [outlined]="true" (onClick)="showCreateDialog.set(false)" />
        <ui-button label="บันทึก" icon="pi pi-check" (onClick)="submitCreateTask()" [loading]="saving()" />
      </ng-template>
    </ui-dialog>
  `,
  styles: [`
    .filter-bar { display: flex; align-items: center; gap: 1.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .filter-group { display: flex; align-items: center; gap: 0.5rem; }
    .filter-select { padding: 0.4rem 0.75rem; border: 1px solid var(--surface-border); border-radius: 6px; background: var(--surface-card); color: var(--text-color); font-size: 0.875rem; }
    .card { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 8px; padding: 1.5rem; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .data-table th { text-align: left; padding: 0.5rem 0.75rem; background: var(--surface-ground); border-bottom: 2px solid var(--surface-border); font-size: 0.8rem; color: var(--text-color-secondary); white-space: nowrap; }
    .data-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--surface-border); vertical-align: middle; }
    .overdue-row td { color: var(--red-700); }
    .badge-overdue { display: inline-block; background: var(--red-100); color: var(--red-700); font-size: 0.7rem; font-weight: 600; padding: 1px 6px; border-radius: 4px; margin-left: 4px; }
    .actions-col { text-align: right; white-space: nowrap; }
    .sub { font-size: 0.75rem; color: var(--text-color-secondary); }
    .link { color: var(--primary-color); text-decoration: none; }
    .link:hover { text-decoration: underline; }
    .form-container { display: flex; flex-direction: column; gap: 0.5rem; }
    .form-input { padding: 0.5rem; border: 1px solid var(--surface-border); border-radius: 6px; font-size: 0.875rem; background: var(--surface-card); color: var(--text-color); }
  `],
})
export class TasksListPage implements OnInit {
  private readonly api = inject(JobsApi);
  private readonly toast = inject(MessageService);

  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly tasks = signal<TaskRecord[]>([]);
  readonly mineOnly = signal(true);
  readonly selectedStatus = signal('');
  readonly overdueOnly = signal(false);

  readonly showCreateDialog = signal(false);
  readonly saving = signal(false);

  newTaskType: TaskType = 'CALL_CUSTOMER';
  newTaskSubject = '';
  newTaskDescription = '';
  newTaskPriority: TaskPriority = 'MEDIUM';
  newTaskDueDate: Date | null = null;
  newTaskCustomerId = '';
  newTaskJobId = '';

  private readonly TYPE_LABELS: Record<string, string> = {
    CALL_CUSTOMER: 'โทรติดต่อลูกค้า',
    REQUEST_DOCUMENT: 'ขอเอกสาร',
    REQUEST_QUOTATION: 'ขอใบเสนอราคา',
    FOLLOW_UP_QUOTATION: 'ติดตามใบเสนอราคา',
    FOLLOW_UP_INSURER: 'ติดตามบริษัทประกัน',
    SEND_PROPOSAL: 'ส่งใบเสนอ',
    FOLLOW_UP_CUSTOMER: 'ติดตามลูกค้า',
    FOLLOW_UP_PAYMENT: 'ติดตามการชำระ',
    FOLLOW_UP_POLICY: 'ติดตามกรมธรรม์',
    RENEWAL: 'ต่ออายุ',
    RENEWAL_FOLLOW_UP: 'ติดตามการต่ออายุ',
    CLAIM_FOLLOW_UP: 'ติดตามการเคลม',
    OTHER: 'อื่นๆ',
  };

  typeLabel(t: string): string {
    return this.TYPE_LABELS[t] ?? t;
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.api
      .listAllTasks({
        mine: this.mineOnly(),
        status: this.selectedStatus() || undefined,
        overdue: this.overdueOnly() || undefined,
      })
      .subscribe({
        next: (res) => {
          this.tasks.set(res.items);
          this.state.set('none');
        },
        error: () => this.state.set('error'),
      });
  }

  onMineChange(val: boolean): void {
    this.mineOnly.set(val);
    this.load();
  }

  onStatusChange(val: string): void {
    this.selectedStatus.set(val);
    this.load();
  }

  onOverdueChange(val: boolean): void {
    this.overdueOnly.set(val);
    this.load();
  }

  completeTask(task: TaskRecord): void {
    this.api.completeTask(task.id).subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'ทำเครื่องหมายเสร็จสิ้นแล้ว' });
        this.load();
      },
      error: () => {
        this.toast.add({ severity: 'error', summary: 'ไม่สามารถทำรายการได้' });
      },
    });
  }

  cancelTask(task: TaskRecord): void {
    this.api.cancelTask(task.id).subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'ยกเลิกงานแล้ว' });
        this.load();
      },
      error: () => {
        this.toast.add({ severity: 'error', summary: 'ไม่สามารถทำรายการได้' });
      },
    });
  }

  openCreateDialog(): void {
    this.newTaskType = 'CALL_CUSTOMER';
    this.newTaskSubject = '';
    this.newTaskDescription = '';
    this.newTaskPriority = 'MEDIUM';
    this.newTaskDueDate = null;
    this.newTaskCustomerId = '';
    this.newTaskJobId = '';
    this.showCreateDialog.set(true);
  }

  submitCreateTask(): void {
    if (!this.newTaskSubject.trim()) {
      this.toast.add({ severity: 'warn', summary: 'กรุณาระบุหัวข้องาน' });
      return;
    }

    const payload: CreateTaskDto = {
      taskType: this.newTaskType,
      subject: this.newTaskSubject.trim(),
      description: this.newTaskDescription.trim() || undefined,
      priority: this.newTaskPriority,
      dueDate: this.newTaskDueDate ? this.newTaskDueDate.toISOString() : undefined,
      customerId: this.newTaskCustomerId.trim() || undefined,
      jobId: this.newTaskJobId.trim() || undefined,
    };

    if (!payload.jobId && !payload.customerId && !payload.policyId) {
      this.toast.add({ severity: 'warn', summary: 'กรุณาระบุ Job ID หรือ Customer ID อย่างน้อย 1 ค่า' });
      return;
    }

    this.saving.set(true);
    this.api.createGenericTask(payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.showCreateDialog.set(false);
        this.toast.add({ severity: 'success', summary: 'สร้างงานสำเร็จ' });
        this.load();
      },
      error: () => {
        this.saving.set(false);
        this.toast.add({ severity: 'error', summary: 'เกิดข้อผิดพลาดในการสร้างงาน' });
      },
    });
  }
}
