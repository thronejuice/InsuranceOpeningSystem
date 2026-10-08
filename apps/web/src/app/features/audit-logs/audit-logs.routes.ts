import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { permissionGuard } from '../../core/guards/permission.guard';

export const AUDIT_LOGS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'audit.view' },
    loadComponent: () =>
      import('./pages/audit-log-list.page').then((m) => m.AuditLogListPage),
  },
];

