# Text zum Einfügen in den anderen Chat

> Kopiere alles unterhalb der Linie in den Chat, in dem dein FiveM-Script entstanden ist, und hänge die ZIP (oder die Dateien aus `html/`, `beispiel/`, `bilder/`) an.

---

Ich möchte in mein bestehendes FiveM-Script (QBCore/Qbox) das **Leitplatz-Overlay** einbauen. Im Anhang ist ein fertiges NUI-Paket:

- `html/` – fertiges Overlay (index.html, style.css, app.js; demo.js nur für die Browser-Vorschau). **Bitte Aussehen und Aufbau nicht verändern**, nur anbinden.
- `SCHNITTSTELLE.md` – genaues Datenformat (`state`) und alle NUI-Nachrichten/Callbacks.
- `STYLEGUIDE.md` – Farben, Statusfarben, Bausteine; gilt für alles, was zusätzlich gebaut wird.
- `beispiel/` – fxmanifest.lua, client.lua, server.lua als Vorlage für QBCore.
- `bilder/` – Screenshots, wie es aussehen soll (Stil „Klassisch“ und „Modern“).

Aufgabe:
1. Kopiere `html/` in meine Resource und ergänze im `fxmanifest.lua` `ui_page` und `files` wie im Beispiel.
2. Übernimm `beispiel/client.lua` (Öffnen per `/leitstelle` bzw. F6, nur für meine Leitstellen-Jobs, NUI-Fokus, Callbacks).
3. Schreibe `BuildState()` so, dass es **meine vorhandenen Daten** (Notrufe, Einsätze, Fahrzeuge/Einheiten, Wachen, Stichwörter, Funk) in das Format aus `SCHNITTSTELLE.md` übersetzt. Zeiten als fertiger Text `HH:MM`.
4. Verbinde jede Aktion in `Actions` mit meinen vorhandenen Funktionen (Notruf annehmen, Einsatz anlegen, alarmieren, entlassen, abschließen, Sprechwunsch, Rufgruppe/Funk). `createIncident` muss die neue `incidentId` zurückgeben.
5. Rufe nach **jeder Änderung** in meinem Script `PushState()` auf (z. B. neuer Notruf, Statuswechsel eines Fahrzeugs), damit alle Disponenten live den neuen Stand sehen.
6. Statuswerte als Text `'1'`–`'8'` oder `'A'`; `group` je Einheit `'fw'`, `'rd'` oder `'kats'`.
7. Fehlt in meinem Script etwas (z. B. Vorschlagsliste `suggestion`), lass das Feld leer statt es zu erfinden, und sag mir, was fehlt.

Vorschau ohne Spiel: `html/index.html` im Browser öffnen (`?style=modern`, `?view=tableau`, `?sel=incident`).
