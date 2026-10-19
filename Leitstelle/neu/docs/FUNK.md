# Sprechfunk mit den Fahrzeugen

LEITWARTE bildet den BOS-Sprechfunk zwischen Leitstelle und Fahrzeugen nach. Die Besatzungen sind simuliert und regelbasiert (keine KI). Es entstehen keine Kosten.

## Bedienung

- **Rufgruppe schalten:** am Tablet (Funkbedienplatz) oder am PC im Funkpanel. Ein Fahrzeug antwortet nur, wenn seine Rufgruppe geschaltet ist.
- **Senden:** die Sendetaste gedrückt halten, sprechen, loslassen.
  - am Tablet: große Taste „Senden“
  - am PC: Taste „Senden“ im Funkpanel oder **F8** gedrückt halten
  - Mikrofon, Spracherkennung und die Antworten der Besatzung (Sprachausgabe mit Rauschen) laufen **immer am Leitstand-PC**, auch wenn am Tablet gedrückt wird.
- **Tippen statt sprechen:** Im Funkpanel am PC lässt sich jeder Funkspruch auch eintippen.
- **Knöpfe bleiben:** „Ansprechen“, „Quittieren“ und „Ziel zuweisen“ funktionieren weiterhin ohne Sprechen.

Beim ersten Mal muss das Mikrofon im Funkpanel am PC freigegeben werden (gleiche Einwilligung wie im Sprachtest). Die Spracherkennung des Browsers läuft je nach Wahl auf dem Gerät oder beim Browserhersteller. LEITWARTE speichert keine Audiodaten.

## Status 5 (Sprechwunsch)

Drückt ein Fahrzeug Status 5, ist zunächst nur der Sprechwunsch zu sehen. Was die Besatzung will, erfährst du erst, wenn du sie ansprichst:

> **Leitstelle:** Florian Ostholstein 61-48-01 von Leitstelle, kommen.
> **Fahrzeug:** Hier Florian Ostholstein 61-48-01, Nachforderung: Polizei zur Einsatzstelle, kommen.
> **Leitstelle:** Verstanden, Polizei wird alarmiert, Ende.

Mit „Verstanden …“ ist die Meldung quittiert. Die nachgeforderten Kräfte alarmierst du wie gewohnt in der Einsatzmaske.

## Aufträge an Fahrzeuge

Nach dem Rufnamen (oder als Folgesatz an das zuletzt angesprochene Fahrzeug):

| Du sagst (Beispiele) | Wirkung |
|---|---|
| „… Status?“, „geben Sie Ihren Status“ | Fahrzeug nennt seinen Status |
| „… Lagemeldung“, „wie ist die Lage?“ | Lagemeldung aus dem Spielstand (Anfahrt, Patienten, Fortschritt, offene Nachforderung) |
| „… übernehmen Sie den Einsatz in der Kirchhofsallee“, „… Einsatz 12“ | Fahrzeug wird dem Einsatz zugeteilt (wie Alarmieren) |
| „… fahren Sie Klinikum Neustadt an“, „Transportziel Sana Eutin“ | Transportziel für den wartenden Patienten |
| „… rücken Sie ein“, „Sie sind entlassen“ | Fahrzeug wird entlassen und rückt ein |
| „Verstanden, Ende“ | offene Meldung quittiert |
| „Anrufer meldet Person aus Wasser geborgen, jetzt unter Reanimationsmaßnahmen“, „Zur Info: …“ | Lagemitteilung: Die Besatzung wiederholt sie sinngemäß und bestätigt („Person aus Wasser geborgen, wird nun reanimiert, das haben wir verstanden, kommen“). Auf Anfahrt nennt sie dazu die Ankunftszeit. Die Mitteilung steht im Einsatzprotokoll. |

Rufnamen werden in vielen Schreibweisen erkannt. Die führende Null musst du nicht sprechen: „61 48 eins“ reicht für 61-48-01. Ebenso „einundsechzig achtundvierzig eins“, „null eins“ oder zusammengezogene Zahlen der Erkennung („6148 1“, „61481“). Auch die Besatzungen sprechen ihren Rufnamen so: „einundsechzig achtundvierzig eins“. Kurze Rufnamen („Christoph 12“) nur zusammen mit dem Organisationswort.

## Grenzen

- Die Erkennung arbeitet mit Mustern. Ungewöhnliche Formulierungen führen zu „Leitstelle, bitte wiederholen“.
- Die Sprachausgabe des Browsers lässt sich nicht filtern. Der Funkklang ist deshalb ein Rauschen vor und nach dem Spruch, kein echter Funkfilter.
- Spracherkennung gibt es in Chrome und Edge. In anderen Browsern bleibt das Tippen.

## Dateien

- `src/sim/funk.ts`: Rufnamen, Aufträge, Antworten der Besatzung (Befehle `radioTalk`, `radioCall`)
- `src/ui/funk.tsx`: Sendetaste, Funkverkehr, Erkennung und Sprachausgabe am PC
- `src/sim/funk.test.ts`, `e2e/lan.mjs`: Tests
