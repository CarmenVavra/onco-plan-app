import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

/** Chromium-Ereignis „App installieren“ (nicht im Standard-DOM-Typ enthalten) */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * - `prompt`: Chrome/Edge (v. a. Android) bietet die Installation an → eigener Button
 * - `ios`: Safari auf iPhone/iPad – Installation nur manuell über „Teilen → Zum Home-Bildschirm“
 * - `none`: bereits installiert oder Browser ohne Installationsmöglichkeit
 */
export type InstallMode = 'prompt' | 'ios' | 'none';

/**
 * Installation der Patienten-App auf dem Startbildschirm (PWA).
 * Wird beim App-Start erzeugt, damit `beforeinstallprompt` nicht verpasst wird.
 */
@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly deferred = signal<BeforeInstallPromptEvent | null>(null);
  private readonly installed = signal(this.isStandalone());

  readonly mode = computed<InstallMode>(() => {
    if (this.installed()) return 'none';
    if (this.deferred()) return 'prompt';
    return this.isIosSafari() ? 'ios' : 'none';
  });

  constructor() {
    this.window?.addEventListener('beforeinstallprompt', (event) => {
      // Eigenen Button anzeigen statt der kurzlebigen Browser-Leiste
      event.preventDefault();
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
