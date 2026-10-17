# Mehrspieler – Erweiterungsarchitektur (noch nicht umgesetzt)

Version 0.1 ist eine reine Einzelspieler-Fassung. Dieses Dokument beschreibt, wie Mehrspieler auf der bestehenden Codebasis entstehen soll.

## Grundprinzip: server-autoritative Engine

```
Browser (UI) ──Befehl──▶ WebSocket ──▶ Spielserver (Node.js)
     ▲                                    │  engine.ts (unverändert)
     └────── Zustands-Patches ◀───────────┘  PostgreSQL (Persistenz)
```

- `src/sim/*` hängt weder von React noch vom DOM ab und läuft unverändert in Node.js.
- Der Server führt `tick()` aus und ist alleinige Quelle der Wahrheit.
- Clients senden **Befehle** mit Parametern, etwa `{ type: 'alarmVehicles', incidentId, vehicleIds, baseVersion }`. Das sind dieselben Funktionen, die heute `store.run()` aufruft.
- Der Server verteilt die Änderungen als Patches. immer kann dafür `produceWithPatches` liefern, das passt zum heutigen Store.

## Rollen und Berechtigungen

| Rolle | darf |
|---|---|
| Notrufannahme | Notrufe annehmen, abfragen, Einsätze anlegen, verknüpfen |
| Disponent/-in | alarmieren, entlassen, Funk bearbeiten, Einsätze abschließen |
| Einsatzleitung | lesen, Nachforderungen, Stichwort ändern |
| Administrator/-in | Editor, Simulationseinstellungen, Uhr, Benutzer |

Der Server prüft die Berechtigung für jeden Befehl. Die UI blendet nur aus und ist keine Sicherheitsgrenze.

## Konkurrierende Änderungen

- Jeder Notruf hat einen „Besitzer“: Wer annimmt, bearbeitet. Der Server lehnt eine zweite Annahme mit einer Fehlermeldung ab. Die Engine prüft das heute schon (`Notruf wurde bereits angenommen`).
- Für die Disposition gelten die bestehenden Engine-Prüfungen, z. B. „Fahrzeug bereits gebunden“. Sie werden serverseitig serialisiert ausgeführt, damit keine Doppelalarmierung möglich ist.
- Editor-Änderungen nutzen eine optimistische Versionsnummer je Entität. Bei einem Konflikt sieht der Nutzer einen Dialog mit „neu laden / überschreiben“.

## Verbindung und Wiederverbindung

- Beim Verbinden erhält der Client einen Snapshot und die laufende Ereignisnummer.
- Nach einem Abbruch fordert er die Ereignisse ab seiner letzten Nummer nach. Ist die Lücke zu groß, bekommt er einen neuen Snapshot.
- Das Heartbeat-Intervall wird bei der Umsetzung festgelegt.
- Pausiert ein Administrator die Uhr, gilt das für alle.

## Persistenz und Konten

- Tabellen: `users`, `centers` (JSON-Konfiguration im Exportformat), `sessions`, `snapshots`, `archive`, `events` (nur anhängen).
- Anmeldung per Sitzungs-Cookie und Passwort-Hash (z. B. argon2) oder per OIDC.
- Die Community-Bibliothek nutzt `center.sharing` (Sichtbarkeit, Autor, Tags), das heute schon gespeichert wird.

## Umsetzungsschritte

1. Monorepo: `packages/sim` (aus `src/sim`, `src/model`, `src/data`), `apps/web`, `apps/server`
2. Server: Fastify mit `ws`, ein Raum pro Leitstelle, Spielschleife mit festem Takt
3. Store im Client auf zwei Modi erweitern: lokal (heute) und remote (WebSocket)
4. Berechtigungsschicht und Kontenverwaltung (Ansicht „Mehrspieler“)
5. Tests: Wettlauf zweier Clients um denselben Notruf bzw. dasselbe Fahrzeug, Wiederverbindung, Serverneustart
