import { Injectable, computed, signal } from '@angular/core';
import { evaluateTriageLevel } from '../../core/domain/triage';
import type { TriageLevel } from '../../core/models/api.models';

export const TEMP_MIN = 34;
export const TEMP_MAX = 42;
const TEMP_DEFAULT = 36.8;

export interface LastSubmission {
  level: TriageLevel;
  queued: boolean;
  at: string;
  feverCelsius: number;
  painLevel: number;
  nauseaLevel: number;
}

/** Zustand des täglichen Check-ins (Signals) – überlebt Navigation zwischen 1b und 1c. */
@Injectable({ providedIn: 'root' })
export class CheckinStore {
  readonly temp = signal(TEMP_DEFAULT);
  readonly pain = signal(0);
  readonly nausea = signal(0);
  readonly notes = signal('');

  /** Live-Hinweis (spiegelt die Server-Regel nur für Feedback) */
  readonly triageLevel = computed(() => evaluateTriageLevel(this.temp(), this.pain(), this.nausea()));

  readonly lastSubmission = signal<LastSubmission | null>(null);

  stepTemp(delta: number): void {
    this.temp.update((t) => Math.min(TEMP_MAX, Math.max(TEMP_MIN, Math.round((t + delta) * 10) / 10)));
  }

  reset(): void {
    this.temp.set(TEMP_DEFAULT);
    this.pain.set(0);
    this.nausea.set(0);
    this.notes.set('');
  }
}
