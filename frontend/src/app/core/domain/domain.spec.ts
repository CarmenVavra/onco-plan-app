import { describe, expect, it } from 'vitest';
import { formatCelsius, formatDayOrClock, formatRelative, telHref } from './format';
import { evaluateTriageLevel, nauseaLabel } from './triage';

describe('evaluateTriageLevel (Spiegel der Backend-Regel)', () => {
  it('Fieber ≥ 38,5 °C → RED (Grenzwert inklusive)', () => {
    expect(evaluateTriageLevel(38.5, 0, 0)).toBe('RED');
    expect(evaluateTriageLevel(38.4, 0, 0)).toBe('GREEN');
  });

  it('Schmerz ≥ 7 und Übelkeit ≥ Mittel → YELLOW', () => {
    expect(evaluateTriageLevel(37, 7, 2)).toBe('YELLOW');
    expect(evaluateTriageLevel(37, 6, 3)).toBe('GREEN');
    expect(evaluateTriageLevel(37, 10, 1)).toBe('GREEN');
  });

  it('ROT hat Vorrang vor GELB', () => {
    expect(evaluateTriageLevel(39, 9, 3)).toBe('RED');
  });

  it('stimmt für die gesamte Kombinatorik mit der Spezifikation überein', () => {
    for (let pain = 0; pain <= 10; pain++) {
      for (let nausea = 0; nausea <= 3; nausea++) {
        const expected = pain >= 7 && nausea >= 2 ? 'YELLOW' : 'GREEN';
        expect(evaluateTriageLevel(37.2, pain, nausea)).toBe(expected);
      }
    }
  });
});

describe('Formatierung', () => {
  const now = new Date(2026, 9, 5, 9, 41);

  it('Temperatur im deutschen Format', () => {
    expect(formatCelsius(37.8)).toBe('37,8');
    expect(formatCelsius(38)).toBe('38,0');
  });

  it('relative Zeitangaben', () => {
    expect(formatRelative(new Date(2026, 9, 5, 9, 41, 20).toISOString(), now)).toBe('gerade eben');
    expect(formatRelative(new Date(2026, 9, 5, 9, 37).toISOString(), now)).toBe('vor 4 Min.');
    expect(formatRelative(new Date(2026, 9, 5, 7, 30).toISOString(), now)).toBe('vor 2 Std.');
    expect(formatRelative(new Date(2026, 9, 4, 20, 0).toISOString(), now)).toBe('gestern');
    expect(formatRelative(new Date(2026, 9, 1, 8, 0).toISOString(), now)).toBe('01.10.');
  });

  it('Uhrzeit für heute, sonst "gestern"', () => {
    expect(formatDayOrClock(new Date(2026, 9, 5, 8, 12).toISOString(), now)).toBe('08:12');
    expect(formatDayOrClock(new Date(2026, 9, 4, 8, 12).toISOString(), now)).toBe('gestern');
  });

  it('Übelkeitsstufen', () => {
    expect([0, 1, 2, 3].map(nauseaLabel)).toEqual(['Keine', 'Leicht', 'Mittel', 'Schwer']);
  });

  it('tel:-Links enthalten nur Ziffern', () => {
    expect(telHref('01 404 00-0')).toBe('tel:01404000');
    expect(telHref('+43 664 233 4581')).toBe('tel:+436642334581');
  });
});
