import { APP_INITIALIZER, Provider } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthStore, AuthUser } from './auth.store';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

interface RefreshResponse {
  accessToken: string;
  user: AuthUser;
}

function initAuth(http: HttpClient, store: AuthStore): () => Promise<void> {
  return async () => {
    try {
      const res = await firstValueFrom(
        http.post<ApiResponse<RefreshResponse>>('/api/auth/refresh', {}, { withCredentials: true }),
      );
      store.setTokenAndUser(res.data.accessToken, res.data.user);
    } catch {
      // no existing session — proceed to login
    }
  };
}

export const provideAuthInitializer = (): Provider => ({
  provide: APP_INITIALIZER,
  useFactory: initAuth,
  deps: [HttpClient, AuthStore],
  multi: true,
});
