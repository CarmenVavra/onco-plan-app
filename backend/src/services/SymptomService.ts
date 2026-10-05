import type { AlertLevel, PrismaClient, TriageAlert } from '@prisma/client';
import { AppError } from '../lib/errors';
import type { SymptomLogInput } from '../validation/schemas';
import { CryptoVault } from './CryptoVault';
import { GREEN_REASON, type TriageEngine } from './TriageEngine';

export interface CheckinResult {
  logId: string;
  loggedAt: string;
  /** Serverseitig (autoritativ) bestimmte Triage-Stufe; `GREEN` = kein Alarm */
  level: AlertLevel | 'GREEN';
  reason: string;
  alertId: string | null;
  duplicate: boolean;
}

function toResult(log: { id: string; loggedAt: Date }, alert: TriageAlert | null, duplicate: boolean): CheckinResult {
  return {
    logId: log.id,
    loggedAt: log.loggedAt.toISOString(),
    level: alert?.level ?? 'GREEN',
    reason: alert?.triggerReason ?? GREEN_REASON,
    alertId: alert?.id ?? null,
    duplicate,
  };
}

export class SymptomService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly triage: TriageEngine,
  ) {}

  async createForPatientUser(userId: string, input: SymptomLogInput): Promise<CheckinResult> {
    const profile = await this.prisma.patientProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw AppError.forbidden('Kein Patientenprofil vorhanden.');
    return this.createForProfile(profile.id, input);
  }

  async createForProfile(patientId: string, input: SymptomLogInput): Promise<CheckinResult> {
    // Idempotenz: Ein erneut gesendeter Offline-Eintrag wird nicht doppelt gespeichert/alarmiert.
    if (input.clientRef) {
      const existing = await this.prisma.symptomLog.findUnique({
        where: { clientRef: input.clientRef },
        include: { triageAlerts: { orderBy: { createdAt: 'desc' }, take: 1 } },
      });
      if (existing) {
        if (existing.patientId !== patientId) throw AppError.badRequest();
        return toResult(existing, existing.triageAlerts[0] ?? null, true);
      }
    }

    const log = await this.prisma.symptomLog.create({
      data: {
        patientId,
        feverCelsius: input.feverCelsius,
        painLevel: input.painLevel,
        nauseaLevel: input.nauseaLevel,
        symptomNotes: CryptoVault.encryptOptional(input.symptomNotes),
        loggedAt: input.loggedAt ?? new Date(),
        syncStatus: input.syncStatus ?? 'synced',
        clientRef: input.clientRef ?? null,
      },
    });

    const alert = await this.triage.analyzeLog(log);
    return toResult(log, alert, false);
  }
}
