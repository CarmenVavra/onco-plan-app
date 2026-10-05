import type { SymptomLog } from '@prisma/client';
import type { FhirBundle, FhirCodeableConcept, FhirObservation, FhirPatient } from './fhir.types';

const OBS_CATEGORY = 'http://terminology.hl7.org/CodeSystem/observation-category';
const LOINC = 'http://loinc.org';
const SNOMED = 'http://snomed.info/sct';
const UCUM = 'http://unitsofmeasure.org' as const;

const vitalSigns: FhirCodeableConcept = { coding: [{ system: OBS_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }] };
const survey: FhirCodeableConcept = { coding: [{ system: OBS_CATEGORY, code: 'survey', display: 'Survey' }] };

/** `birthDate` als FHIR-Datum "YYYY-MM-DD". */
export function toFhirPatient(p: { id: string; firstName: string; lastName: string; birthDate: string }): FhirPatient {
  return {
    resourceType: 'Patient',
    id: p.id,
    active: true,
    name: [{ use: 'official', family: p.lastName, given: [p.firstName] }],
    birthDate: p.birthDate,
  };
}

/**
 * Ein Symptom-Log wird in drei Observations übersetzt:
 * Körpertemperatur (LOINC 8310-5), Schmerzintensität 0–10 (LOINC 72514-3),
 * Übelkeit 0–3 (SNOMED CT 422587007 "Nausea").
 */
export function toFhirObservations(log: Pick<SymptomLog, 'id' | 'patientId' | 'loggedAt' | 'feverCelsius' | 'painLevel' | 'nauseaLevel'>): FhirObservation[] {
  const subject = { reference: `Patient/${log.patientId}` };
  const effectiveDateTime = log.loggedAt.toISOString();
  return [
    {
      resourceType: 'Observation',
      id: `${log.id}-temp`,
      status: 'final',
      category: [vitalSigns],
      code: { coding: [{ system: LOINC, code: '8310-5', display: 'Body temperature' }] },
      subject,
      effectiveDateTime,
      valueQuantity: { value: log.feverCelsius, unit: 'C', system: UCUM, code: 'Cel' },
    },
    {
      resourceType: 'Observation',
      id: `${log.id}-pain`,
      status: 'final',
      category: [survey],
      code: { coding: [{ system: LOINC, code: '72514-3', display: 'Pain severity - 0-10 verbal numeric rating [Score] - Reported' }] },
      subject,
      effectiveDateTime,
      valueInteger: log.painLevel,
    },
    {
      resourceType: 'Observation',
      id: `${log.id}-nausea`,
      status: 'final',
      category: [survey],
      code: { coding: [{ system: SNOMED, code: '422587007', display: 'Nausea' }], text: 'Übelkeit (0=Keine, 1=Leicht, 2=Mittel, 3=Schwer)' },
      subject,
      effectiveDateTime,
      valueInteger: log.nauseaLevel,
    },
  ];
}

export function toBundle<T extends { resourceType: string; id: string }>(resources: T[], baseUrl: string): FhirBundle<T> {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: resources.length,
    entry: resources.map((r) => ({ fullUrl: `${baseUrl}/${r.resourceType}/${r.id}`, resource: r })),
  };
}
