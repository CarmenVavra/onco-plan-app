import type { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import type { PatientHomeDto, SymptomHistoryEntryDto } from '../dto';
import { AppError } from '../lib/errors';
import { addDays, dbDateToIso, fromDbDate, startOfDay, therapyDay, therapyWeek } from '../utils/therapy';
import { doctorFullName } from '../utils/names';
import { CryptoVault } from './CryptoVault';
import type { MedicationService } from './MedicationService';

export class PatientService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly medications: MedicationService,
  ) {}

  async profileIdForUser(userId: string): Promise<string> {
    const profile = await this.prisma.patientProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw AppError.forbidden('Kein Patientenprofil vorhanden.');
    return profile.id;
  }

  async home(userId: string): Promise<PatientHomeDto> {
    const now = new Date();
    const profile = await this.prisma.patientProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { firstName: true, lastName: true } },
        assignedDoctor: { select: { firstName: true, lastName: true } },
        symptomLogs: {
          where: { loggedAt: { gte: startOfDay(now) } },
          orderBy: { loggedAt: 'desc' },
          take: 1,
          select: { loggedAt: true },
        },
      },
    });
    if (!profile) throw AppError.forbidden('Kein Patientenprofil vorhanden.');

    return {
      firstName: profile.user.firstName,
      lastName: profile.user.lastName,
      diagnosis: profile.cancerType,
      therapyStart: dbDateToIso(profile.therapyStart),
      therapyDay: therapyDay(fromDbDate(profile.therapyStart), now),
      therapyWeek: therapyWeek(fromDbDate(profile.therapyStart), now),
      doctorName: profile.assignedDoctor ? doctorFullName(profile.assignedDoctor) : null,
      clinicName: env.CLINIC_NAME,
      hotline: env.CLINIC_HOTLINE,
      todayCheckinAt: profile.symptomLogs[0]?.loggedAt.toISOString() ?? null,
      medications: await this.medications.dosesForDay(profile.id, now),
    };
  }

  async history(userId: string, days: number): Promise<SymptomHistoryEntryDto[]> {
    const patientId = await this.profileIdForUser(userId);
    const logs = await this.prisma.symptomLog.findMany({
      where: { patientId, loggedAt: { gte: addDays(startOfDay(new Date()), -(days - 1)) } },
      orderBy: { loggedAt: 'desc' },
      include: { triageAlerts: { select: { level: true } } },
    });
    return logs.map((l) => ({
      id: l.id,
      loggedAt: l.loggedAt.toISOString(),
      feverCelsius: l.feverCelsius,
      painLevel: l.painLevel,
      nauseaLevel: l.nauseaLevel,
      level: l.triageAlerts.some((a) => a.level === 'RED')
        ? 'RED'
        : l.triageAlerts.some((a) => a.level === 'YELLOW')
          ? 'YELLOW'
          : 'GREEN',
      note: CryptoVault.decryptOptional(l.symptomNotes),
    }));
  }
}
