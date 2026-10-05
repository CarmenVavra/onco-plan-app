import { isValidDailyCron, parseDailyCron } from './cron';
import { ageInYears, formatDecimalDe, therapyDay, therapyWeek } from './therapy';

describe('therapyDay / therapyWeek', () => {
  const start = new Date(2026, 8, 26); // 26.09.2026

  it('Tag des Therapiebeginns ist Tag 1, Woche 1', () => {
    expect(therapyDay(start, new Date(2026, 8, 26, 23, 59))).toBe(1);
    expect(therapyWeek(start, new Date(2026, 8, 26))).toBe(1);
  });

  it('Tag 7 → Woche 1, Tag 8 → Woche 2', () => {
    expect(therapyWeek(start, new Date(2026, 9, 2))).toBe(1);
    expect(therapyWeek(start, new Date(2026, 9, 3))).toBe(2);
  });

  it('Mockup-Referenz: 5. Oktober = Therapiewoche 2 · Tag 10', () => {
    const at = new Date(2026, 9, 5, 9, 41);
    expect(therapyDay(start, at)).toBe(10);
    expect(therapyWeek(start, at)).toBe(2);
  });

  it('Zeitpunkte vor Therapiebeginn werden auf Tag 1 begrenzt', () => {
    expect(therapyDay(start, new Date(2026, 8, 20))).toBe(1);
  });
});

describe('ageInYears', () => {
  it('berücksichtigt, ob der Geburtstag im laufenden Jahr schon war', () => {
    expect(ageInYears(new Date(1975, 9, 6), new Date(2026, 9, 5))).toBe(50);
    expect(ageInYears(new Date(1975, 9, 5), new Date(2026, 9, 5))).toBe(51);
  });
});

describe('formatDecimalDe', () => {
  it('nutzt Komma und eine Nachkommastelle', () => {
    expect(formatDecimalDe(38.9)).toBe('38,9');
    expect(formatDecimalDe(37)).toBe('37,0');
  });
});

describe('parseDailyCron', () => {
  it('liest eine einzelne Uhrzeit', () => {
    expect(parseDailyCron('0 8 * * *')).toEqual([{ hour: 8, minute: 0, label: '08:00' }]);
  });

  it('expandiert Listen und sortiert nach Uhrzeit', () => {
    expect(parseDailyCron('30 20,8 * * *').map((t) => t.label)).toEqual(['08:30', '20:30']);
  });

  it.each(['', '0 8 * * 1', '*/5 * * * *', '60 8 * * *', '0 24 * * *', 'abc'])('lehnt "%s" ab', (expr) => {
    expect(isValidDailyCron(expr)).toBe(false);
  });
});
