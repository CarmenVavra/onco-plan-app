import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INSTALL_SNOOZE_MS, PwaInstallService } from './pwa-install.service';

/** Nachbildung des Chromium-Ereignisses `beforeinstallprompt` */
function installPrompt(outcome: 'accepted' | 'dismissed') {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(async () => undefined),
    userChoice: Promise.resolve({ outcome }),
  });
  window.dispatchEvent(event);
  return event;
}

describe('PwaInstallService', () => {
  let service: PwaInstallService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    service = TestBed.inject(PwaInstallService);
  });

  it('zeigt ohne Angebot des Browsers keinen Installations-Button', () => {
    expect(service.mode()).toBe('none');
  });

  it('übernimmt das Installationsangebot und unterdrückt die Browser-Leiste', () => {
    const event = installPrompt('accepted');
    expect(event.defaultPrevented).toBe(true);
    expect(service.mode()).toBe('prompt');
  });

  it('öffnet den Browser-Dialog und blendet den Button danach aus', async () => {
    const event = installPrompt('accepted');
    await service.install();
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(service.mode()).toBe('none');
  });

  it('nach Ablehnung kein erneuter Aufruf mit demselben (verbrauchten) Ereignis', async () => {
    const event = installPrompt('dismissed');
    await service.install();
    await service.install();
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(service.mode()).toBe('none');
  });

  it('gilt nach "appinstalled" als installiert', () => {
    installPrompt('accepted');
    window.dispatchEvent(new Event('appinstalled'));
    expect(service.mode()).toBe('none');
  });

  describe('Popup beim Öffnen', () => {
    /** Smartphone simulieren: (pointer: coarse) */
    function touchDevice(touch: boolean): PwaInstallService {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: touch && query === '(pointer: coarse)' }) as MediaQueryList);
      TestBed.resetTestingModule();
      return TestBed.inject(PwaInstallService);
    }
    afterEach(() => vi.unstubAllGlobals());

    it('fragt auf dem Smartphone, sobald der Browser die Installation anbietet', () => {
      const s = touchDevice(true);
      expect(s.offerPopup()).toBe(false);
      installPrompt('accepted');
      expect(s.offerPopup()).toBe(true);
    });

    it('fragt nicht am Desktop – dort bleibt nur die Karte auf der Startseite', () => {
      const s = touchDevice(false);
      installPrompt('accepted');
      expect(s.mode()).toBe('prompt');
      expect(s.offerPopup()).toBe(false);
    });

    it('„Später“ blendet das Popup für 7 Tage aus, auch nach Neuladen', () => {
      const s = touchDevice(true);
      installPrompt('accepted');
      s.snooze();
      expect(s.offerPopup()).toBe(false);
      expect(Number(localStorage.getItem('oncoplan.installSnoozedUntil')) - Date.now()).toBeGreaterThan(INSTALL_SNOOZE_MS - 1000);

      const reloaded = touchDevice(true);
      installPrompt('accepted');
      expect(reloaded.offerPopup()).toBe(false);
      expect(reloaded.mode()).toBe('prompt');
    });
  });
});
