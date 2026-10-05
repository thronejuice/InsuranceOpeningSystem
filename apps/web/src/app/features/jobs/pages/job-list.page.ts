import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { debounceTime, Subject, takeUntil } from 'rxjs';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import { JobsApi, type Job, type JobQuery, type PaginationMeta, type JobStatus } from '../data/jobs.api';
import { ExportService } from '../../../core/api/export.service';
import { TableLazyLoadEvent, UiButton, UiIconField, UiInput, UiSelect, UiSortIcon, UiSortableColumn, UiTable } from '../../../shared/ui';
import { MatTooltip } from '@angular/material/tooltip';

const STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: 'ทั้งหมด', value: '' },
  { label: 'ร่าง', value: 'DRAFT' },
  { label: 'เปิด', value: 'OPEN' },
  { label: 'รอข้อมูล', value: 'WAITING_INFORMATION' },
  { label: 'ขอราคาแล้ว', value: 'QUOTATION_REQUESTED' },
  { label: 'ได้รับราคา', value: 'QUOTATION_RECEIVED' },
  { label: 'เลือกราคาแล้ว', value: 'QUOTATION_SELECTED' },
  { label: 'ส่งใบเสนอแล้ว', value: 'PROPOSAL_SENT' },
  { label: 'รอลูกค้า', value: 'WAITING_CUSTOMER' },
  { label: 'ลูกค้ายอมรับ', value: 'CUSTOMER_ACCEPTED' },
  { label: 'ลูกค้าปฏิเสธ', value: 'CUSTOMER_REJECTED' },
  { label: 'รออนุมัติ', value: 'WAITING_APPROVAL' },
  { label: 'อนุมัติแล้ว', value: 'APPROVED' },
  { label: 'ออกกรมธรรม์', value: 'BINDING' },
  { label: 'รอออกกรมธรรม์', value: 'POLICY_PENDING' },
  { label: 'ออกกรมธรรม์แล้ว', value: 'POLICY_ISSUED' },
  { label: 'ยกเลิก', value: 'CANCELLED' },
  { label: 'ปิด', value: 'CLOSED' },
];

@Component({
  selector: 'app-job-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTooltip, RouterLink, FormsModule, UiTable, UiSortIcon, UiSortableColumn, UiButton, UiInput, UiSelect, UiIconField, AppPageHeaderComponent, AppStateComponent, AppStatusBadgeComponent, HasPermissionDirective, ThDatePipe],
  template: `
    <app-page-header title="งานประกัน" subtitle="จัดการงานประกันทั้งหมด">
      <ui-button
        label="Export Excel"
        icon="pi pi-file-excel"
        severity="secondary"
        [outlined]="true"
        size="small"
        (onClick)="export()"
      />
      <ui-button
        *appHasPermission="'job.create'"
        label="สร้างงาน"
        icon="pi pi-plus"
        link="/jobs/create"
      />
    </app-page-header>

    <div class="filter-bar">
      <ui-iconfield>
        <i class="pi pi-search" style="position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);color:var(--text-color-secondary)"></i>
        <input
          uiInput
          [(ngModel)]="searchText"
          (ngModelChange)="onSearchChange($event)"
          placeholder="ค้นหาเลขงาน, ชื่อลูกค้า..."
          style="padding-left:2.25rem;width:280px"
        />
      </ui-iconfield>

      <ui-select
        [(ngModel)]="filterStatus"
        [options]="statusOptions"
        optionLabel="label"
        optionValue="value"
        (ngModelChange)="onFilterChange()"
        placeholder="สถานะ"
        style="width:200px"
      />

      @if (hasActiveFilters()) {
        <ui-button
          label="ล้างตัวกรอง"
          icon="pi pi-times"
          severity="secondary"
          [text]="true"
          (onClick)="clearFilters()"
        />
      }
    </div>

    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else {
      <ui-table
        [value]="jobs()"
        [lazy]="true"
        [paginator]="true"
        [rows]="perPage"
        [totalRecords]="meta()?.total ?? 0"
        [rowsPerPageOptions]="[20, 50, 100]"
        [loading]="tableLoading()"
        [showCurrentPageReport]="true"
        currentPageReportTemplate="แสดง {first}–{last} จากทั้งหมด {totalRecords} รายการ"
        (onLazyLoad)="onLazyLoad($event)"
        styleClass="p-datatable-sm p-datatable-striped"
      >
        <ng-template #header>
          <tr>
            <th [uiSortableColumn]="'jobNo'" style="width:140px">เลขงาน <ui-sort-icon field="jobNo" /></th>
            <th>ลูกค้า</th>
            <th>ประเภท / ผลิตภัณฑ์</th>
            <th style="width:160px">สถานะ</th>
            <th [uiSortableColumn]="'effectiveDate'" style="width:130px">วันเริ่มคุ้มครอง <ui-sort-icon field="effectiveDate" /></th>
            <th style="width:130px">ผู้รับผิดชอบ</th>
            <th [uiSortableColumn]="'createdAt'" style="width:130px">วันที่สร้าง <ui-sort-icon field="createdAt" /></th>
            <th style="width:80px"></th>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="8" style="text-align:center;padding:2rem;color:var(--text-color-secondary)">ไม่พบข้อมูลงานประกัน</td>
          </tr>
        </ng-template>
        <ng-template #body let-job>
          <tr>
            <td>
              <a [routerLink]="['/jobs', job.id]" class="code-link">
                {{ job.jobNo }}
              </a>
            </td>
            <td>
              <div>{{ job.customerName }}</div>
              <div class="sub-text">{{ job.customerCode }}</div>
            </td>
            <td>
              <div>{{ job.insuranceTypeName }}</div>
              <div class="sub-text">{{ job.productName }}</div>
            </td>
            <td>
              <app-status-badge [status]="job.status" />
            </td>
            <td>{{ job.effectiveDate | thDate }}</td>
            <td>{{ job.agentName }}</td>
            <td>{{ job.createdAt | thDate }}</td>
            <td>
              <ui-button
                icon="pi pi-eye"
                severity="secondary"
                [text]="true"
                size="small"
                [link]="['/jobs', job.id]"
                matTooltip="ดูข้อมูล"
              />
            </td>
          </tr>
        </ng-template>
      </ui-table>
    }
  `,
  styles: [`
    .filter-bar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }
    .code-link {
      color: var(--primary-color);
      text-decoration: none;
      font-weight: 500;
    }
    .code-link:hover { text-decoration: underline; }
    .sub-text { font-size: 0.8rem; color: var(--text-color-secondary); }
  `],
})
export class JobListPage implements OnInit, OnDestroy {
  private readonly api = inject(JobsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly exportSvc = inject(ExportService);
  private readonly destroy$ = new Subject<void>();
  private readonly searchSubject = new Subject<string>();

  readonly statusOptions = STATUS_OPTIONS;

  readonly jobs = signal<Job[]>([]);
  readonly meta = signal<PaginationMeta | null>(null);
  readonly state = signal<'loading' | 'empty' | 'error' | 'none'>('loading');
  readonly tableLoading = signal(false);

  searchText = '';
  filterStatus = '';
  currentPage = 1;
  perPage = 20;
  sort = '-createdAt';

  ngOnInit(): void {
    this.searchSubject.pipe(debounceTime(300), takeUntil(this.destroy$)).subscribe(() => {
      this.currentPage = 1;
      this.applyFiltersToUrl();
    });

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.searchText = (params['q'] as string) ?? '';
      this.filterStatus = (params['status'] as string) ?? '';
      this.currentPage = params['page'] ? Number(params['page']) : 1;
      this.perPage = params['perPage'] ? Number(params['perPage']) : 20;
      this.sort = (params['sort'] as string) ?? '-createdAt';
      this.loadData();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchChange(value: string): void {
    this.searchSubject.next(value);
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.applyFiltersToUrl();
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? this.perPage;
    const first = event.first ?? 0;
    this.currentPage = Math.floor(first / rows) + 1;
    this.perPage = rows;
    if (event.sortField) {
      const dir = event.sortOrder === -1 ? '-' : '';
      this.sort = `${dir}${event.sortField as string}`;
    }
    this.applyFiltersToUrl();
  }

  clearFilters(): void {
    this.searchText = '';
    this.filterStatus = '';
    this.currentPage = 1;
    this.applyFiltersToUrl();
  }

  hasActiveFilters(): boolean {
    return !!(this.searchText || this.filterStatus);
  }

  private applyFiltersToUrl(): void {
    const queryParams: Record<string, string | number> = {};
    if (this.searchText) queryParams['q'] = this.searchText;
    if (this.filterStatus) queryParams['status'] = this.filterStatus;
    if (this.currentPage > 1) queryParams['page'] = this.currentPage;
    if (this.perPage !== 20) queryParams['perPage'] = this.perPage;
    if (this.sort !== '-createdAt') queryParams['sort'] = this.sort;
    void this.router.navigate([], { queryParams, replaceUrl: true });
  }

  private loadData(): void {
    if (this.state() !== 'none') this.state.set('loading');
    this.tableLoading.set(true);

    const query: JobQuery = {
      page: this.currentPage,
      perPage: this.perPage,
      sort: this.sort,
    };
    if (this.searchText) query.q = this.searchText;
    if (this.filterStatus) query.status = this.filterStatus as JobStatus;

    this.api.list(query).subscribe({
      next: (res) => {
        this.jobs.set(res.data);
        this.meta.set(res.meta);
        this.state.set('none');
        this.tableLoading.set(false);
      },
      error: () => {
        this.state.set('error');
        this.tableLoading.set(false);
      },
    });
  }

  export(): void {
    this.exportSvc.download('jobs', {
      status: this.filterStatus,
      q: this.searchText,
    });
  }
}
