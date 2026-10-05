import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideChevronLeft, LucideCopy, LucideKeyRound } from '@lucide/angular';
import type { DoctorOption, InitialPassword, PatientMaster, PatientMasterInput } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { PHONE_PATTERN, dateOrderValidator, pastDateValidator } from '../admin-form';
import { DashboardStore } from '../data/dashboard.store';
import { DoctorApiService } from '../data/doctor-api.service';
import { MedicationEditorComponent } from './medication-editor.component';

type Field = 'firstName' | 'lastName' | 'email' | 'phone' | 'birthDate' | 'cancerType' | 'therapyStart';

@Component({
  selector: 'app-patient-form',
  imports: [ReactiveFormsModule, RouterLink, LucideChevronLeft, LucideCopy, LucideKeyRound, MedicationEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './patient-form.component.html',
  styleUrls: ['../admin-form.css', './patient-form.component.css'],
})
export class PatientFormComponent {
  private readonly api = inject(DoctorApiService);
  private readonly store = inject(DashboardStore);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);

  /** Routenparameter; fehlt bei "Neue Patient:in" */
  readonly id = input<string>();
  protected readonly isNew = computed(() => !this.id());

  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      firstName: ['', [Validators.required, Validators.maxLength(100)]],
      lastName: ['', [Validators.required, Validators.maxLength(100)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
      phone: ['', [Validators.pattern(PHONE_PATTERN)]],
      birthDate: ['', [Validators.required, pastDateValidator]],
      cancerType: ['', [Validators.required, Validators.maxLength(150)]],
      therapyStart: ['', [Validators.required]],
      assignedDoctorId: [''],
    },
    { validators: dateOrderValidator('birthDate', 'therapyStart', 'therapyBeforeBirth') },
  );

  protected readonly master = signal<PatientMaster | null>(null);
  protected readonly doctors = signal<DoctorOption[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly password = signal<InitialPassword | null>(null);
  protected readonly confirmReset = signal(false);
  protected readonly resetting = signal(false);
  /** Startpasswort direkt nach dem Anlegen (einmalig aus dem Store übernommen) */
  private handedPassword = this.store.takeCreatedPassword();
  /** Ausgewählte Zuständigkeit (für den Übergabe-Hinweis) */
  protected readonly assignedTo = signal('');

  protected readonly title = computed(() => {
    const m = this.master();
    return this.isNew() ? 'Neue Patient:in' : m ? `${m.firstName} ${m.lastName}` : 'Patient:in bearbeiten';
  });
  protected readonly handoverTo = computed(() => {
    const target = this.assignedTo();
    const me = this.auth.user()?.id;
    return target && target !== me ? (this.doctors().find((d) => d.id === target)?.name ?? null) : null;
  });

  constructor() {
    this.form.controls.assignedDoctorId.valueChanges.subscribe((v) => this.assignedTo.set(v));
    void this.loadDoctors();
    // Reagiert auf Routenwechsel (z. B. nach dem Anlegen direkt zur Bearbeiten-Seite)
    effect(() => {
      const id = this.id();
      if (id) void this.loadMaster(id);
      else this.prepareNew();
    });
  }

  protected showError(field: Field): boolean {
    const c = this.form.controls[field];
    return c.invalid && (c.touched || c.dirty);
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notifications.error('Bitte prüfen Sie die markierten Felder.');
      return;
    }
    this.saving.set(true);
    const raw = this.form.getRawValue();
    const input: PatientMasterInput = { ...raw, phone: raw.phone.trim(), assignedDoctorId: raw.assignedDoctorId || undefined };
    try {
      const id = this.id();
      if (!id) {
        const created = await this.api.createPatient(input);
        this.store.handOverCreatedPassword(created);
        await this.store.loadOverview();
        await this.router.navigate(['/arzt/patienten', created.patientId], { replaceUrl: true });
        return;
      }
      await this.api.updatePatient(id, input);
      await this.store.loadOverview();
      if (this.handoverTo()) {
        this.notifications.success(`Gespeichert und an ${this.handoverTo()} übergeben.`);
        await this.router.navigateByUrl('/arzt/patienten');
        return;
      }
      this.notifications.success('Stammdaten gespeichert.');
      this.form.markAsPristine();
      await this.loadMaster(id);
    } catch {
      // Meldung (z. B. "E-Mail bereits vergeben") kommt vom HTTP-Interceptor
    } finally {
      this.saving.set(false);
    }
  }

  protected async resetPassword(): Promise<void> {
    const id = this.id();
    if (!id) return;
    this.resetting.set(true);
    try {
      this.password.set(await this.api.resetPassword(id));
      this.confirmReset.set(false);
    } catch {
      // Meldung kommt vom HTTP-Interceptor
    } finally {
      this.resetting.set(false);
    }
  }

  protected async copyPassword(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.notifications.success('Startpasswort kopiert.');
    } catch {
      this.notifications.error('Kopieren nicht möglich – bitte manuell abschreiben.');
    }
  }

  protected async onMedicationsChanged(): Promise<void> {
    const id = this.id();
    if (id) await this.loadMaster(id, { keepForm: true });
  }

  private prepareNew(): void {
    this.master.set(null);
    this.password.set(null);
    this.form.reset({ assignedDoctorId: this.auth.user()?.id ?? '' });
    this.assignedTo.set(this.form.controls.assignedDoctorId.value);
  }

  private async loadDoctors(): Promise<void> {
    try {
      this.doctors.set(await this.api.doctors());
    } catch {
      // Ohne Liste bleibt die Zuständigkeit bei der angemeldeten Person
    }
  }

  private async loadMaster(id: string, opts: { keepForm?: boolean } = {}): Promise<void> {
    this.loading.set(!opts.keepForm);
    try {
      const m = await this.api.patientMaster(id);
      this.master.set(m);
      this.loadFailed.set(false);
      if (this.handedPassword?.patientId === id) {
        this.password.set(this.handedPassword);
        this.handedPassword = null;
      }
      if (!opts.keepForm) {
        this.form.reset({
          firstName: m.firstName,
          lastName: m.lastName,
          email: m.email,
          phone: m.phone ?? '',
          birthDate: m.birthDate,
          cancerType: m.cancerType,
          therapyStart: m.therapyStart,
          assignedDoctorId: m.assignedDoctorId ?? '',
        });
        this.assignedTo.set(m.assignedDoctorId ?? '');
      }
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
