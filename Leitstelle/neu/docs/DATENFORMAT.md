# Datenformat (Export/Import)

## JSON-Hülle

Jede Exportdatei hat dieselbe versionierte Hülle:

```json
{
  "format": "leitwarte",
  "formatVersion": 1,
  "kind": "leitstelle",
  "exportedAt": "2026-10-17T20:00:00.000Z",
  "data": { }
}
```

- `kind: "leitstelle"`: `data` ist eine `CenterConfig`, also die Leitstellenkonfiguration ohne Laufzeitdaten.
- `kind: "spielstand"`: `data` ist ein vollständiger `GameState` `{ schemaVersion, center, runtime }`.

Die genauen Felder stehen in `src/model/types.ts`, die Validierungsregeln in `src/persistence/schema.ts`. Zeiten sind Simulationszeit in Millisekunden (Unix-Epoch, ohne Zeitzone gelesen), Koordinaten sind `[Breite, Länge]` (WGS84).

## Validierung und Reparatur

Der Import läuft in drei Stufen:

1. **Hülle prüfen:** Unbekanntes Format oder eine neuere Formatversion führen zum Abbruch, vorhandene Daten bleiben unverändert.
2. **Einträge einzeln prüfen:** Ungültige Wachen, Fahrzeuge usw. werden verworfen und im Importbericht aufgeführt. Doppelte IDs werden ebenfalls verworfen.
3. **Referenzen prüfen:** Ein Fahrzeug mit unbekanntem Typ oder unbekannter Wache wird verworfen. Ebenso eine AAO-Regel zu einem unbekannten Stichwort. Fehlende Pflicht-Status werden ergänzt.

Bei Spielständen wird zusätzlich die Laufzeit geprüft. Sind die Laufzeitdaten beschädigt, wird der Import abgelehnt (Tipp: die Konfiguration als Leitstelle neu starten). Fahrzeuge, die an unbekannte Einsätze gebunden sind, werden zurückgesetzt.

`migrate()` in `schema.ts` ist die Stelle für künftige Formatmigrationen.

## Minimalbeispiel einer Leitstelle

Nicht angegebene Listen werden mit Standardkatalogen gefüllt (Fahrzeugtypen, Qualifikationen, Organisationen, Stichwörter, AAO, Status):

```json
{
  "format": "leitwarte",
  "formatVersion": 1,
  "kind": "leitstelle",
  "data": {
    "name": "ILS Beispielstadt",
    "mapCenter": [50.1, 8.7],
    "stations": [
      { "id": "st_1", "name": "Feuerwache 1", "kind": "feuerwache", "organizationId": "org_bf",
        "position": [50.1, 8.7], "address": "Hauptstraße 1", "capacity": 6, "turnoutSeconds": 60 }
    ],
    "vehicles": [
      { "id": "v_1", "callsign": "Florian Beispielstadt 1/46-1", "typeId": "hlf20",
        "organizationId": "org_bf", "stationId": "st_1" }
    ]
  }
}
```

Ohne Personal ist ein Fahrzeug nicht besetzbar. Lege deshalb unter `personnel` passende Personen an oder ergänze sie nach dem Import im Bereich „Personal & Dienst“.

## CSV-Formate

Trennzeichen `;` oder `,` (wird automatisch erkannt). Die erste Zeile enthält die Spaltennamen. Felder mit Trennzeichen setzt du in Anführungszeichen. Fehlerhafte Zeilen werden übersprungen und gemeldet.

**Wachen**

```
name;art;organisation;lat;lng;adresse;ausrueckzeit;stellplaetze
FF Neudorf;feuerwehrhaus;Freiwillige Feuerwehren;50,61;9,62;Dorfstraße 1;300;3
```

- `art`: `feuerwache`, `feuerwehrhaus`, `rettungswache`, `notarztstandort`, `polizei`, `thw`, `kats`, `werkfeuerwehr` oder `sonstige`
- `organisation`: Name oder ID einer vorhandenen Organisation

**Fahrzeuge**

```
funkrufname;typ;wache;kennung;ausstattung
Florian Neudorf 1/44-1;LF 20;FF Neudorf;HW-NE 44;Wärmebildkamera|Motorsäge
```

- `typ`: Kürzel oder ID eines Fahrzeugtyps
- `wache`: Name oder ID einer Wache

**Stichwörter + AAO**

```
code;bezeichnung;kategorie;prioritaet;bedarf
B SILO;Silobrand;brand;1;fuehrung_1:1|loeschen:2|hoehenrettung:1
```

- `kategorie`: `brand`, `th`, `vu`, `rd`, `ktp`, `abc`, `wasser`, `tier`, `pol` oder `sonstiges`
- `bedarf`: Liste aus `faehigkeit:anzahl`, getrennt durch `|`. Die Fähigkeiten stehen unter „Stichwörter & AAO → Fähigkeiten“.
