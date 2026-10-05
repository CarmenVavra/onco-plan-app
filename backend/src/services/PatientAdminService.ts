import { Prisma, type MedicationPlan, type PrismaClient } from '@prisma/client';
import type { DoctorOptionDto, InitialPasswordDto, MedicationPlanDto, PatientMasterDto } from '../dto';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { parseDailyCron, toDailyCron } from '../utils/cron';
import { generateInitialPassword } from '../utils/initialPassword';
import { doctorFullName } from '../utils/names';
import { addDays, dbDateToIso, fromDbDate, isoToDbDate, startOfDay, toDbDate } from '../utils/therapy';
import type { MedicationPlanInput, PatientMasterInput } from '../validation/schemas';
import type { AlertNotifier } from './AlertNotifier';
import { CryptoVault } from './CryptoVault';
import { PasswordHasher } from './PasswordHasher';

const EMAIL_TAKEN = 'Diese E-Mail-Adresse ist bereits vergeben.';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function toMedicationPlanDto(plan: MedicationPlan, now: Date = new Date()): MedicationPlanDto {
  const today = startOfDay(now).getTime();
  return {
    id: plan.id,
    medicationName: plan.medicationName,
    dosage: plan.dosage,
    times: parseDailyCron(plan.frequencyCron).map((t) => t.label),
    hint: plan.hint,
    startDate: dbDateToIso(plan.startDate),
    endDate: dbDateToIso(plan.endDate),
    active: fromDbDate(plan.startDate).getTime() <= today && today <= fromDbDate(plan.endDate).getTime(),
  };
}

/**
 * Stammdaten- und Medikationspflege durch Ärzt:innen.
 * Jede Operation ist auf Patient:innen beschränkt, die der handelnden Person zugeordnet sind.
 * Protokolliert werden ausschließlich IDs (keine Gesundheits- oder Identitätsdaten).
 */
export class PatientAdminService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notifier: AlertNotifier,
  ) {}

  async listDoctors(): Promise<DoctorOptionDto[]> {
    const doctors = await this.prisma.user.findMany({
      where: { role: 'DOCTOR' },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return doctors.map((d) => ({ id: d.id, name: doctorFullName(d) }));
  }

  async getMaster(doctorId: string, patientId: string): Promise<PatientMasterDto> {
    const profile = await this.prisma.patientProfile.findFirst({
      where: { id: patientId, assignedDoctorId: doctorId },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        medicationPlans: { orderBy: [{ endDate: 'desc' }, { medicationName: 'asc' }] },
      },
    });
    if (!profile) throw AppError.notFound('Patient:in nicht gefunden.');

    const now = new Date();
    const medications = profile.medicationPlans
      .map((p) => toMedicationPlanDto(p, now))
      // aktive zuerst, dann nach erster Einnahmezeit
      .sort((a, b) => Number(b.active) - Number(a.active) || (a.times[0] ?? '').localeCompare(b.times[0] ?? ''));

    return {
      patientId: profile.id,
      firstName: profile.user.firstName,
      lastName: profile.user.lastName,
      email: profile.user.email,
      birthDate: dbDateToIso(profile.birthDate),
      cancerType: profile.cancerType,
      therapyStart: dbDateToIso(profile.therapyStart),
      phone: CryptoVault.decryptOptional(profile.phoneEncrypted),
      assignedDoctorId: profile.assignedDoctorId,
      medications,
    };
  }

  async create(doctorId: string, input: PatientMasterInput): Promise<InitialPasswordDto> {
    const assignedDoctorId = await this.resolveDoctor(input.assignedDoctorId ?? doctorId);
    if (await this.prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
      throw AppError.conflict(EMAIL_TAKEN);
    }

    const initialPassword = generateInitialPassword();
    const passwordHash = await PasswordHasher.hash(initialPassword);
    try {
      const profile = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            passwordHash,
            mustChangePassword: true,
            role: 'PATIENT',
            firstName: input.firstName,
            lastName: input.lastName,
          },
        });
        return tx.patientProfile.create({
          data: {
            userId: user.id,
            birthDate: isoToDbDate(input.birthDate),
            cancerType: input.cancerType,
            therapyStart: isoToDbDate(input.therapyStart),
            assignedDoctorId,
            phoneEncrypted: CryptoVault.encryptOptional(input.phone),
          },
        });
      });
      logger.info('Patient:in angelegt', { patientId: profile.id, byDoctor: doctorId });
      this.notifier.patientUpdated(assignedDoctorId, profile.id);
      return { patientId: profile.id, initialPassword };
    } catch (error) {
      if (isUniqueViolation(error)) throw AppError.conflict(EMAIL_TAKEN);
      throw error;
    }
  }

  async update(doctorId: string, patientId: string, input: PatientMasterInput): Promise<void> {
    const profile = await this.assertAssigned(doctorId, patientId);
    const assignedDoctorId = await this.resolveDoctor(input.assignedDoctorId ?? doctorId);

    try {
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: profile.userId },
          data: { firstName: input.firstName, lastName: input.lastName, email: input.email },
        }),
        this.prisma.patientProfile.update({
          where: { id: patientId },
          data: {
            birthDate: isoToDbDate(input.birthDate),
            cancerType: input.cancerType,
            therapyStart: isoToDbDate(input.therapyStart),
            assignedDoctorId,
            phoneEncrypted: CryptoVault.encryptOptional(input.phone),
          },
        }),
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) throw AppError.conflict(EMAIL_TAKEN);
      throw error;
    }

    logger.info('Stammdaten geändert', { patientId, byDoctor: doctorId, reassigned: assignedDoctorId !== doctorId });
    this.notifier.patientUpdated(doctorId, patientId);
    if (assignedDoctorId !== doctorId) this.notifier.patientUpdated(assignedDoctorId, patientId);
  }

  /** Neues Startpasswort (z. B. wenn es verloren ging). Das alte wird sofort ungültig. */
  async resetPassword(doctorId: string, patientId: string): Promise<InitialPasswordDto> {
    const profile = await this.assertAssigned(doctorId, patientId);
    const initialPassword = generateInitialPassword();
    await this.prisma.user.update({
      where: { id: profile.userId },
      data: { passwordHash: await PasswordHasher.hash(initialPassword), mustChangePassword: true },
    });
    logger.info('Startpasswort neu erzeugt', { patientId, byDoctor: doctorId });
    return { patientId, initialPassword };
  }

  async addMedication(doctorId: string, patientId: string, input: MedicationPlanInput): Promise<MedicationPlanDto> {
    await this.assertAssigned(doctorId, patientId);
    const plan = await this.prisma.medicationPlan.create({ data: { patientId, ...this.planData(input) } });
    this.notifier.patientUpdated(doctorId, patientId);
    return toMedicationPlanDto(plan);
  }

  async updateMedication(doctorId: string, planId: string, input: MedicationPlanInput): Promise<MedicationPlanDto> {
    const existing = await this.assertPlanAccess(doctorId, planId);
    const plan = await this.prisma.medicationPlan.update({ where: { id: planId }, data: this.planData(input) });
    this.notifier.patientUpdated(doctorId, existing.patientId);
    return toMedicationPlanDto(plan);
  }

  /**
   * Beendet einen Eintrag zum Ende des gestrigen Tages (bisherige Einnahmen bleiben erhalten).
   * Noch nicht begonnene Einträge werden gelöscht – außer es wurden heute bereits Einnahmen
   * bestätigt: Dann endet der Eintrag nach heute, damit der Einnahmenachweis nicht verloren geht.
   */
  async endMedication(doctorId: string, planId: string): Promise<void> {
    const plan = await this.assertPlanAccess(doctorId, planId);
    const today = startOfDay(new Date());
    if (fromDbDate(plan.endDate) < today) throw AppError.badRequest('Dieser Eintrag ist bereits beendet.');

    if (fromDbDate(plan.startDate) < today) {
      await this.prisma.medicationPlan.update({ where: { id: planId }, data: { endDate: toDbDate(addDays(today, -1)) } });
    } else if ((await this.prisma.medicationIntake.count({ where: { planId } })) > 0) {
      await this.prisma.medicationPlan.update({ where: { id: planId }, data: { endDate: toDbDate(today) } });
    } else {
      await this.prisma.medicationPlan.delete({ where: { id: planId } });
    }
    this.notifier.patientUpdated(doctorId, plan.patientId);
  }

  private planData(input: MedicationPlanInput) {
    let frequencyCron: string;
    try {
      frequencyCron = toDailyCron(input.times);
    } catch (error) {
      throw AppError.badRequest(error instanceof Error ? error.message : 'Ungültige Uhrzeiten.');
    }
    return {
      medicationName: input.medicationName,
      dosage: input.dosage,
      frequencyCron,
      hint: input.hint ? input.hint : null,
      startDate: isoToDbDate(input.startDate),
      endDate: isoToDbDate(input.endDate),
    };
  }

  private async assertAssigned(doctorId: string, patientId: string) {
    const profile = await this.prisma.patientProfile.findFirst({
      where: { id: patientId, assignedDoctorId: doctorId },
      select: { id: true, userId: true },
    });
    if (!profile) throw AppError.notFound('Patient:in nicht gefunden.');
    return profile;
  }

  private async assertPlanAccess(doctorId: string, planId: string): Promise<MedicationPlan> {
    const plan = await this.prisma.medicationPlan.findFirst({
      where: { id: planId, patient: { assignedDoctorId: doctorId } },
    });
    if (!plan) throw AppError.notFound('Eintrag im Medikationsplan nicht gefunden.');
    return plan;
  }

  private async resolveDoctor(doctorId: string): Promise<string> {
    const doctor = await this.prisma.user.findFirst({ where: { id: doctorId, role: 'DOCTOR' }, select: { id: true } });
    if (!doctor) throw AppError.badRequest('Die gewählte Ärztin / der gewählte Arzt existiert nicht.');
    return doctor.id;
  }
}
