import { FormControl, FormGroup } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { PASSWORD_RULES, passwordChangeValidator, passwordRulesValidator } from './password-rules';

describe('Passwortregeln (Spiegel des Backends)', () => {
  it('verlangt 10 Zeichen, Buchstabe und Ziffer', () => {
    expect(passwordRulesValidator(new FormControl('Sonnenblume7'))).toBeNull();
    expect(passwordRulesValidator(new FormControl('Grüße 1010 Wien'))).toBeNull();
    for (const bad of ['Kurz12345', 'nurbuchstaben', '1234567890']) {
      expect(passwordRulesValidator(new FormControl(bad))).toEqual({ passwordRules: true });
    }
  });

  it('meldet jede Regel einzeln für die Live-Checkliste', () => {
    expect(PASSWORD_RULES.map((r) => r.test('abc'))).toEqual([false, true, false]);
  });

  it('prüft Wiederholung und Unterschied zum bisherigen Passwort', () => {
    const group = (currentPassword: string, newPassword: string, repeatPassword: string) =>
      new FormGroup({
        currentPassword: new FormControl(currentPassword),
        newPassword: new FormControl(newPassword),
        repeatPassword: new FormControl(repeatPassword),
      });
    expect(passwordChangeValidator(group('Start-1234', 'Sonnenblume7', 'Sonnenblume7'))).toBeNull();
    expect(passwordChangeValidator(group('Start-1234', 'Sonnenblume7', 'Sonnenblume8'))).toEqual({ mismatch: true });
    expect(passwordChangeValidator(group('Sonnenblume7', 'Sonnenblume7', 'Sonnenblume7'))).toEqual({ sameAsCurrent: true });
  });
});
