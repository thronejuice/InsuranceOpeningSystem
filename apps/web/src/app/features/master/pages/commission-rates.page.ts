import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppFieldErrorComponent } from '../../../shared/components/app-field-error/app-field-error.component';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import {
  MasterApi,
  type CommissionRate,
  type InsuranceCompany,
  type InsuranceProduct,
} from '../data/master.api';
import {
  ConfirmationService,
  MessageService,
  UiButton,
  UiConfirmDialog,
  UiDialog,
  UiInput,
  UiSelect,
  UiTable,
} from '../../../shared/ui';

@Component({
  selector: 'app-commission-rates-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService],
  imports: [
    FormsModule,
    ReactiveFormsModule,
    UiTable,
    UiButton,
    UiDialog,
    UiInput,
    UiSelect,
    UiConfirmDialog,
    AppPageHeaderComponent,
    AppStateComponent,
    AppFieldErrorComponent,
    HasPermissionDirective,
    ThDatePipe,
  ],
  template: `
    <ui-confirm-dialog />

    <app-page-header title="อัตราคอมมิชชัน (Commission Rates)" subtitle="จัดการอัตราค่าคอมมิชชันตามบริษัทประกันภัยและผลิตภัณฑ์">
      <ui-button *appHasPermission="'master.manage'" label="เพิ่มอัตราคอมมิชชัน" icon="pi pi-plus" (onClick)="openCreate()" />
    </app-page-header>

    <!-- Filter toolbar -->
    <div class="toolbar">
      <div class="filter-group">
        <label for="filter-co" class="filter-label">บริษัทประกัน:</label>
        <ui-select
          inputId="filter-co"
          [options]="companyFilterOptions()"
          optionLabel="label"
          optionValue="value"
          [ngModel]="selectedCompanyId()"
          (ngModelChange)="onFilterCompany($event)"
          placeholder="ทั้งหมด"
          styleClass="filter-select"
        />
      </div>

      <div class="filter-group">
        <label for="filter-prod" class="filter-label">ผลิตภัณฑ์:</label>
        <ui-select
          inputId="filter-prod"
          [options]="productFilterOptions()"
          optionLabel="label"
          optionValue="value"
          [ngModel]="selectedProductId()"
          (ngModelChange)="onFilterProduct($event)"
          placeholder="ทั้งหมด"
          styleClass="filter-select"
        />
      </div>

      @if (selectedCompanyId() || selectedProductId()) {
        <ui-button label="ล้างตัวกรอง" icon="pi pi-filter-slash" [outlined]="true" severity="secondary" size="small" (onClick)="clearFilters()" />
      }
    </div>

    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else {
      <ui-table [value]="items()" styleClass="p-datatable-sm p-datatable-striped">
        <ng-template #header>
          <tr>
            <th>บริษัทประกันภัย</th>
            <th>ผลิตภัณฑ์</th>
            <th style="width:130px; text-align:right">อัตราคอมมิชชัน</th>
            <th style="width:140px">มีผลตั้งแต่วันที่</th>
            <th style="width:140px">ถึงวันที่</th>
            <th style="width:120px; text-align:center">สถานะ</th>
            <th style="width:100px; text-align:center"></th>
          </tr>
        </ng-template>
        <ng-template #body let-row>
          <tr>
            <td>
              <div class="company-cell">
                <strong>{{ row.insuranceCompany?.name ?? '-' }}</strong>
                @if (row.insuranceCompany?.code) {
                  <span class="code-badge">{{ row.insuranceCompany?.code }}</span>
                }
              </div>
            </td>
            <td>
              <div class="product-cell">
                <span>{{ row.product?.name ?? '-' }}</span>
                @if (row.product?.code) {
                  <span class="sub-code">({{ row.product?.code }})</span>
                }
              </div>
            </td>
            <td style="text-align:right">
              <span class="rate-badge">{{ row.rate }}%</span>
            </td>
            <td>{{ row.effectiveFrom | thDate }}</td>
            <td>{{ row.effectiveTo ? (row.effectiveTo | thDate) : 'ไม่มีกำหนด' }}</td>
            <td style="text-align:center">
              <span [class]="isRateActive(row) ? 'badge-active' : 'badge-inactive'">
                {{ isRateActive(row) ? 'มีผลบังคับ' : 'สิ้นสุดแล้ว' }}
              </span>
            </td>
            <td>
              <div class="action-buttons">
                <ui-button
                  *appHasPermission="'master.manage'"
                  icon="pi pi-pencil"
                  [text]="true"
                  size="small"
                  severity="secondary"
                  (onClick)="openEdit(row)"
                  title="แก้ไข"
                />
                <ui-button
                  *appHasPermission="'master.manage'"
                  icon="pi pi-trash"
                  [text]="true"
                  size="small"
                  severity="danger"
                  (onClick)="confirmDelete(row)"
                  title="ลบ"
                />
              </div>
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="7" style="text-align:center;padding:2rem;color:var(--text-color-secondary)">
              ไม่พบข้อมูลอัตราคอมมิชชัน
            </td>
          </tr>
        </ng-template>
      </ui-table>
    }

    <!-- Create / Edit Dialog -->
    <ui-dialog
      [(visible)]="dialogVisible"
      [header]="editId() ? 'แก้ไขอัตราคอมมิชชัน' : 'เพิ่มอัตราคอมมิชชัน'"
      [icon]="editId() ? 'pi pi-percentage' : 'pi pi-plus-circle'"
      [modal]="true"
      [style]="{ width: '520px' }"
    >
      <form [formGroup]="form" (ngSubmit)="save()" class="dialog-form">
        <div class="field">
          <label for="cr-co">บริษัทประกันภัย <span class="required">*</span></label>
          <ui-select
            inputId="cr-co"
            [options]="companies()"
            optionLabel="name"
            optionValue="id"
            formControlName="insuranceCompanyId"
            placeholder="เลือกบริษัทประกันภัย"
          />
          <app-field-error [control]="form.get('insuranceCompanyId')" />
        </div>

        <div class="field">
          <label for="cr-prod">ผลิตภัณฑ์ <span class="required">*</span></label>
          <ui-select
            inputId="cr-prod"
            [options]="products()"
            optionLabel="name"
            optionValue="id"
            formControlName="productId"
            placeholder="เลือกผลิตภัณฑ์"
          />
          <app-field-error [control]="form.get('productId')" />
        </div>

        <div class="field">
          <label for="cr-rate">อัตราคอมมิชชัน (%) <span class="required">*</span></label>
          <input
            uiInput
            id="cr-rate"
            formControlName="rate"
            type="number"
            step="0.01"
            min="0"
            max="100"
            class="w-full"
            placeholder="เช่น 12.00"
          />
          <app-field-error [control]="form.get('rate')" />
        </div>

        <div class="form-grid">
          <div class="field">
            <label for="cr-from">วันเริ่มมีผล <span class="required">*</span></label>
            <input uiInput id="cr-from" formControlName="effectiveFrom" type="date" class="w-full" />
            <app-field-error [control]="form.get('effectiveFrom')" />
          </div>
          <div class="field">
            <label for="cr-to">วันสิ้นสุดมีผล</label>
            <input uiInput id="cr-to" formControlName="effectiveTo" type="date" class="w-full" />
            <app-field-error [control]="form.get('effectiveTo')" />
          </div>
        </div>

        @if (dialogError()) {
          <div class="error-banner">{{ dialogError() }}</div>
        }

        <div class="dialog-actions">
          <ui-button label="ยกเลิก" icon="pi pi-times" severity="danger" [outlined]="true" (onClick)="dialogVisible = false" />
          <ui-button label="บันทึก" icon="pi pi-check" type="submit" [loading]="saving()" />
        </div>
      </form>
    </ui-dialog>
  `,
  styles: [`
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.25rem;
      padding: 0.75rem 1rem;
      background: var(--surface-card, #ffffff);
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 8px;
    }
    .filter-group {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .filter-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-color-secondary, #6b7280);
      white-space: nowrap;
    }
    .company-cell {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .code-badge {
      font-size: 0.75rem;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      background: var(--surface-200, #e2e8f0);
      color: var(--text-color-secondary, #475569);
    }
    .product-cell {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .sub-code {
      font-size: 0.8rem;
      color: var(--text-color-secondary, #64748b);
    }
    .rate-badge {
      display: inline-block;
      font-weight: 600;
      color: var(--primary-color, #2563eb);
      background: #eff6ff;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
    }
    .badge-active {
      background: var(--green-100, #dcfce7);
      color: var(--green-700, #15803d);
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      font-size: 0.8rem;
      font-weight: 500;
    }
    .badge-inactive {
      background: var(--surface-200, #e2e8f0);
      color: var(--text-color-secondary, #64748b);
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      font-size: 0.8rem;
    }
    .action-buttons {
      display: flex;
      justify-content: center;
      gap: 0.25rem;
    }
    .dialog-form {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding-top: 0.5rem;
    }
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    label {
      font-size: 0.875rem;
      font-weight: 500;
    }
    .required {
      color: var(--red-500, #ef4444);
    }
    .error-banner {
      padding: 0.5rem 0.75rem;
      background: #fef2f2;
      color: #b91c1c;
      border-radius: 6px;
      font-size: 0.875rem;
    }
    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }
  `],
})
export class CommissionRatesPage implements OnInit {
  private readonly api = inject(MasterApi);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly fb = inject(FormBuilder);

  readonly items = signal<CommissionRate[]>([]);
  readonly companies = signal<InsuranceCompany[]>([]);
  readonly products = signal<InsuranceProduct[]>([]);
  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  readonly dialogError = signal<string | null>(null);
  dialogVisible = false;

  readonly selectedCompanyId = signal<string | null>(null);
  readonly selectedProductId = signal<string | null>(null);

  readonly companyFilterOptions = signal<{ label: string; value: string | null }[]>([]);
  readonly productFilterOptions = signal<{ label: string; value: string | null }[]>([]);

  readonly form = this.fb.group({
    insuranceCompanyId: ['', [Validators.required]],
    productId: ['', [Validators.required]],
    rate: ['', [Validators.required, Validators.min(0), Validators.max(100)]],
    effectiveFrom: ['', [Validators.required]],
    effectiveTo: [''],
  });

  ngOnInit(): void {
    this.loadDropdowns();
    this.loadRates();
  }

  loadDropdowns(): void {
    this.api.listCompanies().subscribe({
      next: (res) => {
        const list = res.data ?? [];
        this.companies.set(list);
        this.companyFilterOptions.set([
          { label: 'ทั้งหมด', value: null },
          ...list.map((c) => ({ label: c.name, value: c.id })),
        ]);
      },
    });

    this.api.listProducts().subscribe({
      next: (res) => {
        const list = res.data ?? [];
        this.products.set(list);
        this.productFilterOptions.set([
          { label: 'ทั้งหมด', value: null },
          ...list.map((p) => ({ label: p.name, value: p.id })),
        ]);
      },
    });
  }

  loadRates(): void {
    this.state.set('loading');
    const query: { insuranceCompanyId?: string; productId?: string } = {};
    if (this.selectedCompanyId()) query.insuranceCompanyId = this.selectedCompanyId()!;
    if (this.selectedProductId()) query.productId = this.selectedProductId()!;

    this.api.listCommissionRates(query).subscribe({
      next: (res) => {
        this.items.set(res.data ?? []);
        this.state.set('none');
      },
      error: () => this.state.set('error'),
    });
  }

  onFilterCompany(companyId: string | null): void {
    this.selectedCompanyId.set(companyId);
    this.loadRates();
  }

  onFilterProduct(productId: string | null): void {
    this.selectedProductId.set(productId);
    this.loadRates();
  }

  clearFilters(): void {
    this.selectedCompanyId.set(null);
    this.selectedProductId.set(null);
    this.loadRates();
  }

  isRateActive(rate: CommissionRate): boolean {
    const now = new Date();
    const from = new Date(rate.effectiveFrom);
    if (from > now) return false;
    if (rate.effectiveTo) {
      const to = new Date(rate.effectiveTo);
      to.setHours(23, 59, 59, 999);
      if (to < now) return false;
    }
    return true;
  }

  openCreate(): void {
    this.editId.set(null);
    this.dialogError.set(null);
    const today = new Date().toISOString().slice(0, 10);
    this.form.reset({
      insuranceCompanyId: this.selectedCompanyId() ?? '',
      productId: this.selectedProductId() ?? '',
      rate: '',
      effectiveFrom: today,
      effectiveTo: '',
    });
    this.dialogVisible = true;
  }

  openEdit(row: CommissionRate): void {
    this.editId.set(row.id);
    this.dialogError.set(null);
    this.form.reset({
      insuranceCompanyId: row.insuranceCompanyId,
      productId: row.productId,
      rate: row.rate,
      effectiveFrom: row.effectiveFrom ? row.effectiveFrom.slice(0, 10) : '',
      effectiveTo: row.effectiveTo ? row.effectiveTo.slice(0, 10) : '',
    });
    this.dialogVisible = true;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const val = this.form.getRawValue();
    if (val.effectiveTo && val.effectiveFrom && val.effectiveTo < val.effectiveFrom) {
      this.dialogError.set('วันสิ้นสุดต้องอยู่หลังจากวันเริ่มมีผล');
      return;
    }

    this.saving.set(true);
    this.dialogError.set(null);

    const id = this.editId();
    if (id) {
      this.api
        .updateCommissionRate(id, {
          insuranceCompanyId: val.insuranceCompanyId ?? undefined,
          productId: val.productId ?? undefined,
          rate: val.rate ? String(val.rate) : undefined,
          effectiveFrom: val.effectiveFrom ?? undefined,
          effectiveTo: val.effectiveTo ? val.effectiveTo : null,
        })
        .subscribe({
          next: () => {
            this.saving.set(false);
            this.dialogVisible = false;
            this.toast.add({ severity: 'success', summary: 'สำเร็จ', detail: 'บันทึกการแก้ไขอัตราคอมมิชชันเรียบร้อย' });
            this.loadRates();
          },
          error: (err) => {
            this.saving.set(false);
            const msg = err.error?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล';
            this.dialogError.set(msg);
          },
        });
    } else {
      this.api
        .createCommissionRate({
          insuranceCompanyId: val.insuranceCompanyId!,
          productId: val.productId!,
          rate: String(val.rate!),
          effectiveFrom: val.effectiveFrom!,
          effectiveTo: val.effectiveTo || undefined,
        })
        .subscribe({
          next: () => {
            this.saving.set(false);
            this.dialogVisible = false;
            this.toast.add({ severity: 'success', summary: 'สำเร็จ', detail: 'เพิ่มอัตราคอมมิชชันเรียบร้อย' });
            this.loadRates();
          },
          error: (err) => {
            this.saving.set(false);
            const msg = err.error?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล';
            this.dialogError.set(msg);
          },
        });
    }
  }

  confirmDelete(row: CommissionRate): void {
    const companyName = row.insuranceCompany?.name ?? row.insuranceCompanyId;
    const productName = row.product?.name ?? row.productId;
    this.confirm.confirm({
      message: `คุณต้องการลบอัตราคอมมิชชัน ${row.rate}% ของ ${companyName} (${productName}) ใช่หรือไม่?`,
      header: 'ยืนยันการลบอัตราคอมมิชชัน',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'ลบ',
      rejectLabel: 'ยกเลิก',
      accept: () => {
        this.api.deleteCommissionRate(row.id).subscribe({
          next: () => {
            this.toast.add({ severity: 'success', summary: 'สำเร็จ', detail: 'ลบอัตราคอมมิชชันเรียบร้อย' });
            this.loadRates();
          },
          error: (err) => {
            const msg = err.error?.message || 'ไม่สามารถลบข้อมูลได้';
            this.toast.add({ severity: 'error', summary: 'เกิดข้อผิดพลาด', detail: msg });
          },
        });
      },
    });
  }
}
