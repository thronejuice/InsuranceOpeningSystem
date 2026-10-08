import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppFieldErrorComponent } from '../../../shared/components/app-field-error/app-field-error.component';
import { AddressEditorComponent } from '../components/address-editor.component';
import { ContactEditorComponent } from '../components/contact-editor.component';
import { applyServerErrors } from '../../../shared/utils/form-errors';
import { CustomersApi, type Customer } from '../data/customers.api';
import { MessageService, UiButton, UiDivider, UiInput, UiMessage, UiSelect } from '../../../shared/ui';

const CUSTOMER_TYPE_OPTIONS = [
  { label: 'บุคคลธรรมดา', value: 'INDIVIDUAL' },
  { label: 'นิติบุคคล', value: 'CORPORATE' },
];

@Component({
  selector: 'app-customer-form-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, UiButton, UiInput, UiSelect, UiDivider, UiMessage, AppPageHeaderComponent, AppStateComponent, AppFieldErrorComponent, AddressEditorComponent, ContactEditorComponent],
  template: `
    @if (loadState() === 'loading') {
      <app-state state="loading" />
    } @else if (loadState() === 'error') {
      <app-state state="error" />
    } @else {
      <app-page-header
        [title]="isEdit ? 'แก้ไขข้อมูลลูกค้า' : 'เพิ่มลูกค้าใหม่'"
        [subtitle]="isEdit ? customerCode() : ''"
      />

      @if (serverError()) {
        <ui-message severity="error" class="mb-4 block">{{ serverError() }}</ui-message>
      }

      <form [formGroup]="form" (ngSubmit)="save()" class="form-layout">
        <div class="form-section">
          <h3 class="section-title">ข้อมูลพื้นฐาน</h3>

          <div class="form-row">
            <div class="field">
              <label for="customerType">ประเภทลูกค้า <span class="required">*</span></label>
              <ui-select class="w-full"
                inputId="customerType"
                formControlName="customerType"
                [options]="customerTypeOptions"
                optionLabel="label"
                optionValue="value"
               
              />
              <app-field-error [control]="form.get('customerType')" />
            </div>
          </div>

          @if (form.get('customerType')?.value === 'INDIVIDUAL') {
            <div class="form-row">
              <div class="field">
                <label for="firstName">ชื่อ <span class="required">*</span></label>
                <input
                  uiInput
                  id="firstName"
                  formControlName="firstName"
                  placeholder="ชื่อ"
                  class="w-full"
                />
                <app-field-error [control]="form.get('firstName')" />
              </div>
              <div class="field">
                <label for="lastName">นามสกุล <span class="required">*</span></label>
                <input
                  uiInput
                  id="lastName"
                  formControlName="lastName"
                  placeholder="นามสกุล"
                  class="w-full"
                />
                <app-field-error [control]="form.get('lastName')" />
              </div>
            </div>
            <div class="form-row">
              <div class="field">
                <label for="citizenId">เลขบัตรประชาชน</label>
                <input
                  uiInput
                  id="citizenId"
                  formControlName="citizenId"
                  placeholder="13 หลัก"
                  maxlength="13"
                  class="w-full"
                />
                <app-field-error [control]="form.get('citizenId')" />
              </div>
            </div>
          } @else {
            <div class="form-row">
              <div class="field field-full">
                <label for="companyName">ชื่อบริษัท <span class="required">*</span></label>
                <input
                  uiInput
                  id="companyName"
                  formControlName="companyName"
                  placeholder="ชื่อบริษัท/นิติบุคคล"
                  class="w-full"
                />
                <app-field-error [control]="form.get('companyName')" />
              </div>
            </div>
            <div class="form-row">
              <div class="field">
                <label for="taxId">เลขประจำตัวผู้เสียภาษี</label>
                <input
                  uiInput
                  id="taxId"
                  formControlName="taxId"
                  placeholder="13 หลัก"
                  maxlength="13"
                  class="w-full"
                />
                <app-field-error [control]="form.get('taxId')" />
              </div>
            </div>
          }

          <div class="form-row">
            <div class="field">
              <label for="phone">โทรศัพท์</label>
              <input uiInput id="phone" formControlName="phone" class="w-full" />
            </div>
            <div class="field">
              <label for="mobile">มือถือ</label>
              <input uiInput id="mobile" formControlName="mobile" class="w-full" />
            </div>
            <div class="field">
              <label for="email">อีเมล</label>
              <input uiInput id="email" formControlName="email" type="email" class="w-full" />
              <app-field-error [control]="form.get('email')" />
            </div>
          </div>

          <div class="field">
            <label for="remark">หมายเหตุ</label>
            <textarea
              uiInput
              id="remark"
              formControlName="remark"
              rows="3"
              class="w-full"
            ></textarea>
          </div>
        </div>

        <ui-divider />

        <div class="form-section">
          <app-address-editor
            [formArray]="addressArray"
            [existingAddresses]="existingCustomer()?.addresses"
          />
        </div>

        <ui-divider />

        <div class="form-section">
          <app-contact-editor
            [formArray]="contactArray"
            [existingContacts]="existingCustomer()?.contacts"
          />
        </div>

        <div class="form-actions">
          <ui-button
            label="ยกเลิก"
            icon="pi pi-times"
            severity="danger"
            [outlined]="true"
            type="button"
            (onClick)="cancel()"
          />
          <ui-button
            [label]="isEdit ? 'บันทึกการแก้ไข' : 'สร้างลูกค้า'"
            [icon]="isEdit ? 'pi pi-save' : 'pi pi-check'"
            type="submit"
            [loading]="saving()"
            [disabled]="saving()"
          />
        </div>
      </form>
    }
  `,
  styles: [`
    .form-layout { max-width: 900px; }
    .form-section { margin-bottom: 1.5rem; }
    .section-title { font-size: 1rem; font-weight: 600; margin-bottom: 1rem; color: var(--primary-color); }
    .form-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 0.75rem; }
    .field { display: flex; flex-direction: column; gap: 0.25rem; }
    .field-full { grid-column: 1 / -1; }
    label { font-size: 0.875rem; font-weight: 500; }
    .required { color: var(--red-500); }
    .form-actions { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.5rem; }
  `],
})
export class CustomerFormPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CustomersApi);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);

  readonly id = input<string>();

  readonly loadState = signal<'loading' | 'error' | 'none'>('none');
  readonly saving = signal(false);
  readonly serverError = signal<string | null>(null);
  readonly existingCustomer = signal<Customer | null>(null);
  readonly customerCode = signal('');

  readonly customerTypeOptions = CUSTOMER_TYPE_OPTIONS;

  get isEdit(): boolean {
    return !!this.id();
  }

  readonly form = this.fb.nonNullable.group({
    customerType: ['INDIVIDUAL' as 'INDIVIDUAL' | 'CORPORATE', Validators.required],
    firstName: [''],
    lastName: [''],
    companyName: [''],
    citizenId: [''],
    taxId: [''],
    phone: ['', Validators.maxLength(20)],
    mobile: ['', Validators.maxLength(20)],
    email: ['', [Validators.email, Validators.maxLength(200)]],
    remark: ['', Validators.maxLength(1000)],
    addresses: this.fb.array([]),
    contacts: this.fb.array([]),
  });

  get addressArray(): FormArray {
    return this.form.get('addresses') as FormArray;
  }

  get contactArray(): FormArray {
    return this.form.get('contacts') as FormArray;
  }

  ngOnInit(): void {
    if (this.isEdit) {
      this.loadState.set('loading');
      this.api.get(this.id()!).subscribe({
        next: (c) => {
          this.existingCustomer.set(c);
          this.customerCode.set(c.customerCode);
          this.form.patchValue({
            customerType: c.customerType,
            firstName: c.firstName ?? '',
            lastName: c.lastName ?? '',
            companyName: c.companyName ?? '',
            citizenId: c.citizenId ?? '',
            taxId: c.taxId ?? '',
            phone: c.phone ?? '',
            mobile: c.mobile ?? '',
            email: c.email ?? '',
            remark: c.remark ?? '',
          });
          this.loadState.set('none');
        },
        error: () => this.loadState.set('error'),
      });
    }
  }

  canDeactivate(): boolean {
    return !this.form.dirty;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.serverError.set(null);

    const raw = this.form.getRawValue();

    interface RawAddress {
      addressType: 'HOME' | 'OFFICE' | 'BILLING' | 'SHIPPING' | 'OTHER';
      addressLine: string;
      subDistrict: string;
      district: string;
      province: string;
      postalCode: string;
      country: string;
      isPrimary: boolean;
    }
    interface RawContact {
      contactName: string;
      position: string;
      department: string;
      phone: string;
      mobile: string;
      email: string;
      isPrimary: boolean;
    }

    const addresses = raw.addresses as RawAddress[];
    const contacts = raw.contacts as RawContact[];

    const body = {
      customerType: raw.customerType,
      ...(raw.customerType === 'INDIVIDUAL'
        ? { firstName: raw.firstName || undefined, lastName: raw.lastName || undefined, citizenId: raw.citizenId || undefined }
        : { companyName: raw.companyName || undefined, taxId: raw.taxId || undefined }),
      phone: raw.phone || undefined,
      mobile: raw.mobile || undefined,
      email: raw.email || undefined,
      remark: raw.remark || undefined,
      addresses: addresses.map((a) => ({
        addressType: a.addressType,
        addressLine: a.addressLine,
        subDistrict: a.subDistrict || undefined,
        district: a.district || undefined,
        province: a.province || undefined,
        postalCode: a.postalCode || undefined,
        country: a.country || undefined,
        isPrimary: a.isPrimary,
      })),
      contacts: contacts.map((c) => ({
        contactName: c.contactName,
        position: c.position || undefined,
        department: c.department || undefined,
        phone: c.phone || undefined,
        mobile: c.mobile || undefined,
        email: c.email || undefined,
        isPrimary: c.isPrimary,
      })),
    };

    const request$ = this.isEdit
      ? this.api.update(this.id()!, body)
      : this.api.create(body);

    request$.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (c) => {
        this.form.markAsPristine();
        this.toast.add({
          severity: 'success',
          summary: 'บันทึกสำเร็จ',
          detail: this.isEdit ? 'แก้ไขข้อมูลลูกค้าแล้ว' : 'สร้างลูกค้าใหม่แล้ว',
        });
        void this.router.navigate(['/customers', c.id]);
      },
      error: (e: HttpErrorResponse) => {
        const body = e.error as { errors?: Record<string, string[]>; message?: string } | null;
        if (e.status === 422 && body?.errors) {
          applyServerErrors(this.form, body as Parameters<typeof applyServerErrors>[1]);
        } else {
          this.serverError.set(body?.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่');
        }
      },
    });
  }

  cancel(): void {
    if (this.isEdit) {
      void this.router.navigate(['/customers', this.id()]);
    } else {
      void this.router.navigate(['/customers']);
    }
  }

  asControl(c: AbstractControl): AbstractControl {
    return c;
  }
}
