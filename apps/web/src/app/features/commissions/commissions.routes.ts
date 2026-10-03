import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { permissionGuard } from '../../core/guards/permission.guard';

export const COMMISSIONS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'commission.view' },
    loadComponent: () =>
      import('./pages/commissions-list.page').then((m) => m.CommissionsListPage),
  },
];
