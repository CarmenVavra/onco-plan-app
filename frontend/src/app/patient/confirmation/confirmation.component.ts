import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideCheck, LucidePhone } from '@lucide/angular';
import { formatCelsius, formatClock, telHref } from '../../core/domain/format';
import { isCriticalFever, nauseaLabel } from '../../core/domain/triage';
import { AuthService } from '../../core/services/auth.service';
import { CheckinStore } from '../data/checkin.store';
import { PatientHomeStore } from '../data/patient-home.store';

type Variant = 'red' | 'yellow' | 'green' | 'offline';

interface ConfirmationContent {
  variant: Variant;
  kicker: string;
  title: string;
  text: string;
  showCall: boolean;
}

@Component({
  selector: 'app-confirmation',
  imports: [RouterLink, LucideCheck, LucidePhone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './confirmation.component.html',
  styleUrl: './confirmation.component.css',
})
export class ConfirmationComponent {
  private readonly checkin = inject(CheckinStore);
  private readonly home = inject(PatientHomeStore);
  private readonly auth = inject(AuthService);

  protected readonly submission = this.checkin.lastSubmission;

  protected readonly content = computed<ConfirmationContent | null>(() => {
    const s = this.submission();
    if (!s) return null;
    const firstName = this.home.home()?.firstName ?? this.auth.user()?.firstName ?? '';

    if (s.queued) {
      return {
        variant: 'offline',
        kicker: 'Lokal gespeichert',
        title: 'Gespeichert – wird gesendet, sobald Sie wieder Netz haben.',
        text:
          s.level === 'RED'
            ? 'Bei Fieber über 38,5 °C bitte nicht warten: rufen Sie die Onko-Hotline jetzt selbst an.'
            : 'Sie müssen nichts weiter tun. Die Übertragung erfolgt automatisch im Hintergrund.',
        showCall: s.level === 'RED',
      };
    }
    if (s.level === 'RED') {
      return {
        variant: 'red',
        kicker: 'Alarm an Klinik gesendet',
        title: 'Ihr Behandlungsteam ruft Sie in Kürze an.',
        text: 'Bitte halten Sie Ihr Telefon bereit. Bei Atemnot oder Verwirrtheit wählen Sie sofort 112.',
        showCall: true,
      };
    }
    if (s.level === 'YELLOW') {
      return {
        variant: 'yellow',
        kicker: 'Check-in gesendet',
        title: 'Ihr Team wurde informiert.',
        text: 'Ihre Werte werden heute ärztlich geprüft. Nehmen Sie Ihre Bedarfsmedikation wie besprochen.',
        showCall: false,
      };
    }
    const next = this.home.nextOpenDose();
    return {
      variant: 'green',
      kicker: 'Check-in gesendet',
      title: `Danke${firstName ? ', ' + firstName : ''}. Bis morgen.`,
      text: next
        ? `Ihre Werte liegen im erwarteten Bereich. Denken Sie an Ihre Tabletten um ${next.time}.`
        : 'Ihre Werte liegen im erwarteten Bereich.',
      showCall: false,
    };
  });

  protected readonly time = computed(() => {
    const s = this.submission();
    return s ? formatClock(s.at) : '';
  });
  protected readonly tempLabel = computed(() => formatCelsius(this.submission()?.feverCelsius ?? 0));
  protected readonly tempCritical = computed(() => isCriticalFever(this.submission()?.feverCelsius ?? 0));
  protected readonly nauseaLabel = computed(() => nauseaLabel(this.submission()?.nauseaLevel ?? 0));
  protected readonly hotlineHref = computed(() => telHref(this.home.home()?.hotline ?? '112'));

  constructor() {
    // Direktaufruf ohne vorherigen Check-in → zurück zur Startseite
    if (!this.submission()) void inject(Router).navigateByUrl('/patient/heute', { replaceUrl: true });
  }
}
