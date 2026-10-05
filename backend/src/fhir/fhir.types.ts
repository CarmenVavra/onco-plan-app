/**
 * Teilmenge der HL7 FHIR R4 Ressourcen, die OncoPlan erzeugt.
 * Referenz: https://hl7.org/fhir/R4/
 */
export interface FhirCoding {
  system: string;
  code: string;
  display?: string;
}

export interface FhirCodeableConcept {
  coding: FhirCoding[];
  text?: string;
}

export interface FhirReference {
  reference: string;
  display?: string;
}

export interface FhirHumanName {
  use: 'official' | 'usual';
  family: string;
  given: string[];
}

export interface FhirPatient {
  resourceType: 'Patient';
  id: string;
  active: boolean;
  name: FhirHumanName[];
  birthDate: string;
}

export interface FhirQuantity {
  value: number;
  unit: string;
  system: 'http://unitsofmeasure.org';
  code: string;
}

export interface FhirObservation {
  resourceType: 'Observation';
  id: string;
  status: 'final';
  category: FhirCodeableConcept[];
  code: FhirCodeableConcept;
  subject: FhirReference;
  effectiveDateTime: string;
  valueQuantity?: FhirQuantity;
  valueInteger?: number;
  interpretation?: FhirCodeableConcept[];
}

export interface FhirBundle<T> {
  resourceType: 'Bundle';
  type: 'searchset';
  total: number;
  entry: Array<{ fullUrl: string; resource: T }>;
}
