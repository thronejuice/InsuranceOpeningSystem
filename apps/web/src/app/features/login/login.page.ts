import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { InputText } from 'primeng/inputtext';
import { Password } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { Card } from 'primeng/card';
import { Message } from 'primeng/message';
import { AuthStore } from '../../core/auth/auth.store';

interface ApiError {
  success: false;
  code?: string;
  message?: string;
}

@Component({
  selector: 'app-login-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    InputText,
    Password,
    ButtonModule,
    Card,
    Message,
  ],
  template: `
    <div class="login-wrapper">
      <p-card header="เข้าสู่ระบบ" class="login-card">
        @if (errorMsg()) {
          <p-message severity="error" class="mb-3 block">{{ errorMsg() }}</p-message>
        }
        <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-column gap-3">
          <div class="flex flex-column gap-1">
            <label for="username">ชื่อผู้ใช้</label>
            <input
              pInputText
              id="username"
              formControlName="username"
              autocomplete="username"
              placeholder="กรอกชื่อผู้ใช้"
            />
            @if (form.get('username')?.invalid && form.get('username')?.touched) {
              <small class="p-error">กรุณากรอกชื่อผู้ใช้</small>
            }
          </div>
          <div class="flex flex-column gap-1">
            <label for="password">รหัสผ่าน</label>
            <p-password
              inputId="password"
              formControlName="password"
              [feedback]="false"
              [toggleMask]="true"
              placeholder="กรอกรหัสผ่าน"
              styleClass="w-full"
            />
            @if (form.get('password')?.invalid && form.get('password')?.touched) {
              <small class="p-error">กรุณากรอกรหัสผ่าน</small>
            }
          </div>
          <p-button
            label="เข้าสู่ระบบ"
            type="submit"
            [loading]="store.loading()"
            [disabled]="form.invalid"
            class="w-full"
          />
        </form>
      </p-card>
    </div>
  `,
  styles: [`
    .login-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: var(--surface-ground);
    }
    .login-card {
      width: 100%;
      max-width: 420px;
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
