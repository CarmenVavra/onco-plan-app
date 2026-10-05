import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import type { UserRole } from '../models/api.models';
import { AuthService, CHANGE_PASSWORD_URL } from '../services/auth.service';

/**
 * Functional Guard: erlaubt die Route nur für die in `data.roles` genannten Rollen.
 * Mit aktivem Startpasswort geht es zuerst zur Passwortänderung.
 * Reine UX-Maßnahme – das Backend prüft jede Anfrage selbst.
 */
export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.user();
  if (!user) return router.createUrlTree(['/login']);
  if (user.mustChangePassword) return router.createUrlTree([CHANGE_PASSWORD_URL]);

  const roles = (route.data['roles'] as UserRole[] | undefined) ?? [];
  return roles.includes(user.role) ? true : router.createUrlTree(['/kein-zugriff']);
};

/** Nur für angemeldete Personen (beliebige Rolle). */
export const authGuard: CanActivateFn = () => {
  return inject(AuthService).user() ? true : inject(Router).createUrlTree(['/login']);
};

/** Angemeldete Personen landen direkt in ihrem Bereich statt auf dem Login. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const user = auth.user();
  return user ? inject(Router).createUrlTree([auth.landingUrlFor(user)]) : true;
};
