import type { SymptomLog, TriageAlert } from '@prisma/client';
import type { AlertNotifier } from './AlertNotifier';
import { evaluateTriage, GREEN_REASON, TriageEngine } from './TriageEngine';

const base = { feverCelsius: 37.0, painLevel: 0, nauseaLevel: 0, therapyWeek: 2 };

describe('evaluateTriage – Regel A: Fieber (ROT)', () => {
  it.each([38.5, 38.6, 39.0, 41.9, 43.0])('%s °C → ROT', (fever) => {
    expect(evaluateTriage({ ...base, feverCelsius: fever }).level).toBe('RED');
  });

  it.each([34.0, 37.0, 38.0, 38.4, 38.49])('%s °C ohne weitere Symptome → GRÜN', (fever) => {
    expect(evaluateTriage({ ...base, feverCelsius: fever }).level).toBeNull();
  });

  it('formuliert den Grund im deutschen Zahlenformat inkl. Therapiewoche', () => {
    expect(evaluateTriage({ ...base, feverCelsius: 38.9, therapyWeek: 2 }).reason).toBe(
      'Kritisches Fieber (38,9 °C) in Therapiewoche 2.',
    );
  });

  it('ROT hat Vorrang vor GELB, wenn beide Regeln greifen', () => {
    const result = evaluateTriage({ ...base, feverCelsius: 38.5, painLevel: 10, nauseaLevel: 3 });
    expect(result.level).toBe('RED');
  });
});

describe('evaluateTriage – Regel B: Schmerz + Übelkeit (GELB)', () => {
  // Vollständige Kombinatorik Schmerz 0–10 × Übelkeit 0–3 bei normaler Temperatur
  const combos: Array<[number, number, 'YELLOW' | null]> = [];
  for (let pain = 0; pain <= 10; pain++) {
    for (let nausea = 0; nausea <= 3; nausea++) {
      combos.push([pain, nausea, pain >= 7 && nausea >= 2 ? 'YELLOW' : null]);
    }
  }

  it.each(combos)('Schmerz %i, Übelkeit %i → %s', (pain, nausea, expected) => {
    expect(evaluateTriage({ ...base, painLevel: pain, nauseaLevel: nausea }).level).toBe(expected);
  });

  it('Grenzfall: Schmerz 7 + Übelkeit Mittel → GELB mit Begründung', () => {
    expect(evaluateTriage({ ...base, painLevel: 7, nauseaLevel: 2 })).toEqual({
      level: 'YELLOW',
      reason: 'Starke Schmerzen (Stufe 7) gekoppelt mit Übelkeit.',
    });
  });

  it('Grenzfall: Schmerz 6 + Übelkeit Schwer → GRÜN', () => {
    expect(evaluateTriage({ ...base, painLevel: 6, nauseaLevel: 3 })).toEqual({ level: null, reason: GREEN_REASON });
  });

  it('Grenzfall: 38,4 °C + Schmerz 7 + Übelkeit 2 → GELB (nicht ROT)', () => {
    expect(evaluateTriage({ ...base, feverCelsius: 38.4, painLevel: 7, nauseaLevel: 2 }).level).toBe('YELLOW');
  });
});

describe('TriageEngine.analyzeLog', () => {
  const therapyStart = new Date(Date.UTC(2026, 8, 26)); // DATE-Spalte; Tag 10 am 5.10. → Woche 2
  const log: SymptomLog = {
    id: 'log-1',
    patientId: 'patient-1',
    loggedAt: new Date(2026, 9, 5, 9, 41),
    feverCelsius: 38.9,
    painLevel: 5,
    nauseaLevel: 2,
    symptomNotes: null,
    syncStatus: 'synced',
    clientRef: null,
  };

  function setup(patient: { assignedDoctorId: string | null } | null) {
    const createdAlert = { id: 'alert-1', patientId: 'patient-1', level: 'RED' } as TriageAlert;
    const prisma = {
      patientProfile: {
        findUnique: jest.fn().mockResolvedValue(patient ? { id: 'patient-1', therapyStart, ...patient } : null),
      },
      triageAlert: { create: jest.fn().mockResolvedValue(createdAlert) },
    };
    const notifier: jest.Mocked<AlertNotifier> = {
      newAlert: jest.fn(),
      alertUpdated: jest.fn(),
      patientUpdated: jest.fn(),
    };
    const engine = new TriageEngine(prisma as never, notifier);
    return { engine, prisma, notifier, createdAlert };
  }

  it('legt bei Fieber ≥ 38,5 einen ROTEN Alarm an und benachrichtigt nur den zuständigen Arzt', async () => {
    const { engine, prisma, notifier, createdAlert } = setup({ assignedDoctorId: 'doc-1' });
    const alert = await engine.analyzeLog(log);

    expect(alert).toBe(createdAlert);
    expect(prisma.triageAlert.create).toHaveBeenCalledWith({
      data: {
        patientId: 'patient-1',
        symptomLogId: 'log-1',
        level: 'RED',
        status: 'ACTIVE',
        triggerReason: 'Kritisches Fieber (38,9 °C) in Therapiewoche 2.',
      },
    });
    expect(notifier.newAlert).toHaveBeenCalledWith('doc-1', createdAlert);
    expect(notifier.patientUpdated).toHaveBeenCalledWith('doc-1', 'patient-1');
  });

  it('legt bei unauffälligen Werten keinen Alarm an, aktualisiert aber das Dashboard', async () => {
    const { engine, prisma, notifier } = setup({ assignedDoctorId: 'doc-1' });
    const alert = await engine.analyzeLog({ ...log, feverCelsius: 37.0, painLevel: 2, nauseaLevel: 0 });

    expect(alert).toBeNull();
    expect(prisma.triageAlert.create).not.toHaveBeenCalled();
    expect(notifier.newAlert).not.toHaveBeenCalled();
    expect(notifier.patientUpdated).toHaveBeenCalledWith('doc-1', 'patient-1');
  });

  it('speichert den Alarm auch ohne zugewiesenen Arzt, sendet aber kein Socket-Event', async () => {
    const { engine, prisma, notifier } = setup({ assignedDoctorId: null });
    await engine.analyzeLog(log);

    expect(prisma.triageAlert.create).toHaveBeenCalled();
    expect(notifier.newAlert).not.toHaveBeenCalled();
    expect(notifier.patientUpdated).not.toHaveBeenCalled();
  });

  it('wirft, wenn das Patientenprofil fehlt', async () => {
    const { engine } = setup(null);
    await expect(engine.analyzeLog(log)).rejects.toThrow('nicht gefunden');
  });
});
