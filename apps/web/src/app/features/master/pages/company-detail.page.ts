import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppFieldErrorComponent } from '../../../shared/components/app-field-error/app-field-error.component';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthStore } from '../../../core/auth/auth.store';
import { MasterApi, type InsuranceCompany, type InsuranceProduct, type InsurerContact, type InsurerProduct, type InsurerStats } from '../data/master.api';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { ConfirmationService, MessageService, UiButton, UiConfirmDialog, UiDialog, UiInput, UiSelect, UiTable } from '../../../shared/ui';

@Component({
  selector: 'app-company-detail-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    UiTable,
    UiButton,
    UiDialog,
    UiInput,
    UiSelect,
    UiConfirmDialog,
    AppPageHeaderComponent,
    AppStateComponent,
    AppFieldErrorComponent,
    HasPermissionDirective,
    MoneyPipe,
  ],
  template: `
    <ui-confirm-dialog />

    @if (company(); as co) {
      <app-page-header [title]="co.name" [subtitle]="'รหัส: ' + co.code">
        <ui-button label="ย้อนกลับ" icon="pi pi-arrow-left" severity="secondary" [outlined]="true" routerLink="/master/companies" />
      </app-page-header>

      <!-- Tabs Navigation -->
      <div class="tabs-nav">
        <button [class.active]="activeTab() === 'info'" (click)="activeTab.set('info')">
          <i class="pi pi-info-circle"></i> ข้อมูลบริษัท
        </button>
        <button [class.active]="activeTab() === 'contacts'" (click)="activeTab.set('contacts')">
          <i class="pi pi-users"></i> ผู้ติดต่อ ({{ contacts().length }})
        </button>
        <button [class.active]="activeTab() === 'rates'" (click)="loadProducts(); activeTab.set('rates')">
          <i class="pi pi-percentage"></i> Product & ค่าคอมมิชชั่น
        </button>
        <button [class.active]="activeTab() === 'stats'" (click)="loadStats(); activeTab.set('stats')">
          <i class="pi pi-chart-bar"></i> สถิติการดำเนินงาน
        </button>
      </div>

      <!-- Tab: Info -->
      @if (activeTab() === 'info') {
        <div class="card">
          <div class="info-grid">
            <div><span class="label">รหัส:</span> <code>{{ co.code }}</code></div>
            <div><span class="label">ชื่อบริษัท:</span> {{ co.name }}</div>
            <div><span class="label">เลขประจำตัวผู้เสียภาษี:</span> {{ co.taxId || '-' }}</div>
            <div><span class="label">เลขที่บัญชีธนาคาร:</span> {{ co.bankAccount || '-' }}</div>
            <div><span class="label">โทรศัพท์:</span> {{ co.phone || '-' }}</div>
            <div><span class="label">อีเมล:</span> {{ co.email || '-' }}</div>
            <div class="full-width"><span class="label">ที่อยู่:</span> {{ co.address || '-' }}</div>
            <div>
              <span class="label">สถานะ:</span>
              <span [class]="co.status === 'ACTIVE' ? 'badge-active' : 'badge-inactive'">
                {{ co.status === 'ACTIVE' ? 'ใช้งาน' : 'ไม่ใช้งาน' }}
              </span>
            </div>
          </div>
        </div>
      }

      <!-- Tab: Contacts -->
      @if (activeTab() === 'contacts') {
        <div class="card">
          <div class="tab-header">
            <h3>รายชื่อผู้ติดต่อ / Underwriter</h3>
            <ui-button *appHasPermission="'master.manage'" label="เพิ่มผู้ติดต่อ" icon="pi pi-plus" size="small" (onClick)="openCreateContact()" />
          </div>

          <ui-table [value]="contacts()" styleClass="p-datatable-sm p-datatable-striped">
            <ng-template #header>
              <tr>
                <th>ชื่อ-นามสกุล</th>
                <th>ตำแหน่ง</th>
                <th>โทรศัพท์</th>
                <th>อีเมล</th>
                <th style="width:110px">บทบาท</th>
                <th style="width:100px">จัดการ</th>
              </tr>
            </ng-template>
            <ng-template #body let-ct>
              <tr>
                <td>
                  <strong>{{ ct.name }}</strong>
                  @if (ct.isPrimary) {
                    <span class="badge-primary">ผู้ติดต่อหลัก</span>
                  }
                </td>
                <td>{{ ct.position || '-' }}</td>
                <td>{{ ct.phone || '-' }}</td>
                <td>{{ ct.email || '-' }}</td>
                <td>
                  @if (ct.isUnderwriter) {
                    <span class="badge-uw">Underwriter</span>
                  } @else {
                    <span class="sub">ทั่วไป</span>
                  }
                </td>
                <td>
                  <div class="action-buttons">
                    <ui-button *appHasPermission="'master.manage'" icon="pi pi-pencil" [text]="true" size="small" severity="secondary" (onClick)="openEditContact(ct)" />
                    <ui-button *appHasPermission="'master.manage'" icon="pi pi-trash" [text]="true" size="small" severity="danger" (onClick)="confirmDeleteContact(ct)" />
                  </div>
                </td>
              </tr>
            </ng-template>
            <ng-template #emptymessage>
              <tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-color-secondary)">ยังไม่มีข้อมูลผู้ติดต่อ</td></tr>
            </ng-template>
          </ui-table>
        </div>
      }

      <!-- Tab: Products & commission -->
      @if (activeTab() === 'rates') {
        <div class="card">
          <div class="tab-header">
            <h3>ผลิตภัณฑ์ที่รับประกัน และอัตราค่าคอมมิชชั่น</h3>
            <div class="header-actions">
              <ui-button *appHasPermission="'master.manage'" label="เพิ่มผลิตภัณฑ์" icon="pi pi-plus" size="small" (onClick)="openAddProduct()" />
              <ui-button *appHasPermission="'master.manage'" label="จัดการอัตราคอมมิชชั่น" icon="pi pi-external-link" size="small" [outlined]="true" routerLink="/master/commission-rates" />
            </div>
          </div>

          @if (products().length === 0) {
            <p class="muted">ยังไม่ได้ระบุผลิตภัณฑ์ที่บริษัทนี้รับประกัน</p>
          } @else {
            <table class="simple-table">
              <thead>
                <tr>
                  <th>ผลิตภัณฑ์</th>
                  <th>ประเภท</th>
                  @if (canSeeRates) {
                    <th class="num">อัตราปัจจุบัน (%)</th>
                    <th>ประวัติอัตรา</th>
                  }
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (p of products(); track p.id) {
                  <tr>
                    <td>{{ p.productName }} <code>{{ p.productCode }}</code>@if (p.remark) { <div class="sub">{{ p.remark }}</div> }</td>
                    <td>{{ p.insuranceTypeName || '-' }}</td>
                    @if (canSeeRates) {
                      <td class="num">
                        @if (p.currentRate) { <strong>{{ p.currentRate }}</strong> } @else { <span class="sub">ยังไม่ได้ตั้งอัตรา</span> }
                      </td>
                      <td>
                        @for (r of p.rates; track r.id) {
                          <div class="sub">{{ r.rate }}% · {{ r.effectiveFrom }} → {{ r.effectiveTo || 'ปัจจุบัน' }}</div>
                        }
                      </td>
                    }
                    <td>
                      <ui-button *appHasPermission="'master.manage'" icon="pi pi-trash" [text]="true" size="small" severity="danger" (onClick)="confirmRemoveProduct(p)" />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      }

      <!-- Tab: Stats -->
      @if (activeTab() === 'stats') {
        <div class="stats-container">
          @if (stats(); as st) {
            <div class="stat-card">
              <div class="stat-num">{{ st.quotations.total }}</div>
              <div class="stat-label">ใบเสนอราคาทั้งหมด</div>
            </div>
            <div class="stat-card">
              <div class="stat-num">{{ st.quotations.received }}</div>
              <div class="stat-label">ได้รับราคาแล้ว</div>
            </div>
            <div class="stat-card">
              <div class="stat-num">{{ st.quotations.selected }}</div>
              <div class="stat-label">ถูกเลือก</div>
            </div>
            <div class="stat-card">
              <div class="stat-num">{{ st.winRatePct }}%</div>
              <div class="stat-label">อัตราได้งาน (เลือก ÷ ได้รับราคา)</div>
            </div>
            <div class="stat-card wide2">
              <div class="stat-num">{{ st.issuedPremium | money }} บาท</div>
              <div class="stat-label">เบี้ยรวมที่ออกกรมธรรม์ ({{ st.policies.issued }} ฉบับ)</div>
            </div>
            <div class="stat-card wide2">
              <div class="stat-num">{{ st.cancelledPremium | money }} บาท</div>
              <div class="stat-label">เบี้ยของกรมธรรม์ที่ยกเลิก ({{ st.policies.cancelled }} ฉบับ)</div>
            </div>
          } @else {
            <app-state state="loading" />
          }
        </div>
      }
    } @else {
      <app-state [state]="state()" />
    }

    <!-- Add accepted product -->
    <ui-dialog [(visible)]="productDialogVisible" header="เพิ่มผลิตภัณฑ์ที่รับประกัน" icon="pi pi-box" [modal]="true" [style]="{width:'460px'}">
      <div class="dialog-form">
        <div class="field">
          <label for="ip-product">ผลิตภัณฑ์ <span class="required">*</span></label>
          <ui-select class="w-full" inputId="ip-product" [(ngModel)]="newProductId" [options]="availableProducts()" optionLabel="name" optionValue="id" placeholder="เลือกผลิตภัณฑ์" />
        </div>
        <div class="field">
          <label for="ip-remark">หมายเหตุ</label>
          <input uiInput id="ip-remark" [(ngModel)]="newProductRemark" class="w-full" />
        </div>
        @if (productError()) { <small class="error-text">{{ productError() }}</small> }
        <div class="dialog-actions">
          <ui-button label="ปิด" severity="secondary" [outlined]="true" (onClick)="productDialogVisible=false" />
          <ui-button label="เพิ่ม" icon="pi pi-check" [loading]="savingProduct()" [disabled]="!newProductId || savingProduct()" (onClick)="addProduct()" />
        </div>
      </div>
    </ui-dialog>

    <!-- Contact Dialog -->
    <ui-dialog [(visible)]="contactDialogVisible" [header]="editContactId() ? 'แก้ไขผู้ติดต่อ' : 'เพิ่มผู้ติดต่อ'"
      [modal]="true" [style]="{width:'480px'}">
      <form [formGroup]="contactForm" (ngSubmit)="saveContact()" class="dialog-form">
        <div class="field">
          <label for="ct-name">ชื่อ-นามสกุล <span class="required">*</span></label>
          <input uiInput id="ct-name" formControlName="name" class="w-full" />
          <app-field-error [control]="contactForm.get('name')" />
        </div>
        <div class="field">
          <label for="ct-pos">ตำแหน่ง</label>
          <input uiInput id="ct-pos" formControlName="position" class="w-full" />
        </div>
        <div class="field">
          <label for="ct-phone">โทรศัพท์</label>
          <input uiInput id="ct-phone" formControlName="phone" class="w-full" />
        </div>
        <div class="field">
          <label for="ct-email">อีเมล</label>
          <input uiInput id="ct-email" formControlName="email" type="email" class="w-full" />
        </div>
        <div class="checkbox-field">
          <label>
            <input type="checkbox" formControlName="isUnderwriter" />
            เป็น Underwriter (พิจารณารับประกันภัย)
          </label>
        </div>
        <div class="checkbox-field">
          <label>
            <input type="checkbox" formControlName="isPrimary" />
            เป็นผู้ติดต่อหลัก (Primary Contact)
          </label>
        </div>

        <div class="dialog-actions">
          <ui-button label="ยกเลิก" icon="pi pi-times" severity="secondary" [outlined]="true" (onClick)="contactDialogVisible=false" />
          <ui-button label="บันทึก" icon="pi pi-check" type="submit" [loading]="savingContact()" />
        </div>
      </form>
    </ui-dialog>
  `,
  styles: [`
    .tabs-nav { display: flex; gap: 0.5rem; margin-bottom: 1rem; border-bottom: 1px solid var(--surface-border); padding-bottom: 0.5rem; }
    .tabs-nav button { padding: 0.5rem 1rem; border: none; background: transparent; cursor: pointer; font-size: 0.875rem; font-weight: 500; color: var(--text-color-secondary); border-radius: 6px; display: flex; align-items: center; gap: 0.5rem; }
    .tabs-nav button:hover { background: var(--surface-hover); color: var(--text-color); }
    .tabs-nav button.active { background: var(--primary-50); color: var(--primary-color); font-weight: 600; }
    .card { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 8px; padding: 1.5rem; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.875rem; }
    .full-width { grid-column: span 2; }
    .label { color: var(--text-color-secondary); display: inline-block; width: 140px; }
    .tab-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .tab-header h3 { margin: 0; font-size: 1rem; font-weight: 600; }
    .badge-primary { background: var(--blue-100); color: var(--blue-700); font-size: 0.7rem; padding: 1px 6px; border-radius: 4px; margin-left: 6px; }
    .badge-uw { background: var(--purple-100); color: var(--purple-700); font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; }
    .badge-active { background: var(--green-100); color: var(--green-700); padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.8rem; }
    .badge-inactive { background: var(--surface-200); color: var(--text-color-secondary); padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.8rem; }
    .action-buttons { display: flex; gap: 0.25rem; }
    .dialog-form { display: flex; flex-direction: column; gap: 0.75rem; }
    .field { display: flex; flex-direction: column; gap: 0.25rem; }
    .checkbox-field { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; }
    .dialog-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }
    .simple-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .simple-table th { text-align: left; padding: 0.5rem; background: var(--surface-ground); border-bottom: 2px solid var(--surface-border); }
    .simple-table td { padding: 0.5rem; border-bottom: 1px solid var(--surface-border); }
    .stats-container { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
    .stat-card { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 8px; padding: 1.25rem; text-align: center; }
    .stat-card.wide2 { grid-column: span 2; }
    .header-actions { display: flex; gap: 0.5rem; }
    .num { text-align: right; }
    .error-text { color: var(--red-600, #dc2626); }
    .stat-num { font-size: 1.75rem; font-weight: 700; color: var(--primary-color); margin-bottom: 0.25rem; }
    .stat-label { font-size: 0.85rem; color: var(--text-color-secondary); }
    .muted { color: var(--text-color-secondary); font-size: 0.875rem; }
    .sub { font-size: 0.8rem; color: var(--text-color-secondary); }
  `],
})
export class CompanyDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(MasterApi);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthStore);
  /** The broker's margin is shown only to roles with commission.rate_view; the API hides it from everyone else too. */
  readonly canSeeRates = this.auth.hasPermission('commission.rate_view');

  readonly companyId = signal<string>('');
  readonly company = signal<InsuranceCompany | null>(null);
  readonly contacts = signal<InsurerContact[]>([]);
  readonly stats = signal<InsurerStats | null>(null);
  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly activeTab = signal<'info' | 'contacts' | 'rates' | 'stats'>('info');
  readonly products = signal<InsurerProduct[]>([]);
  readonly allProducts = signal<InsuranceProduct[]>([]);
  readonly availableProducts = computed(() => {
    const taken = new Set(this.products().map((p) => p.productId));
    return this.allProducts().filter((p) => !taken.has(p.id));
  });
  productDialogVisible = false;
  newProductId = '';
  newProductRemark = '';
  readonly savingProduct = signal(false);
  readonly productError = signal<string | null>(null);

  contactDialogVisible = false;
  readonly editContactId = signal<string | null>(null);
  readonly savingContact = signal(false);

  readonly contactForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    position: [''],
    phone: [''],
    email: ['', Validators.email],
    isUnderwriter: [false],
    isPrimary: [false],
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.companyId.set(id);
      this.load();
    }
  }

  load() {
    this.state.set('loading');
    this.api.getCompany(this.companyId()).subscribe({
      next: (res) => {
        this.company.set(res.data);
        this.contacts.set(res.data.contacts || []);
        this.state.set('none');
      },
      error: () => this.state.set('error'),
    });
  }

  loadProducts() {
    this.api.listInsurerProducts(this.companyId()).subscribe({ next: (res) => this.products.set(res.data) });
  }

  openAddProduct() {
    this.newProductId = '';
    this.newProductRemark = '';
    this.productError.set(null);
    this.productDialogVisible = true;
    if (this.allProducts().length === 0) {
      this.api.listProducts().subscribe({ next: (res) => this.allProducts.set(res.data) });
    }
  }

  addProduct() {
    this.savingProduct.set(true);
    this.productError.set(null);
    this.api.addInsurerProduct(this.companyId(), { productId: this.newProductId, ...(this.newProductRemark.trim() ? { remark: this.newProductRemark.trim() } : {}) }).subscribe({
      next: () => {
        this.savingProduct.set(false);
        this.productDialogVisible = false;
        this.toast.add({ severity: 'success', summary: 'เพิ่มผลิตภัณฑ์แล้ว' });
        this.loadProducts();
      },
      error: (e: HttpErrorResponse) => {
        this.savingProduct.set(false);
        this.productError.set((e.error as { message?: string } | null)?.message ?? 'ไม่สามารถเพิ่มได้');
      },
    });
  }

  confirmRemoveProduct(p: InsurerProduct) {
    this.confirm.confirm({
      message: `เลิกรับประกัน "${p.productName}" กับบริษัทนี้ใช่หรือไม่? (อัตราค่าคอมที่ตั้งไว้ไม่ถูกลบ)`,
      header: 'ยืนยัน',
      accept: () => {
        this.api.removeInsurerProduct(this.companyId(), p.productId).subscribe({
          next: () => { this.toast.add({ severity: 'success', summary: 'นำออกแล้ว' }); this.loadProducts(); },
          error: () => this.toast.add({ severity: 'error', summary: 'ผิดพลาด' }),
        });
      },
    });
  }

  loadStats() {
    if (this.stats()) return;
    this.api.getCompanyStats(this.companyId()).subscribe({
      next: (res) => this.stats.set(res.data),
    });
  }

  openCreateContact() {
    this.editContactId.set(null);
    this.contactForm.reset();
    this.contactDialogVisible = true;
  }

  openEditContact(ct: InsurerContact) {
    this.editContactId.set(ct.id);
    this.contactForm.reset({
      name: ct.name,
      position: ct.position || '',
      phone: ct.phone || '',
      email: ct.email || '',
      isUnderwriter: ct.isUnderwriter,
      isPrimary: ct.isPrimary,
    });
    this.contactDialogVisible = true;
  }

  confirmDeleteContact(ct: InsurerContact) {
    this.confirm.confirm({
      message: `ต้องการลบผู้ติดต่อ "${ct.name}" ใช่หรือไม่?`,
      header: 'ยืนยันการลบ',
      accept: () => {
        this.api.deleteCompanyContact(ct.id).subscribe({
          next: () => {
            this.toast.add({ severity: 'success', summary: 'ลบสำเร็จ' });
            this.load();
          },
          error: () => this.toast.add({ severity: 'error', summary: 'ผิดพลาด' }),
        });
      },
    });
  }

  saveContact() {
    this.contactForm.markAllAsTouched();
    if (this.contactForm.invalid) return;

    this.savingContact.set(true);
    const id = this.editContactId();
    const val = this.contactForm.getRawValue();

    const req = id
      ? this.api.updateCompanyContact(id, val)
      : this.api.createCompanyContact(this.companyId(), val);

    req.subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'บันทึกผู้ติดต่อสำเร็จ' });
        this.contactDialogVisible = false;
        this.savingContact.set(false);
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.savingContact.set(false);
        this.toast.add({ severity: 'error', summary: (e.error as { message?: string } | null)?.message ?? 'ผิดพลาด' });
      },
    });
  }
}
