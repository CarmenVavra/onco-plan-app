import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { formatDateTime } from '../../core/domain/format';
import { LEVEL_LABELS } from '../../core/domain/triage';
import type { AlertHistoryEntry, AlertStatus } from '../../core/models/api.models';
import { DashboardStore } from '../data/dashboard.store';
import { DoctorApiService } from '../data/doctor-api.service';

type Filter = 'ALL' | AlertStatus;

const STATUS_LABELS: Record<AlertStatus, string> = { ACTIVE: 'Aktiv', ACKNOWLEDGED: 'Quittiert', RESOLVED: 'Erledigt' };

@Component({
  selector: 'app-alert-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page">
      <div class="page__head">
        <h1 class="page__title">Alarm-Historie</h1>
        <p class="muted small">alle Triage-Alarme Ihrer Patient:innen, neueste zuerst</p>
        <div class="spacer"></div>
        <div class="filters" role="group" aria-label="Nach Status filtern">
          @for (f of filters; track f.value) {
            <button type="button" class="filter" [class.filter--active]="filter() === f.value" [attr.aria-pressed]="filter() === f.value" (click)="filter.set(f.value)">
              {{ f.label }}
            </button>
          }
        </div>
      </div>

      <div class="table-wrap">
        @if (loading()) {
          <p class="muted" role="status">Alarm-Historie wird geladen …</p>
        } @else {
          <table class="table">
            <thead>
              <tr>
                <th scope="col"><span class="sr-only">Stufe</span></th>
                <th scope="col">Zeitpunkt</th>
                <th scope="col">Patient</th>
                <th scope="col">Stufe</th>
                <th scope="col">Auslöser</th>
                <th scope="col">Status</th>
                <th scope="col">Bestätigt von</th>
              </tr>
            </thead>
            <tbody>
              @for (a of visible(); track a.id) {
                <tr>
                  <td [class]="'bar bar--' + a.level.toLowerCase()"></td>
                  <td class="nowrap">{{ dateTime(a.createdAt) }}</td>
                  <td class="strong">{{ a.patientName }}</td>
                  <td>{{ levelLabel(a) }}</td>
                  <td>{{ a.triggerReason }}</td>
                  <td><span [class]="tagClass(a)">{{ statusLabel(a) }}</span></td>
                  <td class="muted">{{ a.acknowledgedByName ?? '–' }}{{ a.acknowledgedAt ? ' · ' + dateTime(a.acknowledgedAt) : '' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="muted">Keine Alarme für diesen Filter.</td></tr>
              }
            </tbody>
          </table>
        }
      </div>
    </main>
  `,
  styleUrl: '../doctor-page.css',
})
export class AlertHistoryComponent {
  private readonly api = inject(DoctorApiService);
  private readonly store = inject(DashboardStore);

  protected readonly filters: Array<{ value: Filter; label: string }> = [
    { value: 'ALL', label: 'Alle' },
    { value: 'ACTIVE', label: 'Aktiv' },
    { value: 'ACKNOWLEDGED', label: 'Quittiert' },
  ];
  protected readonly filter = signal<Filter>('ALL');
  protected readonly alerts = signal<AlertHistoryEntry[]>([]);
  protected readonly loading = signal(true);
  protected readonly visible = computed(() =>
    this.filter() === 'ALL' ? this.alerts() : this.alerts().filter((a) => a.status === this.filter()),
  );

  protected readonly dateTime = formatDateTime;
  protected readonly levelLabel = (a: AlertHistoryEntry): string => LEVEL_LABELS[a.level];
  protected readonly statusLabel = (a: AlertHistoryEntry): string => STATUS_LABELS[a.status];
  protected tagClass(a: AlertHistoryEntry): string {
    if (a.status === 'ACTIVE') return a.level === 'RED' ? 'tag tag--red' : 'tag tag--yellow';
    return a.status === 'ACKNOWLEDGED' ? 'tag tag--acked' : 'tag tag--stable';
  }

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.alerts.set(await this.api.alertHistory());
    } catch {
      // Meldung kommt vom HTTP-Interceptor
    } finally {
      this.loading.set(false);
    }
  }
}
