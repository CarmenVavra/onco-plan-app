import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { type AbstractControl, FormBuilder, ReactiveFormsModule, type ValidationErrors, Validators } from '@angular/forms';
import { LucidePlus } from '@lucide/angular';
import { APPOINTMENT_TYPE_LABELS, splitStartsAt, toStartsAtIso } from '../../core/domain/appointments';
import { formatClock } from '../../core/domain/format';
import type { Appointment, AppointmentInput, AppointmentType } from '../../core/models/api.models';
import { NotificationService } from '../../core/services/notification.service';
import { formatIsoDate, todayIso } from '../admin-form';
import { DoctorApiService } from '../data/doctor-api.service';

type AppointmentStatus = 'Geplant' | 'Erinnert' | 'Vergangen';

const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Gruppen-Validator: Datum + Uhrzeit müssen in der Zukunft liegen. */
function futureValidator(group: AbstractControl): ValidationErrors | null {
  const date = group.get('date')?.value as string;
  const time = group.get('time')?.value as string;
  if (!date || !TIME_PATTERN.test(time ?? '')) return null;
  return Date.parse(toStartsAtIso(date, time)) <= Date.now() ? { notInFuture: true } : null;
}

/** Gruppen-Validator: „Sonstiger Termin“ braucht eine Beschreibung. */
function otherNeedsNoteValidator(group: AbstractControl): ValidationErrors | null {
  const type = group.get('type')?.value as AppointmentType;
  const note = (group.get('note')?.value as string | undefined)?.trim();
  return type === 'OTHER' && !note ? { otherNeedsNote: true } : null;
}

@Component({
  selector: 'app-appointment-editor',
  imports: [ReactiveFormsModule, LucidePlus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './appointment-editor.component.html',
  // Tabellen- und Editor-Stile teilt sich der Termin-Editor mit dem Medikationsplan
  styleUrls: ['../admin-form.css', './medication-editor.component.css'],
  styles: `
    .note,
    .fasting {
      grid-column: 1 / -1;
    }
    .fasting {
      flex-direction: row;
      align-items: center;
      gap: var(--s-3);
      min-height: var(--touch);
      font-weight: 600;
      cursor: pointer;
    }
    .fasting input {
      width: 1.25rem;
      height: 1.25rem;
      margin: 0;
      accent-color: var(--c-primary);
    }
    .hint-cell .tag {
      margin-right: var(--s-2);
    }
  `,
})
export class AppointmentEditorComponent {
  private readonly api = inject(DoctorApiService);
  private readonly notifications = inject(NotificationService);

  readonly patientId = input.required<string>();
  readonly appointments = input.required<Appointment[]>();
  /** Nach jeder Änderung – die Elternseite lädt die Termine neu */
  readonly changed = output<void>();

  /** `null` = Formular geschlossen, `'new'` = neuer Termin, sonst ID des bearbeiteten Termins */
  protected readonly editing = signal<string | null>(null);
  protected readonly confirmCancelId = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly types = Object.entries(APPOINTMENT_TYPE_LABELS).map(([value, label]) => ({
    value: value as AppointmentType,
    label,
  }));
  protected readonly minDate = todayIso();

  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      type: ['BLOOD_DRAW' as AppointmentType, [Validators.required]],
      date: ['', [Validators.required]],
      time: ['', [Validators.required, Validators.pattern(TIME_PATTERN)]],
      location: ['', [Validators.maxLength(150)]],
      fasting: [false],
      note: ['', [Validators.maxLength(300)]],
    },
    { validators: [futureValidator, otherNeedsNoteValidator] },
  );

  protected typeLabel(a: Appointment): string {
    return APPOINTMENT_TYPE_LABELS[a.type];
  }

  /** "Mi, 14.10.2026" */
  protected day(a: Appointment): string {
    const { date } = splitStartsAt(a.startsAt);
    return `${WEEKDAYS_SHORT[new Date(a.startsAt).getDay()]}, ${formatIsoDate(date)}`;
  }

  protected readonly clock = (a: Appointment): string => formatClock(a.startsAt);

  protected status(a: Appointment): AppointmentStatus {
    if (Date.parse(a.startsAt) <= Date.now()) return 'Vergangen';
    return a.reminderSentAt ? 'Erinnert' : 'Geplant';
  }

  protected statusClass(a: Appointment): string {
    const s = this.status(a);
    return s === 'Erinnert' ? 'tag tag--stable' : s === 'Geplant' ? 'tag tag--acked' : 'tag tag--pending';
  }

  protected startNew(): void {
    this.confirmCancelId.set(null);
    this.form.reset({ type: 'BLOOD_DRAW', date: todayIso(1), time: '08:00', location: '', fasting: false, note: '' });
    this.editing.set('new');
  }

  protected startEdit(a: Appointment): void {
    this.confirmCancelId.set(null);
    this.form.reset({ type: a.type, ...splitStartsAt(a.startsAt), location: a.location ?? '', fasting: a.fasting, note: a.note ?? '' });
    this.editing.set(a.id);
  }

  protected cancelEdit(): void {
    this.editing.set(null);
  }

  protected fieldInvalid(name: 'date' | 'time'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const input: AppointmentInput = {
      type: raw.type,
      startsAt: toStartsAtIso(raw.date, raw.time),
      location: raw.location.trim() || undefined,
      // „Nüchtern“ gibt es nur bei Blutabnahmen (auch wenn die Art nachträglich geändert wurde)
      fasting: raw.type === 'BLOOD_DRAW' && raw.fasting,
      note: raw.note.trim() || undefined,
    };
    const target = this.editing();
    this.busy.set(true);
    try {
      if (target === 'new') await this.api.addAppointment(this.patientId(), input);
      else if (target) await this.api.updateAppointment(target, input);
      this.notifications.success(target === 'new' ? 'Termin vergeben.' : 'Termin gespeichert.');
      this.editing.set(null);
      this.changed.emit();
    } catch {
      // Meldung kommt vom HTTP-Interceptor
    } finally {
      this.busy.set(false);
    }
  }

  protected async cancelAppointment(a: Appointment): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.cancelAppointment(a.id);
      this.notifications.success('Termin abgesagt.');
      this.confirmCancelId.set(null);
      if (this.editing() === a.id) this.editing.set(null);
      this.changed.emit();
    } catch {
      // Meldung kommt vom HTTP-Interceptor
    } finally {
      this.busy.set(false);
    }
  }
}
