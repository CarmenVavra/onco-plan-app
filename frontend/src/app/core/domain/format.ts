/** Formatierung im deutschen Format (Komma, 24h-Uhr). */

export function formatCelsius(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function formatClock(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isYesterday(d: Date, now: Date): boolean {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return isSameDay(d, y);
}

/** "vor 4 Min.", "vor 2 Std.", "gestern", "03.10." */
export function formatRelative(iso: string, now: Date): string {
  const d = new Date(iso);
  const minutes = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  if (minutes < 24 * 60 && isSameDay(d, now)) return `vor ${Math.floor(minutes / 60)} Std.`;
  if (isYesterday(d, now)) return 'gestern';
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
}

/** Uhrzeit für heute, sonst "gestern" bzw. Datum. */
export function formatDayOrClock(iso: string, now: Date): string {
  const d = new Date(iso);
  if (isSameDay(d, now)) return formatClock(d);
  if (isYesterday(d, now)) return 'gestern';
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} · ${formatClock(d)}`;
}

/** "heute 09:41" / "gestern 18:02" / "03.10. 08:00" */
export function formatAckTime(iso: string, now: Date): string {
  const d = new Date(iso);
  if (isSameDay(d, now)) return `heute ${formatClock(d)}`;
  if (isYesterday(d, now)) return `gestern ${formatClock(d)}`;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}. ${formatClock(d)}`;
}

const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WEEKDAYS_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** "YYYY-MM-DD" → "Mo" */
export function weekdayShort(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return WEEKDAYS_SHORT[new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getDay()] ?? '';
}

/** "Montag, 5. Oktober" */
export function formatLongDate(d: Date): string {
  return `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

/** Tageszeitabhängige Begrüßung */
export function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 11) return 'Guten Morgen';
  if (h < 18) return 'Guten Tag';
  return 'Guten Abend';
}

/** Telefonnummer für tel:-Links (nur Ziffern und führendes +) */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
