import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import { ExportService } from '../../../core/api/export.service';
import { JobsApi, type PolicyResponse } from '../../jobs/data/jobs.api';

@Component({
  selector: 'app-policies-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppPageHeaderComponent, AppStateComponent, AppStatusBadgeComponent, ThDatePipe, ButtonModule],
  template: `
    <app-page-header title="กรมธรรม์" subtitle="รายการกรมธรรม์ทั้งหมด">
      <p-button label="Export Excel" icon="pi pi-file-excel" severity="secondary" [outlined]="true" size="small" (onClick)="export()" />
    </app-page-header>

    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else if (policies().length === 0) {
      <app-state state="empty" emptyMessage="ยังไม่มีกรมธรรม์" />
    } @else {
      <div class="card">
        <table class="data-table">
          <thead>
            <tr>
              <th>เลขกรมธรรม์</th>
              <th>สถานะ</th>
              <th style="text-align:right">เบี้ยสุทธิ</th>
              <th style="text-align:right">รวมทั้งสิ้น</th>
              <th>วันเริ่มคุ้มครอง</th>
              <th>วันสิ้นสุด</th>
              <th>ออกเมื่อ</th>
            </tr>
          </thead>
          <tbody>
            @for (p of policies(); track p.id) {
              <tr class="clickable-row" (click)="goToDetail(p.id)">
                <td class="policy-no">{{ p.policyNo }}</td>
                <td><app-status-badge [status]="p.status" /></td>
                <td style="text-align:right">{{ p.netPremium }}</td>
                <td style="text-align:right">{{ p.totalPremium }}</td>
                <td>{{ p.effectiveDate | thDate }}</td>
                <td>{{ p.expiryDate ? (p.expiryDate | thDate) : '-' }}</td>
                <td>{{ p.issuedAt ? (p.issuedAt | thDate) : '-' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [`
    .card { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 8px; padding: 1.25rem; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    .data-table th { text-align: left; padding: 0.5rem 0.75rem; background: var(--surface-ground); border-bottom: 1px solid var(--surface-border); font-size: 0.8rem; color: var(--text-color-secondary); }
    .data-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--surface-border); vertical-align: middle; }
    .clickable-row { cursor: pointer; }
    .clickable-row:hover td { background: var(--surface-hover); }
    .policy-no { font-weight: 600; color: var(--primary-color); }
  `],
})
export class PoliciesListPage implements OnInit {
  private readonly api = inject(JobsApi);
  private readonly router = inject(Router);
  private readonly exportSvc = inject(ExportService);

  readonly state = signal<'loading' | 'error' | 'none'>('none');
  readonly policies = signal<PolicyResponse[]>([]);

  ngOnInit(): void {
    this.state.set('loading');
    this.api.listPolicies().subscribe({
      next: (res) => { this.policies.set(res.data); this.state.set('none'); },
      error: () => this.state.set('error'),
    });
  }

  goToDetail(id: string): void {
    void this.router.navigate(['/policies', id]);
  }

  export(): void {
    this.exportSvc.download('policies');
  }
}
