import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { permissionGuard } from '../../core/guards/permission.guard';

export const TASKS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'task.view' },
    loadComponent: () =>
      import('./pages/tasks-list.page').then((m) => m.TasksListPage),
  },
];
