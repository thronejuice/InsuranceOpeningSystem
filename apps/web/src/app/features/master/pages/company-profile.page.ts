import { ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppFieldErrorComponent } from '../../../shared/components/app-field-error/app-field-error.component';
import { MasterApi, type BankAccount, type CompanyProfile } from '../data/master.api';
import { applyServerErrors } from '../../../shared/utils/form-errors';
import { MessageService, UiButton, UiInput, UiMessage } from '../../../shared/ui';

type BankForm = FormGroup<{
  bankName: FormControl<string>;
  branch: FormControl<string>;
  accountName: FormControl<string>;
  accountNo: FormControl<string>;
}>;

/** Letterhead / payment details printed on the customer proposal PDF. */
@Component({
  selector: 'app-company-profile-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, UiButton, UiInput, UiMessage, AppPageHeaderComponent, AppStateComponent, AppFieldErrorComponent],
  template: `
    <app-page-header title="ข้อมูลบริษัท (หัวกระดาษ)" subtitle="ข้อมูลนี้จะแสดงบนใบเสนอที่ส่งให้ลูกค้า" />

    @if (state() === 'loading') { <app-state state="loading" /> }
    @else if (state() === 'error') { <app-state state="error" /> }
    @else {
      @if (!configured()) {
        <ui-message severity="warn" class="mb-3 block">ยังไม่ได้ตั้งค่าข้อมูลบริษัท ใบเสนอจะแสดงหัวกระดาษว่าง กรุณากรอกข้อมูลแล้วกดบันทึก</ui-message>
      }

      <form [formGroup]="form" (ngSubmit)="save()" class="profile-form">
        <section class="card">
          <h3>ข้อมูลบริษัท</h3>
          <div class="form-grid">
            <div class="field">
              <label for="cp-nameTh">ชื่อบริษัท (ไทย) <span class="required">*</span></label>
              <input uiInput id="cp-nameTh" formControlName="nameTh" />
              <app-field-error [control]="form.get('nameTh')" />
            </div>
            <div class="field">
              <label for="cp-nameEn">ชื่อบริษัท (อังกฤษ)</label>
              <input uiInput id="cp-nameEn" formControlName="nameEn" />
            </div>
            <div class="field">
              <label for="cp-addrTh">ที่อยู่ (ไทย)</label>
              <textarea uiInput id="cp-addrTh" formControlName="addressTh" rows="2"></textarea>
            </div>
            <div class="field">
              <label for="cp-addrEn">ที่อยู่ (อังกฤษ)</label>
              <textarea uiInput id="cp-addrEn" formControlName="addressEn" rows="2"></textarea>
            </div>
            <div class="field">
              <label for="cp-tax">เลขประจำตัวผู้เสียภาษี</label>
              <input uiInput id="cp-tax" formControlName="taxId" />
            </div>
            <div class="field">
              <label for="cp-lic">เลขที่ใบอนุญาตนายหน้า คปภ.</label>
              <input uiInput id="cp-lic" formControlName="brokerLicenseNo" />
            </div>
            <div class="field">
              <label for="cp-phone">โทรศัพท์</label>
              <input uiInput id="cp-phone" formControlName="phone" />
            </div>
            <div class="field">
              <label for="cp-email">อีเมล</label>
              <input uiInput id="cp-email" formControlName="email" type="email" />
              <app-field-error [control]="form.get('email')" />
            </div>
            <div class="field">
              <label for="cp-web">เว็บไซต์</label>
              <input uiInput id="cp-web" formControlName="website" />
            </div>
          </div>
        </section>

        <section class="card">
          <h3>โลโก้</h3>
          <div class="logo-row">
            <div class="logo-box">
              @if (logoUrl()) { <img [src]="logoUrl()" alt="โลโก้บริษัท" /> }
              @else { <span class="muted">ไม่มีโลโก้</span> }
            </div>
            <div class="logo-actions">
              <input #logoInput type="file" accept="image/png,image/jpeg" hidden (change)="onLogoSelected($event)" />
              <ui-button label="อัปโหลดโลโก้" icon="pi pi-upload" severity="secondary" size="small"
                [disabled]="!configured()" [loading]="uploadingLogo()" (onClick)="logoInput.click()" />
              @if (hasLogo()) {
                <ui-button label="ลบโลโก้" icon="pi pi-trash" severity="danger" [text]="true" size="small" (onClick)="removeLogo()" />
              }
              <span class="muted">PNG หรือ JPG ไม่เกิน 2 MB @if (!configured()) { (บันทึกข้อมูลบริษัทก่อน) }</span>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="section-head">
            <h3>บัญชีธนาคารสำหรับรับชำระเงิน</h3>
            <ui-button label="เพิ่มบัญชี" icon="pi pi-plus" size="small" severity="secondary" [disabled]="bankAccounts.length >= 10" (onClick)="addBank()" />
          </div>
          @if (bankAccounts.length === 0) {
            <p class="muted">ยังไม่มีบัญชี — ใบเสนอจะแจ้งให้ลูกค้าติดต่อผู้เสนอเพื่อรับข้อมูลการชำระเงิน</p>
          }
          <div formArrayName="bankAccounts" class="bank-list">
            @for (acc of bankAccounts.controls; track acc; let i = $index) {
              <div class="bank-row" [formGroupName]="i">
                <div class="field">
                  <label [for]="'bk-name-' + i">ธนาคาร <span class="required">*</span></label>
                  <input uiInput [id]="'bk-name-' + i" formControlName="bankName" />
                  <app-field-error [control]="acc.get('bankName')" />
                </div>
                <div class="field">
                  <label [for]="'bk-branch-' + i">สาขา</label>
                  <input uiInput [id]="'bk-branch-' + i" formControlName="branch" />
                </div>
                <div class="field">
                  <label [for]="'bk-acname-' + i">ชื่อบัญชี <span class="required">*</span></label>
                  <input uiInput [id]="'bk-acname-' + i" formControlName="accountName" />
                  <app-field-error [control]="acc.get('accountName')" />
                </div>
                <div class="field">
                  <label [for]="'bk-acno-' + i">เลขที่บัญชี <span class="required">*</span></label>
                  <input uiInput [id]="'bk-acno-' + i" formControlName="accountNo" />
                  <app-field-error [control]="acc.get('accountNo')" />
                </div>
                <ui-button icon="pi pi-trash" severity="danger" [text]="true" size="small" styleClass="bank-remove" (onClick)="removeBank(i)" />
              </div>
            }
          </div>
        </section>

        <section class="card">
          <h3>เงื่อนไข / หมายเหตุมาตรฐานในใบเสนอ</h3>
          <div class="field">
            <label for="cp-terms">หนึ่งบรรทัดต่อหนึ่งข้อ</label>
            <textarea uiInput id="cp-terms" formControlName="proposalTerms" rows="6"></textarea>
          </div>
        </section>

        <div class="actions">
          <ui-button label="บันทึก" icon="pi pi-check" type="submit" [loading]="saving()" />
        </div>
      </form>
    }
  `,
  styles: [`
    .profile-form { display:flex; flex-direction:column; gap:1rem; max-width:1000px; }
    .card { background:var(--surface-card); border:1px solid var(--surface-border); border-radius:8px; padding:1rem 1.25rem; }
    h3 { font-size:1rem; font-weight:600; margin:0 0 0.75rem; }
    .section-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; }
    .section-head h3 { margin:0; }
    .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:0.75rem 1rem; }
    .field { display:flex; flex-direction:column; gap:0.25rem; min-width:0; }
    label { font-size:0.875rem; font-weight:500; }
    .required { color:var(--red-500); }
    .muted { color:var(--text-color-secondary); font-size:0.85rem; }
    .logo-row { display:flex; gap:1rem; align-items:center; flex-wrap:wrap; }
    .logo-box { width:120px; height:120px; border:1px dashed var(--surface-border); border-radius:8px; display:flex; align-items:center; justify-content:center; overflow:hidden; background:var(--surface-ground); }
    .logo-box img { max-width:100%; max-height:100%; object-fit:contain; }
    .logo-actions { display:flex; flex-direction:column; gap:0.5rem; align-items:flex-start; }
    .bank-list { display:flex; flex-direction:column; gap:0.75rem; }
    .bank-row { display:grid; grid-template-columns:1.2fr 1fr 1.6fr 1.2fr auto; gap:0.75rem; align-items:start; padding-bottom:0.75rem; border-bottom:1px dashed var(--surface-border); }
    .bank-row:last-child { border-bottom:none; padding-bottom:0; }
    :host ::ng-deep .bank-remove { margin-top:1.6rem; }
    .actions { display:flex; justify-content:flex-end; }
    @media (max-width: 768px) {
      .form-grid { grid-template-columns:1fr; }
      .bank-row { grid-template-columns:1fr 1fr; }
    }
  `],
})
export class CompanyProfilePage implements OnInit, OnDestroy {
  private readonly api = inject(MasterApi);
  private readonly toast = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly saving = signal(false);
  readonly uploadingLogo = signal(false);
  readonly configured = signal(false);
  readonly hasLogo = signal(false);
  readonly logoUrl = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    nameTh: ['', [Validators.required, Validators.maxLength(200)]],
    nameEn: ['', Validators.maxLength(200)],
    addressTh: ['', Validators.maxLength(500)],
    addressEn: ['', Validators.maxLength(500)],
    taxId: ['', Validators.maxLength(20)],
    brokerLicenseNo: ['', Validators.maxLength(50)],
    phone: ['', Validators.maxLength(50)],
    email: ['', [Validators.email, Validators.maxLength(200)]],
    website: ['', Validators.maxLength(200)],
    proposalTerms: ['', Validators.maxLength(5000)],
    bankAccounts: this.fb.array<BankForm>([]),
  });

  get bankAccounts(): FormArray<BankForm> {
    return this.form.controls.bankAccounts;
  }

  ngOnInit() { this.load(); }

  ngOnDestroy() { this.revokeLogoUrl(); }

  private bankGroup(acc?: BankAccount): BankForm {
    return this.fb.nonNullable.group({
      bankName: [acc?.bankName ?? '', [Validators.required, Validators.maxLength(100)]],
      branch: [acc?.branch ?? '', Validators.maxLength(100)],
      accountName: [acc?.accountName ?? '', [Validators.required, Validators.maxLength(200)]],
      accountNo: [acc?.accountNo ?? '', [Validators.required, Validators.maxLength(50)]],
    });
  }

  load() {
    this.state.set('loading');
    this.api.getCompanyProfile().subscribe({
      next: (res) => { this.apply(res.data); this.state.set('none'); },
      error: () => this.state.set('error'),
    });
  }

  private apply(p: CompanyProfile) {
    this.configured.set(p.configured);
    this.form.reset({
      nameTh: p.nameTh,
      nameEn: p.nameEn ?? '',
      addressTh: p.addressTh ?? '',
      addressEn: p.addressEn ?? '',
      taxId: p.taxId ?? '',
      brokerLicenseNo: p.brokerLicenseNo ?? '',
      phone: p.phone ?? '',
      email: p.email ?? '',
      website: p.website ?? '',
      proposalTerms: p.proposalTerms ?? '',
    });
    this.bankAccounts.clear();
    for (const acc of p.bankAccounts) this.bankAccounts.push(this.bankGroup(acc));
    this.setLogo(p.hasLogo);
  }

  private setLogo(hasLogo: boolean) {
    this.hasLogo.set(hasLogo);
    this.revokeLogoUrl();
    if (!hasLogo) return;
    this.api.getCompanyLogo().subscribe({
      next: (blob) => this.logoUrl.set(URL.createObjectURL(blob)),
      error: () => this.logoUrl.set(null),
    });
  }

  private revokeLogoUrl() {
    const url = this.logoUrl();
    if (url) URL.revokeObjectURL(url);
    this.logoUrl.set(null);
  }

  addBank() { this.bankAccounts.push(this.bankGroup()); }

  removeBank(i: number) {
    this.bankAccounts.removeAt(i);
    this.form.markAsDirty();
  }

  save() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    this.api.updateCompanyProfile(this.form.getRawValue()).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.apply(res.data);
        this.toast.add({ severity: 'success', summary: 'บันทึกสำเร็จ' });
      },
      error: (err) => {
        this.saving.set(false);
        if (err?.error?.errors) applyServerErrors(this.form, err.error);
        else this.toast.add({ severity: 'error', summary: 'ผิดพลาด', detail: err?.error?.message ?? 'ไม่สามารถบันทึกได้' });
      },
    });
  }

  onLogoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      this.toast.add({ severity: 'error', summary: 'ไฟล์ใหญ่เกินไป', detail: 'โลโก้ต้องไม่เกิน 2 MB' });
      return;
    }
    this.uploadingLogo.set(true);
    this.api.uploadCompanyLogo(file).subscribe({
      next: (res) => {
        this.uploadingLogo.set(false);
        this.setLogo(res.data.hasLogo);
        this.toast.add({ severity: 'success', summary: 'อัปโหลดโลโก้แล้ว' });
      },
      error: (err) => {
        this.uploadingLogo.set(false);
        this.toast.add({ severity: 'error', summary: 'อัปโหลดไม่สำเร็จ', detail: err?.error?.message ?? '' });
      },
    });
  }

  removeLogo() {
    this.api.removeCompanyLogo().subscribe({
      next: (res) => this.setLogo(res.data.hasLogo),
      error: () => this.toast.add({ severity: 'error', summary: 'ผิดพลาด' }),
    });
  }
}
