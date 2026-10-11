import type { Appointment, AppointmentType } from '../models/api.models';
import { formatClock, isSameDay } from './format';

/** Spiegel von backend/src/services/ReminderService.ts (dort heißt OTHER neutral „Termin“) */
export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  BLOOD_DRAW: 'Blutabnahme',
  CHEMOTHERAPY: 'Chemotherapie',
  CONSULTATION: 'Arztgespräch',
  IMAGING: 'Bildgebung (CT/MRT)',
  OTHER: 'Sonstiger Termin',
};

/** Erinnerung 24 Stunden vor Terminbeginn (wie der Server) */
export const REMINDER_LEAD_MS = 24 * 3600_000;

const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const pad = (n: number): string => String(n).padStart(2, '0');

/** Überschrift für Patient:innen – bei „Sonstiger Termin“ steht die Beschreibung im Hinweis. */
export function appointmentTitle(a: Pick<Appointment, 'type' | 'note'>): string {
  return a.type === 'OTHER' ? (a.note ?? 'Termin') : APPOINTMENT_TYPE_LABELS[a.type];
}

/** Hinweis nur anzeigen, wenn er nicht schon als Überschrift dient. */
export function appointmentNote(a: Pick<Appointment, 'type' | 'note'>): string | null {
  return a.type === 'OTHER' ? null : a.note;
}

/** Beginnt der Termin innerhalb der nächsten 24 Stunden? */
export function isReminderDue(a: Pick<Appointment, 'startsAt'>, now: Date): boolean {
  const ms = Date.parse(a.startsAt) - now.getTime();
  return ms > 0 && ms <= REMINDER_LEAD_MS;
}

/** "Heute" / "Morgen" / "Mi, 14.10." */
export function formatAppointmentDay(iso: string, now: Date): string {
  const d = new Date(iso);
  if (isSameDay(d, now)) return 'Heute';
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDay(d, tomorrow)) return 'Morgen';
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
}

/** "Morgen, 08:30" */
export function formatAppointmentWhen(iso: string, now: Date): string {
  return `${formatAppointmentDay(iso, now)}, ${formatClock(iso)}`;
}

/** Formularwerte (Ortszeit des Browsers) → ISO-Zeitpunkt für die API */
export function toStartsAtIso(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, h ?? 0, min ?? 0).toISOString();
}

/** ISO-Zeitpunkt → Formularwerte in Ortszeit */
export function splitStartsAt(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: formatClock(d) };
}
