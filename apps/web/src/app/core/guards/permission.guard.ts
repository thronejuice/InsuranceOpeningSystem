import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { AuthStore } from '../auth/auth.store';

export const permissionGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const store = inject(AuthStore);
  const router = inject(Router);

  const required = route.data['permission'] as string | undefined;
  if (!required) return true;

  if (store.hasPermission(required)) return true;
  return router.createUrlTree(['/403']);
};
