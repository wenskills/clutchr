import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/landing/landing.component').then(m => m.LandingComponent)
  },

  {
    path: 'connexion',
    loadComponent: () => import('./features/auth/auth-shell.component').then(m => m.AuthShellComponent),
    data: { mode: 'login' }
  },
  {
    path: 'inscription',
    loadComponent: () => import('./features/auth/auth-shell.component').then(m => m.AuthShellComponent),
    data: { mode: 'register' }
  },
  {
    path: 'mot-de-passe-oublie',
    loadComponent: () => import('./features/auth/auth-shell.component').then(m => m.AuthShellComponent),
    data: { mode: 'forgot' }
  },
  {
    path: 'reinitialiser-mot-de-passe',
    loadComponent: () => import('./features/auth/reset-password-confirm.component').then(m => m.ResetPasswordConfirmComponent)
  },

  // --- Tout ce qui suit nécessite une connexion : aucune page interne
  // n'est accessible sans token valide, même vide de données. ---
  {
    path: 'import-profil',
    loadComponent: () => import('./features/onboarding/profile-import.component').then(m => m.ProfileImportComponent),
    canActivate: [authGuard]
  },
  {
    path: 'tableau-de-bord',
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [authGuard]
  },
  {
    path: 'offres',
    loadComponent: () => import('./features/matches/job-matches.component').then(m => m.JobMatchesComponent),
    canActivate: [authGuard]
  },
  { path: 'swipe', redirectTo: 'offres', pathMatch: 'full' },
  {
    path: 'suivi',
    loadComponent: () => import('./features/kanban/kanban.component').then(m => m.KanbanComponent),
    canActivate: [authGuard]
  },
  {
    path: 'analyse-ecart',
    loadComponent: () => import('./features/skill-gap/skill-gap.component').then(m => m.SkillGapComponent),
    canActivate: [authGuard]
  },
  {
    path: 'feuille-de-route',
    loadComponent: () => import('./features/roadmap/roadmap.component').then(m => m.RoadmapComponent),
    canActivate: [authGuard]
  },
  {
    path: 'contacts',
    loadComponent: () => import('./features/contacts/contacts.component').then(m => m.ContactsComponent),
    canActivate: [authGuard]
  },
  {
    path: 'contenu-linkedin',
    loadComponent: () => import('./features/linkedin-content/linkedin-content.component').then(m => m.LinkedinContentComponent),
    canActivate: [authGuard]
  },
  {
    path: 'contenu-linkedin/calendrier',
    loadComponent: () => import('./features/linkedin-calendar/linkedin-calendar.component').then(m => m.LinkedinCalendarComponent),
    canActivate: [authGuard]
  },
  {
    path: 'veille',
    loadComponent: () => import('./features/trends/trends.component').then(m => m.TrendsComponent),
    canActivate: [authGuard]
  },
  {
    path: 'parametres',
    loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent),
    canActivate: [authGuard]
  },
  {
    path: 'profil',
    loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent),
    canActivate: [authGuard]
  },

  { path: '**', redirectTo: 'connexion' }
];
