import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthStore } from '../../core/auth/auth.store';
import { UiButton, UiInput, UiMessage, UiPassword } from '../../shared/ui';

interface ApiError {
  success: false;
  code?: string;
  message?: string;
}

@Component({
  selector: 'app-login-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, UiInput, UiPassword, UiButton, UiMessage],
  template: `
    <div class="login-wrapper">
      <div class="login-card">
        <div class="login-header">
          <div class="brand-badge">
            <i class="pi pi-shield"></i>
          </div>
          <h1 class="brand-title">ระบบเปิดงานประกันภัย</h1>
          <p class="brand-subtitle">Insurance Opening System • กรุณาเข้าสู่ระบบ</p>
        </div>

        @if (errorMsg()) {
          <ui-message severity="error" class="login-alert">{{ errorMsg() }}</ui-message>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" class="login-form">
          <div class="form-field">
            <label for="username" class="field-label">
              <i class="pi pi-user"></i>
              <span>ชื่อผู้ใช้</span>
            </label>
            <div class="input-container">
              <i class="pi pi-user input-icon"></i>
              <input
                uiInput
                id="username"
                formControlName="username"
                autocomplete="username"
                placeholder="กรอกชื่อผู้ใช้"
                class="login-input"
              />
            </div>
            @if (form.get('username')?.invalid && form.get('username')?.touched) {
              <small class="field-error">
                <i class="pi pi-exclamation-circle"></i>
                <span>กรุณากรอกชื่อผู้ใช้</span>
              </small>
            }
          </div>

          <div class="form-field">
            <label for="password" class="field-label">
              <i class="pi pi-lock"></i>
              <span>รหัสผ่าน</span>
            </label>
            <div class="input-container password-container">
              <ui-password
                class="w-full login-password"
                inputId="password"
                formControlName="password"
                prefixIcon="pi-lock"
                [feedback]="false"
                [toggleMask]="true"
                placeholder="กรอกรหัสผ่าน"
              />
            </div>
            @if (form.get('password')?.invalid && form.get('password')?.touched) {
              <small class="field-error">
                <i class="pi pi-exclamation-circle"></i>
                <span>กรุณากรอกรหัสผ่าน</span>
              </small>
            }
          </div>

          <ui-button
            label="เข้าสู่ระบบ"
            icon="pi pi-sign-in"
            type="submit"
            severity="primary"
            [loading]="store.loading()"
            [disabled]="form.invalid"
            class="w-full login-btn"
          />
        </form>

        <div class="login-footer">
          <span>© 2026 Insurance Opening System. All rights reserved.</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1.5rem;
      background-color: #f1f5f9;
      background-image:
        radial-gradient(at 15% 20%, rgba(25, 118, 210, 0.10) 0px, transparent 45%),
        radial-gradient(at 85% 80%, rgba(21, 101, 192, 0.08) 0px, transparent 45%),
        radial-gradient(at 50% 50%, #ffffff 0px, transparent 100%);
    }

    .login-card {
      width: 100%;
      max-width: 420px;
      background: #ffffff;
      border-radius: 16px;
      border: 1px solid #e2e8f0;
      box-shadow:
        0 10px 25px -5px rgba(15, 23, 42, 0.07),
        0 8px 10px -6px rgba(15, 23, 42, 0.04);
      padding: 2.25rem 2rem;
      position: relative;
      overflow: hidden;
      animation: loginFadeIn 0.35s ease-out;
    }

    .login-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(90deg, #1565c0, #1976d2, #42a5f5);
    }

    @keyframes loginFadeIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .login-header {
      text-align: center;
      margin-bottom: 1.75rem;
    }

    .brand-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 52px;
      height: 52px;
      border-radius: 14px;
      background: linear-gradient(135deg, #1976d2 0%, #0d47a1 100%);
      color: #ffffff;
      font-size: 1.5rem;
      margin-bottom: 1rem;
      box-shadow: 0 6px 16px rgba(25, 118, 210, 0.28);
    }

    .brand-title {
      font-size: 1.35rem;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.01em;
      margin-bottom: 0.35rem;
    }

    .brand-subtitle {
      font-size: 0.85rem;
      color: #64748b;
    }

    .login-alert {
      display: block;
      margin-bottom: 1.25rem;
      border-radius: 8px;
    }

    .login-form {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .field-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: #334155;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .field-label .pi {
      font-size: 0.8rem;
      color: #64748b;
    }

    .input-container {
      position: relative;
      display: flex;
      align-items: center;
      width: 100%;
    }

    .input-icon {
      position: absolute;
      left: 0.85rem;
      color: #94a3b8;
      font-size: 0.95rem;
      pointer-events: none;
      z-index: 2;
    }

    .login-input {
      width: 100%;
      height: 42px;
      padding-left: 2.35rem;
      padding-right: 0.85rem;
      font-size: 0.925rem;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #ffffff;
      color: #1e293b;
      transition: all 0.2s ease;
    }

    .login-input:hover {
      border-color: #94a3b8;
    }

    .login-input:focus {
      outline: none;
      border-color: #1976d2;
      box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.15);
    }

    .login-password {
      width: 100%;
    }

    .login-password ::ng-deep .mat-mdc-form-field-subscript-wrapper {
      display: none;
    }

    .login-password ::ng-deep .mat-mdc-text-field-wrapper {
      border-radius: 8px;
      background-color: #ffffff;
    }

    .field-error {
      color: #dc2626;
      font-size: 0.8rem;
      display: flex;
      align-items: center;
      gap: 0.25rem;
      margin-top: 0.2rem;
    }

    .login-btn {
      margin-top: 0.5rem;
    }

    .login-btn ::ng-deep button {
      height: 44px !important;
      font-size: 1rem !important;
      font-weight: 600 !important;
      letter-spacing: 0.01em;
      border-radius: 8px !important;
      background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%) !important;
      color: #ffffff !important;
      box-shadow: 0 4px 14px rgba(25, 118, 210, 0.32);
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .login-btn ::ng-deep button:hover:not(:disabled) {
      background: linear-gradient(135deg, #1e88e5 0%, #1976d2 100%) !important;
      box-shadow: 0 6px 18px rgba(25, 118, 210, 0.42);
      transform: translateY(-1px);
    }

    .login-btn ::ng-deep button:active:not(:disabled) {
      transform: translateY(0);
      box-shadow: 0 2px 6px rgba(25, 118, 210, 0.25);
    }

    .login-btn ::ng-deep button:disabled {
      background: #90caf9 !important;
      color: #ffffff !important;
      opacity: 0.65;
      box-shadow: none !important;
      cursor: not-allowed;
      transform: none;
    }

    .login-btn ::ng-deep .pi {
      font-size: 1.05rem;
    }

    .login-footer {
      margin-top: 1.75rem;
      text-align: center;
      font-size: 0.775rem;
      color: #94a3b8;
    }
  `],
})
export class LoginPage {
  protected readonly store = inject(AuthStore);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  protected readonly errorMsg = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  constructor() {
    if (this.store.isLoggedIn()) {
      void this.router.navigate(['/dashboard']);
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.errorMsg.set(null);
    try {
      await this.store.login(this.form.getRawValue());
    } catch (err) {
      const res = (err as HttpErrorResponse).error as ApiError | null;
      if ((err as HttpErrorResponse).status === 429) {
        this.errorMsg.set('เกินจำนวนครั้งที่อนุญาต กรุณารอสักครู่');
      } else {
        this.errorMsg.set(res?.message ?? 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      }
    }
  }
}
