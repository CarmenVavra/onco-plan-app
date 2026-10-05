# OncoPlan – Frontend

Angular-21-App (Standalone Components, Signals, zoneless, PWA) für das Patienten-Cockpit und das Ärzte-Dashboard.

Vollständige Dokumentation (Schnellstart, Architektur, Sicherheit, Offline-Verhalten) steht in der [Projekt-README](../README.md).

| Befehl | Zweck |
|---|---|
| `npm start` | Dev-Server auf http://localhost:4200, leitet `/api` und `/socket.io` an das Backend auf Port 3000 weiter (`proxy.conf.json`) |
| `npm run build` | Produktions-Build inkl. Service Worker nach `dist/frontend/browser` |
| `npm test` | Unit-Tests (Vitest) |
