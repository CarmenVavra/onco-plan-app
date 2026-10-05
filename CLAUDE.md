# CLAUDE.md - OncoPlan Development Guide

## Project Overview

OncoPlan is a B2B2C Remote Patient Monitoring (RPM) Startup SaaS built with **Angular (Frontend)**, **Node.js/TypeScript (Backend)**, and **PostgreSQL (Database)**. It features a rule-based real-time Triage Engine for monitoring oncology patients at home post-chemotherapy and alerting clinic doctors via WebSockets.

---

## 🛠 Tech Stack & Environment

- **Frontend:** Angular 21+ (Standalone Components, Signals, Service Worker/PWA)
- **Backend:** Node.js, Express/Fastify, TypeScript, Prisma ORM, Socket.io
- **Database:** PostgreSQL (with Application-Layer Column Encryption via AES-256-GCM)
- **Standards:** HL7 FHIR (R4/R5 Compliance), Medical Device Regulation (MDR Class IIa / IEC 62304)

---

## 🗄 Core Database Schema (PostgreSQL via Prisma)

```prisma
enum UserRole {
  PATIENT
  DOCTOR
  ADMIN
}

enum AlertLevel {
  YELLOW
  RED
}

enum AlertStatus {
  ACTIVE
  ACKNOWLEDGED
  RESOLVED
}

model User {
  id             String          @id @default(uuid())
  email          String          @unique
  passwordHash   String
  role           UserRole
  firstName      String
  lastName       String
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  patientProfile PatientProfile? @relation("PatientToUser")
  doctorAlerts   TriageAlert[]   @relation("DoctorToAlerts")
}

model PatientProfile {
  id               String           @id @default(uuid())
  userId           String           @unique
  user             User             @relation("PatientToUser", fields: [userId], references: [id], onDelete: Cascade)
  birthDate        DateTime
  cancerType       String
  therapyStart     DateTime
  assignedDoctorId String?
  symptomLogs      SymptomLog[]
  medicationPlans  MedicationPlan[]
  triageAlerts     TriageAlert[]
}

model SymptomLog {
  id           String        @id @default(uuid())
  patientId    String
  patient      PatientProfile @fields: [patientId], references: [id], onDelete: Cascade)
  loggedAt     DateTime      @default(now())
  feverCelsius Float
  painLevel    Int
  nauseaLevel  Int
  symptomNotes String?       // AES-256-GCM Encrypted String stored here
  syncStatus   String        @default("synced")
  triageAlerts TriageAlert[]
}

model MedicationPlan {
  id             String         @id @default(uuid())
  patientId      String
  patient        PatientProfile @fields: [patientId], references: [id], onDelete: Cascade)
  medicationName String
  dosage         String
  frequencyCron  String
  startDate      DateTime
  endDate        DateTime
}

model TriageAlert {
  id             String         @id @default(uuid())
  patientId      String
  patient        PatientProfile @fields: [patientId], references: [id], onDelete: Cascade)
  symptomLogId   String?
  symptomLog     SymptomLog?    @fields: [symptomLogId], references: [id])
  level          AlertLevel
  status         AlertStatus    @default(ACTIVE)
  triggerReason  String
  acknowledgedBy String?
  doctor         User?          @fields: [acknowledgedBy], references: [id])
  resolvedAt     DateTime?
  createdAt      DateTime       @default(now())
}
```

---

## 🏃‍♂️ Development Commands

### Backend Commands

- **Install Dependencies:** `npm install`
- **Run Development Server (Watch Mode):** `npm run dev`
- **Build Production Code:** `npm run build`
- **Run Unit Tests (Jest):** `npm run test` or `npx jest`
- **Prisma Studio (DB GUI):** `npx prisma studio`
- **Prisma Generate Client:** `npx prisma generate`
- **Prisma DB Push:** `npx prisma db push`

### Frontend Commands

- **Install Dependencies:** `npm install`
- **Run Local Server:** `ng serve` (Access via [localhost:4200](http://localhost:4200))
- **Build Production PWA:** `ng build --configuration production`
- **Run Tests:** `ng test`

---

## 📐 Code Style, Architectural Patterns & Standards

### 1. General Principles

- **TypeScript Strict Mode:** Mandatory. No Implicit `any`. Enforce absolute Type Safety everywhere.
- **Error Handling:** Centralized Express Error Middleware on Backend; HTTP Interceptors mapping to global notification Service on Frontend.
- **Zero-Trust Security:** Strict backend validation using **Zod** for schema inputs. UI routes secured via Functional Guards, APIs locked via JWT Roles.

---

### 2. Backend Coding Standards

- **Layered Architecture:** Routes/Controllers -> Services (TriageEngine, CryptoVault) -> Data Access (Prisma).
- **Security:** Sensitive data columns (e.g., `symptomNotes`) **MUST** pass through `CryptoVault.encrypt()` (AES-256-GCM) before DB writing.
- **Authentication:** JWT tokens transported exclusively through **HTTP-Only, SameSite=Strict cookies**.
- **WebSockets:** Implement targeted `socket.join("doctor_" + doctorId)` to sandbox communication scopes and protect data isolation.

---

### 3. Frontend (Angular) Coding Standards

- **Modern Angular Features:** Exclusively use **Standalone Components** and **Signals** (`signal()`, `computed()`, `effect()`) for state management. Avoid Legacy NgModules or classic ChangeDetection.
- **PWA Requirements:** Seamless integration of `Dexie` (IndexedDB) wrapper for `SymptomSyncService` to queue and background-sync logs automatically on offline-to-online transitions.
- **FHIR Alignment:** Map internal object interfaces using precise type mappings compliant with FHIR R4 standard structures (e.g., `Observation` for clinical logs, `Patient` for registration metadata).

---

### 4. Code Generation Rules

- Follow explicit semantic separation of roles when crafting new workflows (`isDoctor()`, `isPatient()`).
- Always validate incoming client objects dynamically at the Node.js boundary to comply with Medical Software Validation (IEC 62304 / ISO 13485).

---

### 5. Robustes Error-Handling (Robust Error Handling)

- **Abfangen**: Nutze globale `ErrorHandler`-Klassen für unvorhergesehene Fehler und lokale try/catch Blöcke für asynchrone Operationen.
- **UI-Sicherheit**: Fange Render-Fehler ab, um White Screens zu verhindern. Zeige verständliche Fallback-Komponenten.
- **Daten & Logs**: Gib niemals rohe Fehlermeldungen an den Nutzer weiter. Protokolliere Fehler sicher im Hintergrund.

---

### 6. Barrierefreiheit (Accessibility / a11y)

- **Standard**: Die Webseite muss strikt den WCAG 2.2 AA Richtlinien entsprechen.
- **Angular ARIA**: Setze das native `@angular/cdk/a11y` oder die neuen Angular Aria Features ein.
- **HTML & Fokus**: Verwende rein semantisches HTML. Jedes interaktive Element muss vollständig per Tastatur bedienbar sein und einen sichtbaren `:focus-visible`-Zustand besitzen.

---

### 7. Responsive Design & Layout

- **Ansatz**: Entwickle konsequent nach dem "Mobile-First"-Prinzip.
- **Techniken**: Nutze CSS Grid, Flexbox und relative Einheiten (`rem`, `em`).
- **Touch**: Interaktive Elemente müssen auf Smartphones eine Mindestgröße von 44x44 Pixeln aufweisen.

---

### 8. Code-Qualität & Security

- **Clean Code**: Schreibe selbsterklärenden TypeScript-Code unter strikter Einhaltung von SOLID-, KISS- und DRY-Prinzipien.
- **Strict Mode**: Der TypeScript `strict`-Modus in der `tsconfig.json` muss zu 100% fehlerfrei bedient werden (`noImplicitAny` etc.).
- **Security**: Validiere Eingaben, nutze den Angular `DomSanitizer` nur in absoluten Ausnahmefällen (Schutz vor XSS) und speichere API-Keys ausschließlich in Umgebungsvariablen.

---

### 9. Performance & Optimierung

- **Ladezeiten**: Optimiere das Routing durch konsequentes Lazy Loading von Komponenten (`loadComponent: () => import(...)`).
- **Assets**: Bilder müssen über das native `NgOptimizedImage`-Direktive eingebunden werden, um automatische Format- und Größenoptimierungen zu nutzen.

---

### 10. Dokumentation & Synchronität

- **README**: Aktualisiere augenblicklich die Projektdokumentation, sobald neue Features, Architekturen oder Umgebungsvariablen hinzukommen. Code und Dokumentation dürfen niemals auseinanderlaufen.

---

## 🧪 Testing Blueprint (Jest Example for Reference)

```typescript
import { TriageEngine } from './services/TriageEngine';
// Always mock Prisma and Socket.io instances explicitly when writing rules validation.
// Ensure red alert boundary constraints (fever >= 38.5) and combinatorics are covered with 100% test density.
```

---
*This is for informational purposes only. For medical advice or diagnosis, consult a professional. AI responses may include mistakes.*
