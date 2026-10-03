import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { permissionGuard } from '../../core/guards/permission.guard';

export const CUSTOMERS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'customer.view' },
    loadComponent: () =>
      import('./pages/customer-list.page').then((m) => m.CustomerListPage),
  },
  {
    path: 'create',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'customer.create' },
    loadComponent: () =>
      import('./pages/customer-form.page').then((m) => m.CustomerFormPage),
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
    data: { permission: 'customer.view' },
    loadComponent: () =>
      import('./pages/customer-detail.page').then((m) => m.CustomerDetailPage),
  },
  {
    path: ':id/edit',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'customer.update' },
    loadComponent: () =>
      import('./pages/customer-form.page').then((m) => m.CustomerFormPage),
    canDeactivate: [
      (component: { canDeactivate: () => boolean }) => {
        if (!component.canDeactivate()) {
          return confirm('มีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่?');
        }
        return true;
      },
    ],
  },
];
