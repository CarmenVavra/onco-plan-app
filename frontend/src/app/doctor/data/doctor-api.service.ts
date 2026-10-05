import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  AlertHistoryEntry,
  CheckinResult,
  DoctorOption,
  DoctorOverview,
  InitialPassword,
  MedicationPlan,
  MedicationPlanInput,
  PatientDetail,
  PatientMaster,
  PatientMasterInput,
} from '../../core/models/api.models';

@Injectable({ providedIn: 'root' })
export class DoctorApiService {
  private readonly http = inject(HttpClient);

  overview(): Promise<DoctorOverview> {
    return firstValueFrom(this.http.get<DoctorOverview>('/api/doctor/overview'));
  }

  patientDetail(patientId: string): Promise<PatientDetail> {
    return firstValueFrom(this.http.get<PatientDetail>(`/api/doctor/patients/${encodeURIComponent(patientId)}`));
  }

  alertHistory(): Promise<AlertHistoryEntry[]> {
    return firstValueFrom(this.http.get<AlertHistoryEntry[]>('/api/alerts'));
  }

  /** PATCH /api/alerts/:id */
  updateAlertStatus(alertId: string, status: 'ACKNOWLEDGED' | 'RESOLVED'): Promise<void> {
    return firstValueFrom(this.http.patch<void>(`/api/alerts/${encodeURIComponent(alertId)}`, { status }));
  }

  simulateAlert(): Promise<CheckinResult> {
    return firstValueFrom(this.http.post<CheckinResult>('/api/demo/simulate-alert', {}));
  }

  // ── Patientenverwaltung ─────────────────────────────────────────────

  doctors(): Promise<DoctorOption[]> {
    return firstValueFrom(this.http.get<DoctorOption[]>('/api/doctor/doctors'));
  }

  patientMaster(patientId: string): Promise<PatientMaster> {
    return firstValueFrom(this.http.get<PatientMaster>(`/api/doctor/patients/${encodeURIComponent(patientId)}/master`));
  }

  createPatient(input: PatientMasterInput): Promise<InitialPassword> {
    return firstValueFrom(this.http.post<InitialPassword>('/api/doctor/patients', input));
  }

  updatePatient(patientId: string, input: PatientMasterInput): Promise<void> {
    return firstValueFrom(this.http.put<void>(`/api/doctor/patients/${encodeURIComponent(patientId)}`, input));
  }

  resetPassword(patientId: string): Promise<InitialPassword> {
    return firstValueFrom(
      this.http.post<InitialPassword>(`/api/doctor/patients/${encodeURIComponent(patientId)}/password-reset`, {}),
    );
  }

  addMedication(patientId: string, input: MedicationPlanInput): Promise<MedicationPlan> {
    return firstValueFrom(
      this.http.post<MedicationPlan>(`/api/doctor/patients/${encodeURIComponent(patientId)}/medications`, input),
    );
  }

  updateMedication(planId: string, input: MedicationPlanInput): Promise<MedicationPlan> {
    return firstValueFrom(this.http.put<MedicationPlan>(`/api/doctor/medications/${encodeURIComponent(planId)}`, input));
  }

  endMedication(planId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/doctor/medications/${encodeURIComponent(planId)}`));
  }
}
