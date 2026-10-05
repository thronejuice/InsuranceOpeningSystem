import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import { ExportService } from '../../../core/api/export.service';
import { JobsApi, type CommissionRecord } from '../../jobs/data/jobs.api';
import { UiButton } from '../../../shared/ui';

@Component({
  selector: 'app-commissions-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppPageHeaderComponent, AppStateComponent, AppStatusBadgeComponent, ThDatePipe, UiButton],
  template: `
    <app-page-header title="ค่าคอมมิชชัน" subtitle="รายการค่าคอมมิชชันทั้งหมด">
      <ui-button label="Export Excel" icon="pi pi-file-excel" severity="secondary" [outlined]="true" size="small" (onClick)="export()" />
    </app-page-header>

    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else if (commissions().length === 0) {
      <app-state state="empty" emptyMessage="ยังไม่มีข้อมูลค่าคอมมิชชัน" />
    } @else {
      <div class="card">
        <table class="data-table">
          <thead>
            <tr>
              <th>ประเภท</th>
              <th style="text-align:right">ฐานคำนวณ</th>
              <th style="text-align:right">อัตรา (%)</th>
              <th style="text-align:right">จำนวน</th>
              <th>สถานะ</th>
              <th>วันที่จ่าย</th>
            </tr>
          </thead>
          <tbody>
            @for (c of commissions(); track c.id) {
              <tr>
                <td>{{ typeLabel(c.commissionType) }}</td>
                <td style="text-align:right">{{ c.commissionBase }}</td>
                <td style="text-align:right">{{ c.commissionRate }}</td>
                <td style="text-align:right"><strong>{{ c.commissionAmount }}</strong></td>
                <td><app-status-badge [status]="c.status" /></td>
                <td>{{ c.paidDate ? (c.paidDate | thDate) : '-' }}</td>
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
  `],
})
export class CommissionsListPage implements OnInit {
  private readonly api = inject(JobsApi);
  private readonly exportSvc = inject(ExportService);

  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly commissions = signal<CommissionRecord[]>([]);

  private readonly TYPE_LABELS: Record<string, string> = {
    COMPANY: 'บริษัท', AGENT: 'ตัวแทน', TEAM: 'ทีม', REFERRAL: 'ผู้แนะนำ', OTHER: 'อื่นๆ',
  };

  typeLabel(t: string): string { return this.TYPE_LABELS[t] ?? t; }

  ngOnInit(): void {
    this.api.listAllCommissions().subscribe({
      next: (res) => { this.commissions.set(res.items); this.state.set('none'); },
      error: () => this.state.set('error'),
    });
  }

  export(): void {
    this.exportSvc.download('commissions');
  }
}
