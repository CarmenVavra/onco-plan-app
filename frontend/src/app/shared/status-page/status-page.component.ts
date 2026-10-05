import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-status-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="status">
      <div class="status__mark" aria-hidden="true"></div>
      <p class="overline">{{ kicker() }}</p>
      <h1>{{ heading() }}</h1>
      <p>{{ text() }}</p>
      <a class="btn btn--primary btn--lg" [routerLink]="homeUrl()">Zur Startseite</a>
    </main>
  `,
  styles: `
    .status {
      max-width: 30rem;
      margin: 0 auto;
      padding: 3rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .status__mark {
      width: 1.5rem;
      height: 1.5rem;
      background: var(--c-primary);
      margin-bottom: 1rem;
    }
    h1 {
      font-size: 1.75rem;
    }
    a {
      margin-top: 1rem;
    }
  `,
})
export class StatusPageComponent {
  readonly kicker = input.required<string>();
  readonly heading = input.required<string>();
  readonly text = input.required<string>();

  private readonly auth = inject(AuthService);
  protected readonly homeUrl = computed(() => this.auth.homeUrlFor(this.auth.user()?.role));
}

@Component({
  selector: 'app-unauthorized-page',
  imports: [StatusPageComponent],
  template: `<app-status-page kicker="Fehler 403" heading="Kein Zugriff" text="Dieser Bereich ist für Ihre Rolle nicht freigegeben." />`,
})
export class UnauthorizedPageComponent {}

@Component({
  selector: 'app-not-found-page',
  imports: [StatusPageComponent],
  template: `<app-status-page kicker="Fehler 404" heading="Seite nicht gefunden" text="Die angeforderte Seite existiert nicht oder wurde verschoben." />`,
})
export class NotFoundPageComponent {}
