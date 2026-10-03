import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { Textarea } from 'primeng/textarea';
import { DatePicker } from 'primeng/datepicker';
import { Message } from 'primeng/message';
import { AutoComplete, type AutoCompleteSelectEvent } from 'primeng/autocomplete';
import { MessageService } from 'primeng/api';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppFieldErrorComponent } from '../../../shared/components/app-field-error/app-field-error.component';
import { applyServerErrors } from '../../../shared/utils/form-errors';
import { JobsApi } from '../data/jobs.api';
import { MasterApi, type InsuranceType, type InsuranceProduct } from '../../master/data/master.api';
import { CustomersApi, type Customer } from '../../customers/data/customers.api';
import { UsersApi, type User } from '../../users/data/users.api';

const PRIORITY_OPTIONS = [
  { label: 'ปกติ', value: 'NORMAL' },
  { label: 'ต่ำ', value: 'LOW' },
  { label: 'สูง', value: 'HIGH' },
  { label: 'เร่งด่วน', value: 'URGENT' },
];

@Component({
  selector: 'app-job-form-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputText,
    Select,
    Textarea,
    DatePicker,
    Message,
    AutoComplete,
    AppPageHeaderComponent,
    AppStateComponent,
    AppFieldErrorComponent,
  ],
  template: `
    @if (loadState() === 'loading') {
      <app-state state="loading" />
    } @else if (loadState() === 'error') {
      <app-state state="error" />
    } @else {
      <app-page-header title="สร้างงานประกันใหม่" subtitle="กรอกข้อมูลเพื่อเปิดงาน" />

      @if (serverError()) {
        <p-message severity="error" class="mb-4 block">{{ serverError() }}</p-message>
      }

      <form [formGroup]="form" (ngSubmit)="save()" class="form-layout">
        <div class="form-section">
          <h3 class="section-title">ข้อมูลลูกค้า</h3>
          <div class="form-row">
            <div class="field field-full">
              <label for="customer-search">ลูกค้า <span class="required">*</span></label>
              <p-autocomplete
                inputId="customer-search"
                formControlName="customerSearch"
                [suggestions]="customerSuggestions()"
                field="displayName"
                (completeMethod)="searchCustomers($event)"
                (onSelect)="onCustomerSelect($event)"
                (onClear)="onCustomerClear()"
                placeholder="พิมพ์ชื่อหรือรหัสลูกค้า..."
                styleClass="w-full"
                [showClear]="true"
              />
              @if (form.get('customerId')?.invalid && form.get('customerId')?.touched) {
                <small class="error-text">กรุณาเลือกลูกค้า</small>
              }
            </div>
          </div>
        </div>

        <div class="form-section">
          <h3 class="section-title">ข้อมูลประกันภัย</h3>
          <div class="form-row">
            <div class="field">
              <label for="insuranceTypeId">ประเภทประกัน <span class="required">*</span></label>
              <p-select
                inputId="insuranceTypeId"
                formControlName="insuranceTypeId"
                [options]="insuranceTypes()"
                optionLabel="name"
                optionValue="id"
                (ngModelChange)="onTypeChange()"
                placeholder="เลือกประเภทประกัน"
                styleClass="w-full"
              />
              <app-field-error [control]="form.get('insuranceTypeId')" />
            </div>
            <div class="field">
              <label for="productId">ผลิตภัณฑ์ <span class="required">*</span></label>
              <p-select
                inputId="productId"
                formControlName="productId"
                [options]="filteredProducts()"
                optionLabel="name"
                optionValue="id"
                [disabled]="!form.get('insuranceTypeId')?.value"
                placeholder="เลือกผลิตภัณฑ์"
                styleClass="w-full"
              />
              <app-field-error [control]="form.get('productId')" />
            </div>
          </div>
        </div>

        <div class="form-section">
          <h3 class="section-title">ข้อมูลกรมธรรม์</h3>
          <div class="form-row">
            <div class="field">
              <label for="effectiveDate">วันที่เริ่มคุ้มครอง <span class="required">*</span></label>
              <p-datepicker
                inputId="effectiveDate"
                formControlName="effectiveDate"
                dateFormat="dd/mm/yy"
                [showIcon]="true"
                styleClass="w-full"
              />
              <app-field-error [control]="form.get('effectiveDate')" />
            </div>
            <div class="field">
              <label for="expiryDate">วันที่สิ้นสุดคุ้มครอง</label>
              <p-datepicker
                inputId="expiryDate"
                formControlName="expiryDate"
                dateFormat="dd/mm/yy"
                [showIcon]="true"
                styleClass="w-full"
              />
            </div>
            <div class="field">
              <label for="priority">ความสำคัญ</label>
              <p-select
                inputId="priority"
                formControlName="priority"
                [options]="priorityOptions"
                optionLabel="label"
                optionValue="value"
                styleClass="w-full"
              />
            </div>
          </div>
          <div class="form-row">
            <div class="field">
              <label for="agentId">เจ้าหน้าที่รับผิดชอบ <span class="required">*</span></label>
              <p-select
                inputId="agentId"
                formControlName="agentId"
                [options]="agents()"
                optionLabel="fullName"
                optionValue="id"
                placeholder="เลือกเจ้าหน้าที่"
                styleClass="w-full"
              />
              <app-field-error [control]="form.get('agentId')" />
            </div>
            <div class="field">
              <label for="source">แหล่งที่มา</label>
              <input pInputText id="source" formControlName="source" class="w-full" placeholder="เช่น ลูกค้าเดิม, Online, Referral" />
            </div>
          </div>
          <div class="field">
            <label for="remark">หมายเหตุ</label>
            <textarea pTextarea id="remark" formControlName="remark" rows="3" class="w-full"></textarea>
          </div>
        </div>

        <div class="form-actions">
          <p-button
            label="ยกเลิก"
            severity="secondary"
            type="button"
            (onClick)="cancel()"
          />
          <p-button
            label="สร้างงาน"
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
    .error-text { color: var(--red-500); font-size: 0.8rem; }
    .form-actions { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.5rem; }
  `],
})
export class JobFormPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(JobsApi);
  private readonly masterApi = inject(MasterApi);
  private readonly customersApi = inject(CustomersApi);
  private readonly usersApi = inject(UsersApi);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);

  readonly loadState = signal<'loading' | 'error' | 'none'>('loading');
  readonly saving = signal(false);
  readonly serverError = signal<string | null>(null);

  readonly insuranceTypes = signal<InsuranceType[]>([]);
  readonly allProducts = signal<InsuranceProduct[]>([]);
  readonly filteredProducts = signal<InsuranceProduct[]>([]);
  readonly agents = signal<User[]>([]);
  readonly customerSuggestions = signal<(Customer & { displayName: string })[]>([]);

  readonly priorityOptions = PRIORITY_OPTIONS;

  readonly form = this.fb.nonNullable.group({
    customerSearch: [null as unknown as Customer & { displayName: string }],
    customerId: ['', Validators.required],
    insuranceTypeId: ['', Validators.required],
    productId: ['', Validators.required],
    agentId: ['', Validators.required],
    effectiveDate: [null as Date | null, Validators.required],
    expiryDate: [null as Date | null],
    priority: ['NORMAL'],
    source: [''],
    remark: [''],
  });

  ngOnInit(): void {
    this.loadMasterData();
  }

  canDeactivate(): boolean {
    return !this.form.dirty;
  }

  private loadMasterData(): void {
    this.loadState.set('loading');
    let typesDone = false;
    let agentsDone = false;

    const checkDone = () => {
      if (typesDone && agentsDone) this.loadState.set('none');
    };

    this.masterApi.listInsuranceTypes().subscribe({
      next: (res) => {
        this.insuranceTypes.set(res.data.filter((t) => t.active));
        this.masterApi.listProducts().subscribe({
          next: (p) => {
            this.allProducts.set(p.data.filter((x) => x.active));
            typesDone = true;
            checkDone();
          },
          error: () => this.loadState.set('error'),
        });
      },
      error: () => this.loadState.set('error'),
    });

    this.usersApi.listUsers().subscribe({
      next: (res) => {
        this.agents.set(res.data);
        agentsDone = true;
        checkDone();
      },
      error: () => this.loadState.set('error'),
    });
  }

  onTypeChange(): void {
    const typeId = this.form.get('insuranceTypeId')?.value;
    this.form.patchValue({ productId: '' });
    this.filteredProducts.set(
      typeId ? this.allProducts().filter((p) => p.insuranceTypeId === typeId) : []
    );
  }

  searchCustomers(event: { query: string }): void {
    this.customersApi.list({ q: event.query, perPage: 10 }).subscribe({
      next: (res) => {
        const items = res.data.map((c) => ({
          ...c,
          displayName:
            c.customerType === 'INDIVIDUAL'
              ? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.customerCode
              : c.companyName || c.customerCode,
        }));
        this.customerSuggestions.set(items);
      },
    });
  }

  onCustomerSelect(event: AutoCompleteSelectEvent): void {
    const customer = event.value as Customer & { displayName: string };
    this.form.patchValue({ customerId: customer.id });
    this.form.get('customerId')?.markAsTouched();
  }

  onCustomerClear(): void {
    this.form.patchValue({ customerId: '' });
  }

  save(): void {
    this.form.get('customerId')?.markAsTouched();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.serverError.set(null);

    const raw = this.form.getRawValue();
    const toDateStr = (d: Date | null) =>
      d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : undefined;

    const body = {
      customerId: raw.customerId,
      insuranceTypeId: raw.insuranceTypeId,
      productId: raw.productId,
      agentId: raw.agentId,
      effectiveDate: toDateStr(raw.effectiveDate)!,
      expiryDate: toDateStr(raw.expiryDate),
      priority: (raw.priority || undefined) as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' | undefined,
      source: raw.source || undefined,
      remark: raw.remark || undefined,
    };

    this.api.create(body).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (job) => {
        this.form.markAsPristine();
        this.toast.add({ severity: 'success', summary: 'สร้างงานสำเร็จ', detail: `เลขงาน: ${job.jobNo}` });
        void this.router.navigate(['/jobs', job.id]);
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
    void this.router.navigate(['/jobs']);
  }
}
