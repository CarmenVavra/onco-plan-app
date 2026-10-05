import type { AlertStatus, PrismaClient } from '@prisma/client';
import type { AlertHistoryEntryDto } from '../dto';
import { AppError } from '../lib/errors';
import { fullName } from '../utils/names';
import type { AlertNotifier } from './AlertNotifier';
import { toAlertDto } from './DoctorService';

export class AlertService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notifier: AlertNotifier,
  ) {}

  async history(doctorId: string, limit = 200): Promise<AlertHistoryEntryDto[]> {
    const alerts = await this.prisma.triageAlert.findMany({
      where: { patient: { assignedDoctorId: doctorId } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        doctor: { select: { firstName: true, lastName: true } },
        patient: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
      },
    });
    return alerts.map((a) => ({
      ...toAlertDto(a),
      patientId: a.patient.id,
      patientName: fullName(a.patient.user),
      resolvedAt: a.resolvedAt?.toISOString() ?? null,
    }));
  }

  /**
   * Quittiert bzw. erledigt einen Alarm. Beim Quittieren werden ältere, noch aktive
   * Alarme derselben Person mit quittiert – sie sind durch den neueren Alarm überholt.
   */
  async updateStatus(doctorId: string, alertId: string, status: Extract<AlertStatus, 'ACKNOWLEDGED' | 'RESOLVED'>): Promise<void> {
    const alert = await this.prisma.triageAlert.findFirst({
      where: { id: alertId, patient: { assignedDoctorId: doctorId } },
    });
    if (!alert) throw AppError.notFound('Alarm nicht gefunden.');
    if (alert.status === 'RESOLVED') throw AppError.badRequest('Der Alarm ist bereits erledigt.');

    const now = new Date();
    if (status === 'ACKNOWLEDGED') {
      await this.prisma.triageAlert.updateMany({
        where: { patientId: alert.patientId, status: 'ACTIVE', createdAt: { lte: alert.createdAt } },
        data: { status: 'ACKNOWLEDGED', acknowledgedBy: doctorId, acknowledgedAt: now },
      });
    } else {
      await this.prisma.triageAlert.update({
        where: { id: alertId },
        data: {
          status: 'RESOLVED',
          resolvedAt: now,
          acknowledgedBy: alert.acknowledgedBy ?? doctorId,
          acknowledgedAt: alert.acknowledgedAt ?? now,
        },
      });
    }

    const updated = await this.prisma.triageAlert.findUniqueOrThrow({ where: { id: alertId } });
    this.notifier.alertUpdated(doctorId, updated);
  }
}
