import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppFieldErrorComponent } from '../../../shared/components/app-field-error/app-field-error.component';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { MasterApi, type InsuranceProduct, type InsuranceType } from '../data/master.api';
import { applyServerErrors } from '../../../shared/utils/form-errors';
import { MessageService, UiButton, UiDialog, UiInput, UiSelect, UiTable, UiToggleSwitch } from '../../../shared/ui';

@Component({
  selector: 'app-products-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, UiTable, UiButton, UiDialog, UiInput, UiToggleSwitch, UiSelect, AppPageHeaderComponent, AppStateComponent, AppFieldErrorComponent, HasPermissionDirective],
  template: `
    <app-page-header title="ผลิตภัณฑ์ประกันภัย" subtitle="จัดการผลิตภัณฑ์ประกันภัย">
      <ui-button *appHasPermission="'master.manage'" label="เพิ่มผลิตภัณฑ์" icon="pi pi-plus" (onClick)="openCreate()" />
    </app-page-header>

    @if (state() === 'loading') { <app-state state="loading" /> }
    @else if (state() === 'error') { <app-state state="error" /> }
    @else {
      <ui-table [value]="items()" styleClass="p-datatable-sm p-datatable-striped">
        <ng-template #header>
          <tr>
            <th style="width:120px">รหัส</th>
            <th>ชื่อ</th>
            <th style="width:160px">ประเภท</th>
            <th style="width:80px">ต้องมีเอกสาร (Submit)</th>
            <th style="width:80px">ต้องมีเอกสาร (Bind)</th>
            <th style="width:80px">ใช้งาน</th>
            <th style="width:80px"></th>
          </tr>
        </ng-template>
        <ng-template #body let-row>
          <tr>
            <td><code>{{ row.code }}</code></td>
            <td>{{ row.name }}</td>
            <td>{{ row.insuranceType?.name }}</td>
            <td><i [class]="row.requireDocsOnSubmit ? 'pi pi-check text-green-500' : 'pi pi-times text-red-400'"></i></td>
            <td><i [class]="row.requireDocsOnBind ? 'pi pi-check text-green-500' : 'pi pi-times text-red-400'"></i></td>
            <td><i [class]="row.active ? 'pi pi-check text-green-500' : 'pi pi-times text-red-400'"></i></td>
            <td>
              <ui-button *appHasPermission="'master.manage'" icon="pi pi-pencil" [text]="true" size="small" severity="secondary" (onClick)="openEdit(row)" />
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-color-secondary)">ไม่พบข้อมูล</td></tr>
        </ng-template>
      </ui-table>
    }

    <ui-dialog [(visible)]="dialogVisible" [header]="editId() ? 'แก้ไขผลิตภัณฑ์' : 'เพิ่มผลิตภัณฑ์'"
      [icon]="editId() ? 'pi pi-box' : 'pi pi-plus-circle'"
      [modal]="true" [style]="{width:'520px'}">
      <form [formGroup]="form" (ngSubmit)="save()" class="dialog-form">
        <div class="field">
          <label>ประเภทประกันภัย <span class="required">*</span></label>
          <ui-select formControlName="insuranceTypeId" [options]="insuranceTypes()" optionLabel="name" optionValue="id" placeholder="เลือกประเภท" class="w-full" />
          <app-field-error [control]="form.get('insuranceTypeId')" />
        </div>
        <div class="field">
          <label for="prod-code">รหัส <span class="required">*</span></label>
          <input uiInput id="prod-code" formControlName="code" [readOnly]="!!editId()" class="w-full" />
          <app-field-error [control]="form.get('code')" />
        </div>
        <div class="field">
          <label for="prod-name">ชื่อผลิตภัณฑ์ <span class="required">*</span></label>
          <input uiInput id="prod-name" formControlName="name" class="w-full" />
          <app-field-error [control]="form.get('name')" />
        </div>
        <div class="field">
          <label for="prod-desc">คำอธิบาย</label>
          <textarea uiInput id="prod-desc" formControlName="description" rows="2" class="w-full"></textarea>
        </div>
        <div class="field-row">
          <ui-toggleswitch formControlName="requireDocsOnSubmit" />
          <label>ต้องมีเอกสารครบก่อน Submit</label>
        </div>
        <div class="field-row">
          <ui-toggleswitch formControlName="requireDocsOnBind" />
          <label>ต้องมีเอกสารครบก่อน Bind</label>
        </div>
        <div class="field-row">
          <ui-toggleswitch formControlName="active" />
          <label>ใช้งาน</label>
        </div>
        <div class="dialog-actions">
          <ui-button label="ยกเลิก" icon="pi pi-times" severity="danger" [outlined]="true" (onClick)="dialogVisible=false" />
          <ui-button label="บันทึก" icon="pi pi-check" type="submit" [loading]="saving()" />
        </div>
      </form>
    </ui-dialog>
  `,
  styles: [`
    .dialog-form { display:flex; flex-direction:column; gap:0.75rem; padding-top:0.5rem; }
    .field { display:flex; flex-direction:column; gap:0.25rem; }
    .field-row { display:flex; align-items:center; gap:0.75rem; }
    label { font-size:0.875rem; font-weight:500; }
    .required { color:var(--red-500); }
    .dialog-actions { display:flex; justify-content:flex-end; gap:0.5rem; margin-top:0.5rem; }
  `],
})
export class ProductsPage implements OnInit {
  private readonly api = inject(MasterApi);
  private readonly toast = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  readonly items = signal<InsuranceProduct[]>([]);
  readonly insuranceTypes = signal<InsuranceType[]>([]);
  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  dialogVisible = false;

  readonly form = this.fb.nonNullable.group({
    insuranceTypeId: ['', Validators.required],
    code: ['', [Validators.required, Validators.maxLength(50)]],
    name: ['', [Validators.required, Validators.maxLength(200)]],
    description: [''],
    requireDocsOnSubmit: [false],
    requireDocsOnBind: [false],
    active: [true],
  });

  ngOnInit() { this.load(); }

  load() {
    this.state.set('loading');
    this.api.listProducts().subscribe({
      next: (res) => { this.items.set(res.data); this.state.set('none'); },
      error: () => this.state.set('error'),
    });
    this.api.listInsuranceTypes().subscribe({ next: (res) => this.insuranceTypes.set(res.data) });
  }

  openCreate() {
    this.editId.set(null);
    this.form.reset({ active: true });
    this.form.get('code')!.enable();
    this.dialogVisible = true;
  }

  openEdit(row: InsuranceProduct) {
    this.editId.set(row.id);
    this.form.reset({
      insuranceTypeId: row.insuranceTypeId,
      code: row.code,
      name: row.name,
      description: row.description ?? '',
      requireDocsOnSubmit: row.requireDocsOnSubmit,
      requireDocsOnBind: row.requireDocsOnBind,
      active: row.active,
    });
    this.form.get('code')!.disable();
    this.dialogVisible = true;
  }

  save() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    const id = this.editId();
    const val = this.form.getRawValue();
    const req = id ? this.api.updateProduct(id, val) : this.api.createProduct(val);
    req.subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'บันทึกสำเร็จ' });
        this.dialogVisible = false;
        this.saving.set(false);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
         
        if (err?.error?.errors) applyServerErrors(this.form, err.error);
        else this.toast.add({ severity: 'error', summary: 'ผิดพลาด', detail: 'ไม่สามารถบันทึกได้' });
      },
    });
  }
}
