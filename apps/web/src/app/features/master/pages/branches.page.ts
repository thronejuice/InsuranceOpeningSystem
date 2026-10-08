import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppFieldErrorComponent } from '../../../shared/components/app-field-error/app-field-error.component';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { BranchesApi, type Branch } from '../data/branches.api';
import { applyServerErrors } from '../../../shared/utils/form-errors';
import { ConfirmationService, MessageService, UiButton, UiConfirmDialog, UiDialog, UiInput, UiTable, UiToggleSwitch } from '../../../shared/ui';

@Component({
  selector: 'app-branches-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService],
  imports: [
    ReactiveFormsModule,
    UiTable,
    UiButton,
    UiDialog,
    UiInput,
    UiToggleSwitch,
    UiConfirmDialog,
    AppPageHeaderComponent,
    AppStateComponent,
    AppFieldErrorComponent,
    HasPermissionDirective,
  ],
  template: `
    <ui-confirm-dialog />

    <app-page-header title="สาขา (Branches)" subtitle="จัดการข้อมูลสาขาของบริษัทเพื่อกำหนดขอบเขตข้อมูล (Data Scope)">
      <ui-button *appHasPermission="'master.manage'" label="เพิ่มสาขา" icon="pi pi-plus" (onClick)="openCreate()" />
    </app-page-header>

    @if (state() === 'loading') { <app-state state="loading" /> }
    @else if (state() === 'error') { <app-state state="error" /> }
    @else {
      <ui-table [value]="items()" styleClass="p-datatable-sm p-datatable-striped" [loading]="saving()">
        <ng-template #header>
          <tr>
            <th style="width:120px">รหัสสาขา</th>
            <th>ชื่อสาขา</th>
            <th>ที่อยู่</th>
            <th style="width:100px;text-align:center">ผู้ใช้</th>
            <th style="width:100px;text-align:center">งาน</th>
            <th style="width:90px;text-align:center">สถานะ</th>
            <th style="width:100px"></th>
          </tr>
        </ng-template>
        <ng-template #body let-row>
          <tr>
            <td><code>{{ row.code }}</code></td>
            <td><strong>{{ row.name }}</strong></td>
            <td class="sub-text">{{ row.address || '-' }}</td>
            <td style="text-align:center">{{ row._count?.users ?? 0 }}</td>
            <td style="text-align:center">{{ row._count?.jobs ?? 0 }}</td>
            <td style="text-align:center">
              <span [class]="row.active ? 'badge-active' : 'badge-inactive'">
                {{ row.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน' }}
              </span>
            </td>
            <td>
              <div class="action-buttons">
                <ui-button *appHasPermission="'master.manage'" icon="pi pi-pencil" [text]="true" size="small" severity="secondary" (onClick)="openEdit(row)" title="แก้ไข" />
                <ui-button *appHasPermission="'master.manage'" icon="pi pi-trash" [text]="true" size="small" severity="danger" (onClick)="confirmDelete(row)" title="ลบ" />
              </div>
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-color-secondary)">ไม่พบข้อมูลสาขา</td></tr>
        </ng-template>
      </ui-table>
    }

    <!-- Create / Edit Dialog -->
    <ui-dialog [(visible)]="dialogVisible" [header]="editId() ? 'แก้ไขข้อมูลสาขา' : 'เพิ่มสาขาใหม่'"
      [icon]="editId() ? 'pi pi-building' : 'pi pi-plus-circle'"
      [modal]="true" [style]="{width:'500px'}" [closable]="true">
      <form [formGroup]="form" (ngSubmit)="save()" class="dialog-form">
        <div class="field">
          <label for="b-code">รหัสสาขา <span class="required">*</span></label>
          <input uiInput id="b-code" formControlName="code" [readOnly]="!!editId()" class="w-full" placeholder="เช่น HQ, CM, KK" />
          <app-field-error [control]="form.get('code')" />
        </div>
        <div class="field">
          <label for="b-name">ชื่อสาขา <span class="required">*</span></label>
          <input uiInput id="b-name" formControlName="name" class="w-full" placeholder="เช่น สำนักงานใหญ่, สาขาเชียงใหม่" />
          <app-field-error [control]="form.get('name')" />
        </div>
        <div class="field">
          <label for="b-address">ที่อยู่</label>
          <textarea uiInput id="b-address" formControlName="address" rows="3" class="w-full" placeholder="ที่อยู่ของสาขา"></textarea>
        </div>
        <div class="field-row">
          <label>เปิดใช้งาน</label>
          <ui-toggleswitch formControlName="active" />
        </div>
        <div class="dialog-actions">
          <ui-button label="ยกเลิก" icon="pi pi-times" severity="danger" [outlined]="true" (onClick)="dialogVisible=false" />
          <ui-button label="บันทึก" icon="pi pi-check" type="submit" [loading]="saving()" />
        </div>
      </form>
    </ui-dialog>
  `,
  styles: [`
    .sub-text { font-size: 0.85rem; color: var(--text-color-secondary); }
    .dialog-form { display: flex; flex-direction: column; gap: 0.75rem; padding-top: 0.5rem; }
    .field { display: flex; flex-direction: column; gap: 0.25rem; }
    .field-row { display: flex; align-items: center; gap: 0.75rem; }
    label { font-size: 0.875rem; font-weight: 500; }
    .required { color: var(--red-500); }
    .dialog-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }
    .action-buttons { display: flex; gap: 0.25rem; }
    .badge-active {
      display: inline-block;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      background: var(--green-50, #f0fdf4);
      color: var(--green-700, #15803d);
    }
    .badge-inactive {
      display: inline-block;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      background: var(--red-50, #fef2f2);
      color: var(--red-700, #b91c1c);
    }
  `],
})
export class BranchesPage implements OnInit {
  private readonly api = inject(BranchesApi);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly fb = inject(FormBuilder);

  readonly items = signal<Branch[]>([]);
  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);

  dialogVisible = false;

  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(50)]],
    name: ['', [Validators.required, Validators.maxLength(200)]],
    address: [''],
    active: [true],
  });

  ngOnInit() {
    this.load();
  }

  load() {
    this.state.set('loading');
    this.api.listBranches().subscribe({
      next: (data) => {
        this.items.set(data);
        this.state.set('none');
      },
      error: () => {
        this.state.set('error');
        this.toast.add({ severity: 'error', summary: 'เกิดข้อผิดพลาด', detail: 'ไม่สามารถโหลดข้อมูลสาขาได้' });
      },
    });
  }

  openCreate() {
    this.editId.set(null);
    this.form.reset({ code: '', name: '', address: '', active: true });
    this.dialogVisible = true;
  }

  openEdit(branch: Branch) {
    this.editId.set(branch.id);
    this.form.reset({
      code: branch.code,
      name: branch.name,
      address: branch.address ?? '',
      active: branch.active,
    });
    this.dialogVisible = true;
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const val = this.form.getRawValue();
    const id = this.editId();

    const op$ = id
      ? this.api.updateBranch(id, { name: val.name!, address: val.address || undefined, active: val.active ?? true })
      : this.api.createBranch({ code: val.code!, name: val.name!, address: val.address || undefined, active: val.active ?? true });

    op$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.toast.add({ severity: 'success', summary: 'สำเร็จ', detail: id ? 'แก้ไขข้อมูลสาขาเรียบร้อย' : 'เพิ่มสาขาเรียบร้อย' });
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        applyServerErrors(this.form, err);
        const detail = err?.error?.message ?? 'บันทึกข้อมูลไม่สำเร็จ';
        this.toast.add({ severity: 'error', summary: 'เกิดข้อผิดพลาด', detail });
      },
    });
  }

  confirmDelete(branch: Branch) {
    this.confirm.confirm({
      message: `คุณต้องการลบสาขา "${branch.name}" (${branch.code}) ใช่หรือไม่?`,
      header: 'ยืนยันการลบสาขา',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'ลบ',
      rejectLabel: 'ยกเลิก',
      accept: () => {
        this.api.deleteBranch(branch.id).subscribe({
          next: () => {
            this.toast.add({ severity: 'success', summary: 'สำเร็จ', detail: 'ลบสาขาเรียบร้อย' });
            this.load();
          },
          error: (err) => {
            const detail = err?.error?.message ?? 'ไม่สามารถลบสาขาได้';
            this.toast.add({ severity: 'error', summary: 'เกิดข้อผิดพลาด', detail });
          },
        });
      },
    });
  }
}
