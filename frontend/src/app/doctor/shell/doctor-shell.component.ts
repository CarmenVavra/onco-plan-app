import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideLogOut, LucideVolume2, LucideVolumeX } from '@lucide/angular';
import { AuthService } from '../../core/services/auth.service';
import { AlarmSoundService } from '../data/alarm-sound.service';
import { DashboardStore } from '../data/dashboard.store';
import { DoctorRealtimeService } from '../data/doctor-realtime.service';

@Component({
  selector: 'app-doctor-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LucideVolume2, LucideVolumeX, LucideLogOut],
  // Zustand gilt pro Ärzte-Sitzung und wird beim Verlassen verworfen
  providers: [DashboardStore, DoctorRealtimeService, AlarmSoundService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './doctor-shell.component.html',
  styleUrl: './doctor-shell.component.css',
})
export class DoctorShellComponent {
  protected readonly store = inject(DashboardStore);
  protected readonly auth = inject(AuthService);

  protected readonly tabs = [
    { path: '/arzt/ampelliste', label: 'Ampelliste' },
    { path: '/arzt/patienten', label: 'Patienten' },
    { path: '/arzt/alarm-historie', label: 'Alarm-Historie' },
  ];

  protected readonly connectionLabel = {
    connected: 'Live verbunden',
    connecting: 'Verbinde …',
    disconnected: 'Getrennt – Liste nicht live',
  } as const;

  constructor() {
    void this.store.start();
  }
}
