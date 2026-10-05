import type { PrismaClient } from '@prisma/client';
import { AccountService } from './services/AccountService';
import type { AlertNotifier } from './services/AlertNotifier';
import { AlertService } from './services/AlertService';
import { DoctorService } from './services/DoctorService';
import { MedicationService } from './services/MedicationService';
import { PatientAdminService } from './services/PatientAdminService';
import { PatientService } from './services/PatientService';
import { SymptomService } from './services/SymptomService';
import { TriageEngine } from './services/TriageEngine';

/** Verdrahtung der Service-Schicht (manuelle Dependency Injection). */
export interface Services {
  prisma: PrismaClient;
  symptoms: SymptomService;
  patients: PatientService;
  doctors: DoctorService;
  alerts: AlertService;
  medications: MedicationService;
  patientAdmin: PatientAdminService;
  accounts: AccountService;
}

export function createServices(prisma: PrismaClient, notifier: AlertNotifier): Services {
  const medications = new MedicationService(prisma);
  const triage = new TriageEngine(prisma, notifier);
  return {
    prisma,
    medications,
    symptoms: new SymptomService(prisma, triage),
    patients: new PatientService(prisma, medications),
    doctors: new DoctorService(prisma, medications),
    alerts: new AlertService(prisma, notifier),
    patientAdmin: new PatientAdminService(prisma, notifier),
    accounts: new AccountService(prisma),
  };
}
