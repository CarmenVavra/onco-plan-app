import { z } from 'zod';

/** Login */
export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(200),
});

/**
 * Passwortregel (Spiegel: frontend/src/app/auth/change-password/password-rules.ts):
 * mindestens 10 Zeichen, mindestens ein Buchstabe und eine Ziffer.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const NewPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Mindestens ${PASSWORD_MIN_LENGTH} Zeichen`)
  .max(200)
  .refine((v) => /\p{L}/u.test(v), 'Mindestens ein Buchstabe')
  .refine((v) => /\d/.test(v), 'Mindestens eine Ziffer');

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: NewPasswordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'Das neue Passwort muss sich vom bisherigen unterscheiden',
  });

/**
 * Symptom-Check-in. Grenzen entsprechen dem UI (34–42 °C in 0,1er-Schritten)
 * und den DB-Constraints (Schmerz 0–10, Übelkeit 0–3).
 */
export const SymptomLogSchema = z.object({
  feverCelsius: z
    .number()
    .min(34)
    .max(43)
    .refine((v) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-6, 'Maximal eine Nachkommastelle'),
  painLevel: z.number().int().min(0).max(10),
  nauseaLevel: z.number().int().min(0).max(3),
  /** Fehlt bei älteren Offline-Einträgen → false */
  diarrhea: z.boolean().default(false),
  symptomNotes: z.string().trim().max(1000).optional(),
  /** Zeitpunkt der Erfassung; bei Offline-Sync der ursprüngliche Zeitpunkt. */
  loggedAt: z.coerce
    .date()
    .optional()
    .refine((d) => !d || d.getTime() <= Date.now() + 5 * 60_000, 'Zeitpunkt liegt in der Zukunft')
    .refine((d) => !d || d.getTime() >= Date.now() - 14 * 24 * 3600_000, 'Zeitpunkt liegt zu weit zurück'),
  /** "offline" wenn der Eintrag aus der IndexedDB-Warteschlange nachgereicht wird. */
  syncStatus: z.enum(['synced', 'offline']).optional(),
  /** Clientseitige UUID – identische Wiederholungen werden nicht doppelt gespeichert. */
  clientRef: z.string().uuid().optional(),
});
export type SymptomLogInput = z.infer<typeof SymptomLogSchema>;

/** Einnahme abhaken / zurücknehmen */
export const IntakeToggleSchema = z.object({
  planId: z.string().uuid(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  taken: z.boolean(),
});

/** Alarmstatus ändern (Quittieren / Erledigen) */
export const AlertStatusSchema = z.object({
  status: z.enum(['ACKNOWLEDGED', 'RESOLVED']),
});

export const UuidParamSchema = z.object({ id: z.string().uuid() });

// ── Patientenverwaltung (Ärzt:innen) ───────────────────────────────

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Ziffern, Leerzeichen, + / - und Klammern, z. B. "0664 123 4567", "+43 1 40400-0", "(01) 234/5678" */
const PHONE = /^\+?[0-9(][0-9 ()/-]{4,28}$/;

const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Kalenderdatum "YYYY-MM-DD" (wird als DATE gespeichert). */
const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum im Format JJJJ-MM-TT erwartet')
  .refine((v) => {
    const [y, m, d] = v.split('-').map(Number);
    const date = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
    return date.getUTCFullYear() === y && date.getUTCMonth() === (m ?? 1) - 1 && date.getUTCDate() === d;
  }, 'Ungültiges Datum');

/** Stammdaten einer Patientin / eines Patienten (Anlegen und Bearbeiten). */
export const PatientMasterSchema = z
  .object({
    firstName: z.string().trim().min(1, 'Vorname fehlt').max(100),
    lastName: z.string().trim().min(1, 'Nachname fehlt').max(100),
    email: z.string().trim().toLowerCase().email('Ungültige E-Mail-Adresse').max(255),
    birthDate: IsoDate,
    cancerType: z.string().trim().min(1, 'Diagnose fehlt').max(150),
    therapyStart: IsoDate,
    /** Leer = keine Rückrufnummer hinterlegt */
    phone: z
      .string()
      .trim()
      .max(30)
      .refine((v) => v === '' || PHONE.test(v), 'Ungültige Telefonnummer')
      .optional(),
    /** Zuständige Ärztin / zuständiger Arzt; Standard: die anlegende Person */
    assignedDoctorId: z.string().uuid().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.birthDate >= todayIso() || v.birthDate < '1900-01-01') {
      ctx.addIssue({ code: 'custom', path: ['birthDate'], message: 'Geburtsdatum muss in der Vergangenheit liegen' });
    }
    if (v.therapyStart < v.birthDate) {
      ctx.addIssue({ code: 'custom', path: ['therapyStart'], message: 'Therapiebeginn liegt vor dem Geburtsdatum' });
    }
  });
export type PatientMasterInput = z.infer<typeof PatientMasterSchema>;

/** Eintrag im Medikationsplan */
export const MedicationPlanSchema = z
  .object({
    medicationName: z.string().trim().min(1, 'Medikament fehlt').max(255),
    dosage: z.string().trim().min(1, 'Dosis fehlt').max(100),
    times: z.array(z.string().regex(TIME_HHMM, 'Uhrzeit im Format HH:MM')).min(1, 'Mindestens eine Uhrzeit').max(6),
    hint: z.string().trim().max(200).optional(),
    startDate: IsoDate,
    endDate: IsoDate,
  })
  .superRefine((v, ctx) => {
    if (v.endDate < v.startDate) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Ende liegt vor dem Beginn' });
    }
    if (new Set(v.times.map((t) => t.slice(3))).size > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['times'],
        message: 'Uhrzeiten mit unterschiedlichen Minuten bitte als getrennte Einträge anlegen',
      });
    }
  });
export type MedicationPlanInput = z.infer<typeof MedicationPlanSchema>;

// ── Termine ─────────────────────────────────────────────────────────

export const APPOINTMENT_TYPES = ['BLOOD_DRAW', 'CHEMOTHERAPY', 'CONSULTATION', 'IMAGING', 'OTHER'] as const;
/** Termine weiter als zwei Jahre im Voraus sind vermutlich Tippfehler. */
const MAX_APPOINTMENT_AHEAD_MS = 2 * 366 * 24 * 3600_000;

/** Termin anlegen / ändern. `startsAt` als ISO-Zeitpunkt (der Browser rechnet die Ortszeit um). */
export const AppointmentSchema = z
  .object({
    type: z.enum(APPOINTMENT_TYPES),
    startsAt: z.iso
      .datetime({ offset: true })
      .transform((v) => new Date(v))
      .refine((d) => d.getTime() > Date.now(), 'Der Termin muss in der Zukunft liegen')
      .refine((d) => d.getTime() < Date.now() + MAX_APPOINTMENT_AHEAD_MS, 'Der Termin liegt zu weit in der Zukunft'),
    location: z.string().trim().max(150).optional(),
    /** Nur bei Blutabnahme: nüchtern erscheinen */
    fasting: z.boolean().default(false),
    /** Hinweis für Patient:innen, z. B. "Überweisung mitbringen" (wird verschlüsselt gespeichert) */
    note: z.string().trim().max(300).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.fasting && v.type !== 'BLOOD_DRAW') {
      ctx.addIssue({ code: 'custom', path: ['fasting'], message: '„Nüchtern erscheinen“ gibt es nur bei einer Blutabnahme' });
    }
    if (v.type === 'OTHER' && !v.note) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'Bei „Sonstiger Termin“ bitte im Hinweis beschreiben, worum es geht' });
    }
  });
export type AppointmentInput = z.infer<typeof AppointmentSchema>;

// ── Web-Push ────────────────────────────────────────────────────────

/**
 * Nur bekannte Push-Dienste der Browserhersteller (Google, Mozilla, Microsoft, Apple).
 * Verhindert, dass der Server im Auftrag von Clients beliebige URLs aufruft (SSRF).
 */
const PUSH_SERVICE_HOSTS = [/(^|\.)googleapis\.com$/, /(^|\.)mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.port && PUSH_SERVICE_HOSTS.some((h) => h.test(url.hostname));
  } catch {
    return false;
  }
}

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/** Struktur von PushSubscription.toJSON() im Browser */
export const PushSubscriptionSchema = z.object({
  endpoint: z.string().max(1000).refine(isAllowedPushEndpoint, 'Unbekannter Push-Dienst'),
  keys: z.object({
    p256dh: z.string().min(80).max(100).regex(BASE64URL),
    auth: z.string().min(16).max(44).regex(BASE64URL),
  }),
});
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionSchema>;

export const PushUnsubscribeSchema = z.object({ endpoint: z.string().max(1000) });

// ── In-App-Anrufe (WebRTC-Signalisierung über Socket.io) ─────────────

export const CallStartSchema = z.object({ patientId: z.string().uuid() });
export const CallRefSchema = z.object({ callId: z.string().uuid() });

/**
 * Nachrichten des WebRTC-Verbindungsaufbaus (SDP-Angebot/-Antwort, ICE-Kandidaten).
 * Der Server leitet sie nur weiter – die Größengrenzen verhindern Missbrauch als Datenkanal.
 */
export const CallSignalSchema = z.discriminatedUnion('type', [
  z.object({ type: z.enum(['offer', 'answer']), sdp: z.string().min(1).max(30_000) }),
  z.object({
    type: z.literal('candidate'),
    candidate: z.object({
      candidate: z.string().max(1000),
      sdpMid: z.string().max(64).nullish(),
      sdpMLineIndex: z.number().int().min(0).max(64).nullish(),
      usernameFragment: z.string().max(256).nullish(),
    }),
  }),
]);
export type CallSignal = z.infer<typeof CallSignalSchema>;

export const CallRelaySchema = CallRefSchema.extend({ signal: CallSignalSchema });
export const CallMediaSchema = CallRefSchema.extend({ video: z.boolean() });
