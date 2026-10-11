import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideArrowRight,
  LucideBell,
  LucideCalendarClock,
  LucideCheck,
  LucideDownload,
  LucideMapPin,
  LucideShare,
  LucideSmartphone,
} from '@lucide/angular';
import {
  appointmentNote,
  appointmentTitle,
  formatAppointmentDay,
  formatAppointmentWhen,
  isReminderDue,
} from '../../core/domain/appointments';
import { formatClock, formatLongDate, greeting, telHref } from '../../core/domain/format';
import type { Appointment } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { PwaInstallService } from '../../core/services/pwa-install.service';
import { PatientHomeStore } from '../data/patient-home.store';
import { PatientPushService } from '../data/patient-push.service';
import { SymptomSyncService } from '../data/symptom-sync.service';

@Component({
  selector: 'app-today',
  imports: [
    RouterLink,
    LucideArrowRight,
    LucideBell,
    LucideCalendarClock,
    LucideCheck,
    LucideDownload,
    LucideMapPin,
    LucideShare,
    LucideSmartphone,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './today.component.html',
  styleUrl: './today.component.css',
})
export class TodayComponent {
  protected readonly store = inject(PatientHomeStore);
  protected readonly sync = inject(SymptomSyncService);
  protected readonly push = inject(PatientPushService);
  protected readonly install = inject(PwaInstallService);
  private readonly auth = inject(AuthService);

  private readonly now = new Date();
  protected readonly dateLabel = formatLongDate(this.now);
  protected readonly greetingLabel = computed(
    () => `${greeting(this.now)}, ${this.store.home()?.firstName ?? this.auth.user()?.firstName ?? ''}`,
  );
  protected readonly checkinTime = computed(() => {
    const at = this.store.home()?.todayCheckinAt;
    return at ? formatClock(at) : null;
  });
  protected readonly hotlineHref = computed(() => telHref(this.store.home()?.hotline ?? '112'));

  /** Termine, die in den nächsten 24 Stunden beginnen → Erinnerung oben auf der Seite */
  protected readonly reminders = computed(() => this.store.appointments().filter((a) => isReminderDue(a, this.now)));

  protected readonly title = appointmentTitle;
  protected readonly note = appointmentNote;
  protected readonly day = (a: Appointment): string => formatAppointmentDay(a.startsAt, this.now);
  protected readonly clock = (a: Appointment): string => formatClock(a.startsAt);
  protected readonly when = (a: Appointment): string => formatAppointmentWhen(a.startsAt, this.now);
  protected readonly isDue = (a: Appointment): boolean => isReminderDue(a, this.now);

  constructor() {
    void this.store.load();
    void this.push.init();
  }
}
