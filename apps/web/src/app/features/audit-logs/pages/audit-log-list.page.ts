import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JsonPipe } from '@angular/common';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import { AuditLogsApi, type AuditLogItem, type AuditLogQuery, type PaginationMeta } from '../data/audit-logs.api';
import { UsersApi, type User } from '../../users/data/users.api';
import { TableLazyLoadEvent, UiButton, UiDatepicker, UiDialog, UiInput, UiSelect, UiTable } from '../../../shared/ui';
import { MatTooltip } from '@angular/material/tooltip';

export interface DiffRow {
  key: string;
  before: string;
  after: string;
  status: 'changed' | 'added' | 'removed';
}

const ACTION_OPTIONS = [
  { label: 'ทุกการกระทำ', value: '' },
  { label: 'สร้าง (CREATE)', value: 'CREATE' },
  { label: 'แก้ไข (UPDATE)', value: 'UPDATE' },
  { label: 'ลบ (DELETE)', value: 'DELETE' },
  { label: 'เปลี่ยนสถานะ (STATUS_CHANGE)', value: 'STATUS_CHANGE' },
  { label: 'มอบหมายงาน (ASSIGN)', value: 'ASSIGN' },
  { label: 'เข้าสู่ระบบ (LOGIN)', value: 'LOGIN' },
  { label: 'ออกจากระบบ (LOGOUT)', value: 'LOGOUT' },
  { label: 'นำเข้าข้อมูล (IMPORT)', value: 'IMPORT' },
  { label: 'ส่งออกข้อมูล (EXPORT)', value: 'EXPORT' },
  { label: 'ระบบอัตโนมัติ (SYSTEM)', value: 'SYSTEM' },
];

const ENTITY_OPTIONS = [
  { label: 'ทุกประเภทข้อมูล', value: '' },
  { label: 'งาน (Job)', value: 'Job' },
  { label: 'ลูกค้า (Customer)', value: 'Customer' },
  { label: 'ใบเสนอราคา (Quotation)', value: 'Quotation' },
  { label: 'กรมธรรม์ (Policy)', value: 'Policy' },
  { label: 'การชำระเงิน (Payment)', value: 'Payment' },
  { label: 'คอมมิชชั่น (Commission)', value: 'Commission' },
  { label: 'ผู้ใช้งาน (User)', value: 'User' },
  { label: 'สาขา (Branch)', value: 'Branch' },
];

@Component({
  selector: 'app-audit-log-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    JsonPipe,
    MatTooltip,
    UiTable,
    UiButton,
    UiInput,
    UiSelect,
    UiDatepicker,
    UiDialog,
    AppPageHeaderComponent,
    AppStateComponent,
    ThDatePipe,
  ],
  template: `
    <app-page-header title="บันทึกประวัติ (Audit Logs)" subtitle="ตรวจสอบประวัติการทำรายการและการเปลี่ยนแปลงข้อมูลในระบบ" />

    <!-- Filters Section -->
    <div class="filter-card">
      <div class="filter-grid">
        <div class="filter-item">
          <label class="filter-label">ผู้ทำรายการ</label>
          <ui-select
            [(ngModel)]="filterUserId"
            [options]="userOptions()"
            optionLabel="fullName"
            optionValue="id"
            placeholder="เลือกผู้ใช้งาน"
            [showClear]="true"
            class="w-full"
            (onChange)="onFilterChange()"
          />
        </div>

        <div class="filter-item">
          <label class="filter-label">ประเภทข้อมูล</label>
          <ui-select
            [(ngModel)]="filterEntityType"
            [options]="entityOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="เลือกประเภทข้อมูล"
            class="w-full"
            (onChange)="onFilterChange()"
          />
        </div>

        <div class="filter-item">
          <label class="filter-label">การกระทำ</label>
          <ui-select
            [(ngModel)]="filterAction"
            [options]="actionOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="เลือกการกระทำ"
            class="w-full"
            (onChange)="onFilterChange()"
          />
        </div>

        <div class="filter-item">
          <label class="filter-label">รหัสอ้างอิง (Entity ID)</label>
          <input
            uiInput
            [(ngModel)]="filterEntityId"
            (change)="onFilterChange()"
            placeholder="ระบุ Entity ID..."
            class="w-full"
          />
        </div>

        <div class="filter-item">
          <label class="filter-label">ตั้งแต่วันที่</label>
          <ui-datepicker
            [(ngModel)]="startDate"
            placeholder="วว/ดด/ปปปป"
            class="w-full"
            (onChange)="onFilterChange()"
          />
        </div>

        <div class="filter-item">
          <label class="filter-label">ถึงวันที่</label>
          <ui-datepicker
            [(ngModel)]="endDate"
            placeholder="วว/ดด/ปปปป"
            class="w-full"
            (onChange)="onFilterChange()"
          />
        </div>
      </div>

      <div class="filter-actions">
        @if (hasActiveFilters()) {
          <ui-button
            label="ล้างตัวกรอง"
            icon="pi pi-times"
            severity="secondary"
            [text]="true"
            (onClick)="clearFilters()"
          />
        }
        <ui-button
          label="ค้นหา"
          icon="pi pi-search"
          (onClick)="onFilterChange()"
        />
      </div>
    </div>

    <!-- Data Table -->
    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else {
      <ui-table
        [value]="logs()"
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
            <th style="width:160px">วัน-เวลา</th>
            <th style="width:150px">ผู้ทำรายการ</th>
            <th style="width:130px">การกระทำ</th>
            <th style="width:160px">ข้อมูลเป้าหมาย</th>
            <th style="width:90px">ช่องทาง</th>
            <th>หมายเหตุ / รายละเอียด</th>
            <th style="width:90px;text-align:center">การเปลี่ยนแปลง</th>
          </tr>
        </ng-template>

        <ng-template #body let-log>
          <tr>
            <td>
              <div class="text-strong">{{ log.createdAt | thDate }}</div>
            </td>
            <td>
              @if (log.user) {
                <div class="text-strong">{{ log.user.fullName }}</div>
                <div class="sub-text">&#64;{{ log.user.username }}</div>
              } @else {
                <span class="badge-system">ระบบ (System)</span>
              }
            </td>
            <td>
              <span class="badge-action" [class]="getActionClass(log.action)">
                {{ log.action }}
              </span>
            </td>
            <td>
              <div class="text-strong">{{ log.entityType }}</div>
              <div class="sub-text text-truncate" [matTooltip]="log.entityId">
                {{ log.entityId }}
              </div>
            </td>
            <td>
              <span class="badge-source" [class]="getSourceClass(log.source)">
                {{ log.source || 'WEB' }}
              </span>
            </td>
            <td>
              <div>{{ log.remark || log.description || '-' }}</div>
            </td>
            <td style="text-align:center">
              <ui-button
                icon="pi pi-file-edit"
                [text]="true"
                size="small"
                severity="primary"
                (onClick)="openDiffModal(log)"
                matTooltip="ดูรายละเอียด / เปรียบเทียบ"
              />
            </td>
          </tr>
        </ng-template>

        <ng-template #emptymessage>
          <tr>
            <td colspan="7" style="text-align:center;padding:2.5rem;color:var(--text-color-secondary)">
              ไม่พบประวัติการทำรายการตามเงื่อนไขที่เลือก
            </td>
          </tr>
        </ng-template>
      </ui-table>
    }

    <!-- Diff Dialog -->
    <ui-dialog
      [(visible)]="diffModalVisible"
      header="รายละเอียดการบันทึกประวัติ (Audit Diff)"
      icon="pi pi-history"
      [modal]="true"
      [style]="{ width: '760px', maxWidth: '95vw' }"
    >
      @if (selectedLog(); as log) {
        <div class="modal-content">
          <!-- Summary Info Box -->
          <div class="summary-box">
            <div class="summary-grid">
              <div>
                <span class="info-label">วัน-เวลา:</span>
                <span class="info-value">{{ log.createdAt | thDate }}</span>
              </div>
              <div>
                <span class="info-label">ผู้ทำรายการ:</span>
                <span class="info-value">{{ log.user?.fullName || 'ระบบ' }}</span>
              </div>
              <div>
                <span class="info-label">การกระทำ:</span>
                <span class="badge-action" [class]="getActionClass(log.action)">{{ log.action }}</span>
              </div>
              <div>
                <span class="info-label">เป้าหมาย:</span>
                <span class="info-value">{{ log.entityType }} ({{ log.entityId }})</span>
              </div>
              <div>
                <span class="info-label">ช่องทาง (Source):</span>
                <span class="badge-source" [class]="getSourceClass(log.source)">{{ log.source || 'WEB' }}</span>
              </div>
              @if (log.ipAddress) {
                <div>
                  <span class="info-label">IP Address:</span>
                  <span class="info-value">{{ log.ipAddress }}</span>
                </div>
              }
            </div>
            @if (log.remark || log.description) {
              <div class="summary-remark">
                <span class="info-label">หมายเหตุ:</span>
                <span class="info-value">{{ log.remark || log.description }}</span>
              </div>
            }
          </div>

          <!-- Diff Table -->
          <div class="diff-section">
            <div class="section-title">
              <i class="pi pi-sliders-h"></i>
              การเปรียบเทียบข้อมูลก่อนและหลังเปลี่ยนแปลง
            </div>

            @if (diffRows().length > 0) {
              <div class="diff-table-container">
                <table class="diff-table">
                  <thead>
                    <tr>
                      <th style="width:25%">ฟิลด์ (Field)</th>
                      <th style="width:37.5%">ก่อนหน้า (Before)</th>
                      <th style="width:37.5%">ปัจจุบัน (After)</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of diffRows(); track row.key) {
                      <tr [class]="'row-' + row.status">
                        <td class="font-mono text-strong">{{ row.key }}</td>
                        <td class="diff-cell before-cell">
                          {{ row.before }}
                        </td>
                        <td class="diff-cell after-cell">
                          {{ row.after }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <div class="empty-diff">
                @if (log.oldValue && !log.newValue) {
                  <span>รายการถูกลบ (DELETE) — ไม่พบข้อมูลหลังทำรายการ</span>
                } @else if (!log.oldValue && log.newValue) {
                  <span>รายการถูกสร้างใหม่ (CREATE) — ไม่มีข้อมูลก่อนหน้า</span>
                } @else {
                  <span>ไม่มีข้อมูลเปรียบเทียบเชิงฟิลด์ในรายการนี้</span>
                }
              </div>
            }
          </div>

          <!-- Raw JSON View Toggle -->
          <div class="raw-json-section">
            <ui-button
              [label]="showRawJson() ? 'ซ่อน JSON แบบละเอียด' : 'แสดง JSON แบบละเอียด'"
              [icon]="showRawJson() ? 'pi pi-chevron-up' : 'pi pi-code'"
              [text]="true"
              size="small"
              (onClick)="showRawJson.set(!showRawJson())"
            />
            @if (showRawJson()) {
              <div class="json-container">
                <div class="json-column">
                  <div class="json-header">Old Value</div>
                  <pre class="json-pre">{{ log.oldValue | json }}</pre>
                </div>
                <div class="json-column">
                  <div class="json-header">New Value</div>
                  <pre class="json-pre">{{ log.newValue | json }}</pre>
                </div>
              </div>
            }
          </div>

          <div class="dialog-footer">
            <ui-button label="ปิด" icon="pi pi-times" (onClick)="diffModalVisible = false" />
          </div>
        </div>
      }
    </ui-dialog>
  `,
  styles: [`
    .filter-card {
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: var(--radius-md);
      padding: 1.25rem;
      margin-bottom: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .filter-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1rem;
      align-items: flex-end;
    }
    .filter-item {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .filter-label {
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--text-color-secondary);
    }
    .filter-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      align-items: center;
    }
    .text-strong {
      font-weight: 500;
      color: var(--text-color);
    }
    .sub-text {
      font-size: 0.78rem;
      color: var(--text-color-secondary);
    }
    .text-truncate {
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .font-mono {
      font-family: monospace;
      font-size: 0.85rem;
    }
    .badge-system {
      display: inline-block;
      padding: 0.15rem 0.45rem;
      font-size: 0.75rem;
      background: var(--surface-200);
      color: var(--text-color-secondary);
      border-radius: 4px;
    }
    .badge-action {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .action-create { background: #dcfce7; color: #15803d; }
    .action-update { background: #dbeafe; color: #1d4ed8; }
    .action-delete { background: #fee2e2; color: #b91c1c; }
    .action-status { background: #fef3c7; color: #b45309; }
    .action-assign { background: #ede9fe; color: #6d28d9; }
    .action-default { background: var(--surface-200); color: var(--text-color); }

    .badge-source {
      display: inline-block;
      padding: 0.12rem 0.4rem;
      border-radius: 3px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.05em;
    }
    .source-web { background: #eff6ff; color: #2563eb; }
    .source-api { background: #f5f3ff; color: #7c3aed; }
    .source-job { background: #fff7ed; color: #ea580c; }
    .source-import { background: #f0fdf4; color: #16a34a; }

    .modal-content {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      padding-top: 0.5rem;
    }
    .summary-box {
      background: var(--surface-ground);
      border: 1px solid var(--surface-border);
      border-radius: var(--radius-md);
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 0.75rem;
      font-size: 0.85rem;
    }
    .summary-remark {
      border-top: 1px dashed var(--surface-border);
      padding-top: 0.5rem;
      margin-top: 0.25rem;
      font-size: 0.85rem;
    }
    .info-label {
      color: var(--text-color-secondary);
      font-weight: 500;
      margin-right: 0.4rem;
    }
    .info-value {
      font-weight: 600;
    }
    .diff-section {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .section-title {
      font-size: 0.9rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--text-color);
    }
    .diff-table-container {
      border: 1px solid var(--surface-border);
      border-radius: var(--radius-md);
      overflow: hidden;
      max-height: 260px;
      overflow-y: auto;
    }
    .diff-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    .diff-table th {
      background: var(--surface-100);
      padding: 0.5rem 0.75rem;
      text-align: left;
      font-weight: 600;
      border-bottom: 1px solid var(--surface-border);
    }
    .diff-table td {
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid var(--surface-border);
      vertical-align: top;
      word-break: break-word;
    }
    .diff-cell {
      font-family: monospace;
      font-size: 0.82rem;
    }
    .before-cell {
      color: #b91c1c;
      background: #fef2f2;
    }
    .after-cell {
      color: #15803d;
      background: #f0fdf4;
    }
    .empty-diff {
      padding: 1.5rem;
      text-align: center;
      background: var(--surface-ground);
      border: 1px dashed var(--surface-border);
      border-radius: var(--radius-md);
      color: var(--text-color-secondary);
      font-size: 0.875rem;
    }
    .raw-json-section {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .json-container {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
    .json-column {
      background: var(--surface-ground);
      border: 1px solid var(--surface-border);
      border-radius: var(--radius-md);
      padding: 0.5rem;
    }
    .json-header {
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--text-color-secondary);
      margin-bottom: 0.25rem;
    }
    .json-pre {
      font-size: 0.75rem;
      max-height: 200px;
      overflow: auto;
      margin: 0;
      white-space: pre-wrap;
    }
    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      padding-top: 0.5rem;
    }
  `],
})
export class AuditLogListPage implements OnInit {
  private readonly api = inject(AuditLogsApi);
  private readonly usersApi = inject(UsersApi);

  readonly logs = signal<AuditLogItem[]>([]);
  readonly meta = signal<PaginationMeta | null>(null);
  readonly userOptions = signal<{ id: string; fullName: string }[]>([]);
  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly tableLoading = signal(false);

  readonly actionOptions = ACTION_OPTIONS;
  readonly entityOptions = ENTITY_OPTIONS;

  filterUserId = '';
  filterEntityType = '';
  filterAction = '';
  filterEntityId = '';
  startDate: Date | null = null;
  endDate: Date | null = null;

  currentPage = 1;
  perPage = 20;

  diffModalVisible = false;
  selectedLog = signal<AuditLogItem | null>(null);
  diffRows = signal<DiffRow[]>([]);
  showRawJson = signal(false);

  ngOnInit(): void {
    this.loadUsers();
    this.loadData();
  }

  loadUsers(): void {
    this.usersApi.listUsers().subscribe({
      next: (res) => {
        const opts = res.data.map((u: User) => ({ id: u.id, fullName: `${u.fullName} (${u.username})` }));
        this.userOptions.set([{ id: '', fullName: 'ทุกคน' }, ...opts]);
      },
    });
  }

  loadData(): void {
    this.tableLoading.set(true);
    const query: AuditLogQuery = {
      page: this.currentPage,
      perPage: this.perPage,
      userId: this.filterUserId || undefined,
      entityType: this.filterEntityType || undefined,
      action: this.filterAction || undefined,
      entityId: this.filterEntityId.trim() || undefined,
      startDate: this.startDate ? this.startDate.toISOString() : undefined,
      endDate: this.endDate ? this.endDate.toISOString() : undefined,
    };

    this.api.list(query).subscribe({
      next: (res) => {
        this.logs.set(res.data);
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

  onFilterChange(): void {
    this.currentPage = 1;
    this.loadData();
  }

  clearFilters(): void {
    this.filterUserId = '';
    this.filterEntityType = '';
    this.filterAction = '';
    this.filterEntityId = '';
    this.startDate = null;
    this.endDate = null;
    this.currentPage = 1;
    this.loadData();
  }

  hasActiveFilters(): boolean {
    return !!(
      this.filterUserId ||
      this.filterEntityType ||
      this.filterAction ||
      this.filterEntityId ||
      this.startDate ||
      this.endDate
    );
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? this.perPage;
    const first = event.first ?? 0;
    this.currentPage = Math.floor(first / rows) + 1;
    this.perPage = rows;
    this.loadData();
  }

  openDiffModal(log: AuditLogItem): void {
    this.selectedLog.set(log);
    this.showRawJson.set(false);
    this.diffRows.set(this.computeDiff(log.oldValue, log.newValue));
    this.diffModalVisible = true;
  }

  getActionClass(action: string): string {
    const act = (action || '').toUpperCase();
    if (act.includes('CREATE')) return 'action-create';
    if (act.includes('UPDATE')) return 'action-update';
    if (act.includes('DELETE')) return 'action-delete';
    if (act.includes('STATUS')) return 'action-status';
    if (act.includes('ASSIGN')) return 'action-assign';
    return 'action-default';
  }

  getSourceClass(source?: string | null): string {
    const s = (source || 'WEB').toUpperCase();
    if (s === 'API') return 'source-api';
    if (s === 'JOB') return 'source-job';
    if (s === 'IMPORT') return 'source-import';
    return 'source-web';
  }

  private computeDiff(oldVal: unknown, newVal: unknown): DiffRow[] {
    if (!oldVal && !newVal) return [];

    const beforeObj = (typeof oldVal === 'object' && oldVal !== null ? oldVal : {}) as Record<string, unknown>;
    const afterObj = (typeof newVal === 'object' && newVal !== null ? newVal : {}) as Record<string, unknown>;

    const allKeys = Array.from(new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]));
    const rows: DiffRow[] = [];

    for (const key of allKeys) {
      const b = beforeObj[key];
      const a = afterObj[key];

      const bStr = b !== undefined ? JSON.stringify(b) : '—';
      const aStr = a !== undefined ? JSON.stringify(a) : '—';

      if (bStr !== aStr) {
        let status: 'changed' | 'added' | 'removed' = 'changed';
        if (b === undefined) status = 'added';
        else if (a === undefined) status = 'removed';

        rows.push({
          key,
          before: bStr,
          after: aStr,
          status,
        });
      }
    }

    return rows;
  }
}

