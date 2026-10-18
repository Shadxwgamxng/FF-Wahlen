# Standardisierte Notrufabfrage (DIAS)

LEITWARTE kann einen **eigenen Export** einer standardisierten Notrufabfrage im Format des DIAS-Mitschnitts (JSON mit `nodes` und `edges`) einlesen. Die Inhalte (Fragen, Meldebilder, Infotexte) gehören der jeweiligen Leitstelle. Sie sind **nicht** Teil von LEITWARTE und werden nicht mitgeliefert.

## Import

**Daten & Einstellungen → Notrufabfrage (DIAS) → DIAS-Datei importieren.**

- Die Datei wird nur in diesem Browser gespeichert (IndexedDB) und lässt sich dort wieder löschen.
- Beim Import wird die Datei verkleinert, aus 12 MB werden etwa 2,7 MB.

## Ablauf im Spiel

1. Beim Annehmen eines Notrufs zeigt die Einsatzmaske rechts die Abfrage.
2. Du stellst die angezeigte Frage selbst und klickst die Antwort an. Mit der Tastatur geht das so: Fokus in die Abfrage, dann den Antwortcode drücken. Die Rücktaste geht einen Schritt zurück.
3. Mit einem Klick auf einen früheren Schritt änderst du ab dort deine Antworten.
4. Am Ende zeigt die Abfrage:
   - das **Abfrageergebnis**: Meldebild mit Ergebnisnummer, je Fachbereich
   - das **regionale Alarmstichwort**
   - die **Info-Bausteine** (intern und extern)
5. **„In Einsatzmaske übernehmen“** übernimmt:
   - das zugeordnete Stichwort
   - das Meldebild als Alarmierungstext
   - die gewählten Antworten und Info-Bausteine als Hinweise

## Zuordnung der Stichwörter

DIAS schreibt einige Stichwörter anders als der Katalog Schleswig-Holstein. `src/dias/keywordMap.ts` ordnet sie zu:

- `THHÖHE` → `TH SRHT`
- `FEU Y` → `FEU 00 Y`
- `R5`/`R10`/`R15`/`R20` → `R0`/`R1`/`R2`/`R2`
- Zusätze wie `NAIK` oder `FIRST` werden weggelassen

Diese Fälle setzen kein Stichwort und zeigen einen Hinweis:

- `WNG`: kein regionales Stichwort vergeben, Rettungsdienst-Stichwort selbst wählen
- „Beratung – kein Feuerwehreinsatz“
- unbekannte Codes

Das Stichwort lässt sich nach dem Übernehmen jederzeit ändern.

## Grenzen des Mitschnitts

- **Lücken:** Der Mitschnitt enthält keine Eingaben für Alter, Freitext, Körperschema und Sonderfelder. Dort endet die Abfrage mit einem Hinweis, und du wählst das Stichwort selbst.
- **Geteilte Ergebnisseiten:** Mehrere Abfragewege führen auf dieselbe Ergebnisseite. Die dort gespeicherte Zusammenfassung gehört zum Weg der Aufzeichnung. Deshalb bildet LEITWARTE den Infotext aus den Antworten, die du tatsächlich gewählt hast.
