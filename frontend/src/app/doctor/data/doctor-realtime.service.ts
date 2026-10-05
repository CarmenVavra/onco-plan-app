import { Injectable, inject, signal } from '@angular/core';
import { type Socket, io } from 'socket.io-client';
import type { AlertLevel, AlertStatus } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

export interface RealtimeHandlers {
  newAlert(event: { alertId: string; patientId: string; level: AlertLevel }): void;
  alertUpdated(event: { alertId: string; patientId: string; status: AlertStatus }): void;
  patientUpdated(event: { patientId: string }): void;
}

/**
 * Socket.io-Verbindung des Dashboards. Authentifizierung über das HTTP-Only-Cookie;
 * der Server ordnet die Verbindung automatisch dem Raum "doctor_{id}" zu.
 * Events enthalten nur IDs – Daten werden danach per REST nachgeladen.
 */
@Injectable()
export class DoctorRealtimeService {
  private readonly auth = inject(AuthService);
  private socket: Socket | null = null;

  readonly state = signal<ConnectionState>('disconnected');

  connect(handlers: RealtimeHandlers): void {
    if (this.socket) return;
    this.state.set('connecting');
    const socket = io({ withCredentials: true, reconnectionDelayMax: 10_000 });
    this.socket = socket;

    socket.on('connect', () => this.state.set('connected'));
    socket.on('disconnect', () => this.state.set('disconnected'));
    socket.io.on('reconnect_attempt', () => this.state.set('connecting'));
    socket.on('connect_error', (err: Error) => {
      this.state.set('disconnected');
      if (err.message === 'UNAUTHORIZED' || err.message === 'FORBIDDEN') {
        socket.disconnect();
        this.auth.handleSessionExpired();
      }
    });

    socket.on('new-triage-alert', handlers.newAlert);
    socket.on('triage-alert-updated', handlers.alertUpdated);
    socket.on('patient-updated', handlers.patientUpdated);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.state.set('disconnected');
  }
}
