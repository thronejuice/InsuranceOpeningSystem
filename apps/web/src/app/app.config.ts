import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { errorInterceptor } from './core/auth/error.interceptor';
import { provideAuthInitializer } from './core/auth/app-initializer';

function thaiPaginatorIntl(): MatPaginatorIntl {
  const intl = new MatPaginatorIntl();
  intl.itemsPerPageLabel = 'แสดงต่อหน้า';
  intl.nextPageLabel = 'หน้าถัดไป';
  intl.previousPageLabel = 'หน้าก่อนหน้า';
  intl.firstPageLabel = 'หน้าแรก';
  intl.lastPageLabel = 'หน้าสุดท้าย';
  intl.getRangeLabel = (page, size, len) => (len === 0 ? '0 จาก 0' : `${page * size + 1}–${Math.min((page + 1) * size, len)} จาก ${len}`);
  return intl;
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    provideAnimationsAsync(),
    provideNativeDateAdapter(),
    { provide: MAT_DATE_LOCALE, useValue: 'en-GB' },
    { provide: MatPaginatorIntl, useFactory: thaiPaginatorIntl },
    provideAuthInitializer(),
  ],
};
