import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LucideBell, LucideCheck, LucidePhone, LucidePhoneCall } from '@lucide/angular';
import { CallService } from '../../core/call/call.service';
import { formatAckTime, formatCelsius, formatRelative, telHref } from '../../core/domain/format';
import { LEVEL_LABELS, diarrheaLabel, nauseaLabel } from '../../core/domain/triage';
import { TemperatureChartComponent } from '../../shared/temperature-chart/temperature-chart.component';
import { toTemperaturePoints } from '../../shared/temperature-chart/temperature-points';
import { DashboardStore } from '../data/dashboard.store';

@Component({
  selector: 'app-patient-detail',
  imports: [TemperatureChartComponent, LucideBell, LucidePhone, LucidePhoneCall, LucideCheck],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './patient-detail.component.html',
  styleUrl: './patient-detail.component.css',
})
export class PatientDetailComponent {
  protected readonly store = inject(DashboardStore);
  protected readonly calls = inject(CallService);
  protected readonly acknowledging = signal(false);

  protected readonly detail = this.store.detail;
  protected readonly points = computed(() => toTemperaturePoints(this.detail()?.temperatures ?? []));
  protected readonly levelLabel = computed(() => {
    const d = this.detail();
    return d ? LEVEL_LABELS[d.level] : '';
  });
  protected readonly alertAge = computed(() => {
    const a = this.detail()?.alert;
    return a ? formatRelative(a.createdAt, this.store.now()) : '';
  });
  protected readonly ackInfo = computed(() => {
    const a = this.detail()?.alert;
    if (!a?.acknowledgedAt) return '';
    return `Bestätigt von ${a.acknowledgedByName ?? 'unbekannt'} · ${formatAckTime(a.acknowledgedAt, this.store.now())}`;
  });
  protected readonly phoneHref = computed(() => {
    const phone = this.detail()?.phone;
    return phone ? telHref(phone) : null;
  });
  /** Warum der Anruf-Button gerade nicht geht (Tooltip) */
  protected readonly callHint = computed(() => {
    if (!this.calls.supported) return 'Dieser Browser unterstützt keine Anrufe.';
    if (this.calls.busy()) return 'Es läuft bereits ein Anruf.';
    if (this.store.connection() !== 'connected') return 'Keine Live-Verbindung – Anrufe sind gerade nicht möglich.';
    return 'Klingelt in der OncoPlan-App der Patientin / des Patienten (Ton, Kamera zuschaltbar).';
  });
  protected readonly fhirHref = computed(() => {
    const id = this.detail()?.patientId;
    return id ? `/api/fhir/Observation?subject=Patient/${id}` : null;
  });

  protected readonly celsius = formatCelsius;
  protected readonly nausea = nauseaLabel;
  protected readonly diarrhea = diarrheaLabel;

  protected callInApp(patientId: string, name: string): void {
    void this.calls.startCall(patientId, name);
  }

  protected async acknowledge(alertId: string): Promise<void> {
    this.acknowledging.set(true);
    try {
      await this.store.acknowledge(alertId);
    } catch {
      // Meldung kommt vom HTTP-Interceptor
    } finally {
      this.acknowledging.set(false);
    }
  }
}
