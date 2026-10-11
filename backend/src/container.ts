import type { PrismaClient } from '@prisma/client';
import { AccountService } from './services/AccountService';
import type { AlertNotifier } from './services/AlertNotifier';
import { AlertService } from './services/AlertService';
import { AppointmentService } from './services/AppointmentService';
import { DoctorService } from './services/DoctorService';
import { MedicationService } from './services/MedicationService';
import { PatientAdminService } from './services/PatientAdminService';
import { PatientService } from './services/PatientService';
import { PushService, type PushSender } from './services/PushService';
import { ReminderService } from './services/ReminderService';
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
  appointments: AppointmentService;
  push: PushService;
  reminders: ReminderService;
}

export function createServices(prisma: PrismaClient, notifier: AlertNotifier, pushSender: PushSender): Services {
  const medications = new MedicationService(prisma);
  const appointments = new AppointmentService(prisma, notifier);
  const push = new PushService(prisma, pushSender);
  const triage = new TriageEngine(prisma, notifier);
  return {
    prisma,
    medications,
    appointments,
    push,
    reminders: new ReminderService(prisma, push),
    symptoms: new SymptomService(prisma, triage),
    patients: new PatientService(prisma, medications, appointments),
    doctors: new DoctorService(prisma, medications),
    alerts: new AlertService(prisma, notifier),
    patientAdmin: new PatientAdminService(prisma, notifier, appointments),
    accounts: new AccountService(prisma),
  };
}
