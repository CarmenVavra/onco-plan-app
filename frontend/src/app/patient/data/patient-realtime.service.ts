import { DestroyRef, Injectable, inject } from '@angular/core';
import { io } from 'socket.io-client';
import { CallService } from '../../core/call/call.service';
import { AuthService } from '../../core/services/auth.service';

/**
 * Live-Verbindung der Patienten-App – nur, damit Anrufe des Behandlungsteams
 * hier klingeln können. Der Server ordnet sie dem Raum "patient_{id}" zu;
 * Gesundheitsdaten laufen weiterhin ausschließlich über REST.
 * Lebt so lange wie der Patientenbereich (Bereitstellung in der PatientShell).
 */
@Injectable()
export class PatientRealtimeService {
  private readonly auth = inject(AuthService);
  private readonly calls = inject(CallService);

  constructor() {
    const socket = io({ withCredentials: true, reconnectionDelayMax: 10_000 });
    this.calls.attach(socket);
    socket.on('connect_error', (err: Error) => {
      if (err.message === 'UNAUTHORIZED' || err.message === 'FORBIDDEN') {
        socket.disconnect();
        this.auth.handleSessionExpired();
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.calls.detach();
      socket.disconnect();
    });
  }
}
