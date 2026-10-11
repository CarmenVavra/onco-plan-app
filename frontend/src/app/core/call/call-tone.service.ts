import { Injectable } from '@angular/core';

type Tone = 'ring' | 'ringback';

/**
 * Klingel- und Freizeichen per WebAudio (keine Audiodateien nötig).
 * - `ring`: Klingeln beim Angerufenen (zwei Töne, alle 3 s) plus Vibration
 * - `ringback`: Freizeichen bei der anrufenden Person (425 Hz, 1 s Ton / 4 s Pause)
 * Browser spielen Ton erst nach einer Nutzerinteraktion – ohne bleibt es still (Vibration/Bild genügen).
 */
@Injectable({ providedIn: 'root' })
export class CallToneService {
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  start(tone: Tone): void {
    this.stop();
    const play = (): void => (tone === 'ring' ? this.ring() : this.ringback());
    play();
    this.timer = setInterval(play, tone === 'ring' ? 3000 : 4000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    vibrate(0);
  }

  private ring(): void {
    vibrate([400, 200, 400]);
    [480, 620].forEach((freq, i) => this.beep(freq, i * 0.45, 0.4, 0.14));
  }

  private ringback(): void {
    this.beep(425, 0, 1, 0.06);
  }

  private beep(freq: number, offset: number, duration: number, volume: number): void {
    const ctx = this.context();
    if (!ctx) return;
    const start = ctx.currentTime + offset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.03);
    gain.gain.setValueAtTime(volume, start + duration - 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private context(): AudioContext | null {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx.state === 'running' ? this.ctx : null;
    } catch {
      return null; // WebAudio nicht verfügbar
    }
  }
}

/** Browser vibrieren erst nach einer Berührung der Seite (sonst Konsolenfehler) */
function vibrate(pattern: number | number[]): void {
  try {
    if (navigator.userActivation?.hasBeenActive === false) return;
    navigator.vibrate?.(pattern);
  } catch {
    // Vibration nicht verfügbar
  }
}
