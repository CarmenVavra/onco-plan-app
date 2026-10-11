import type { Appointment, PrismaClient } from '@prisma/client';
import type { AppointmentDto } from '../dto';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import type { AppointmentInput } from '../validation/schemas';
import type { AlertNotifier } from './AlertNotifier';
import { CryptoVault } from './CryptoVault';

/** Laufende Termine bleiben noch so lange auf der Patienten-Startseite sichtbar. */
const SHOW_STARTED_FOR_MS = 60 * 60_000;
/** Anzahl vergangener Termine in der Patientenverwaltung */
const PAST_IN_ADMIN = 5;

export function toAppointmentDto(a: Appointment): AppointmentDto {
  return {
    id: a.id,
    type: a.type,
    startsAt: a.startsAt.toISOString(),
    location: a.location,
    fasting: a.fasting,
    note: CryptoVault.decryptOptional(a.noteEncrypted),
    reminderSentAt: a.reminderSentAt?.toISOString() ?? null,
  };
}

/**
 * Termine (Blutabnahme, Chemotherapie …). Ärzt:innen verwalten nur Termine ihrer
 * eigenen Patient:innen; protokolliert werden ausschließlich IDs.
 */
export class AppointmentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notifier: AlertNotifier,
  ) {}

  /** Kommende Termine für die Patienten-Startseite */
  async upcomingForPatient(patientId: string, now: Date = new Date(), take = 5): Promise<AppointmentDto[]> {
    const appointments = await this.prisma.appointment.findMany({
      where: { patientId, startsAt: { gte: new Date(now.getTime() - SHOW_STARTED_FOR_MS) } },
      orderBy: { startsAt: 'asc' },
      take,
    });
    return appointments.map(toAppointmentDto);
  }

  /** Für die Patientenverwaltung: alle kommenden, danach die letzten vergangenen Termine */
  async forAdmin(patientId: string, now: Date = new Date()): Promise<AppointmentDto[]> {
    const [upcoming, past] = await Promise.all([
      this.prisma.appointment.findMany({ where: { patientId, startsAt: { gt: now } }, orderBy: { startsAt: 'asc' } }),
      this.prisma.appointment.findMany({
        where: { patientId, startsAt: { lte: now } },
        orderBy: { startsAt: 'desc' },
        take: PAST_IN_ADMIN,
      }),
    ]);
    return [...upcoming, ...past].map(toAppointmentDto);
  }

  async create(doctorId: string, patientId: string, input: AppointmentInput): Promise<AppointmentDto> {
    const profile = await this.prisma.patientProfile.findFirst({
      where: { id: patientId, assignedDoctorId: doctorId },
      select: { id: true },
    });
    if (!profile) throw AppError.notFound('Patient:in nicht gefunden.');

    const appointment = await this.prisma.appointment.create({
      data: { patientId, createdById: doctorId, ...this.data(input) },
    });
    logger.info('Termin vergeben', { appointmentId: appointment.id, patientId, byDoctor: doctorId });
    this.notifier.patientUpdated(doctorId, patientId);
    return toAppointmentDto(appointment);
  }

  /** Wird der Termin verschoben, erinnert der Server erneut 24 Stunden vor dem neuen Zeitpunkt. */
  async update(doctorId: string, appointmentId: string, input: AppointmentInput): Promise<AppointmentDto> {
    const existing = await this.assertEditable(doctorId, appointmentId);
    const moved = existing.startsAt.getTime() !== input.startsAt.getTime();
    const appointment = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { ...this.data(input), ...(moved ? { reminderSentAt: null } : {}) },
    });
    logger.info('Termin geändert', { appointmentId, byDoctor: doctorId, moved });
    this.notifier.patientUpdated(doctorId, existing.patientId);
    return toAppointmentDto(appointment);
  }

  /** Absagen = Löschen. Vergangene Termine bleiben als Nachweis erhalten. */
  async cancel(doctorId: string, appointmentId: string): Promise<void> {
    const existing = await this.assertEditable(doctorId, appointmentId);
    await this.prisma.appointment.delete({ where: { id: appointmentId } });
    logger.info('Termin abgesagt', { appointmentId, byDoctor: doctorId });
    this.notifier.patientUpdated(doctorId, existing.patientId);
  }

  private data(input: AppointmentInput) {
    return {
      type: input.type,
      startsAt: input.startsAt,
      location: input.location ? input.location : null,
      fasting: input.fasting,
      noteEncrypted: input.note ? CryptoVault.encrypt(input.note) : null,
    };
  }

  private async assertEditable(doctorId: string, appointmentId: string): Promise<Appointment> {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, patient: { assignedDoctorId: doctorId } },
    });
    if (!appointment) throw AppError.notFound('Termin nicht gefunden.');
    if (appointment.startsAt.getTime() <= Date.now()) {
      throw AppError.badRequest('Vergangene Termine können nicht mehr geändert werden.');
    }
    return appointment;
  }
}
