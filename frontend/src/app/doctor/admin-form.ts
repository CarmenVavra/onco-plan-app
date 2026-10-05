import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Heutiges Datum als "YYYY-MM-DD" (Ortszeit) – Format von <input type="date"> */
export function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "2026-10-05" → "05.10.2026" */
export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

/** Spiegel von backend/src/validation/schemas.ts (PHONE) */
export const PHONE_PATTERN = /^\+?[0-9(][0-9 ()/-]{4,28}$/;

/** Datum muss vor heute liegen (Geburtsdatum). */
export const pastDateValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const v = c.value as string;
  return v && (v >= todayIso() || v < '1900-01-01') ? { pastDate: true } : null;
};

/** Gruppen-Validator: `later` darf nicht vor `earlier` liegen. */
export function dateOrderValidator(earlier: string, later: string, errorKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const a = group.get(earlier)?.value as string | undefined;
    const b = group.get(later)?.value as string | undefined;
    return a && b && b < a ? { [errorKey]: true } : null;
  };
}

/** Alle Uhrzeiten eines Eintrags müssen dieselbe Minute haben (ein Cron-Ausdruck pro Eintrag). */
export const sameMinuteValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const times = (c.value as string[]).filter(Boolean);
  return new Set(times.map((t) => t.slice(3))).size > 1 ? { mixedMinutes: true } : null;
};
