import type { Routes } from '@angular/router';
import { guestGuard, roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    title: 'Anmelden · OncoPlan',
    canActivate: [guestGuard],
    loadComponent: () => import('./auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'patient',
    canActivate: [roleGuard],
    data: { roles: ['PATIENT'] },
    loadComponent: () => import('./patient/shell/patient-shell.component').then((m) => m.PatientShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'heute' },
      {
        path: 'heute',
        title: 'Heute · OncoPlan',
        loadComponent: () => import('./patient/today/today.component').then((m) => m.TodayComponent),
      },
      {
        path: 'check-in',
        title: 'Täglicher Check-in · OncoPlan',
        loadComponent: () => import('./patient/checkin/checkin.component').then((m) => m.CheckinComponent),
      },
      {
        path: 'bestaetigung',
        title: 'Bestätigung · OncoPlan',
        loadComponent: () => import('./patient/confirmation/confirmation.component').then((m) => m.ConfirmationComponent),
      },
      {
        path: 'verlauf',
        title: 'Verlauf · OncoPlan',
        loadComponent: () => import('./patient/history/history.component').then((m) => m.HistoryComponent),
      },
      {
        path: 'profil',
        title: 'Profil · OncoPlan',
        loadComponent: () => import('./patient/profile/profile.component').then((m) => m.ProfileComponent),
      },
    ],
  },
  {
    path: 'arzt',
    canActivate: [roleGuard],
    data: { roles: ['DOCTOR'] },
    loadComponent: () => import('./doctor/shell/doctor-shell.component').then((m) => m.DoctorShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'ampelliste' },
      {
        path: 'ampelliste',
        title: 'Ampelliste · OncoPlan',
        loadComponent: () => import('./doctor/ampelliste/ampelliste.component').then((m) => m.AmpellisteComponent),
      },
      {
        path: 'patienten',
        title: 'Patienten · OncoPlan',
        loadComponent: () => import('./doctor/patients/patients.component').then((m) => m.PatientsComponent),
      },
      {
        path: 'patienten/neu',
        title: 'Neue Patient:in · OncoPlan',
        loadComponent: () => import('./doctor/patient-form/patient-form.component').then((m) => m.PatientFormComponent),
      },
      {
        path: 'patienten/:id',
        title: 'Patient:in bearbeiten · OncoPlan',
        loadComponent: () => import('./doctor/patient-form/patient-form.component').then((m) => m.PatientFormComponent),
      },
      {
        path: 'alarm-historie',
        title: 'Alarm-Historie · OncoPlan',
        loadComponent: () => import('./doctor/alert-history/alert-history.component').then((m) => m.AlertHistoryComponent),
      },
    ],
  },
  {
    path: 'kein-zugriff',
    title: 'Kein Zugriff · OncoPlan',
    loadComponent: () => import('./shared/status-page/status-page.component').then((m) => m.UnauthorizedPageComponent),
  },
  {
    path: '**',
    title: 'Nicht gefunden · OncoPlan',
    loadComponent: () => import('./shared/status-page/status-page.component').then((m) => m.NotFoundPageComponent),
  },
];
