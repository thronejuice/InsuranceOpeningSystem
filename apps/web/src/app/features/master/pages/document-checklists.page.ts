import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppFieldErrorComponent } from '../../../shared/components/app-field-error/app-field-error.component';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { MasterApi, type InsuranceProduct, type DocumentChecklistMaster } from '../data/master.api';
import { MessageService, UiButton, UiDialog, UiInput, UiSelect, UiTable, UiToggleSwitch } from '../../../shared/ui';

export const MASTER_DOC_TYPE_OPTIONS = [
  { label: 'บัตรประชาชน (ID_CARD)', value: 'ID_CARD' },
  { label: 'หนังสือจดทะเบียนบริษัท (COMPANY_REGISTRATION)', value: 'COMPANY_REGISTRATION' },
  { label: 'เอกสารภาษี (TAX_DOCUMENT)', value: 'TAX_DOCUMENT' },
  { label: 'เล่มทะเบียนรถ (VEHICLE_BOOK)', value: 'VEHICLE_BOOK' },
  { label: 'กรมธรรม์เดิม (PREVIOUS_POLICY)', value: 'PREVIOUS_POLICY' },
  { label: 'ภาพถ่ายรถ (VEHICLE_PHOTO)', value: 'VEHICLE_PHOTO' },
  { label: 'รายงานสำรวจภัย (RISK_SURVEY)', value: 'RISK_SURVEY' },
  { label: 'ใบเสนอราคา (QUOTATION)', value: 'QUOTATION' },
  { label: 'ใบเสนอ (PROPOSAL)', value: 'PROPOSAL' },
  { label: 'กรมธรรม์ (POLICY)', value: 'POLICY' },
  { label: 'ใบแจ้งหนี้ (INVOICE)', value: 'INVOICE' },
  { label: 'ใบเสร็จ (RECEIPT)', value: 'RECEIPT' },
  { label: 'อื่นๆ (OTHER)', value: 'OTHER' },
];

const MASTER_DOC_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  MASTER_DOC_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

@Component({
  selector: 'app-document-checklists-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    UiTable,
    UiButton,
    UiDialog,
    UiInput,
    UiSelect,
    UiToggleSwitch,
    AppPageHeaderComponent,
    AppStateComponent,
    AppFieldErrorComponent,
    HasPermissionDirective,
  ],
  template: `
    <app-page-header title="Document Checklist" subtitle="กำหนดรายการเอกสารที่จำเป็นและทางเลือกตามผลิตภัณฑ์">
      <ui-button
        *appHasPermission="'master.manage'"
        label="เพิ่มเอกสารใน Checklist"
        icon="pi pi-plus"
        (onClick)="openCreate()"
        [disabled]="!selectedProductId()"
      />
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
      <app-state state="empty" emptyMessage="กรุณาเลือกผลิตภัณฑ์เพื่อดูรายการ Checklist" />
    } @else if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else {
      <ui-table [value]="checklists()" styleClass="p-datatable-sm p-datatable-striped">
        <ng-template #header>
          <tr>
            <th style="width:70px">ลำดับ</th>
            <th>ประเภทเอกสาร</th>
            <th style="width:130px; text-align:center">ความจำเป็น</th>
            <th style="width:100px; text-align:center">สถานะ</th>
            <th style="width:100px; text-align:center"></th>
          </tr>
        </ng-template>
        <ng-template #body let-row>
          <tr>
            <td>{{ row.sortOrder }}</td>
            <td>
              <div class="doc-type-cell">
                <i class="pi pi-file" style="margin-right: 0.5rem; color: var(--primary-color)"></i>
                <strong>{{ getDocTypeLabel(row.documentType) }}</strong>
                <span class="code-badge">{{ row.documentType }}</span>
              </div>
            </td>
            <td style="text-align:center">
              @if (row.isRequired) {
                <span class="badge badge-required"><i class="pi pi-asterisk"></i> จำเป็น (Required)</span>
              } @else {
                <span class="badge badge-optional">ทางเลือก (Optional)</span>
              }
            </td>
            <td style="text-align:center">
              @if (row.active) {
                <span class="badge badge-active"><i class="pi pi-check"></i> เปิดใช้งาน</span>
              } @else {
                <span class="badge badge-inactive"><i class="pi pi-times"></i> ปิดใช้งาน</span>
              }
            </td>
            <td style="text-align:center">
              <div style="display:inline-flex; gap:0.25rem;">
                <ui-button
                  *appHasPermission="'master.manage'"
                  icon="pi pi-pencil"
                  [text]="true"
                  size="small"
                  severity="secondary"
                  (onClick)="openEdit(row)"
                />
                <ui-button
                  *appHasPermission="'master.manage'"
                  icon="pi pi-trash"
                  [text]="true"
                  size="small"
                  severity="danger"
                  (onClick)="deleteItem(row)"
                />
              </div>
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="5" style="text-align:center;padding:2.5rem;color:var(--text-color-secondary)">
              ยังไม่มีการกำหนด Document Checklist สำหรับผลิตภัณฑ์นี้
            </td>
          </tr>
        </ng-template>
      </ui-table>
    }

    <!-- Add/Edit Dialog -->
    <ui-dialog
      [(visible)]="dialogVisible"
      [header]="editId() ? 'แก้ไขรายการ Checklist' : 'เพิ่มรายการ Checklist ใหม่'"
      [icon]="editId() ? 'pi pi-pencil' : 'pi pi-plus-circle'"
      [modal]="true"
      [style]="{width:'500px'}"
    >
      <form [formGroup]="form" (ngSubmit)="save()" class="dialog-form">
        <div class="form-grid">
          <div class="field">
            <label>ประเภทเอกสาร <span class="required">*</span></label>
            <ui-select
              formControlName="documentType"
              [options]="docTypeOptions"
              optionLabel="label"
              optionValue="value"
              placeholder="เลือกประเภทเอกสาร"
              class="w-full"
            />
            <app-field-error [control]="form.get('documentType')" />
          </div>

          <div class="field">
            <label>ลำดับการแสดงผล</label>
            <input uiInput type="number" formControlName="sortOrder" min="0" class="w-full" />
          </div>

          <div class="field switch-field">
            <div class="switch-row">
              <ui-toggleswitch formControlName="isRequired" />
              <div>
                <label style="cursor:pointer; font-weight: 600;">เอกสารจำเป็น (Required)</label>
                <div class="field-hint">ต้องอัปโหลดเอกสารนี้จึงจะสามารถส่งงาน (Submit) หรือออกกรมธรรม์ได้</div>
              </div>
            </div>
          </div>

          <div class="field switch-field">
            <div class="switch-row">
              <ui-toggleswitch formControlName="active" />
              <div>
                <label style="cursor:pointer; font-weight: 600;">เปิดใช้งาน (Active)</label>
                <div class="field-hint">หากปิดใช้งานจะไม่แสดงในรายการ checklist ของ Job ใหม่</div>
              </div>
            </div>
          </div>
        </div>

        <div class="dialog-actions">
          <ui-button label="ยกเลิก" [text]="true" severity="secondary" (onClick)="dialogVisible = false" />
          <ui-button label="บันทึก" icon="pi pi-check" type="submit" [loading]="saving()" />
        </div>
      </form>
    </ui-dialog>
  `,
  styles: [`
    .toolbar {
      margin-bottom: 1.25rem;
      display: flex;
      gap: 1rem;
      align-items: center;
    }
    .doc-type-cell {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .code-badge {
      display: inline-block;
      font-size: 0.75rem;
      font-family: monospace;
      color: var(--text-color-secondary);
      background: var(--surface-100, #f1f5f9);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      margin-left: 0.4rem;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem 0.6rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 500;
    }
    .badge-required {
      background: #fee2e2;
      color: #b91c1c;
    }
    .badge-optional {
      background: #e2e8f0;
      color: #475569;
    }
    .badge-active {
      background: #dcfce7;
      color: #15803d;
    }
    .badge-inactive {
      background: #f3f4f6;
      color: #9ca3af;
    }
    .dialog-form {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      padding-top: 0.5rem;
    }
    .form-grid {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .field label {
      font-size: 0.875rem;
      color: var(--text-color);
    }
    .field-hint {
      font-size: 0.775rem;
      color: var(--text-color-secondary);
      margin-top: 0.15rem;
    }
    .switch-field {
      padding: 0.5rem 0;
    }
    .switch-row {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
    }
    .required {
      color: #ef4444;
    }
    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px solid var(--surface-border);
    }
  `],
})
export class DocumentChecklistsPage implements OnInit {
  private readonly masterApi = inject(MasterApi);
  private readonly fb = inject(FormBuilder);
  private readonly message = inject(MessageService);

  readonly products = signal<InsuranceProduct[]>([]);
  readonly selectedProductId = signal<string>('');
  readonly checklists = signal<DocumentChecklistMaster[]>([]);
  readonly state = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);

  dialogVisible = false;
  readonly docTypeOptions = MASTER_DOC_TYPE_OPTIONS;

  readonly form = this.fb.group({
    documentType: ['', Validators.required],
    isRequired: [true],
    sortOrder: [0],
    active: [true],
  });

  ngOnInit(): void {
    this.masterApi.listProducts().subscribe({
      next: (res) => {
        this.products.set(res.data);
        if (res.data.length > 0) {
          this.setProduct(res.data[0].id);
        }
      },
      error: () => this.message.add({ severity: 'error', summary: 'โหลดรายการผลิตภัณฑ์ไม่สำเร็จ' }),
    });
  }

  setProduct(productId: string): void {
    this.selectedProductId.set(productId);
    if (!productId) {
      this.checklists.set([]);
      this.state.set('idle');
      return;
    }
    this.loadChecklists(productId);
  }

  loadChecklists(productId: string): void {
    this.state.set('loading');
    this.masterApi.listDocumentChecklists(productId).subscribe({
      next: (res) => {
        this.checklists.set(res.data);
        this.state.set('success');
      },
      error: () => {
        this.state.set('error');
        this.message.add({ severity: 'error', summary: 'โหลด Document Checklist ไม่สำเร็จ' });
      },
    });
  }

  getDocTypeLabel(docType: string): string {
    return MASTER_DOC_TYPE_LABELS[docType] || docType;
  }

  openCreate(): void {
    this.editId.set(null);
    const maxSort = this.checklists().reduce((max, c) => Math.max(max, c.sortOrder), -1);
    this.form.reset({
      documentType: '',
      isRequired: true,
      sortOrder: maxSort + 1,
      active: true,
    });
    this.form.get('documentType')?.enable();
    this.dialogVisible = true;
  }

  openEdit(item: DocumentChecklistMaster): void {
    this.editId.set(item.id);
    this.form.reset({
      documentType: item.documentType,
      isRequired: item.isRequired,
      sortOrder: item.sortOrder,
      active: item.active,
    });
    this.form.get('documentType')?.disable();
    this.dialogVisible = true;
  }

  deleteItem(item: DocumentChecklistMaster): void {
    if (!confirm(`คุณต้องการลบ "${this.getDocTypeLabel(item.documentType)}" ออกจาก Checklist หรือไม่?`)) return;

    this.masterApi.deleteDocumentChecklist(item.id).subscribe({
      next: () => {
        this.message.add({ severity: 'success', summary: 'ลบรายการ Checklist เรียบร้อย' });
        this.loadChecklists(this.selectedProductId());
      },
      error: () => this.message.add({ severity: 'error', summary: 'ไม่สามารถลบรายการได้' }),
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const val = this.form.getRawValue();
    const productId = this.selectedProductId();
    this.saving.set(true);

    const id = this.editId();
    if (id) {
      this.masterApi.updateDocumentChecklist(id, {
        isRequired: val.isRequired ?? true,
        sortOrder: val.sortOrder ?? 0,
        active: val.active ?? true,
      }).subscribe({
        next: () => {
          this.saving.set(false);
          this.dialogVisible = false;
          this.message.add({ severity: 'success', summary: 'บันทึกการแก้ไขเรียบร้อย' });
          this.loadChecklists(productId);
        },
        error: () => {
          this.saving.set(false);
          this.message.add({ severity: 'error', summary: 'บันทึกไม่สำเร็จ' });
        },
      });
    } else {
      this.masterApi.createDocumentChecklist({
        productId,
        documentType: val.documentType!,
        isRequired: val.isRequired ?? true,
        sortOrder: val.sortOrder ?? 0,
        active: val.active ?? true,
      }).subscribe({
        next: () => {
          this.saving.set(false);
          this.dialogVisible = false;
          this.message.add({ severity: 'success', summary: 'เพิ่มรายการ Checklist เรียบร้อย' });
          this.loadChecklists(productId);
        },
        error: () => {
          this.saving.set(false);
          this.message.add({ severity: 'error', summary: 'เพิ่มรายการไม่สำเร็จ' });
        },
      });
    }
  }
}
