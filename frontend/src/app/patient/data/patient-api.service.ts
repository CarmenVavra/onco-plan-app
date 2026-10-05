import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { type Observable, firstValueFrom } from 'rxjs';
import { SILENT_ERRORS } from '../../core/http/api-error.interceptor';
import type { CheckinResult, PatientHome, SymptomHistoryEntry, SymptomLogPayload } from '../../core/models/api.models';
import { OfflineDbService } from '../../core/offline/offline-db.service';
import { AuthService } from '../../core/services/auth.service';

export interface Loaded<T> {
  data: T;
  /** `true`, wenn offline der zuletzt gespeicherte Stand angezeigt wird */
  stale: boolean;
  savedAt: string | null;
}

/** Netzwerkfehler (kein Server erreichbar) – im Gegensatz zu fachlichen Fehlern. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof HttpErrorResponse && (error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504);
}

@Injectable({ providedIn: 'root' })
export class PatientApiService {
  private readonly http = inject(HttpClient);
  private readonly db = inject(OfflineDbService);
  private readonly auth = inject(AuthService);

  /** Heute-Ansicht; offline wird der letzte Stand aus IndexedDB geliefert. */
  loadHome(): Promise<Loaded<PatientHome>> {
    return this.withSnapshot('home', () =>
      this.http.get<PatientHome>('/api/patient/home', { context: new HttpContext().set(SILENT_ERRORS, true) }),
    );
  }

  loadHistory(days: number): Promise<Loaded<SymptomHistoryEntry[]>> {
    return this.withSnapshot(`history-${days}`, () =>
      this.http.get<SymptomHistoryEntry[]>('/api/patient/symptoms', {
        params: { days },
        context: new HttpContext().set(SILENT_ERRORS, true),
      }),
    );
  }

  setIntake(planId: string, time: string, taken: boolean): Promise<void> {
    return firstValueFrom(this.http.put<void>('/api/patient/medications/intake', { planId, time, taken }));
  }

  /** Fehler werden vom Aufrufer behandelt (Offline-Warteschlange). */
  postSymptom(payload: SymptomLogPayload): Promise<CheckinResult> {
    return firstValueFrom(
      this.http.post<CheckinResult>('/api/symptoms', payload, { context: new HttpContext().set(SILENT_ERRORS, true) }),
    );
  }

  private async withSnapshot<T>(name: string, request: () => Observable<T>): Promise<Loaded<T>> {
    const userId = this.auth.user()?.id ?? 'anonymous';
    const key = `${userId}:${name}`;
    try {
      const data = await firstValueFrom(request());
      void this.db.snapshots.put({ key, userId, data, savedAt: new Date().toISOString() }).catch(() => undefined);
      return { data, stale: false, savedAt: null };
    } catch (error) {
      if (isNetworkError(error)) {
        const snapshot = await this.db.snapshots.get(key).catch(() => undefined);
        if (snapshot) return { data: snapshot.data as T, stale: true, savedAt: snapshot.savedAt };
      }
      throw error;
    }
  }
}
