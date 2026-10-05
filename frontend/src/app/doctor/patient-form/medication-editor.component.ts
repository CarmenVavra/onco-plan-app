import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucidePlus, LucideX } from '@lucide/angular';
import type { MedicationPlan, MedicationPlanInput } from '../../core/models/api.models';
import { NotificationService } from '../../core/services/notification.service';
import { dateOrderValidator, formatIsoDate, sameMinuteValidator, todayIso } from '../admin-form';
import { DoctorApiService } from '../data/doctor-api.service';

type PlanStatus = 'Aktiv' | 'Geplant' | 'Beendet';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_TIMES = 6;

@Component({
  selector: 'app-medication-editor',
  imports: [ReactiveFormsModule, LucidePlus, LucideX],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './medication-editor.component.html',
  styleUrls: ['../admin-form.css', './medication-editor.component.css'],
})
export class MedicationEditorComponent {
  private readonly api = inject(DoctorApiService);
  private readonly notifications = inject(NotificationService);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly patientId = input.required<string>();
  readonly medications = input.required<MedicationPlan[]>();
  /** Nach jeder Änderung – die Elternseite lädt den Plan neu */
  readonly changed = output<void>();

  /** `null` = Formular geschlossen, `'new'` = neuer Eintrag, sonst ID des bearbeiteten Eintrags */
  protected readonly editing = signal<string | null>(null);
  protected readonly confirmEndId = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly MAX_TIMES = MAX_TIMES;

  protected readonly times = new FormArray<FormControl<string>>([], {
    validators: [Validators.required, sameMinuteValidator],
  });
  protected readonly form = this.fb.group(
    {
      medicationName: ['', [Validators.required, Validators.maxLength(255)]],
      dosage: ['', [Validators.required, Validators.maxLength(100)]],
      times: this.times,
      hint: ['', [Validators.maxLength(200)]],
      startDate: ['', [Validators.required]],
      endDate: ['', [Validators.required]],
    },
    { validators: dateOrderValidator('startDate', 'endDate', 'endBeforeStart') },
  );

  protected readonly formatDate = formatIsoDate;

  protected status(plan: MedicationPlan): PlanStatus {
    const today = todayIso();
    if (plan.endDate < today) return 'Beendet';
    if (plan.startDate > today) return 'Geplant';
    return 'Aktiv';
  }

  protected statusClass(plan: MedicationPlan): string {
    const s = this.status(plan);
    return s === 'Aktiv' ? 'tag tag--stable' : s === 'Geplant' ? 'tag tag--acked' : 'tag tag--pending';
  }

  protected startNew(): void {
    this.confirmEndId.set(null);
    this.resetForm({ times: ['08:00'], startDate: todayIso(), endDate: todayIso(90) });
    this.editing.set('new');
  }

  protected startEdit(plan: MedicationPlan): void {
    this.confirmEndId.set(null);
    this.resetForm({ ...plan, hint: plan.hint ?? '' });
    this.editing.set(plan.id);
  }

  protected cancel(): void {
    this.editing.set(null);
  }

  protected addTime(): void {
    if (this.times.length < MAX_TIMES) this.times.push(this.timeControl(''));
  }

  protected removeTime(index: number): void {
    if (this.times.length > 1) this.times.removeAt(index);
  }

  protected fieldInvalid(name: 'medicationName' | 'dosage' | 'startDate' | 'endDate'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const input: MedicationPlanInput = { ...raw, hint: raw.hint.trim() || undefined, times: [...new Set(raw.times)] };
    const target = this.editing();
    this.busy.set(true);
    try {
      if (target === 'new') await this.api.addMedication(this.patientId(), input);
      else if (target) await this.api.updateMedication(target, input);
      this.notifications.success(target === 'new' ? 'Medikament hinzugefügt.' : 'Eintrag gespeichert.');
      this.editing.set(null);
      this.changed.emit();
    } catch {
      // Meldung kommt vom HTTP-Interceptor
    } finally {
      this.busy.set(false);
    }
  }

  protected async end(plan: MedicationPlan): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.endMedication(plan.id);
      this.notifications.success(
        this.status(plan) === 'Geplant' ? 'Geplanter Eintrag entfernt.' : 'Eintrag beendet – ab heute nicht mehr im Einnahmeplan.',
      );
      this.confirmEndId.set(null);
      if (this.editing() === plan.id) this.editing.set(null);
      this.changed.emit();
    } catch {
      // Meldung kommt vom HTTP-Interceptor
    } finally {
      this.busy.set(false);
    }
  }

  private timeControl(value: string): FormControl<string> {
    return this.fb.control(value, [Validators.required, Validators.pattern(TIME_PATTERN)]);
  }

  private resetForm(v: { medicationName?: string; dosage?: string; times: string[]; hint?: string; startDate: string; endDate: string }): void {
    this.times.clear();
    v.times.forEach((t) => this.times.push(this.timeControl(t)));
    this.form.reset({
      medicationName: v.medicationName ?? '',
      dosage: v.dosage ?? '',
      times: v.times,
      hint: v.hint ?? '',
      startDate: v.startDate,
      endDate: v.endDate,
    });
  }
}
