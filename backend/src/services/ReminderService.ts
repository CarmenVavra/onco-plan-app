import type { AppointmentType, PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger';
import { addDays, startOfDay } from '../utils/therapy';
import type { PushMessage, PushService } from './PushService';

/** Erinnerung 24 Stunden vor Terminbeginn */
export const REMINDER_LEAD_MS = 24 * 3600_000;
/** Prüfintervall des Schedulers */
const CHECK_INTERVAL_MS = 60_000;
const BATCH_SIZE = 100;

/** Spiegel von frontend/src/app/core/domain/appointments.ts (OTHER dort: „Sonstiger Termin“) */
export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  BLOOD_DRAW: 'Blutabnahme',
  CHEMOTHERAPY: 'Chemotherapie',
  CONSULTATION: 'Arztgespräch',
  IMAGING: 'Bildgebung (CT/MRT)',
  OTHER: 'Termin',
};

const pad = (n: number): string => String(n).padStart(2, '0');

/** "heute" / "morgen" / "am 14.10." – in Ortszeit des Servers */
function dayLabel(startsAt: Date, now: Date): string {
  const day = startOfDay(startsAt).getTime();
  if (day === startOfDay(now).getTime()) return 'heute';
  if (day === startOfDay(addDays(now, 1)).getTime()) return 'morgen';
  return `am ${pad(startsAt.getDate())}.${pad(startsAt.getMonth() + 1)}.`;
}

/**
 * Inhalt der Erinnerung. Bewusst ohne den (verschlüsselten) Freitext-Hinweis –
 * Mitteilungen erscheinen u. U. auf dem Sperrbildschirm. Die Nüchtern-Vorgabe steht dagegen drin,
 * weil sie schon vor dem Termin (beim Frühstück) wichtig ist.
 */
export function reminderMessage(
  a: { id: string; type: AppointmentType; startsAt: Date; location: string | null; fasting: boolean },
  now: Date,
): PushMessage {
  const when = `${dayLabel(a.startsAt, now)} um ${pad(a.startsAt.getHours())}:${pad(a.startsAt.getMinutes())}`;
  const parts = [`${when.charAt(0).toUpperCase()}${when.slice(1)}`, a.location, a.fasting ? 'Bitte nüchtern erscheinen' : null];
  return {
    title: `Terminerinnerung: ${APPOINTMENT_TYPE_LABELS[a.type]}`,
    body: parts.filter(Boolean).join(' · '),
    url: '/patient/heute',
    tag: `appointment-${a.id}`,
    ttlSeconds: (a.startsAt.getTime() - now.getTime()) / 1000,
  };
}

/**
 * Verschickt einmalig je Termin eine Erinnerung, sobald der Beginn höchstens 24 Stunden entfernt ist
 * (auch nachträglich, wenn ein Termin kurzfristig vergeben wurde oder der Server zwischenzeitlich aus war).
 */
export class ReminderService {
  private running = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly push: PushService,
  ) {}

  /** Liefert die Zahl der verarbeiteten Termine. */
  async sendDueReminders(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.appointment.findMany({
      where: { reminderSentAt: null, startsAt: { gt: now, lte: new Date(now.getTime() + REMINDER_LEAD_MS) } },
      orderBy: { startsAt: 'asc' },
      take: BATCH_SIZE,
      include: { patient: { select: { userId: true } } },
    });

    let processed = 0;
    for (const appointment of due) {
      // Termin "beanspruchen": schützt vor Doppelversand (mehrere Instanzen, Verschiebung währenddessen)
      const claim = await this.prisma.appointment.updateMany({
        where: { id: appointment.id, reminderSentAt: null, startsAt: appointment.startsAt },
        data: { reminderSentAt: now },
      });
      if (claim.count === 0) continue;
      processed++;
      try {
        const devices = await this.push.notifyUser(appointment.patient.userId, reminderMessage(appointment, now));
        logger.info('Terminerinnerung verarbeitet', { appointmentId: appointment.id, devices });
      } catch (error) {
        logger.warn('Terminerinnerung fehlgeschlagen', {
          appointmentId: appointment.id,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return processed;
  }

  /** Startet die minütliche Prüfung; liefert eine Stopp-Funktion. */
  start(intervalMs = CHECK_INTERVAL_MS): () => void {
    const tick = async (): Promise<void> => {
      if (this.running) return;
      this.running = true;
      try {
        await this.sendDueReminders();
      } catch (error) {
        logger.error('Erinnerungs-Scheduler fehlgeschlagen', {
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      } finally {
        this.running = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }
}
