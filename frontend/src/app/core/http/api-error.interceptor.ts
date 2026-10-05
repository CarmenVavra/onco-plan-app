import { HttpContextToken, HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import type { ApiErrorBody } from '../models/api.models';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';

/** Anfragen mit diesem Kontext melden Fehler selbst (z. B. Offline-Sync, Session-Check). */
export const SILENT_ERRORS = new HttpContextToken<boolean>(() => false);

/** Übersetzt HTTP-Fehler in verständliche deutsche Meldungen – nie Rohfehler anzeigen. */
export function userMessageFor(error: HttpErrorResponse): string {
  const serverMessage = (error.error as ApiErrorBody | null)?.error?.message;
  switch (true) {
    case error.status === 0:
      return 'Keine Verbindung zum Server. Bitte prüfen Sie Ihre Internetverbindung.';
    case error.status === 401:
      return 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.';
    case error.status === 403:
      return 'Für diese Aktion fehlt die Berechtigung.';
    case error.status === 400 || error.status === 404 || error.status === 409 || error.status === 429:
      return serverMessage ?? 'Die Anfrage konnte nicht verarbeitet werden.';
    default:
      return 'Der Server ist gerade nicht erreichbar. Bitte versuchen Sie es in Kürze erneut.';
  }
}

export const apiErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const notifications = inject(NotificationService);
  const auth = inject(AuthService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        const isAuthCall = req.url.includes('/api/auth/');
        if (error.status === 401 && !isAuthCall) {
          auth.handleSessionExpired();
        }
        const passwordChangeRequired = error.status === 403 && (error.error as ApiErrorBody | null)?.error?.code === 'PASSWORD_CHANGE_REQUIRED';
        if (passwordChangeRequired) {
          auth.handlePasswordChangeRequired();
          return throwError(() => error);
        }
        if (!req.context.get(SILENT_ERRORS) && !(error.status === 401 && isAuthCall)) {
          notifications.error(userMessageFor(error));
        }
      }
      return throwError(() => error);
    }),
  );
};
