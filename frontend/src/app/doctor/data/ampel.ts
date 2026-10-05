import type { PatientRow, TriageLevel } from '../../core/models/api.models';

export type RowStatus = 'Aktiv' | 'Quittiert' | 'Stabil' | 'Ausstehend';

/** Sortiergruppe: 1) aktiv rot, 2) aktiv gelb, 3) quittiert, 4) grün */
export function rankOf(row: PatientRow): number {
  if (row.alert?.status === 'ACTIVE') return row.alert.level === 'RED' ? 0 : 1;
  if (row.alert?.status === 'ACKNOWLEDGED') return 2;
  return 3;
}

/** Zeitpunkt für "neueste zuerst" innerhalb einer Gruppe */
function sortTime(row: PatientRow): number {
  const iso = row.alert?.createdAt ?? row.latestLog?.loggedAt;
  return iso ? new Date(iso).getTime() : 0;
}

export function sortByUrgency(rows: PatientRow[]): PatientRow[] {
  return [...rows].sort((a, b) => rankOf(a) - rankOf(b) || sortTime(b) - sortTime(a) || a.name.localeCompare(b.name, 'de'));
}

export function statusOf(row: PatientRow): RowStatus {
  if (row.alert?.status === 'ACTIVE') return 'Aktiv';
  if (row.alert?.status === 'ACKNOWLEDGED') return 'Quittiert';
  return row.hasCheckinToday ? 'Stabil' : 'Ausstehend';
}

export function statusTagClass(row: PatientRow): string {
  switch (statusOf(row)) {
    case 'Aktiv':
      return row.level === 'RED' ? 'tag tag--red' : 'tag tag--yellow';
    case 'Quittiert':
      return 'tag tag--acked';
    case 'Stabil':
      return 'tag tag--stable';
    default:
      return 'tag tag--pending';
  }
}

export function reasonOf(row: PatientRow): string {
  if (row.alert) return row.alert.triggerReason;
  return row.hasCheckinToday ? 'Alle Werte im erwarteten Bereich.' : 'Stabil · Check-in heute noch ausstehend.';
}

export interface Kpis {
  red: number;
  yellow: number;
  green: number;
  checkins: number;
  total: number;
}

/** Rot/Gelb zählen nur aktive (unquittierte) Alarme. */
export function computeKpis(rows: PatientRow[]): Kpis {
  return {
    red: rows.filter((r) => r.alert?.status === 'ACTIVE' && r.alert.level === 'RED').length,
    yellow: rows.filter((r) => r.alert?.status === 'ACTIVE' && r.alert.level === 'YELLOW').length,
    green: rows.filter((r) => r.level === 'GREEN').length,
    checkins: rows.filter((r) => r.hasCheckinToday).length,
    total: rows.length,
  };
}

export const LEVEL_CSS: Record<TriageLevel, string> = { RED: 'red', YELLOW: 'yellow', GREEN: 'green' };
