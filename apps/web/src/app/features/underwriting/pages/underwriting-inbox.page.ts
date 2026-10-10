import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import { UnderwritingApi, type UnderwritingInboxItem } from '../data/underwriting.api';

@Component({
  selector: 'app-underwriting-inbox-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AppPageHeaderComponent, AppStateComponent, AppStatusBadgeComponent, ThDatePipe],
  template: `
    <app-page-header title="Underwriting" subtitle="รายการรอตรวจพิจารณาความเสี่ยง" />

    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else if (items().length === 0) {
      <app-state state="empty" emptyMessage="ไม่มีรายการรอตรวจ" />
    } @else {
      <div class="card">
        <table class="data-table">
          <thead>
            <tr>
              <th>งานประกัน</th>
              <th>ลูกค้า</th>
              <th>ผลิตภัณฑ์</th>
              <th>Agent</th>
              <th>รอบที่</th>
              <th>สถานะ</th>
              <th>วันที่ขอ</th>
              <th style="width:120px"></th>
            </tr>
          </thead>
          <tbody>
            @for (item of items(); track item.id) {
              <tr>
                <td><a [routerLink]="['/jobs', item.job.id]" class="job-link">{{ item.job.jobNo }}</a></td>
                <td>{{ item.job.customer.companyName || (item.job.customer.firstName + ' ' + item.job.customer.lastName) }}</td>
                <td>{{ item.job.product.name }}</td>
                <td>{{ item.job.agent.fullName }}</td>
                <td>v{{ item.version }}</td>
                <td><app-status-badge [status]="item.status" context="underwriting" /></td>
                <td>{{ item.requestedAt | thDate }}</td>
                <td>
                  <a [routerLink]="['/jobs', item.job.id]" [queryParams]="{ tab: 'underwriting' }" class="review-link">ไปตรวจ</a>
                </td>
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
    .data-table tr:hover td { background: var(--surface-hover); }
    .job-link { color: var(--primary-color); text-decoration: none; font-size: 0.82rem; }
    .job-link:hover { text-decoration: underline; }
    .review-link { color: var(--primary-color); font-size: 0.82rem; }
  `],
})
export class UnderwritingInboxPage implements OnInit {
  private readonly api = inject(UnderwritingApi);

  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly items = signal<UnderwritingInboxItem[]>([]);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.state.set('loading');
    this.api.getInbox().subscribe({
      next: (items) => { this.items.set(items); this.state.set('none'); },
      error: () => this.state.set('error'),
    });
  }
}
