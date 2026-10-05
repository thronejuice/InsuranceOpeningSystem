import { inject } from '@angular/core';
import { HttpHandlerFn, HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { MessageService } from '../../shared/ui';

interface ApiError {
  success: false;
  code?: string;
  message?: string;
}

export const errorInterceptor: HttpInterceptorFn = (req, next: HttpHandlerFn) => {
  const messageService = inject(MessageService);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        const body = err.error as ApiError | null;
        const message = body?.message ?? 'เกิดข้อผิดพลาด';

        if (err.status === 403) {
          messageService.add({ severity: 'warn', summary: 'ไม่มีสิทธิ์', detail: message, life: 4000 });
        } else if (err.status === 409) {
          messageService.add({ severity: 'error', summary: 'ขัดแย้ง', detail: message, life: 4000 });
        } else if (err.status >= 500) {
          messageService.add({ severity: 'error', summary: 'เกิดข้อผิดพลาด', detail: message, life: 5000 });
        }
        // 422 ปล่อยผ่านให้ form จัดการเอง
      }
      return throwError(() => err);
    }),
  );
};
