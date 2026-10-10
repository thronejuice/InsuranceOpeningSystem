import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { permissionGuard } from '../../core/guards/permission.guard';

export const REFUNDS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'invoice.view' },
    loadComponent: () =>
      import('./pages/refunds-list.page').then((m) => m.RefundsListPage),
  },
];

