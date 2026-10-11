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

  it('lässt das Installations-Popup des Browsers zu und merkt sich das Angebot für die Karte', () => {
    const event = installPrompt('accepted');
    expect(event.defaultPrevented).toBe(false);
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

  describe('eigenes Popup beim Öffnen (nur iPhone/iPad)', () => {
    const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
    const ANDROID = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36';

    function device(userAgent: string): PwaInstallService {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)' }) as MediaQueryList);
      vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent);
      TestBed.resetTestingModule();
      return TestBed.inject(PwaInstallService);
    }
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('Android/Chrome: kein eigenes Popup – der Browser fragt selbst', () => {
      const s = device(ANDROID);
      installPrompt('accepted');
      expect(s.mode()).toBe('prompt');
      expect(s.offerPopup()).toBe(false);
    });

    it('iPhone/Safari: Popup mit Anleitung „Zum Home-Bildschirm“', () => {
      const s = device(IPHONE);
      expect(s.mode()).toBe('ios');
      expect(s.offerPopup()).toBe(true);
    });

    it('„Verstanden“ blendet den Hinweis für 7 Tage aus, auch nach Neuladen', () => {
      device(IPHONE).snooze();
      expect(Number(localStorage.getItem('oncoplan.installSnoozedUntil')) - Date.now()).toBeGreaterThan(INSTALL_SNOOZE_MS - 1000);
      const reloaded = device(IPHONE);
      expect(reloaded.mode()).toBe('ios');
      expect(reloaded.offerPopup()).toBe(false);
    });
  });
});
