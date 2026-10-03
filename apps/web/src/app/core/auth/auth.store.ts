import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  roles: string[];
  permissions: string[];
}

interface LoginRequest {
  username: string;
  password: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _user = signal<AuthUser | null>(null);
  private readonly _accessToken = signal<string | null>(null);
  private readonly _loading = signal(false);

  readonly user = this._user.asReadonly();
  readonly accessToken = this._accessToken.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);
  readonly permissions = computed(() => this._user()?.permissions ?? []);

  hasPermission(permission: string): boolean {
    return this.permissions().includes(permission);
  }

  async login(credentials: LoginRequest): Promise<void> {
    this._loading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<ApiResponse<AuthResponse>>('/api/auth/login', credentials),
      );
      this._accessToken.set(res.data.accessToken);
      this._user.set(res.data.user);
      await this.router.navigate(['/dashboard']);
    } finally {
      this._loading.set(false);
    }
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } catch {
      // ignore errors during logout
    } finally {
      this._user.set(null);
      this._accessToken.set(null);
      await this.router.navigate(['/login']);
    }
  }

  setTokenAndUser(token: string, user: AuthUser): void {
    this._accessToken.set(token);
    this._user.set(user);
  }

  clearSession(): void {
    this._user.set(null);
    this._accessToken.set(null);
  }
}
