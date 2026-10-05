/**
 * API-Datentransferobjekte (JSON-Verträge zwischen Backend und Angular-Frontend).
 * Das Frontend spiegelt diese Typen in `frontend/src/app/core/models/api.models.ts`.
 */
import type { AlertLevel, AlertStatus, UserRole } from '@prisma/client';

export type TriageLevel = AlertLevel | 'GREEN';

export interface SessionUserDto {
  id: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface MedicationDoseDto {
  planId: string;
  /** "HH:MM" */
  time: string;
  name: string;
  dose: string;
  hint: string | null;
  taken: boolean;
}

export interface PatientHomeDto {
  firstName: string;
  lastName: string;
  diagnosis: string;
  therapyStart: string;
  therapyDay: number;
  therapyWeek: number;
  doctorName: string | null;
  clinicName: string;
  hotline: string;
  /** Zeitpunkt des heutigen Check-ins (ISO) oder `null` */
  todayCheckinAt: string | null;
  medications: MedicationDoseDto[];
}

export interface SymptomHistoryEntryDto {
  id: string;
  loggedAt: string;
  feverCelsius: number;
  painLevel: number;
  nauseaLevel: number;
  level: TriageLevel;
  note: string | null;
}

export interface AlertDto {
  id: string;
  level: AlertLevel;
  status: AlertStatus;
  triggerReason: string;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
}

export interface LatestLogDto {
  loggedAt: string;
  feverCelsius: number;
  painLevel: number;
  nauseaLevel: number;
}

export interface PatientRowDto {
  patientId: string;
  name: string;
  age: number;
  diagnosis: string;
  therapyWeek: number;
  latestLog: LatestLogDto | null;
  hasCheckinToday: boolean;
  /** Für die Ampel relevanter Alarm (aktiv oder zum letzten Log quittiert) */
  alert: AlertDto | null;
  level: TriageLevel;
}

export interface DailyTemperatureDto {
  /** ISO-Datum (YYYY-MM-DD, lokal) */
  date: string;
  /** Tageshöchstwert in °C oder `null` ohne Messung */
  maxCelsius: number | null;
}

export interface PatientDetailDto extends PatientRowDto {
  phone: string | null;
  note: string | null;
  temperatures: DailyTemperatureDto[];
  medications: Array<{ time: string; name: string; dose: string }>;
}

export interface DoctorOverviewDto {
  doctor: { name: string; initials: string; department: string };
  clinicName: string;
  demoMode: boolean;
  patients: PatientRowDto[];
}

// ── Patientenverwaltung ─────────────────────────────────────────────

export interface DoctorOptionDto {
  id: string;
  name: string;
}

export interface MedicationPlanDto {
  id: string;
  medicationName: string;
  dosage: string;
  /** Einnahmezeiten "HH:MM" */
  times: string[];
  hint: string | null;
  /** "YYYY-MM-DD" */
  startDate: string;
  endDate: string;
  /** Heute gültig */
  active: boolean;
}

/** Bearbeitbare Stammdaten (Datumswerte als "YYYY-MM-DD") */
export interface PatientMasterDto {
  patientId: string;
  firstName: string;
  lastName: string;
  email: string;
  birthDate: string;
  cancerType: string;
  therapyStart: string;
  phone: string | null;
  assignedDoctorId: string | null;
  medications: MedicationPlanDto[];
}

/** Startpasswort wird genau einmal im Klartext ausgeliefert. */
export interface InitialPasswordDto {
  patientId: string;
  initialPassword: string;
}

export interface AlertHistoryEntryDto extends AlertDto {
  patientId: string;
  patientName: string;
  resolvedAt: string | null;
}
