import { Injectable } from '@angular/core';
import type { AlertLevel } from '../../core/models/api.models';

/**
 * Akustisches Alarmsignal per WebAudio (keine Audiodateien nötig).
 * Browser erlauben Ton erst nach einer Nutzerinteraktion – `unlock()` beim Klick aufrufen.
 */
@Injectable()
export class AlarmSoundService {
  private ctx: AudioContext | null = null;

  unlock(): void {
    try {
      this.ctx ??= new AudioContext();
      void this.ctx.resume();
    } catch {
      this.ctx = null; // WebAudio nicht verfügbar
    }
  }

  play(level: AlertLevel): void {
    this.unlock();
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;

    // ROT: drei hohe Töne, GELB: zwei tiefere Töne
    const pattern = level === 'RED' ? { freq: 880, count: 3 } : { freq: 620, count: 2 };
    for (let i = 0; i < pattern.count; i++) {
      const start = ctx.currentTime + i * 0.28;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = pattern.freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.22);
    }
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
