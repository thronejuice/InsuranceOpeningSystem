import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { permissionGuard } from '../../core/guards/permission.guard';

export const UNDERWRITING_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'underwriting.review' },
    loadComponent: () =>
      import('./pages/underwriting-inbox.page').then((m) => m.UnderwritingInboxPage),
  },
];
