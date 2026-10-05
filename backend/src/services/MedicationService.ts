import type { MedicationPlan, PrismaClient } from '@prisma/client';
import type { MedicationDoseDto } from '../dto';
import { AppError } from '../lib/errors';
import { parseDailyCron } from '../utils/cron';
import { addDays, fromDbDate, startOfDay } from '../utils/therapy';

function scheduledAt(day: Date, time: { hour: number; minute: number }): Date {
  const d = startOfDay(day);
  d.setHours(time.hour, time.minute, 0, 0);
  return d;
}

function isActiveOn(plan: Pick<MedicationPlan, 'startDate' | 'endDate'>, day: Date): boolean {
  const d = startOfDay(day).getTime();
  return fromDbDate(plan.startDate).getTime() <= d && d <= fromDbDate(plan.endDate).getTime();
}

/** Expandiert die Einnahmepläne eines Tages in einzelne Dosen (sortiert nach Uhrzeit). */
export function expandDoses(
  plans: Array<Pick<MedicationPlan, 'id' | 'medicationName' | 'dosage' | 'frequencyCron' | 'hint' | 'startDate' | 'endDate'>>,
  day: Date,
): Array<Omit<MedicationDoseDto, 'taken'> & { scheduledAt: Date }> {
  return plans
    .filter((p) => isActiveOn(p, day))
    .flatMap((p) =>
      parseDailyCron(p.frequencyCron).map((t) => ({
        planId: p.id,
        time: t.label,
        name: p.medicationName,
        dose: p.dosage,
        hint: p.hint,
        scheduledAt: scheduledAt(day, t),
      })),
    )
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime() || a.name.localeCompare(b.name, 'de'));
}

export class MedicationService {
  constructor(private readonly prisma: PrismaClient) {}

  async dosesForDay(patientId: string, day: Date): Promise<MedicationDoseDto[]> {
    const plans = await this.prisma.medicationPlan.findMany({ where: { patientId } });
    const doses = expandDoses(plans, day);
    const intakes = await this.prisma.medicationIntake.findMany({
      where: {
        planId: { in: plans.map((p) => p.id) },
        scheduledAt: { gte: startOfDay(day), lt: addDays(startOfDay(day), 1) },
      },
      select: { planId: true, scheduledAt: true },
    });
    const taken = new Set(intakes.map((i) => `${i.planId}@${i.scheduledAt.getTime()}`));
    return doses.map(({ scheduledAt: at, ...dose }) => ({
      ...dose,
      taken: taken.has(`${dose.planId}@${at.getTime()}`),
    }));
  }

  /** Einnahme (heute) bestätigen oder zurücknehmen. Prüft, dass der Plan zur Person gehört. */
  async setTaken(patientId: string, planId: string, time: string, taken: boolean): Promise<void> {
    const plan = await this.prisma.medicationPlan.findFirst({ where: { id: planId, patientId } });
    if (!plan) throw AppError.notFound('Medikationsplan nicht gefunden.');

    const today = new Date();
    const dose = expandDoses([plan], today).find((d) => d.time === time);
    if (!dose) throw AppError.badRequest('Zu dieser Uhrzeit ist keine Einnahme geplant.');

    if (taken) {
      await this.prisma.medicationIntake.upsert({
        where: { planId_scheduledAt: { planId, scheduledAt: dose.scheduledAt } },
        create: { planId, scheduledAt: dose.scheduledAt },
        update: {},
      });
    } else {
      await this.prisma.medicationIntake.deleteMany({ where: { planId, scheduledAt: dose.scheduledAt } });
    }
  }
}
