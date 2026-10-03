import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { permissionGuard } from '../../core/guards/permission.guard';

export const APPROVALS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'approval.approve' },
    loadComponent: () =>
      import('./pages/approvals-inbox.page').then((m) => m.ApprovalsInboxPage),
  },
];
