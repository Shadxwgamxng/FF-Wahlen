# FF Wahlplattform

Wahlplattform für eine Freiwillige Feuerwehr auf einem FiveM-Roleplay-Server.
Stack: Next.js 15 (App Router, Server Actions) · TypeScript · Tailwind · PostgreSQL · Prisma · Discord OAuth2.

## Ein-Klick-Start (empfohlen)

**Windows:** `Start.bat` doppelklicken. **macOS:** `Start.command`. **Linux:** `./start.sh`.
Beim ersten Mal wird alles automatisch installiert und eingerichtet (eingebettete Datenbank, Schema, Demodaten) –
danach öffnet sich der Browser. Ab dem zweiten Mal startet es in Sekunden. Daten liegen im Ordner `.data/`.
Voraussetzung ist nur Node.js (wird unter Windows per `winget` automatisch angeboten).

## Lokal ausführen (mit Docker)

Voraussetzungen: Node.js 20+, Docker (nur für PostgreSQL).

```bash
./setup-local.sh    # DB starten, installieren, migrieren, Demodaten
npm run dev         # http://localhost:3000
```
Unter Windows: `docker compose up -d`, `copy .env.example .env`, dann `npm install`, `npx prisma migrate deploy`, `npm run db:seed`, `npm run dev`.
Ohne Discord-App: In `.env` ist `DEV_LOGIN="true"` – auf der Login-Seite erscheint ein Dev-Login (Discord-ID `100000000000000001` = Superadmin).

## Start

```bash
cp .env.example .env            # Werte eintragen
npm install
npx prisma migrate deploy       # Schema + Trigger für das Wahlgeheimnis
npm run db:seed                 # Rechte, Rollen, Löschzüge 11/21/31, Ämter, Dienstgrade (SEED_DEMO=true für Demodaten)
npm run dev                     # bzw. npm run build && npm start
```

**Discord:** In der Discord-Developer-Console eine Anwendung anlegen, Redirect-URI `{APP_URL}/api/auth/discord/callback`
eintragen, `DISCORD_CLIENT_ID/SECRET` setzen. Die eigene Discord-ID in `SUPERADMIN_DISCORD_IDS` eintragen – der erste
Login legt dann den Superadministrator an. Alle anderen Accounts müssen von einem Wehrführer verknüpft werden
(Verknüpfungslink oder Discord-ID am Mitglied). Unbekannte Discord-Accounts erhalten die Meldung
„Dein Discord-Account ist noch keinem Feuerwehrmitglied zugeordnet.“ und werden **nicht** angelegt.

`DEV_LOGIN=true` erlaubt lokal einen Login ohne Discord (wird in Produktion ignoriert).
Optional: `GET /api/cron/tick` mit `Authorization: Bearer $CRON_SECRET` schaltet Wahlen zeitgesteuert um
(geschieht sonst bei jedem Seitenaufruf).

## Wahlgeheimnis (technisch)

| Tabelle | Inhalt |
|---|---|
| `election_voters` | wer wahlberechtigt war und **dass/wann** abgestimmt wurde – ohne Verweis auf `votes` |
| `votes` | Stimme mit Zufalls-UUID. **Geheim:** `voterId` und `castAt` sind immer `NULL`, Einfügereihenfolge wird gemischt |
| `election_results` | beim Beenden eingefrorenes Ergebnis |

* Ein DB-Trigger (`prisma/migrations/0002_*`) lehnt jede Stimme einer geheimen Wahl mit Wähler/Zeitstempel ab – auch bei direktem SQL-Zugriff – und verbietet den Wechsel der Wahlart nach der ersten Stimme.
* Doppelte Abstimmung wird per Unique-Constraint in derselben Transaktion verhindert.
* Audit-Log und Server-Logs enthalten keine Stimmabgaben.
* Ergebnisse sind erst nach Ende der Wahl sichtbar (keine Live-Zwischenstände).
* Grenze: Wer Schreibzugriff auf Anwendung/DB-Code hat, könnte die Software ändern; organisatorisch ist der Betrieb daher getrennt von den Wahlverantwortlichen zu halten.

## Rollen
Superadministrator (alles) · Wehrführer · Wahlleiter · Feuerwehrmitglied. Rechte sind feingranular (`src/lib/permissions.ts`),
in der Oberfläche unter *Benutzer & Rollen* änderbar; einzelnen Benutzern können Zusatzrechte gegeben werden.
Löschzüge, Ämter und Dienstgrade sind reine Datenbankinhalte (Seed nur bei leerer Tabelle).

## Prüfung
```bash
npm test                              # Berechtigungs-Priorität
npx tsx scripts/verify-secret-ballot.ts   # Integrationstest gegen die DB (Geheimhaltung, Doppelabgabe, Trigger)
```
