import { Routes } from '@angular/router';

export const MASTER_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/master-hub.page').then((m) => m.MasterHubPage),
    children: [
      { path: '', redirectTo: 'insurance-types', pathMatch: 'full' },
      { path: 'insurance-types', loadComponent: () => import('./pages/insurance-types.page').then((m) => m.InsuranceTypesPage) },
      { path: 'products', loadComponent: () => import('./pages/products.page').then((m) => m.ProductsPage) },
      { path: 'companies', loadComponent: () => import('./pages/companies.page').then((m) => m.CompaniesPage) },
      { path: 'risk-fields', loadComponent: () => import('./pages/risk-fields.page').then((m) => m.RiskFieldsPage) },
    ],
  },
];
