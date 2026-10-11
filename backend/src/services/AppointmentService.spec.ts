import { AppointmentSchema, PushSubscriptionSchema, isAllowedPushEndpoint } from '../validation/schemas';
import type { AlertNotifier } from './AlertNotifier';
import { AppointmentService, toAppointmentDto } from './AppointmentService';
import { CryptoVault } from './CryptoVault';
import { PushService, type PushSender } from './PushService';
import { REMINDER_LEAD_MS, ReminderService, reminderMessage } from './ReminderService';

const DOC = '11111111-1111-4111-8111-111111111111';
const PATIENT = '33333333-3333-4333-8333-333333333333';
const HOUR = 3600_000;

const inHours = (h: number): string => new Date(Date.now() + h * HOUR).toISOString();

describe('AppointmentSchema', () => {
  it('akzeptiert einen zukünftigen Termin und wandelt den Zeitpunkt in ein Date um', () => {
    const parsed = AppointmentSchema.parse({ type: 'BLOOD_DRAW', startsAt: inHours(30), location: ' Ebene 3 ' });
    expect(parsed.startsAt).toBeInstanceOf(Date);
    expect(parsed.location).toBe('Ebene 3');
  });

  it('akzeptiert Zeitpunkte mit Zeitzonen-Offset', () => {
    const d = new Date(Date.now() + 48 * HOUR);
    const local = `${d.toISOString().slice(0, 19)}+02:00`;
    expect(AppointmentSchema.safeParse({ type: 'CHEMOTHERAPY', startsAt: local }).success).toBe(true);
  });

  it.each([
    ['vergangene Termine', { type: 'BLOOD_DRAW', startsAt: inHours(-1) }],
    ['Termine in über zwei Jahren', { type: 'BLOOD_DRAW', startsAt: inHours(3 * 365 * 24) }],
    ['unbekannte Terminarten', { type: 'SPA', startsAt: inHours(30) }],
    ['Datum ohne Uhrzeit', { type: 'BLOOD_DRAW', startsAt: '2030-01-01' }],
    ['"Sonstiger Termin" ohne Beschreibung', { type: 'OTHER', startsAt: inHours(30) }],
    ['zu lange Hinweise', { type: 'IMAGING', startsAt: inHours(30), note: 'x'.repeat(301) }],
    ['"nüchtern" bei anderen Terminarten als Blutabnahme', { type: 'CHEMOTHERAPY', startsAt: inHours(30), fasting: true }],
  ])('lehnt %s ab', (_label, input) => {
    expect(AppointmentSchema.safeParse(input).success).toBe(false);
  });
});

it('setzt "nüchtern" standardmäßig auf false und erlaubt es bei Blutabnahmen', () => {
  expect(AppointmentSchema.parse({ type: 'BLOOD_DRAW', startsAt: inHours(30) }).fasting).toBe(false);
  expect(AppointmentSchema.parse({ type: 'BLOOD_DRAW', startsAt: inHours(30), fasting: true }).fasting).toBe(true);
});

describe('PushSubscriptionSchema', () => {
  const keys = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };

  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
    'https://web.push.apple.com/abc',
  ])('erlaubt den Push-Dienst %s', (endpoint) => {
    expect(PushSubscriptionSchema.safeParse({ endpoint, keys }).success).toBe(true);
  });

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://localhost/push',
    'https://169.254.169.254/latest',
    'https://evil-googleapis.com/x',
    'https://fcm.googleapis.com.evil.example/x',
    'https://fcm.googleapis.com:8443/x',
    'kein-url',
  ])('blockiert %s (SSRF-Schutz)', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });

  it('prüft das Format der Schlüssel', () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/abc';
    expect(PushSubscriptionSchema.safeParse({ endpoint, keys: { ...keys, auth: 'x' } }).success).toBe(false);
    expect(PushSubscriptionSchema.safeParse({ endpoint, keys: { ...keys, p256dh: '<script>'.repeat(11) } }).success).toBe(false);
  });
});

describe('AppointmentService', () => {
  function setup() {
    const prisma = {
      patientProfile: { findFirst: jest.fn().mockResolvedValue(null) },
      appointment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: { data: object }) =>
          Promise.resolve({ id: 'a1', reminderSentAt: null, ...data }),
        ),
        update: jest.fn().mockImplementation(({ data }: { data: object }) =>
          Promise.resolve({ id: 'a1', patientId: PATIENT, location: null, noteEncrypted: null, reminderSentAt: null, ...data }),
        ),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    const notifier: jest.Mocked<AlertNotifier> = { newAlert: jest.fn(), alertUpdated: jest.fn(), patientUpdated: jest.fn() };
    return { service: new AppointmentService(prisma as never, notifier), prisma, notifier };
  }

  const existing = (startsAt: Date) => ({
    id: 'a1',
    patientId: PATIENT,
    type: 'BLOOD_DRAW',
    startsAt,
    location: null,
    fasting: false,
    noteEncrypted: null,
    reminderSentAt: new Date(),
  });

  it('vergibt Termine nur an eigene Patient:innen (404)', async () => {
    const { service } = setup();
    const input = AppointmentSchema.parse({ type: 'BLOOD_DRAW', startsAt: inHours(30) });
    await expect(service.create(DOC, PATIENT, input)).rejects.toMatchObject({ status: 404 });
  });

  it('speichert "nüchtern" und den Hinweis (verschlüsselt) und liefert beides zurück', async () => {
    const { service, prisma, notifier } = setup();
    prisma.patientProfile.findFirst.mockResolvedValue({ id: PATIENT });
    const input = AppointmentSchema.parse({ type: 'BLOOD_DRAW', startsAt: inHours(30), fasting: true, note: 'E-Card mitbringen.' });

    const dto = await service.create(DOC, PATIENT, input);

    const data = prisma.appointment.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ patientId: PATIENT, createdById: DOC, type: 'BLOOD_DRAW', location: null, fasting: true });
    expect(data.noteEncrypted).not.toContain('E-Card');
    expect(dto).toMatchObject({ fasting: true, note: 'E-Card mitbringen.' });
    expect(notifier.patientUpdated).toHaveBeenCalledWith(DOC, PATIENT);
  });

  it('setzt die Erinnerung zurück, wenn der Termin verschoben wird', async () => {
    const { service, prisma } = setup();
    prisma.appointment.findFirst.mockResolvedValue(existing(new Date(Date.now() + 20 * HOUR)));
    await service.update(DOC, 'a1', AppointmentSchema.parse({ type: 'BLOOD_DRAW', startsAt: inHours(50) }));
    expect(prisma.appointment.update.mock.calls[0][0].data.reminderSentAt).toBeNull();
  });

  it('behält die Erinnerung, wenn nur Ort oder Hinweis geändert werden', async () => {
    const { service, prisma } = setup();
    const startsAt = new Date(Date.now() + 20 * HOUR);
    prisma.appointment.findFirst.mockResolvedValue(existing(startsAt));
    await service.update(DOC, 'a1', AppointmentSchema.parse({ type: 'BLOOD_DRAW', startsAt: startsAt.toISOString(), location: 'Ebene 3' }));
    expect(prisma.appointment.update.mock.calls[0][0].data).not.toHaveProperty('reminderSentAt');
  });

  it('lässt vergangene Termine unverändert (400) und fremde Termine unsichtbar (404)', async () => {
    const { service, prisma } = setup();
    await expect(service.cancel(DOC, 'a1')).rejects.toMatchObject({ status: 404 });
    prisma.appointment.findFirst.mockResolvedValue(existing(new Date(Date.now() - HOUR)));
    await expect(service.cancel(DOC, 'a1')).rejects.toMatchObject({ status: 400 });
    expect(prisma.appointment.delete).not.toHaveBeenCalled();
  });

  it('sagt kommende Termine ab', async () => {
    const { service, prisma, notifier } = setup();
    prisma.appointment.findFirst.mockResolvedValue(existing(new Date(Date.now() + 5 * HOUR)));
    await service.cancel(DOC, 'a1');
    expect(prisma.appointment.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
    expect(notifier.patientUpdated).toHaveBeenCalledWith(DOC, PATIENT);
  });

  it('toAppointmentDto liefert ISO-Zeitpunkte', () => {
    const dto = toAppointmentDto({
      ...existing(new Date('2026-10-12T06:30:00.000Z')),
      type: 'BLOOD_DRAW',
      noteEncrypted: CryptoVault.encrypt('nüchtern'),
      reminderSentAt: null,
      createdById: DOC,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(dto).toEqual({
      id: 'a1',
      type: 'BLOOD_DRAW',
      startsAt: '2026-10-12T06:30:00.000Z',
      location: null,
      fasting: false,
      note: 'nüchtern',
      reminderSentAt: null,
    });
  });
});

describe('reminderMessage', () => {
  const now = new Date(2026, 9, 11, 10, 0);

  it('nennt Art, Tag, Uhrzeit und Ort – aber keinen Freitext-Hinweis', () => {
    const msg = reminderMessage({ id: 'a1', type: 'BLOOD_DRAW', startsAt: new Date(2026, 9, 12, 8, 30), location: 'Ebene 3', fasting: false }, now);
    expect(msg).toMatchObject({
      title: 'Terminerinnerung: Blutabnahme',
      body: 'Morgen um 08:30 · Ebene 3',
      url: '/patient/heute',
      tag: 'appointment-a1',
    });
    expect(msg.ttlSeconds).toBe(22.5 * 3600);
  });

  it('sagt "Heute", wenn der Termin kurzfristig vergeben wurde', () => {
    const msg = reminderMessage({ id: 'a1', type: 'CHEMOTHERAPY', startsAt: new Date(2026, 9, 11, 14, 0), location: null, fasting: false }, now);
    expect(msg.body).toBe('Heute um 14:00');
  });

  it('erinnert bei Blutabnahmen ans Nüchternbleiben', () => {
    const msg = reminderMessage({ id: 'a1', type: 'BLOOD_DRAW', startsAt: new Date(2026, 9, 12, 8, 30), location: 'Ebene 3', fasting: true }, now);
    expect(msg.body).toBe('Morgen um 08:30 · Ebene 3 · Bitte nüchtern erscheinen');
  });
});

describe('ReminderService', () => {
  const now = new Date(2026, 9, 11, 10, 0);
  const due = {
    id: 'a1',
    type: 'BLOOD_DRAW' as const,
    startsAt: new Date(2026, 9, 12, 8, 30),
    location: null,
    fasting: false,
    patient: { userId: 'user-anna' },
  };

  function setup() {
    const prisma = {
      appointment: {
        findMany: jest.fn().mockResolvedValue([due]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      pushSubscription: {
        findMany: jest.fn().mockResolvedValue([
          { id: 's1', endpoint: 'https://fcm.googleapis.com/a', p256dh: 'p', auth: 'a' },
          { id: 's2', endpoint: 'https://fcm.googleapis.com/b', p256dh: 'p', auth: 'a' },
        ]),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    const sender: jest.Mocked<PushSender> = { publicKey: 'pub', send: jest.fn().mockResolvedValue('sent') };
    const push = new PushService(prisma as never, sender);
    return { service: new ReminderService(prisma as never, push), prisma, sender };
  }

  it('sucht nur Termine ohne Erinnerung, die in den nächsten 24 Stunden beginnen', async () => {
    const { service, prisma } = setup();
    await service.sendDueReminders(now);
    const where = prisma.appointment.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ reminderSentAt: null, startsAt: { gt: now, lte: new Date(now.getTime() + REMINDER_LEAD_MS) } });
  });

  it('sendet an alle Geräte der Patientin und markiert den Termin als erinnert', async () => {
    const { service, prisma, sender } = setup();
    await expect(service.sendDueReminders(now)).resolves.toBe(1);
    expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
      where: { id: 'a1', reminderSentAt: null, startsAt: due.startsAt },
      data: { reminderSentAt: now },
    });
    expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith({ where: { userId: 'user-anna' } });
    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(sender.send.mock.calls[0]?.[1].title).toBe('Terminerinnerung: Blutabnahme');
  });

  it('versendet nichts, wenn eine andere Instanz den Termin bereits übernommen hat', async () => {
    const { service, prisma, sender } = setup();
    prisma.appointment.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.sendDueReminders(now)).resolves.toBe(0);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('entfernt abgelaufene Push-Abonnements', async () => {
    const { service, prisma, sender } = setup();
    sender.send.mockResolvedValueOnce('expired').mockResolvedValueOnce('sent');
    await service.sendDueReminders(now);
    expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });

  it('markiert den Termin auch ohne aktiviertes Push (Erinnerung dann nur in der App)', async () => {
    const { prisma } = setup();
    const push = new PushService(prisma as never, { publicKey: null, send: jest.fn() });
    await expect(new ReminderService(prisma as never, push).sendDueReminders(now)).resolves.toBe(1);
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled();
  });
});
