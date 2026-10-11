import { ChangeDetectionStrategy, Component, type ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { LucideMic, LucideMicOff, LucidePhone, LucidePhoneOff, LucideSwitchCamera, LucideVideo, LucideVideoOff } from '@lucide/angular';
import { CallService } from '../../core/call/call.service';
import { formatCallDuration } from '../../core/call/call-messages';

/**
 * Anruf-Fenster für beide Seiten:
 * - Patient:in: bildschirmfüllend (modal) – eingehender Anruf mit Annehmen/Ablehnen
 * - Ärzt:in: schwebende Karte unten rechts, das Dashboard bleibt während des Gesprächs bedienbar
 */
@Component({
  selector: 'app-call-overlay',
  imports: [LucidePhone, LucidePhoneOff, LucideMic, LucideMicOff, LucideVideo, LucideVideoOff, LucideSwitchCamera],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './call-overlay.component.html',
  styleUrl: './call-overlay.component.css',
})
export class CallOverlayComponent {
  protected readonly call = inject(CallService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly remoteAudio = viewChild.required<ElementRef<HTMLAudioElement>>('remoteAudio');
  private readonly remoteVideo = viewChild.required<ElementRef<HTMLVideoElement>>('remoteVideo');
  private readonly localVideo = viewChild.required<ElementRef<HTMLVideoElement>>('localVideo');
  private readonly now = signal(Date.now());

  protected readonly phase = this.call.phase;
  protected readonly floating = computed(() => this.call.role() === 'caller');
  protected readonly showStage = computed(() => this.phase() === 'active' && (this.call.remoteVideo() || this.call.cameraOn()));
  protected readonly ringing = computed(() => this.phase() === 'incoming' || this.phase() === 'outgoing');

  protected readonly kicker = computed(() => {
    switch (this.phase()) {
      case 'incoming':
        return 'Eingehender Anruf · OncoPlan';
      case 'outgoing':
        return 'Anruf über OncoPlan';
      case 'connecting':
        return 'Verbinde';
      case 'active':
        return 'Im Gespräch';
      default:
        return 'Anruf';
    }
  });

  protected readonly statusText = computed(() => {
    switch (this.phase()) {
      case 'incoming':
        return 'ruft Sie an';
      case 'outgoing':
        return this.call.ringingViaPush() ? 'Klingelt … Die App war geschlossen, eine Mitteilung wurde gesendet.' : 'Klingelt …';
      case 'connecting':
        return 'Verbindung wird aufgebaut …';
      case 'active': {
        const since = this.call.connectedAt();
        return since === null ? '' : formatCallDuration(this.now() - since);
      }
      case 'ended':
        return this.call.endMessage();
      default:
        return '';
    }
  });

  constructor() {
    // Fenster öffnen/schließen: modal für Patient:innen, schwebend (nicht-modal) für Ärzt:innen
    let openedModal = false;
    effect(() => {
      const dialog = this.dialog().nativeElement;
      const visible = this.phase() !== 'idle';
      const modal = !this.floating();
      if (dialog.open && (!visible || openedModal !== modal)) dialog.close();
      if (visible && !dialog.open) {
        if (modal) dialog.showModal();
        else dialog.show();
        openedModal = modal;
      }
    });

    // Medienströme an die Elemente hängen (srcObject ist kein bindbares Attribut)
    effect(() => {
      const stream = this.call.remoteStream();
      attach(this.remoteAudio().nativeElement, stream);
      attach(this.remoteVideo().nativeElement, stream);
    });
    effect(() => attach(this.localVideo().nativeElement, this.call.localPreview()));

    // Gesprächsdauer sekündlich aktualisieren – nur während des Gesprächs
    effect((onCleanup) => {
      if (this.phase() !== 'active') return;
      this.now.set(Date.now());
      const tick = setInterval(() => this.now.set(Date.now()), 1000);
      onCleanup(() => clearInterval(tick));
    });
  }

  protected accept(): void {
    void this.call.accept();
  }

  /** Escape schließt nur die Abschlussmeldung – ein laufender Anruf endet nie versehentlich. */
  protected onCancel(event: Event): void {
    event.preventDefault();
    if (this.phase() === 'ended') this.call.dismiss();
  }
}

function attach(el: HTMLMediaElement, stream: MediaStream | null): void {
  if (el.srcObject === stream) return;
  el.srcObject = stream;
  // Wiedergabe ist nach dem Klick auf Anrufen/Annehmen erlaubt
  if (stream) void el.play().catch(() => undefined);
}
