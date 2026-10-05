import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SILENT_ERRORS } from '../http/api-error.interceptor';
import type { SessionUser, UserRole } from '../models/api.models';

/**
 * Nur UI-Metadaten (Name, Rolle) werden lokal gemerkt, damit die PWA auch offline
 * startet. Das JWT liegt ausschließlich im HTTP-Only-Cookie und ist für JS unsichtbar.
 */
const SESSION_META_KEY = 'oncoplan_session_meta';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  private readonly _user = signal<SessionUser | null>(null);
  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);
  readonly isDoctor = computed(() => this._user()?.role === 'DOCTOR');
  readonly isPatient = computed(() => this._user()?.role === 'PATIENT');

  /** Beim App-Start: Sitzung über das Cookie prüfen (offline: letzte bekannte Sitzung). */
  async restore(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ user: SessionUser }>('/api/auth/me', { context: new HttpContext().set(SILENT_ERRORS, true) }),
      );
      this.setUser(res.user);
    } catch (error) {
      const offline = error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 502);
      this.setUser(offline ? this.readCachedMeta() : null);
    }
  }

  async login(email: string, password: string): Promise<SessionUser> {
    const res = await firstValueFrom(
      this.http.post<{ user: SessionUser }>(
        '/api/auth/login',
        { email, password },
        { context: new HttpContext().set(SILENT_ERRORS, true) },
      ),
    );
    this.setUser(res.user);
    return res.user;
  }

  async logout(): Promise<void> {
    const user = this._user();
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}, { context: new HttpContext().set(SILENT_ERRORS, true) }));
    } catch {
      // Abmelden lokal trotzdem durchführen
    }
    if (user?.role === 'PATIENT') {
      try {
        // Lazy: Dexie wird nur im Patientenbereich geladen
        const { OfflineDbService, clearSnapshotsForUser } = await import('../offline/offline-db.service');
        await clearSnapshotsForUser(this.injector.get(OfflineDbService), user.id);
      } catch {
        // IndexedDB nicht verfügbar – nichts zu löschen
      }
    }
    this.setUser(null);
    await this.router.navigateByUrl('/login');
  }

  /** Vom Interceptor bei 401 aufgerufen. */
  handleSessionExpired(): void {
    if (!this._user()) return;
    this.setUser(null);
    void this.router.navigate(['/login'], { queryParams: { abgelaufen: 1 } });
  }

  homeUrlFor(role: UserRole | undefined): string {
    return role === 'PATIENT' ? '/patient/heute' : role === 'DOCTOR' ? '/arzt/ampelliste' : '/login';
  }

  private setUser(user: SessionUser | null): void {
    this._user.set(user);
    try {
      if (user) localStorage.setItem(SESSION_META_KEY, JSON.stringify(user));
      else localStorage.removeItem(SESSION_META_KEY);
    } catch {
      // Privater Modus / Speicher blockiert – Sitzung funktioniert trotzdem online.
    }
  }

  private readCachedMeta(): SessionUser | null {
    try {
      const raw = localStorage.getItem(SESSION_META_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<SessionUser>;
      const validRole = parsed.role === 'PATIENT' || parsed.role === 'DOCTOR' || parsed.role === 'ADMIN';
      return parsed.id && parsed.firstName && parsed.lastName && validRole
        ? { id: parsed.id, firstName: parsed.firstName, lastName: parsed.lastName, role: parsed.role as UserRole }
        : null;
    } catch {
      return null;
    }
  }
}
