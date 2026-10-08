import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppFieldErrorComponent } from '../../../shared/components/app-field-error/app-field-error.component';
import { applyServerErrors } from '../../../shared/utils/form-errors';
import { JobsApi } from '../data/jobs.api';
import { MasterApi, type InsuranceType, type InsuranceProduct } from '../../master/data/master.api';
import { CustomersApi, type Customer } from '../../customers/data/customers.api';
import { UsersApi, type User } from '../../users/data/users.api';
import { AuthStore } from '../../../core/auth/auth.store';
import { MessageService, UiAutocomplete, UiAutocompleteSelectEvent, UiButton, UiDatepicker, UiInput, UiMessage, UiSelect } from '../../../shared/ui';

const PRIORITY_OPTIONS = [
  { label: 'ปกติ', value: 'NORMAL' },
  { label: 'ต่ำ', value: 'LOW' },
  { label: 'สูง', value: 'HIGH' },
  { label: 'เร่งด่วน', value: 'URGENT' },
];

export interface ValidationErrorItem {
  id: string;
  field: string;
  section: string;
  sectionNum: string;
  label: string;
}

@Component({
  selector: 'app-job-form-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    UiButton,
    UiInput,
    UiSelect,
    UiDatepicker,
    UiMessage,
    UiAutocomplete,
    AppPageHeaderComponent,
    AppStateComponent,
    AppFieldErrorComponent,
  ],
  template: `
    @if (loadState() === 'loading') {
      <app-state state="loading" mode="skeleton" />
    } @else if (loadState() === 'error') {
      <app-state state="error" errorMessage="ไม่สามารถโหลดข้อมูลหลักได้ กรุณาลองใหม่อีกครั้ง" />
    } @else {
      <div class="form-page-container">
        <app-page-header
          title="เปิดงานประกันภัยใหม่"
          subtitle="กรอกข้อมูลเพื่อเริ่มต้นเปิดงานประกันภัยเข้าสู่กระบวนการดำเนินงาน"
          icon="pi pi-file-plus"
          badge="เปิดงานใหม่"
        />

        @if (serverError()) {
          <ui-message severity="error" class="mb-4 block">{{ serverError() }}</ui-message>
        }

        <!-- Progress Track Strip -->
        <div class="progress-bar-card modern-card">
          <div class="progress-header">
            <div class="progress-info">
              <i class="pi pi-sliders-h progress-icon"></i>
              <span class="progress-label">ความสมบูรณ์ของข้อมูล</span>
              <span class="progress-fraction">{{ completedCount() }} จาก 3 ส่วนสำคัญ</span>
            </div>
            <span class="progress-percent">{{ completionPercent() }}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" [style.width.%]="completionPercent()"></div>
          </div>
        </div>

        <!-- Validation Alert Banner (แจ้งเตือนเมื่อกรอกข้อมูลไม่ครบ) -->
        @if (hasAttemptedSubmit() && validationErrors().length > 0) {
          <div class="validation-alert-card">
            <div class="alert-top">
              <div class="alert-icon-box">
                <i class="pi pi-exclamation-triangle"></i>
              </div>
              <div class="alert-text-group">
                <h4 class="alert-title">
                  ข้อมูลยังไม่ครบถ้วน — ยังขาดอีก {{ validationErrors().length }} รายการที่จำเป็นต้องระบุ
                </h4>
                <p class="alert-desc">
                  กรุณากรอกข้อมูลในส่วนต่อไปนี้ให้ครบถ้วนก่อนบันทึก (คลิกที่รายการด้านล่างเพื่อไปยังช่องนั้นได้ทันที):
                </p>
              </div>
            </div>
            <div class="missing-pills-list">
              @for (err of validationErrors(); track err.field) {
                <button
                  type="button"
                  class="missing-pill-btn"
                  (click)="scrollToField(err.id)"
                  [title]="'คลิกเพื่อไปยังช่อง ' + err.label"
                >
                  <span class="pill-section">{{ err.sectionNum }}</span>
                  <span class="pill-label">{{ err.label }}</span>
                  <i class="pi pi-arrow-up-right pill-arrow"></i>
                </button>
              }
            </div>
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="save()" (keydown.control.enter)="save()" (keydown.meta.enter)="save()" class="form-layout">
          <!-- Section 1: ข้อมูลลูกค้า -->
          <div
            class="form-card modern-card card-interactive"
            [class.is-complete]="formProgress().customer"
            [class.is-invalid]="hasAttemptedSubmit() && !formProgress().customer"
            id="section-customer"
          >
            <div class="card-header">
              <div class="header-left">
                <div class="step-badge">01</div>
                <div>
                  <h3 class="card-title">ข้อมูลลูกค้าผู้เอาประกัน</h3>
                  <p class="card-desc">ค้นหาหรือเลือกลูกค้าในระบบที่ต้องการเปิดงาน</p>
                </div>
              </div>
              @if (formProgress().customer) {
                <div class="status-pill status-pill-success">
                  <i class="pi pi-check"></i>
                  <span>เรียบร้อย</span>
                </div>
              } @else if (hasAttemptedSubmit()) {
                <div class="status-pill status-pill-error">
                  <i class="pi pi-exclamation-circle"></i>
                  <span>ยังไม่ได้เลือกลูกค้า</span>
                </div>
              } @else {
                <span class="required-indicator">จำเป็น</span>
              }
            </div>
            <div class="card-body">
              <div class="field field-full">
                <label for="customer-search">เลือกลูกค้า <span class="required">*</span></label>
                <ui-autocomplete class="w-full"
                  inputId="customer-search"
                  formControlName="customerSearch"
                  [suggestions]="customerSuggestions()"
                  field="displayName"
                  (completeMethod)="searchCustomers($event)"
                  (onSelect)="onCustomerSelect($event)"
                  (onClear)="onCustomerClear()"
                  placeholder="พิมพ์ชื่อ นามสกุล หรือรหัสลูกค้าเพื่อค้นหา..."
                  [showClear]="true"
                />
                @if (form.get('customerId')?.invalid && form.get('customerId')?.touched) {
                  <small class="error-text"><i class="pi pi-exclamation-circle"></i> กรุณาเลือกลูกค้าจากรายการ</small>
                }
              </div>
            </div>
          </div>

          <!-- Section 2: ข้อมูลประกันภัย -->
          <div
            class="form-card modern-card card-interactive"
            [class.is-complete]="formProgress().insurance"
            [class.is-invalid]="hasAttemptedSubmit() && !formProgress().insurance"
            id="section-insurance"
          >
            <div class="card-header">
              <div class="header-left">
                <div class="step-badge">02</div>
                <div>
                  <h3 class="card-title">ประเภทและผลิตภัณฑ์ประกันภัย</h3>
                  <p class="card-desc">ระบุหมวดหมู่ประเภทประกันและแผนผลิตภัณฑ์ที่ต้องการเปิดงาน</p>
                </div>
              </div>
              @if (formProgress().insurance) {
                <div class="status-pill status-pill-success">
                  <i class="pi pi-check"></i>
                  <span>เรียบร้อย</span>
                </div>
              } @else if (hasAttemptedSubmit()) {
                <div class="status-pill status-pill-error">
                  <i class="pi pi-exclamation-circle"></i>
                  <span>ข้อมูลยังไม่ครบ</span>
                </div>
              } @else {
                <span class="required-indicator">จำเป็น</span>
              }
            </div>
            <div class="card-body">
              <div class="form-grid grid-2">
                <div class="field">
                  <label for="insuranceTypeId">ประเภทประกัน <span class="required">*</span></label>
                  <ui-select class="w-full"
                    inputId="insuranceTypeId"
                    formControlName="insuranceTypeId"
                    [options]="insuranceTypes()"
                    optionLabel="name"
                    optionValue="id"
                    (onChange)="onTypeChange($event.value)"
                    placeholder="เลือกประเภทประกันภัย"
                  />
                  <app-field-error [control]="form.get('insuranceTypeId')" />
                </div>
                <div class="field">
                  <label for="productId">ผลิตภัณฑ์ประกันภัย <span class="required">*</span></label>
                  <ui-select class="w-full"
                    inputId="productId"
                    formControlName="productId"
                    [options]="filteredProducts()"
                    optionLabel="name"
                    optionValue="id"
                    placeholder="เลือกผลิตภัณฑ์"
                  />
                  @if (selectedInsuranceTypeId() && filteredProducts().length === 0) {
                    <small class="hint-text">ยังไม่มีผลิตภัณฑ์สำหรับประเภทนี้ กรุณาเพิ่มที่ข้อมูลหลัก → ผลิตภัณฑ์</small>
                  }
                  <app-field-error [control]="form.get('productId')" />
                </div>
              </div>
            </div>
          </div>

          <!-- Section 3: ข้อมูลกรมธรรม์ -->
          <div
            class="form-card modern-card card-interactive"
            [class.is-complete]="formProgress().policy"
            [class.is-invalid]="hasAttemptedSubmit() && !formProgress().policy"
            id="section-policy"
          >
            <div class="card-header">
              <div class="header-left">
                <div class="step-badge">03</div>
                <div>
                  <h3 class="card-title">ระยะเวลาคุ้มครองและผู้รับผิดชอบ</h3>
                  <p class="card-desc">ระบุช่วงเวลาเริ่มต้น-สิ้นสุดความคุ้มครอง และเจ้าหน้าที่ผู้ดูแลงาน</p>
                </div>
              </div>
              @if (formProgress().policy) {
                <div class="status-pill status-pill-success">
                  <i class="pi pi-check"></i>
                  <span>เรียบร้อย</span>
                </div>
              } @else if (hasAttemptedSubmit()) {
                <div class="status-pill status-pill-error">
                  <i class="pi pi-exclamation-circle"></i>
                  <span>ข้อมูลยังไม่ครบ</span>
                </div>
              } @else {
                <span class="required-indicator">จำเป็น</span>
              }
            </div>
            <div class="card-body">
              <div class="form-grid grid-3">
                <div class="field">
                  <label for="effectiveDate">วันที่เริ่มคุ้มครอง <span class="required">*</span></label>
                  <ui-datepicker class="w-full"
                    inputId="effectiveDate"
                    formControlName="effectiveDate"
                    dateFormat="dd/mm/yy"
                    [showIcon]="true"
                    (onChange)="onEffectiveDateChange($event.value)"
                  />
                  <app-field-error [control]="form.get('effectiveDate')" />
                </div>
                <div class="field">
                  <label for="expiryDate" class="label-with-hint">
                    <span>วันที่สิ้นสุดคุ้มครอง</span>
                    <span class="auto-calc-tag"><i class="pi pi-bolt"></i> +1 ปีอัตโนมัติ</span>
                  </label>
                  <ui-datepicker class="w-full"
                    inputId="expiryDate"
                    formControlName="expiryDate"
                    dateFormat="dd/mm/yy"
                    [showIcon]="true"
                  />
                </div>
                <div class="field">
                  <label for="priority">ระดับความสำคัญ</label>
                  <ui-select class="w-full"
                    inputId="priority"
                    formControlName="priority"
                    [options]="priorityOptions"
                    optionLabel="label"
                    optionValue="value"
                  />
                </div>
              </div>
              <div class="form-grid grid-2 mt-3">
                <div class="field">
                  <label for="agentId">เจ้าหน้าที่รับผิดชอบ <span class="required">*</span></label>
                  <ui-select class="w-full"
                    inputId="agentId"
                    formControlName="agentId"
                    [options]="agents()"
                    optionLabel="fullName"
                    optionValue="id"
                    placeholder="เลือกเจ้าหน้าที่"
                  />
                  <app-field-error [control]="form.get('agentId')" />
                </div>
                <div class="field">
                  <label for="source">แหล่งที่มาของงาน</label>
                  <input uiInput id="source" formControlName="source" class="w-full" placeholder="เช่น ลูกค้าเดิม, Facebook, โทรศัพท์, การแนะนำ" />
                </div>
              </div>
            </div>
          </div>

          <!-- Section 4: บันทึกเพิ่มเติม -->
          <div class="form-card modern-card card-interactive">
            <div class="card-header">
              <div class="header-left">
                <div class="step-badge step-optional">04</div>
                <div>
                  <h3 class="card-title">บันทึกเพิ่มเติม</h3>
                  <p class="card-desc">ข้อความหรือหมายเหตุเฉพาะสำหรับงานเปิดประกันนี้</p>
                </div>
              </div>
              <span class="optional-indicator">ไม่บังคับ</span>
            </div>
            <div class="card-body">
              <div class="field field-full">
                <label for="remark">หมายเหตุ / รายละเอียดเสริม</label>
                <textarea uiInput id="remark" formControlName="remark" rows="3" class="w-full" placeholder="ระบุข้อความหรือหมายเหตุเพิ่มเติม (ถ้ามี)..."></textarea>
              </div>
            </div>
          </div>

          <!-- Sticky Action Bar -->
          <div class="form-actions-bar modern-card">
            <div class="shortcut-hint">
              <i class="pi pi-info-circle mr-1"></i> กด <kbd class="kbd">Ctrl</kbd> + <kbd class="kbd">Enter</kbd> เพื่อเปิดงานได้ทันที
            </div>
            <div class="action-buttons">
              <ui-button
                label="ยกเลิก"
                icon="pi pi-times"
                severity="danger"
                [outlined]="true"
                type="button"
                (onClick)="cancel()"
              />
              <ui-button
                label="เปิดงานประกัน"
                icon="pi pi-check"
                type="submit"
                [loading]="saving()"
                [disabled]="saving()"
              />
            </div>
          </div>
        </form>
      </div>
    }
  `,
  styles: [`
    .form-page-container {
      max-width: 880px;
      margin: 0 auto;
      padding-bottom: 2rem;
    }
    .progress-bar-card {
      padding: 1rem 1.4rem;
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: var(--radius-lg);
      margin-bottom: 1.5rem;
    }
    .progress-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .progress-info {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .progress-icon {
      color: var(--primary-color);
      font-size: 0.95rem;
    }
    .progress-label {
      font-weight: 600;
      font-size: 0.88rem;
      color: var(--text-color);
    }
    .progress-fraction {
      font-size: 0.8rem;
      color: var(--text-color-secondary);
      background: var(--surface-hover);
      padding: 0.15rem 0.5rem;
      border-radius: var(--radius-full);
    }
    .progress-percent {
      font-weight: 700;
      font-size: 0.95rem;
      color: var(--primary-color);
    }
    .progress-track {
      height: 6px;
      background: var(--surface-border-subtle);
      border-radius: var(--radius-full);
      overflow: hidden;
      margin-top: 0.65rem;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--primary-color) 0%, #38bdf8 100%);
      border-radius: var(--radius-full);
      transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .validation-alert-card {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-left: 4px solid #f59e0b;
      border-radius: var(--radius-lg);
      padding: 1.25rem 1.4rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.08);
      animation: alertSlideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes alertSlideDown {
      from {
        opacity: 0;
        transform: translateY(-8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .alert-top {
      display: flex;
      align-items: flex-start;
      gap: 0.85rem;
    }
    .alert-icon-box {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #fef3c7;
      color: #d97706;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.15rem;
      flex-shrink: 0;
    }
    .alert-text-group {
      flex: 1;
    }
    .alert-title {
      font-size: 0.98rem;
      font-weight: 700;
      color: #92400e;
      margin: 0;
    }
    .alert-desc {
      font-size: 0.83rem;
      color: #b45309;
      margin: 0.2rem 0 0 0;
      line-height: 1.4;
    }
    .missing-pills-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 1rem;
      padding-top: 0.85rem;
      border-top: 1px solid rgba(245, 158, 11, 0.2);
    }
    .missing-pill-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.35rem 0.75rem;
      background: #ffffff;
      border: 1px solid #fcd34d;
      border-radius: var(--radius-full);
      color: #92400e;
      font-size: 0.82rem;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
      transition: all 0.2s ease;
    }
    .missing-pill-btn:hover {
      background: #fef3c7;
      border-color: #f59e0b;
      transform: translateY(-1px);
      box-shadow: 0 2px 6px rgba(245, 158, 11, 0.2);
    }
    .pill-section {
      background: #fef3c7;
      color: #b45309;
      font-size: 0.7rem;
      padding: 0.05rem 0.35rem;
      border-radius: 4px;
      font-weight: 700;
    }
    .pill-arrow {
      font-size: 0.75rem;
      color: #d97706;
    }
    .form-layout {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .form-card {
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: var(--radius-lg);
      padding: 1.4rem 1.5rem;
      box-shadow: var(--shadow-sm);
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .form-card:hover {
      border-color: #cbd5e1;
      box-shadow: var(--shadow-md);
    }
    .form-card:focus-within {
      border-color: var(--primary-color);
      box-shadow: var(--shadow-card-focus);
    }
    .form-card.is-complete {
      border-left: 4px solid var(--green-500);
    }
    .form-card.is-invalid {
      border-color: #fca5a5;
      border-left: 4px solid #ef4444;
      background: #fffdfd;
    }
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.25rem;
      padding-bottom: 0.85rem;
      border-bottom: 1px solid var(--surface-border-subtle);
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 0.85rem;
    }
    .step-badge {
      width: 34px;
      height: 34px;
      border-radius: var(--radius-md);
      background: var(--surface-hover);
      color: var(--text-color-secondary);
      font-weight: 700;
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--surface-border);
      transition: all 0.2s ease;
      flex-shrink: 0;
    }
    .form-card:focus-within .step-badge {
      background: var(--primary-50);
      color: var(--primary-color);
      border-color: var(--primary-100);
      transform: scale(1.05);
    }
    .form-card.is-complete .step-badge {
      background: var(--green-50);
      color: var(--green-700);
      border-color: var(--green-100);
    }
    .form-card.is-invalid .step-badge {
      background: var(--red-50);
      color: var(--red-600);
      border-color: var(--red-200);
    }
    .step-badge.step-optional {
      opacity: 0.75;
    }
    .card-title {
      font-size: 1rem;
      font-weight: 700;
      color: var(--text-color);
      margin: 0;
    }
    .card-desc {
      font-size: 0.8rem;
      color: var(--text-color-secondary);
      margin: 0.15rem 0 0 0;
    }
    .status-pill-success {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.2rem 0.65rem;
      border-radius: var(--radius-full);
      background: var(--green-50);
      border: 1px solid var(--green-100);
      color: var(--green-700);
      font-size: 0.75rem;
      font-weight: 600;
    }
    .status-pill-error {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.2rem 0.65rem;
      border-radius: var(--radius-full);
      background: var(--red-50);
      border: 1px solid var(--red-100);
      color: var(--red-600);
      font-size: 0.75rem;
      font-weight: 600;
    }
    .required-indicator {
      font-size: 0.75rem;
      color: var(--primary-color);
      background: var(--primary-50);
      border: 1px solid var(--primary-100);
      padding: 0.2rem 0.6rem;
      border-radius: var(--radius-full);
      font-weight: 600;
    }
    .optional-indicator {
      font-size: 0.75rem;
      color: var(--text-color-tertiary);
      background: var(--surface-hover);
      padding: 0.2rem 0.6rem;
      border-radius: var(--radius-full);
      font-weight: 500;
    }
    .card-body {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .form-grid {
      display: grid;
      gap: 1rem;
    }
    .grid-2 {
      grid-template-columns: repeat(2, 1fr);
    }
    .grid-3 {
      grid-template-columns: repeat(3, 1fr);
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .field-full {
      width: 100%;
    }
    label {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-color);
    }
    .label-with-hint {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .auto-calc-tag {
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--primary-color);
      background: var(--primary-50);
      padding: 0.1rem 0.45rem;
      border-radius: var(--radius-full);
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
    }
    .required {
      color: var(--red-500);
    }
    .error-text {
      color: var(--red-600);
      font-size: 0.78rem;
      display: flex;
      align-items: center;
      gap: 0.25rem;
      margin-top: 0.2rem;
    }
    .hint-text {
      color: var(--text-color-secondary);
      font-size: 0.78rem;
      margin-top: 0.2rem;
    }
    .form-actions-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.1rem 1.5rem;
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: var(--radius-lg);
      margin-top: 0.5rem;
      box-shadow: var(--shadow-sm);
    }
    .shortcut-hint {
      font-size: 0.8rem;
      color: var(--text-color-secondary);
      display: flex;
      align-items: center;
    }
    .kbd {
      padding: 0.1rem 0.4rem;
      background: var(--surface-hover);
      border: 1px solid var(--surface-border);
      border-radius: 4px;
      font-size: 0.75rem;
      font-family: inherit;
      color: var(--text-color);
      font-weight: 600;
      margin: 0 0.15rem;
    }
    .action-buttons {
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }
    @media (max-width: 768px) {
      .grid-2, .grid-3 {
        grid-template-columns: 1fr;
      }
      .form-actions-bar {
        flex-direction: column;
        gap: 1rem;
        align-items: stretch;
      }
      .action-buttons {
        justify-content: flex-end;
      }
    }
  `],
})
export class JobFormPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(JobsApi);
  private readonly masterApi = inject(MasterApi);
  private readonly customersApi = inject(CustomersApi);
  private readonly usersApi = inject(UsersApi);
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);

  readonly loadState = signal<'loading' | 'error' | 'none'>('loading');
  readonly saving = signal(false);
  readonly serverError = signal<string | null>(null);
  readonly hasAttemptedSubmit = signal(false);

  readonly insuranceTypes = signal<InsuranceType[]>([]);
  readonly allProducts = signal<InsuranceProduct[]>([]);
  readonly selectedInsuranceTypeId = signal<string>('');
  readonly filteredProducts = computed(() => {
    const typeId = this.selectedInsuranceTypeId();
    if (!typeId) return [];
    return this.allProducts().filter(
      (p) => p.insuranceTypeId === typeId || p.insuranceType?.id === typeId,
    );
  });
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

  readonly formProgress = signal<{ customer: boolean; insurance: boolean; policy: boolean }>({
    customer: false,
    insurance: false,
    policy: false,
  });

  readonly completedCount = computed(() => {
    const p = this.formProgress();
    return (p.customer ? 1 : 0) + (p.insurance ? 1 : 0) + (p.policy ? 1 : 0);
  });

  readonly completionPercent = computed(() => Math.round((this.completedCount() / 3) * 100));

  readonly validationErrors = computed<ValidationErrorItem[]>(() => {
    // Read formProgress signal to establish reactive dependency
    this.formProgress();
    const raw = this.form.getRawValue();
    const errors: ValidationErrorItem[] = [];

    if (!raw.customerId) {
      errors.push({
        id: 'customer-search',
        field: 'customerId',
        section: 'ข้อมูลลูกค้าผู้เอาประกัน',
        sectionNum: '01',
        label: 'ลูกค้าผู้เอาประกัน',
      });
    }
    if (!raw.insuranceTypeId) {
      errors.push({
        id: 'insuranceTypeId',
        field: 'insuranceTypeId',
        section: 'ประเภทและผลิตภัณฑ์ประกันภัย',
        sectionNum: '02',
        label: 'ประเภทประกันภัย',
      });
    }
    if (!raw.productId) {
      errors.push({
        id: 'productId',
        field: 'productId',
        section: 'ประเภทและผลิตภัณฑ์ประกันภัย',
        sectionNum: '02',
        label: 'ผลิตภัณฑ์ประกันภัย',
      });
    }
    if (!raw.effectiveDate) {
      errors.push({
        id: 'effectiveDate',
        field: 'effectiveDate',
        section: 'ระยะเวลาคุ้มครองและผู้รับผิดชอบ',
        sectionNum: '03',
        label: 'วันที่เริ่มคุ้มครอง',
      });
    }
    if (!raw.agentId) {
      errors.push({
        id: 'agentId',
        field: 'agentId',
        section: 'ระยะเวลาคุ้มครองและผู้รับผิดชอบ',
        sectionNum: '03',
        label: 'เจ้าหน้าที่รับผิดชอบ',
      });
    }

    return errors;
  });

  ngOnInit(): void {
    this.loadMasterData();

    this.form.controls.insuranceTypeId.valueChanges.subscribe((typeId) => {
      this.selectedInsuranceTypeId.set(typeId ?? '');
      this.form.controls.productId.setValue('');
    });

    this.form.controls.effectiveDate.valueChanges.subscribe((val) => {
      this.onEffectiveDateChange(val);
    });

    this.form.valueChanges.subscribe(() => {
      this.updateProgress();
    });
  }

  private updateProgress(): void {
    const raw = this.form.getRawValue();
    this.formProgress.set({
      customer: !!raw.customerId,
      insurance: !!raw.insuranceTypeId && !!raw.productId,
      policy: !!raw.effectiveDate && !!raw.agentId,
    });
  }

  onEffectiveDateChange(val?: unknown): void {
    const rawVal = (val instanceof Date ? val : this.form.controls.effectiveDate.value) ?? val;
    if (!rawVal) return;
    const d = rawVal instanceof Date ? new Date(rawVal.getTime()) : new Date(rawVal as string | number);
    if (!isNaN(d.getTime())) {
      const nextYear = new Date(d);
      const targetMonth = nextYear.getMonth();
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      if (nextYear.getMonth() !== targetMonth) {
        nextYear.setDate(0);
      }
      this.form.controls.expiryDate.setValue(nextYear);
    }
  }

  scrollToField(id: string): void {
    const el = document.getElementById(id);
    if (el) {
      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (typeof el.focus === 'function') {
        el.focus();
      }
    } else {
      const section = id === 'customer-search'
        ? document.getElementById('section-customer')
        : id === 'insuranceTypeId' || id === 'productId'
          ? document.getElementById('section-insurance')
          : document.getElementById('section-policy');
      if (typeof section?.scrollIntoView === 'function') {
        section?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  canDeactivate(): boolean {
    return !this.form.dirty;
  }

  private loadMasterData(): void {
    this.loadState.set('loading');
    let typesDone = false;
    let agentsDone = false;

    const checkDone = () => {
      if (typesDone && agentsDone) {
        this.loadState.set('none');
        this.updateProgress();
      }
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

    if (!this.authStore.hasPermission('job.view_all')) {
      const currentUser = this.authStore.user();
      if (currentUser) {
        const userAgent: User = {
          id: currentUser.id,
          username: currentUser.username,
          email: currentUser.email,
          fullName: currentUser.fullName,
          isActive: true,
          createdAt: '',
          updatedAt: '',
          roles: [],
        };
        this.agents.set([userAgent]);
        this.form.patchValue({ agentId: currentUser.id });
      }
      agentsDone = true;
      checkDone();
    } else {
      this.usersApi.listUsers().subscribe({
        next: (res) => {
          this.agents.set(res.data);
          agentsDone = true;
          checkDone();
        },
        error: () => this.loadState.set('error'),
      });
    }
  }

  onTypeChange(val?: unknown): void {
    const typeId = (typeof val === 'string' ? val : this.form.get('insuranceTypeId')?.value) || '';
    this.selectedInsuranceTypeId.set(typeId);
    this.form.patchValue({ productId: '' });
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

  onCustomerSelect(event: UiAutocompleteSelectEvent): void {
    const customer = event.value as Customer & { displayName: string };
    this.form.patchValue({ customerId: customer.id });
    this.form.get('customerId')?.markAsTouched();
    this.updateProgress();
  }

  onCustomerClear(): void {
    this.form.patchValue({ customerId: '' });
    this.updateProgress();
  }

  save(): void {
    this.hasAttemptedSubmit.set(true);
    this.form.get('customerId')?.markAsTouched();
    this.form.markAllAsTouched();
    this.updateProgress();

    const errors = this.validationErrors();
    if (errors.length > 0) {
      const missingLabels = errors.map((e) => e.label).join(', ');
      this.toast.add({
        severity: 'warn',
        summary: 'ข้อมูลยังไม่ครบถ้วน',
        detail: `กรุณากรอกข้อมูล: ${missingLabels}`,
      });
      this.scrollToField(errors[0].id);
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
