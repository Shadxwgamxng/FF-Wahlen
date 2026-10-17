# LEITWARTE – Leitstellen-Simulation

LEITWARTE ist ein eigenständiges Leitstellen-Simulationsspiel für den Browser. Du nimmst Notrufe an, fragst sie ab, legst Einsätze an, alarmierst Einsatzmittel und begleitest die Einsätze bis zum Abschluss. Wachen, Fahrzeuge, Personal, Stichwörter, AAO und Kliniken richtest du im Leitstellen-Editor selbst ein.

Die Spielidee ist von öffentlich beschriebenen Leitstellenspielen inspiriert. Code, Inhalte, Texte, Design und Name sind eigenständig.

> **Stand:** Einzelspieler-Version 0.1. Alle Daten bleiben lokal im Browser (IndexedDB).
> Mehrspieler und ein Server sind **noch nicht** umgesetzt (Plan: [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md)).

## Schnellstart

Voraussetzung: Node.js ≥ 18.

```bash
cd Leitstelle/neu
npm install
npm run dev          # Entwicklungsserver auf http://localhost:5173
```

Danach im Browser **„Beispielleitstelle starten“** wählen, mit **Leertaste** die Simulation starten und mit **N** den ersten Notruf annehmen.

Produktionsbuild (statische Dateien in `dist/`, auf jedem Webserver lauffähig):

```bash
npm run build
npm run preview      # lokale Vorschau des Builds
```

## Tests

```bash
npm test             # 41 Unit-/Integrationstests (Vitest): Engine, Disposition, Editor, Persistenz, Import/Export
npm run typecheck    # TypeScript strikt
npm run build && npm run test:e2e   # Browser-Ende-zu-Ende-Test (Playwright/Chromium)
```

Für den E2E-Test muss Playwright samt Chromium vorhanden sein (`npm i -D playwright && npx playwright install chromium`). Alternativ geben `PLAYWRIGHT_MODULE` und `CHROMIUM_PATH` eine vorhandene Installation an.

## So spielst du einen Einsatz

1. **Notruf annehmen** (Taste `N` oder Klick in die Notrufliste).
2. **Abfragen:** Die Fragen hängen von der Lage ab (Brand, VU, medizinischer Notfall …). Der **Einsatzort muss abgefragt sein**, bevor du einen Einsatz anlegen kannst.
3. **Stichwort wählen.** Auf „Leicht“ und „Normal“ schlägt die Abfragehilfe ein Stichwort vor, sobald die entscheidenden Fragen gestellt sind. Bei einem Fehlanruf wählst du „Ohne Einsatz beenden“, eine Doppelmeldung verknüpfst du mit dem laufenden Einsatz.
4. **Einsatz anlegen** (`Strg+Enter`). Der Einsatzmittelvorschlag kommt aus der AAO (Bedarf nach Fähigkeiten) und berücksichtigt Verfügbarkeit, Besatzung, Ausrück- und Fahrzeit sowie die Zuständigkeit. Du kannst die Auswahl frei ändern und dann **alarmieren** (`A`).
5. **Status verfolgen:** Alarmiert → 3 (Anfahrt) → 4 (vor Ort). Sprechwünsche (5) erscheinen im Funkpanel: Transportziel zuweisen, Nachforderungen disponieren, Lagemeldungen quittieren.
6. Nach „Einsatzstelle abgearbeitet“ die **Kräfte entlassen** und den **Einsatz abschließen**. Danach steht er im Archiv und fließt in die Statistik ein.

Wählst du ein zu kleines Stichwort, fordern die Kräfte vor Ort nach. Lagen können sich außerdem verschärfen (Eskalation).

## Tastaturkürzel

| Taste | Aktion |
|---|---|
| Leertaste | Simulation starten/pausieren |
| 1–6 | Geschwindigkeit 1×, 2×, 5×, 10×, 30×, 60× |
| N | nächsten Notruf annehmen |
| Strg+Enter | Einsatz aus Notruf anlegen |
| E | ältesten nicht disponierten Einsatz öffnen |
| A | Auswahl im offenen Einsatz alarmieren |
| F | Karte auf Einsatz zentrieren |
| Esc | Fenster schließen |
| Alt+1…0 | Bereich wechseln |
| Strg+S | sofort speichern |
| ? | Hilfe |

## Funktionsumfang (ehrlicher Stand)

| Bereich | Stand |
|---|---|
| Notrufannahme mit situationsabhängiger Abfrage, Auflegen und Rückruf, Doppelmeldungen, Fehlanrufe | ✅ |
| 71 Szenario-Grundtypen mit Varianten und Zufallsparametern, gewichtet nach Tageszeit, Wetter und Kategorie | ✅ |
| Einsatzlebenszyklus inkl. Patienten, Transport, Klinikübergabe, Nachforderung, Eskalation, Entlassen, Abschluss, Archiv | ✅ |
| Einsatzmittelvorschlag (AAO, Verfügbarkeit, ETA, Zuständigkeit, Besatzung), freie Auswahl, Schutz vor Doppelbindung | ✅ |
| Karte (Leaflet + OSM): Gebiete, Wachen, Kliniken, Nachbarleitstellen, Einsätze, bewegte Fahrzeuge, Routen | ✅ (Routen = Luftlinien-Näherung, keine Straßen- oder Verkehrsdaten) |
| Konfigurierbare Statuscodes, Bezeichnungen und Farben; Ereignisprotokoll; Funkmeldungen | ✅ |
| Signaltöne (Web Audio) und Sprachausgabe (Web Speech API des Browsers) | ✅ optional, ohne externe Dienste |
| Editor: Leitstelle, Gebiete (Polygon), Organisationen, Wachen, Fahrzeugtypen, Fahrzeuge, Qualifikationen, Personal, Schichtmodell, Abwesenheiten, Wartung, Dienstzeiten, Stichwörter, AAO, Kliniken, Nachbarleitstellen/externe Kräfte, Straßennamen, Simulationseinstellungen | ✅ |
| Speichern/Laden (IndexedDB), Autosave, manuelle und automatische Spielstände, Kopien | ✅ |
| JSON-Export/-Import (versioniert, validiert, Teilreparatur), CSV-Import für Wachen, Fahrzeuge und Stichwörter | ✅ |
| Statistik aus echten Ereignissen, Einsatzarchiv | ✅ |
| Schwierigkeitsgrade, Seed, Zeitraffer, Übungsmodus (Szenario gezielt auslösen) | ✅ |
| Verschiebbare Fensteraufteilung, Tastaturkürzel, dunkles Design | ✅ |
| Mehrspieler, Benutzerkonten, Server | ❌ noch nicht – Architektur dokumentiert |
| Community-Bibliothek | ❌ nur Datenfelder vorbereitet |
| Karrieremodus | ❌ noch nicht |
| Echtes Straßenrouting | ❌ Näherung (siehe [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md)) |

## Dokumentation

- [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md): Anforderungsanalyse, Funktionsmatrix, Datenmodell, Modulgrenzen, Technologiewahl, Roadmap
- [docs/DATENFORMAT.md](docs/DATENFORMAT.md): JSON-Austauschformat und CSV-Formate
- [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md): geplante Mehrspieler-Architektur

## Externe Abhängigkeiten und Lizenzen

| Paket | Zweck | Lizenz |
|---|---|---|
| React 18 | Oberfläche | MIT |
| Leaflet 1.9 | Karte | BSD-2-Clause |
| immer | unveränderliche Zustandsübergänge | MIT |
| zod | Validierung beim Import | MIT |
| Vite, TypeScript, Vitest, fake-indexeddb (Entwicklung) | Build und Tests | MIT/Apache-2.0 |

**Kartendaten:** © OpenStreetMap-Mitwirkende (ODbL), Kacheln von `tile.openstreetmap.org` gemäß der [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/). Wer das Spiel öffentlich betreibt, sollte in `src/ui/components/mapConfig.ts` einen eigenen oder kommerziellen Kachelserver eintragen. Ohne Internetverbindung bleibt das Spiel spielbar, die Karte zeigt dann nur die Spielobjekte ohne Hintergrund.

Alle Orte, Wachen, Adressen und Personen der Beispielleitstelle sind frei erfunden. Die Krankenhaus-Zielauswahl ist reine Spiellogik und keine medizinische Entscheidungshilfe.
