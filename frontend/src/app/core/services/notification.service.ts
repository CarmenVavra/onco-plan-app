import { Injectable, signal } from '@angular/core';

export type NotificationKind = 'error' | 'info' | 'success';

export interface AppNotification {
  id: number;
  kind: NotificationKind;
  message: string;
}

/** Globale, barrierefreie Benachrichtigungen (Toasts, aria-live). */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private nextId = 1;
  private readonly _items = signal<AppNotification[]>([]);
  readonly items = this._items.asReadonly();

  show(message: string, kind: NotificationKind = 'info', durationMs = 6000): void {
    // Gleiche Meldung nicht stapeln
    if (this._items().some((n) => n.message === message)) return;
    const id = this.nextId++;
    this._items.update((list) => [...list, { id, kind, message }].slice(-4));
    if (durationMs > 0) setTimeout(() => this.dismiss(id), durationMs);
  }

  error(message: string): void {
    this.show(message, 'error', 8000);
  }

  success(message: string): void {
    this.show(message, 'success');
  }

  dismiss(id: number): void {
    this._items.update((list) => list.filter((n) => n.id !== id));
  }
}
