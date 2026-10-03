import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';

export type ImportType = 'customers' | 'customer-addresses' | 'jobs';

export interface RowError {
  row: number;
  field?: string;
  message: string;
}

export interface ImportResult {
  importedCount: number;
  errors: RowError[];
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class ImportsApi {
  private readonly http = inject(HttpClient);

  upload(type: ImportType, file: File, dryRun: boolean): Observable<ImportResult> {
    const form = new FormData();
    form.append('file', file);
    const params = new HttpParams().set('dryRun', String(dryRun));
    return this.http
      .post<ApiResponse<ImportResult>>(`/api/imports/${type}`, form, { params })
      .pipe(map((r) => r.data));
  }

  downloadTemplate(type: ImportType): void {
    const a = document.createElement('a');
    a.href = `/api/imports/templates/${type}`;
    a.download = `template-${type}.xlsx`;
    a.click();
  }
}
