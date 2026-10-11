import { Injectable, inject, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom, take } from 'rxjs';
import { PatientApiService } from './patient-api.service';

/**
 * - `unavailable`: kein Service Worker (z. B. Entwicklungsserver), Browser ohne Push oder Push serverseitig aus
 * - `denied`: Mitteilungen im Browser blockiert
 * - `off` / `on`: Erinnerungen auf diesem Gerät aus / an
 */
export type PushState = 'loading' | 'unavailable' | 'denied' | 'off' | 'on';

/**
 * Terminerinnerungen als Mitteilung (Web-Push über den Angular-Service-Worker).
 * Das Abo gilt pro Gerät; beim Abmelden wird es entfernt.
 */
@Injectable({ providedIn: 'root' })
export class PatientPushService {
  private readonly swPush = inject(SwPush);
  private readonly api = inject(PatientApiService);

  private readonly _state = signal<PushState>('loading');
  readonly state = this._state.asReadonly();
  readonly busy = signal(false);
  private publicKey: string | null = null;

  async init(): Promise<void> {
    if (!this.swPush.isEnabled || typeof Notification === 'undefined') {
      this._state.set('unavailable');
      return;
    }
    try {
      this.publicKey = (await this.api.pushConfig()).publicKey;
    } catch {
      this.publicKey = null;
    }
    if (!this.publicKey) {
      this._state.set('unavailable');
      return;
    }
    if (Notification.permission === 'denied') {
      this._state.set('denied');
      return;
    }
    const subscription = await this.currentSubscription();
    if (subscription) {
      // Abo erneut melden – z. B. nach einem Neuaufsetzen der Datenbank oder Kontowechsel am Gerät
      void this.api.savePushSubscription(subscription.toJSON()).catch(() => undefined);
    }
    this._state.set(subscription ? 'on' : 'off');
  }

  /** Muss aus einer Nutzeraktion heraus aufgerufen werden (Berechtigungsabfrage des Browsers). */
  async enable(): Promise<void> {
    if (!this.publicKey) return;
    this.busy.set(true);
    try {
      const subscription = await this.swPush.requestSubscription({ serverPublicKey: this.publicKey });
      await this.api.savePushSubscription(subscription.toJSON());
      this._state.set('on');
    } catch {
      this._state.set(Notification.permission === 'denied' ? 'denied' : 'off');
    } finally {
      this.busy.set(false);
    }
  }

  async disable(): Promise<void> {
    this.busy.set(true);
    try {
      await this.removeFromThisDevice();
      this._state.set('off');
    } finally {
      this.busy.set(false);
    }
  }

  /** Beim Abmelden: Gerät soll keine Erinnerungen für dieses Konto mehr erhalten. */
  async removeFromThisDevice(): Promise<void> {
    const subscription = await this.currentSubscription();
    if (!subscription) return;
    await this.api.deletePushSubscription(subscription.endpoint).catch(() => undefined);
    await this.swPush.unsubscribe().catch(() => undefined);
  }

  private async currentSubscription(): Promise<PushSubscription | null> {
    if (!this.swPush.isEnabled) return null;
    try {
      return await firstValueFrom(this.swPush.subscription.pipe(take(1)));
    } catch {
      return null;
    }
  }
}
