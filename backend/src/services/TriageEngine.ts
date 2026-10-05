import type { AlertLevel, PrismaClient, SymptomLog, TriageAlert } from '@prisma/client';
import { formatDecimalDe, fromDbDate, therapyWeek } from '../utils/therapy';
import type { AlertNotifier } from './AlertNotifier';

/** Grenzwerte der Triage-Regeln (medizinisch freigegeben, siehe Spezifikation). */
export const TRIAGE_THRESHOLDS = {
  /** Neutropenisches Fieber: ab diesem Wert → ROT */
  criticalFeverCelsius: 38.5,
  /** Schmerzstufe (0–10), ab der in Kombination mit Übelkeit → GELB */
  severePainLevel: 7,
  /** Übelkeitsstufe (0–3, 2 = "Mittel"), ab der in Kombination mit Schmerz → GELB */
  relevantNauseaLevel: 2,
} as const;

export const GREEN_REASON = 'Alle Werte im erwarteten Bereich.';

export interface TriageInput {
  feverCelsius: number;
  painLevel: number;
  nauseaLevel: number;
  therapyWeek: number;
}

export interface TriageResult {
  /** `null` = GRÜN, kein Alarm */
  level: AlertLevel | null;
  reason: string;
}

/**
 * Reine, seiteneffektfreie Triage-Regel – einzige Quelle der Wahrheit.
 * Regel A: Fieber ≥ 38,5 °C → ROT
 * Regel B: Schmerz ≥ 7 UND Übelkeit ≥ Mittel → GELB
 * sonst GRÜN
 */
export function evaluateTriage(input: TriageInput): TriageResult {
  const { criticalFeverCelsius, severePainLevel, relevantNauseaLevel } = TRIAGE_THRESHOLDS;

  if (input.feverCelsius >= criticalFeverCelsius) {
    return {
      level: 'RED',
      reason: `Kritisches Fieber (${formatDecimalDe(input.feverCelsius)} °C) in Therapiewoche ${input.therapyWeek}.`,
    };
  }
  if (input.painLevel >= severePainLevel && input.nauseaLevel >= relevantNauseaLevel) {
    return {
      level: 'YELLOW',
      reason: `Starke Schmerzen (Stufe ${input.painLevel}) gekoppelt mit Übelkeit.`,
    };
  }
  return { level: null, reason: GREEN_REASON };
}

type TriagePrisma = Pick<PrismaClient, 'patientProfile' | 'triageAlert'>;

export class TriageEngine {
  constructor(
    private readonly prisma: TriagePrisma,
    private readonly notifier: AlertNotifier,
  ) {}

  /**
   * Bewertet ein gespeichertes Symptom-Log, legt bei Bedarf einen Alarm an
   * und benachrichtigt den zuständigen Arzt in Echtzeit.
   */
  async analyzeLog(log: SymptomLog): Promise<TriageAlert | null> {
    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: log.patientId },
      select: { id: true, therapyStart: true, assignedDoctorId: true },
    });
    if (!patient) {
      throw new Error(`Patientenprofil ${log.patientId} nicht gefunden`);
    }

    const result = evaluateTriage({
      feverCelsius: log.feverCelsius,
      painLevel: log.painLevel,
      nauseaLevel: log.nauseaLevel,
      therapyWeek: therapyWeek(fromDbDate(patient.therapyStart), log.loggedAt),
    });

    let alert: TriageAlert | null = null;
    if (result.level) {
      alert = await this.prisma.triageAlert.create({
        data: {
          patientId: log.patientId,
          symptomLogId: log.id,
          level: result.level,
          status: 'ACTIVE',
          triggerReason: result.reason,
        },
      });
    }

    if (patient.assignedDoctorId) {
      if (alert) this.notifier.newAlert(patient.assignedDoctorId, alert);
      this.notifier.patientUpdated(patient.assignedDoctorId, patient.id);
    }
    return alert;
  }
}
