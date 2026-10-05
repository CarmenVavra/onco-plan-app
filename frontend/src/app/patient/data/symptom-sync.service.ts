import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { evaluateTriageLevel } from '../../core/domain/triage';
import type { CheckinResult, SymptomLogPayload, TriageLevel } from '../../core/models/api.models';
import { OfflineDbService } from '../../core/offline/offline-db.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { PatientApiService, isNetworkError } from './patient-api.service';

export interface CheckinValues {
  feverCelsius: number;
  painLevel: number;
  nauseaLevel: number;
  symptomNotes?: string;
}

export type SubmissionOutcome =
  | { queued: false; result: CheckinResult }
  /** Offline gespeichert; Stufe nur clientseitig vorab bestimmt (Server entscheidet beim Sync). */
  | { queued: true; provisionalLevel: TriageLevel };

const RETRY_INTERVAL_MS = 60_000;

/**
 * Check-in senden – online direkt, offline über die IndexedDB-Warteschlange.
 * Beim Wechsel zu "online" (und periodisch, solange etwas wartet) wird nachsynchronisiert.
 * Jede Erfassung trägt eine clientRef (UUID), daher sind Wiederholungen idempotent.
 */
@Injectable({ providedIn: 'root' })
export class SymptomSyncService {
  private readonly api = inject(PatientApiService);
  private readonly db = inject(OfflineDbService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);

  private readonly _isOnline = signal<boolean>(navigator.onLine);
  readonly isOnline = this._isOnline.asReadonly();
  private readonly _pendingCount = signal(0);
  readonly pendingCount = this._pendingCount.asReadonly();
  private readonly _syncing = signal(false);
  readonly syncing = this._syncing.asReadonly();

  constructor() {
    const update = (): void => {
      this._isOnline.set(navigator.onLine);
      if (navigator.onLine) void this.syncNow();
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const timer = setInterval(() => {
      if (this._isOnline() && this._pendingCount() > 0) void this.syncNow();
    }, RETRY_INTERVAL_MS);

    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      clearInterval(timer);
    });

    void this.refreshPending().then(() => this.syncNow());
  }

  async submit(values: CheckinValues): Promise<SubmissionOutcome> {
    const payload: SymptomLogPayload = {
      ...values,
      symptomNotes: values.symptomNotes?.trim() || undefined,
      loggedAt: new Date().toISOString(),
      clientRef: crypto.randomUUID(),
    };

    if (this._isOnline()) {
      try {
        return { queued: false, result: await this.api.postSymptom(payload) };
      } catch (error) {
        if (!isNetworkError(error)) throw error;
        // Verbindung trotz "online" weg → lokal sichern
      }
    }

    await this.enqueue({ ...payload, syncStatus: 'offline' });
    return { queued: true, provisionalLevel: evaluateTriageLevel(values.feverCelsius, values.painLevel, values.nauseaLevel) };
  }

  /** Überträgt wartende Einträge der angemeldeten Person der Reihe nach. */
  async syncNow(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId || this._syncing() || !navigator.onLine) return;
    this._syncing.set(true);
    let sent = 0;
    try {
      const entries = await this.db.symptomQueue.where('userId').equals(userId).sortBy('id');
      for (const entry of entries) {
        try {
          await this.api.postSymptom(entry.payload);
          sent++;
          if (entry.id !== undefined) await this.db.symptomQueue.delete(entry.id);
        } catch (error) {
          if (isNetworkError(error) || (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 429))) {
            break; // später erneut versuchen – nichts verwerfen
          }
          // Dauerhaft ungültig (z. B. älter als 14 Tage): entfernen, damit die Warteschlange nicht blockiert.
          if (entry.id !== undefined) await this.db.symptomQueue.delete(entry.id);
          this.notifications.error('Ein gespeicherter Check-in konnte nicht übertragen werden. Bitte erfassen Sie ihn erneut.');
        }
      }
    } catch {
      // IndexedDB nicht verfügbar
    } finally {
      this._syncing.set(false);
      await this.refreshPending();
    }
    if (sent > 0) {
      this.notifications.success(sent === 1 ? 'Gespeicherter Check-in wurde an die Klinik übertragen.' : `${sent} gespeicherte Check-ins wurden übertragen.`);
    }
  }

  private async enqueue(payload: SymptomLogPayload): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) throw new Error('Nicht angemeldet');
    await this.db.symptomQueue.add({ userId, payload, queuedAt: new Date().toISOString() });
    await this.refreshPending();
  }

  private async refreshPending(): Promise<void> {
    const userId = this.auth.user()?.id;
    try {
      this._pendingCount.set(userId ? await this.db.symptomQueue.where('userId').equals(userId).count() : 0);
    } catch {
      this._pendingCount.set(0);
    }
  }
}
