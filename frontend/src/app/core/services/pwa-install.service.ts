import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

/** Chromium-Ereignis „App installieren“ (nicht im Standard-DOM-Typ enthalten) */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * - `prompt`: Chrome/Edge (v. a. Android) bietet die Installation an → zusätzlich eigener Button
 * - `ios`: Safari auf iPhone/iPad – Installation nur manuell über „Teilen → Zum Home-Bildschirm“
 * - `none`: bereits installiert oder Browser ohne Installationsmöglichkeit
 */
export type InstallMode = 'prompt' | 'ios' | 'none';

/** Nach „Später“ wird der iOS-Installationshinweis so lange nicht mehr gezeigt */
export const INSTALL_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const SNOOZE_KEY = 'oncoplan.installSnoozedUntil';

/**
 * Installation der Patienten-App auf dem Startbildschirm (PWA).
 * Wird beim App-Start erzeugt, damit `beforeinstallprompt` nicht verpasst wird.
 */
@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly deferred = signal<BeforeInstallPromptEvent | null>(null);
  private readonly installed = signal(this.isStandalone());
  private readonly snoozedUntil = signal(this.readSnooze());

  readonly mode = computed<InstallMode>(() => {
    if (this.installed()) return 'none';
    if (this.deferred()) return 'prompt';
    return this.isIosSafari() ? 'ios' : 'none';
  });

  /**
   * Eigenes Popup beim Öffnen – nur für iPhone/iPad. Chrome/Edge fragen selbst
   * (natives Installations-Popup), Safari hat keine solche Abfrage.
   */
  readonly offerPopup = computed(
    () => this.mode() === 'ios' && this.isTouchDevice() && Date.now() >= this.snoozedUntil(),
  );

  constructor() {
    this.window?.addEventListener('beforeinstallprompt', (event) => {
      // Bewusst KEIN preventDefault(): Der Browser zeigt sein eigenes Installations-Popup.
      // Das Ereignis wird nur gemerkt, damit die Karte auf der Startseite es erneut öffnen kann.
      this.deferred.set(event as BeforeInstallPromptEvent);
    });
    this.window?.addEventListener('appinstalled', () => {
      this.deferred.set(null);
      this.installed.set(true);
    });
  }

  async install(): Promise<void> {
    const event = this.deferred();
    if (!event) return;
    // Das Ereignis lässt sich nur einmal verwenden
    this.deferred.set(null);
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === 'accepted') this.installed.set(true);
    } catch {
      // Browser hat den Dialog verweigert – Button bleibt ausgeblendet, kein Fehler für Patient:innen
    }
  }

  /** „Später“: iOS-Hinweis für {@link INSTALL_SNOOZE_MS} ausblenden (Karte auf der Startseite bleibt) */
  snooze(): void {
    const until = Date.now() + INSTALL_SNOOZE_MS;
    this.snoozedUntil.set(until);
    try {
      this.window?.localStorage.setItem(SNOOZE_KEY, String(until));
    } catch {
      // Speicher blockiert (privater Modus) – gilt dann nur bis zum Neuladen
    }
  }

  private readSnooze(): number {
    try {
      return Number(this.window?.localStorage.getItem(SNOOZE_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  private isTouchDevice(): boolean {
    return Boolean(this.window?.matchMedia?.('(pointer: coarse)').matches);
  }

  private isStandalone(): boolean {
    const nav = this.window?.navigator as (Navigator & { standalone?: boolean }) | undefined;
    return Boolean(this.window?.matchMedia?.('(display-mode: standalone)').matches || nav?.standalone);
  }

  private isIosSafari(): boolean {
    const nav = this.window?.navigator;
    if (!nav) return false;
    const ios = /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
    // Andere iOS-Browser (Chrome, Firefox …) kennzeichnen sich mit CriOS/FxiOS/EdgiOS
    return ios && !/CriOS|FxiOS|EdgiOS/.test(nav.userAgent);
  }
}
