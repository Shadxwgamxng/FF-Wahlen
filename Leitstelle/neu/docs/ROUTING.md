# Straßenrouting mit OSRM (kostenlos, lokal)

LEITWARTE lässt Fahrzeuge auf echten Straßen fahren. Die Routen berechnet ein **lokaler OSRM-Server** (Open Source Routing Machine) aus OpenStreetMap-Daten. Das kostet nichts und läuft offline.

## Einrichtung (einmalig)

Voraussetzung: [Docker Desktop](https://www.docker.com/products/docker-desktop/) ist installiert und gestartet.

**Windows (PowerShell):**

```powershell
cd Leitstelle\neu\osrm
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

**Linux/macOS:**

```bash
cd Leitstelle/neu/osrm && ./setup.sh
```

Das Skript lädt die Schleswig-Holstein-Karte von Geofabrik (ca. 150 MB) und bereitet sie einmalig auf (einige Minuten). Danach startet es den Server unter **http://localhost:5000**.

- Bei jedem späteren Aufruf startet nur noch der Server.
- Andere Regionen: z. B. `.\setup.ps1 -Region hamburg` (Namen wie bei https://download.geofabrik.de/europe/germany/).

## Im Spiel

- Unter **Daten & Einstellungen → Straßenrouting** die Adresse prüfen (Standard `http://localhost:5000`) und auf **Verbindung testen** klicken.
- Die Kopfzeile zeigt den Zustand:
  - **„Straßenrouting“**: OSRM antwortet.
  - **„Luftlinie!“**: Der Server ist nicht erreichbar.

## So funktioniert es

- **Alarmierung:** Das Spiel fragt die Route vom aktuellen Standort zum Ziel ab. Bei Fahrzeugen auf der Wache überbrückt die Ausrückzeit die Ladezeit.
- **Fahrzeit:** OSRM-Fahrzeit (Pkw-Profil). Mit Sonderrechten gilt der Faktor 0,75, also 25 % schneller. Es gibt keine Verkehrsdaten.
- **Noch keine Route:** Bis eine Route vorliegt bzw. ohne Server fährt das Fahrzeug die gekennzeichnete Näherung (Luftlinie × Umwegfaktor, gestrichelte Linie). Trifft die Route ein, wird die Fahrt nahtlos umgestellt (durchgezogene Linie).
- **Einsatzmittelvorschlag:** Für die 15 nächsten freien Fahrzeuge werden Routen vorab geladen. Eintreffzeiten ohne Route sind mit `*` markiert.
- **Hubschrauber** fliegen immer Luftlinie.

## Technik

- **Genutzte API:** nur der dokumentierte OSRM-Endpunkt `GET /route/v1/driving/{lng},{lat};{lng},{lat}?overview=full&geometries=geojson` ([OSRM HTTP-API](https://project-osrm.org/docs/v5.24.0/api/#route-service)).
- **CORS:** `osrm-routed` erlaubt Anfragen aus dem Browser von Haus aus.
- **Lizenz der Kartendaten:** © OpenStreetMap-Mitwirkende, ODbL.
- **Öffentlicher Demo-Server:** Der Server des OSRM-Projekts (`router.project-osrm.org`) hat dieselbe API, ist laut seinen Nutzungsbedingungen aber nur für geringe Nutzung gedacht. Deshalb ist er nicht voreingestellt.
