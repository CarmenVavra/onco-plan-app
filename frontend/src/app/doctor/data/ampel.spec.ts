import { describe, expect, it } from 'vitest';
import type { Alert, PatientRow } from '../../core/models/api.models';
import { computeKpis, sortByUrgency, statusOf } from './ampel';

function row(name: string, alert: Partial<Alert> | null, opts: Partial<PatientRow> = {}): PatientRow {
  const fullAlert: Alert | null = alert
    ? {
        id: `a-${name}`,
        level: 'RED',
        status: 'ACTIVE',
        triggerReason: '',
        createdAt: '2026-10-05T09:00:00Z',
        acknowledgedAt: null,
        acknowledgedByName: null,
        ...alert,
      }
    : null;
  return {
    patientId: name,
    name,
    age: 50,
    diagnosis: 'Dx',
    therapyWeek: 2,
    latestLog: { loggedAt: '2026-10-05T08:00:00Z', feverCelsius: 37, painLevel: 1, nauseaLevel: 0 },
    hasCheckinToday: true,
    alert: fullAlert,
    level: fullAlert?.level ?? 'GREEN',
    ...opts,
  };
}

describe('Ampelliste – Sortierung nach Dringlichkeit', () => {
  it('aktiv rot → aktiv gelb → quittiert → grün', () => {
    const sorted = sortByUrgency([
      row('gruen', null),
      row('quittiert', { status: 'ACKNOWLEDGED' }),
      row('gelb', { level: 'YELLOW' }),
      row('rot', { level: 'RED' }),
    ]);
    expect(sorted.map((r) => r.name)).toEqual(['rot', 'gelb', 'quittiert', 'gruen']);
  });

  it('innerhalb einer Gruppe neueste zuerst', () => {
    const sorted = sortByUrgency([
      row('alt', { createdAt: '2026-10-05T08:00:00Z' }),
      row('neu', { createdAt: '2026-10-05T09:30:00Z' }),
    ]);
    expect(sorted.map((r) => r.name)).toEqual(['neu', 'alt']);
  });
});

describe('Status und KPIs', () => {
  it('leitet den Status-Tag ab', () => {
    expect(statusOf(row('a', {}))).toBe('Aktiv');
    expect(statusOf(row('b', { status: 'ACKNOWLEDGED' }))).toBe('Quittiert');
    expect(statusOf(row('c', null))).toBe('Stabil');
    expect(statusOf(row('d', null, { hasCheckinToday: false }))).toBe('Ausstehend');
  });

  it('Rot/Gelb zählen nur aktive Alarme', () => {
    const kpis = computeKpis([
      row('rot', { level: 'RED' }),
      row('rot-quittiert', { level: 'RED', status: 'ACKNOWLEDGED' }),
      row('gelb', { level: 'YELLOW' }),
      row('gruen', null),
      row('offen', null, { hasCheckinToday: false }),
    ]);
    expect(kpis).toEqual({ red: 1, yellow: 1, green: 2, checkins: 4, total: 5 });
  });
});
