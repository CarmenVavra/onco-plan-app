import type { MedicationPlan } from '@prisma/client';
import { toDailyCron } from '../utils/cron';
import { generateInitialPassword } from '../utils/initialPassword';
import { isoToDbDate } from '../utils/therapy';
import { MedicationPlanSchema, PatientMasterSchema } from '../validation/schemas';
import type { AlertNotifier } from './AlertNotifier';
import { PatientAdminService, toMedicationPlanDto } from './PatientAdminService';
import { PasswordHasher } from './PasswordHasher';

const DOC = '11111111-1111-4111-8111-111111111111';
const OTHER_DOC = '22222222-2222-4222-8222-222222222222';
const PATIENT = '33333333-3333-4333-8333-333333333333';

const validPatient = {
  firstName: 'Maria',
  lastName: 'Huber',
  email: 'Maria.Huber@Example.at ',
  birthDate: '1968-04-12',
  cancerType: 'Mammakarzinom',
  therapyStart: '2026-09-28',
  phone: '0664 123 4567',
};

const validMedication = {
  medicationName: 'Capecitabin',
  dosage: '1.150 mg',
  times: ['20:00', '08:00'],
  hint: 'nach dem Essen',
  startDate: '2026-10-01',
  endDate: '2026-12-31',
};

describe('toDailyCron', () => {
  it('fasst Uhrzeiten mit gleicher Minute zusammen und sortiert die Stunden', () => {
    expect(toDailyCron(['20:00', '08:00'])).toBe('0 8,20 * * *');
    expect(toDailyCron(['13:30'])).toBe('30 13 * * *');
  });

  it('entfernt doppelte Uhrzeiten', () => {
    expect(toDailyCron(['08:00', '08:00'])).toBe('0 8 * * *');
  });

  it('lehnt unterschiedliche Minuten und ungültige Zeiten ab', () => {
    expect(() => toDailyCron(['08:00', '20:30'])).toThrow('getrennte Einträge');
    expect(() => toDailyCron(['25:00'])).toThrow('Ungültige Uhrzeit');
    expect(() => toDailyCron([])).toThrow('Mindestens eine Uhrzeit');
  });
});

describe('isoToDbDate', () => {
  it('liefert UTC-Mitternacht des Kalendertags', () => {
    expect(isoToDbDate('2026-10-05').toISOString()).toBe('2026-10-05T00:00:00.000Z');
  });

  it.each(['2026-02-30', '2026-13-01', '05.10.2026', ''])('lehnt "%s" ab', (v) => {
    expect(() => isoToDbDate(v)).toThrow('Ungültiges Datum');
  });
});

describe('generateInitialPassword', () => {
  it('erzeugt gut lesbare, zufällige Passwörter im Format XXXX-XXXX-XXXX', () => {
    const a = generateInitialPassword();
    expect(a).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    expect(a).not.toMatch(/[01OIl]/);
    expect(generateInitialPassword()).not.toBe(a);
  });
});

describe('PatientMasterSchema', () => {
  it('normalisiert die E-Mail und akzeptiert gültige Stammdaten', () => {
    expect(PatientMasterSchema.parse(validPatient).email).toBe('maria.huber@example.at');
  });

  it('erlaubt eine leere Telefonnummer und gängige Schreibweisen', () => {
    for (const phone of ['', '01 234 5678', '+43 1 40400-0', '(01) 234/5678']) {
      expect(PatientMasterSchema.safeParse({ ...validPatient, phone }).success).toBe(true);
    }
  });

  it.each([
    ['Geburtsdatum in der Zukunft', { birthDate: '2999-01-01' }],
    ['ungültiges Kalenderdatum', { birthDate: '1968-02-30' }],
    ['Therapiebeginn vor Geburt', { therapyStart: '1960-01-01' }],
    ['ungültige Telefonnummer', { phone: 'abc' }],
    ['ungültige E-Mail', { email: 'keine-mail' }],
    ['leerer Name', { lastName: '  ' }],
  ])('lehnt ab: %s', (_label, override) => {
    expect(PatientMasterSchema.safeParse({ ...validPatient, ...override }).success).toBe(false);
  });
});

describe('MedicationPlanSchema', () => {
  it('akzeptiert einen gültigen Eintrag', () => {
    expect(MedicationPlanSchema.safeParse(validMedication).success).toBe(true);
  });

  it.each([
    ['Ende vor Beginn', { endDate: '2026-09-01' }],
    ['unterschiedliche Minuten', { times: ['08:00', '20:30'] }],
    ['keine Uhrzeit', { times: [] }],
    ['ungültige Uhrzeit', { times: ['8 Uhr'] }],
  ])('lehnt ab: %s', (_label, override) => {
    expect(MedicationPlanSchema.safeParse({ ...validMedication, ...override }).success).toBe(false);
  });
});

describe('toMedicationPlanDto', () => {
  it('liefert Uhrzeiten und den Aktiv-Status bezogen auf heute', () => {
    const plan = {
      id: 'p',
      patientId: PATIENT,
      medicationName: 'Ondansetron',
      dosage: '8 mg',
      frequencyCron: '0 8,20 * * *',
      hint: null,
      startDate: new Date(Date.UTC(2026, 9, 1)),
      endDate: new Date(Date.UTC(2026, 9, 5)),
    } satisfies MedicationPlan;
    expect(toMedicationPlanDto(plan, new Date(2026, 9, 5, 12))).toMatchObject({ times: ['08:00', '20:00'], active: true });
    expect(toMedicationPlanDto(plan, new Date(2026, 9, 6, 12)).active).toBe(false);
  });
});

describe('PatientAdminService', () => {
  function setup() {
    const tx = {
      user: { create: jest.fn().mockResolvedValue({ id: 'user-new' }) },
      patientProfile: { create: jest.fn().mockResolvedValue({ id: PATIENT }) },
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockImplementation(({ where }: { where: { id: string } }) =>
          Promise.resolve(where.id === DOC || where.id === OTHER_DOC ? { id: where.id } : null),
        ),
        update: jest.fn().mockReturnValue('user-update'),
      },
      patientProfile: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockReturnValue('profile-update'),
      },
      medicationPlan: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      medicationIntake: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn().mockImplementation((arg: unknown) =>
        typeof arg === 'function' ? (arg as (t: typeof tx) => unknown)(tx) : Promise.resolve(arg),
      ),
    };
    const notifier: jest.Mocked<AlertNotifier> = { newAlert: jest.fn(), alertUpdated: jest.fn(), patientUpdated: jest.fn() };
    return { service: new PatientAdminService(prisma as never, notifier), prisma, tx, notifier };
  }

  it('legt Patient:in mit gehashtem Startpasswort und verschlüsselter Telefonnummer an', async () => {
    const { service, tx, notifier } = setup();
    const result = await service.create(DOC, PatientMasterSchema.parse(validPatient));

    expect(result.patientId).toBe(PATIENT);
    const userData = tx.user.create.mock.calls[0][0].data;
    expect(userData).toMatchObject({ email: 'maria.huber@example.at', role: 'PATIENT' });
    expect(userData.passwordHash).not.toContain(result.initialPassword);
    await expect(PasswordHasher.verify(result.initialPassword, userData.passwordHash)).resolves.toBe(true);

    const profileData = tx.patientProfile.create.mock.calls[0][0].data;
    expect(profileData.assignedDoctorId).toBe(DOC);
    expect(profileData.phoneEncrypted).not.toContain('0664');
    expect(profileData.birthDate.toISOString()).toBe('1968-04-12T00:00:00.000Z');
    expect(notifier.patientUpdated).toHaveBeenCalledWith(DOC, PATIENT);
  });

  it('meldet einen Konflikt bei bereits vergebener E-Mail', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(service.create(DOC, PatientMasterSchema.parse(validPatient))).rejects.toMatchObject({ status: 409 });
  });

  it('lehnt eine unbekannte zuständige Ärztin ab', async () => {
    const { service } = setup();
    const input = PatientMasterSchema.parse({ ...validPatient, assignedDoctorId: '44444444-4444-4444-8444-444444444444' });
    await expect(service.create(DOC, input)).rejects.toMatchObject({ status: 400 });
  });

  it('verweigert das Bearbeiten fremder Patient:innen (404)', async () => {
    const { service } = setup();
    await expect(service.update(DOC, PATIENT, PatientMasterSchema.parse(validPatient))).rejects.toMatchObject({ status: 404 });
    await expect(service.resetPassword(DOC, PATIENT)).rejects.toMatchObject({ status: 404 });
  });

  it('benachrichtigt bei Übergabe beide Ärzt:innen', async () => {
    const { service, prisma, notifier } = setup();
    prisma.patientProfile.findFirst.mockResolvedValue({ id: PATIENT, userId: 'u1' });
    await service.update(DOC, PATIENT, PatientMasterSchema.parse({ ...validPatient, assignedDoctorId: OTHER_DOC }));
    expect(notifier.patientUpdated).toHaveBeenCalledWith(DOC, PATIENT);
    expect(notifier.patientUpdated).toHaveBeenCalledWith(OTHER_DOC, PATIENT);
  });

  describe('endMedication', () => {
    const today = new Date();
    const utc = (offsetDays: number) =>
      new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + offsetDays));

    it('beendet laufende Einträge zum gestrigen Tag', async () => {
      const { service, prisma } = setup();
      prisma.medicationPlan.findFirst.mockResolvedValue({ id: 'm', patientId: PATIENT, startDate: utc(-10), endDate: utc(30) });
      await service.endMedication(DOC, 'm');
      expect(prisma.medicationPlan.update).toHaveBeenCalledWith({ where: { id: 'm' }, data: { endDate: utc(-1) } });
      expect(prisma.medicationPlan.delete).not.toHaveBeenCalled();
    });

    it('löscht Einträge, die noch nicht begonnen haben', async () => {
      const { service, prisma } = setup();
      prisma.medicationPlan.findFirst.mockResolvedValue({ id: 'm', patientId: PATIENT, startDate: utc(3), endDate: utc(30) });
      await service.endMedication(DOC, 'm');
      expect(prisma.medicationPlan.delete).toHaveBeenCalledWith({ where: { id: 'm' } });
    });

    it('behält heute begonnene Einträge mit bestätigten Einnahmen (Ende = heute)', async () => {
      const { service, prisma } = setup();
      prisma.medicationPlan.findFirst.mockResolvedValue({ id: 'm', patientId: PATIENT, startDate: utc(0), endDate: utc(30) });
      prisma.medicationIntake.count.mockResolvedValue(1);
      await service.endMedication(DOC, 'm');
      expect(prisma.medicationPlan.update).toHaveBeenCalledWith({ where: { id: 'm' }, data: { endDate: utc(0) } });
      expect(prisma.medicationPlan.delete).not.toHaveBeenCalled();
    });

    it('lehnt bereits beendete Einträge ab', async () => {
      const { service, prisma } = setup();
      prisma.medicationPlan.findFirst.mockResolvedValue({ id: 'm', patientId: PATIENT, startDate: utc(-10), endDate: utc(-2) });
      await expect(service.endMedication(DOC, 'm')).rejects.toMatchObject({ status: 400 });
    });
  });
});
