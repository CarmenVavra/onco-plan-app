import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideArrowRight } from '@lucide/angular';
import { userMessageFor } from '../../core/http/api-error.interceptor';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, LucideArrowRight],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Query-Parameter ?abgelaufen=1 nach Sitzungsablauf */
  readonly abgelaufen = input<string>();

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      const user = await this.auth.login(email, password);
      await this.router.navigateByUrl(this.auth.landingUrlFor(user));
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse
          ? error.status === 401
            ? 'E-Mail oder Passwort ist falsch.'
            : userMessageFor(error)
          : 'Die Anmeldung ist fehlgeschlagen. Bitte versuchen Sie es erneut.',
      );
    } finally {
      this.submitting.set(false);
    }
  }

  protected showError(control: 'email' | 'password'): boolean {
    const c = this.form.controls[control];
    return c.invalid && c.touched;
  }
}
