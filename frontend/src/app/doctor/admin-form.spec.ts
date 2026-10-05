import { FormControl, FormGroup } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { PHONE_PATTERN, dateOrderValidator, formatIsoDate, pastDateValidator, sameMinuteValidator, todayIso } from './admin-form';

describe('Validatoren der Patientenverwaltung', () => {
  it('Geburtsdatum muss in der Vergangenheit liegen', () => {
    expect(pastDateValidator(new FormControl('1968-04-12'))).toBeNull();
    expect(pastDateValidator(new FormControl(todayIso()))).toEqual({ pastDate: true });
    expect(pastDateValidator(new FormControl('1899-12-31'))).toEqual({ pastDate: true });
    expect(pastDateValidator(new FormControl(''))).toBeNull(); // "required" übernimmt
  });

  it('Therapiebeginn darf nicht vor dem Geburtsdatum liegen', () => {
    const validator = dateOrderValidator('birthDate', 'therapyStart', 'therapyBeforeBirth');
    const group = (birthDate: string, therapyStart: string) =>
      new FormGroup({ birthDate: new FormControl(birthDate), therapyStart: new FormControl(therapyStart) });
    expect(validator(group('1968-04-12', '2026-10-01'))).toBeNull();
    expect(validator(group('1968-04-12', '1960-01-01'))).toEqual({ therapyBeforeBirth: true });
  });

  it('alle Einnahmezeiten eines Eintrags brauchen dieselbe Minute', () => {
    expect(sameMinuteValidator(new FormControl(['08:00', '20:00']))).toBeNull();
    expect(sameMinuteValidator(new FormControl(['08:00', '20:30']))).toEqual({ mixedMinutes: true });
  });

  it('Telefonnummern im österreichischen und internationalen Format', () => {
    for (const ok of ['0664 123 4567', '01 234 5678', '+43 1 40400-0', '(01) 234/5678']) expect(PHONE_PATTERN.test(ok)).toBe(true);
    for (const bad of ['abc', '12', '0664-ABC']) expect(PHONE_PATTERN.test(bad)).toBe(false);
  });

  it('formatiert ISO-Daten deutsch', () => {
    expect(formatIsoDate('2026-10-05')).toBe('05.10.2026');
  });
});
