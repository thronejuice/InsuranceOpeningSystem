import type { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';

export const IMPORTS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [permissionGuard],
    data: { permission: 'import.create' },
    loadComponent: () =>
      import('./pages/import-page.component').then((m) => m.ImportPageComponent),
  },
];
