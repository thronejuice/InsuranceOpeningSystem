import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppFieldErrorComponent } from '../../../shared/components/app-field-error/app-field-error.component';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { MasterApi, type PaymentTerm } from '../data/master.api';
import {
  ConfirmationService,
  MessageService,
  UiButton,
  UiConfirmDialog,
  UiDialog,
  UiInput,
  UiTable,
} from '../../../shared/ui';

@Component({
  selector: 'app-payment-terms-page',
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
    UiConfirmDialog,
    AppPageHeaderComponent,
    AppStateComponent,
    AppFieldErrorComponent,
    HasPermissionDirective,
  ],
  template: `
    <ui-confirm-dialog />

    <app-page-header title="เงื่อนไขการชำระเงิน (Payment Terms)" subtitle="จัดการเงื่อนไขการชำระเงิน จำนวนงวด และระยะเวลางวดผ่อน">
      <ui-button *appHasPermission="'master.manage'" label="เพิ่มเงื่อนไขการชำระเงิน" icon="pi pi-plus" (onClick)="openCreate()" />
    </app-page-header>

    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else {
      <ui-table [value]="items()" styleClass="p-datatable-sm p-datatable-striped">
        <ng-template #header>
          <tr>
            <th style="width:140px">รหัส</th>
            <th>ชื่อเงื่อนไขการชำระเงิน</th>
            <th>รายละเอียด</th>
            <th style="width:110px; text-align:center">จำนวนงวด</th>
            <th style="width:130px; text-align:center">ระยะห่าง (เดือน)</th>
            <th style="width:150px; text-align:center">งวดแรกครบกำหนด (วัน)</th>
            <th style="width:110px; text-align:center">สถานะ</th>
            <th style="width:100px; text-align:center"></th>
          </tr>
        </ng-template>
        <ng-template #body let-row>
          <tr>
            <td>
              <code class="code-badge">{{ row.code }}</code>
            </td>
            <td>
              <strong>{{ row.name }}</strong>
            </td>
            <td>
              <span class="text-secondary">{{ row.description || '-' }}</span>
            </td>
            <td style="text-align:center">
              <span class="num-badge">{{ row.installments }} งวด</span>
            </td>
            <td style="text-align:center">
              {{ row.intervalMonths ? row.intervalMonths + ' เดือน' : '-' }}
            </td>
            <td style="text-align:center">
              {{ row.firstDueDays }} วัน
            </td>
            <td style="text-align:center">
              <span [class]="row.active ? 'badge-active' : 'badge-inactive'">
                {{ row.active ? 'ใช้งาน' : 'ไม่ใช้งาน' }}
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
            <td colspan="8" style="text-align:center;padding:2rem;color:var(--text-color-secondary)">
              ไม่พบข้อมูลเงื่อนไขการชำระเงิน
            </td>
          </tr>
        </ng-template>
      </ui-table>
    }

    <!-- Create / Edit Dialog -->
    <ui-dialog
      [(visible)]="dialogVisible"
      [header]="editId() ? 'แก้ไขเงื่อนไขการชำระเงิน' : 'เพิ่มเงื่อนไขการชำระเงิน'"
      [icon]="editId() ? 'pi pi-credit-card' : 'pi pi-plus-circle'"
      [style]="{ width: '560px' }"
    >
      <form [formGroup]="form" (ngSubmit)="save()" class="form-grid">
        <div class="field">
          <label for="pt-code" class="field-label required">รหัส (Code)</label>
          <input
            uiInput
            id="pt-code"
            formControlName="code"
            class="w-full"
            placeholder="เช่น FULL, INSTALLMENT_3"
          />
          <app-field-error [control]="form.controls.code" />
        </div>

        <div class="field">
          <label for="pt-name" class="field-label required">ชื่อเงื่อนไขการชำระเงิน</label>
          <input
            uiInput
            id="pt-name"
            formControlName="name"
            class="w-full"
            placeholder="เช่น ชำระเต็มจำนวน, ผ่อนชำระ 3 งวด"
          />
          <app-field-error [control]="form.controls.name" />
        </div>

        <div class="field">
          <label for="pt-desc" class="field-label">รายละเอียด</label>
          <textarea
            uiInput
            id="pt-desc"
            formControlName="description"
            rows="2"
            class="w-full"
            placeholder="คำอธิบายเพิ่มเติมเกี่ยวกับเงื่อนไขการชำระเงิน"
          ></textarea>
        </div>

        <div class="field-row-3">
          <div class="field">
            <label for="pt-inst" class="field-label required">จำนวนงวด</label>
            <input
              uiInput
              type="number"
              id="pt-inst"
              formControlName="installments"
              min="1"
              class="w-full"
            />
            <app-field-error [control]="form.controls.installments" />
          </div>

          <div class="field">
            <label for="pt-interval" class="field-label required">ระยะห่างงวด (เดือน)</label>
            <input
              uiInput
              type="number"
              id="pt-interval"
              formControlName="intervalMonths"
              min="0"
              class="w-full"
            />
            <app-field-error [control]="form.controls.intervalMonths" />
          </div>

          <div class="field">
            <label for="pt-due" class="field-label required">งวดแรกครบกำหนด (วัน)</label>
            <input
              uiInput
              type="number"
              id="pt-due"
              formControlName="firstDueDays"
              min="0"
              class="w-full"
            />
            <app-field-error [control]="form.controls.firstDueDays" />
          </div>
        </div>

        <div class="field checkbox-field">
          <label class="checkbox-label">
            <input type="checkbox" formControlName="active" />
            <span>เปิดใช้งานเงื่อนไขนี้</span>
          </label>
        </div>

        @if (saveError()) {
          <div class="save-error">{{ saveError() }}</div>
        }
      </form>

      <ng-template #footer>
        <ui-button label="ยกเลิก" [outlined]="true" severity="secondary" (onClick)="dialogVisible = false" />
        <ui-button
          [label]="editId() ? 'บันทึกการแก้ไข' : 'สร้างเงื่อนไข'"
          icon="pi pi-check"
          [loading]="saving()"
          (onClick)="save()"
        />
      </ng-template>
    </ui-dialog>
  `,
  styles: [`
    .code-badge {
      display: inline-block;
      padding: 2px 7px;
      font-size: 0.8rem;
      background: var(--surface-100, #f1f5f9);
      color: var(--primary-700, #1d4ed8);
      border-radius: 4px;
      font-family: monospace;
      font-weight: 600;
    }
    .num-badge {
      display: inline-block;
      padding: 2px 8px;
      font-size: 0.82rem;
      background: var(--surface-50, #f8fafc);
      border: 1px solid var(--surface-200, #e2e8f0);
      border-radius: 4px;
      font-weight: 600;
    }
    .text-secondary {
      color: var(--text-color-secondary);
      font-size: 0.88rem;
    }
    .badge-active {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.78rem;
      font-weight: 600;
      background: #dcfce7;
      color: #15803d;
    }
    .badge-inactive {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.78rem;
      font-weight: 600;
      background: #f1f5f9;
      color: #64748b;
    }
    .action-buttons {
      display: flex;
      justify-content: center;
      gap: 0.25rem;
    }
    .form-grid {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding-top: 0.5rem;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .field-row-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
    }
    .field-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-color);
    }
    .field-label.required::after {
      content: ' *';
      color: var(--red-500, #ef4444);
    }
    .checkbox-field {
      padding-top: 0.25rem;
    }
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      font-size: 0.9rem;
    }
    .save-error {
      color: var(--red-600, #dc2626);
      font-size: 0.85rem;
      padding: 0.5rem;
      background: #fef2f2;
      border-radius: 4px;
      border: 1px solid #fecaca;
    }
    .w-full {
      width: 100%;
    }
  `],
})
export class PaymentTermsPage implements OnInit {
  private readonly api = inject(MasterApi);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<PaymentTerm[]>([]);
  readonly state = signal<'loading' | 'error' | 'success'>('loading');
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly editId = signal<string | null>(null);

  dialogVisible = false;

  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(50)]],
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: [''],
    installments: [1, [Validators.required, Validators.min(1)]],
    intervalMonths: [0, [Validators.required, Validators.min(0)]],
    firstDueDays: [30, [Validators.required, Validators.min(0)]],
    active: [true],
  });

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.state.set('loading');
    this.api.listPaymentTerms().subscribe({
      next: (res) => {
        this.items.set(res.data ?? []);
        this.state.set('success');
      },
      error: () => {
        this.state.set('error');
      },
    });
  }

  openCreate(): void {
    this.editId.set(null);
    this.saveError.set(null);
    this.form.reset({
      code: '',
      name: '',
      description: '',
      installments: 1,
      intervalMonths: 0,
      firstDueDays: 30,
      active: true,
    });
    this.dialogVisible = true;
  }

  openEdit(row: PaymentTerm): void {
    this.editId.set(row.id);
    this.saveError.set(null);
    this.form.patchValue({
      code: row.code,
      name: row.name,
      description: row.description ?? '',
      installments: row.installments,
      intervalMonths: row.intervalMonths,
      firstDueDays: row.firstDueDays,
      active: row.active,
    });
    this.dialogVisible = true;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const val = this.form.getRawValue();
    this.saving.set(true);
    this.saveError.set(null);

    const body = {
      code: (val.code ?? '').trim().toUpperCase(),
      name: (val.name ?? '').trim(),
      description: val.description ? val.description.trim() : null,
      installments: Number(val.installments ?? 1),
      intervalMonths: Number(val.intervalMonths ?? 0),
      firstDueDays: Number(val.firstDueDays ?? 30),
      active: Boolean(val.active),
    };

    const id = this.editId();
    const req$ = id
      ? this.api.updatePaymentTerm(id, body)
      : this.api.createPaymentTerm(body);

    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.toast.add({
          severity: 'success',
          summary: 'สำเร็จ',
          detail: id ? 'แก้ไขเงื่อนไขการชำระเงินเรียบร้อยแล้ว' : 'เพิ่มเงื่อนไขการชำระเงินเรียบร้อยแล้ว',
        });
        this.loadData();
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message ?? (id ? 'ไม่สามารถแก้ไขได้' : 'ไม่สามารถสร้างได้');
        this.saveError.set(msg);
      },
    });
  }

  confirmDelete(row: PaymentTerm): void {
    this.confirm.confirm({
      header: 'ยืนยันการลบ',
      message: `คุณต้องการลบเงื่อนไขการชำระเงิน "${row.name}" (${row.code}) ใช่หรือไม่?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'ลบ',
      rejectLabel: 'ยกเลิก',
      accept: () => {
        this.api.deletePaymentTerm(row.id).subscribe({
          next: () => {
            this.toast.add({
              severity: 'success',
              summary: 'สำเร็จ',
              detail: 'ลบเงื่อนไขการชำระเงินเรียบร้อยแล้ว',
            });
            this.loadData();
          },
          error: (err) => {
            const msg = err?.error?.message ?? 'ไม่สามารถลบได้';
            this.toast.add({
              severity: 'error',
              summary: 'เกิดข้อผิดพลาด',
              detail: msg,
            });
          },
        });
      },
    });
  }
}
