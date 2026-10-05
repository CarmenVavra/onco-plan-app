import type { Prisma, PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import type {
  AlertDto,
  DailyTemperatureDto,
  DoctorOverviewDto,
  PatientDetailDto,
  PatientRowDto,
} from '../dto';
import { AppError } from '../lib/errors';
import { addDays, ageInYears, fromDbDate, startOfDay, therapyWeek } from '../utils/therapy';
import { doctorFullName, doctorShortName, fullName, initials } from '../utils/names';
import { selectRelevantAlert } from './alertSelection';
import { CryptoVault } from './CryptoVault';
import type { MedicationService } from './MedicationService';

const ACK_WINDOW_DAYS = 7;

function rowInclude(now: Date) {
  return {
    user: { select: { firstName: true, lastName: true } },
    symptomLogs: { orderBy: { loggedAt: 'desc' }, take: 1 },
    triageAlerts: {
      where: {
        OR: [
          { status: 'ACTIVE' },
          { status: 'ACKNOWLEDGED', createdAt: { gte: addDays(now, -ACK_WINDOW_DAYS) } },
        ],
      },
      include: { doctor: { select: { firstName: true, lastName: true } } },
    },
  } satisfies Prisma.PatientProfileInclude;
}

type ProfileWithRow = Prisma.PatientProfileGetPayload<{ include: ReturnType<typeof rowInclude> }>;
type AlertWithDoctor = ProfileWithRow['triageAlerts'][number];

export function toAlertDto(a: AlertWithDoctor): AlertDto {
  return {
    id: a.id,
    level: a.level,
    status: a.status,
    triggerReason: a.triggerReason,
    createdAt: a.createdAt.toISOString(),
    acknowledgedAt: a.acknowledgedAt?.toISOString() ?? null,
    acknowledgedByName: a.doctor ? doctorShortName(a.doctor) : null,
  };
}

function toRow(p: ProfileWithRow, now: Date): PatientRowDto {
  const latest = p.symptomLogs[0] ?? null;
  const alert = selectRelevantAlert(p.triageAlerts, latest?.id ?? null, now);
  return {
    patientId: p.id,
    name: fullName(p.user),
    age: ageInYears(fromDbDate(p.birthDate), now),
    diagnosis: p.cancerType,
    therapyWeek: therapyWeek(fromDbDate(p.therapyStart), now),
    latestLog: latest
      ? {
          loggedAt: latest.loggedAt.toISOString(),
          feverCelsius: latest.feverCelsius,
          painLevel: latest.painLevel,
          nauseaLevel: latest.nauseaLevel,
        }
      : null,
    hasCheckinToday: latest !== null && latest.loggedAt >= startOfDay(now),
    alert: alert ? toAlertDto(alert) : null,
    level: alert?.level ?? 'GREEN',
  };
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export class DoctorService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly medications: MedicationService,
  ) {}

  async overview(doctorId: string): Promise<DoctorOverviewDto> {
    const now = new Date();
    const doctor = await this.prisma.user.findUnique({
      where: { id: doctorId },
      select: { firstName: true, lastName: true },
    });
    if (!doctor) throw AppError.unauthorized();

    const profiles = await this.prisma.patientProfile.findMany({
      where: { assignedDoctorId: doctorId },
      include: rowInclude(now),
    });

    return {
      doctor: { name: doctorFullName(doctor), initials: initials(doctor), department: env.CLINIC_DEPARTMENT },
      clinicName: env.CLINIC_NAME,
      demoMode: env.DEMO_MODE,
      patients: profiles.map((p) => toRow(p, now)),
    };
  }

  async detail(doctorId: string, patientId: string): Promise<PatientDetailDto> {
    const now = new Date();
    const profile = await this.prisma.patientProfile.findFirst({
      where: { id: patientId, assignedDoctorId: doctorId },
      include: rowInclude(now),
    });
    // 404 statt 403: verrät nicht, ob die Person existiert (Datenisolation).
    if (!profile) throw AppError.notFound('Patient:in nicht gefunden.');

    const firstDay = addDays(startOfDay(now), -6);
    const logs = await this.prisma.symptomLog.findMany({
      where: { patientId, loggedAt: { gte: firstDay } },
      select: { loggedAt: true, feverCelsius: true },
    });
    const temperatures: DailyTemperatureDto[] = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(firstDay, i);
      const next = addDays(day, 1);
      const values = logs.filter((l) => l.loggedAt >= day && l.loggedAt < next).map((l) => l.feverCelsius);
      return { date: isoDate(day), maxCelsius: values.length ? Math.max(...values) : null };
    });

    const doses = await this.medications.dosesForDay(patientId, now);
    const latest = profile.symptomLogs[0];

    return {
      ...toRow(profile, now),
      phone: CryptoVault.decryptOptional(profile.phoneEncrypted),
      note: CryptoVault.decryptOptional(latest?.symptomNotes),
      temperatures,
      medications: doses.map((d) => ({ time: d.time, name: d.name, dose: d.dose })),
    };
  }

  /** Stellt sicher, dass ein Profil diesem Arzt zugeordnet ist. */
  async assertAssigned(doctorId: string, patientId: string): Promise<void> {
    const count = await this.prisma.patientProfile.count({ where: { id: patientId, assignedDoctorId: doctorId } });
    if (count === 0) throw AppError.notFound('Patient:in nicht gefunden.');
  }
}
