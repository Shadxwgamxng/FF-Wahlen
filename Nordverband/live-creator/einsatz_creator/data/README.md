# Datenordner

Hier speichert der Einsatz-Creator seine Daten (wird automatisch angelegt bzw. befuellt):

| Datei | Inhalt |
| --- | --- |
| `scenarios.json` | gespeicherte Szenarien |
| `runtime.json` | aktuell erzeugte Einsatz-Entities (zur Bereinigung nach Absturz/Neustart) |
| `history.json` | Protokoll beendeter Einsaetze |
| `*.bak` | automatische Sicherung des vorherigen Stands |
| `*.corrupt-*` | Kopie einer beschaedigten Datei (wird nie automatisch geloescht) |

**Bei Updates der Resource diesen Ordner nicht ueberschreiben oder loeschen.**
Der Ordner muss fuer den FXServer beschreibbar sein.
