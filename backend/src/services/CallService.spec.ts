import type { PrismaClient } from '@prisma/client';
import { CallService, type CallParticipant, type CallStartResult, type CallTransport, RING_TIMEOUT_MS, iceServersFromEnv, patientRoom } from './CallService';

const DOC = '11111111-1111-4111-8111-111111111111';
const OTHER_DOC = '22222222-2222-4222-8222-222222222222';
const PATIENT_PROFILE = '33333333-3333-4333-8333-333333333333';
const PATIENT_USER = '44444444-4444-4444-8444-444444444444';
const UNKNOWN = '55555555-5555-4555-8555-555555555555';

const doctor: CallParticipant = { userId: DOC, role: 'DOCTOR', socketId: 'sock-doc' };
const phone: CallParticipant = { userId: PATIENT_USER, role: 'PATIENT', socketId: 'sock-phone' };
const tablet: CallParticipant = { userId: PATIENT_USER, role: 'PATIENT', socketId: 'sock-tablet' };
const ICE = [{ urls: ['stun:stun.example.org:3478'] }];
const OFFER = { type: 'offer', sdp: 'v=0' };

interface Sent {
  target: string;
  event: string;
  payload: unknown;
}

function setup(options: { online?: boolean; pushDevices?: number } = {}) {
  const sent: Sent[] = [];
  const transport: CallTransport = {
    emit: (target, event, payload) => sent.push({ target, event, payload }),
    roomSize: (room) => (room === patientRoom(PATIENT_USER) && (options.online ?? true) ? 1 : 0),
  };
  const prisma = {
    patientProfile: {
      // Nur die eigene Patientin gehört zu DOC
      findFirst: jest.fn(({ where }: { where: { id: string; assignedDoctorId: string } }) =>
        Promise.resolve(where.id === PATIENT_PROFILE && where.assignedDoctorId === DOC ? { id: PATIENT_PROFILE, userId: PATIENT_USER } : null),
      ),
    },
    user: { findUnique: jest.fn(() => Promise.resolve({ firstName: 'Lena', lastName: 'Brandt' })) },
  } as unknown as PrismaClient;
  const push = { notifyUser: jest.fn(() => Promise.resolve(options.pushDevices ?? 0)) };
  const service = new CallService(prisma, push, transport, ICE);
  const events = (event: string) => sent.filter((s) => s.event === event);
  return { service, sent, events, push };
}

async function startedCall(service: CallService): Promise<string> {
  const result = await service.start(doctor, { patientId: PATIENT_PROFILE });
  if (!result.ok) throw new Error(result.error);
  return result.callId;
}

afterEach(() => jest.useRealTimers());

describe('CallService – Anruf starten', () => {
  it('lässt das Telefon der eigenen Patientin klingeln und nennt die Ärztin', async () => {
    const { service, events } = setup();
    const result = await service.start(doctor, { patientId: PATIENT_PROFILE });
    expect(result).toMatchObject({ ok: true, ringingInApp: true, iceServers: ICE });
    expect(events('call:incoming')).toEqual([
      { target: patientRoom(PATIENT_USER), event: 'call:incoming', payload: expect.objectContaining({ callerName: 'Dr. Lena Brandt' }) },
    ]);
  });

  it('verweigert Anrufe bei fremden oder unbekannten Patient:innen', async () => {
    const { service, events } = setup();
    const otherDoctor: CallParticipant = { userId: OTHER_DOC, role: 'DOCTOR', socketId: 'sock-other' };
    expect(await service.start(otherDoctor, { patientId: PATIENT_PROFILE })).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await service.start(doctor, { patientId: UNKNOWN })).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(events('call:incoming')).toHaveLength(0);
  });

  it.each<[string, CallParticipant, unknown]>([
    ['Patient:innen', phone, { patientId: PATIENT_PROFILE }],
    ['ungültige IDs', doctor, { patientId: 'abc' }],
    ['fehlende Daten', doctor, null],
  ])('lehnt Anrufe durch %s ab', async (_label, caller, input) => {
    const { service } = setup();
    expect(await service.start(caller, input)).toEqual({ ok: false, error: 'INVALID' });
  });

  it('erreicht eine geschlossene App über die Mitteilung, sonst „nicht erreichbar“', async () => {
    const withPush = setup({ online: false, pushDevices: 1 });
    expect(await withPush.service.start(doctor, { patientId: PATIENT_PROFILE })).toMatchObject({ ok: true, ringingInApp: false, pushed: true });

    const unreachable = setup({ online: false, pushDevices: 0 });
    expect(await unreachable.service.start(doctor, { patientId: PATIENT_PROFILE })).toEqual({ ok: false, error: 'UNREACHABLE' });
    expect(unreachable.service.activeCount).toBe(0);
  });

  it('erlaubt pro Ärztin und pro Patientin nur einen Anruf gleichzeitig', async () => {
    const { service } = setup();
    await startedCall(service);
    expect(await service.start(doctor, { patientId: PATIENT_PROFILE })).toEqual({ ok: false, error: 'ALREADY_IN_CALL' });
  });

  it('lässt ein später geöffnetes Gerät ebenfalls klingeln', async () => {
    const { service, events } = setup();
    const callId = await startedCall(service);
    service.patientConnected(PATIENT_USER, 'sock-later');
    expect(events('call:incoming').map((e) => e.target)).toEqual([patientRoom(PATIENT_USER), 'sock-later']);
    expect(events('call:incoming')[1]?.payload).toMatchObject({ callId });
  });

  it('beendet einen nicht angenommenen Anruf nach der Klingelzeit', async () => {
    jest.useFakeTimers();
    const { service, events } = setup();
    const callId = await startedCall(service);
    jest.advanceTimersByTime(RING_TIMEOUT_MS);
    expect(events('call:ended').map((e) => e.target)).toEqual(['sock-doc', patientRoom(PATIENT_USER)]);
    expect(events('call:ended')[0]?.payload).toEqual({ callId, reason: 'timeout' });
    expect(service.activeCount).toBe(0);
  });
});

describe('CallService – Annehmen, Ablehnen, Auflegen', () => {
  it('Annehmen verbindet genau dieses Gerät; andere Geräte hören auf zu klingeln', async () => {
    const { service, sent } = setup();
    const callId = await startedCall(service);
    sent.length = 0;
    expect(service.accept(phone, { callId })).toEqual({ ok: true, iceServers: ICE });
    expect(sent).toEqual([
      { target: 'sock-doc', event: 'call:accepted', payload: { callId } },
      { target: patientRoom(PATIENT_USER), event: 'call:ended', payload: { callId, reason: 'answered-elsewhere' } },
    ]);
    // Zweites Gerät kann nicht mehr annehmen
    expect(service.accept(tablet, { callId })).toEqual({ ok: false });
  });

  it('nur die angerufene Person kann annehmen', async () => {
    const { service } = setup();
    const callId = await startedCall(service);
    const stranger: CallParticipant = { userId: UNKNOWN, role: 'PATIENT', socketId: 'sock-x' };
    expect(service.accept(stranger, { callId })).toEqual({ ok: false });
    expect(service.accept(doctor, { callId })).toEqual({ ok: false });
  });

  it('Ablehnen meldet es der Ärztin und allen Geräten', async () => {
    const { service, events } = setup();
    const callId = await startedCall(service);
    service.decline(phone, { callId });
    expect(events('call:ended')).toEqual([
      { target: 'sock-doc', event: 'call:ended', payload: { callId, reason: 'declined' } },
      { target: patientRoom(PATIENT_USER), event: 'call:ended', payload: { callId, reason: 'declined' } },
    ]);
  });

  it('Auflegen informiert nur die Gegenstelle', async () => {
    const { service, events } = setup();
    const callId = await startedCall(service);
    service.accept(phone, { callId });
    service.hangup(phone, { callId });
    expect(events('call:ended').filter((e) => (e.payload as { reason: string }).reason === 'hangup')).toEqual([
      { target: 'sock-doc', event: 'call:ended', payload: { callId, reason: 'hangup' } },
    ]);
    expect(service.activeCount).toBe(0);
  });

  it('Verbindungsabbruch eines Gesprächspartners beendet den Anruf', async () => {
    const { service, events } = setup();
    const callId = await startedCall(service);
    service.accept(phone, { callId });
    service.socketDisconnected('sock-doc');
    expect(events('call:ended').at(-1)).toEqual({ target: 'sock-phone', event: 'call:ended', payload: { callId, reason: 'disconnected' } });
  });
});

describe('CallService – Signalisierung', () => {
  it('leitet SDP und Kamera-Status nur an die Gegenstelle weiter', async () => {
    const { service, events } = setup();
    const callId = await startedCall(service);
    service.accept(phone, { callId });
    service.relaySignal(doctor, { callId, signal: OFFER });
    service.relayMedia(phone, { callId, video: true });
    expect(events('call:signal')).toEqual([{ target: 'sock-phone', event: 'call:signal', payload: { callId, signal: OFFER } }]);
    expect(events('call:media')).toEqual([{ target: 'sock-doc', event: 'call:media', payload: { callId, video: true } }]);
  });

  it('ignoriert Signale vor dem Annehmen, von Unbeteiligten und mit ungültigem Inhalt', async () => {
    const { service, events } = setup();
    const callId = await startedCall(service);
    service.relaySignal(doctor, { callId, signal: OFFER }); // noch nicht angenommen
    service.accept(phone, { callId });
    service.relaySignal(tablet, { callId, signal: OFFER }); // anderes Gerät
    service.relaySignal(doctor, { callId, signal: { type: 'offer', sdp: 'x'.repeat(30_001) } });
    service.relaySignal(doctor, { callId, signal: { type: 'script', payload: '…' } });
    expect(events('call:signal')).toHaveLength(0);
  });
});

describe('iceServersFromEnv', () => {
  it('liefert STUN und – nur vollständig konfiguriert – TURN', () => {
    expect(iceServersFromEnv({ CALL_STUN_URLS: 'stun:a:3478, stun:b:3478' })).toEqual([{ urls: ['stun:a:3478', 'stun:b:3478'] }]);
    expect(
      iceServersFromEnv({ CALL_STUN_URLS: '', CALL_TURN_URLS: 'turn:t:443', CALL_TURN_USERNAME: 'u', CALL_TURN_CREDENTIAL: 'p' }),
    ).toEqual([{ urls: ['turn:t:443'], username: 'u', credential: 'p' }]);
    expect(iceServersFromEnv({ CALL_STUN_URLS: '', CALL_TURN_URLS: 'turn:t:443' })).toEqual([]);
  });
});

// Typprüfung: Ergebnis-Union ist für Clients eindeutig unterscheidbar
const _typecheck = (r: CallStartResult): string => (r.ok ? r.callId : r.error);
void _typecheck;
