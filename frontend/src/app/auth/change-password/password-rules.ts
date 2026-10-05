import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Spiegel der Backend-Regel (backend/src/validation/schemas.ts → NewPasswordSchema). */
export const PASSWORD_MIN_LENGTH = 10;

export interface PasswordRule {
  id: 'length' | 'letter' | 'digit';
  label: string;
  test: (value: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: `Mindestens ${PASSWORD_MIN_LENGTH} Zeichen`, test: (v) => v.length >= PASSWORD_MIN_LENGTH },
  { id: 'letter', label: 'Mindestens ein Buchstabe', test: (v) => /\p{L}/u.test(v) },
  { id: 'digit', label: 'Mindestens eine Ziffer', test: (v) => /\d/.test(v) },
];

export const passwordRulesValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const value = (c.value as string) ?? '';
  return PASSWORD_RULES.every((r) => r.test(value)) ? null : { passwordRules: true };
};

/** Gruppen-Validator: neues Passwort ≠ bisheriges, Wiederholung stimmt überein. */
export const passwordChangeValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const current = group.get('currentPassword')?.value as string;
  const next = group.get('newPassword')?.value as string;
  const repeat = group.get('repeatPassword')?.value as string;
  const errors: ValidationErrors = {};
  if (next && current && next === current) errors['sameAsCurrent'] = true;
  if (repeat && next !== repeat) errors['mismatch'] = true;
  return Object.keys(errors).length ? errors : null;
};
