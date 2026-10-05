import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideArrowRight, LucideCheck } from '@lucide/angular';
import { formatClock, formatLongDate, greeting, telHref } from '../../core/domain/format';
import { AuthService } from '../../core/services/auth.service';
import { PatientHomeStore } from '../data/patient-home.store';
import { SymptomSyncService } from '../data/symptom-sync.service';

@Component({
  selector: 'app-today',
  imports: [RouterLink, LucideArrowRight, LucideCheck],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './today.component.html',
  styleUrl: './today.component.css',
})
export class TodayComponent {
  protected readonly store = inject(PatientHomeStore);
  protected readonly sync = inject(SymptomSyncService);
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

  constructor() {
    void this.store.load();
  }
}
