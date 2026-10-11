import { Injectable, computed, inject, signal } from '@angular/core';
import type { Socket } from 'socket.io-client';
import { NotificationService } from '../services/notification.service';
import { type CallEndCause, type CallEndReason, type CallRole, type CallStartError, callEndMessage } from './call-messages';
import { CallToneService } from './call-tone.service';

/**
 * - `outgoing`: Ärzt:in ruft an, es klingelt bei der Patientin / dem Patienten
 * - `incoming`: Patient:in wird angerufen (Annehmen/Ablehnen)
 * - `connecting`: angenommen, Geräte bauen die direkte Verbindung auf
 * - `active`: Gespräch läuft
 * - `ended`: kurze Abschlussmeldung, danach wieder `idle`
 */
export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended';

interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

type CallSignal =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'candidate'; candidate: RTCIceCandidateInit };

type StartResult =
  | { ok: true; callId: string; iceServers: IceServer[]; ringingInApp: boolean; pushed: boolean }
  | { ok: false; error: CallStartError };

/** Antwortzeit des Servers auf Start/Annehmen */
const ACK_TIMEOUT_MS = 15_000;
/** Kommt nach dem Annehmen keine direkte Verbindung zustande, wird abgebrochen */
const CONNECT_TIMEOUT_MS = 30_000;
/** So lange bleibt die Abschlussmeldung sichtbar */
const ENDED_VISIBLE_MS = 5_000;

const MICROPHONE: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

/**
 * In-App-Anrufe zwischen Ärzt:in und Patient:in über WebRTC.
 * Ton und Bild gehen direkt von Gerät zu Gerät (DTLS-SRTP-verschlüsselt); über Socket.io
 * laufen nur die Nachrichten zum Verbindungsaufbau. Anrufe starten als Sprachanruf,
 * die Kamera lässt sich jederzeit zuschalten (ohne Neuverhandlung über `replaceTrack`).
 *
 * Die Socket-Verbindung kommt vom jeweiligen Bereich (`attach`): im Dashboard die
 * Live-Verbindung der Ampelliste, in der Patienten-App eine eigene.
 */
@Injectable({ providedIn: 'root' })
export class CallService {
  private readonly tones = inject(CallToneService);
  private readonly notifications = inject(NotificationService);

  private readonly _phase = signal<CallPhase>('idle');
  private readonly _role = signal<CallRole>('caller');
  private readonly _peerName = signal('');
  private readonly _endMessage = signal('');
  private readonly _muted = signal(false);
  private readonly _cameraOn = signal(false);
  private readonly _facing = signal<'user' | 'environment'>('user');
  private readonly _remoteVideo = signal(false);
  private readonly _connectedAt = signal<number | null>(null);
  private readonly _ringingViaPush = signal(false);
  private readonly _remoteStream = signal<MediaStream | null>(null);
  private readonly _localPreview = signal<MediaStream | null>(null);
  private readonly _socketConnected = signal(false);

  readonly phase = this._phase.asReadonly();
  readonly role = this._role.asReadonly();
  readonly peerName = this._peerName.asReadonly();
  readonly endMessage = this._endMessage.asReadonly();
  readonly muted = this._muted.asReadonly();
  readonly cameraOn = this._cameraOn.asReadonly();
  readonly facing = this._facing.asReadonly();
  /** Gegenstelle hat die Kamera eingeschaltet */
  readonly remoteVideo = this._remoteVideo.asReadonly();
  readonly connectedAt = this._connectedAt.asReadonly();
  /** App der Patient:in war geschlossen – sie wurde per Mitteilung gerufen */
  readonly ringingViaPush = this._ringingViaPush.asReadonly();
  readonly remoteStream = this._remoteStream.asReadonly();
  readonly localPreview = this._localPreview.asReadonly();
  /** Gerät und Browser können überhaupt In-App-Anrufe führen */
  readonly supported = typeof RTCPeerConnection !== 'undefined' && !!globalThis.navigator?.mediaDevices?.getUserMedia;
  /** Anrufen möglich: Verbindung steht und kein anderer Anruf läuft */
  readonly canCall = computed(() => this.supported && this._socketConnected() && !this.busy());
  readonly busy = computed(() => {
    const p = this._phase();
    return p !== 'idle' && p !== 'ended';
  });

  private socket: Socket | null = null;
  private callId: string | null = null;
  private iceServers: IceServer[] = [];
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  /** Socket.io übergibt Event-Daten untypisiert – die Typen hier spiegeln backend/src/services/CallService.ts */
  private readonly listeners: Record<string, (payload: never) => void> = {
    connect: () => this._socketConnected.set(true),
    disconnect: () => this.onSocketLost(),
    'call:incoming': (e: { callId: string; callerName: string; iceServers: IceServer[] }) => this.onIncoming(e),
    'call:accepted': (e: { callId: string }) => void this.onAccepted(e.callId),
    'call:signal': (e: { callId: string; signal: CallSignal }) => void this.onSignal(e.callId, e.signal),
    'call:media': (e: { callId: string; video: boolean }) => {
      if (e.callId === this.callId) this._remoteVideo.set(e.video === true);
    },
    'call:ended': (e: { callId: string; reason: CallEndReason }) => this.onEnded(e.callId, e.reason),
  };

  constructor() {
    // Seite wird geschlossen/neu geladen → Gegenstelle nicht warten lassen
    globalThis.addEventListener?.('pagehide', () => this.hangup());
  }

  attach(socket: Socket): void {
    if (this.socket === socket) return;
    this.detach();
    this.socket = socket;
    for (const [event, fn] of Object.entries(this.listeners)) socket.on(event, fn as (...args: unknown[]) => void);
    this._socketConnected.set(socket.connected);
  }

  /** Bereich wird verlassen (Abmelden): laufenden Anruf beenden, Ereignisse abmelden. */
  detach(): void {
    const socket = this.socket;
    if (!socket) return;
    this.hangup();
    for (const [event, fn] of Object.entries(this.listeners)) socket.off(event, fn as (...args: unknown[]) => void);
    this.socket = null;
    this._socketConnected.set(false);
  }

  // ── Ärzt:in ─────────────────────────────────────────────────────────

  /** Muss aus einem Klick heraus aufgerufen werden (Mikrofon-Freigabe, Ton). */
  async startCall(patientId: string, patientName: string): Promise<void> {
    if (this.busy() || !this.supported) return;
    this.reset('caller', patientName);
    const socket = this.socket;
    if (!socket?.connected) {
      this.finish('no-connection');
      return;
    }
    this._phase.set('outgoing');
    if (!(await this.openMicrophone())) {
      this.finish('no-microphone');
      return;
    }
    if (this._phase() !== 'outgoing') return; // während der Mikrofon-Abfrage aufgelegt

    let result: StartResult;
    try {
      result = (await socket.timeout(ACK_TIMEOUT_MS).emitWithAck('call:start', { patientId })) as StartResult;
    } catch {
      if (this._phase() === 'outgoing') this.finish('no-connection');
      return;
    }
    if (this._phase() !== 'outgoing') {
      // Schon wieder aufgelegt, bevor der Server geantwortet hat
      if (result.ok) socket.emit('call:hangup', { callId: result.callId });
      return;
    }
    if (!result.ok) {
      this.finish(result.error);
      return;
    }
    this.callId = result.callId;
    this.iceServers = result.iceServers;
    this._ringingViaPush.set(!result.ringingInApp);
    this.tones.start('ringback');
  }

  private async onAccepted(callId: string): Promise<void> {
    if (callId !== this.callId || this._phase() !== 'outgoing' || !this.localStream) return;
    this.tones.stop();
    this._phase.set('connecting');
    this.armConnectTimer();
    try {
      const pc = this.createPeer();
      for (const track of this.localStream.getAudioTracks()) pc.addTrack(track, this.localStream);
      // Video-Kanal von Anfang an aushandeln – die Kamera wird später nur eingesteckt
      pc.addTransceiver('video', { direction: 'sendrecv' });
      await pc.setLocalDescription(await pc.createOffer());
      this.sendSignal({ type: 'offer', sdp: pc.localDescription?.sdp ?? '' });
    } catch {
      this.hangup('failed');
    }
  }

  // ── Patient:in ──────────────────────────────────────────────────────

  private onIncoming(e: { callId: string; callerName: string; iceServers: IceServer[] }): void {
    if (e.callId === this.callId || this.busy()) return; // doppeltes Klingeln (weiteres Gerät/Neuverbindung)
    this.reset('callee', e.callerName);
    this.callId = e.callId;
    this.iceServers = e.iceServers;
    this._phase.set('incoming');
    this.tones.start('ring');
  }

  async accept(): Promise<void> {
    const callId = this.callId;
    const socket = this.socket;
    if (this._phase() !== 'incoming' || !callId || !socket) return;
    this.tones.stop();
    this._phase.set('connecting');
    if (!(await this.openMicrophone())) {
      socket.emit('call:decline', { callId });
      this.finish('no-microphone');
      return;
    }
    if (this.callId !== callId || this._phase() !== 'connecting') return; // inzwischen aufgelegt

    // Verbindung VOR der Zusage anlegen: Über Long-Polling kommt das Angebot der Ärzt:in
    // oft im selben Paket wie die Server-Antwort an und würde sonst verworfen.
    try {
      this.createPeer();
    } catch {
      socket.emit('call:decline', { callId });
      this.finish('failed');
      return;
    }

    let result: { ok: boolean };
    try {
      result = (await socket.timeout(ACK_TIMEOUT_MS).emitWithAck('call:accept', { callId })) as { ok: boolean };
    } catch {
      if (this.callId === callId) this.finish('no-connection');
      return;
    }
    if (this.callId !== callId) return;
    if (!result.ok) {
      this.finish('hangup');
      return;
    }
    this.armConnectTimer();
  }

  decline(): void {
    if (this._phase() !== 'incoming' || !this.callId) return;
    this.socket?.emit('call:decline', { callId: this.callId });
    this.finish('declined');
  }

  // ── Beide Seiten ───────────────────────────────────────────────────

  hangup(cause: CallEndCause = 'self'): void {
    const phase = this._phase();
    if (phase === 'idle' || phase === 'ended') return;
    if (phase === 'incoming') {
      this.decline();
      return;
    }
    if (this.callId) this.socket?.emit('call:hangup', { callId: this.callId });
    this.finish(cause);
  }

  toggleMute(): void {
    const muted = !this._muted();
    for (const track of this.localStream?.getAudioTracks() ?? []) track.enabled = !muted;
    this._muted.set(muted);
  }

  async toggleCamera(): Promise<void> {
    const transceiver = this.videoTransceiver();
    if (!transceiver || !this.callId) return;
    if (this._cameraOn()) {
      this.stopCamera(transceiver);
      this.socket?.emit('call:media', { callId: this.callId, video: false });
      return;
    }
    const track = await this.openCamera(this._facing());
    if (!track) return;
    if (!this.pc || this.videoTransceiver() !== transceiver) {
      track.stop(); // Anruf inzwischen beendet
      return;
    }
    await transceiver.sender.replaceTrack(track);
    this._localPreview.set(new MediaStream([track]));
    this._cameraOn.set(true);
    this.socket?.emit('call:media', { callId: this.callId, video: true });
  }

  /** Vorder-/Rückkamera – z. B. um eine Hautstelle zu zeigen */
  async switchCamera(): Promise<void> {
    const transceiver = this.videoTransceiver();
    if (!transceiver || !this._cameraOn()) return;
    const facing = this._facing() === 'user' ? 'environment' : 'user';
    const track = await this.openCamera(facing);
    if (!track) return;
    const old = transceiver.sender.track;
    await transceiver.sender.replaceTrack(track);
    old?.stop();
    this._facing.set(facing);
    this._localPreview.set(new MediaStream([track]));
  }

  /** Abschlussmeldung schließen */
  dismiss(): void {
    if (this._phase() !== 'ended') return;
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.dismissTimer = null;
    this._phase.set('idle');
  }

  // ── WebRTC ─────────────────────────────────────────────────────────

  private createPeer(): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pc = pc;
    this._remoteStream.set(new MediaStream());
    pc.onicecandidate = (e) => {
      if (e.candidate) this.sendSignal({ type: 'candidate', candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      // Neues Stream-Objekt, damit die Signal-Abhängigen (Audio-/Video-Element) aktualisieren
      const tracks = this._remoteStream()?.getTracks() ?? [];
      if (!tracks.includes(e.track)) this._remoteStream.set(new MediaStream([...tracks, e.track]));
    };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      if (pc.connectionState === 'connected') {
        this.clearConnectTimer();
        if (this._connectedAt() === null) this._connectedAt.set(Date.now());
        this._phase.set('active');
      } else if (pc.connectionState === 'failed') {
        this.hangup(this._connectedAt() === null ? 'failed' : 'disconnected');
      }
    };
    return pc;
  }

  private async onSignal(callId: string, signal: CallSignal): Promise<void> {
    const pc = this.pc;
    if (callId !== this.callId || !pc) return;
    try {
      if (signal.type === 'offer') {
        await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
        const stream = this.localStream;
        if (stream) for (const track of stream.getAudioTracks()) pc.addTrack(track, stream);
        const video = this.videoTransceiver();
        if (video) video.direction = 'sendrecv';
        await pc.setLocalDescription(await pc.createAnswer());
        this.sendSignal({ type: 'answer', sdp: pc.localDescription?.sdp ?? '' });
        await this.flushCandidates(pc);
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
        await this.flushCandidates(pc);
      } else if (pc.remoteDescription) {
        await pc.addIceCandidate(signal.candidate);
      } else {
        // Kandidaten können vor dem Angebot/der Antwort eintreffen
        this.pendingCandidates.push(signal.candidate);
      }
    } catch {
      if (this.pc === pc) this.hangup('failed');
    }
  }

  private async flushCandidates(pc: RTCPeerConnection): Promise<void> {
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of queued) await pc.addIceCandidate(candidate).catch(() => undefined);
  }

  private sendSignal(signal: CallSignal): void {
    if (this.callId) this.socket?.emit('call:signal', { callId: this.callId, signal });
  }

  private videoTransceiver(): RTCRtpTransceiver | undefined {
    return this.pc?.getTransceivers().find((t) => t.receiver.track.kind === 'video');
  }

  // ── Geräte ─────────────────────────────────────────────────────────

  private async openMicrophone(): Promise<boolean> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: MICROPHONE, video: false });
      return true;
    } catch {
      return false;
    }
  }

  private async openCamera(facing: 'user' | 'environment'): Promise<MediaStreamTrack | null> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } },
      });
      return stream.getVideoTracks()[0] ?? null;
    } catch {
      this.notifications.error('Kein Zugriff auf die Kamera. Bitte im Browser erlauben.');
      return null;
    }
  }

  private stopCamera(transceiver: RTCRtpTransceiver | undefined): void {
    const track = transceiver?.sender.track;
    void transceiver?.sender.replaceTrack(null).catch(() => undefined);
    track?.stop();
    this._localPreview()
      ?.getTracks()
      .forEach((t) => t.stop());
    this._localPreview.set(null);
    this._cameraOn.set(false);
  }

  // ── Ablauf ─────────────────────────────────────────────────────────

  private onEnded(callId: string, reason: CallEndReason): void {
    if (callId !== this.callId) return;
    if (reason === 'answered-elsewhere') {
      // Gilt nur für Geräte, die noch klingeln – nicht für das annehmende
      if (this._phase() === 'incoming') {
        this.cleanup();
        this._phase.set('idle');
      }
      return;
    }
    this.finish(reason);
  }

  private onSocketLost(): void {
    this._socketConnected.set(false);
    // Der Server beendet den Anruf ebenfalls; ein Auflegen-Event käme nicht mehr an
    if (this.busy()) this.finish(this._connectedAt() === null ? 'no-connection' : 'disconnected');
  }

  private reset(role: CallRole, peerName: string): void {
    this.cleanup();
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.dismissTimer = null;
    this._role.set(role);
    this._peerName.set(peerName);
    this._endMessage.set('');
    this._connectedAt.set(null);
    this._ringingViaPush.set(false);
  }

  private finish(cause: CallEndCause): void {
    const connectedAt = this._connectedAt();
    this.cleanup();
    this._endMessage.set(callEndMessage(cause, this._role(), connectedAt === null ? null : Date.now() - connectedAt));
    this._phase.set('ended');
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.dismissTimer = setTimeout(() => this.dismiss(), ENDED_VISIBLE_MS);
  }

  private cleanup(): void {
    this.tones.stop();
    this.clearConnectTimer();
    this.stopCamera(this.videoTransceiver());
    const pc = this.pc;
    this.pc = null;
    pc?.close();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this._remoteStream.set(null);
    this._remoteVideo.set(false);
    this._muted.set(false);
    this._facing.set('user');
    this.pendingCandidates = [];
    this.callId = null;
  }

  private armConnectTimer(): void {
    this.clearConnectTimer();
    this.connectTimer = setTimeout(() => {
      if (this._phase() === 'connecting') this.hangup('failed');
    }, CONNECT_TIMEOUT_MS);
  }

  private clearConnectTimer(): void {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }
}
