# OncoPlan – Startup Software-Spezifikation (MDR-konform)
## Digitales Remote Patient Monitoring für die Onkologie

Dieses Dokument fasst die vollständige technische Architektur, Entwicklungs-Spezifikation und das regulatorische Fundament für das E-Health-Startup **OncoPlan** zusammen.

---

## 1. Systemübersicht & Startup-Potenzial
**OncoPlan** löst das Problem der mangelnden Nachsorge von Krebspatienten nach einer Chemotherapie. Wenn Patienten nach Hause entlassen werden, überwacht die Anwendung ihren Zustand kontinuierlich, um lebensgefährliche Komplikationen (z. B. neutropenisches Fieber) frühzeitig zu erkennen.

*   **Patienten-Cockpit (Angular PWA):** Tägliche Symptom- und Vitaldatenerfassung mit vollem Offline-Support.
*   **Ärzte-Dashboard (Angular Web-App):** Eine reaktive Ampelliste, die bei kritischen Zuständen visuelle und akustische Echtzeit-Alarme ausgibt.
*   **Business-Modell:** B2B2C / Digitale Gesundheitsanwendung (DiGA). Die Kosten werden von Krankenkassen erstattet, während Kliniken von reduzierten Notfall-Wiederaufnahmen profitieren.

---

## 2. Datenbank-Struktur (PostgreSQL)
Relationales Datenmodell zur Sicherung von Konsistenz und Datenintegrität.

```sql
CREATE TYPE user_role AS ENUM ('patient', 'doctor', 'admin');
CREATE TYPE alert_level AS ENUM ('yellow', 'red');
CREATE TYPE alert_status AS ENUM ('active', 'acknowledged', 'resolved');

-- 1. Benutzerverwaltung
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Patienten-Profile
CREATE TABLE patient_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    birth_date DATE NOT NULL,
    cancer_type VARCHAR(150) NOT NULL,
    therapy_start DATE NOT NULL,
    assigned_doctor_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Symptom-Erfassung
CREATE TABLE symptom_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patient_profiles(id) ON DELETE CASCADE,
    logged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fever_celsius NUMERIC(4,2) NOT NULL,
    pain_level INT CHECK (pain_level BETWEEN 0 AND 10),
    nausea_level INT CHECK (nausea_level BETWEEN 0 AND 3),
    symptom_notes TEXT,
    sync_status VARCHAR(50) DEFAULT 'synced'
);

-- 4. Medikationsplan
CREATE TABLE medication_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patient_profiles(id) ON DELETE CASCADE,
    medication_name VARCHAR(255) NOT NULL,
    dosage VARCHAR(100) NOT NULL,
    frequency_cron VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL
);

-- 5. Triage-Alarme
CREATE TABLE triage_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patient_profiles(id) ON DELETE CASCADE,
    symptom_log_id UUID REFERENCES symptom_logs(id),
    level alert_level NOT NULL,
    status alert_status DEFAULT 'active',
    trigger_reason TEXT NOT NULL,
    acknowledged_by UUID REFERENCES users(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. MVP-Entwicklungsplan (4 Sprints)
Ein schlanker 8-12 Wochen Fahrplan zur Validierung des Produkts am Markt.

*   **Sprint 1: Fundament & Auth (Infrastruktur)**
    *   *Backend:* Node.js-Setup mit TypeScript, Prisma ORM, JWT-Auth in HTTP-Only Cookies.
    *   *Frontend:* Angular-Initialisierung, reaktives State-Management mit Signals, Login-Forms.
*   **Sprint 2: Patienten-Fluss (Datenerfassung als PWA)**
    *   *Frontend:* Aktivierung des `@angular/pwa` Service Workers, Offline-Erfassung via `IndexedDB`.
    *   *Backend:* REST-Endpunkt `POST /api/symptoms` zur Validierung und Speicherung.
*   **Sprint 3: Triage-Engine & Echtzeit-Signalisierung**
    *   *Backend:* Isolierte Triage-Logik, Auto-Insert bei Grenzwertüberschreitung, Socket.io-Räume für Ärzte.
*   **Sprint 4: Ärzte-Dashboard (Die Einsatzzentrale)**
    *   *Frontend:* UI-Ampelliste mit Signal-gesteuerter Echtzeit-Sortierung und Sound-Alarmen bei neuen Sockets.

---

## 4. Medizinische Standards & Interoperabilität (FHIR)
Um mit Krankenhaus-Informationssystemen (KIS) zu kommunizieren, nutzt OncoPlan den globalen **HL7 FHIR-Standard**. Datenstrukturen (wie Patienten oder Vitalparameter) werden nativ in FHIR-JSON verarbeitet, um Plug-and-Play-Fähigkeit für Kliniken zu gewährleisten.

*Beispiel einer FHIR-Observation für Körpertemperatur:*
```json
{
  "resourceType": "Observation",
  "id": "fever-log-123",
  "status": "final",
  "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "vital-signs"}]}],
  "code": {"coding": [{"system": "http://loinc.org", "code": "8310-5", "display": "Body temperature"}]},
  "subject": {"reference": "Patient/example-oncography-001"},
  "effectiveDateTime": "2026-10-05T14:30:00Z",
  "valueQuantity": {"value": 38.7, "unit": "C", "system": "http://unitsofmeasure.org", "code": "Cel"}
}
```

---

## 5. Kern-Code-Implementierungen

### Backend: Triage-Engine (Node.js/TypeScript)
```typescript
import { PrismaClient, SymptomLog, AlertLevel } from '@prisma/client';
import { io } from '../server';

const prisma = new PrismaClient();

export class TriageEngine {
  public async analyzeLog(symptomLog: SymptomLog): Promise<void> {
    const patient = await prisma.patientProfile.findUnique({ where: { id: symptomLog.patientId } });
    if (!patient) throw new Error('Patient nicht gefunden');

    const currentWeek = this.calculateTherapyWeek(patient.therapyStart, symptomLog.loggedAt);
    let isAlertTriggered = false;
    let alertLevel: AlertLevel = 'YELLOW';
    let triggerReason = '';

    if (symptomLog.feverCelsius >= 38.5) {
      isAlertTriggered = true;
      alertLevel = 'RED';
      triggerReason = `Kritisches Fieber (${symptomLog.feverCelsius}°C) in Therapiewoche ${currentWeek}.`;
    } else if (symptomLog.painLevel >= 7 && symptomLog.nauseaLevel >= 2) {
      isAlertTriggered = true;
      alertLevel = 'YELLOW';
      triggerReason = `Starke Schmerzen (Stufe ${symptomLog.painLevel}) gekoppelt mit Übelkeit.`;
    }

    if (isAlertTriggered) {
      const newAlert = await prisma.triageAlert.create({
        data: { patientId: symptomLog.patientId, symptomLogId: symptomLog.id, level: alertLevel, triggerReason },
        include: { patient: { include: { user: true } } }
      });

      if (patient.assignedDoctorId) {
        io.to(`doctor_${patient.assignedDoctorId}`).emit('new-triage-alert', newAlert);
      }
    }
  }

  private calculateTherapyWeek(start: Date, loggedAt: Date): number {
    const diffDays = Math.ceil(Math.abs(loggedAt.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return Math.ceil(diffDays / 7);
  }
}
```

### Frontend: Offline-Sync Service (Angular & Dexie/IndexedDB)
```typescript
import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { OfflineDbService, OfflineSymptomLog } from './offline-db.service';
import { merge, fromEvent } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SymptomSyncService {
  private http = inject(HttpClient);
  private offlineDb = inject(OfflineDbService);
  public isOnline = signal<boolean>(navigator.onLine);

  constructor() {
    merge(fromEvent(window, 'online'), fromEvent(window, 'offline')).subscribe(() => {
      this.isOnline.set(navigator.onLine);
      if (this.isOnline()) this.syncOfflineData();
    });
  }

  public async saveSymptomLog(log: Omit<OfflineSymptomLog, 'loggedAt'>) {
    const fullLog = { ...log, loggedAt: new Date() };
    if (this.isOnline()) {
      return this.http.post('/api/symptoms', fullLog).toPromise();
    } else {
      await this.offlineDb.symptomLogs.add(fullLog);
    }
  }

  private async syncOfflineData() {
    const offlineLogs = await this.offlineDb.symptomLogs.toArray();
    for (const log of offlineLogs) {
      const { id, ...payload } = log;
      await this.http.post('/api/symptoms', payload).toPromise();
      if (id) await this.offlineDb.symptomLogs.delete(id);
    }
  }
}
```

### Frontend: Live-Ampelliste Service (Angular Signals & Socket.io)
```typescript
import { Injectable, signal, computed, inject } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class DoctorWebsocketService {
  private authService = inject(AuthService);
  private socket!: Socket;
  private _alerts = signal<any[]>([]);

  public alerts = computed(() => {
    return [...this._alerts()].sort((a, b) => {
      if (a.level === 'RED' && b.level !== 'RED') return -1;
      if (a.level !== 'RED' && b.level === 'RED') return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  });

  constructor() {
    this.socket = io('http://localhost:3000', { auth: { token: this.authService.getToken() } });
    this.socket.emit('join-room', `doctor_${this.authService.getLoggedInDoctorId()}`);
    this.socket.on('new-triage-alert', (newAlert) => {
      this._alerts.update(current => [newAlert, ...current]);
    });
  }
}
```

---

## 6. Cyber-Security & Absicherung
*   **Application-Layer Encryption (AES-256-GCM):** Sensible Patientendaten (z. B. Freitextnotizen) werden im Node.js-Backend verschlüsselt, bevor sie in PostgreSQL persistiert werden, um Datenlecks bei Serverkompromittierung zu verhindern.
*   **XSS- & Session-Schutz:** JWTs werden ausschließlich in `HTTP-Only` und `SameSite=Strict` Cookies verwaltet (kein Zugriff via JavaScript/LocalStorage möglich).
*   **Pseudonymisierung:** Strikt getrennte Datenbanken für Identitätsdaten (Name, E-Mail) und medizinische Verlaufsdaten.

---

## 7. Regulatorische Anforderungen (MDR Klasse IIa)
Da das System therapeutische Entscheidungen beeinflusst, ist eine Klassifizierung als **Medizinprodukt der Klasse IIa nach MDR (EU) 2017/745** zwingend erforderlich.
*   **ISO 13485:** Etablierung eines zertifizierten Qualitätsmanagementsystems.
*   **IEC 62304:** Strikt dokumentierter Software-Lebenszyklus mit lückenloser Abdeckung durch automatisierte Softwaretests (Unit-Tests mit Jest).

---
*This is for informational purposes only. For medical advice or diagnosis, consult a professional. AI responses may include mistakes.*
