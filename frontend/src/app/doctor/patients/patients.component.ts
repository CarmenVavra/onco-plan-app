import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucidePlus } from '@lucide/angular';
import { formatDayOrClock } from '../../core/domain/format';
import type { PatientRow } from '../../core/models/api.models';
import { LEVEL_CSS, statusOf, statusTagClass } from '../data/ampel';
import { DashboardStore } from '../data/dashboard.store';

@Component({
  selector: 'app-patients',
  imports: [RouterLink, LucidePlus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page">
      <div class="page__head">
        <h1 class="page__title">Patienten</h1>
        <p class="muted small">{{ filtered().length }} von {{ all().length }} zugeordnet</p>
        <div class="spacer"></div>
        <label class="search">
          <span class="sr-only">Patient:in suchen</span>
          <input class="input" type="search" placeholder="Name oder Diagnose suchen" [value]="query()" (input)="query.set($any($event.target).value)" />
        </label>
        <a class="btn btn--primary" routerLink="/arzt/patienten/neu">
          Neue Patient:in
          <svg lucidePlus [size]="16" [strokeWidth]="2.2"></svg>
        </a>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th scope="col"><span class="sr-only">Ampel</span></th>
              <th scope="col">Name</th>
              <th scope="col">Alter</th>
              <th scope="col">Diagnose</th>
              <th scope="col">Woche</th>
              <th scope="col">Letzter Check-in</th>
              <th scope="col">Status</th>
              <th scope="col"><span class="sr-only">Aktionen</span></th>
            </tr>
          </thead>
          <tbody>
            @for (p of filtered(); track p.patientId) {
              <tr>
                <td [class]="'bar bar--' + levelCss(p)"></td>
                <td class="strong">{{ p.name }}</td>
                <td>{{ p.age }} J.</td>
                <td>{{ p.diagnosis }}</td>
                <td>W{{ p.therapyWeek }}</td>
                <td class="muted">{{ p.latestLog ? lastCheckin(p) : '–' }}</td>
                <td><span [class]="tagClass(p)">{{ status(p) }}</span></td>
                <td class="row-actions">
                  <button type="button" class="btn btn--outline" (click)="open(p.patientId)" [attr.aria-label]="'Ampel-Details: ' + p.name">Details</button>
                  <a class="btn btn--outline" [routerLink]="['/arzt/patienten', p.patientId]" [attr.aria-label]="'Bearbeiten: ' + p.name">Bearbeiten</a>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="8" class="muted">Keine Treffer.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </main>
  `,
  styleUrl: '../doctor-page.css',
})
export class PatientsComponent {
  private readonly store = inject(DashboardStore);
  private readonly router = inject(Router);

  protected readonly query = signal('');
  protected readonly all = computed(() =>
    [...(this.store.overview()?.patients ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'de')),
  );
  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.all().filter((p) => `${p.name} ${p.diagnosis}`.toLowerCase().includes(q)) : this.all();
  });

  protected readonly levelCss = (p: PatientRow): string => LEVEL_CSS[p.level];
  protected readonly status = statusOf;
  protected readonly tagClass = statusTagClass;

  protected lastCheckin(p: PatientRow): string {
    return p.latestLog ? formatDayOrClock(p.latestLog.loggedAt, this.store.now()) : '–';
  }

  protected open(patientId: string): void {
    this.store.select(patientId);
    void this.router.navigateByUrl('/arzt/ampelliste');
  }
}
