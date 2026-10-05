import { ErrorHandler, Injectable, inject, isDevMode, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { NotificationService } from './notification.service';

/** Zustand für die globale Fallback-Ansicht (verhindert "White Screens"). */
@Injectable({ providedIn: 'root' })
export class AppErrorState {
  readonly fatal = signal(false);
}

/**
 * Fängt alle unbehandelten Fehler ab. Nutzer:innen sehen nur verständliche
 * Meldungen; technische Details gehen ausschließlich (ohne Gesundheitsdaten) ins Log.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly notifications = inject(NotificationService);
  private readonly state = inject(AppErrorState);

  handleError(error: unknown): void {
    // HTTP-Fehler werden bereits vom Interceptor gemeldet.
    if (error instanceof HttpErrorResponse) return;

    const message = error instanceof Error ? error.message : String(error);
    if (isDevMode()) console.error('[OncoPlan]', error);
    else console.error('[OncoPlan] Unerwarteter Fehler:', error instanceof Error ? error.name : 'unknown');

    // Nachladen eines Programmteils fehlgeschlagen (z. B. offline nach Update) → Fallback-Ansicht
    if (/Failed to fetch dynamically imported module|Loading chunk|ChunkLoadError/i.test(message)) {
      this.state.fatal.set(true);
      return;
    }
    this.notifications.error('Es ist ein unerwarteter Fehler aufgetreten. Bitte versuchen Sie es erneut.');
  }
}
