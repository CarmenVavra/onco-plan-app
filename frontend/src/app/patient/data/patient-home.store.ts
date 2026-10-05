import { Injectable, computed, inject, signal } from '@angular/core';
import type { MedicationDose, PatientHome } from '../../core/models/api.models';
import { NotificationService } from '../../core/services/notification.service';
import { PatientApiService } from './patient-api.service';

@Injectable({ providedIn: 'root' })
export class PatientHomeStore {
  private readonly api = inject(PatientApiService);
  private readonly notifications = inject(NotificationService);

  readonly home = signal<PatientHome | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal(false);
  readonly stale = signal(false);

  readonly medications = computed(() => this.home()?.medications ?? []);
  readonly takenCount = computed(() => this.medications().filter((m) => m.taken).length);
  readonly nextOpenDose = computed(() => this.medications().find((m) => !m.taken) ?? null);

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.api.loadHome();
      this.home.set(result.data);
      this.stale.set(result.stale);
      this.loadError.set(false);
    } catch {
      this.loadError.set(this.home() === null);
    } finally {
      this.loading.set(false);
    }
  }

  /** Optimistisch abhaken; bei Fehler zurücksetzen. */
  async toggle(dose: MedicationDose): Promise<void> {
    const target = !dose.taken;
    this.patchDose(dose, target);
    try {
      await this.api.setIntake(dose.planId, dose.time, target);
    } catch {
      this.patchDose(dose, !target);
      if (!navigator.onLine) {
        this.notifications.error('Offline – die Einnahme kann erst mit Verbindung gespeichert werden.');
      }
    }
  }

  markCheckedIn(at: string): void {
    this.home.update((h) => (h ? { ...h, todayCheckinAt: at } : h));
  }

  private patchDose(dose: MedicationDose, taken: boolean): void {
    this.home.update((h) =>
      h
        ? {
            ...h,
            medications: h.medications.map((m) =>
              m.planId === dose.planId && m.time === dose.time ? { ...m, taken } : m,
            ),
          }
        : h,
    );
  }
}
