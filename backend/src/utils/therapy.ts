const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Lokaler Tagesbeginn (00:00) eines Zeitpunkts. */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * PostgreSQL-DATE-Spalten kommen als UTC-Mitternacht zurück. Für Kalenderrechnungen
 * in Ortszeit muss daraus lokale Mitternacht desselben Kalendertags werden.
 */
export function fromDbDate(dbDate: Date): Date {
  return new Date(dbDate.getUTCFullYear(), dbDate.getUTCMonth(), dbDate.getUTCDate());
}

/** Gegenstück zu `fromDbDate`: lokaler Kalendertag → UTC-Mitternacht für DATE-Spalten. */
export function toDbDate(localDate: Date): Date {
  return new Date(Date.UTC(localDate.getFullYear(), localDate.getMonth(), localDate.getDate()));
}

/** "YYYY-MM-DD" → UTC-Mitternacht für DATE-Spalten; wirft bei ungültigem Kalenderdatum. */
export function isoToDbDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`Ungültiges Datum "${iso}"`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new Error(`Ungültiges Datum "${iso}"`);
  }
  return date;
}

/** DATE-Spalte als "YYYY-MM-DD". */
export function dbDateToIso(dbDate: Date): string {
  return dbDate.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Therapietag (1-basiert): Der Tag des Therapiebeginns ist Tag 1.
 * Kalendertage, damit Uhrzeit und Sommerzeit das Ergebnis nicht verschieben.
 */
export function therapyDay(therapyStart: Date, at: Date): number {
  const start = startOfDay(therapyStart);
  const current = startOfDay(at);
  const diffDays = Math.round((current.getTime() - start.getTime()) / MS_PER_DAY);
  return Math.max(1, diffDays + 1);
}

/** Therapiewoche (1-basiert): Tag 1–7 → Woche 1, Tag 8–14 → Woche 2 … */
export function therapyWeek(therapyStart: Date, at: Date): number {
  return Math.ceil(therapyDay(therapyStart, at) / 7);
}

/** Alter in vollendeten Lebensjahren. */
export function ageInYears(birthDate: Date, at: Date = new Date()): number {
  let age = at.getFullYear() - birthDate.getFullYear();
  const beforeBirthday =
    at.getMonth() < birthDate.getMonth() ||
    (at.getMonth() === birthDate.getMonth() && at.getDate() < birthDate.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** Deutsches Zahlenformat mit einer Nachkommastelle, z. B. 38.9 → "38,9". */
export function formatDecimalDe(value: number): string {
  return value.toFixed(1).replace('.', ',');
}
