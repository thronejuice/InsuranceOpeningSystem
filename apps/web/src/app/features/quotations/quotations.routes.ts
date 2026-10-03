import { type Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { permissionGuard } from '../../core/guards/permission.guard';

export const quotationsRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'job.view' },
    loadComponent: () => import('./pages/quotation-list.page').then((m) => m.QuotationListPage),
  },
];
