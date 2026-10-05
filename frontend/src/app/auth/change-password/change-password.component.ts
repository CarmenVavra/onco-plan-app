import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideCheck, LucideCircle } from '@lucide/angular';
import { userMessageFor } from '../../core/http/api-error.interceptor';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { PASSWORD_RULES, passwordChangeValidator, passwordRulesValidator } from './password-rules';

@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule, LucideCheck, LucideCircle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './change-password.component.html',
  styleUrls: ['../login/login.component.css', './change-password.component.css'],
})
export class ChangePasswordComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);

  /** Pflichtänderung nach Startpasswort (kein Abbrechen möglich) */
  protected readonly forced = computed(() => this.auth.user()?.mustChangePassword === true);

  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, passwordRulesValidator]],
      repeatPassword: ['', [Validators.required]],
    },
    { validators: passwordChangeValidator },
  );

  private readonly newPasswordValue = toSignal(this.form.controls.newPassword.valueChanges, { initialValue: '' });
  protected readonly rules = computed(() => {
    const value = this.newPasswordValue();
    return PASSWORD_RULES.map((r) => ({ ...r, ok: r.test(value) }));
  });

  protected readonly showPasswords = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected showError(control: 'currentPassword' | 'newPassword' | 'repeatPassword'): boolean {
    const c = this.form.controls[control];
    return c.invalid && c.touched;
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const { currentPassword, newPassword } = this.form.getRawValue();
      const user = await this.auth.changePassword(currentPassword, newPassword);
      this.notifications.success('Ihr neues Passwort ist gespeichert.');
      await this.router.navigateByUrl(this.auth.landingUrlFor(user), { replaceUrl: true });
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse
          ? userMessageFor(error)
          : 'Das Passwort konnte nicht geändert werden. Bitte versuchen Sie es erneut.',
      );
    } finally {
      this.submitting.set(false);
    }
  }

  protected cancel(): void {
    void this.router.navigateByUrl(this.auth.landingUrlFor(this.auth.user()));
  }
}
