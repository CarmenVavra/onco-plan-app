import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideWifiOff } from '@lucide/angular';
import { filter, map } from 'rxjs';
import { SymptomSyncService } from '../data/symptom-sync.service';

/** Seiten mit eigener Fußleiste (Check-in mit Senden-Button, Bestätigung) zeigen keine Navigation. */
const PAGES_WITHOUT_NAV = ['/patient/check-in', '/patient/bestaetigung'];

@Component({
  selector: 'app-patient-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LucideWifiOff],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app">
      <a class="skip-link" href="#inhalt">Zum Inhalt springen</a>
      @if (!sync.isOnline()) {
        <div class="offline" role="status">
          <svg lucideWifiOff [size]="16" [strokeWidth]="2"></svg>
          Offline – Eingaben werden lokal gespeichert
        </div>
      }
      <div class="app__content" id="inhalt">
        <router-outlet />
      </div>
      @if (showNav()) {
        <nav class="nav" aria-label="Hauptnavigation">
          @for (item of navItems; track item.path) {
            <a
              class="nav__item"
              [routerLink]="item.path"
              routerLinkActive="nav__item--active"
              ariaCurrentWhenActive="page"
              >{{ item.label }}</a
            >
          }
        </nav>
      }
    </div>
  `,
  styleUrl: './patient-shell.component.css',
})
export class PatientShellComponent {
  protected readonly sync = inject(SymptomSyncService);
  private readonly router = inject(Router);

  protected readonly navItems = [
    { path: '/patient/heute', label: 'Heute' },
    { path: '/patient/check-in', label: 'Check-in' },
    { path: '/patient/verlauf', label: 'Verlauf' },
    { path: '/patient/profil', label: 'Profil' },
  ];

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  protected readonly showNav = computed(() => !PAGES_WITHOUT_NAV.some((p) => this.url().startsWith(p)));
}
