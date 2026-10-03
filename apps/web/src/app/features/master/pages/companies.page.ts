import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppFieldErrorComponent } from '../../../shared/components/app-field-error/app-field-error.component';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { MasterApi, type InsuranceCompany } from '../data/master.api';
import { applyServerErrors } from '../../../shared/utils/form-errors';

@Component({
  selector: 'app-companies-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService],
  imports: [
    ReactiveFormsModule,
    TableModule, ButtonModule, DialogModule, InputText, ConfirmDialog,
    AppPageHeaderComponent, AppStateComponent, AppFieldErrorComponent, HasPermissionDirective,
  ],
  template: `
    <p-confirm-dialog />
    <app-page-header title="บริษัทประกันภัย" subtitle="จัดการบริษัทประกันภัย">
      <p-button *appHasPermission="'master.manage'" label="เพิ่มบริษัท" icon="pi pi-plus" (onClick)="openCreate()" />
    </app-page-header>

    @if (state() === 'loading') { <app-state state="loading" /> }
    @else if (state() === 'error') { <app-state state="error" /> }
    @else {
      <p-table [value]="items()" styleClass="p-datatable-sm p-datatable-striped">
        <ng-template #header>
          <tr>
            <th style="width:120px">รหัส</th>
            <th>ชื่อบริษัท</th>
            <th style="width:130px">โทรศัพท์</th>
            <th>อีเมล</th>
            <th style="width:80px">สถานะ</th>
            <th style="width:100px"></th>
          </tr>
        </ng-template>
        <ng-template #body let-row>
          <tr>
            <td><code>{{ row.code }}</code></td>
            <td>{{ row.name }}</td>
            <td>{{ row.phone }}</td>
            <td>{{ row.email }}</td>
            <td><span [class]="row.status === 'ACTIVE' ? 'badge-active' : 'badge-inactive'">{{ row.status === 'ACTIVE' ? 'ใช้งาน' : 'ไม่ใช้งาน' }}</span></td>
            <td>
              <div class="action-buttons">
                <p-button *appHasPermission="'master.manage'" icon="pi pi-pencil" [text]="true" size="small" severity="secondary" (onClick)="openEdit(row)" />
                <p-button *appHasPermission="'master.manage'" icon="pi pi-trash" [text]="true" size="small" severity="danger" (onClick)="confirmDelete(row)" />
              </div>
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-color-secondary)">ไม่พบข้อมูล</td></tr>
        </ng-template>
      </p-table>
    }

    <p-dialog [(visible)]="dialogVisible" [header]="editId() ? 'แก้ไขบริษัทประกันภัย' : 'เพิ่มบริษัทประกันภัย'"
      [modal]="true" [style]="{width:'520px'}">
      <form [formGroup]="form" (ngSubmit)="save()" class="dialog-form">
        <div class="form-grid">
          <div class="field">
            <label for="co-code">รหัส <span class="required">*</span></label>
            <input pInputText id="co-code" formControlName="code" [readOnly]="!!editId()" class="w-full" />
            <app-field-error [control]="form.get('code')" />
          </div>
          <div class="field">
            <label for="co-name">ชื่อบริษัท <span class="required">*</span></label>
            <input pInputText id="co-name" formControlName="name" class="w-full" />
            <app-field-error [control]="form.get('name')" />
          </div>
          <div class="field">
            <label for="co-tax">เลขประจำตัวผู้เสียภาษี</label>
            <input pInputText id="co-tax" formControlName="taxId" class="w-full" />
          </div>
          <div class="field">
            <label for="co-contact">ชื่อผู้ติดต่อ</label>
            <input pInputText id="co-contact" formControlName="contactName" class="w-full" />
          </div>
          <div class="field">
            <label for="co-phone">โทรศัพท์</label>
            <input pInputText id="co-phone" formControlName="phone" class="w-full" />
          </div>
          <div class="field">
            <label for="co-email">อีเมล</label>
            <input pInputText id="co-email" formControlName="email" type="email" class="w-full" />
          </div>
        </div>
        <div class="field">
          <label for="co-addr">ที่อยู่</label>
          <input pInputText id="co-addr" formControlName="address" class="w-full" />
        </div>
        <div class="dialog-actions">
          <p-button label="ยกเลิก" severity="secondary" [text]="true" (onClick)="dialogVisible=false" />
          <p-button label="บันทึก" type="submit" [loading]="saving()" />
        </div>
      </form>
    </p-dialog>
  `,
  styles: [`
    .action-buttons { display:flex; gap:0.25rem; }
    .badge-active { background:var(--green-100); color:var(--green-700); padding:0.15rem 0.5rem; border-radius:4px; font-size:0.8rem; }
    .badge-inactive { background:var(--surface-200); color:var(--text-color-secondary); padding:0.15rem 0.5rem; border-radius:4px; font-size:0.8rem; }
    .dialog-form { display:flex; flex-direction:column; gap:0.75rem; padding-top:0.5rem; }
    .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; }
    .field { display:flex; flex-direction:column; gap:0.25rem; }
    label { font-size:0.875rem; font-weight:500; }
    .required { color:var(--red-500); }
    .dialog-actions { display:flex; justify-content:flex-end; gap:0.5rem; margin-top:0.5rem; }
  `],
})
export class CompaniesPage implements OnInit {
  private readonly api = inject(MasterApi);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly fb = inject(FormBuilder);

  readonly items = signal<InsuranceCompany[]>([]);
  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  dialogVisible = false;

  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(50)]],
    name: ['', [Validators.required, Validators.maxLength(200)]],
    taxId: [''],
    contactName: [''],
    phone: [''],
    email: ['', Validators.email],
    address: [''],
  });

  ngOnInit() { this.load(); }

  load() {
    this.state.set('loading');
    this.api.listCompanies().subscribe({
      next: (res) => { this.items.set(res.data); this.state.set('none'); },
      error: () => this.state.set('error'),
    });
  }

  openCreate() {
    this.editId.set(null);
    this.form.reset();
    this.form.get('code')!.enable();
    this.dialogVisible = true;
  }

  openEdit(row: InsuranceCompany) {
    this.editId.set(row.id);
    this.form.reset({ code: row.code, name: row.name, taxId: row.taxId ?? '', contactName: row.contactName ?? '', phone: row.phone ?? '', email: row.email ?? '', address: row.address ?? '' });
    this.form.get('code')!.disable();
    this.dialogVisible = true;
  }

  confirmDelete(row: InsuranceCompany) {
    this.confirm.confirm({
      message: `ต้องการลบบริษัท "${row.name}" ใช่หรือไม่?`,
      header: 'ยืนยันการลบ',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.api.deleteCompany(row.id).subscribe({
          next: () => { this.toast.add({ severity: 'success', summary: 'ลบสำเร็จ' }); this.load(); },
          error: () => this.toast.add({ severity: 'error', summary: 'ผิดพลาด' }),
        });
      },
    });
  }

  save() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    const id = this.editId();
    const val = this.form.getRawValue();
    const req = id ? this.api.updateCompany(id, val) : this.api.createCompany(val);
    req.subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'บันทึกสำเร็จ' });
        this.dialogVisible = false;
        this.saving.set(false);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (err?.error?.errors) applyServerErrors(this.form, err.error);
        else this.toast.add({ severity: 'error', summary: 'ผิดพลาด', detail: 'ไม่สามารถบันทึกได้' });
      },
    });
  }
}
