# Installation auf Plesk (Node.js)

Voraussetzungen im Plesk-Paket: **Node.js-Erweiterung** (Node 20 oder 22) und eine **PostgreSQL-Datenbank**
(alternativ eine externe, z. B. Neon/Supabase). Reines PHP-Hosting ohne Node.js reicht nicht.
Das Paket enthält **keine Datenbank und keine Demodaten** – beim ersten Start werden nur die leeren Tabellen,
Rollen/Rechte, Löschzüge 11/21/31, die Standard-Ämter und Dienstgrade angelegt.

## 1. Discord-Anwendung
1. https://discord.com/developers/applications → *New Application*.
2. *OAuth2* → Redirect hinzufügen: `https://DEINE-DOMAIN/api/auth/discord/callback`
3. *Client ID* und *Client Secret* notieren.
4. Deine eigene Discord-ID herausfinden (Discord → Einstellungen → Erweitert → Entwicklermodus; dann Rechtsklick auf dich → *Benutzer-ID kopieren*).

## 2. Datenbank
Plesk → *Datenbanken* → *Datenbank hinzufügen* → Typ **PostgreSQL**. Benutzer + Passwort vergeben.
Verbindungs-URL (Beispiel): `postgresql://BENUTZER:PASSWORT@localhost:5432/DATENBANKNAME`
(Externe Datenbank, z. B. Neon: URL mit `?sslmode=require` am Ende.)

## 3. Hochladen
1. Domain → *Dateien*: einen Ordner anlegen, z. B. `wahlen/` (**nicht** in `httpdocs` legen, wenn die Domain sonst PHP-Seiten hat – eine Subdomain wie `wahl.deine-domain.de` ist am einfachsten).
2. `ff-wahlen-plesk.zip` hochladen und dort entpacken (Plesk-Dateimanager → *Entpacken*). Danach liegen `app.js`, `server.js`, `node_modules`, `.next`, … direkt im Ordner.

## 4. Node.js einrichten
Domain → *Node.js*:
| Einstellung | Wert |
|---|---|
| Node.js-Version | 20 oder 22 |
| Anwendungsmodus | production |
| Anwendungsstamm | `wahlen` (der Ordner aus Schritt 3) |
| Anwendungs-Startdatei | `app.js` |

**Benutzerdefinierte Umgebungsvariablen:**
| Name | Wert |
|---|---|
| `DATABASE_URL` | Verbindungs-URL aus Schritt 2 |
| `APP_URL` | `https://DEINE-DOMAIN` (ohne `/` am Ende) |
| `DISCORD_CLIENT_ID` | aus Schritt 1 |
| `DISCORD_CLIENT_SECRET` | aus Schritt 1 |
| `SUPERADMIN_DISCORD_IDS` | deine Discord-ID (mehrere mit Komma) |
| `CRON_SECRET` | optional, langes Zufallspasswort (siehe unten) |

Dann **„NPM install“ NICHT ausführen** (alles ist bereits enthalten) → *Anwendung aktivieren* bzw. *Neu starten*.

## 5. Erster Login
`https://DEINE-DOMAIN` öffnen → *Mit Discord anmelden*. Der erste Login mit einer ID aus `SUPERADMIN_DISCORD_IDS` legt den Superadministrator an.
Danach: Mitglieder anlegen und mit Discord verknüpfen (Verknüpfungslink oder Discord-ID), Rollen vergeben, Wahl erstellen.

## Optional: zeitgesteuerter Start/Ende von Wahlen
Wahlen schalten sich bei jedem Seitenaufruf automatisch um. Damit es auch ohne Besucher pünktlich passiert:
Plesk → *Geplante Aufgaben* → Befehl ausführen, alle 5 Minuten:
`curl -s -H "Authorization: Bearer DEIN_CRON_SECRET" https://DEINE-DOMAIN/api/cron/tick`

## Updates
Neues Paket hochladen/entpacken (überschreiben), App neu starten. Datenbank-Änderungen werden beim Start automatisch eingespielt, Daten bleiben erhalten.

## Fehlersuche
* Seite zeigt Fehler 500 / startet nicht → Plesk *Node.js* → *Protokolle*: Meldung „DATABASE_URL ist nicht gesetzt“ bzw. Verbindungsfehler prüfen.
* Discord-Login „Redirect ungültig“ → `APP_URL` und die Redirect-URI in Discord müssen exakt übereinstimmen (https!).
* „Dein Discord-Account ist noch keinem Feuerwehrmitglied zugeordnet“ → normal für nicht angelegte Personen.
