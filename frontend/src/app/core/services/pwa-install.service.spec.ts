import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaInstallService } from './pwa-install.service';

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
});
