import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { permissionGuard } from '../../core/guards/permission.guard';

export const JOBS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'job.view' },
    loadComponent: () =>
      import('./pages/job-list.page').then((m) => m.JobListPage),
  },
  {
    path: 'create',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'job.create' },
    loadComponent: () =>
      import('./pages/job-form.page').then((m) => m.JobFormPage),
    canDeactivate: [
      (component: { canDeactivate: () => boolean }) => {
        if (!component.canDeactivate()) {
          return confirm('มีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่?');
        }
        return true;
      },
    ],
  },
  {
    path: ':id',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'job.view' },
    loadComponent: () =>
      import('./pages/job-detail.page').then((m) => m.JobDetailPage),
  },
];
