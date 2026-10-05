import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import { ExportService } from '../../../core/api/export.service';
import { JobsApi, type RenewalRecord } from '../../jobs/data/jobs.api';
import { UiButton } from '../../../shared/ui';

@Component({
  selector: 'app-renewals-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppPageHeaderComponent, AppStateComponent, AppStatusBadgeComponent, ThDatePipe, SlicePipe, UiButton],
  template: `
    <app-page-header title="ต่ออายุประกัน" subtitle="รายการต่ออายุกรมธรรม์ทั้งหมด">
      <ui-button label="Export Excel" icon="pi pi-file-excel" severity="secondary" [outlined]="true" size="small" (onClick)="export()" />
    </app-page-header>

    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else if (renewals().length === 0) {
      <app-state state="empty" emptyMessage="ยังไม่มีรายการต่ออายุ" />
    } @else {
      <div class="card">
        <table class="data-table">
          <thead>
            <tr>
              <th>กรมธรรม์เดิม</th>
              <th>งานใหม่</th>
              <th>วันต่ออายุ</th>
              <th>วันหมดอายุเป้าหมาย</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            @for (r of renewals(); track r.id) {
              <tr>
                <td>{{ r.previousPolicyId | slice: 0 : 8 }}…</td>
                <td>{{ r.newJobId ? (r.newJobId | slice: 0 : 8) + '…' : '-' }}</td>
                <td>{{ r.renewalDate | thDate }}</td>
                <td>{{ r.targetExpiryDate | thDate }}</td>
                <td><app-status-badge [status]="r.status" /></td>
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
export class RenewalsListPage implements OnInit {
  private readonly api = inject(JobsApi);
  private readonly exportSvc = inject(ExportService);

  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly renewals = signal<RenewalRecord[]>([]);

  ngOnInit(): void {
    this.api.listRenewals().subscribe({
      next: (res) => { this.renewals.set(res.items); this.state.set('none'); },
      error: () => this.state.set('error'),
    });
  }

  export(): void {
    this.exportSvc.download('renewals');
  }
}
