import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { permissionGuard } from '../../core/guards/permission.guard';

export const RENEWALS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'renewal.view' },
    loadComponent: () =>
      import('./pages/renewals-list.page').then((m) => m.RenewalsListPage),
  },
];
