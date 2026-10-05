import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Input,
  OnInit,
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { AppFieldErrorComponent } from '../../../shared/components/app-field-error/app-field-error.component';
import type { CustomerAddress } from '../data/customers.api';
import { UiButton, UiCheckbox, UiDivider, UiInput, UiSelect } from '../../../shared/ui';

const ADDRESS_TYPE_OPTIONS = [
  { label: 'บ้าน', value: 'HOME' },
  { label: 'สำนักงาน', value: 'OFFICE' },
  { label: 'ที่อยู่สำหรับวางบิล', value: 'BILLING' },
  { label: 'ที่อยู่จัดส่ง', value: 'SHIPPING' },
  { label: 'อื่นๆ', value: 'OTHER' },
];

@Component({
  selector: 'app-address-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, UiButton, UiInput, UiSelect, UiDivider, UiCheckbox, AppFieldErrorComponent],
  template: `
    <div class="address-editor">
      <div class="editor-header">
        <span class="font-semibold">ที่อยู่</span>
        <ui-button
          label="เพิ่มที่อยู่"
          icon="pi pi-plus"
          size="small"
          severity="secondary"
          (onClick)="addAddress()"
        />
      </div>

      @for (group of formArray.controls; track $index) {
        <div [formGroup]="asGroup(group)" class="address-item">
          <div class="address-item-header">
            <span class="address-index">ที่อยู่ที่ {{ $index + 1 }}</span>
            <ui-button
              icon="pi pi-trash"
              severity="danger"
              [text]="true"
              size="small"
              (onClick)="removeAddress($index)"
            />
          </div>
          <div class="form-grid">
            <div class="field">
              <label [attr.for]="'addr-type-' + $index">ประเภทที่อยู่ <span class="required">*</span></label>
              <ui-select class="w-full"
                [inputId]="'addr-type-' + $index"
                formControlName="addressType"
                [options]="addressTypeOptions"
                optionLabel="label"
                optionValue="value"
                placeholder="เลือกประเภท"
               
              />
              <app-field-error [control]="group.get('addressType')" />
            </div>
            <div class="field field-primary">
              <ui-checkbox
                formControlName="isPrimary"
                [binary]="true"
                label="ที่อยู่หลัก"
              />
            </div>
          </div>
          <div class="field">
            <label [attr.for]="'addr-line-' + $index">ที่อยู่ <span class="required">*</span></label>
            <input
              uiInput
              [id]="'addr-line-' + $index"
              formControlName="addressLine"
              placeholder="บ้านเลขที่ ถนน ซอย"
              class="w-full"
            />
            <app-field-error [control]="group.get('addressLine')" />
          </div>
          <div class="form-grid">
            <div class="field">
              <label [attr.for]="'addr-sub-' + $index">แขวง/ตำบล</label>
              <input uiInput [id]="'addr-sub-' + $index" formControlName="subDistrict" class="w-full" />
            </div>
            <div class="field">
              <label [attr.for]="'addr-dist-' + $index">เขต/อำเภอ</label>
              <input uiInput [id]="'addr-dist-' + $index" formControlName="district" class="w-full" />
            </div>
            <div class="field">
              <label [attr.for]="'addr-prov-' + $index">จังหวัด</label>
              <input uiInput [id]="'addr-prov-' + $index" formControlName="province" class="w-full" />
            </div>
            <div class="field">
              <label [attr.for]="'addr-post-' + $index">รหัสไปรษณีย์</label>
              <input uiInput [id]="'addr-post-' + $index" formControlName="postalCode" class="w-full" />
            </div>
          </div>
          @if ($index < formArray.length - 1) {
            <ui-divider />
          }
        </div>
      }

      @if (formArray.length === 0) {
        <p class="empty-hint">ยังไม่มีที่อยู่ กดปุ่ม "เพิ่มที่อยู่" เพื่อเพิ่ม</p>
      }
    </div>
  `,
  styles: [`
    .address-editor { display: flex; flex-direction: column; gap: 0.75rem; }
    .editor-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
    .address-item { border: 1px solid var(--surface-border); border-radius: 8px; padding: 1rem; }
    .address-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
    .address-index { font-size: 0.85rem; color: var(--text-color-secondary); font-weight: 600; }
    .form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
    .field { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.5rem; }
    .field-primary { justify-content: flex-end; padding-bottom: 0.25rem; }
    label { font-size: 0.875rem; font-weight: 500; }
    .required { color: var(--red-500); }
    .empty-hint { color: var(--text-color-secondary); font-size: 0.875rem; text-align: center; padding: 1rem; }
  `],
})
export class AddressEditorComponent implements OnInit {
  @Input({ required: true }) formArray!: FormArray;
  @Input() existingAddresses?: CustomerAddress[];

  private readonly fb = inject(FormBuilder);
  readonly addressTypeOptions = ADDRESS_TYPE_OPTIONS;

  ngOnInit(): void {
    if (this.existingAddresses?.length) {
      this.existingAddresses.forEach((addr) => {
        this.formArray.push(this.createGroup(addr));
      });
    }
  }

  createGroup(addr?: { addressType?: string; addressLine?: string; subDistrict?: string | null; district?: string | null; province?: string | null; postalCode?: string | null; country?: string | null; isPrimary?: boolean }): FormGroup {
    return this.fb.nonNullable.group({
      addressType: [addr?.addressType ?? 'HOME', Validators.required],
      addressLine: [addr?.addressLine ?? '', [Validators.required, Validators.maxLength(255)]],
      subDistrict: [addr?.subDistrict ?? ''],
      district: [addr?.district ?? ''],
      province: [addr?.province ?? ''],
      postalCode: [addr?.postalCode ?? ''],
      country: [addr?.country ?? 'Thailand'],
      isPrimary: [addr?.isPrimary ?? false],
    });
  }

  addAddress(): void {
    this.formArray.push(this.createGroup());
  }

  removeAddress(index: number): void {
    this.formArray.removeAt(index);
  }

  asGroup(ctrl: AbstractControl): FormGroup {
    return ctrl as FormGroup;
  }
}
