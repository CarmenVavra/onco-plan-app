# OncoPlan

**Digitales Remote Patient Monitoring für die Onkologie.** OncoPlan begleitet Krebspatient:innen nach der Chemotherapie zu Hause und verbindet sie in Echtzeit mit ihrer Klinik:

- **Patienten-Cockpit** (Angular-PWA, mobil, offline-fähig): Einnahmeplan zum Abhaken, täglicher Symptom-Check-in in unter 60 Sekunden, Verlauf und Profil.
- **Ärzte-Dashboard** (Angular-Web-App): Ampelliste mit Echtzeit-Sortierung, optischem und akustischem Alarm, Patientendetail mit 7-Tage-Temperaturkurve, Quittieren von Alarmen und Alarm-Historie sowie **Patientenverwaltung** (anlegen, Stammdaten bearbeiten, Medikationsplan pflegen, Startpasswort).
- **Backend** (Node.js/Express/TypeScript): regelbasierte **Triage-Engine**, Socket.io-Push an die zuständige Ärztin bzw. den zuständigen Arzt, AES-256-GCM-Spaltenverschlüsselung und HL7-FHIR-R4-Export.

Die Oberflächen setzen die Mockups aus `UI_MOCKUPS/design_handoff_oncoplan` um (Screens 1a–1c, 2a) und folgen dem Designsystem „Modernist“: 0 px Radius, 2-px-Linien, Archivo, Markenfarbe `#2b6777`.

> ⚠️ Medizinprodukt-Hinweis: OncoPlan ist als Medizinprodukt der Klasse IIa (MDR) konzipiert. Dieser Stand ist ein **MVP für Entwicklung und Demo**, nicht zertifiziert und nicht für den Einsatz an echten Patient:innen freigegeben.

---

## Inhalt

1. [Schnellstart](#schnellstart)
2. [Demo-Konten & Demo-Ablauf](#demo-konten--demo-ablauf)
3. [Projektstruktur](#projektstruktur)
4. [Technologie (nur kostenlose Open-Source-Werkzeuge)](#technologie)
5. [Umgebungsvariablen](#umgebungsvariablen)
6. [Skripte](#skripte)
7. [Triage-Regeln](#triage-regeln)
8. [API & Echtzeit-Events](#api--echtzeit-events)
9. [Offline-Fähigkeit (PWA)](#offline-fähigkeit-pwa)
10. [Sicherheit & Datenschutz](#sicherheit--datenschutz)
11. [Barrierefreiheit & Responsive Design](#barrierefreiheit--responsive-design)
12. [Tests](#tests)
13. [Abweichungen & Ergänzungen zur Spezifikation](#abweichungen--ergänzungen-zur-spezifikation)

---

## Schnellstart

### Windows: Start und Stopp per Doppelklick

| Datei | Wirkung |
|---|---|
| `start.bat` | Startet Datenbank (Port 5433), Backend (3000) und Frontend (**4300**) in eigenen, minimierten Fenstern „OncoPlan …“ und öffnet danach http://localhost:4300. Beim **ersten** Start installiert es zusätzlich die Abhängigkeiten, legt `backend/.env` mit frischen Zufallsschlüsseln an und richtet die Datenbank mit Demo-Daten ein. Läuft OncoPlan schon, öffnet es nur den Browser. |
| `stop.bat` | Fährt die Datenbank sauber herunter und beendet Backend und Frontend. Es werden nur Prozesse auf den OncoPlan-Ports 4300, 3000 und 5433 beendet, andere Projekte (z. B. auf Port 4200) bleiben unberührt. |

Bricht der Start ab, stehen die Details im jeweiligen minimierten Fenster. Mit `stop.bat` räumst du bereits gestartete Teile wieder auf.

### Manuell (alle Betriebssysteme)

**Voraussetzungen:** Node.js ≥ 22 und npm. PostgreSQL muss **nicht** installiert sein: Für die Entwicklung startet ein eingebetteter PostgreSQL-Server (`embedded-postgres`). Alternativ kannst du `docker-compose.yml` nutzen.

```bash
npm run install:all
```

Danach `backend/.env.example` nach `backend/.env` kopieren und die beiden Schlüssel neu erzeugen:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Der erste Wert kommt in `JWT_SECRET`, der zweite (64 Hex-Zeichen) in `DATABASE_ENCRYPTION_KEY`.

Dann vier Schritte, jeweils in einem eigenen Terminal:

```bash
npm run db
```

```bash
npm run setup
```

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

| Schritt | Wirkung |
|---|---|
| `npm run db` | eingebetteter PostgreSQL auf Port 5433 (läuft weiter; Daten in `backend/.pgdata`) |
| `npm run setup` | Prisma-Client erzeugen, Schema anlegen, Demo-Daten einspielen (einmalig bzw. zum Zurücksetzen) |
| `npm run dev:backend` | API + Socket.io auf http://localhost:3000 (Watch-Modus) |
| `npm run dev:frontend` | Angular-Dev-Server auf http://localhost:4200 mit Proxy für `/api` und `/socket.io` |

Ist Port 4200 belegt, startest du das Frontend mit `npm --prefix frontend start -- --port 4300`.

**Produktionsbetrieb (ein Origin):** `npm run build` baut das Frontend (inklusive Service Worker) und das Backend. Danach liefert `npm start` API, Socket.io und die Angular-App gemeinsam über Port 3000 aus.

---

## Demo-Konten & Demo-Ablauf

Alle Seed-Konten nutzen das Passwort aus `SEED_PASSWORD` in `backend/.env` (siehe `backend/.env.example`). Es handelt sich um reine Testdaten.

| Rolle | E-Mail | Hinweis |
|---|---|---|
| Ärztin | `lena.brandt@oncoplan.test` | betreut alle 8 Demo-Patient:innen |
| Arzt | `tobias.richter@oncoplan.test` | ohne Patient:innen – zeigt die Datenisolation |
| Patientin | `anna.mueller@oncoplan.test` | Woche 2 · Tag 10, heute noch **kein** Check-in |
| Patient:innen | `klaus.berger@…`, `petra.schulz@…`, `mehmet.yilmaz@…`, `ingrid.hoffmann@…`, `jonas.weber@…`, `sabine.koch@…`, `erika.neumann@…` | jeweils `@oncoplan.test` |

**Live-Demo:**

1. Als Ärztin anmelden: Die Ampelliste zeigt 2 rote, 2 gelbe und 4 grüne Patient:innen. „Ton an“ aktiviert den akustischen Alarm.
2. In einem zweiten Browser (oder privaten Fenster) als Anna anmelden, den Check-in starten und 38,9 °C senden.
3. Im Dashboard springt Anna sofort nach oben, die Zeile blinkt und der Alarmton ertönt. Das Detailpanel bietet „Anrufen“ und „Alarm quittieren“.
4. Alternativ ohne zweiten Browser: „Demo: Alarm simulieren“. Das erzeugt über die echte Pipeline (Speichern → Triage → Socket) einen roten Alarm für Erika Neumann. Der Button erscheint nur bei `DEMO_MODE=true`.

Mit `npm run setup` setzt du die Demo-Daten jederzeit zurück. Dabei werden auch selbst angelegte Patient:innen gelöscht.

### Patient:innen anlegen und bearbeiten

Im Ärzte-Dashboard unter **Patienten**:

1. **„Neue Patient:in“**: Vorname, Nachname, E-Mail (Anmeldename), optional eine Telefonnummer für Rückrufe, Geburtsdatum, Diagnose, Therapiebeginn (Tag 1) und die zuständige Ärztin bzw. den zuständigen Arzt eintragen. Standard ist die angemeldete Person.
2. Nach dem Anlegen erscheint ein **Startpasswort**, z. B. `Kx7m-Pq4r-T9wz`. Es wird **nur dieses eine Mal** angezeigt und nicht gespeichert. Übergib es zusammen mit der E-Mail-Adresse an die Person. Geht es verloren, erzeugt „Startpasswort neu erzeugen“ ein neues; das alte wird dabei sofort ungültig.
   **Beim ersten Login** (und nach jedem neu erzeugten Startpasswort) landet die Person auf **„Eigenes Passwort festlegen“**. Gefordert sind mindestens 10 Zeichen mit Buchstabe und Ziffer, die Regeln werden live abgehakt. Bis zur Änderung sperrt auch das Backend alle Patientenfunktionen (`403 PASSWORD_CHANGE_REQUIRED`). Später lässt sich das Passwort jederzeit unter **Profil → Passwort ändern** wechseln.
3. Auf derselben Seite den **Medikationsplan** erfassen: Medikament, Dosis, tägliche Einnahmezeiten, Hinweis und Zeitraum. Mehrere Uhrzeiten in einem Eintrag müssen dieselbe Minute haben (z. B. 08:00 und 20:00). Andere Zeiten legst du als eigenen Eintrag an. **„Beenden“** nimmt einen Eintrag ab heute aus dem Einnahmeplan; bisherige Einnahmen bleiben dokumentiert, noch nicht begonnene Einträge werden entfernt.
4. **„Bearbeiten“** in der Liste öffnet dieselbe Seite für spätere Änderungen. Wählst du unter „Zuständig“ eine andere Ärztin bzw. einen anderen Arzt, wird die Person übergeben und ist danach nur noch dort sichtbar.

Ärzt:innen können nur ihre eigenen Patient:innen bearbeiten. Alle Eingaben werden im Backend geprüft, die Telefonnummer wird verschlüsselt gespeichert, und das Server-Log enthält nur IDs.

---

## Projektstruktur

```
onco-plan-app/
├─ backend/                      Node.js · Express 5 · Prisma · Socket.io
│  ├─ prisma/schema.prisma       Datenmodell (PostgreSQL)
│  ├─ prisma/seed.ts             Demo-Daten nach Mockups
│  ├─ scripts/embedded-db.mjs    eingebetteter Dev-PostgreSQL
│  └─ src/
│     ├─ config/env.ts           Zod-validierte Umgebungsvariablen (Fail-fast)
│     ├─ routes/                 Controller (auth, patient, doctor, FHIR, demo)
│     ├─ services/               TriageEngine, CryptoVault, SymptomService, DoctorService, …
│     ├─ fhir/                   HL7-FHIR-R4-Typen & -Mapper
│     ├─ middleware/             Auth (JWT-Cookie, Rollen), zentrale Fehlerbehandlung
│     ├─ validation/schemas.ts   Zod-Schemas für alle Eingaben
│     ├─ socket.ts               Socket.io mit Cookie-Auth & Arzt-Räumen
│     └─ dto.ts                  API-Verträge
├─ frontend/                     Angular 21 · Standalone · Signals · zoneless · PWA
│  └─ src/app/
│     ├─ core/                   Auth, Guards, Interceptor, ErrorHandler, Offline-DB (Dexie), Domänenlogik
│     ├─ auth/login/             Login
│     ├─ patient/                Shell + Heute (1a), Check-in (1b), Bestätigung (1c), Verlauf, Profil
│     ├─ doctor/                 Shell + Ampelliste (2a), Patientendetail, Patienten, Alarm-Historie
│     └─ shared/                 Temperaturkurve, Statusseiten
├─ UI_MOCKUPS/                   Design-Handoff (Referenz)
└─ docker-compose.yml            optionaler PostgreSQL per Docker
```

---

## Technologie

Alle eingesetzten Werkzeuge sind **kostenlos und Open Source**. Es werden keine kostenpflichtigen Cloud-Dienste genutzt.

| Bereich | Werkzeuge |
|---|---|
| Frontend | Angular 21 (Standalone Components, Signals, zoneless, `@angular/service-worker`), Dexie (IndexedDB), socket.io-client, `@lucide/angular`, Schrift Archivo (Google Fonts) |
| Backend | Node.js 22, Express 5, TypeScript (strict), Prisma ORM 6, Socket.io 4, Zod 4, jsonwebtoken, helmet, express-rate-limit |
| Datenbank | PostgreSQL 17 (eingebettet über `embedded-postgres` oder per Docker) |
| Tests | Jest + ts-jest (Backend), Vitest (Frontend) |

---

## Umgebungsvariablen

Datei `backend/.env` (Vorlage: `backend/.env.example`). Alle Werte werden beim Start mit Zod validiert. Fehlerhafte Konfiguration bricht den Start mit einer klaren Meldung ab.

| Variable | Pflicht | Beschreibung |
|---|---|---|
| `NODE_ENV` | – | `development` \| `test` \| `production` (in Produktion: `Secure`-Cookies, `DEMO_MODE` verboten) |
| `PORT` | – | HTTP-/Socket-Port, Standard `3000` |
| `DATABASE_URL` | ✔ | PostgreSQL-Verbindung |
| `EMBEDDED_PG_PORT` | – | Port des eingebetteten Dev-PostgreSQL, Standard `5433` |
| `JWT_SECRET` | ✔ | mindestens 32 Zeichen |
| `JWT_EXPIRES_IN_HOURS` | – | Sitzungsdauer, Standard `8` |
| `DATABASE_ENCRYPTION_KEY` | ✔ | 64 Hex-Zeichen (AES-256-Schlüssel für die Spaltenverschlüsselung) |
| `CORS_ORIGIN` | – | erlaubter Origin für Socket.io, falls das Frontend nicht über den Proxy läuft |
| `CLINIC_NAME`, `CLINIC_DEPARTMENT`, `CLINIC_HOTLINE` | – | Klinik-Stammdaten (Dashboard-Kopf, Notfallhinweis der Patienten-App) |
| `DEMO_MODE` | – | `true` aktiviert „Alarm simulieren“ (in Produktion nicht erlaubt) |
| `SEED_PASSWORD` | Seed | Passwort aller Demo-Konten |

---

## Skripte

| Ort | Befehl | Zweck |
|---|---|---|
| Wurzel | `start.bat` / `stop.bat` | Windows: alle Server starten bzw. stoppen |
| Wurzel | `npm run install:all` | Abhängigkeiten für Backend und Frontend |
| Wurzel | `npm run db` / `npm run setup` | Dev-Datenbank starten / Schema und Seed |
| Wurzel | `npm run dev:backend` / `npm run dev:frontend` | Entwicklungsserver |
| Wurzel | `npm test` | alle Tests |
| Wurzel | `npm run build` / `npm start` | Produktions-Build / Start |
| backend | `npm run db:reset` | Schema zurücksetzen und neu seeden |
| backend | `npm run test:coverage` | Jest mit Abdeckungsbericht |
| backend | `npm run prisma:studio` | Datenbank-GUI |
| frontend | `npm test` | Vitest |

---

## Triage-Regeln

Implementiert in `backend/src/services/TriageEngine.ts` (`evaluateTriage`). Diese Regel ist die einzige maßgebliche Quelle. Die Patienten-App spiegelt sie in `frontend/src/app/core/domain/triage.ts` nur für den Live-Hinweis und für den Offline-Fall.

| Stufe | Bedingung | Begründungstext |
|---|---|---|
| 🔴 ROT | Fieber ≥ 38,5 °C | „Kritisches Fieber (38,9 °C) in Therapiewoche 2.“ |
| 🟡 GELB | Schmerz ≥ 7 **und** Übelkeit ≥ Mittel (2) | „Starke Schmerzen (Stufe 8) gekoppelt mit Übelkeit.“ |
| 🟢 GRÜN | sonst | kein Alarm |

- **Therapiewoche:** Der Tag des Therapiebeginns ist Tag 1. Tag 1–7 ist Woche 1, Tag 8–14 Woche 2 usw.
- **Ampelfarbe einer Person** (`alertSelection.ts`): Ein unquittierter Alarm bleibt sichtbar, auch wenn danach unauffällige Werte kommen. Quittierte Alarme bleiben für den Rest des Tages als „Quittiert“ in der Liste.
- **Quittieren** schließt ältere, noch aktive Alarme derselben Person mit ein, weil der neuere Alarm sie überholt hat.
- **Sortierung im Dashboard:** aktiv Rot → aktiv Gelb → quittiert → Grün, innerhalb der Gruppe neueste zuerst. Die KPIs Rot und Gelb zählen nur aktive Alarme.

---

## API & Echtzeit-Events

Alle Endpunkte liegen unter `/api` und prüfen die Rolle serverseitig. Eingaben werden mit Zod validiert.

| Methode | Pfad | Rolle | Beschreibung |
|---|---|---|---|
| POST | `/api/auth/login` | – | Anmeldung; setzt das JWT als HTTP-Only-Cookie (Rate-Limit 10 pro 15 min) |
| POST | `/api/auth/logout` | – | Cookie löschen |
| GET | `/api/auth/me` | angemeldet | aktuelle Sitzung (inkl. `mustChangePassword`) |
| POST | `/api/auth/change-password` | angemeldet | `{ currentPassword, newPassword }`; hebt die Änderungspflicht auf und stellt das Cookie neu aus (auch mit Startpasswort erreichbar, Rate-Limit 10 pro 15 min) |
| POST | `/api/symptoms` | PATIENT | Check-in → Triage → ggf. Alarm und Socket-Push (idempotent über `clientRef`, 20 pro Minute) |
| GET | `/api/patient/home` | PATIENT | Heute-Ansicht inkl. Einnahmeplan |
| GET | `/api/patient/symptoms?days=14` | PATIENT | eigener Verlauf |
| PUT | `/api/patient/medications/intake` | PATIENT | Einnahme abhaken bzw. zurücknehmen |
| GET | `/api/doctor/overview` | DOCTOR | Ampelliste (nur zugeordnete Patient:innen) |
| GET | `/api/doctor/patients/:id` | DOCTOR | Patientendetail (7-Tage-Kurve, Notiz, Medikation) |
| GET | `/api/alerts` | DOCTOR | Alarm-Historie |
| PATCH | `/api/alerts/:id` | DOCTOR | `{ "status": "ACKNOWLEDGED" \| "RESOLVED" }` |
| GET | `/api/fhir/Patient/:id` | DOCTOR | FHIR-R4-`Patient` |
| GET | `/api/fhir/Observation?subject=Patient/:id` | DOCTOR | FHIR-R4-`Bundle` mit Observations: Temperatur (LOINC 8310-5), Schmerz (LOINC 72514-3), Übelkeit (SNOMED 422587007) |
| GET | `/api/doctor/doctors` | DOCTOR | Auswahlliste der Ärzt:innen (Zuständigkeit) |
| POST | `/api/doctor/patients` | DOCTOR | Patient:in anlegen → `{ patientId, initialPassword }` (Passwort nur in dieser Antwort) |
| GET | `/api/doctor/patients/:id/master` | DOCTOR | bearbeitbare Stammdaten inkl. Medikationsplan |
| PUT | `/api/doctor/patients/:id` | DOCTOR | Stammdaten ändern bzw. übergeben (409 bei vergebener E-Mail) |
| POST | `/api/doctor/patients/:id/password-reset` | DOCTOR | neues Startpasswort (setzt die Änderungspflicht erneut) |
| POST | `/api/doctor/patients/:id/medications` | DOCTOR | Eintrag im Medikationsplan anlegen (`times: ["08:00","20:00"]`) |
| PUT | `/api/doctor/medications/:id` | DOCTOR | Eintrag ändern |
| DELETE | `/api/doctor/medications/:id` | DOCTOR | Eintrag ab heute beenden bzw. noch nicht begonnenen Eintrag entfernen |
| POST | `/api/demo/simulate-alert` | DOCTOR | nur bei `DEMO_MODE=true` |
| GET | `/api/health` | – | Health-Check |

**Socket.io:** Die Authentifizierung läuft über dasselbe Cookie. Ärzt:innen werden serverseitig dem Raum `doctor_{id}` zugeordnet. Es gibt kein clientseitiges „join-room“, ein Client kann also keine fremden Räume abonnieren. Server → Client:

| Event | Payload |
|---|---|
| `new-triage-alert` | `{ alertId, patientId, level }` |
| `triage-alert-updated` | `{ alertId, patientId, status }` |
| `patient-updated` | `{ patientId }` (auch bei grünen Check-ins, für die KPI „Check-ins heute“) |

Die Events enthalten bewusst **nur IDs**. Das Dashboard lädt die Gesundheitsdaten danach authentifiziert per REST nach.

---

## Offline-Fähigkeit (PWA)

- **Service Worker** (`ngsw-config.json`, aktiv im Produktions-Build): App-Shell, Assets und die Schrift Archivo werden gecacht. Die App startet dadurch auch ohne Netz.
- **Check-in offline** (`SymptomSyncService`): Ohne Verbindung landet der Eintrag in der IndexedDB-Warteschlange (Dexie, `OncoPlanOfflineDB`). Er ist an die angemeldete Person gebunden und wird nie unter einem anderen Konto gesendet. Die Übertragung startet automatisch beim `online`-Event, beim App-Start und danach jede Minute, solange etwas wartet.
- **Idempotenz:** Jeder Check-in trägt eine `clientRef` (UUID). Wiederholte Uploads erzeugen keine doppelten Einträge oder Alarme.
- **Offline-Stand:** Heute-Ansicht und Verlauf zeigen offline den zuletzt geladenen Stand. Beim Abmelden werden diese Snapshots gelöscht.
- **Roter Wert offline:** Die Bestätigung fordert ausdrücklich zum Anruf bei der Hotline auf, weil die Klinik offline nicht alarmiert werden kann.

Einschränkung: Die Synchronisation läuft, solange die App geöffnet ist. Die Web-API „Background Sync“ (bei geschlossener App) unterstützt der Angular-Service-Worker nicht.

---

## Sicherheit & Datenschutz

- **JWT ausschließlich im HTTP-Only-, `SameSite=Strict`-Cookie** (in Produktion zusätzlich `Secure`). Für JavaScript ist das Token unsichtbar. Lokal werden nur UI-Metadaten (Name, Rolle) gespeichert, damit die PWA offline starten kann.
- **AES-256-GCM-Spaltenverschlüsselung** (`CryptoVault`) für Symptom-Notizen und Telefonnummern, Format `iv:authTag:ciphertext`. Manipulationen werden über den Auth-Tag erkannt.
- **Passwörter** werden mit scrypt (Node-Bordmittel) und zufälligem Salt gehasht, der Vergleich läuft in konstanter Zeit.
- **Zero Trust:** Zod-Validierung jeder Eingabe, Rollenprüfung an jedem Endpunkt und Socket. Ärzt:innen sehen nur ihre zugeordneten Patient:innen; fremde IDs liefern 404, ohne zu verraten, ob die Person existiert.
- **Weitere Härtung:** helmet (CSP und Security-Header), Rate-Limits für Login und Check-in, Body-Limit 20 kB, zentrale Fehlerbehandlung ohne Stacktraces oder Rohfehler an Clients, Logs ohne Gesundheitsdaten.
- **Frontend:** Functional Guards (`roleGuard`) nur als UX-Maßnahme; maßgeblich ist das Backend. Kein `DomSanitizer`-Bypass, kein `innerHTML`.

---

## Barrierefreiheit & Responsive Design

- Ziel ist WCAG 2.2 AA: semantisches HTML (`fieldset`/`legend`, echte Radio-Buttons im Segment-Control, `dl` für Kennzahlen, Tabellensemantik in der Ampelliste), sichtbarer `:focus-visible`-Ring (2 px `#2b6777`), Skip-Links, `aria-live` für den Triage-Hinweis, Toasts und neue Alarme, Datentabelle zur Temperaturkurve für Screenreader.
- Die ganze Zeile der Ampelliste ist per Tastatur auswählbar (gestreckter Button mit `aria-pressed`). Einnahme-Zeilen sind `role="checkbox"` mit `aria-checked`.
- Touch-Ziele sind mindestens 44 × 44 px. Rot und Gelb werden immer mit Text kombiniert („Rot · kritisch“, Status-Tags) und nie nur über die Farbe vermittelt.
- Mobile-First: Die Patienten-App ist eine zentrierte App-Spalte. Das Dashboard stapelt Liste und Detail unter 1200 px, die Tabelle scrollt dann innerhalb ihres Containers, die Seite scrollt nie horizontal.
- `prefers-reduced-motion` wird respektiert.

---

## Tests

```bash
npm test
```

- **Backend (Jest, 146 Tests):** Triage-Engine mit vollständiger Kombinatorik aus Schmerz (0–10) und Übelkeit (0–3) sowie allen Fieber-Grenzwerten (100 % Abdeckung, Prisma und Socket gemockt), CryptoVault inklusive Manipulationserkennung, Therapiewoche, Cron-Parser, Medikationsplan, Ampel-Auswahl, FHIR-Mapping, Zod-Validierung, Passwort-Hashing und JWT. Für die Patientenverwaltung: Anlegen mit gehashtem Startpasswort und verschlüsselter Telefonnummer, E-Mail-Konflikt, Zugriffsschutz für fremde Patient:innen, Übergabe sowie Beenden von Medikationseinträgen. Für die Passwortänderung: Passwortregel, Prüfung des bisherigen Passworts, Änderungspflicht im Token und Sperre der Fachendpunkte.
- **Frontend (Vitest, 24 Tests):** Triage-Spiegel (deckungsgleich mit dem Backend), Sortierung und KPIs der Ampelliste, Check-in-Store (0,1-Schritte, Grenzen), Formatierung, Formular-Validatoren der Patientenverwaltung sowie Passwortregeln (Spiegel des Backends).

---

## Abweichungen & Ergänzungen zur Spezifikation

**Schema-Ergänzungen** (in `schema.prisma` mit „Ergänzung“ markiert):

| Feld/Modell | Grund |
|---|---|
| `PatientProfile.phoneEncrypted` | Rückrufnummer für „Anrufen“ im Dashboard (verschlüsselt) |
| `PatientProfile.assignedDoctor` (Relation) | Fremdschlüssel wie in der SQL-Spezifikation |
| `MedicationPlan.hint` | Einnahmehinweis („nach dem Frühstück“) aus Mockup 1a |
| `MedicationIntake` (neues Modell) | speichert das Abhaken im Einnahmeplan |
| `SymptomLog.clientRef` | idempotenter Offline-Sync |
| `TriageAlert.acknowledgedAt` | „Bestätigt von … · heute hh:mm“ |
| `User.mustChangePassword` | erzwingt nach einem Startpasswort ein eigenes Passwort; zusätzlich als Claim `pwc` im JWT, damit das Backend ohne Datenbankabfrage sperren kann |

Das Prisma-Schema in `CLAUDE.md` enthielt Syntaxfehler (`@fields:` ohne `@relation(`). Sie sind hier korrigiert.

**Bewusst nicht im MVP** (laut Konzept „MVP-Launch-Kriterium“ oder fachlich offen):

- **Bluetooth-Thermometer:** Die Eingabe erfolgt manuell (Stepper oder direkte Eingabe). Der Hilfetext verspricht daher keine Kopplung.
- **Regel C aus dem Konzept-PDF** (Schmerz ≥ 8 allein → Gelb): nicht umgesetzt, weil Spezifikation und Design-Handoff übereinstimmend nur die Regeln A und B nennen. Eine Aufnahme ist eine medizinische Entscheidung und wäre eine Zeile in `evaluateTriage` plus Spiegel und Tests.
- **Pseudonymisierung in zwei getrennten Datenbanken:** Die Architektur ist vorbereitet (Gesundheitsdaten hängen nur an UUIDs), läuft aber im MVP in einer Datenbank.
- **Dynamische Fragebögen je Krebsart** und **Chat:** im Mockup als „Weiter“-Ideen markiert.
- **Rolle ADMIN:** Sie ist im Schema vorhanden, hat aber noch keine eigene Oberfläche. Patient:innen werden derzeit von Ärzt:innen angelegt und gepflegt.
- **Passwort vergessen per E-Mail-Link:** nicht umgesetzt (es gibt keinen Mailversand). Ein neues Startpasswort erzeugt die Ärztin bzw. der Arzt.
- **Andere Sitzungen beim Passwortwechsel abmelden:** Sitzungen auf anderen Geräten bleiben bis zum Ablauf des Tokens (8 h) gültig, weil die JWTs zustandslos sind.
- **Patient:innen löschen bzw. archivieren** und ein **Änderungsprotokoll** (Audit-Trail, wer wann was geändert hat): noch nicht umgesetzt. Für den Klinikbetrieb nach MDR/ISO 13485 wäre beides nötig.
