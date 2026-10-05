import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type { AlertLevel, DoctorOverview, InitialPassword, PatientDetail } from '../../core/models/api.models';
import { NotificationService } from '../../core/services/notification.service';
import { AlarmSoundService } from './alarm-sound.service';
import { computeKpis, sortByUrgency } from './ampel';
import { DoctorApiService } from './doctor-api.service';
import { DoctorRealtimeService } from './doctor-realtime.service';

const SOUND_PREF_KEY = 'oncoplan_sound_enabled';
const FLASH_MS = 2500;
const CLOCK_TICK_MS = 30_000;

function readSoundPref(): boolean {
  try {
    return localStorage.getItem(SOUND_PREF_KEY) !== 'false';
  } catch {
    return true;
  }
}

/**
 * Zentraler Signal-Zustand der Einsatzzentrale. Wird pro Ärzte-Sitzung in der
 * Shell bereitgestellt (nicht global), damit nach dem Abmelden nichts zurückbleibt.
 */
@Injectable()
export class DashboardStore {
  private readonly api = inject(DoctorApiService);
  private readonly realtime = inject(DoctorRealtimeService);
  private readonly sound = inject(AlarmSoundService);
  private readonly notifications = inject(NotificationService);

  readonly overview = signal<DoctorOverview | null>(null);
  readonly loadFailed = signal(false);
  readonly selectedId = signal<string | null>(null);
  readonly detail = signal<PatientDetail | null>(null);
  readonly detailLoading = signal(false);
  readonly soundEnabled = signal(readSoundPref());
  readonly flashId = signal<string | null>(null);
  /** Text für die aria-live-Region (Screenreader-Ansage neuer Alarme) */
  readonly announcement = signal('');
  /** Uhr für relative Zeitangaben ("vor 4 Min.") */
  readonly now = signal(new Date());
  readonly connection = this.realtime.state;
  /**
   * Übergabe des Startpassworts von "Neue Patient:in" an die Bearbeiten-Seite.
   * Nur im Arbeitsspeicher; wird nach dem Anzeigen verworfen.
   */
  private readonly createdPassword = signal<InitialPassword | null>(null);

  handOverCreatedPassword(value: InitialPassword): void {
    this.createdPassword.set(value);
  }

  /** Liefert das übergebene Startpasswort genau einmal und entfernt es danach. */
  takeCreatedPassword(): InitialPassword | null {
    const value = this.createdPassword();
    this.createdPassword.set(null);
    return value;
  }

  readonly rows = computed(() => sortByUrgency(this.overview()?.patients ?? []));
  readonly kpis = computed(() => computeKpis(this.overview()?.patients ?? []));

  private flashTimer: ReturnType<typeof setTimeout> | undefined;
  private detailRequest = 0;
  private started = false;

  constructor() {
    const tick = setInterval(() => this.now.set(new Date()), CLOCK_TICK_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick);
      clearTimeout(this.flashTimer);
      this.realtime.disconnect();
      this.sound.dispose();
    });
  }

  /** Einmalig beim Öffnen des Dashboards: Daten laden und Echtzeit-Kanal öffnen. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.realtime.connect({
      newAlert: (e) => void this.onNewAlert(e.patientId, e.level),
      alertUpdated: (e) => void this.refresh(e.patientId),
      patientUpdated: (e) => void this.refresh(e.patientId),
    });
    await this.loadOverview();
    const first = this.rows()[0];
    if (!this.selectedId() && first) this.select(first.patientId);
  }

  async loadOverview(): Promise<void> {
    try {
      const overview = await this.api.overview();
      this.overview.set(overview);
      this.now.set(new Date());
      this.loadFailed.set(false);
      // Nach Übergabe an eine andere Ärztin ist die Person nicht mehr sichtbar → Auswahl aufheben
      const selected = this.selectedId();
      if (selected && !overview.patients.some((p) => p.patientId === selected)) {
        this.selectedId.set(null);
        this.detail.set(null);
      }
    } catch {
      this.loadFailed.set(this.overview() === null);
    }
  }

  select(patientId: string): void {
    this.selectedId.set(patientId);
    void this.loadDetail(patientId);
  }

  async acknowledge(alertId: string): Promise<void> {
    try {
      await this.api.updateAlertStatus(alertId, 'ACKNOWLEDGED');
      this.notifications.success('Alarm quittiert.');
    } finally {
      await this.refresh(this.selectedId());
    }
  }

  async simulateAlert(): Promise<void> {
    this.sound.unlock();
    await this.api.simulateAlert();
    // Die Aktualisierung kommt über das Socket-Event "new-triage-alert".
  }

  toggleSound(): void {
    const next = !this.soundEnabled();
    this.soundEnabled.set(next);
    if (next) this.sound.unlock();
    try {
      localStorage.setItem(SOUND_PREF_KEY, String(next));
    } catch {
      // Einstellung nur für diese Sitzung
    }
  }

  private async onNewAlert(patientId: string, level: AlertLevel): Promise<void> {
    await this.loadOverview();
    const row = this.overview()?.patients.find((p) => p.patientId === patientId);
    this.announcement.set(`Neuer Alarm (${level === 'RED' ? 'Rot' : 'Gelb'}): ${row?.name ?? 'Patient:in'}`);
    if (this.soundEnabled()) this.sound.play(level);

    this.flashId.set(patientId);
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.flashId.set(null), FLASH_MS);

    if (!this.selectedId()) this.select(patientId);
    else if (this.selectedId() === patientId) await this.loadDetail(patientId);
  }

  private async refresh(patientId: string | null): Promise<void> {
    await this.loadOverview();
    const selected = this.selectedId();
    if (selected && (patientId === null || patientId === selected)) await this.loadDetail(selected);
  }

  private async loadDetail(patientId: string): Promise<void> {
    const request = ++this.detailRequest;
    this.detailLoading.set(true);
    try {
      const detail = await this.api.patientDetail(patientId);
      if (request === this.detailRequest) this.detail.set(detail);
    } catch {
      if (request === this.detailRequest) this.detail.set(null);
    } finally {
      if (request === this.detailRequest) this.detailLoading.set(false);
    }
  }
}
