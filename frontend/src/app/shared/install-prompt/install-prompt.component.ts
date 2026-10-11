import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, type ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { LucideShare } from '@lucide/angular';
import { filter, map } from 'rxjs';
import { PwaInstallService } from '../../core/services/pwa-install.service';

/**
 * Popup „OncoPlan als App installieren?“ beim Öffnen in Safari auf iPhone/iPad.
 * Chrome/Edge fragen mit ihrem eigenen Installations-Popup; Safari hat keines,
 * deshalb erklärt dieses Popup den Weg über „Teilen → Zum Home-Bildschirm“.
 * Im Ärzte-Bereich wird nicht gefragt.
 */
@Component({
  selector: 'app-install-prompt',
  imports: [NgOptimizedImage, LucideShare],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="install-dialog" aria-labelledby="install-dialog-title" (cancel)="later()">
      <img class="install-dialog__icon" ngSrc="app-icons/icon-192.png" width="64" height="64" alt="" />
      <h2 id="install-dialog-title" class="install-dialog__title">OncoPlan als App installieren?</h2>
      <p class="install-dialog__text">
        OncoPlan liegt dann auf Ihrem Startbildschirm und startet wie eine App. Tippen Sie in Safari unten auf
        <svg lucideShare [size]="16" [strokeWidth]="2.2" aria-label="Teilen" role="img"></svg>
        <strong>Teilen</strong> und dann auf <strong>„Zum Home-Bildschirm“</strong>.
      </p>
      <div class="install-dialog__actions">
        <button type="button" class="btn btn--primary btn--block" (click)="later()">Verstanden</button>
      </div>
    </dialog>
  `,
  styles: `
    .install-dialog {
      width: min(100% - 2rem, 24rem);
      max-width: none;
      padding: var(--s-6) var(--s-5) var(--s-5);
      border: 0;
      border-top: 6px solid var(--c-primary);
      background: var(--c-surface);
      color: var(--c-ink);
    }
    .install-dialog::backdrop {
      background: rgb(0 0 0 / 0.45);
    }
    .install-dialog__icon {
      display: block;
      width: 4rem;
      height: 4rem;
    }
    .install-dialog__title {
      margin-top: var(--s-4);
      font-size: 1.375rem;
      line-height: 1.2;
      letter-spacing: 0;
    }
    .install-dialog__text {
      margin-top: var(--s-2);
      font-size: 0.9375rem;
      line-height: 1.5;
    }
    .install-dialog__text svg {
      vertical-align: -0.15em;
    }
    .install-dialog__actions {
      margin-top: var(--s-5);
      display: flex;
      flex-direction: column;
      gap: var(--s-2);
    }
    .install-dialog__actions .btn {
      min-height: 2.75rem;
      justify-content: center;
      gap: var(--s-2);
    }
  `,
})
export class InstallPromptComponent {
  protected readonly install = inject(PwaInstallService);
  private readonly router = inject(Router);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: '' },
  );
  private readonly visible = computed(
    () => this.install.offerPopup() && this.url() !== '' && !this.url().startsWith('/arzt'),
  );

  constructor() {
    effect(() => {
      const dialog = this.dialog().nativeElement;
      if (this.visible() && !dialog.open) dialog.showModal();
      if (!this.visible() && dialog.open) dialog.close();
    });
  }

  protected later(): void {
    this.install.snooze();
  }
}
