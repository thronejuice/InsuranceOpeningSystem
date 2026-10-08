import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { permissionGuard } from '../../core/guards/permission.guard';

export const MASTER_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'master.manage' },
    loadComponent: () => import('./pages/master-hub.page').then((m) => m.MasterHubPage),
    children: [
      { path: '', redirectTo: 'insurance-types', pathMatch: 'full' },
      { path: 'insurance-types', loadComponent: () => import('./pages/insurance-types.page').then((m) => m.InsuranceTypesPage) },
      { path: 'products', loadComponent: () => import('./pages/products.page').then((m) => m.ProductsPage) },
      { path: 'companies', loadComponent: () => import('./pages/companies.page').then((m) => m.CompaniesPage) },
      { path: 'risk-fields', loadComponent: () => import('./pages/risk-fields.page').then((m) => m.RiskFieldsPage) },
      { path: 'company-profile', loadComponent: () => import('./pages/company-profile.page').then((m) => m.CompanyProfilePage) },
    ],
  },
];
