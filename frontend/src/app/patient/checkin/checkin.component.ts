import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideArrowRight, LucideChevronLeft } from '@lucide/angular';
import { formatCelsius } from '../../core/domain/format';
import { NAUSEA_LABELS, isCriticalFever } from '../../core/domain/triage';
import { userMessageFor } from '../../core/http/api-error.interceptor';
import type { TriageLevel } from '../../core/models/api.models';
import { NotificationService } from '../../core/services/notification.service';
import { CheckinStore, TEMP_MAX, TEMP_MIN } from '../data/checkin.store';
import { PatientHomeStore } from '../data/patient-home.store';
import { SymptomSyncService } from '../data/symptom-sync.service';

const HINTS: Record<TriageLevel, { title: string; text: string }> = {
  RED: {
    title: 'Ihre Temperatur liegt über 38,5 °C.',
    text: 'Nach dem Senden wird Ihr Behandlungsteam sofort benachrichtigt.',
  },
  YELLOW: {
    title: 'Starke Schmerzen mit Übelkeit.',
    text: 'Ihr Behandlungsteam wird informiert und meldet sich bei Bedarf.',
  },
  GREEN: {
    title: 'Werte im erwarteten Bereich.',
    text: 'Danke – Ihre Angaben gehen an Ihr Behandlungsteam.',
  },
};

@Component({
  selector: 'app-checkin',
  imports: [RouterLink, LucideChevronLeft, LucideArrowRight],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './checkin.component.html',
  styleUrl: './checkin.component.css',
})
export class CheckinComponent {
  protected readonly store = inject(CheckinStore);
  protected readonly sync = inject(SymptomSyncService);
  private readonly home = inject(PatientHomeStore);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);

  protected readonly nauseaOptions = NAUSEA_LABELS.map((label, value) => ({ label, value }));
  protected readonly TEMP_MIN = TEMP_MIN;
  protected readonly TEMP_MAX = TEMP_MAX;

  protected readonly tempLabel = computed(() => formatCelsius(this.store.temp()));
  protected readonly tempCritical = computed(() => isCriticalFever(this.store.temp()));
  protected readonly hint = computed(() => HINTS[this.store.triageLevel()]);
  protected readonly submitting = signal(false);
  /** Eingabefeld zeigt beim Tippen den Rohtext, sonst den formatierten Wert */
  protected readonly tempDraft = signal<string | null>(null);

  protected onTempInput(value: string): void {
    this.tempDraft.set(value);
  }

  /** Manuelle Eingabe übernehmen ("37,8" oder "37.8"); ungültige Werte verwerfen. */
  protected commitTemp(): void {
    const raw = this.tempDraft();
    this.tempDraft.set(null);
    if (raw === null) return;
    const parsed = Number(raw.replace(',', '.').trim());
    if (!Number.isFinite(parsed)) return;
    this.store.temp.set(Math.min(TEMP_MAX, Math.max(TEMP_MIN, Math.round(parsed * 10) / 10)));
  }

  protected onTempKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.commitTemp();
      this.store.stepTemp(event.key === 'ArrowUp' ? 0.1 : -0.1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.commitTemp();
    }
  }

  protected onPain(value: string): void {
    this.store.pain.set(Number(value));
  }

  protected async submit(): Promise<void> {
    if (this.submitting()) return;
    this.commitTemp();
    this.submitting.set(true);
    const values = {
      feverCelsius: this.store.temp(),
      painLevel: this.store.pain(),
      nauseaLevel: this.store.nausea(),
      symptomNotes: this.store.notes(),
    };
    try {
      const outcome = await this.sync.submit(values);
      const at = outcome.queued ? new Date().toISOString() : outcome.result.loggedAt;
      this.store.lastSubmission.set({
        level: outcome.queued ? outcome.provisionalLevel : outcome.result.level,
        queued: outcome.queued,
        at,
        feverCelsius: values.feverCelsius,
        painLevel: values.painLevel,
        nauseaLevel: values.nauseaLevel,
      });
      this.home.markCheckedIn(at);
      this.store.reset();
      await this.router.navigate(['/patient/bestaetigung'], { replaceUrl: true });
    } catch (error) {
      this.notifications.error(
        error instanceof HttpErrorResponse ? userMessageFor(error) : 'Der Check-in konnte nicht gespeichert werden. Bitte erneut versuchen.',
      );
    } finally {
      this.submitting.set(false);
    }
  }
}
