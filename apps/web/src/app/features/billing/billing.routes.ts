import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { permissionGuard } from '../../core/guards/permission.guard';

export const INVOICES_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'invoice.view' },
    loadComponent: () => import('./pages/invoices-list.page').then((m) => m.InvoicesListPage),
  },
];

export const RECEIVABLES_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'receivable.view' },
    loadComponent: () => import('./pages/receivables.page').then((m) => m.ReceivablesPage),
  },
];
