# Einsatz-Creator – Ersteinrichtung auf einem neuen Server

Kurze Liste, was vor dem ersten Start geprüft bzw. angepasst werden muss.
Alle Einstellungen stehen in `config.lua` (Details in `README.md`).

## 1. Voraussetzungen
- **OneSync** muss aktiv sein (txAdmin → Einstellungen → OneSync „on“).
- **ox_lib** ist Pflicht.
- Empfohlen: **ox_target** (Interaktion; ohne → Taste E), **EmergencyDispatch** (Leitstelle).
- Optional: **z_fire** + **z_hose** (ohne z_fire läuft automatisch das eingebaute Feuersystem, löschbar mit z_hose oder Feuerlöscher).
- Keine Datenbank nötig.

## 2. server.cfg
```cfg
ensure ox_lib
ensure ox_target
ensure emergencydispatch
ensure z_fire          # optional
ensure z_hose          # optional
ensure technical_dispatches_objects   # optional (Kettensaege, Oelflecken ...)
ensure technical_dispatches           # optional (Items)
ensure einsatz_creator

# Wer darf den Creator benutzen? (Beispiel: Admin-Gruppe)
add_ace group.admin einsatzcreator.use allow      # öffnen, bauen, speichern, testen
add_ace group.admin einsatzcreator.live allow     # an die Leitstelle übergeben
add_ace group.admin einsatzcreator.manage allow   # fremde Einsätze beenden
add_ace group.admin einsatzcreator.delete allow   # fremde Einsätze löschen
```
Einzelne Person: `add_ace identifier.license:<LIZENZ> einsatzcreator.use allow`

## 3. Ordner `data/`
- Muss für den Server **beschreibbar** sein. Darin liegen alle Einsätze (`data/incidents/<ID>.json`).
- Bei späteren Updates **nie überschreiben oder löschen**.

## 4. config.lua anpassen
| Was | Wo | Prüfen / ändern |
|---|---|---|
| Framework | `Config.Framework` | `auto` erkennt qb-core, qbx_core, ESX. Ohne Framework: `none` (dann nur ACE) |
| Jobs der Einsatzkräfte | `Config.Roles` | Jobnamen von Feuerwehr / Rettungsdienst / Polizei eintragen (bei uns `fire`, `ambulance`, `ambulance2`) |
| Nur im Dienst | `Config.OnlyOnDuty` | `true` = nur Spieler im Dienst können interagieren |
| Leitstellen | `Config.EmergencyDispatch.jobs` / `.job` | Jobs, an die Notrufe gehen dürfen, und Vorauswahl. Müssen in EmergencyDispatch als Leitstelle existieren |
| Name der Leitstellen-Resource | `Config.EmergencyDispatch.resource` | Standard `emergencydispatch` |
| Rettungswagen | `Config.Rescue.vehicles`, `transportVehicles`, `transportSeats` | **Unsere Addon-Fahrzeuge `bftecrtw`, `bftecrtw2`, `bftecrtw3` gibt es dort evtl. nicht** → eigene Spawnnamen eintragen (sonst Patienten nicht einladbar), Sitzplatz des Patienten anpassen |
| Fahrzeugkatalog im Creator | `config_catalog.lua` → Gruppe „Rettungsdienst: RTW/NEF/KTW“ | gleiche Spawnnamen wie oben |
| Tragen | `Config.Rescue.stretcherModels` | `rda_stretcher`, `c5m-stretcher` nur, wenn diese Resources vorhanden sind |
| Kliniken | `Config.Rescue.hospitals` | **Koordinaten an die eigene Map anpassen** (St. Fiacre, BWK, Rehaklinik usw. sind Custom-Maps von uns) |
| z_fire-Effekte | `Config.ZFire.fireEffects` / `smokeEffects` | nur bei z_fire: Namen mit der eigenen z_fire-Config abgleichen |
| Befehle | `Config.Commands` | Standard `/einsatzcreator` und `/einsatzinfo` |

## 4a. Items für aufgezogene Spritzen (ox_inventory)

Wer ein Medikament aufzieht, bekommt eine **aufgezogene Spritze** als Item (mit Wirkstoff, Menge, ml, Uhrzeit und Namen in den Metadaten). Beim Injizieren wird sie verbraucht und man bekommt eine **benutzte Spritze**.

1. Den Inhalt von `install/ox_inventory/items.lua` in `ox_inventory/data/items.lua` einfügen.
2. Die Bilder aus `install/ox_inventory/web/images/` nach `ox_inventory/web/images/` kopieren.
3. `ensure ox_inventory` muss **vor** `ensure einsatz_creator` stehen.
4. Einstellungen in `config.lua` unter `Config.Items` (Item-Namen, benutzte Spritze an/aus, Höchstalter einer Spritze).

Ohne ox_inventory (oder mit `Config.Items.enabled = false`) wird wie bisher direkt nach dem Aufziehen verabreicht.

## 4b. Technical Dispatches (Kettensäge, Besen, Ölbindemittel, Spreizer)

1. `technical_dispatches_objects` **vor** `einsatz_creator` starten (Werkzeug- und Ölfleck-Modelle). Ohne läuft alles mit GTA-Ersatzmodellen.
2. Items sind **nicht** nötig. Optional in `config.lua`: `Config.Tools.require = true` (bzw. `'auto'`), dann müssen `kettensaege`, `besen`, `oelbindemittel`, `spreizer` im Inventar sein.
3. Minispiele: `Config.Tools.minigames` (an/aus, welches Spiel für welche Maßnahme).
4. Bäume: `Config.Trees` (Baummodelle, Sägespäne).

Ablauf Baum: Baum im Creator setzen → Feuerwehr wählt „Baum zersägen“ → Kettensägen-Minispiel → Baum verschwindet, Sägespäne liegen → „Sägespäne aufkehren“ → Besen-Minispiel → Aufgabe erledigt.

## 5. Nach dem ersten Start prüfen (Serverkonsole)
- `Speicherung: JSON-Dateien im Ordner data` – Speichern funktioniert.
- `Einsatz-Creator bereit (Bridge-Adapter: emergencydispatch …)`.
- Keine Meldung „OneSync ist deaktiviert“.
- Ingame: `/einsatzcreator` → „Neuer Einsatz“ → Assistent ausfüllen → Einsatzort setzen → Patient setzen → **Testen**
  → danach **An Leitstelle übergeben**: In der Konsole erscheint `Notruf an Leitstelle "…" uebergeben`, der Notruf muss im EmergencyDispatch-Tablet auftauchen.

## 6. Gut zu wissen
- Der Creator alarmiert selbst niemanden – Alarmierung läuft nur über EmergencyDispatch.
- „Testen“ baut die Szene auf, schickt aber **keinen** Notruf.
- NPCs haben bewusst keine sichtbaren Verletzungen (Blut/Verbrennungen), da das zu Spielabstürzen führte.
- Laufende Einsätze überstehen keinen Serverneustart (sie werden als abgebrochen protokolliert); gespeicherte Einsätze bleiben erhalten.
