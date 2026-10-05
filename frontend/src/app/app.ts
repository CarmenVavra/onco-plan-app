import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppErrorState } from './core/services/global-error-handler';
import { NotificationService } from './core/services/notification.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (errorState.fatal()) {
      <main class="fatal" role="alert">
        <div class="fatal__mark" aria-hidden="true"></div>
        <h1>Die Seite konnte nicht vollständig geladen werden.</h1>
        <p>Bitte prüfen Sie Ihre Verbindung und laden Sie OncoPlan neu. Bereits erfasste Check-ins bleiben gespeichert.</p>
        <p><strong>Bei Fieber über 38,5 °C</strong> nicht abwarten – rufen Sie Ihre Onko-Hotline an. Im Notfall: 112.</p>
        <button type="button" class="btn btn--primary btn--lg" (click)="reload()">Neu laden</button>
      </main>
    } @else {
      <router-outlet />
    }

    <section class="toasts" aria-live="polite" aria-label="Benachrichtigungen">
      @for (n of notifications.items(); track n.id) {
        <div class="toast" [class.toast--error]="n.kind === 'error'" [class.toast--success]="n.kind === 'success'" [attr.role]="n.kind === 'error' ? 'alert' : 'status'">
          <span>{{ n.message }}</span>
          <button type="button" class="toast__close" (click)="notifications.dismiss(n.id)" aria-label="Meldung schließen">×</button>
        </div>
      }
    </section>
  `,
  styles: `
    .fatal {
      max-width: 30rem;
      margin: 0 auto;
      padding: 3rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .fatal__mark {
      width: 1.5rem;
      height: 1.5rem;
      background: var(--c-primary);
    }
    .fatal h1 {
      font-size: 1.75rem;
    }
    .toasts {
      position: fixed;
      z-index: 100;
      left: 1rem;
      right: 1rem;
      bottom: calc(5rem + env(safe-area-inset-bottom));
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      pointer-events: none;
    }
    @media (min-width: 48rem) {
      .toasts {
        left: auto;
        bottom: 1.5rem;
        width: 26rem;
      }
    }
    .toast {
      pointer-events: auto;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.75rem 0.5rem 0.75rem 0.875rem;
      background: var(--c-ink);
      color: #fff;
      border-left: 6px solid var(--c-tint);
      font-size: 0.875rem;
    }
    .toast--error {
      border-left-color: var(--c-critical);
    }
    .toast--success {
      border-left-color: var(--c-success);
    }
    .toast__close {
      flex: none;
      width: 2.75rem;
      height: 2.75rem;
      margin: -0.625rem 0;
      border: 0;
      background: transparent;
      color: #fff;
      font-size: 1.25rem;
    }
  `,
})
export class App {
  protected readonly notifications = inject(NotificationService);
  protected readonly errorState = inject(AppErrorState);

  protected reload(): void {
    location.reload();
  }
}
