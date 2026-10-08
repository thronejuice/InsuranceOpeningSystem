import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SlicePipe } from '@angular/common';
import { debounceTime, Subject, takeUntil } from 'rxjs';
import { ExportService } from '../../../core/api/export.service';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { JobsApi, type Quotation } from '../../jobs/data/jobs.api';
import { MasterApi, type InsuranceCompany } from '../../master/data/master.api';
import { UiButton, UiInput, UiSelect } from '../../../shared/ui';

const STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: 'ทั้งหมด', value: '' },
  { label: 'ขอราคา', value: 'REQUESTED' },
  { label: 'ได้รับราคา', value: 'RECEIVED' },
  { label: 'เลือกแล้ว', value: 'SELECTED' },
  { label: 'ปฏิเสธ', value: 'REJECTED' },
  { label: 'หมดอายุ', value: 'EXPIRED' },
  { label: 'ยกเลิก', value: 'CANCELLED' },
];

@Component({
  selector: 'app-quotation-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, UiButton, UiSelect, UiInput, AppPageHeaderComponent, AppStateComponent, AppStatusBadgeComponent, ThDatePipe, SlicePipe, MoneyPipe],
  template: `
    <app-page-header title="ใบเสนอราคาทั้งหมด" subtitle="รายการใบเสนอราคาทุกงาน">
      <ui-button label="Export Excel" icon="pi pi-file-excel" severity="secondary" [outlined]="true" size="small" (onClick)="export()" />
    </app-page-header>

    <!-- Filters -->
    <div class="filter-bar">
      <ui-select
        [(ngModel)]="filterCompanyId"
        [options]="[{ label: 'ทุกบริษัท', value: '' }, ...companyOptions()]"
        optionLabel="label"
        optionValue="value"
        placeholder="เลือกบริษัท"
        style="width:200px"
        (ngModelChange)="onFilterChange()"
      />
      <ui-select
        [(ngModel)]="filterStatus"
        [options]="statusOptions"
        optionLabel="label"
        optionValue="value"
        placeholder="สถานะ"
        style="width:160px"
        (ngModelChange)="onFilterChange()"
      />
      <div class="date-range">
        <span class="filter-label">วันหมดอายุ</span>
        <input uiInput type="date" [(ngModel)]="filterValidFrom" style="width:150px" (ngModelChange)="debouncedLoad()" />
        <span>ถึง</span>
        <input uiInput type="date" [(ngModel)]="filterValidTo" style="width:150px" (ngModelChange)="debouncedLoad()" />
      </div>
      <ui-button label="ล้างตัวกรอง" icon="pi pi-times" severity="secondary" [outlined]="true" size="small" (onClick)="clearFilters()" />
    </div>

    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else if (quotations().length === 0) {
      <app-state state="empty" emptyMessage="ไม่พบรายการใบเสนอราคา" />
    } @else {
      <table class="data-table">
        <thead>
          <tr>
            <th>เลขที่ใบเสนอ</th>
            <th>งาน</th>
            <th>บริษัทประกัน</th>
            <th>สถานะ</th>
            <th style="text-align:right">เบี้ยสุทธิ</th>
            <th style="text-align:right">รวมทั้งสิ้น</th>
            <th>วันหมดอายุ</th>
            <th>วันที่สร้าง</th>
          </tr>
        </thead>
        <tbody>
          @for (q of quotations(); track q.id) {
            <tr>
              <td>{{ q.quotationNo }}</td>
              <td>
                @if (q.jobNo) {
                  <a [routerLink]="['/jobs', q.jobId]">{{ q.jobNo }}</a>
                } @else {
                  {{ q.jobId | slice:0:8 }}…
                }
              </td>
              <td>{{ q.insuranceCompanyName }}</td>
              <td><app-status-badge [status]="q.status" /></td>
              <td style="text-align:right">{{ q.netPremium | money }}</td>
              <td style="text-align:right">{{ q.totalAmount | money }}</td>
              <td>{{ q.validUntil ? (q.validUntil | thDate) : '-' }}</td>
              <td>{{ q.createdAt | thDate }}</td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: [`
    .filter-bar { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
    .filter-label { font-size: 0.875rem; color: var(--text-color-secondary); white-space: nowrap; }
    .date-range { display: flex; align-items: center; gap: 0.5rem; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    .data-table th { text-align: left; padding: 0.5rem 0.75rem; background: var(--surface-ground); border-bottom: 1px solid var(--surface-border); font-size: 0.8rem; color: var(--text-color-secondary); }
    .data-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--surface-border); vertical-align: middle; }
    .data-table tr:hover td { background: var(--surface-hover); }
    a { color: var(--primary-color); text-decoration: none; }
    a:hover { text-decoration: underline; }
  `],
})
export class QuotationListPage implements OnInit, OnDestroy {
  private readonly api = inject(JobsApi);
  private readonly masterApi = inject(MasterApi);
  private readonly exportSvc = inject(ExportService);
  private readonly destroy$ = new Subject<void>();
  private readonly filterChange$ = new Subject<void>();

  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly quotations = signal<Quotation[]>([]);
  readonly companyOptions = signal<{ label: string; value: string }[]>([]);
  readonly statusOptions = STATUS_OPTIONS;

  filterCompanyId = '';
  filterStatus = '';
  filterValidFrom = '';
  filterValidTo = '';

  ngOnInit(): void {
    this.filterChange$.pipe(debounceTime(300), takeUntil(this.destroy$)).subscribe(() => this.load());
    this.masterApi.listCompanies().subscribe({
      next: (r) => this.companyOptions.set(r.data.map((c: InsuranceCompany) => ({ label: c.name, value: c.id }))),
    });
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onFilterChange(): void { this.load(); }

  debouncedLoad(): void { this.filterChange$.next(); }

  clearFilters(): void {
    this.filterCompanyId = '';
    this.filterStatus = '';
    this.filterValidFrom = '';
    this.filterValidTo = '';
    this.load();
  }

  export(): void {
    this.exportSvc.download('quotations', {
      insuranceCompanyId: this.filterCompanyId,
      status: this.filterStatus,
      validUntilFrom: this.filterValidFrom,
      validUntilTo: this.filterValidTo,
    });
  }

  private load(): void {
    this.state.set('loading');
    this.api.listAllQuotations({
      insuranceCompanyId: this.filterCompanyId || undefined,
      status: this.filterStatus || undefined,
      validUntilFrom: this.filterValidFrom || undefined,
      validUntilTo: this.filterValidTo || undefined,
    }).subscribe({
      next: (list) => { this.quotations.set(list); this.state.set('none'); },
      error: () => this.state.set('error'),
    });
  }
}
