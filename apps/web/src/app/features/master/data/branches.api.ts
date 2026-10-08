import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';

export interface Branch {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    users?: number;
    jobs?: number;
  };
}

export interface CreateBranchDto {
  code: string;
  name: string;
  address?: string;
  active?: boolean;
}

export interface UpdateBranchDto {
  code?: string;
  name?: string;
  address?: string;
  active?: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class BranchesApi {
  private readonly http = inject(HttpClient);

  listBranches(): Observable<Branch[]> {
    return this.http.get<ApiResponse<Branch[]>>('/api/master/branches').pipe(map((res) => res.data));
  }

  getBranch(id: string): Observable<Branch> {
    return this.http.get<ApiResponse<Branch>>(`/api/master/branches/${id}`).pipe(map((res) => res.data));
  }

  createBranch(dto: CreateBranchDto): Observable<Branch> {
    return this.http.post<ApiResponse<Branch>>('/api/master/branches', dto).pipe(map((res) => res.data));
  }

  updateBranch(id: string, dto: UpdateBranchDto): Observable<Branch> {
    return this.http.put<ApiResponse<Branch>>(`/api/master/branches/${id}`, dto).pipe(map((res) => res.data));
  }

  deleteBranch(id: string): Observable<void> {
    return this.http.delete<void>(`/api/master/branches/${id}`);
  }
}

