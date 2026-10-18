# LEITWARTE – Leitstellen-Simulation

LEITWARTE ist ein eigenständiges Leitstellen-Simulationsspiel für den Browser. Du nimmst Notrufe an, fragst sie ab, legst Einsätze an, alarmierst Einsatzmittel und begleitest die Einsätze bis zum Abschluss. Wachen, Fahrzeuge, Funkrufgruppen, Stichwörter, AAO und Kliniken richtest du im Leitstellen-Editor selbst ein. Neue Leitstellen entstehen auf echten Landkreisen mit echten Adressen aus OpenStreetMap.

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

Danach im Browser die **Beispielleitstelle Kreis Ostholstein** starten (lädt beim ersten Start Adressen und Standorte live aus OpenStreetMap) oder über den Assistenten eine eigene Leitstelle anlegen. Dann mit **Leertaste** die Simulation starten und mit **N** den ersten Notruf annehmen.

Produktionsbuild (statische Dateien in `dist/`, auf jedem Webserver lauffähig):

```bash
npm run build
npm run preview      # lokale Vorschau des Builds
```

## Tests

```bash
npm test             # Unit-/Integrationstests (Vitest): Engine, Disposition, Editor, Persistenz, OSM-Adressen, Routing, Einsatzmaske, Stichwortkataloge
npm run typecheck    # TypeScript strikt
npm run build && npm run test:e2e   # Browser-Ende-zu-Ende-Test (Playwright/Chromium)
```

Für den E2E-Test muss Playwright samt Chromium vorhanden sein (`npm i -D playwright && npx playwright install chromium`). Alternativ geben `PLAYWRIGHT_MODULE` und `CHROMIUM_PATH` eine vorhandene Installation an.

## Straßenrouting

Fahrzeuge fahren über echte Straßen, wenn ein lokaler OSRM-Server läuft (kostenlos, Anleitung: [docs/ROUTING.md](docs/ROUTING.md), Skripte in `osrm/`). Ohne Server nutzt das Spiel eine deutlich gekennzeichnete Luftlinien-Näherung.

## PC + Tablet im lokalen Netz

`npm run lan` startet einen kleinen LAN-Server. Am PC öffnest du die angezeigte Adresse, am Tablet `…/tablet`. Das Tablet zeigt synchron die Notrufabfrage (DIAS) zum Durchtippen mit „Daten übernehmen“. Ohne laufende Abfrage ist es ein Funkbedienplatz mit Rufgruppenauswahl. Details: [docs/LAN.md](docs/LAN.md).

## Mehrere Bildschirme

Über das Menü **Fenster** lassen sich Karte, Fahrzeuge, Einsätze und Funk als eigene Browserfenster lösen und auf weitere Monitore ziehen. Alle Fenster bleiben synchron.

## So spielst du einen Einsatz

1. **Notruf annehmen** (Taste `N` oder Klick in die Notrufliste).
2. **Einsatzmaske ausfüllen:** Beim Annehmen öffnet sich die Einsatzmaske mit Gesprächsverlauf. Die Fragen hängen von der Lage ab. Den **Einsatzort trägst du selbst ein** (Straßenvorschläge aus OSM) oder lässt den Anrufer **orten** (Festnetz: Anschlussadresse nach wenigen Sekunden; Mobilfunk: ungenauer Bereich, kann fehlschlagen). Eine falsche Adresse führt die Kräfte an den falschen Ort, dann muss nachkorrigiert werden.
3. **Meldebild und Stichwort wählen.** Im Katalog Schleswig-Holstein wählst du zuerst das Meldebild, das ein Stichwort vorschlägt. Auf „Leicht“ und „Normal“ hilft zusätzlich die Abfragehilfe. Weiterleitungen (z. B. an den ärztlichen Bereitschaftsdienst) beenden den Notruf ohne Einsatz. Bei einem Fehlanruf wählst du „Ohne Einsatz beenden“, eine Doppelmeldung verknüpfst du mit dem laufenden Einsatz.
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
| 71 allgemeine Szenario-Grundtypen plus SH-spezifische Szenarien, mit Varianten und Zufallsparametern, gewichtet nach Tageszeit, Wetter und Kategorie | ✅ |
| Stichwortkataloge: Standard und Schleswig-Holstein (Struktur nach lstsim-Wiki „Mitte“, Codes übernommen, alle Texte eigen; zweistufig Meldebild → Stichwort, inkl. Verwaltungs- und Weiterleitungsstichworten) | ✅ |
| Einsatzmaske mit Ortung, Adresskorrektur, Straßenvorschlägen | ✅ |
| Echte Landkreise (Kreisgrenze per Klick aus OSM), echte Adressen und Einsatzorte nach Ortstyp | ✅ benötigt Internet beim Anlegen |
| Einsatzlebenszyklus inkl. Patienten, Transport, Klinikübergabe, Nachforderung, Eskalation, Entlassen, Abschluss, Archiv | ✅ |
| Einsatzmittelvorschlag (AAO, Verfügbarkeit, ETA, Zuständigkeit), freie Auswahl, Schutz vor Doppelbindung | ✅ |
| Alarmgruppen der Freiwilligen Feuerwehren: Alarmierung je Wehr, die Wehr rückt nach Lage (AAO-Bedarf) mit passenden Fahrzeugen aus, Ausrückzeit nach Tageszeit, Funkrückmeldung | ✅ |
| Standardisierte Notrufabfrage (DIAS): eigener Export lokal importierbar, Abfrage beim Annehmen, Ergebnis mit Stichwort/Meldebild/Infotext übernehmen ([docs/DIAS.md](docs/DIAS.md)) | ✅ Inhalte werden nicht mitgeliefert |
| Karte (Leaflet + OSM): Gebiete, Wachen, Kliniken, Nachbarleitstellen, Einsätze, bewegte Fahrzeuge, Routen | ✅ (Straßenrouting mit lokalem OSRM, sonst Luftlinien-Näherung; keine Verkehrsdaten) |
| Konfigurierbare Statuscodes, Bezeichnungen und Farben; Ereignisprotokoll; Funkmeldungen | ✅ |
| Signaltöne (Web Audio) und Sprachausgabe (Web Speech API des Browsers) | ✅ optional, ohne externe Dienste |
| Editor: Leitstelle, Gebiete (Polygon), Organisationen mit Funkrufgruppen, Wachen, Fahrzeugtypen, Fahrzeuge, Wartung, Dienstzeiten, Stichwörter, AAO, Kliniken, Nachbarleitstellen/externe Kräfte, Straßennamen, Simulationseinstellungen | ✅ |
| Speichern/Laden (IndexedDB), Autosave, manuelle und automatische Spielstände, Kopien | ✅ |
| JSON-Export/-Import (versioniert, validiert, Teilreparatur), CSV-Import für Wachen, Fahrzeuge und Stichwörter | ✅ |
| Statistik aus echten Ereignissen, Einsatzarchiv | ✅ |
| Schwierigkeitsgrade, Seed, Zeitraffer, Übungsmodus (Szenario gezielt auslösen) | ✅ |
| Verschiebbare Fensteraufteilung, lösbare Fenster für mehrere Bildschirme, Tastaturkürzel, dunkles Design | ✅ |
| Mehrspieler, Benutzerkonten, Server | ❌ noch nicht – Architektur dokumentiert |
| Community-Bibliothek | ❌ nur Datenfelder vorbereitet |
| Karrieremodus | ❌ noch nicht |
| Sprachtest: Notrufabfrage per Sprache mit simuliertem, regelbasiertem Anrufer, Live-Transkript, Einwilligung, Daten nur lokal ([docs/SPRACHMODUL.md](docs/SPRACHMODUL.md)) | ✅ Prototyp mit festem Testfall, noch nicht in der laufenden Simulation |
| Personalverwaltung | entfernt (bewusst nicht Teil des Spiels) |

## Dokumentation

- [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md): Anforderungsanalyse, Funktionsmatrix, Datenmodell, Modulgrenzen, Technologiewahl, Roadmap
- [docs/DATENFORMAT.md](docs/DATENFORMAT.md): JSON-Austauschformat und CSV-Formate
- [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md): geplante Mehrspieler-Architektur
- [docs/ROUTING.md](docs/ROUTING.md): lokalen OSRM-Server einrichten
- [docs/SPRACHMODUL.md](docs/SPRACHMODUL.md): Sprachtest, Datenschutz und Grenzen
- [docs/SH-KATALOG-VORSCHLAG.md](docs/SH-KATALOG-VORSCHLAG.md): Aufbau des SH-Katalogs und Fahrzeugzuordnung

## Externe Abhängigkeiten und Lizenzen

| Paket | Zweck | Lizenz |
|---|---|---|
| React 18 | Oberfläche | MIT |
| ws | WebSocket für den LAN-Server (nur `server/lan.mjs`) | MIT |
| Leaflet 1.9 | Karte | BSD-2-Clause |
| immer | unveränderliche Zustandsübergänge | MIT |
| zod | Validierung beim Import | MIT |
| Vite, TypeScript, Vitest, fake-indexeddb (Entwicklung) | Build und Tests | MIT/Apache-2.0 |

**Kartendaten:** © OpenStreetMap-Mitwirkende (ODbL), Kacheln von `tile.openstreetmap.org` gemäß der [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/). Wer das Spiel öffentlich betreibt, sollte in `src/ui/components/mapConfig.ts` einen eigenen oder kommerziellen Kachelserver eintragen. Ohne Internetverbindung bleibt das Spiel spielbar, die Karte zeigt dann nur die Spielobjekte ohne Hintergrund.

Die Beispielleitstelle Ostholstein nutzt echte Kreisgrenze, Adressen und Standorte aus OpenStreetMap; Fahrzeugausstattung und Funkrufnamen sind frei verteilt und entsprechen nicht der Realität. Die ältere Testleitstelle „Hessenwald“ ist frei erfunden. Die Krankenhaus-Zielauswahl ist reine Spiellogik und keine medizinische Entscheidungshilfe.
