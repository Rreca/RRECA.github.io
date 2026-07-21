import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./tabs/tabs.component').then(m => m.TabsComponent),
    children: [
      {
        path: 'today',
        loadComponent: () => import('./pages/today/today.page').then(m => m.TodayPage),
      },
      {
        path: 'insights',
        loadComponent: () => import('./pages/insights/insights.page').then(m => m.InsightsPage),
      },
      {
        path: '',
        redirectTo: 'today',
        pathMatch: 'full',
      },
    ],
  },
];
