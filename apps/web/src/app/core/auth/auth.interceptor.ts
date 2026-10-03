import { inject } from '@angular/core';
import {
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
  HttpErrorResponse,
} from '@angular/common/http';
import { catchError, switchMap, throwError, Observable, BehaviorSubject, filter, take } from 'rxjs';
import { AuthStore } from './auth.store';
import { HttpClient } from '@angular/common/http';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

interface RefreshResponse {
  accessToken: string;
  user: import('./auth.store').AuthUser;
}

let isRefreshing = false;
const refreshSubject = new BehaviorSubject<string | null>(null);

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const store = inject(AuthStore);
  const http = inject(HttpClient);

  const token = store.accessToken();
  const authReq = token ? addToken(req, token) : req;

  return next(authReq).pipe(
    catchError((err: unknown) => {
      if (
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        !req.url.includes('/auth/login') &&
        !req.url.includes('/auth/refresh') &&
        !req.url.includes('/auth/logout')
      ) {
        return handle401(req, next, store, http);
      }
      return throwError(() => err);
    }),
  );
};

function addToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

function handle401(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  store: AuthStore,
  http: HttpClient,
): Observable<HttpEvent<unknown>> {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshSubject.next(null);

    return http
      .post<ApiResponse<RefreshResponse>>('/api/auth/refresh', {}, { withCredentials: true })
      .pipe(
        switchMap((res) => {
          isRefreshing = false;
          const newToken = res.data.accessToken;
          store.setTokenAndUser(newToken, res.data.user);
          refreshSubject.next(newToken);
          return next(addToken(req, newToken));
        }),
        catchError((refreshErr) => {
          isRefreshing = false;
          refreshSubject.next(null);
          store.clearSession();
          return throwError(() => refreshErr);
        }),
      );
  }

  // Queue other requests while refreshing
  return refreshSubject.pipe(
    filter((token): token is string => token !== null),
    take(1),
    switchMap((token) => next(addToken(req, token))),
  );
}
