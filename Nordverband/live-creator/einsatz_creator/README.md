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
| Pflicht | `ox_lib` (Behandlungsmenü) |
| Eingerichtet für | `qb-core` (Jobs `fire`, `ambulance`, `ambulance2`, Dienststatus), `z_fire` (Feuer/Rauch), `z_hose` (über z_fire), RTW `bftecrtw`/`bftecrtw2`/`bftecrtw3`, NEF und KTW vorerst `ambulance`, `ox_target` (Interaktionen), `emergencydispatch` (Leitstelle) |
| Fallbacks | ohne z_fire: eigenes Feuersystem (Standard `Config.Fire.backend = 'auto'` schaltet automatisch um), ohne ox_target: Taste E. Alarmiert wird ausschließlich über EmergencyDispatch |

## 2. Installation

1. Ordner `einsatz_creator` nach `resources/` kopieren.
2. Speicherung (wie bei visn_are): **jeder Einsatz ist eine eigene Datei** in `einsatz_creator/data/incidents/` (`<ID>.json`, z. B. `SZ-4F2A1C.json`), dazu `index.json` mit der Liste der Einsätze. Keine Datenbank nötig. Der Ordner `data/` muss für den Server beschreibbar sein. Optional geht auch MySQL über oxmysql (`Config.Storage.backend = 'oxmysql'`).
3. `server.cfg`:

```cfg
# OneSync muss aktiv sein (txAdmin: Einstellungen > OneSync "on")
set onesync on

# optionale Ressourcen VOR dem Creator starten
ensure qb-core
ensure ox_lib
ensure ox_target
ensure z_hose
ensure z_fire        # optional, ohne z_fire laeuft das eigene Feuersystem
ensure emergencydispatch

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
```

4. Mit Framework: Jobnamen der Rollen in `config.lua` → `Config.Roles` prüfen.
   Optional können Creator-Rechte zusätzlich über Jobs vergeben werden (`Config.Permissions.jobs`).
5. Server neu starten bzw. `ensure einsatz_creator`.

**Updates:** den Ordner `data/` niemals überschreiben oder löschen – in `data/incidents/` liegen alle Einsätze. Vorhandene Daten aus `incidents.json`/`scenarios.json` oder aus der Datenbank (Version 1.1.0) werden beim ersten Start automatisch in Einzeldateien umgewandelt.

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

**Übersicht (ohne Kamera):** Nach dem Öffnen erscheint die Übersicht mit drei Reitern:
*Einsätze* (gespeicherte Einsätze bearbeiten, testen, an die Leitstelle übergeben, duplizieren, löschen),
*Laufende Einsätze* (Phase, erneut melden, Wegpunkt, Beenden, Abbrechen) und *Zufallseinsätze*.
Die freie Kamera ist hier gesperrt.

**Neuer Einsatz:** *Neuer Einsatz* öffnet einen Assistenten. Erst wenn alle Pflichtangaben ausgefüllt sind, geht es weiter:
1. *Einsatz*: Einsatzart, Einsatzname, Stichwort, Priorität
2. *Leitstelle*: EmergencyDispatch-Job (Auswahl aus `Config.EmergencyDispatch.jobs`), Notrufmeldung, optional Adresse
3. *Lage*: Einsatzbeschreibung, optional Gefahren, Personen, Felder der Einsatzart, Einsatzmittel, SOP, Notizen
4. *Prüfen* → **Szene bauen**

**Szene bauen (mit Kamera):** zuerst den *Einsatzort* in der Welt anklicken, dann Elemente aus *Werkzeuge* setzen.
Einsatzdaten sind jederzeit über *Einsatzdaten* änderbar. *Speichern* · *Testen* (Szene wird aufgebaut, **keine** Übergabe an die Leitstelle) ·
*An Leitstelle übergeben*. *Übersicht* bzw. `Esc` führt zurück (bei ungespeicherten Änderungen: speichern, verwerfen oder abbrechen).
Gestaltet nach dem ignis-Design (dunkel, Geist-Schrift), Akzent blau.

Werkzeuge: Fahrzeug, Objekt, Absperrlinie, Feuer, Rauch, NPC/Patient, Position/Fundstelle,
Einsatzgebiet, Tür (echte Kartentür wird erkannt und verriegelt), Betriebsstoff/Ölspur.
Feuer/Rauch lassen sich an Fahrzeuge/Objekte koppeln, NPCs in Fahrzeuge setzen (eingeklemmt).

### Einsatzkräfte
| Befehl / Taste | Funktion |
|---|---|
| Alarmierung | ausschließlich über EmergencyDispatch (der Creator alarmiert keine Jobs/Spieler selbst) |
| `/einsatzinfo` | Lage, Gefahren, SOP, Patientenübersicht, Protokoll |
| ox_target an Patient/Tür/Ölspur/Fundstelle | passende Maßnahmen je Rolle und Zustand (ohne ox_target: Taste `E`) |
| `X` | laufende Maßnahme abbrechen |

### Medizinische Versorgung (aus nv_medicDispatches übernommen)
ox_target am Patienten → **Medizinische Versorgung** (ox_lib-Menü, nur Rollen aus `Config.Medical.roles`):
- **Gespräch:** Ansprechen, Was ist passiert, Schmerzen, Name, Krankenkasse (Antworten je Meldebild; Rausch-, undeutliche, erschöpfte Sprache; bewusstlos = keine Reaktion)
- **Diagnostik:** RR, HF, SpO2, BZ, Temperatur, Pupillen, GCS, Atemfrequenz
- **Sauerstoff** 2/4/6/8 l (SpO2 + 0,8 je Liter), **Zugang legen**
- **Medikamente/Infusionen** (Akrinor, Ebrantil, Haemiton, Atropin, Suprarenin, Atrovent, Salbutamol, G20, Buscopan, Novalgin, Fenistil, Paracetamol, Ketanest, Oxytocin, G5, Jonosteril) –
  nur mit Zugang, Kreislauf/Atmung/BZ-Medikamente erst nach Messung; Wirkung erst bei erneuter Messung sichtbar
- **Bodycheck** über 16 Körperregionen → Pflaster, Verband, Schiene, Stifneck (SHT), Beckenschlinge (Becken instabil)
- **Transport:** besprechen, auf die Trage legen (`rda_stretcher`, `c5m-stretcher`), kein Transport nötig
- Status **„versorgt / transportbereit“** erst, wenn alle offenen Maßnahmen erledigt sind (`Config.Medical.requireCompleteCare`)

Ablauf: *eingeklemmt* → Befreien (Feuerwehr) → Versorgung → Trage / RTW → Übergabe am **Transportziel**
(beliebige Klinik, andere Klinik bei Verlegung, oder Zielort-Position im Szenario).
Alle Werte liegen auf dem Server; der Client sieht nur Gemessenes.

Im Creator je Patient: **Meldebild** (Kreislauf, Alkohol, Drogen, Reanimation, Schwindel, Sturz, Diabetes, Atemnot,
Bauchschmerzen, Verlegung) mit Variante oder zufällig, Geschlecht, **zufälliger Name** und **zufälliges Modell**
(Listen aus nv_medicDispatches), Verletzungen je Körperregion (leer = laut Meldebild, Sturz würfelt), Transportziel.

### Feuer: z_fire (Standard) und z_hose
Mit `Config.Fire.backend = 'z_fire'` werden Brände und Rauch über die dokumentierten z_fire-Exports
(`createFire`, `createSmoke`, `deleteFires`, `getAllFires`, `getAllSmoke`, Client `deleteSmokeById`) erzeugt.
Löschen mit z_hose, Ausbreitung und Glutnester übernimmt z_fire. Der Creator prüft schon beim Setzen, ob ein Feuer zum Brandverhalten passt: Fahrzeug-/Objektbrand nur direkt auf einem gesetzten Fahrzeug/Objekt, Innenraumbrand nur in einem Gebäude (Room-Key wird automatisch erkannt), Flächenbrand nur im Freien, „Automatisch“ wählt passend. Im Creator: Partikeltyp (`Config.ZFire.fireEffects`
mit eurer z_fire-Config abgleichen!), Brandverhalten (grass/interior/prop/vehicle), Kopplung an Fahrzeuge/Objekte,
Room-Key für Innenraumbrände („Raum ermitteln“). Beim Beenden werden nur die eigenen UUIDs (und deren Ableger) gelöscht.

Fallback `Config.Fire.backend = 'internal'`: Das Feuersystem ist eigenständig (Brandherde mit Lebenspunkten, Ausbreitung, Brenndauer,
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

## 5. Zufallseinsätze

Tab **Zufall** im Creator (Recht `einsatzcreator.live`):
- Generator an/aus, Abstand (min/max Minuten), max. gleichzeitige Zufallseinsätze, Tageszeit-Grenzen.
- Je gespeichertem Szenario: *im Zufallspool*, Gewichtung (1–10), Tageszeit (immer/Tag/Nacht),
  Sperrzeit nach einem Start, Mindestanzahl Kräfte **im Dienst** je Rolle.
- „Jetzt auslösen“ startet sofort einen passenden Einsatz aus dem Pool.
Zufallseinsätze laufen wie Live-Einsätze (Notruf an EmergencyDispatch). Einstellungen liegen in `data/settings.json`.
Export: `exports.einsatz_creator:TriggerRandomIncident()`.

### Ortsvarianten
Werkzeug **Ortsvariante** (oder Tab *Einsatz* → *Ortsvariante setzen*): alternative Einsatzorte anklicken, Mausrad dreht.
Beim Auslösen: Originalort, bestimmte Variante oder zufällig. Zufallseinsätze wählen zufällig.
Die ganze Szene wird verschoben und gedreht (Höhe über den Mittelpunkt) – Varianten auf ähnlichem Untergrund setzen.
Kartentüren werden an Varianten nicht verriegelt.

### Notruftext
Im Alarmtext sind Platzhalter möglich: `{anruf}` (zufälliger Notruftext des Meldebilds, Tag/Nacht nach Serverzeit),
`{patient}`, `{ziel}`. Leerer Alarmtext + Patient mit Meldebild → Notruftext wird automatisch verwendet.

## 6. Leitstellen-Bridge

Datei: `bridge/dispatch.lua`. **Testeinsätze werden nie übergeben.**

### EmergencyDispatch (aktiv: `Config.Dispatch.adapter = 'emergencydispatch'`)
Beim Live-Auslösen wird je alarmierter Rolle ein Notruf angelegt – über das dokumentierte Server-Event
```lua
TriggerEvent('emergencydispatch:emergencycall:new', job, meldung, coords, true)
```
Jeder Einsatz geht als **ein Notruf** an die beim Anlegen gewählte Leitstelle (Job), Koordinate = Einsatzort. Auswahlliste: `Config.EmergencyDispatch.jobs`, Vorauswahl: `Config.EmergencyDispatch.job` (aktuell `ambulance`). Jeder Notruf wird in der Serverkonsole protokolliert.
Stichwort-Auswahl und Alarmierung nach AAO macht der Disponent in EmergencyDispatch.
EmergencyDispatch bietet **keine** Schnittstelle für Statusänderungen oder das Beenden von Einsätzen;
diese werden zusätzlich als `einsatzcreator:bridge:*`-Events ausgelöst (siehe unten).
Der Creator alarmiert selbst keine Jobs oder Spieler (keine Popups, Blips oder Töne) – das übernimmt EmergencyDispatch. `/einsatzinfo` funktioniert weiter.

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

## 7. Sicherheit und Stabilität

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

## 8. Tests

**Offline (ohne FiveM):** `lua5.4 tests/server_test.lua` (benötigt `dkjson`).
Spielt Speichern, Auslösen, Löschen mit z_hose, Patientenablauf, Türöffnung, Ölspur,
Beenden, Doppelauslösung, Rollback, Neustart-Bereinigung, beschädigte Datei, z_fire-Backend,
EmergencyDispatch-Notrufe, Zufallseinsätze und Rechte durch.

**Ingame-Checkliste**

- [ ] `/einsatzcreator` ohne Recht → „Keine Berechtigung“
- [ ] Creator öffnen: Charakter eingefroren, Kamera frei, Reichweite 800 m begrenzt
- [ ] Fahrzeug setzen, drehen (Mausrad), verschieben (G), numerisch ändern, duplizieren, löschen
- [ ] Mehrere Props + Absperrlinie setzen
- [ ] Feuer (mehrere Herde, Ausbreitung) und Rauch ohne Feuer setzen; Feuer an Fahrzeug koppeln
- [ ] VU ohne Vorlage aufbauen: 2 Fahrzeuge, NPC eingeklemmt im Fahrzeug, Trümmer, Ölspur
- [ ] Türöffnung: echte Tür anklicken, Patient hinter der Tür verknüpfen
- [ ] Speichern, Creator schließen, wieder öffnen, Szenario laden → identisch
- [ ] Test auslösen → Szene steht, nur Auslösender bekommt eine Info, kein Notruf in EmergencyDispatch
- [ ] An Leitstelle übergeben → Notruf erscheint in EmergencyDispatch (Job `fire`), Bridge `created`
- [ ] Mit z_hose löschen (Wasser/Schaum), Glutnest nachlöschen; Rauch verschwindet danach
- [ ] Patient: befreien → sichten → versorgen → RTW einladen → Klinik übergeben
- [ ] Tür öffnen, Ölspur abstreuen, Fundstelle sichern
- [ ] Einsatz beenden / abbrechen → Szene entfernt, eigene Spielerfahrzeuge bleiben
- [ ] Zweimal beenden → keine Fehler
- [ ] `restart einsatz_creator` während Einsatz und mit offenem Creator → nichts bleibt zurück, niemand eingefroren
- [ ] z_hose gestoppt → Creator läuft weiter, Löschen nur mit Feuerlöscher

## 9. Bekannte technische Grenzen

- GTA-Props lassen sich nicht skalieren; Größe gibt es nur für Feuer, Rauch, Gebiete und Ölspuren.
- Partikeleffekte und Animationen werden beim Laden geprüft; nicht vorhandene fallen auf
  Standardeffekte/-posen zurück.
- Die Ölspur ist ein GTA-Decal und wird lokal auf jedem Client gezeichnet.
- Die Türverriegelung nutzt das GTA-Türsystem. Bei Konflikten mit einem Doorlock-Script
  `Config.Doors.useDoorSystem = false` setzen (Tür bleibt dann eine logische Station).

## Lizenzen der mitgelieferten Oberflächen-Dateien
- Font Awesome Free 6.7.2 (Icons: CC BY 4.0, Schrift: SIL OFL 1.1) – `html/vendor/fontawesome/LICENSE.txt`
- Geist / Geist Mono (Vercel, SIL OFL 1.1) – `html/vendor/geist/OFL.txt`
