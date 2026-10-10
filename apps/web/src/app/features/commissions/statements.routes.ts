import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { permissionGuard } from '../../core/guards/permission.guard';

export const STATEMENTS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'commission.view' },
    loadComponent: () => import('./pages/statements-list.page').then((m) => m.StatementsListPage),
  },
  {
    path: ':id',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'commission.view' },
    loadComponent: () => import('./pages/statement-detail.page').then((m) => m.StatementDetailPage),
  },
];
