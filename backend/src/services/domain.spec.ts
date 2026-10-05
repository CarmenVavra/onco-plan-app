import { selectRelevantAlert, type SelectableAlert } from './alertSelection';
import { expandDoses } from './MedicationService';
import { toFhirObservations } from '../fhir/fhirMapper';
import { SymptomLogSchema } from '../validation/schemas';

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);

describe('selectRelevantAlert (Ampelfarbe einer Person)', () => {
  const alert = (o: Partial<SelectableAlert> & { id: string }): SelectableAlert & { id: string } => ({
    level: 'YELLOW',
    status: 'ACTIVE',
    symptomLogId: null,
    createdAt: at(10),
    ...o,
  });

  it('aktiver ROTER Alarm schlägt neueren GELBEN', () => {
    const red = alert({ id: 'r', level: 'RED', createdAt: at(60) });
    const yellow = alert({ id: 'y', createdAt: at(5) });
    expect(selectRelevantAlert([yellow, red], null)?.id).toBe('r');
  });

  it('unquittierter Alarm bleibt sichtbar, auch wenn der letzte Check-in unauffällig war', () => {
    const red = alert({ id: 'r', level: 'RED', symptomLogId: 'old' });
    expect(selectRelevantAlert([red], 'newest')?.id).toBe('r');
  });

  it('quittierter Alarm von heute bleibt sichtbar, auch nach neuerem unauffälligem Check-in', () => {
    const now = new Date(2026, 9, 5, 15, 0);
    const acked = alert({ id: 'a', status: 'ACKNOWLEDGED', symptomLogId: 'log-1', createdAt: new Date(2026, 9, 5, 9, 41) });
    expect(selectRelevantAlert([acked], 'log-2', now)?.id).toBe('a');
  });

  it('älterer quittierter Alarm zählt nur, wenn er zum letzten Check-in gehört', () => {
    const now = new Date(2026, 9, 5, 15, 0);
    const acked = alert({ id: 'a', status: 'ACKNOWLEDGED', symptomLogId: 'log-1', createdAt: new Date(2026, 9, 4, 8, 0) });
    expect(selectRelevantAlert([acked], 'log-1', now)?.id).toBe('a');
    expect(selectRelevantAlert([acked], 'log-2', now)).toBeNull();
  });

  it('ohne Alarme → null (GRÜN)', () => {
    expect(selectRelevantAlert([], 'log-1')).toBeNull();
  });
});

describe('expandDoses', () => {
  const day = new Date(2026, 9, 5);
  const plan = (o: Partial<Parameters<typeof expandDoses>[0][number]>) => ({
    id: 'p',
    medicationName: 'Capecitabin',
    dosage: '1.150 mg',
    frequencyCron: '0 8 * * *',
    hint: null,
    // DATE-Spalten kommen als UTC-Mitternacht aus der Datenbank
    startDate: new Date(Date.UTC(2026, 8, 26)),
    endDate: new Date(Date.UTC(2026, 10, 30)),
    ...o,
  });

  it('expandiert Pläne in Dosen und sortiert nach Uhrzeit', () => {
    const doses = expandDoses([plan({ id: 'a', frequencyCron: '0 20 * * *' }), plan({ id: 'b', frequencyCron: '0 8,13 * * *' })], day);
    expect(doses.map((d) => `${d.time} ${d.planId}`)).toEqual(['08:00 b', '13:00 b', '20:00 a']);
  });

  it('ignoriert Pläne außerhalb des Gültigkeitszeitraums (Grenztage inklusive)', () => {
    expect(expandDoses([plan({ endDate: new Date(Date.UTC(2026, 9, 4)) })], day)).toHaveLength(0);
    expect(expandDoses([plan({ startDate: new Date(Date.UTC(2026, 9, 6)) })], day)).toHaveLength(0);
    expect(expandDoses([plan({ startDate: new Date(Date.UTC(2026, 9, 5)), endDate: new Date(Date.UTC(2026, 9, 5)) })], day)).toHaveLength(1);
  });
});

describe('FHIR-Mapping', () => {
  it('erzeugt eine Körpertemperatur-Observation nach LOINC 8310-5 in °C (UCUM "Cel")', () => {
    const [temp] = toFhirObservations({
      id: 'log-1',
      patientId: 'p-1',
      loggedAt: new Date('2026-10-05T14:30:00Z'),
      feverCelsius: 38.7,
      painLevel: 3,
      nauseaLevel: 1,
    });
    expect(temp).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '8310-5' }] },
      subject: { reference: 'Patient/p-1' },
      effectiveDateTime: '2026-10-05T14:30:00.000Z',
      valueQuantity: { value: 38.7, unit: 'C', system: 'http://unitsofmeasure.org', code: 'Cel' },
    });
  });
});

describe('SymptomLogSchema (Eingabevalidierung)', () => {
  const valid = { feverCelsius: 37.8, painLevel: 6, nauseaLevel: 1 };

  it('akzeptiert gültige Eingaben', () => {
    expect(SymptomLogSchema.parse({ ...valid, symptomNotes: 'ok' })).toMatchObject(valid);
  });

  it.each([
    ['Temperatur zu niedrig', { feverCelsius: 33.9 }],
    ['Temperatur zu hoch', { feverCelsius: 43.1 }],
    ['zwei Nachkommastellen', { feverCelsius: 37.85 }],
    ['Schmerz > 10', { painLevel: 11 }],
    ['Schmerz nicht ganzzahlig', { painLevel: 5.5 }],
    ['Übelkeit > 3', { nauseaLevel: 4 }],
    ['Text statt Zahl', { feverCelsius: '<script>' }],
    ['Notiz zu lang', { symptomNotes: 'x'.repeat(1001) }],
    ['Zeitpunkt in der Zukunft', { loggedAt: new Date(Date.now() + 3600_000).toISOString() }],
  ])('lehnt ab: %s', (_label, override) => {
    expect(SymptomLogSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });
});
