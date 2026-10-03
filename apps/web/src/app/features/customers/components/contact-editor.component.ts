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
import { ButtonModule } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Divider } from 'primeng/divider';
import { Checkbox } from 'primeng/checkbox';
import { AppFieldErrorComponent } from '../../../shared/components/app-field-error/app-field-error.component';
import type { CustomerContact } from '../data/customers.api';

@Component({
  selector: 'app-contact-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputText,
    Divider,
    Checkbox,
    AppFieldErrorComponent,
  ],
  template: `
    <div class="contact-editor">
      <div class="editor-header">
        <span class="font-semibold">ผู้ติดต่อ</span>
        <p-button
          label="เพิ่มผู้ติดต่อ"
          icon="pi pi-plus"
          size="small"
          severity="secondary"
          (onClick)="addContact()"
        />
      </div>

      @for (group of formArray.controls; track $index) {
        <div [formGroup]="asGroup(group)" class="contact-item">
          <div class="contact-item-header">
            <span class="contact-index">ผู้ติดต่อที่ {{ $index + 1 }}</span>
            <p-button
              icon="pi pi-trash"
              severity="danger"
              [text]="true"
              size="small"
              (onClick)="removeContact($index)"
            />
          </div>
          <div class="form-grid">
            <div class="field">
              <label [attr.for]="'con-name-' + $index">ชื่อผู้ติดต่อ <span class="required">*</span></label>
              <input
                pInputText
                [id]="'con-name-' + $index"
                formControlName="contactName"
                placeholder="ชื่อ-นามสกุล"
                class="w-full"
              />
              <app-field-error [control]="group.get('contactName')" />
            </div>
            <div class="field">
              <label [attr.for]="'con-pos-' + $index">ตำแหน่ง</label>
              <input pInputText [id]="'con-pos-' + $index" formControlName="position" class="w-full" />
            </div>
            <div class="field">
              <label [attr.for]="'con-dept-' + $index">แผนก</label>
              <input pInputText [id]="'con-dept-' + $index" formControlName="department" class="w-full" />
            </div>
            <div class="field">
              <label [attr.for]="'con-phone-' + $index">โทรศัพท์</label>
              <input pInputText [id]="'con-phone-' + $index" formControlName="phone" class="w-full" />
            </div>
            <div class="field">
              <label [attr.for]="'con-mobile-' + $index">มือถือ</label>
              <input pInputText [id]="'con-mobile-' + $index" formControlName="mobile" class="w-full" />
            </div>
            <div class="field">
              <label [attr.for]="'con-email-' + $index">อีเมล</label>
              <input pInputText [id]="'con-email-' + $index" formControlName="email" type="email" class="w-full" />
              <app-field-error [control]="group.get('email')" />
            </div>
          </div>
          <div class="field">
            <p-checkbox formControlName="isPrimary" [binary]="true" label="ผู้ติดต่อหลัก" />
          </div>
          @if ($index < formArray.length - 1) {
            <p-divider />
          }
        </div>
      }

      @if (formArray.length === 0) {
        <p class="empty-hint">ยังไม่มีผู้ติดต่อ กดปุ่ม "เพิ่มผู้ติดต่อ" เพื่อเพิ่ม</p>
      }
    </div>
  `,
  styles: [`
    .contact-editor { display: flex; flex-direction: column; gap: 0.75rem; }
    .editor-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
    .contact-item { border: 1px solid var(--surface-border); border-radius: 8px; padding: 1rem; }
    .contact-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
    .contact-index { font-size: 0.85rem; color: var(--text-color-secondary); font-weight: 600; }
    .form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
    .field { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.5rem; }
    label { font-size: 0.875rem; font-weight: 500; }
    .required { color: var(--red-500); }
    .empty-hint { color: var(--text-color-secondary); font-size: 0.875rem; text-align: center; padding: 1rem; }
  `],
})
export class ContactEditorComponent implements OnInit {
  @Input({ required: true }) formArray!: FormArray;
  @Input() existingContacts?: CustomerContact[];

  private readonly fb = inject(FormBuilder);

  ngOnInit(): void {
    if (this.existingContacts?.length) {
      this.existingContacts.forEach((c) => {
        this.formArray.push(this.createGroup(c));
      });
    }
  }

  createGroup(contact?: { contactName?: string; position?: string | null; department?: string | null; phone?: string | null; mobile?: string | null; email?: string | null; isPrimary?: boolean }): FormGroup {
    return this.fb.nonNullable.group({
      contactName: [contact?.contactName ?? '', [Validators.required, Validators.maxLength(200)]],
      position: [contact?.position ?? ''],
      department: [contact?.department ?? ''],
      phone: [contact?.phone ?? '', Validators.maxLength(20)],
      mobile: [contact?.mobile ?? '', Validators.maxLength(20)],
      email: [contact?.email ?? '', [Validators.email, Validators.maxLength(200)]],
      isPrimary: [contact?.isPrimary ?? false],
    });
  }

  addContact(): void {
    this.formArray.push(this.createGroup());
  }

  removeContact(index: number): void {
    this.formArray.removeAt(index);
  }

  asGroup(ctrl: AbstractControl): FormGroup {
    return ctrl as FormGroup;
  }
}
