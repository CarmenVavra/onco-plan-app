# Handoff: OncoPlan – Patienten-Cockpit (PWA) & Ärzte-Dashboard

## Overview
OncoPlan is a remote patient monitoring system for oncology patients after chemotherapy. It has two interfaces:
1. **Patienten-Cockpit** – mobile Angular PWA: daily medication plan and a symptom check-in under 60 seconds, with offline support.
2. **Ärzte-Dashboard** – Angular web app: a real-time traffic-light list (Ampelliste) of patients with triage alarms, a patient detail view, and alarm acknowledgement.

Full technical spec (DB schema, triage engine, sockets, FHIR): `reference/OncoPlan_Spezifikation.md`.

## About the Design Files
The files in this bundle are **design references created in HTML**: prototypes showing the intended look and behavior, not production code to copy. The task is to **recreate these designs in the target codebase**, which per the spec is **Angular (standalone components + Signals)**, using its established patterns. Open `OncoPlan UI.dc.html` in a browser to view it. It needs `support.js` and `_ds/…` next to it.

## Fidelity
**High-fidelity.** The colors, typography, spacing, copy and interactions are final for the MVP. Recreate them pixel-accurately. The patient names and medical values are sample data.

## Design Language
Flat "Modernist" style:
- **0px border radius everywhere**, no shadows
- Strong **2px rules** between sections: ink `#201e1d` for major ones, `#c8d8e4` for minor ones
- Visible grid cells; **everything flush left**, including button labels (text left, trailing icon right via `justify-content: space-between`)
- Font **Archivo** (400/600/800) from Google Fonts
- Icons: **Lucide**, 2–2.6px stroke, 16–28px

## Design Tokens

### Colors – brand palette (user-defined)
| Token | Hex | Usage |
|---|---|---|
| primary | `#2b6777` | Primary buttons, active nav, links, focus ring, selected segment, check boxes |
| tint | `#c8d8e4` | Selected table row, minor dividers, "Quittiert" tag, yellow-level confirmation header |
| surface | `#ffffff` | Cards, headers, panels |
| ground | `#f2f2f2` | App background, inner separators |
| success | `#52ab98` | Green triage level, "online" dot, green confirmation header |

### Colors – supporting
| Token | Hex | Usage |
|---|---|---|
| ink | `#201e1d` | Text, major 2px rules, offline banner |
| muted | `#4a4a4a` | Secondary text, labels |
| critical | `#b3261e` | Red triage level, temperature ≥ 38.5 °C, threshold line |
| critical-tint | `#f6dcd8` | Red alarm block background, new-alarm row flash |
| critical-ink | `#8a1c15` | Text on critical-tint |
| warning | `#d99a1e` | Yellow triage level, offline sync dot |
| warning-tint | `#f8ecd0` | Yellow alarm block |
| warning-ink | `#6b4a08` | Text on warning-tint |
| success-tint | `#dcefe9` | Green status block / "Stabil" tag |
| success-ink | `#1f5f52` | Text on success-tint |

Red and yellow are used **only** for triage semantics.

### Typography (Archivo)
| Role | Size / weight / extra |
|---|---|
| Screen title (mobile) | 28px / 800 / letter-spacing −0.02em / lh 1.15 |
| Confirmation title | 30px / 800 / −0.02em / lh 1.12 |
| Big numbers (KPI) | 40px / 800 / lh 1.1 |
| Temperature input | 40px / 800 (unit 20px) |
| Section title | 18–20px / 800 |
| Body | 15px / 400–600 |
| Small body | 13–14px |
| Overline label | 11–12px / 600 / UPPERCASE / letter-spacing 0.08em / color muted |

### Spacing
4 / 8 / 12 / 16 / 20 / 24 / 28 px. Mobile screen padding is 20px; dashboard panels use 24–28px.

### Sizes
- Mobile artboard: 390 × 844, status bar 44px, bottom nav 72px
- Minimum touch target **44px**; primary mobile buttons 52–56px tall
- Dashboard: 1440 × 900, top nav 64px, detail panel fixed at 460px

## Screens

### 1a · Heute (patient home)
- **Header** (white, 2px ink bottom rule): date (13px muted), "Guten Morgen, Anna" (28/800), "Therapiewoche 2 · Tag 10" (14/600 primary).
- **Check-in card**: primary-fill block, 20px padding. Overline "Täglicher Check-in · offen" in `#c8d8e4`; title "Wie geht es Ihnen heute?" 22/800 white; full-width white button 52px "Check-in starten · 60 Sek." + arrow-right, text primary 16/800.
- **Einnahmeplan heute**: white card. Header row "Einnahmeplan heute" + "{taken} von {total}", 2px ink rule. Rows are a grid `52px 1fr 44px` with min-height 60px: time (15/800, primary when open, muted when taken); name + dose (15/600) with hint below (12px muted); a 44×44 checkbox with 2px primary border, filled primary with white check when taken. The whole row toggles.
- **Emergency note**: 2px critical top rule. "**Bei Fieber über 38,5 °C** nicht abwarten: Onko-Hotline … · Notfall 112".
- **Bottom nav** (4 equal cells): Heute / Check-in / Verlauf / Profil. The active cell has a 3px primary top bar and primary text.

### 1b · Täglicher Check-in
- Header: back chevron (44px hit area), "Täglicher Check-in" 18/800, "3 Fragen".
- Each question sits in its own white block with a 2px `#c8d8e4` bottom rule and an overline label ("1 · Körpertemperatur", etc.):
  1. **Temperatur**: grid `56px 1fr 56px` with −/+ buttons (56px, 2px primary border) in steps of 0.1 °C, range 34–42. The value is shown in German format ("37,8 °C") and turns critical red at ≥ 38.5. Helper: "Manuell eingeben oder Bluetooth-Thermometer koppeln".
  2. **Schmerzen**: range slider 0–10 (`accent-color: primary`, 44px tall), value at the right in 24/800, end labels "keine" / "stärkste vorstellbare".
  3. **Übelkeit**: segmented control with 4 options, Keine / Leicht / Mittel / Schwer (maps to 0–3). 2px primary outer border; the selected segment is filled primary with white text; labels are flush left.
  4. **Anmerkung (optional)**: textarea 64px, `#f2f2f2` fill, 2px `#c8d8e4` border.
- **Live triage hint** (computed from the inputs): tinted box with a 6px left bar in the level color.
  - red: "**Ihre Temperatur liegt über 38,5 °C.** Nach dem Senden wird Ihr Behandlungsteam sofort benachrichtigt."
  - yellow: "**Starke Schmerzen mit Übelkeit.** Ihr Behandlungsteam wird informiert und meldet sich bei Bedarf."
  - green: "**Werte im erwarteten Bereich.** Danke – Ihre Angaben gehen an Ihr Behandlungsteam."
- **Submit**: sticky at the bottom, 56px primary button "Check-in senden" (offline: "Lokal speichern").

### 1c · Bestätigung
- A full-width colored header block (48px top padding) with a 56px outlined check icon, overline, title 30/800, and text 15px. Variant by level:
  - red: bg critical, white text. "Alarm an Klinik gesendet" / "Ihr Behandlungsteam ruft Sie in Kürze an." / "Bitte halten Sie Ihr Telefon bereit. Bei Atemnot oder Verwirrtheit wählen Sie sofort 112." Also shows the outlined critical button "Onko-Hotline selbst anrufen".
  - yellow: bg tint, ink text. "Check-in gesendet" / "Ihr Team wurde informiert."
  - green: bg success, white text. "Check-in gesendet" / "Danke, Anna. Bis morgen."
  - offline (any level): bg ink, white. "Lokal gespeichert" / "Gespeichert – wird gesendet, sobald Sie wieder Netz haben." If the level is red, the text asks the patient to call the hotline themselves (the clinic cannot be alerted while offline) and the call button shows.
- Summary card "Ihre Angaben · hh:mm": 3 cells (Temp. / Schmerz / Übelkeit).
- Sync line: 8px square dot, green "An Klinik übertragen · verschlüsselt" or warning "Wartet auf Verbindung · Hintergrund-Sync aktiv".
- Secondary button "Zurück zu Heute".

### Offline state (all mobile screens)
An ink banner under the status bar, with the wifi-off icon and "Offline – Eingaben werden lokal gespeichert". Bind it to `navigator.onLine` (the `SymptomSyncService.isOnline` signal in the spec).

### 2a · Ärzte-Dashboard (Ampelliste)
**Top nav** (64px, white, 2px ink bottom rule):
- Brand: a 24px primary square, "OncoPlan" 19/800, and the clinic name after a 2px tint divider.
- Tabs: Ampelliste (active: 3px primary bottom border, primary text), Patienten, Alarm-Historie. All `white-space: nowrap`.
- Right side: "Live verbunden" with a success dot (socket status); a sound toggle button (40px, 2px primary border; filled primary when "Ton an"); the doctor's avatar (36px tint square with initials) and name.

**Layout**: grid `minmax(0,1fr) 460px`, with a 2px ink rule between the columns.

**KPI row** (4 equal cells, white, 2px tint dividers, 2px ink bottom): Rot · kritisch (number in critical) / Gelb · beobachten / Grün · stabil / Check-ins heute "x von y". The red and yellow counts include only *active* (unacknowledged) alarms.

**List header**: "Ampelliste" 20/800 + "sortiert nach Dringlichkeit · aktualisiert in Echtzeit".

**Table**: CSS grid `6px 1.7fr .6fr .9fr .7fr .8fr 2fr .8fr 1fr`. Columns: level bar, Patient, Woche, Temp., Schmerz, Übelkeit, Auslöser, Zeit, Status.
- Header: 11px/600 uppercase muted. The body has a 2px ink top rule; rows have a 2px tint bottom rule and min-height 64px.
- Col 1 is a full-height 6px bar in the level color.
- Patient cell: name 15/600, with "{age} J. · {diagnosis}" 12px muted below.
- Temperature: nowrap; ≥ 38.5 shows in critical 800.
- Status tag (4px 8px padding, 12/600):
  - Aktiv: level-color fill (white text on red, ink on yellow)
  - Quittiert: tint fill
  - Stabil: success-tint fill with success-ink text
  - Ausstehend (no check-in today): ground fill
- Selected row bg: `#c8d8e4`. A newly arrived alarm row flashes critical-tint for 2.5s.

**Sort order** (computed signal): 1) active red, 2) active yellow, 3) acknowledged, 4) green. Within each group, newest first.

**Detail panel** (white, scrolls):
- Header: overline "Patientendetail", name 28/800, "{age} J. · {dx} · Therapiewoche {n}".
- Alarm block (level tint bg): overline with bell icon "Aktiver Alarm · Rot · vor 4 Min." in level ink; trigger reason 17/600; 2-column buttons (48px): "Anrufen" (primary fill, phone icon) and "Alarm quittieren" (2px primary outline, check icon); phone number below.
  - After acknowledging, this becomes a tint block: "Quittiert · {level}" with the reason and "Bestätigt von Dr. L. Brandt · heute hh:mm".
  - Green patients get a success-tint block "Stabil · kein Alarm".
- **Temperature chart, 7 days**: 160px tall bar chart, 7 equal columns with 8px gaps. Y scale 36–40 °C. Bars are primary, or critical when ≥ 38.5. Value labels sit above the bars (11/600), day labels below. A dashed 2px critical line marks 38.5 °C (62.5% height), with the legend "— Grenzwert 38,5 °C".
- 3 KPI cells: Temperatur / Schmerz / Übelkeit (22/800).
- Patient note in quotes.
- Medikationsplan rows: time (primary 600) / name / dose.
- Footer: "Synchronisiert mit KIS · HL7 FHIR Observation (LOINC 8310-5)".

## Interactions & Behavior
- **Triage rules** (same as the backend `TriageEngine`): `fever ≥ 38.5` → RED; else `pain ≥ 7 && nausea ≥ 2` → YELLOW; else GREEN. The mobile hint mirrors this rule client-side for feedback only. The server stays authoritative.
- **Check-in submit**: `POST /api/symptoms`. Offline, the entry is queued in IndexedDB and synced on the `online` event (see `SymptomSyncService`).
- **Medication toggle**: tap the row to mark it taken or untaken.
- **New alarm** (socket `new-triage-alert`): insert into the alerts signal, re-sort, flash the row for 2.5s, and play a sound if the sound toggle is on. The demo button "Alarm simulieren" in the mock stands in for this.
- **Acknowledge**: `PATCH /api/alerts/:id` → status `acknowledged` and `acknowledged_by`. The row moves to the acknowledged group and the KPI count drops.
- **Row click**: select the patient and show the detail panel.
- **Hover/focus**: themed, never browser defaults. Hover is a light tint (`#c8d8e4` on white, or a darker primary for filled buttons). Focus is `outline: 2px solid #2b6777; outline-offset: 2px`.
- No animations beyond the row flash. No rounded corners.

## State (Angular Signals)
**Patient app:**
- `temp: number`
- `pain: 0–10`
- `nausea: 0–3`
- `notes: string`
- `isOnline: boolean`
- `meds: {id, time, name, dose, hint, taken}[]`
- derived: `triageLevel`

**Dashboard:**
- `alerts` / `patients` (from REST + socket)
- `selectedPatientId`
- `soundEnabled`
- `flashId`
- derived: sorted rows, KPI counts

Data model: see the `patient_profiles`, `symptom_logs`, `medication_plans` and `triage_alerts` tables in the spec.

## Assets
- Icons are Lucide (inline SVG in the mock): thermometer, bell, phone, check, wifi-off, arrow-right, chevron-left, volume-2. Use `lucide-angular`.
- Font: Archivo from Google Fonts.
- No images. The logo is a placeholder (24px primary square).

## Files
- `OncoPlan UI.dc.html`: all screens (1a–1c patient, 2a dashboard) with the interactive demo logic (triage, offline toggle, alarm simulation, acknowledge) in the `class Component` script.
- `support.js`: runtime needed to open the HTML mock.
- `_ds/…/styles.css`: base design-system stylesheet (Archivo import, resets). The brand colors in the mock override its red accent with `#2b6777`.
- `reference/OncoPlan_Spezifikation.md`: technical and regulatory spec.
