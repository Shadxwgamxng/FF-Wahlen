# Einsatz-Creator (`einsatz_creator`)

Eigenständiger, vollständig ingame bedienbarer Einsatz-Creator für FiveM:
Brandeinsätze, technische Hilfeleistungen, Türöffnungen, Verkehrsunfälle und
Rettungsdiensteinsätze mit echten NPC-Patienten. Feuer sind mit **z_hose**
löschbar. Die Anbindung an eine Leitstelle erfolgt über eine austauschbare Bridge.

---

## 1. Voraussetzungen

| | |
|---|---|
| FXServer | aktueller Build, **OneSync aktiviert** (Fahrzeuge, Objekte und NPCs werden serverseitig erzeugt) |
| Pflicht-Abhängigkeiten | keine |
| Optional | `z_hose` (Löschen mit Strahlrohr/Schaum), `es_extended` / `qb-core` / `qbx_core` (Job-Abfragen) |

## 2. Installation

1. Ordner `einsatz_creator` nach `resources/` kopieren.
2. Sicherstellen, dass `einsatz_creator/data/` für den Server **beschreibbar** ist.
3. `server.cfg`:

```cfg
# OneSync muss aktiv sein (txAdmin: Einstellungen > OneSync "on")
set onesync on

# optionale Ressourcen VOR dem Creator starten
ensure z_hose
# ensure es_extended   /  ensure qb-core  /  ensure qbx_core

ensure einsatz_creator

# --- Rechte Creator ---
add_ace group.admin einsatzcreator.use allow       # Creator öffnen, Szenarien bearbeiten, Testeinsätze
add_ace group.admin einsatzcreator.live allow      # Live-Einsätze auslösen
add_ace group.admin einsatzcreator.manage allow    # fremde Einsätze beenden/abbrechen
add_ace group.admin einsatzcreator.delete allow    # fremde Szenarien löschen

# --- Rollen der Einsatzkräfte (ohne Framework zwingend, mit Framework optional) ---
# add_ace group.feuerwehr einsatzcreator.role.fire allow
# add_ace group.rettungsdienst einsatzcreator.role.ems allow
# add_ace group.polizei einsatzcreator.role.police allow

# --- Wer bekommt Testalarme zusätzlich zum Auslösenden? ---
# add_ace group.admin einsatzcreator.testempfang allow
```

4. Mit Framework: Jobnamen der Rollen in `config.lua` → `Config.Roles` prüfen.
   Optional können Creator-Rechte zusätzlich über Jobs vergeben werden (`Config.Permissions.jobs`).
5. Server neu starten bzw. `ensure einsatz_creator`.

**Updates:** den Ordner `data/` niemals überschreiben oder löschen (enthält alle Szenarien).

## 3. Bedienung

### Creator (`/einsatzcreator`)
Der Charakter wird eingefroren, eine freie Kamera und die Oberfläche öffnen sich.

| Eingabe | Funktion |
|---|---|
| W A S D / Q E (Leertaste) | Kamera bewegen / runter / hoch |
| Shift / Strg | schneller / langsamer |
| Rechte Maustaste halten | Kamera drehen |
| Linksklick | Element setzen bzw. auswählen |
| Mausrad | drehen (Alt = fein) · Shift = Größe/Radius · Strg = Höhe |
| G | ausgewähltes Element verschieben |
| Pfeiltasten / Bild↑↓ | fein verschieben (Shift = grob) |
| Strg+D / Entf / F | duplizieren / löschen / Kamera zum Element |
| Strg+S | speichern |
| Esc | Werkzeug abbrechen → Auswahl aufheben → schließen |

**Ablauf:** Einsatzart oben wählen → *Einsatzort* setzen → Elemente aus *Werkzeuge* setzen →
im Tab *Einsatz* Stichwort, Alarmtext, Lage, Gefahren usw. ausfüllen → *Speichern* →
*Test* (nur Auslösender + Testempfänger werden alarmiert, keine Leitstellenübergabe) oder
*LIVE*. Im Tab *Aktiv* werden laufende Einsätze verwaltet (Phase, Nachalarmieren, Beenden, Abbrechen).

Werkzeuge: Fahrzeug, Objekt, Absperrlinie, Feuer, Rauch, NPC/Patient, Position/Fundstelle,
Einsatzgebiet, Tür (echte Kartentür wird erkannt und verriegelt), Betriebsstoff/Ölspur.
Feuer/Rauch lassen sich an Fahrzeuge/Objekte koppeln, NPCs in Fahrzeuge setzen (eingeklemmt).

### Einsatzkräfte
| Befehl / Taste | Funktion |
|---|---|
| Alarm | Popup, Blips (Einsatzort, Gebiete, Positionen), Ton |
| `/einsatzroute` | GPS zum letzten Einsatz |
| `/einsatzinfo` | Lage, Gefahren, SOP, Patientenübersicht, Protokoll |
| `E` an Patient/Tür/Ölspur/Fundstelle | Maßnahmenmenü (nur passende Maßnahmen je Rolle) |
| `X` | laufende Maßnahme abbrechen |

Patientenablauf: *eingeklemmt* → Befreien (Feuerwehr) → Sichten → Versorgen → in RTW einladen →
an Klinik übergeben (RTW im Radius einer Klinik aus `Config.Rescue.hospitals`).
Leicht verletzte, gehfähige Patienten können vor Ort entlassen werden.

### Feuer und z_hose
Das Feuersystem ist eigenständig (Brandherde mit Lebenspunkten, Ausbreitung, Brenndauer,
Glutnester/Wiederaufflammen). Beim Spritzen mit z_hose (`exports.z_hose:IsUsingHose()` und
Waffen `WEAPON_REELBRANCH` / `WEAPON_FOAMBRANCH`) oder dem GTA-Feuerlöscher werden Treffer
an den Server gemeldet. Der Server prüft Waffe, Abstand und Trefferrate.
Wirksamkeit je Feuerart und Löschmittel: `config_catalog.lua` → `Catalog.FireTypes`
(z. B. Flüssigkeitsbrand: Wasser 0.25, Schaum 1.6).

## 4. Konfiguration (Auszug)

| Bereich | Einstellung |
|---|---|
| Grenzen | `Config.Limits` – **Feuer und Rauch werden getrennt gezählt** (30 / 15), Fahrzeuge 10, Objekte 60, NPCs 12 … |
| Kamera | `Config.Editor.maxDistance` (800 m), `maxElementDistance` (400 m) |
| Modelle | `Config.OnlyCatalogModels`, `Config.ModelBlacklist` |
| Beenden | `Config.EndCleanup` (was bei normalem Ende geräumt wird; Abbrechen räumt immer alles) |
| Zeitlimits | `Config.Modes.autoCancelMinutes` / `autoCancelTestMinutes` |
| Rettung | `Config.Rescue` (Dauer, Rollen, RTW-Modelle, Kliniken) |
| Bridge | `Config.Dispatch.adapter` = `none` \| `event` \| `custom` |

## 5. Leitstellen-Bridge

Datei: `bridge/dispatch.lua`. **Testeinsätze werden nie übergeben.**

### Ausgehend (Creator → Leitstelle)
Adapter `event` löst lokale Server-Events dieser Resource aus:

| Event | Zeitpunkt |
|---|---|
| `einsatzcreator:bridge:created` | Live-Einsatz aufgebaut und aktiv |
| `einsatzcreator:bridge:status` | Phase geändert (`alarmiert`, `anfahrt`, `vor_ort`, `lage_unter_kontrolle`, `nachalarmierung`, `abschluss`) |
| `einsatzcreator:bridge:update` | Patientenstatus, Tür, Ölspur, Fundstelle oder Feuerlage geändert |
| `einsatzcreator:bridge:ended` | beendet oder abgebrochen |

Beispiel für eine Leitstellen-Resource:
```lua
AddEventHandler('einsatzcreator:bridge:created', function(payload)
    -- payload.incidentId, payload.keyword, payload.coords, payload.priority, payload.units ...
end)
```
Alternativ `adapter = 'custom'` und Funktionen in `Config.DispatchCustom` hinterlegen.
Der vollständige Payload ist am Kopf von `bridge/dispatch.lua` dokumentiert
(ID, Art, Stichwort, Alarmtext, Koordinaten, Priorität, Einsatzmittel, Personen inkl. Status,
Gefahren, Feuerlage, Zeitstempel, Änderung).

### Eingehend (Leitstelle → Creator): Server-Exports
```lua
exports.einsatz_creator:GetActiveIncidents()            -- Liste der Payloads aktiver Live-Einsätze
exports.einsatz_creator:GetIncident(id)                 -- Payload oder nil
exports.einsatz_creator:SetIncidentPhase(id, phase, note)
exports.einsatz_creator:EndIncident(id, reason)         -- normal beenden (idempotent)
exports.einsatz_creator:CancelIncident(id, reason)      -- abbrechen, Szene entfernen (idempotent)
exports.einsatz_creator:ReAlarmIncident(id)
exports.einsatz_creator:GetScenarios()                  -- gespeicherte Szenarien
exports.einsatz_creator:StartScenario(scenarioId, mode) -- 'live' | 'test'
```
Client-Exports: `exports.einsatz_creator:OpenCreator()`, `IsCreatorOpen()` (z. B. für ein Adminmenü).

## 6. Sicherheit und Stabilität

- Alle Aktionen laufen über ein zentrales Server-Event mit Rechteprüfung, Rate-Limit und Größenlimit.
- Szenarien werden serverseitig vollständig normalisiert (Typen, Wertebereiche, Textlängen,
  Koordinaten innerhalb der Karte und max. 400 m vom Einsatzort, Modellnamen, Sperrliste, Grenzen).
- Maßnahmen der Einsatzkräfte: Rolle, Abstand, Zustand und **Mindestdauer** werden serverseitig geprüft.
- Löschtreffer: nur mit passender Waffe (serverseitig geprüft), in Reichweite, begrenzte Trefferrate.
- Jede erzeugte Entity trägt den State-Bag `ec` mit Einsatz-ID; gelöscht wird nur, was dazu passt.
  Fremde Fahrzeuge, Props und Spieler-Entities werden nie angefasst.
- Beenden/Abbrechen ist idempotent. Fehler beim Aufbau → Rollback.
- Absturz/Neustart: `data/runtime.json` merkt sich erzeugte Entities; beim nächsten Start werden
  Reste entfernt und die Einsätze als abgebrochen protokolliert. Beim Stoppen der Resource wird alles geräumt.
- Creator schließt sicher (Kamera, NUI-Fokus, Freeze) – auch bei Resource-Stop, Tod oder Fehlern.
- Speicherung: Formatversion + Migration, `.bak` vor jedem Schreiben, Gegenlesen, beschädigte
  Dateien werden als `.corrupt-*` gesichert und nicht überschrieben.

## 7. Tests

**Offline (ohne FiveM):** `lua5.4 tests/server_test.lua` (benötigt `dkjson`).
Spielt Speichern, Auslösen, Löschen mit z_hose, Patientenablauf, Türöffnung, Ölspur,
Beenden, Doppelauslösung, Rollback, Neustart-Bereinigung, beschädigte Datei und Rechte durch.

**Ingame-Checkliste**

- [ ] `/einsatzcreator` ohne Recht → „Keine Berechtigung“
- [ ] Creator öffnen: Charakter eingefroren, Kamera frei, Reichweite 800 m begrenzt
- [ ] Fahrzeug setzen, drehen (Mausrad), verschieben (G), numerisch ändern, duplizieren, löschen
- [ ] Mehrere Props + Absperrlinie setzen
- [ ] Feuer (mehrere Herde, Ausbreitung) und Rauch ohne Feuer setzen; Feuer an Fahrzeug koppeln
- [ ] VU ohne Vorlage aufbauen: 2 Fahrzeuge, NPC eingeklemmt im Fahrzeug, Trümmer, Ölspur
- [ ] Türöffnung: echte Tür anklicken, Patient hinter der Tür verknüpfen
- [ ] Speichern, Creator schließen, wieder öffnen, Szenario laden → identisch
- [ ] Test auslösen → nur Auslösender alarmiert, `[TEST]`-Blip, keine Bridge-Events
- [ ] Live auslösen → Rollen alarmiert, Bridge `created`
- [ ] Mit z_hose löschen (Wasser/Schaum), Glutnest nachlöschen; Rauch verschwindet danach
- [ ] Patient: befreien → sichten → versorgen → RTW einladen → Klinik übergeben
- [ ] Tür öffnen, Ölspur abstreuen, Fundstelle sichern
- [ ] Einsatz beenden / abbrechen → Szene entfernt, eigene Spielerfahrzeuge bleiben
- [ ] Zweimal beenden → keine Fehler
- [ ] `restart einsatz_creator` während Einsatz und mit offenem Creator → nichts bleibt zurück, niemand eingefroren
- [ ] z_hose gestoppt → Creator läuft weiter, Löschen nur mit Feuerlöscher

## 8. Bekannte technische Grenzen

- GTA-Props lassen sich nicht skalieren; Größe gibt es nur für Feuer, Rauch, Gebiete und Ölspuren.
- Partikeleffekte und Animationen werden beim Laden geprüft; nicht vorhandene fallen auf
  Standardeffekte/-posen zurück.
- Die Ölspur ist ein GTA-Decal und wird lokal auf jedem Client gezeichnet.
- Die Türverriegelung nutzt das GTA-Türsystem. Bei Konflikten mit einem Doorlock-Script
  `Config.Doors.useDoorSystem = false` setzen (Tür bleibt dann eine logische Station).
