import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideKeyRound, LucideLogOut } from '@lucide/angular';
import { telHref } from '../../core/domain/format';
import { AuthService } from '../../core/services/auth.service';
import { PatientHomeStore } from '../data/patient-home.store';
import { SymptomSyncService } from '../data/symptom-sync.service';

@Component({
  selector: 'app-profile',
  imports: [RouterLink, LucideKeyRound, LucideLogOut],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <h1 class="head__title">Profil</h1>
    </header>

    <main class="body">
      @if (home.home(); as h) {
        <section class="card" aria-labelledby="profile-title">
          <h2 id="profile-title" class="card__title">{{ h.firstName }} {{ h.lastName }}</h2>
          <dl class="facts">
            <div><dt class="overline">Diagnose</dt><dd>{{ h.diagnosis }}</dd></div>
            <div><dt class="overline">Therapiebeginn</dt><dd>{{ therapyStart() }}</dd></div>
            <div><dt class="overline">Therapie</dt><dd>Woche {{ h.therapyWeek }} · Tag {{ h.therapyDay }}</dd></div>
            <div><dt class="overline">Behandelnd</dt><dd>{{ h.doctorName ?? '–' }}</dd></div>
            <div><dt class="overline">Klinik</dt><dd>{{ h.clinicName }}</dd></div>
            <div>
              <dt class="overline">Onko-Hotline</dt>
              <dd><a [href]="hotlineHref()">{{ h.hotline }}</a></dd>
            </div>
          </dl>
        </section>
      } @else {
        <p class="muted">{{ auth.user()?.firstName }} {{ auth.user()?.lastName }}</p>
      }

      @if (sync.pendingCount() > 0) {
        <p class="pending" role="status">
          {{ sync.pendingCount() }} Check-in(s) warten noch auf Übertragung. Bitte erst abmelden, wenn Sie wieder online sind.
        </p>
      }

      <section class="card">
        <h2 class="card__title">Datenschutz</h2>
        <p class="small">
          Ihre Angaben werden verschlüsselt übertragen und ausschließlich Ihrem Behandlungsteam angezeigt. Offline erfasste Check-ins
          bleiben nur auf diesem Gerät, bis sie übertragen sind.
        </p>
      </section>

      <a class="btn btn--outline btn--lg btn--block" routerLink="/passwort-aendern">
        Passwort ändern
        <svg lucideKeyRound [size]="20" [strokeWidth]="2"></svg>
      </a>

      <button type="button" class="btn btn--outline btn--lg btn--block" (click)="auth.logout()">
        Abmelden
        <svg lucideLogOut [size]="20" [strokeWidth]="2"></svg>
      </button>
    </main>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
    }
    .head {
      padding: var(--s-5) var(--s-5) var(--s-4);
      background: var(--c-surface);
      border-bottom: var(--rule);
    }
    .head__title {
      font-size: 1.75rem;
    }
    .body {
      flex: 1;
      padding: var(--s-4) var(--s-5);
      display: flex;
      flex-direction: column;
      gap: var(--s-4);
    }
    .card {
      background: var(--c-surface);
    }
    .card__title {
      font-size: 1.125rem;
      letter-spacing: 0;
      padding: var(--s-4) var(--s-4) 0.625rem;
      border-bottom: var(--rule);
    }
    .facts {
      margin: 0;
    }
    .facts > div {
      padding: 0.625rem var(--s-4);
      border-bottom: 2px solid var(--c-ground);
    }
    .facts dd {
      margin: 0;
      font-weight: 600;
    }
    .small {
      padding: var(--s-3) var(--s-4) var(--s-4);
      font-size: 0.875rem;
    }
    .pending {
      padding: var(--s-3) 0.875rem;
      background: var(--c-warning-tint);
      border-left: 6px solid var(--c-warning);
      font-size: 0.875rem;
    }
  `,
})
export class ProfileComponent {
  protected readonly auth = inject(AuthService);
  protected readonly home = inject(PatientHomeStore);
  protected readonly sync = inject(SymptomSyncService);

  protected readonly therapyStart = computed(() => {
    const iso = this.home.home()?.therapyStart;
    if (!iso) return '–';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  });
  protected readonly hotlineHref = computed(() => telHref(this.home.home()?.hotline ?? '112'));

  constructor() {
    if (!this.home.home()) void this.home.load();
  }
}
