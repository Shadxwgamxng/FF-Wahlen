# LEITWARTE im lokalen Netz (PC + Tablet)

Mit dem LAN-Server läuft LEITWARTE auf einem Rechner in deinem Netz. Andere Geräte, zum Beispiel ein Tablet, verbinden sich über den Browser.

## Starten

Auf dem Rechner, der als Server dient (das kann auch der Spiel-PC sein):

```
cd Leitstelle/neu
npm install
npm run lan
```

Der Server zeigt die Adressen an, zum Beispiel:

```
Leitstand:  http://192.168.178.20:8080/
Tablet:     http://192.168.178.20:8080/tablet
```

- **PC:** Die Leitstand-Adresse öffnen und wie gewohnt eine Leitstelle starten. Die Simulation läuft in diesem Browser.
- **Tablet:** Die Tablet-Adresse im Tablet-Browser öffnen. Das Tablet verbindet sich automatisch.

Einen anderen Port wählst du mit `PORT=9000 npm run lan` (unter Windows: `set PORT=9000 && npm run lan`). Erlaubt die Windows-Firewall die Verbindung nicht, musst du Node.js beim ersten Start für private Netzwerke zulassen.

## Was das Tablet zeigt

- **Ein Notruf ist in Abfrage:** Das Tablet zeigt die standardisierte Notrufabfrage (DIAS) mit großen Tasten.
  - Du tippst dich durch, jede Antwort erscheint sofort auch in der Einsatzmaske am PC und umgekehrt.
  - Am Ende überträgt **„Daten übernehmen“** Stichwort, Meldebild und Infotext direkt in den Einsatz.
  - Die DIAS-Datei musst du nur am PC importieren, das Tablet holt sie sich vom PC.
- **Kein Notruf in Abfrage:** Das Tablet ist ein **Funkbedienplatz**.
  - Du schaltest eine Rufgruppe (z. B. OH_FW) und siehst deren offene Funkmeldungen und Sprechwünsche. Du kannst sie quittieren oder ein Transportziel zuweisen.
  - Meldungen anderer Rufgruppen erscheinen als Hinweis mit Zähler.
  - Die gewählte Rufgruppe merkt sich das Tablet.
- Über die Reiter oben wechselst du während eines Notrufs zwischen Notrufabfrage und Funk.

## Technik und Sicherheit

- **Was der Server macht:** Er liefert das Spiel aus und leitet Nachrichten zwischen den Browsern weiter (WebSocket `/__sync`). Er speichert nichts. Spielstände bleiben im Browser des PCs.
- **Keine Anmeldung:** Jeder im selben Netz kann sich verbinden. Nutze den Server nur im eigenen, vertrauenswürdigen Netz und gib den Port nicht ins Internet frei.
- **Sprachtest auf dem Tablet:** Browser erlauben das Mikrofon nur über HTTPS oder `localhost`. Über `http://<IP>` funktioniert die Spracherkennung auf dem Tablet deshalb nicht. Notrufabfrage und Funk brauchen kein Mikrofon.
- **Einschränkung:** Es sollte nur **ein** Leitstand-PC gleichzeitig verbunden sein.
