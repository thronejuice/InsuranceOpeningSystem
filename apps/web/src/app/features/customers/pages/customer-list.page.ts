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
import { CustomersApi, type Customer, type CustomerQuery, type PaginationMeta } from '../data/customers.api';
import { ConfirmationService, MessageService, TableLazyLoadEvent, UiButton, UiConfirmDialog, UiIconField, UiInput, UiSelect, UiSortIcon, UiSortableColumn, UiTable } from '../../../shared/ui';
import { MatTooltip } from '@angular/material/tooltip';

const TYPE_OPTIONS = [
  { label: 'ทั้งหมด', value: '' },
  { label: 'บุคคลธรรมดา', value: 'INDIVIDUAL' },
  { label: 'นิติบุคคล', value: 'CORPORATE' },
];

const STATUS_OPTIONS = [
  { label: 'ทั้งหมด', value: '' },
  { label: 'ใช้งาน', value: 'ACTIVE' },
  { label: 'ไม่ใช้งาน', value: 'INACTIVE' },
];

@Component({
  selector: 'app-customer-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService],
  imports: [MatTooltip, RouterLink, FormsModule, UiTable, UiSortIcon, UiSortableColumn, UiButton, UiInput, UiSelect, UiIconField, UiConfirmDialog, AppPageHeaderComponent, AppStateComponent, AppStatusBadgeComponent, HasPermissionDirective, ThDatePipe],
  template: `
    <ui-confirm-dialog />

    <app-page-header title="ลูกค้า" subtitle="จัดการข้อมูลลูกค้าทั้งหมด">
      <ui-button
        *appHasPermission="'customer.create'"
        label="เพิ่มลูกค้า"
        icon="pi pi-plus"
        link="/customers/create"
      />
    </app-page-header>

    <div class="filter-bar">
      <ui-iconfield>
        <i class="pi pi-search" style="position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);color:var(--text-color-secondary)"></i>
        <input
          uiInput
          [(ngModel)]="searchText"
          (ngModelChange)="onSearchChange($event)"
          placeholder="ค้นหารหัส, ชื่อ, บริษัท, เบอร์, อีเมล..."
          style="padding-left:2.25rem;width:320px"
        />
      </ui-iconfield>

      <ui-select
        [(ngModel)]="filterType"
        [options]="typeOptions"
        optionLabel="label"
        optionValue="value"
        (ngModelChange)="onFilterChange()"
        placeholder="ประเภทลูกค้า"
        style="width:180px"
      />

      <ui-select
        [(ngModel)]="filterStatus"
        [options]="statusOptions"
        optionLabel="label"
        optionValue="value"
        (ngModelChange)="onFilterChange()"
        placeholder="สถานะ"
        style="width:150px"
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
        [value]="customers()"
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
            <th [uiSortableColumn]="'customerCode'" style="width:140px">รหัสลูกค้า <ui-sort-icon field="customerCode" /></th>
            <th>ชื่อ / บริษัท</th>
            <th style="width:130px">ประเภท</th>
            <th style="width:120px">สถานะ</th>
            <th style="width:130px">วันที่สร้าง</th>
            <th style="width:100px"></th>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="6" style="text-align:center;padding:2rem;color:var(--text-color-secondary)">ไม่พบข้อมูลลูกค้า</td>
          </tr>
        </ng-template>
        <ng-template #body let-customer>
          <tr>
            <td>
              <a [routerLink]="['/customers', customer.id]" class="code-link">
                {{ customer.customerCode }}
              </a>
            </td>
            <td>
              <div>{{ displayName(customer) }}</div>
              @if (customer.email) {
                <div class="sub-text">{{ customer.email }}</div>
              }
            </td>
            <td>
              {{ customer.customerType === 'INDIVIDUAL' ? 'บุคคลธรรมดา' : 'นิติบุคคล' }}
            </td>
            <td>
              <app-status-badge [status]="customer.status" />
            </td>
            <td>{{ customer.createdAt | thDate }}</td>
            <td>
              <div class="action-buttons">
                <ui-button
                  icon="pi pi-eye"
                  severity="secondary"
                  [text]="true"
                  size="small"
                  [link]="['/customers', customer.id]"
                  matTooltip="ดูข้อมูล"
                />
                <ui-button
                  *appHasPermission="'customer.update'"
                  icon="pi pi-pencil"
                  severity="secondary"
                  [text]="true"
                  size="small"
                  [link]="['/customers', customer.id, 'edit']"
                  matTooltip="แก้ไข"
                />
                <ui-button
                  *appHasPermission="'customer.delete'"
                  icon="pi pi-trash"
                  severity="danger"
                  [text]="true"
                  size="small"
                  (onClick)="confirmDelete(customer)"
                  matTooltip="ลบ"
                />
              </div>
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
    .action-buttons { display: flex; gap: 0.25rem; }
  `],
})
export class CustomerListPage implements OnInit, OnDestroy {
  private readonly api = inject(CustomersApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmationService);
  private readonly toast = inject(MessageService);
  private readonly destroy$ = new Subject<void>();
  private readonly searchSubject = new Subject<string>();

  readonly typeOptions = TYPE_OPTIONS;
  readonly statusOptions = STATUS_OPTIONS;

  readonly customers = signal<Customer[]>([]);
  readonly meta = signal<PaginationMeta | null>(null);
  readonly state = signal<'loading' | 'empty' | 'error' | 'none'>('loading');
  readonly tableLoading = signal(false);

  searchText = '';
  filterType = '';
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
      this.filterType = (params['customerType'] as string) ?? '';
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
    this.filterType = '';
    this.filterStatus = '';
    this.currentPage = 1;
    this.applyFiltersToUrl();
  }

  hasActiveFilters(): boolean {
    return !!(this.searchText || this.filterType || this.filterStatus);
  }

  displayName(c: Customer): string {
    if (c.customerType === 'INDIVIDUAL') {
      return [c.firstName, c.lastName].filter(Boolean).join(' ') || '-';
    }
    return c.companyName || '-';
  }

  confirmDelete(customer: Customer): void {
    this.confirm.confirm({
      message: `ต้องการลบลูกค้า "${this.displayName(customer)}" ใช่หรือไม่?`,
      header: 'ยืนยันการลบ',
      icon: 'pi pi-exclamation-triangle',
      accept: () => this.deleteCustomer(customer),
    });
  }

  private deleteCustomer(customer: Customer): void {
    this.api.remove(customer.id).subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'ลบสำเร็จ', detail: 'ลบข้อมูลลูกค้าแล้ว' });
        this.loadData();
      },
      error: () => {
        this.toast.add({ severity: 'error', summary: 'ผิดพลาด', detail: 'ไม่สามารถลบได้' });
      },
    });
  }

  private applyFiltersToUrl(): void {
    const queryParams: Record<string, string | number> = {};
    if (this.searchText) queryParams['q'] = this.searchText;
    if (this.filterType) queryParams['customerType'] = this.filterType;
    if (this.filterStatus) queryParams['status'] = this.filterStatus;
    if (this.currentPage > 1) queryParams['page'] = this.currentPage;
    if (this.perPage !== 20) queryParams['perPage'] = this.perPage;
    if (this.sort !== '-createdAt') queryParams['sort'] = this.sort;
    void this.router.navigate([], { queryParams, replaceUrl: true });
  }

  private loadData(): void {
    if (this.state() !== 'none') this.state.set('loading');
    this.tableLoading.set(true);

    const query: CustomerQuery = {
      page: this.currentPage,
      perPage: this.perPage,
      sort: this.sort,
    };
    if (this.searchText) query.q = this.searchText;
    if (this.filterType) query.customerType = this.filterType as 'INDIVIDUAL' | 'CORPORATE';
    if (this.filterStatus) query.status = this.filterStatus as 'ACTIVE' | 'INACTIVE';

    this.api.list(query).subscribe({
      next: (res) => {
        this.customers.set(res.data);
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
}
