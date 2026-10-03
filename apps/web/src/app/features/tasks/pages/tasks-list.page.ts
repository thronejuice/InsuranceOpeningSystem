import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import { JobsApi, type TaskRecord } from '../../jobs/data/jobs.api';

@Component({
  selector: 'app-tasks-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppPageHeaderComponent, AppStateComponent, AppStatusBadgeComponent, ThDatePipe],
  template: `
    <app-page-header title="งานของฉัน" subtitle="รายการงานที่ได้รับมอบหมาย" />

    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else if (tasks().length === 0) {
      <app-state state="empty" emptyMessage="ยังไม่มีงานที่ได้รับมอบหมาย" />
    } @else {
      <div class="card">
        <table class="data-table">
          <thead>
            <tr>
              <th>ประเภท</th>
              <th>หัวข้อ</th>
              <th>กำหนด</th>
              <th>ความสำคัญ</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            @for (task of tasks(); track task.id) {
              <tr [class.overdue-row]="task.overdue">
                <td>{{ typeLabel(task.taskType) }}</td>
                <td>{{ task.subject }}</td>
                <td>
                  {{ task.dueDate ? (task.dueDate | thDate) : '-' }}
                  @if (task.overdue) { <span class="badge-overdue">เกินกำหนด</span> }
                </td>
                <td><app-status-badge [status]="task.priority" /></td>
                <td><app-status-badge [status]="task.status" /></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [`
    .card { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 8px; padding: 1.5rem; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .data-table th { text-align: left; padding: 0.5rem 0.75rem; background: var(--surface-ground); border-bottom: 2px solid var(--surface-border); font-size: 0.8rem; color: var(--text-color-secondary); white-space: nowrap; }
    .data-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--surface-border); }
    .overdue-row td { color: var(--red-700); }
    .badge-overdue { display: inline-block; background: var(--red-100); color: var(--red-700); font-size: 0.7rem; font-weight: 600; padding: 1px 6px; border-radius: 4px; margin-left: 4px; }
  `],
})
export class TasksListPage implements OnInit {
  private readonly api = inject(JobsApi);

  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly tasks = signal<TaskRecord[]>([]);

  private readonly TYPE_LABELS: Record<string, string> = {
    CALL_CUSTOMER: 'โทรติดต่อลูกค้า', REQUEST_DOCUMENT: 'ขอเอกสาร',
    REQUEST_QUOTATION: 'ขอใบเสนอราคา', FOLLOW_UP_QUOTATION: 'ติดตามใบเสนอราคา',
    SEND_PROPOSAL: 'ส่งใบเสนอ', FOLLOW_UP_CUSTOMER: 'ติดตามลูกค้า',
    FOLLOW_UP_PAYMENT: 'ติดตามการชำระ', FOLLOW_UP_POLICY: 'ติดตามกรมธรรม์',
    RENEWAL: 'ต่ออายุ', OTHER: 'อื่นๆ',
  };

  typeLabel(t: string): string { return this.TYPE_LABELS[t] ?? t; }

  ngOnInit(): void {
    this.api.listAllTasks({ mine: true }).subscribe({
      next: (res) => { this.tasks.set(res.items); this.state.set('none'); },
      error: () => this.state.set('error'),
    });
  }
}
