import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { permissionGuard } from '../../core/guards/permission.guard';

export const POLICIES_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'policy.view' },
    loadComponent: () =>
      import('./pages/policies-list.page').then((m) => m.PoliciesListPage),
  },
  {
    path: ':id',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'policy.view' },
    loadComponent: () =>
      import('./pages/policy-detail.page').then((m) => m.PolicyDetailPage),
  },
];
