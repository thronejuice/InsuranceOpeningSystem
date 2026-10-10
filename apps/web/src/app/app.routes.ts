import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'customers',
        loadChildren: () =>
          import('./features/customers/customers.routes').then((m) => m.CUSTOMERS_ROUTES),
      },
      {
        path: 'jobs',
        loadChildren: () =>
          import('./features/jobs/jobs.routes').then((m) => m.JOBS_ROUTES),
      },
      {
        path: 'master',
        loadChildren: () =>
          import('./features/master/master.routes').then((m) => m.MASTER_ROUTES),
      },
      {
        path: 'users',
        loadChildren: () =>
          import('./features/users/users.routes').then((m) => m.USERS_ROUTES),
      },
      {
        path: 'quotations',
        loadChildren: () =>
          import('./features/quotations/quotations.routes').then((m) => m.quotationsRoutes),
      },
      {
        path: 'approvals',
        loadChildren: () =>
          import('./features/approvals/approvals.routes').then((m) => m.APPROVALS_ROUTES),
      },
      {
        path: 'policies',
        loadChildren: () =>
          import('./features/policies/policies.routes').then((m) => m.POLICIES_ROUTES),
      },
      {
        path: 'payments',
        loadChildren: () =>
          import('./features/payments/payments.routes').then((m) => m.PAYMENTS_ROUTES),
      },
      {
        path: 'insurers/:id',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/master/pages/company-detail.page').then((m) => m.CompanyDetailPage),
      },
      {
        path: 'invoices',
        loadChildren: () =>
          import('./features/billing/billing.routes').then((m) => m.INVOICES_ROUTES),
      },
      {
        path: 'receivables',
        loadChildren: () =>
          import('./features/billing/billing.routes').then((m) => m.RECEIVABLES_ROUTES),
      },
      {
        path: 'refunds',
        loadChildren: () =>
          import('./features/refunds/refunds.routes').then((m) => m.REFUNDS_ROUTES),
      },
      {
        path: 'commission-statements',
        loadChildren: () =>
          import('./features/commissions/statements.routes').then((m) => m.STATEMENTS_ROUTES),
      },
      {
        path: 'commissions',
        loadChildren: () =>
          import('./features/commissions/commissions.routes').then((m) => m.COMMISSIONS_ROUTES),
      },
      {
        path: 'tasks',
        loadChildren: () =>
          import('./features/tasks/tasks.routes').then((m) => m.TASKS_ROUTES),
      },
      {
        path: 'renewals',
        loadChildren: () =>
          import('./features/renewals/renewals.routes').then((m) => m.RENEWALS_ROUTES),
      },
      {
        path: 'imports',
        loadChildren: () =>
          import('./features/imports/imports.routes').then((m) => m.IMPORTS_ROUTES),
      },
      {
        path: 'audit-logs',
        loadChildren: () =>
          import('./features/audit-logs/audit-logs.routes').then((m) => m.AUDIT_LOGS_ROUTES),
      },
      {
        path: 'underwriting',
        loadChildren: () =>
          import('./features/underwriting/underwriting.routes').then((m) => m.UNDERWRITING_ROUTES),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
