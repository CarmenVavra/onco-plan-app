/**
 * API-Verträge – Spiegel von `backend/src/dto.ts`. Änderungen immer in beiden Dateien vornehmen.
 */
export type UserRole = 'PATIENT' | 'DOCTOR' | 'ADMIN';
export type AlertLevel = 'RED' | 'YELLOW';
export type TriageLevel = AlertLevel | 'GREEN';
export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface SessionUser {
  id: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface MedicationDose {
  planId: string;
  time: string;
  name: string;
  dose: string;
  hint: string | null;
  taken: boolean;
}

export interface PatientHome {
  firstName: string;
  lastName: string;
  diagnosis: string;
  therapyStart: string;
  therapyDay: number;
  therapyWeek: number;
  doctorName: string | null;
  clinicName: string;
  hotline: string;
  todayCheckinAt: string | null;
  medications: MedicationDose[];
}

export interface SymptomHistoryEntry {
  id: string;
  loggedAt: string;
  feverCelsius: number;
  painLevel: number;
  nauseaLevel: number;
  level: TriageLevel;
  note: string | null;
}

/** Payload für POST /api/symptoms */
export interface SymptomLogPayload {
  feverCelsius: number;
  painLevel: number;
  nauseaLevel: number;
  symptomNotes?: string;
  loggedAt: string;
  clientRef: string;
  syncStatus?: 'synced' | 'offline';
}

export interface CheckinResult {
  logId: string;
  loggedAt: string;
  level: TriageLevel;
  reason: string;
  alertId: string | null;
  duplicate: boolean;
}

export interface Alert {
  id: string;
  level: AlertLevel;
  status: AlertStatus;
  triggerReason: string;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
}

export interface LatestLog {
  loggedAt: string;
  feverCelsius: number;
  painLevel: number;
  nauseaLevel: number;
}

export interface PatientRow {
  patientId: string;
  name: string;
  age: number;
  diagnosis: string;
  therapyWeek: number;
  latestLog: LatestLog | null;
  hasCheckinToday: boolean;
  alert: Alert | null;
  level: TriageLevel;
}

export interface DailyTemperature {
  date: string;
  maxCelsius: number | null;
}

export interface PatientDetail extends PatientRow {
  phone: string | null;
  note: string | null;
  temperatures: DailyTemperature[];
  medications: Array<{ time: string; name: string; dose: string }>;
}

export interface DoctorOverview {
  doctor: { name: string; initials: string; department: string };
  clinicName: string;
  demoMode: boolean;
  patients: PatientRow[];
}

// ── Patientenverwaltung ─────────────────────────────────────────────

export interface DoctorOption {
  id: string;
  name: string;
}

export interface MedicationPlan {
  id: string;
  medicationName: string;
  dosage: string;
  times: string[];
  hint: string | null;
  /** "YYYY-MM-DD" */
  startDate: string;
  endDate: string;
  active: boolean;
}

export type MedicationPlanInput = Omit<MedicationPlan, 'id' | 'active' | 'hint'> & { hint?: string };

export interface PatientMaster {
  patientId: string;
  firstName: string;
  lastName: string;
  email: string;
  birthDate: string;
  cancerType: string;
  therapyStart: string;
  phone: string | null;
  assignedDoctorId: string | null;
  medications: MedicationPlan[];
}

export type PatientMasterInput = Omit<PatientMaster, 'patientId' | 'medications' | 'phone' | 'assignedDoctorId'> & {
  phone?: string;
  assignedDoctorId?: string;
};

export interface InitialPassword {
  patientId: string;
  initialPassword: string;
}

export interface AlertHistoryEntry extends Alert {
  patientId: string;
  patientName: string;
  resolvedAt: string | null;
}

export interface ApiErrorBody {
  error?: { code?: string; message?: string };
}
