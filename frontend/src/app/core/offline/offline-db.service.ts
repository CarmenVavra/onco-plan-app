import { Injectable } from '@angular/core';
import Dexie, { type Table } from 'dexie';
import type { SymptomLogPayload } from '../models/api.models';

/** Offline erfasster Check-in, wartet auf Übertragung. */
export interface QueuedSymptomLog {
  id?: number;
  /** Eintrag gehört genau dieser Person – wird nie unter einem anderen Konto gesendet. */
  userId: string;
  payload: SymptomLogPayload;
  queuedAt: string;
}

/** Letzter bekannter Serverstand für den Offline-Start (z. B. Einnahmeplan). */
export interface Snapshot {
  key: string;
  userId: string;
  data: unknown;
  savedAt: string;
}

@Injectable({ providedIn: 'root' })
export class OfflineDbService extends Dexie {
  symptomQueue!: Table<QueuedSymptomLog, number>;
  snapshots!: Table<Snapshot, string>;

  constructor() {
    super('OncoPlanOfflineDB');
    this.version(1).stores({
      symptomQueue: '++id, userId, queuedAt',
      snapshots: 'key, userId',
    });
  }
}

/** Beim Abmelden: zwischengespeicherte Gesundheitsdaten (Snapshots) entfernen. */
export async function clearSnapshotsForUser(db: OfflineDbService, userId: string): Promise<void> {
  await db.snapshots.where('userId').equals(userId).delete();
}
