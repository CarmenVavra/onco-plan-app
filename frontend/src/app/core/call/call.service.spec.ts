import { TestBed } from '@angular/core/testing';
import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callEndMessage, formatCallDuration } from './call-messages';
import { CallService } from './call.service';
import { CallToneService } from './call-tone.service';

const CALL_ID = '0b6c7c43-6a0a-4f43-9d2e-8f1a2b3c4d5e';
const PATIENT_ID = '33333333-3333-4333-8333-333333333333';
const ICE = [{ urls: ['stun:stun.example.org:3478'] }];

/** Minimaler Socket.io-Client: merkt sich gesendete Events, Server-Events lassen sich auslösen. */
class FakeSocket {
  connected = true;
  readonly sent: Array<{ event: string; payload: unknown }> = [];
  ack: (event: string, payload: unknown) => unknown = () => ({ ok: true });
  private readonly handlers = new Map<string, Set<(...args: unknown[]) => void>>();

  on(event: string, fn: (...args: unknown[]) => void): this {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)?.add(fn);
    return this;
  }
  off(event: string, fn: (...args: unknown[]) => void): this {
    this.handlers.get(event)?.delete(fn);
    return this;
  }
  emit(event: string, payload: unknown): this {
    this.sent.push({ event, payload });
    return this;
  }
  timeout(): { emitWithAck: (event: string, payload: unknown) => Promise<unknown> } {
    return {
      emitWithAck: async (event, payload) => {
        this.sent.push({ event, payload });
        return this.ack(event, payload);
      },
    };
  }
  /** Event vom Server */
  receive(event: string, payload?: unknown): void {
    for (const fn of this.handlers.get(event) ?? []) fn(payload);
  }
  events(name: string): unknown[] {
    return this.sent.filter((s) => s.event === name).map((s) => s.payload);
  }
}

class FakeTrack {
  enabled = true;
  readonly stop = vi.fn();
  constructor(readonly kind: 'audio' | 'video') {}
}

class FakeStream {
  constructor(private readonly tracks: FakeTrack[] = []) {}
  getTracks(): FakeTrack[] {
    return this.tracks;
  }
  getAudioTracks(): FakeTrack[] {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
  getVideoTracks(): FakeTrack[] {
    return this.tracks.filter((t) => t.kind === 'video');
  }
}

/** Nur das, was der CallService von RTCPeerConnection benutzt */
class FakePeer {
  static last: FakePeer | null = null;
  localDescription: { sdp: string } | null = null;
  remoteDescription: { sdp: string } | null = null;
  connectionState = 'new';
  onicecandidate: ((e: unknown) => void) | null = null;
  ontrack: ((e: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  readonly addTrack = vi.fn();
  readonly addTransceiver = vi.fn();
  readonly addIceCandidate = vi.fn(async () => undefined);
  readonly close = vi.fn();
  constructor() {
    FakePeer.last = this;
  }
  getTransceivers(): unknown[] {
    return [];
  }
  async createOffer(): Promise<{ type: string; sdp: string }> {
    return { type: 'offer', sdp: 'offer-sdp' };
  }
  async createAnswer(): Promise<{ type: string; sdp: string }> {
    return { type: 'answer', sdp: 'answer-sdp' };
  }
  async setLocalDescription(d: { sdp: string }): Promise<void> {
    this.localDescription = d;
  }
  async setRemoteDescription(d: { sdp: string }): Promise<void> {
    this.remoteDescription = d;
  }
  /** Browser meldet: direkte Verbindung steht */
  connect(): void {
    this.connectionState = 'connected';
    this.onconnectionstatechange?.();
  }
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('CallService', () => {
  let service: CallService;
  let socket: FakeSocket;
  let tones: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };
  let getUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal('RTCPeerConnection', FakePeer);
    vi.stubGlobal('MediaStream', FakeStream);
    getUserMedia = vi.fn(async () => new FakeStream([new FakeTrack('audio')]));
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });

    tones = { start: vi.fn(), stop: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: CallToneService, useValue: tones }] });
    service = TestBed.inject(CallService);
    socket = new FakeSocket();
    service.attach(socket as unknown as Socket);
  });

  afterEach(() => {
    service.detach();
    vi.unstubAllGlobals();
  });

  describe('Patient:in wird angerufen', () => {
    const ring = (): void => socket.receive('call:incoming', { callId: CALL_ID, callerName: 'Dr. Lena Brandt', iceServers: ICE });

    it('klingelt mit Namen der Ärztin', () => {
      ring();
      expect(service.phase()).toBe('incoming');
      expect(service.peerName()).toBe('Dr. Lena Brandt');
      expect(tones.start).toHaveBeenCalledWith('ring');
    });

    it('Ablehnen meldet es dem Server und zeigt „Anruf abgelehnt.“', () => {
      ring();
      service.decline();
      expect(socket.events('call:decline')).toEqual([{ callId: CALL_ID }]);
      expect(service.phase()).toBe('ended');
      expect(service.endMessage()).toBe('Anruf abgelehnt.');
    });

    it('hört auf zu klingeln, wenn ein anderes Gerät angenommen hat', () => {
      ring();
      socket.receive('call:ended', { callId: CALL_ID, reason: 'answered-elsewhere' });
      expect(service.phase()).toBe('idle');
      expect(tones.stop).toHaveBeenCalled();
    });

    it('Annehmen: Mikrofon, Zusage an den Server, Antwort auf das Angebot', async () => {
      ring();
      await service.accept();
      expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: expect.any(Object), video: false }));
      expect(socket.events('call:accept')).toEqual([{ callId: CALL_ID }]);
      expect(service.phase()).toBe('connecting');

      socket.receive('call:signal', { callId: CALL_ID, signal: { type: 'offer', sdp: 'offer-sdp' } });
      await flush();
      expect(FakePeer.last?.addTrack).toHaveBeenCalledOnce();
      expect(socket.events('call:signal')).toContainEqual({ callId: CALL_ID, signal: { type: 'answer', sdp: 'answer-sdp' } });

      FakePeer.last?.connect();
      expect(service.phase()).toBe('active');
    });

    it('verarbeitet ein Angebot, das im selben Paket wie die Zusage ankommt (Long-Polling)', async () => {
      ring();
      socket.ack = (event) => {
        // Server-Antwort und Angebot der Ärztin kommen gemeinsam an – das Angebot wird vor dem
        // Fortsetzen von accept() verarbeitet
        if (event === 'call:accept') socket.receive('call:signal', { callId: CALL_ID, signal: { type: 'offer', sdp: 'offer-sdp' } });
        return { ok: true };
      };
      await service.accept();
      await flush();
      expect(socket.events('call:signal')).toContainEqual({ callId: CALL_ID, signal: { type: 'answer', sdp: 'answer-sdp' } });
    });

    it('ohne Mikrofon wird der Anruf abgelehnt und erklärt', async () => {
      getUserMedia.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
      ring();
      await service.accept();
      expect(socket.events('call:decline')).toEqual([{ callId: CALL_ID }]);
      expect(service.endMessage()).toContain('Mikrofon');
    });

    it('ignoriert ein doppeltes Klingeln desselben Anrufs', () => {
      ring();
      tones.start.mockClear();
      ring();
      expect(tones.start).not.toHaveBeenCalled();
    });
  });

  describe('Ärzt:in ruft an', () => {
    it('Freizeichen, nach dem Annehmen das Angebot, danach Gespräch', async () => {
      socket.ack = () => ({ ok: true, callId: CALL_ID, iceServers: ICE, ringingInApp: true, pushed: false });
      await service.startCall(PATIENT_ID, 'Anna Müller');
      expect(socket.events('call:start')).toEqual([{ patientId: PATIENT_ID }]);
      expect(service.phase()).toBe('outgoing');
      expect(tones.start).toHaveBeenCalledWith('ringback');

      socket.receive('call:accepted', { callId: CALL_ID });
      await flush();
      expect(FakePeer.last?.addTransceiver).toHaveBeenCalledWith('video', { direction: 'sendrecv' });
      expect(socket.events('call:signal')).toContainEqual({ callId: CALL_ID, signal: { type: 'offer', sdp: 'offer-sdp' } });

      FakePeer.last?.connect();
      expect(service.phase()).toBe('active');
      socket.receive('call:ended', { callId: CALL_ID, reason: 'hangup' });
      expect(service.phase()).toBe('ended');
      expect(service.endMessage()).toMatch(/^Anruf beendet · 00:0\d$/);
    });

    it('meldet, wenn die Person nicht in der App erreichbar ist', async () => {
      socket.ack = () => ({ ok: false, error: 'UNREACHABLE' });
      await service.startCall(PATIENT_ID, 'Anna Müller');
      expect(service.phase()).toBe('ended');
      expect(service.endMessage()).toContain('Bitte per Telefon anrufen');
    });

    it('zeigt an, wenn die App geschlossen war und per Mitteilung gerufen wurde', async () => {
      socket.ack = () => ({ ok: true, callId: CALL_ID, iceServers: ICE, ringingInApp: false, pushed: true });
      await service.startCall(PATIENT_ID, 'Anna Müller');
      expect(service.ringingViaPush()).toBe(true);
    });

    it('ohne Mikrofon-Freigabe wird gar nicht erst angerufen', async () => {
      getUserMedia.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
      await service.startCall(PATIENT_ID, 'Anna Müller');
      expect(socket.events('call:start')).toEqual([]);
      expect(service.endMessage()).toContain('Mikrofon');
    });

    it('Auflegen während es klingelt informiert den Server', async () => {
      socket.ack = () => ({ ok: true, callId: CALL_ID, iceServers: ICE, ringingInApp: true, pushed: false });
      await service.startCall(PATIENT_ID, 'Anna Müller');
      service.hangup();
      expect(socket.events('call:hangup')).toEqual([{ callId: CALL_ID }]);
      expect(service.endMessage()).toBe('Anruf beendet.');
    });

    it('bricht ab, wenn die Server-Verbindung verloren geht', async () => {
      socket.ack = () => ({ ok: true, callId: CALL_ID, iceServers: ICE, ringingInApp: true, pushed: false });
      await service.startCall(PATIENT_ID, 'Anna Müller');
      socket.connected = false;
      socket.receive('disconnect');
      expect(service.phase()).toBe('ended');
      expect(service.canCall()).toBe(false);
    });
  });
});

describe('Anruf-Meldungen', () => {
  it('formatiert die Gesprächsdauer', () => {
    expect(formatCallDuration(0)).toBe('00:00');
    expect(formatCallDuration(192_000)).toBe('03:12');
    expect(formatCallDuration(3_725_000)).toBe('1:02:05');
  });

  it('formuliert je nach Seite', () => {
    expect(callEndMessage('timeout', 'caller', null)).toBe('Niemand hat abgenommen.');
    expect(callEndMessage('timeout', 'callee', null)).toBe('Verpasster Anruf.');
    expect(callEndMessage('declined', 'caller', null)).toBe('Der Anruf wurde abgelehnt.');
    expect(callEndMessage('hangup', 'callee', 65_000)).toBe('Anruf beendet · 01:05');
  });
});
