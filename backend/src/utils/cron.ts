/**
 * Minimaler Parser für tägliche Einnahmezeiten im Cron-Format "M H * * *".
 * Unterstützt Listen in Minute und Stunde (z. B. "0,30 8,20 * * *").
 * Komplexere Muster (Wochentage, Intervalle) sind im MVP bewusst nicht erlaubt.
 */
export interface DailyTime {
  hour: number;
  minute: number;
  /** "HH:MM" */
  label: string;
}

const DAILY_CRON = /^(\d{1,2}(?:,\d{1,2})*) (\d{1,2}(?:,\d{1,2})*) \* \* \*$/;

function parseList(part: string, max: number): number[] {
  return part.split(',').map((raw) => {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0 || value > max) {
      throw new Error(`Ungültiger Cron-Wert "${raw}"`);
    }
    return value;
  });
}

export function isValidDailyCron(expression: string): boolean {
  try {
    parseDailyCron(expression);
    return true;
  } catch {
    return false;
  }
}

/**
 * Uhrzeiten ("08:00", "20:00") → Cron "0 8,20 * * *".
 * Da ein Cron-Ausdruck Minuten × Stunden kombiniert, müssen alle Zeiten dieselbe
 * Minute haben; andernfalls sind getrennte Einträge anzulegen.
 */
export function toDailyCron(times: string[]): string {
  const parsed = [...new Set(times)].map((t) => {
    const [h, m] = t.split(':').map(Number);
    if (h === undefined || m === undefined || !Number.isInteger(h) || !Number.isInteger(m) || h > 23 || m > 59) {
      throw new Error(`Ungültige Uhrzeit "${t}"`);
    }
    return { h, m };
  });
  if (parsed.length === 0) throw new Error('Mindestens eine Uhrzeit angeben');
  const minutes = new Set(parsed.map((p) => p.m));
  if (minutes.size > 1) {
    throw new Error('Uhrzeiten mit unterschiedlichen Minuten bitte als getrennte Einträge anlegen');
  }
  const hours = parsed.map((p) => p.h).sort((a, b) => a - b);
  return `${parsed[0]?.m ?? 0} ${hours.join(',')} * * *`;
}

export function parseDailyCron(expression: string): DailyTime[] {
  const match = DAILY_CRON.exec(expression.trim());
  if (!match || match[1] === undefined || match[2] === undefined) {
    throw new Error(`Nicht unterstützter Cron-Ausdruck "${expression}" (erwartet "M H * * *")`);
  }
  const minutes = parseList(match[1], 59);
  const hours = parseList(match[2], 23);
  const times: DailyTime[] = [];
  for (const hour of hours) {
    for (const minute of minutes) {
      times.push({
        hour,
        minute,
        label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      });
    }
  }
  return times.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
}
