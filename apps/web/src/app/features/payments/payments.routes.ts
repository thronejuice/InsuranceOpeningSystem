import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { permissionGuard } from '../../core/guards/permission.guard';

export const PAYMENTS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'payment.view' },
    loadComponent: () =>
      import('./pages/payments-list.page').then((m) => m.PaymentsListPage),
  },
];
