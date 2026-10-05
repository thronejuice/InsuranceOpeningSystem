import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppFieldErrorComponent } from '../../../shared/components/app-field-error/app-field-error.component';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { MasterApi, type InsuranceProduct, type RiskField } from '../data/master.api';
import { applyServerErrors } from '../../../shared/utils/form-errors';
import { MessageService, UiButton, UiDialog, UiInput, UiInputNumber, UiSelect, UiTable, UiToggleSwitch } from '../../../shared/ui';

const FIELD_TYPES = [
  { label: 'TEXT', value: 'TEXT' },
  { label: 'NUMBER', value: 'NUMBER' },
  { label: 'DATE', value: 'DATE' },
  { label: 'BOOLEAN', value: 'BOOLEAN' },
  { label: 'SELECT', value: 'SELECT' },
  { label: 'MULTI_SELECT', value: 'MULTI_SELECT' },
  { label: 'FILE', value: 'FILE' },
  { label: 'JSON', value: 'JSON' },
];

@Component({
  selector: 'app-risk-fields-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ReactiveFormsModule, UiTable, UiButton, UiDialog, UiInput, UiSelect, UiToggleSwitch, UiInputNumber, AppPageHeaderComponent, AppStateComponent, AppFieldErrorComponent, HasPermissionDirective],
  template: `
    <app-page-header title="Risk Fields" subtitle="กำหนด field ข้อมูลความเสี่ยงตามผลิตภัณฑ์">
      <ui-button *appHasPermission="'master.manage'" label="เพิ่ม Field" icon="pi pi-plus" (onClick)="openCreate()" [disabled]="!selectedProductId()" />
    </app-page-header>

    <div class="toolbar">
      <ui-select
        [options]="products()"
        optionLabel="name"
        optionValue="id"
        [ngModel]="selectedProductId()"
        (ngModelChange)="setProduct($event)"
        placeholder="เลือกผลิตภัณฑ์"
        style="width:280px"
      />
    </div>

    @if (!selectedProductId()) {
      <app-state state="empty" emptyMessage="กรุณาเลือกผลิตภัณฑ์" />
    } @else if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else {
      <ui-table [value]="fields()" styleClass="p-datatable-sm p-datatable-striped">
        <ng-template #header>
          <tr>
            <th style="width:60px">ลำดับ</th>
            <th style="width:150px">Field Code</th>
            <th>ชื่อ Field</th>
            <th style="width:120px">ประเภท</th>
            <th style="width:80px">จำเป็น</th>
            <th style="width:80px">ใช้งาน</th>
            <th style="width:80px"></th>
          </tr>
        </ng-template>
        <ng-template #body let-row>
          <tr>
            <td>{{ row.sortOrder }}</td>
            <td><code>{{ row.fieldCode }}</code></td>
            <td>{{ row.fieldName }}</td>
            <td><span class="badge-type">{{ row.fieldType }}</span></td>
            <td><i [class]="row.isRequired ? 'pi pi-check text-green-500' : 'pi pi-minus text-color-secondary'"></i></td>
            <td><i [class]="row.active ? 'pi pi-check text-green-500' : 'pi pi-times text-red-400'"></i></td>
            <td>
              <ui-button *appHasPermission="'master.manage'" icon="pi pi-pencil" [text]="true" size="small" severity="secondary" (onClick)="openEdit(row)" />
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-color-secondary)">ยังไม่มี field สำหรับผลิตภัณฑ์นี้</td></tr>
        </ng-template>
      </ui-table>
    }

    <ui-dialog [(visible)]="dialogVisible" [header]="editId() ? 'แก้ไข Risk Field' : 'เพิ่ม Risk Field'"
      [modal]="true" [style]="{width:'520px'}">
      <form [formGroup]="form" (ngSubmit)="save()" class="dialog-form">
        <div class="form-grid">
          <div class="field">
            <label for="rf-code">Field Code <span class="required">*</span></label>
            <input uiInput id="rf-code" formControlName="fieldCode" [readOnly]="!!editId()" class="w-full" />
            <app-field-error [control]="form.get('fieldCode')" />
          </div>
          <div class="field">
            <label for="rf-name">ชื่อ Field <span class="required">*</span></label>
            <input uiInput id="rf-name" formControlName="fieldName" class="w-full" />
            <app-field-error [control]="form.get('fieldName')" />
          </div>
          <div class="field">
            <label>ประเภท <span class="required">*</span></label>
            <ui-select formControlName="fieldType" [options]="fieldTypes" optionLabel="label" optionValue="value" class="w-full" />
            <app-field-error [control]="form.get('fieldType')" />
          </div>
          <div class="field">
            <label for="rf-sort">ลำดับ</label>
            <ui-inputnumber id="rf-sort" formControlName="sortOrder" [min]="0" class="w-full" />
          </div>
        </div>
        <div class="field">
          <label for="rf-rule">Validation Rule</label>
          <input uiInput id="rf-rule" formControlName="validationRule" placeholder="เช่น min:0,max:9999" class="w-full" />
        </div>
        <div class="field-row">
          <ui-toggleswitch formControlName="isRequired" />
          <label>จำเป็นต้องกรอก</label>
        </div>
        <div class="field-row">
          <ui-toggleswitch formControlName="active" />
          <label>ใช้งาน</label>
        </div>
        <div class="dialog-actions">
          <ui-button label="ยกเลิก" severity="secondary" [text]="true" (onClick)="dialogVisible=false" />
          <ui-button label="บันทึก" type="submit" [loading]="saving()" />
        </div>
      </form>
    </ui-dialog>
  `,
  styles: [`
    .toolbar { margin-bottom:1rem; }
    .badge-type { font-size:0.75rem; background:var(--surface-200); padding:0.15rem 0.4rem; border-radius:4px; }
    .dialog-form { display:flex; flex-direction:column; gap:0.75rem; padding-top:0.5rem; }
    .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; }
    .field { display:flex; flex-direction:column; gap:0.25rem; }
    .field-row { display:flex; align-items:center; gap:0.75rem; }
    label { font-size:0.875rem; font-weight:500; }
    .required { color:var(--red-500); }
    .dialog-actions { display:flex; justify-content:flex-end; gap:0.5rem; margin-top:0.5rem; }
  `],
})
export class RiskFieldsPage implements OnInit {
  private readonly api = inject(MasterApi);
  private readonly toast = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  readonly products = signal<InsuranceProduct[]>([]);
  readonly fields = signal<RiskField[]>([]);
  readonly state = signal<'loading' | 'error' | 'none' | 'idle'>('idle');
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  readonly selectedProductId = signal<string>('');
  readonly fieldTypes = FIELD_TYPES;
  dialogVisible = false;

  readonly form = this.fb.nonNullable.group({
    fieldCode: ['', [Validators.required, Validators.maxLength(50)]],
    fieldName: ['', [Validators.required, Validators.maxLength(200)]],
    fieldType: ['TEXT', Validators.required],
    isRequired: [false],
    validationRule: [''],
    sortOrder: [0],
    active: [true],
  });

  ngOnInit() {
    this.api.listProducts().subscribe({ next: (res) => this.products.set(res.data) });
  }

  setProduct(productId: string) {
    this.selectedProductId.set(productId);
    if (productId) this.loadFields();
  }

  loadFields() {
    const pid = this.selectedProductId();
    if (!pid) return;
    this.state.set('loading');
    this.api.listRiskFields(pid).subscribe({
      next: (res) => { this.fields.set(res.data); this.state.set('none'); },
      error: () => this.state.set('error'),
    });
  }

  openCreate() {
    this.editId.set(null);
    this.form.reset({ fieldType: 'TEXT', active: true, sortOrder: (this.fields().length + 1) });
    this.form.get('fieldCode')!.enable();
    this.dialogVisible = true;
  }

  openEdit(row: RiskField) {
    this.editId.set(row.id);
    this.form.reset({ fieldCode: row.fieldCode, fieldName: row.fieldName, fieldType: row.fieldType, isRequired: row.isRequired, validationRule: row.validationRule ?? '', sortOrder: row.sortOrder, active: row.active });
    this.form.get('fieldCode')!.disable();
    this.dialogVisible = true;
  }

  save() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    const id = this.editId();
    const val = this.form.getRawValue();
    const body = id ? val : { ...val, productId: this.selectedProductId() };
    const req = id ? this.api.updateRiskField(id, val) : this.api.createRiskField(body);
    req.subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'บันทึกสำเร็จ' });
        this.dialogVisible = false;
        this.saving.set(false);
        this.loadFields();
      },
      error: (err) => {
        this.saving.set(false);
         
        if (err?.error?.errors) applyServerErrors(this.form, err.error);
        else this.toast.add({ severity: 'error', summary: 'ผิดพลาด', detail: 'ไม่สามารถบันทึกได้' });
      },
    });
  }
}
