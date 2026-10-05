import type { AlertLevel, AlertStatus } from '@prisma/client';
import { startOfDay } from '../utils/therapy';

export interface SelectableAlert {
  level: AlertLevel;
  status: AlertStatus;
  symptomLogId: string | null;
  createdAt: Date;
}

/**
 * Wählt den Alarm, der die Ampelfarbe einer Person bestimmt:
 * 1. jüngster aktiver ROTER Alarm
 * 2. jüngster aktiver GELBER Alarm
 * 3. jüngster quittierter Alarm – sofern er von heute stammt oder zum letzten Check-in gehört
 * sonst `null` (GRÜN).
 * Ein unquittierter Alarm bleibt sichtbar, auch wenn danach unauffällige Werte kamen;
 * ein quittierter bleibt für den Rest des Tages als "Quittiert" in der Liste.
 */
export function selectRelevantAlert<T extends SelectableAlert>(
  alerts: T[],
  latestLogId: string | null,
  now: Date = new Date(),
): T | null {
  const newestFirst = [...alerts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const active = newestFirst.filter((a) => a.status === 'ACTIVE');
  const today = startOfDay(now);
  return (
    active.find((a) => a.level === 'RED') ??
    active.find((a) => a.level === 'YELLOW') ??
    newestFirst.find(
      (a) =>
        a.status === 'ACKNOWLEDGED' &&
        (a.createdAt >= today || (latestLogId !== null && a.symptomLogId === latestLogId)),
    ) ??
    null
  );
}
