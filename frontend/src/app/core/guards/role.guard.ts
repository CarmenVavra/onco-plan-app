import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import type { UserRole } from '../models/api.models';
import { AuthService } from '../services/auth.service';

/**
 * Functional Guard: erlaubt die Route nur für die in `data.roles` genannten Rollen.
 * Reine UX-Maßnahme – das Backend prüft jede Anfrage selbst.
 */
export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.user();
  if (!user) return router.createUrlTree(['/login']);

  const roles = (route.data['roles'] as UserRole[] | undefined) ?? [];
  return roles.includes(user.role) ? true : router.createUrlTree(['/kein-zugriff']);
};

/** Angemeldete Personen landen direkt in ihrem Bereich statt auf dem Login. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const user = auth.user();
  return user ? inject(Router).createUrlTree([auth.homeUrlFor(user.role)]) : true;
};
