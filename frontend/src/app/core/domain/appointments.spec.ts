import { describe, expect, it } from 'vitest';
import {
  appointmentNote,
  appointmentTitle,
  formatAppointmentDay,
  formatAppointmentWhen,
  isReminderDue,
  splitStartsAt,
  toStartsAtIso,
} from './appointments';

const now = new Date(2026, 9, 11, 10, 0); // So, 11.10.2026 10:00
const at = (day: number, h: number, m = 0): string => new Date(2026, 9, day, h, m).toISOString();

describe('isReminderDue', () => {
  it('ist innerhalb der nächsten 24 Stunden fällig', () => {
    expect(isReminderDue({ startsAt: at(12, 8, 30) }, now)).toBe(true);
    expect(isReminderDue({ startsAt: at(12, 10, 0) }, now)).toBe(true);
  });

  it('ist für spätere und bereits begonnene Termine nicht fällig', () => {
    expect(isReminderDue({ startsAt: at(12, 10, 1) }, now)).toBe(false);
    expect(isReminderDue({ startsAt: at(11, 9, 59) }, now)).toBe(false);
  });
});

describe('formatAppointmentDay', () => {
  it('nennt heute und morgen beim Namen, sonst Wochentag und Datum', () => {
    expect(formatAppointmentDay(at(11, 14), now)).toBe('Heute');
    expect(formatAppointmentDay(at(12, 8, 30), now)).toBe('Morgen');
    expect(formatAppointmentDay(at(14, 9), now)).toBe('Mi, 14.10.');
    expect(formatAppointmentWhen(at(12, 8, 30), now)).toBe('Morgen, 08:30');
  });
});

describe('appointmentTitle / appointmentNote', () => {
  it('nutzt die Terminart als Überschrift und zeigt den Hinweis darunter', () => {
    const a = { type: 'BLOOD_DRAW' as const, note: 'nüchtern erscheinen' };
    expect(appointmentTitle(a)).toBe('Blutabnahme');
    expect(appointmentNote(a)).toBe('nüchtern erscheinen');
  });

  it('nutzt bei „Sonstiger Termin“ die Beschreibung als Überschrift', () => {
    const a = { type: 'OTHER' as const, note: 'Ernährungsberatung' };
    expect(appointmentTitle(a)).toBe('Ernährungsberatung');
    expect(appointmentNote(a)).toBeNull();
  });
});

describe('toStartsAtIso / splitStartsAt', () => {
  it('rechnet Ortszeit in einen ISO-Zeitpunkt um und zurück', () => {
    const iso = toStartsAtIso('2026-10-12', '08:30');
    expect(new Date(iso).getHours()).toBe(8);
    expect(splitStartsAt(iso)).toEqual({ date: '2026-10-12', time: '08:30' });
  });
});
