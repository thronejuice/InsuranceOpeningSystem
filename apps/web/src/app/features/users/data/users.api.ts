import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface UserRole {
  id: string;
  code: string;
  name: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
  roles: UserRole[];
}

export interface Role {
  id: string;
  code: string;
  name: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(HttpClient);

  listRoles() {
    return this.http.get<ApiResponse<Role[]>>('/api/users/roles');
  }

  listUsers() {
    return this.http.get<ApiResponse<User[]>>('/api/users');
  }

  createUser(body: { username: string; email: string; fullName: string; password: string; roleIds?: string[] }) {
    return this.http.post<ApiResponse<User>>('/api/users', body);
  }

  updateUser(id: string, body: { email?: string; fullName?: string; isActive?: boolean; roleIds?: string[] }) {
    return this.http.put<ApiResponse<User>>(`/api/users/${id}`, body);
  }

  resetPassword(id: string, password: string) {
    return this.http.post<void>(`/api/users/${id}/reset-password`, { password });
  }

  deactivateUser(id: string) {
    return this.http.delete<void>(`/api/users/${id}`);
  }
}
