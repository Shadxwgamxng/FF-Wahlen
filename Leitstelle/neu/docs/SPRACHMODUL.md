# Sprachtest (Sprachmodul, Prototyp)

Der Bereich **Sprachtest** übt die Notrufabfrage per Sprache. Er ist bewusst von der laufenden Simulation getrennt und nutzt einen festen Testfall.

## Was er kann

- Du nimmst einen Testanruf an und sprichst wie am Notrufplatz (Mikrofon, Taste **M**) oder tippst deine Fragen.
- Ein **simulierter Anrufer** antwortet, wenn möglich per Sprachausgabe des Browsers.
- Es gibt **nur ein Live-Transkript**. Du trägst Einsatzort, Personen in Gefahr, Verletzte, Meldebild und Stichwort selbst in die Maske ein. Nichts wird automatisch übernommen.
- Nach dem Gespräch vergleicht eine **Auswertung** deine Eingaben und deine Fragen mit dem Testfall.
- **Freisprechen**: Nach jeder Antwort des Anrufers hört die Erkennung automatisch wieder zu.
- Unter „Nächster Testanruf“ wechseln Adresse, Stockwerk und Lage, das Szenario bleibt gleich.

## Der Anrufer ist eine Simulation

- Er ist **regelbasiert**, ohne KI und ohne Netzwerkzugriff (`src/voice/intents.ts`, `src/voice/caller.ts`).
- Er erkennt Fragen über Wortmuster und ordnet sie den Abfragefragen des Spiels zu (`src/data/questions.ts`).
- Inhaltliche Antworten kommen **nur aus den Szenariofakten**. Fehlt ein Fakt, sagt er, dass er es nicht weiß. Sonst gibt es nur inhaltsleere Floskeln wie „Wie bitte?“, „Okay, danke.“ oder „Bitte beeilen Sie sich!“.
- Er versteht außerdem:
  - Begrüßung
  - Frage nach dem Namen
  - Beruhigung („Hilfe ist unterwegs“): Der Anrufer wird ruhiger.
  - Bitte um Wiederholung
  - Buchstabieren der Straße nach DIN 5009
  - Anweisungen
  - Verabschiedung: Der Anrufer legt auf.
- Ohne Zusage, dass Hilfe kommt, wird er mit der Zeit ungeduldiger. Seine Aufregung beeinflusst Sprechtempo und Tonhöhe.
- Die Erkennung arbeitet mit Mustern. Ungewöhnliche Formulierungen versteht der Anrufer nicht und fragt nach. Auch Erkennungsfehler des Browsers („Stockwerk“ als „Stock Werk“) können zu Nachfragen führen.

## Datenschutz und Kosten

- **Kosten:** keine. Es wird nur verwendet, was der Browser mitbringt (Web Speech API).
- **Einwilligung:** Vor der ersten Nutzung erscheint ein Dialog. Du wählst dort:
  - **nur auf dem Gerät**: nur möglich, wenn der Browser Deutsch lokal erkennen kann. Das prüfst du mit „Erkennung auf dem Gerät prüfen“. Kann der Browser das nicht zusichern, startet die Erkennung nicht. Sie weicht nie stillschweigend auf einen Online-Dienst aus.
  - **über den Browserdienst**: Chrome und Edge senden das Audio dann an den Spracherkennungsdienst ihres Herstellers.
  - **nur Texteingabe**: kein Mikrofon.
- **Mikrofon:** Es ist nur aktiv, solange die Erkennung läuft (Schaltfläche „Sprechen“ oder Freisprechen während des Gesprächs). Audio wird nicht gespeichert.
- **Sprachausgabe:** Manche Stimmen sind Online-Stimmen (in der Stimmauswahl mit „(online)“ markiert). Dabei wird nur der Antworttext des simulierten Anrufers übertragen.
- **Transkripte:** nur Text und ausschließlich im `localStorage` dieses Browsers, höchstens 30 Gespräche. Du kannst sie einzeln oder alle löschen und als Textdatei speichern. Der Widerruf der Einwilligung löscht Einwilligung und alle Transkripte.

## Bekannte Grenzen

- Ein fester Testfall (Küchenbrand mit Person in der Wohnung). Der Sprachmodus ist noch **nicht** in die laufende Simulation eingebaut.
- Firefox hat keine Spracherkennung, dort bleibt die Texteingabe. Safari wurde nicht getestet.
- Die Abfrage, ob Deutsch auf dem Gerät erkannt werden kann (`SpeechRecognition.available`), hängt in manchen Chromium-Builds oder lässt den Tab abstürzen. Deshalb läuft sie nur auf Klick und bricht nach 8 Sekunden ab.
- Echte Spracherkennung lässt sich nicht automatisiert testen. Der Browser-Test prüft den Ablauf über die Texteingabe. Ob die Spracherkennung selbst funktioniert, musst du im eigenen Browser mit Mikrofon testen.
- Eine KI-Variante (z. B. ein Realtime-Sprachmodell) ist **nicht** eingebaut, weil sie Kosten verursachen würde.

## Dateien

| Datei | Inhalt |
|---|---|
| `src/voice/intents.ts` | Erkennung von Fragen und Gesprächsabsichten |
| `src/voice/caller.ts` | simulierter Anrufer (Antworten, Emotion, Buchstabieren) |
| `src/voice/testCall.ts` | fester Testfall und Auswertung |
| `src/voice/transcripts.ts` | Einwilligung und Transkripte (localStorage) |
| `src/voice/speech.ts` | Anbindung an die Web Speech API |
| `src/ui/views/VoiceTestView.tsx` | Oberfläche |
| `src/voice/voice.test.ts` | Unit-Tests |
