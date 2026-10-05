import type { Server } from 'socket.io';
import type { TriageAlert } from '@prisma/client';

/** Raumname eines Arztes – Alarme gehen ausschließlich an diesen Raum (Datenisolation). */
export const doctorRoom = (doctorId: string): string => `doctor_${doctorId}`;

/** Server→Client-Events, die das Dashboard versteht. */
export interface ServerToClientEvents {
  'new-triage-alert': (payload: { alertId: string; patientId: string; level: TriageAlert['level'] }) => void;
  'triage-alert-updated': (payload: { alertId: string; patientId: string; status: TriageAlert['status'] }) => void;
  'patient-updated': (payload: { patientId: string }) => void;
}

/**
 * Abstraktion über Socket.io, damit die TriageEngine ohne Netzwerk testbar bleibt.
 * Es werden bewusst nur IDs gesendet – Gesundheitsdaten lädt der Client
 * anschließend authentifiziert per REST (Minimierung der Datenflüsse).
 */
export interface AlertNotifier {
  newAlert(doctorId: string, alert: TriageAlert): void;
  alertUpdated(doctorId: string, alert: TriageAlert): void;
  patientUpdated(doctorId: string, patientId: string): void;
}

export class SocketAlertNotifier implements AlertNotifier {
  constructor(private readonly io: Server<Record<string, never>, ServerToClientEvents>) {}

  newAlert(doctorId: string, alert: TriageAlert): void {
    this.io.to(doctorRoom(doctorId)).emit('new-triage-alert', {
      alertId: alert.id,
      patientId: alert.patientId,
      level: alert.level,
    });
  }

  alertUpdated(doctorId: string, alert: TriageAlert): void {
    this.io.to(doctorRoom(doctorId)).emit('triage-alert-updated', {
      alertId: alert.id,
      patientId: alert.patientId,
      status: alert.status,
    });
  }

  patientUpdated(doctorId: string, patientId: string): void {
    this.io.to(doctorRoom(doctorId)).emit('patient-updated', { patientId });
  }
}
