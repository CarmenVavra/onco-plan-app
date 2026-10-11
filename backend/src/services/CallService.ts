import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger';
import { doctorFullName } from '../utils/names';
import {
  type CallSignal,
  CallMediaSchema,
  CallRefSchema,
  CallRelaySchema,
  CallStartSchema,
} from '../validation/schemas';
import type { PushService } from './PushService';

/** Raum aller Geräte einer Patientin / eines Patienten (ein Konto, ggf. mehrere Geräte). */
export const patientRoom = (userId: string): string => `patient_${userId}`;

/** So lange klingelt es, bevor der Anruf als „nicht angenommen“ endet. */
export const RING_TIMEOUT_MS = 60_000;

export type CallEndReason = 'hangup' | 'declined' | 'timeout' | 'disconnected' | 'answered-elsewhere';

export type CallStartError = 'NOT_FOUND' | 'UNREACHABLE' | 'BUSY' | 'ALREADY_IN_CALL' | 'INVALID';

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export type CallStartResult =
  | { ok: true; callId: string; iceServers: IceServer[]; ringingInApp: boolean; pushed: boolean }
  | { ok: false; error: CallStartError };

export type CallAcceptResult = { ok: true; iceServers: IceServer[] } | { ok: false };

/** Server→Client-Events der Anruf-Signalisierung */
export interface CallServerEvents {
  'call:incoming': (payload: { callId: string; callerName: string; iceServers: IceServer[] }) => void;
  'call:accepted': (payload: { callId: string }) => void;
  'call:signal': (payload: { callId: string; signal: CallSignal }) => void;
  'call:media': (payload: { callId: string; video: boolean }) => void;
  'call:ended': (payload: { callId: string; reason: CallEndReason }) => void;
}

/** Client→Server-Events. Eingaben sind `unknown` und werden mit Zod geprüft. */
export interface CallClientEvents {
  'call:start': (payload: unknown, ack: (result: CallStartResult) => void) => void;
  'call:accept': (payload: unknown, ack: (result: CallAcceptResult) => void) => void;
  'call:decline': (payload: unknown) => void;
  'call:hangup': (payload: unknown) => void;
  'call:signal': (payload: unknown) => void;
  'call:media': (payload: unknown) => void;
}

/** Abstraktion über Socket.io, damit die Anruflogik ohne Netzwerk testbar bleibt. */
export interface CallTransport {
  /** `target` ist eine Socket-ID oder ein Raumname */
  emit<E extends keyof CallServerEvents>(target: string, event: E, payload: Parameters<CallServerEvents[E]>[0]): void;
  /** Zahl der verbundenen Sockets in einem Raum */
  roomSize(room: string): number;
}

/** Wer ein Event sendet – vom Socket-Server aus dem Sitzungs-Cookie ermittelt, nie vom Client. */
export interface CallParticipant {
  userId: string;
  role: 'DOCTOR' | 'PATIENT';
  socketId: string;
}

interface ActiveCall {
  id: string;
  doctorUserId: string;
  doctorSocketId: string;
  patientId: string;
  patientUserId: string;
  /** Erst nach dem Annehmen bekannt – vorher klingeln alle Geräte des Kontos */
  patientSocketId: string | null;
  callerName: string;
  state: 'ringing' | 'active';
  ringTimer: NodeJS.Timeout | null;
}

/**
 * Signalisierung für In-App-Anrufe (WebRTC). Gespräche laufen direkt zwischen den Geräten
 * (Peer-to-Peer, DTLS-SRTP-verschlüsselt); der Server vermittelt nur den Verbindungsaufbau
 * und sieht weder Ton noch Bild.
 *
 * Regeln:
 * - Nur Ärzt:innen rufen an, und nur ihre eigenen Patient:innen.
 * - Signal- und Medien-Events gehen ausschließlich an die Gegenstelle des eigenen Anrufs.
 * - Der Zustand liegt im Speicher (ein Server-Prozess). Nach einem Neustart sind laufende
 *   Anrufe beendet; die Gespräche selbst brechen ab, sobald ein Gerät auflegt.
 */
export class CallService {
  private readonly calls = new Map<string, ActiveCall>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly push: Pick<PushService, 'notifyUser'>,
    private readonly transport: CallTransport,
    private readonly iceServers: IceServer[],
  ) {}

  async start(caller: CallParticipant, input: unknown): Promise<CallStartResult> {
    const parsed = CallStartSchema.safeParse(input);
    if (caller.role !== 'DOCTOR' || !parsed.success) return { ok: false, error: 'INVALID' };
    if (this.findByUser(caller.userId)) return { ok: false, error: 'ALREADY_IN_CALL' };

    const profile = await this.prisma.patientProfile.findFirst({
      where: { id: parsed.data.patientId, assignedDoctorId: caller.userId },
      select: { id: true, userId: true },
    });
    if (!profile) return { ok: false, error: 'NOT_FOUND' };
    if (this.findByUser(profile.userId)) return { ok: false, error: 'BUSY' };

    const doctor = await this.prisma.user.findUnique({
      where: { id: caller.userId },
      select: { firstName: true, lastName: true },
    });
    const callerName = doctor ? doctorFullName(doctor) : 'Ihr Behandlungsteam';

    // Mitteilung zusätzlich zum Klingeln in der App: Bei gesperrtem Handy schläft die App,
    // obwohl ihre Verbindung für den Server noch kurz als offen gilt.
    const pushing = this.push
      .notifyUser(profile.userId, {
        title: `${callerName} ruft an`,
        body: 'Tippen Sie hier, um OncoPlan zu öffnen und den Anruf anzunehmen.',
        url: '/patient/heute',
        tag: 'oncoplan-call',
        ttlSeconds: RING_TIMEOUT_MS / 1000,
      })
      .catch(() => 0);
    const ringingInApp = this.transport.roomSize(patientRoom(profile.userId)) > 0;
    const pushed = ringingInApp ? false : (await pushing) > 0;
    if (!ringingInApp && !pushed) return { ok: false, error: 'UNREACHABLE' };
    // Während des Wartens auf den Push-Versand könnte ein zweiter Anruf gestartet worden sein
    if (this.findByUser(caller.userId) || this.findByUser(profile.userId)) return { ok: false, error: 'BUSY' };

    const call: ActiveCall = {
      id: randomUUID(),
      doctorUserId: caller.userId,
      doctorSocketId: caller.socketId,
      patientId: profile.id,
      patientUserId: profile.userId,
      patientSocketId: null,
      callerName,
      state: 'ringing',
      ringTimer: null,
    };
    call.ringTimer = setTimeout(() => this.end(call, 'timeout', 'both'), RING_TIMEOUT_MS);
    call.ringTimer.unref?.();
    this.calls.set(call.id, call);
    this.ring(call, patientRoom(call.patientUserId));
    logger.info('Anruf gestartet', { callId: call.id, doctorId: caller.userId, patientId: profile.id, ringingInApp, pushed });
    return { ok: true, callId: call.id, iceServers: this.iceServers, ringingInApp, pushed };
  }

  /** Neu verbundenes Patienten-Gerät (z. B. nach Antippen der Mitteilung): klingelt, falls ein Anruf wartet. */
  patientConnected(userId: string, socketId: string): void {
    for (const call of this.calls.values()) {
      if (call.patientUserId === userId && call.state === 'ringing') this.ring(call, socketId);
    }
  }

  accept(patient: CallParticipant, input: unknown): CallAcceptResult {
    const call = this.ownCall(patient, input);
    if (!call || patient.role !== 'PATIENT' || call.state !== 'ringing') return { ok: false };
    this.clearRingTimer(call);
    call.state = 'active';
    call.patientSocketId = patient.socketId;
    this.transport.emit(call.doctorSocketId, 'call:accepted', { callId: call.id });
    // Andere Geräte desselben Kontos hören auf zu klingeln (das annehmende ignoriert das Event)
    this.transport.emit(patientRoom(call.patientUserId), 'call:ended', { callId: call.id, reason: 'answered-elsewhere' });
    logger.info('Anruf angenommen', { callId: call.id });
    return { ok: true, iceServers: this.iceServers };
  }

  decline(patient: CallParticipant, input: unknown): void {
    const call = this.ownCall(patient, input);
    if (call && patient.role === 'PATIENT' && call.state === 'ringing') this.end(call, 'declined', 'both');
  }

  hangup(participant: CallParticipant, input: unknown): void {
    const call = this.ownCall(participant, input);
    if (call) this.end(call, 'hangup', participant.role === 'DOCTOR' ? 'patient' : 'doctor');
  }

  /** Leitet SDP/ICE an die Gegenstelle weiter – nur innerhalb eines angenommenen Anrufs. */
  relaySignal(sender: CallParticipant, input: unknown): void {
    const parsed = CallRelaySchema.safeParse(input);
    if (!parsed.success) return;
    const target = this.counterpart(sender, parsed.data.callId);
    if (target) this.transport.emit(target, 'call:signal', { callId: parsed.data.callId, signal: parsed.data.signal });
  }

  /** Kamera an/aus – damit die Gegenstelle das Videobild ein- oder ausblendet. */
  relayMedia(sender: CallParticipant, input: unknown): void {
    const parsed = CallMediaSchema.safeParse(input);
    if (!parsed.success) return;
    const target = this.counterpart(sender, parsed.data.callId);
    if (target) this.transport.emit(target, 'call:media', { callId: parsed.data.callId, video: parsed.data.video });
  }

  /** Bricht die Verbindung eines Gesprächspartners ab, endet der Anruf. */
  socketDisconnected(socketId: string): void {
    for (const call of [...this.calls.values()]) {
      if (call.doctorSocketId === socketId) this.end(call, 'disconnected', 'patient');
      else if (call.patientSocketId === socketId) this.end(call, 'disconnected', 'doctor');
    }
  }

  /** Für Tests und Diagnose */
  get activeCount(): number {
    return this.calls.size;
  }

  private ring(call: ActiveCall, target: string): void {
    this.transport.emit(target, 'call:incoming', {
      callId: call.id,
      callerName: call.callerName,
      iceServers: this.iceServers,
    });
  }

  private end(call: ActiveCall, reason: CallEndReason, notify: 'doctor' | 'patient' | 'both'): void {
    if (!this.calls.delete(call.id)) return;
    this.clearRingTimer(call);
    const payload = { callId: call.id, reason };
    if (notify !== 'patient') this.transport.emit(call.doctorSocketId, 'call:ended', payload);
    if (notify !== 'doctor') this.transport.emit(call.patientSocketId ?? patientRoom(call.patientUserId), 'call:ended', payload);
    logger.info('Anruf beendet', { callId: call.id, reason });
  }

  private clearRingTimer(call: ActiveCall): void {
    if (call.ringTimer) clearTimeout(call.ringTimer);
    call.ringTimer = null;
  }

  /** Anruf, an dem dieses Konto beteiligt ist (Ärzt:in: nur vom anrufenden Socket aus). */
  private ownCall(participant: CallParticipant, input: unknown): ActiveCall | null {
    const parsed = CallRefSchema.safeParse(input);
    if (!parsed.success) return null;
    const call = this.calls.get(parsed.data.callId);
    if (!call) return null;
    if (participant.role === 'DOCTOR') return call.doctorSocketId === participant.socketId ? call : null;
    if (call.patientUserId !== participant.userId) return null;
    // Nach dem Annehmen spricht nur noch das annehmende Gerät für das Konto
    return call.patientSocketId === null || call.patientSocketId === participant.socketId ? call : null;
  }

  private counterpart(sender: CallParticipant, callId: string): string | null {
    const call = this.calls.get(callId);
    if (!call || call.state !== 'active') return null;
    if (sender.socketId === call.doctorSocketId) return call.patientSocketId;
    if (sender.socketId === call.patientSocketId) return call.doctorSocketId;
    return null;
  }

  private findByUser(userId: string): ActiveCall | undefined {
    for (const call of this.calls.values()) {
      if (call.doctorUserId === userId || call.patientUserId === userId) return call;
    }
    return undefined;
  }
}

/** ICE-Server aus der Konfiguration: STUN (kostenlos) und optional ein TURN-Relay. */
export function iceServersFromEnv(config: {
  CALL_STUN_URLS: string;
  CALL_TURN_URLS?: string;
  CALL_TURN_USERNAME?: string;
  CALL_TURN_CREDENTIAL?: string;
}): IceServer[] {
  const list = (v: string | undefined): string[] =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  const servers: IceServer[] = [];
  const stun = list(config.CALL_STUN_URLS);
  if (stun.length) servers.push({ urls: stun });
  const turn = list(config.CALL_TURN_URLS);
  if (turn.length && config.CALL_TURN_USERNAME && config.CALL_TURN_CREDENTIAL) {
    servers.push({ urls: turn, username: config.CALL_TURN_USERNAME, credential: config.CALL_TURN_CREDENTIAL });
  }
  return servers;
}
