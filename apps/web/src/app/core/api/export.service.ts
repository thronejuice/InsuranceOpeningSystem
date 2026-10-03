import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

type FilterParams = Record<string, string | undefined | null>;

@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly http = inject(HttpClient);

  download(path: string, filters: FilterParams = {}): void {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v != null && v !== '') params = params.set(k, v);
    }

    this.http
      .get(`/api/reports/${path}/export`, { params, responseType: 'blob', observe: 'response' })
      .subscribe((resp) => {
        const blob = resp.body!;
        const cd = resp.headers.get('content-disposition') ?? '';
        const match = cd.match(/filename="?([^"]+)"?/);
        const filename = match?.[1] ?? `${path}.xlsx`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      });
  }
}
