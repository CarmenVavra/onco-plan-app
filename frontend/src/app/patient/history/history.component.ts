import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { formatCelsius, formatDateTime } from '../../core/domain/format';
import { LEVEL_LABELS, isCriticalFever, nauseaLabel } from '../../core/domain/triage';
import type { SymptomHistoryEntry } from '../../core/models/api.models';
import { TemperatureChartComponent } from '../../shared/temperature-chart/temperature-chart.component';
import { dailyMaxFromHistory, toTemperaturePoints } from '../../shared/temperature-chart/temperature-points';
import { PatientApiService } from '../data/patient-api.service';

@Component({
  selector: 'app-history',
  imports: [TemperatureChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <h1 class="head__title">Verlauf</h1>
      <p class="muted">Ihre Check-ins der letzten 14 Tage</p>
    </header>

    <main class="body">
      @if (stale()) {
        <p class="stale" role="status">Offline – angezeigt wird der zuletzt geladene Stand.</p>
      }
      @if (loading()) {
        <p role="status" class="muted">Verlauf wird geladen …</p>
      } @else if (failed()) {
        <div class="card" role="alert">
          <p>Der Verlauf konnte nicht geladen werden.</p>
          <button type="button" class="btn btn--outline" (click)="load()">Erneut versuchen</button>
        </div>
      } @else {
        <section class="card">
          <app-temperature-chart [points]="points()" />
        </section>

        <section class="card card--flush" aria-labelledby="entries-title">
          <h2 id="entries-title" class="card__title">Einträge</h2>
          <ul class="entries">
            @for (e of entries(); track e.id) {
              <li class="entry">
                <span class="entry__bar" [class]="'entry__bar entry__bar--' + e.level.toLowerCase()" aria-hidden="true"></span>
                <div class="entry__main">
                  <span class="entry__date">{{ dateTime(e.loggedAt) }}</span>
                  <span class="entry__values">
                    <span [class.critical]="critical(e.feverCelsius)">{{ celsius(e.feverCelsius) }} °C</span>
                    · Schmerz {{ e.painLevel }}/10 · Übelkeit {{ nausea(e.nauseaLevel) }}
                  </span>
                  @if (e.note) {
                    <span class="entry__note">„{{ e.note }}“</span>
                  }
                </div>
                <span class="sr-only">Ampel: {{ levelLabel(e.level) }}</span>
              </li>
            } @empty {
              <li class="entry entry--empty">Noch keine Check-ins in diesem Zeitraum.</li>
            }
          </ul>
        </section>
      }
    </main>
  `,
  styleUrl: './history.component.css',
})
export class HistoryComponent {
  private readonly api = inject(PatientApiService);

  protected readonly entries = signal<SymptomHistoryEntry[]>([]);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly stale = signal(false);
  protected readonly points = computed(() => toTemperaturePoints(dailyMaxFromHistory(this.entries())));

  protected readonly celsius = formatCelsius;
  protected readonly dateTime = formatDateTime;
  protected readonly nausea = nauseaLabel;
  protected readonly critical = isCriticalFever;
  protected readonly levelLabel = (l: SymptomHistoryEntry['level']): string => LEVEL_LABELS[l];

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.api.loadHistory(14);
      this.entries.set(result.data);
      this.stale.set(result.stale);
      this.failed.set(false);
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
