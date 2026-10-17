# Architektur und Phase 1 (Anforderungen)

## 1. Umfang und Machbarkeit

Ziel der ersten Version ist eine **lokal startbare, vollständig spielbare Einzelspieler-Fassung**. Damit lässt sich prüfen, ob Editor, Wachen, Fahrzeuge, Notrufannahme und Disposition zusammenarbeiten. Ein Server und Mehrspieler bauen darauf auf. Die Simulations-Engine ist dafür so geschnitten, dass sie später unverändert auf einem Server laufen kann.

## 2. Technologie-Stack (Entscheidung)

| Schicht | Wahl | Begründung |
|---|---|---|
| Sprache | TypeScript (strict) | typisierte Datenmodelle, sicheres Refactoring |
| UI | React 18 + eigene, schlanke Komponenten | Leitstellen-UI braucht dichte Tabellen und Fenster; eine große UI-Bibliothek brächte viel Gewicht und Theme-Kämpfe. Die Komponenten (`EntityEditor`, `Modal`, `Tabs`, `Splitter`, `StatusBadge`) sind wiederverwendbar und einheitlich gestaltet. |
| Build | Vite | schneller Dev-Server, statischer Build |
| Karte | Leaflet + OpenStreetMap-Kacheln | ausgereift, leichtgewichtig, frei lizenziert |
| Zustand | eigener Store + immer | ein zentraler, unveränderlicher Zustand; alle Übergänge laufen über Engine-Befehle |
| Persistenz | IndexedDB (eigener Wrapper) | große Spielstände, offline, kein Server nötig |
| Validierung | zod | Import-Schemas mit verständlichen Fehlermeldungen |
| Tests | Vitest (+ fake-indexeddb), Playwright E2E | schnelle Unit-Tests, echter Browser-Test |

## 3. Modulgrenzen

```
src/
  model/        Datentypen (types.ts), ID-Erzeugung – keine Logik
  data/         Kataloge: Fahrzeugtypen, Fähigkeiten, Qualifikationen, Stichwörter,
                Abfragefragen, Szenarien (71 Grundtypen), Beispielleitstelle
  sim/          Spielregeln, UI-unabhängig und deterministisch
    rng.ts          Zufall mit Seed (Zustand im Spielstand)
    geo.ts          Distanz, Fahrzeitnäherung, Interpolation
    availability.ts Dienstzeiten, Wartung, Defekte, Personal und Besatzung
    dispatch.ts     Einsatzmittelvorschlag, Abdeckung, Klinikvorschlag
    callgen.ts      Notrufgenerierung (Szenario, Variante, Ort, Fakten)
    engine.ts       Simulationsschritt (tick) + alle Spielbefehle
    editorOps.ts    Regeln des Leitstellen-Editors
    stats.ts        Kennzahlen aus Ereignissen
  persistence/  IndexedDB, JSON-Schema/Import/Export/Migration, CSV
  store/        GameStore: einziger Ort, an dem der Zustand ersetzt wird; Spielschleife, Autosave
  ui/           React-Oberfläche (Leitstand, Verwaltung, Editor …)
```

**Regeln:**

- Die UI ändert den Zustand nie direkt, sondern nur über `store.run(engineBefehl)` bzw. `store.edit(editorOp)`.
- Die Geschäftslogik liegt nur in `sim/`. Ein Beispiel: `vehicleAvailability()` wird von Engine, Vorschlag und Oberfläche gemeinsam genutzt.
- Befehle liefern `{ ok, error }`. Fehlermeldungen sind auf Deutsch und für Spieler formuliert.

## 4. Datenmodell (Kurzfassung)

`GameState = { schemaVersion, center: CenterConfig, runtime: Runtime }`

- **CenterConfig** (Editor): Stammdaten, Organisationen, Qualifikationen, Fahrzeugtypen (mit Fähigkeiten und Mindestbesatzung), Gebiete (Polygone, zuständige Wachen), Wachen, Fahrzeuge (inkl. Dienstzeiten, Wartung, extern), Personal (Schicht, Qualifikationen, Abwesenheiten), Schichtmodell, Statusdefinitionen, Stichwörter, AAO, Kliniken, Nachbarleitstellen, Straßennamen, Simulationseinstellungen, Freigabefelder.
- **Vehicle.rt**: Laufzeitdaten des Fahrzeugs, also Status, Position, Bewegung, Einsatz, Besatzung, Patient, Transportziel, Defekt und Zeitkonten für die Statistik.
- **Runtime**: Uhr, Zufallszustand, Wetter, Zähler, Notrufe, Einsätze, Funkmeldungen, Ereignisprotokoll, Archiv, Klinikbelegung, Notrufstatistik.

Der Bedarf wird über **Fähigkeiten** beschrieben (z. B. `loeschen`, `hoehenrettung`, `rtw`), nicht über feste Fahrzeugtypen. Eigene Fahrzeugtypen erfüllen dadurch automatisch AAO und Szenarien.

Eigene Organisationen, Fahrzeugtypen (`extra`-Felder) und Fähigkeiten lassen sich ergänzen, ohne das Schema zu ändern.

## 5. Kernmechaniken

**Notruf:** Ein Szenario wird gewichtet gezogen (Kategorie, Tageszeit, Wetter, aktivierte Szenarien). Variante, Fakten und Ort werden zufällig bestimmt. Die Antworten des Anrufers entstehen aus diesen verdeckten Fakten. Nimmt niemand ab, legt der Anrufer auf und ruft einmal erneut an. Doppelmeldungen beziehen sich auf laufende Einsätze.

**Einsatz:** Der *tatsächliche* Bedarf ergibt sich aus dem richtigen Stichwort des Szenarios und gegebenenfalls aus einer Eskalation. Der *Vorschlag* ergibt sich aus der AAO des gewählten Stichworts plus den Nachforderungen. Wer zu klein disponiert, bekommt eine Nachforderung von den Kräften vor Ort. Der Arbeitsfortschritt hängt von der Abdeckung ab (Abdeckung^1,5).

**Patienten:** Ein transportfähiges Fahrzeug vor Ort übernimmt einen Patienten. Nach der Versorgungszeit gibt es zwei Wege:
- Ein Patient mit Notarztbedarf wartet, bis ein Notarzt vor Ort ist.
- Danach folgt der Sprechwunsch „Transportziel“ (oder eine automatische Wahl), der Transport (Status 7), die Übergabe (Status 8), Status 1 und die Rückfahrt.

**Verfügbarkeit:** Ein Fahrzeug ist nicht verfügbar, wenn mindestens eines davon zutrifft:
- außerhalb seiner Dienstzeit,
- in Wartung oder defekt,
- manuell außer Dienst gestellt,
- bereits gebunden,
- ohne vollständige Besatzung aus dem diensthabenden, freien Personal der Wache.

Ehrenamtliche sind mit einer einstellbaren Wahrscheinlichkeit erreichbar. Diese wird deterministisch je Person und Halbtag bestimmt.

**Fahrzeit (Näherung):** Luftlinie × Umwegfaktor (Standard 1,35) ÷ Durchschnittsgeschwindigkeit des Typs. Ohne Sonderrechte gilt 75 % der Geschwindigkeit, Luftfahrzeuge fliegen Luftlinie plus 3 min für Start und Landung. Es gibt keine Straßen- oder Verkehrsdaten, und die Oberfläche weist darauf hin.

**Determinismus:** Der gesamte Zufall läuft über `Rng` mit gespeichertem Zustand. Gleicher Seed und gleiche Eingaben ergeben denselben Verlauf, das ist getestet.

## 6. Funktionsmatrix

| # | Anforderung | Umsetzung | Test |
|---|---|---|---|
| 1 | Leitstellen erstellen/konfigurieren | Startbildschirm, Leitstellen-Editor | E2E, editorOps.test |
| 2 | Einsatzgebiete/Regionen | Gebiete mit Polygon-Editor, Zuständigkeit | callgen (Ort im Gebiet) |
| 3 | Wachen und Standorte | Wachen-Editor inkl. Karte | E2E, editorOps.test |
| 4 | Fahrzeuge und -typen | Fahrzeug- und Typ-Editor, Fähigkeiten | E2E, editorOps.test |
| 5 | Personal, Schichten, Verfügbarkeit | Personal, Schichtmodell, Abwesenheiten, Besatzungsprüfung | engine.test (Verfügbarkeit) |
| 6 | Stichwörter und AAO | Stichwort- und AAO-Editor, CSV-Import | persistence.test |
| 7 | Dynamische Notrufe | callgen + Abfrage | engine.test |
| 8 | Auswählen, alarmieren, disponieren | Vorschlag + freie Auswahl | engine.test, E2E |
| 9 | Fahrzeuge auf der Karte | MapView, Bewegung entlang der Route | E2E (Statusfolge) |
| 10 | Funk und Status | Sprechwünsche, konfigurierbare Statusdefinitionen | engine.test, editorOps.test |
| 11 | Parallele Einsätze | Konfliktprüfung, Langlauftest mit Invarianten | engine.test |
| 12 | Speichern, Laden, Kopieren, Export | IndexedDB, Spielstände, JSON | persistence.test, E2E |
| 13 | Statistiken | stats.ts, Archiv | persistence.test |
| 14 | Szenarien, Schwierigkeit | 71 Szenarien, 4 Stufen, Übungsmodus | engine.test |
| 15 | Mehrspieler | **nicht umgesetzt**, Plan in MULTIPLAYER.md | – |

## 7. Roadmap

- **Phase 1 + 2** – erledigt: Architektur, Beispielleitstelle, Editor, Notrufannahme, vollständiger Einsatzlebenszyklus.
- **Phase 3** – erledigt: AAO, Statusfunk, Bewegung, Personal, Kliniken, Eskalation, Nachforderungen, Wetter.
- **Phase 4** – erledigt: Persistenz, Import/Export, Statistik, Einstellungen, Tastaturkürzel.
- **Phase 5** – offen:
  1. Server und Mehrspieler (MULTIPLAYER.md)
  2. Community-Bibliothek
  3. echtes Routing, z. B. eigener OSRM- oder GraphHopper-Dienst; Schnittstelle ist `travelTimeMs` in `sim/geo.ts`
  4. Karrieremodus mit Budget, Ausbau und Freischaltungen
  5. weitere Szenarien und regionale Stichwortkataloge
- **Phase 6** – teilweise:
  - erledigt: Unit-, Integrations- und E2E-Tests, Dokumentation
  - offen: Barrierefreiheits-Audit, Tests auf Mobilgeräten, Performancetests mit sehr großen Leitstellen (über 500 Fahrzeuge)

## 8. Bekannte Einschränkungen

- Generierte Einsatzadressen sind fiktiv und stimmen nicht mit den Straßen der Hintergrundkarte überein.
- Die Abfrage bietet die Fragen der Szenario-Kategorie an. Die Kategorie selbst wählt also das Spiel, nicht der Spieler.
- Manuell angelegte Einsätze haben keinen verdeckten Verlauf: Der Bedarf entspricht der AAO, und es gibt keine Patienten.
- Die Klinikbelegung ist ein einfaches Bettenmodell ohne Fachabteilungs-Kapazitäten.
- Externe Kräfte werden nur simuliert, eine Kommunikation mit echten Leitstellen findet nicht statt.
