import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { formatCelsius, formatDayOrClock, formatRelative } from '../../core/domain/format';
import { isCriticalFever, nauseaLabel } from '../../core/domain/triage';
import type { PatientRow } from '../../core/models/api.models';
import { LEVEL_CSS, reasonOf, statusOf, statusTagClass } from '../data/ampel';
import { DashboardStore } from '../data/dashboard.store';
import { PatientDetailComponent } from '../patient-detail/patient-detail.component';

@Component({
  selector: 'app-ampelliste',
  imports: [PatientDetailComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ampelliste.component.html',
  styleUrl: './ampelliste.component.css',
})
export class AmpellisteComponent {
  protected readonly store = inject(DashboardStore);
  protected readonly simulating = signal(false);

  protected readonly levelCss = (row: PatientRow): string => LEVEL_CSS[row.level];
  protected readonly status = statusOf;
  protected readonly tagClass = statusTagClass;
  protected readonly reason = reasonOf;
  protected readonly nausea = nauseaLabel;
  protected readonly celsius = formatCelsius;
  protected readonly critical = isCriticalFever;

  protected time(row: PatientRow): string {
    const now = this.store.now();
    if (row.alert) return formatRelative(row.alert.createdAt, now);
    return row.latestLog ? formatDayOrClock(row.latestLog.loggedAt, now) : '–';
  }

  protected async simulate(): Promise<void> {
    this.simulating.set(true);
    try {
      await this.store.simulateAlert();
    } catch {
      // Meldung kommt vom HTTP-Interceptor
    } finally {
      this.simulating.set(false);
    }
  }
}
