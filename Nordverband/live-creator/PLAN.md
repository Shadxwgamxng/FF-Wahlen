# Einsatz-Creator – Fortschrittsplan

Resource: `Nordverband/live-creator/einsatz_creator/`
Legende: ✅ fertig · 🔄 in Arbeit · ⬜ offen

Dieser Plan wird bei jedem Zwischenstand aktualisiert und mitgepusht.

## Phase 0 – Bestandsaufnahme
- ✅ z_hose-Doku geprüft: nur Client-Exports, u. a. `IsUsingHose()`, Strahlrohr-Waffen `WEAPON_REELBRANCH` / `WEAPON_FOAMBRANCH`, keine Server-Exports
- ✅ Entscheidung: eigenes, serverseitig verwaltetes Feuersystem; Löschen erkennt z_hose (Wasser/Schaum) und den GTA-Feuerlöscher
- ✅ Entscheidung: Leitstelle nur über austauschbare Bridge, keine erfundenen Leitstellen-Events

## Phase 1 – Grundgerüst
- ✅ `fxmanifest.lua`
- ✅ `config.lua` (Rechte, Rollen, Grenzen, Kamera, Feuer, Rettungsdienst, Türen, Speicherung, Bridge)
- ✅ `config_catalog.lua` (Fahrzeuge, Props, NPC-Modelle, Posen, Feuer-/Rauchtypen, Einsatzarten mit Feldern)
- ✅ `shared/` (Konstanten, Hilfsfunktionen, Datenmodell und Validierung)

## Phase 2 – Server
- ✅ Speicherung (JSON, versioniert, Backup, Prüfung beim Laden)
- ✅ Berechtigungen (ACE + optional ESX/QBCore/QBox-Jobs)
- ✅ Validierung aller Client-Anfragen, Rate-Limits, Schutz vor Doppelauslösung
- ✅ Spawner (Fahrzeuge, Objekte, NPCs serverseitig, Besitz-Markierung)
- ✅ Feuersimulation (Brandherde, Ausbreitung, Brenndauer, Löschtreffer, Glutnester)
- ✅ Rettungsdienst-Logik (Patientenstatus, Befreien, Behandeln, Einladen, Übergabe)
- ✅ Türöffnung und Betriebsstoffe
- ✅ Einsatzverwaltung (Vorschau/Test/Live, Status, Beenden, Abbrechen, Rollback, Neustart-Bereinigung)
- ✅ Interne Alarmierung
- ✅ Leitstellen-Bridge (`bridge/dispatch.lua`) + Exports

## Phase 3 – Client / Editor
- ✅ Freie Kamera (WASD, Q/E, Shift/Strg, Rechtsklick-Drehen, Reichweite)
- ✅ Raycast und Bodenplatzierung (Bodenhöhe, Modellgröße, Ausrichtung)
- ✅ Werkzeuge: Fahrzeug, Objekt, Feuer, Rauch, NPC, Einsatzort, Marker, Gebiet, Tür, Ölspur, Absperrlinie
- ✅ Vorschau-Elemente (nur lokal sichtbar), Auswahl, Verschieben, Drehen, Duplizieren, Löschen
- ✅ Sicheres Öffnen/Schließen (Freeze, Fokus, Kamera, Resource-Stop)

## Phase 4 – Client / Einsatz in der Welt
- ✅ Darstellung Live-Elemente (Unfallschäden, Warnblinker, NPC-Posen, eingeklemmte Personen)
- ✅ Feuer/Rauch-Darstellung + Löscherkennung mit z_hose
- ✅ Interaktionen (Patienten, Türen, Ölspur) mit Fortschrittsbalken
- ✅ Alarmierung, Blips, Route, Einsatzinfo-Fenster

## Phase 5 – Oberfläche (NUI)
- ✅ Layout: obere Leiste, Werkzeugpanel, Eigenschaften, Statusleiste
- ✅ Tabs: Werkzeuge, Einsatz, Elemente, Szenarien, Aktive Einsätze
- ✅ Formulare je Einsatzart, Patienten-Editor
- ✅ Einsatzkräfte-Ansichten (Alarm, Einsatzinfo, Interaktionsmenü, Fortschritt)

## Phase 6 – Abschluss
- ✅ Syntaxprüfung aller Lua- und JS-Dateien
- ✅ README: Installation, `server.cfg`, Bedienung, Exports/Events, Bridge-Payload, Testcheckliste
- ✅ Offline-Testlauf der Server-Logik (`tests/server_test.lua`, 54/54 bestanden)
- ✅ Rückfragen zur Leitstellen-Integration beantwortet

## Phase 7 – Anbindung an euren Server
- ✅ QBCore: Jobs `fire`, `ambulance`, `ambulance2`, nur im Dienst
- ✅ EmergencyDispatch: Notruf je Rolle über `emergencydispatch:emergencycall:new`, interne Alarmierung aus
- ✅ z_fire als Feuer-Backend (Fahrzeug-/Objekt-/Innenraum-/Flächenbrand, Rauch, Löschen nur eigener IDs)
- ✅ ox_target für Patienten, Türen, Ölspuren, Fundstellen
- ✅ Zufallseinsätze (Pool je Szenario, Gewichtung, Tageszeit, Sperrzeit, Mindestbesetzung) – ingame einstellbar
- ✅ Offline-Tests erweitert (69/69 bestanden)
- ✅ RTW aus nv_medicDispatches (bftecrtw, bftecrtw2, bftecrtw3, Sitz 3) übernommen
- ✅ NEF und KTW vorerst mit `ambulance` als Platzhalter
- ✅ Kliniken aus nv_medicDispatches (KH-Liste) übernommen
- ✅ Behandlung aus nv_medicDispatches übernommen (Gespräch, Diagnostik, O2, Medikamente, Bodycheck, Wundversorgung, Trage) – serverseitig, ox_lib-Menü
- ✅ Namen und NPC-Modelle übernommen, neue Notruftexte je Meldebild (Tag/Nacht)
- ✅ Ortsvarianten je Szenario (manuell wählbar, zufällig bei Zufallseinsätzen)
- ✅ Krankentransport / Verlegung (Transportziel: Klinik, andere Klinik, Zielort)
- ✅ RD-Notrufe an Leitstelle `fire`
- ✅ Offline-Tests erweitert (90/90 bestanden)
