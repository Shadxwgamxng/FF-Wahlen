# Vorschlag: Stichwortkatalog „Schleswig-Holstein“ (zur Freigabe)

**Stand:** Entwurf, noch nicht eingebaut.

**Grundlage:** die Struktur der Seite „Einsatzstichworte/Mitte“ (wiki.lstsim.de). Übernommen werden nur die **Codes**. Alle Bezeichnungen, Hinweise und Meldebild-Texte formuliere ich selbst.

Die Wiki-Seite legt **nicht** fest, welche Fahrzeuge ein Stichwort alarmiert. Die Zuordnung unten ist mein Vorschlag und im Editor (AAO) jederzeit änderbar. Die Angaben „Fahrzeuge“ meinen die Fähigkeiten im Spiel; z. B. erfüllt „LF“ auch ein HLF.

## 1. Aufbau im Spiel

- **Einsatzstichwort** = Grundschadenart (GSA) + Erweiterung (EW) + Ergänzung (EG), z. B. `FEU 00 Y`, `NOTF 11 COVID`, `TH K TV 01`.
  - Das Stichwort legt Fahrzeuge (AAO) und Sondersignal fest.
- **Meldebild** (Verdachtsdiagnose):
  - Der Disponent wählt bei der Abfrage ein Meldebild, das dann automatisch ein Stichwort *vorschlägt*. Das Stichwort bleibt änderbar.
  - Für den Rettungsdienst nutze ich die CEDUS-Codes und Vorschlags-Stichwörter aus der Struktur des Wikis.
  - Für Feuer, TH und Polizei schreibe ich **eigene Meldebilder**, weil das Wiki dafür keine hat.
- **Alarmierungstext** = Freitext (gibt es heute schon als Notiz).

## 2. Zuordnung Stichwort → Fahrzeuge (Vorschlag)

### Rettungsdienst (NOTF)

| Stichwort | Fahrzeuge | Sondersignal |
|---|---|---|
| NOTF 01 / 02 / 03 | 1 / 2 / 3 RTW | ja |
| NOTF 10 | 1 NEF | ja |
| NOTF 11 / 12 / 13 | 1 / 2 / 3 RTW + 1 NEF | ja |
| NOTF 22 / 23 | 2 / 3 RTW + 2 NEF | ja |
| NOTF K | 1 RTW | **nein** |
| NOTF RTH | 1 RTH | ja |
| NOTF ADIP / ADIP G | 1 RTW + 1 Schwerlast-RTW (G: + 1 LF Tragehilfe) | ja |
| NOTF INKUB | 1 ITW (Inkubator) + 1 NEF | ja |
| NOTF BAB 01…23 | wie NOTF 01…23 | ja |
| NOTF (BAB) R5 … R150 | Großeinsatz Rettungsdienst, siehe unten | ja |
| NOTF VERL 01 / 11 / RTH / ITW / ECMO | RTW / RTW+NEF / RTH / ITW / ITW | ja |
| NOTF VERL ARZT / VEF | RTW (Klinikarzt fährt mit) / RTW + NEF (als VEF) | ja |

**Ergänzungen im Rettungsdienst:**
- `COVID`: gleiche Fahrzeuge, verlängerte Einsatzdauer (Schutzausrüstung, Desinfektion).
- `X` (hochinfektiös): zusätzlich deutlich längere Bindung.
- `First`: zusätzlich 1 First Responder.

### Großeinsatz Rettungsdienst (Ergänzung R5 … R150, gilt für alle GSA)

Die Stufe nennt die obere Grenze der Verletztenzahl (wie in DIAS): R5 = 3–5, R10 = 6–10, R15 = 11–15, R20 = 16–20, R30, R40, R50, R75, R100, R125, R150.

Faustregel: 1 RTW je 2 Verletzte (höchstens 15), 1 NEF je 5 Verletzte (höchstens 6), ab R10 ein Einsatzleiter Rettungsdienst, ab R20 zusätzlich ein Organisatorischer Leiter.

Einheiten der Hilfsorganisationen (jeweils die ganze Komponente, in der AAO als Anzahl 99 = „alle“):

| ab | Komponente | Fahrzeuge |
|---|---|---|
| R10 | Transportkomponente 1 (T1) | alle RTW der Ortsvereine |
| R15 | + Transportkomponente 2 (T2) | alle KTW der Ortsvereine (KTW Typ 4, NKTW, KTW-B …) |
| R20 | + Betreuungsgruppe und Patientenablage | alle GW-Betreuung/BLKW und GW-San |

### Krankenbeförderung (KBF), alle ohne Sondersignal

| Stichwort | Fahrzeuge |
|---|---|
| KBF STANDARD / ST / VERL / FERN / AMBU | 1 KTW (FERN und AMBU mit langer Bindungszeit) |
| KBF STANDARD DL / LF | 1 KTW + DLK bzw. LF (Tragehilfe) |
| KBF INF, KBF COVID (und Kombinationen) | 1 I-KTW |
| KBF ADIP / ADIP G | 1 Schwerlast-KTW (G: + LF Tragehilfe) |
| KBF ZWANG | 1 KTW + 1 Streife |

### Feuer (FEU K / FEU / FEU G)

| Stichwort | Fahrzeuge |
|---|---|
| FEU K 00 | 1 LF |
| FEU K AUS | 1 LF, **ohne** Sondersignal (Nachkontrolle) |
| FEU K BMA / BMA P | 1 LF (Kontrolle bzw. Heimrauchmelder) |
| FEU K BAHN | 1 LF |
| FEU 00 | ELW 1, 2 LF, 1 DLK |
| FEU BMA (Objektstufe 1) | ELW 1, 1 LF, 1 DLK |
| FEU WALD | ELW 1, 2 LF, 1 TLF |
| FEU SCHIFF | wie FEU 00 + 1 Wasserrettung; `W` (nur wasserseitig): 1 Wasserrettung + 1 LF + ELW 1 |
| FEU 2 / FEU G 00 | ELW 1, 3 LF, 1 DLK, 1 TLF |
| FEU 3 | ELW 2, ELW 1, 4 LF, 2 DLK, 1 TLF, 1 GW-A, 1 RTW |
| FEU 4 | wie FEU 3 + 2 LF, 1 GW-L |
| FEU 5 / 6 / 7 | jeweils + 2 LF und + 1 MTF gegenüber der Stufe davor |

**Ergänzungen bei Feuer:**
- `Y` (Menschenleben in Gefahr): + 1 RTW, 1 NEF, 1 LF.
- `X` (Gefahrstoff): + 1 GW-G, 1 GW-A.
- `XY`: beides zusammen.
- `XR5`–`XR150`: X plus die Stufe Großeinsatz Rettungsdienst.
- `BAHN`: gleiche Fahrzeuge wie ohne `BAHN`. Bahnspezifisches (Notfallmanager, Erdung) bildet das Spiel nicht ab.
- `Übung`: gleiche Fahrzeuge, ohne Sondersignal, keine Patienten.

### Technische Hilfe (TH K / TH / TH G)

| Stichwort | Fahrzeuge |
|---|---|
| TH K 00 / ERK / FLUSI | 1 LF (FLUSI = Absicherung einer RTH-Landung) |
| TH K AUST | 1 LF (Ölbindemittel) |
| TH K ERK X / XY | 1 LF + 1 GW-G (XY: + 1 RTW) |
| TH K TV | 1 LF (Türöffnung); `01`: + 1 RTW; `11`: + 1 RTW + 1 NEF |
| TH 00 | ELW 1, 1 HLF, 1 RW |
| TH 00 Y | wie TH 00 + 1 LF, 1 RTW, 1 NEF |
| TH 00 X / XY | wie TH 00 + 1 GW-G (XY: + RTW, NEF) |
| TH AUST / AUST W | 1 LF, 1 GW-L (Öl); W: + 1 Wasserrettung |
| TH GAS | ELW 1, 2 LF, 1 Streife |
| TH KMF (Kampfmittel) | 1 LF, 2 Streifen (Räumdienst wird nicht simuliert) |
| TH PDRZS (Person droht zu springen) | ELW 1, 1 LF, 1 DLK, 1 RTW, 1 NEF, 2 Streifen; `W`: + 1 Wasserrettung |
| TH SRHT (Höhenrettung) | 1 HLF, 1 DLK, 1 Höhenrettung, 1 RTW, 1 NEF |
| TH WASSER | 1 Wasserrettung, 1 LF, 1 RTW (`Y`: + 1 NEF) |
| TH G 00 | ELW 1, 2 HLF, 1 RW, 1 GW-L |
| TH G 00 Y | wie TH G 00 + 2 RTW, 1 NEF |

Für alle TH-Stichwörter gelten bei `R5`–`R150`, `X`, `Übung` und `BAHN` dieselben Regeln wie bei Feuer.

### Polizeilagen (POL), Bereitstellung des Rettungsdienstes

| Stichwort | Fahrzeuge |
|---|---|
| POL AMOK / TERROR / LEBE / GEISEL | 2 RTW, 1 NEF, 1 Führung RD, Polizei-Führung und -Gruppe; dazu `R5`–`R150` als Stufen Großeinsatz Rettungsdienst |
| POL BOMBE / USBV | 1 LF, 1 RTW, 1 Streife (Bereitstellung) |
| POL SEK | 1 RTW, 1 NEF (Bereitstellung) |

### THW-Module

| Stichwort | Fahrzeuge |
|---|---|
| THW Bergung / ORTUNG | 1 THW-Bergung |
| THW WASSER | 1 THW-Pumpen |
| THW ÖL | 1 THW-Pumpen + 1 GW-L |
| THW Beleuchtung / Strom | 1 THW-Notversorgung (neuer Fahrzeugtyp) |
| THW Transport | 1 Logistik |
| THW FB (Fachberatung) | 1 THW-Führung (neuer Fahrzeugtyp) |

### Weiterleitungen (W …)

`W ÄBD`, `W POLIZEI`, `W O-AMT` usw. werden **kein Einsatz**, sondern eine Abschlussart des Notrufs: „Notruf weitergeleitet an …“. Das Spiel bewertet, ob die Weiterleitung richtig war, z. B. bei Bagatellanrufen den ärztlichen Bereitschaftsdienst.

## 3. Was ich bewusst weglasse

| Stichwort | Grund |
|---|---|
| DF (Dienstfahrten), I (Info/Test), SCHLÜSSEL | Verwaltung, kein Einsatzgeschehen |
| KBF FEHL | nur für die Abrechnung |
| SOKO KIT | laut Wiki nicht mehr verwendet |
| TH K A, PSNV-E BF/FF | nur Kiel-spezifisch |
| SOKO Fuss | Sonderdienst, z. B. bei Großveranstaltungen |
| SOKO MIRG (Schiffsbrandbekämpfung auf See) | eigene Spielmechanik nötig – später |
| SOKO PSNV-B / SOLA | optional als Einsatz ohne Fahrzeuge, wenn du willst |

## 4. Neue Fahrzeugtypen im Standardkatalog

| Neuer Typ | Benötigt für |
|---|---|
| First Responder (FR / HvO) | NOTF First |
| Schwerlast-RTW, Schwerlast-KTW | ADIP |
| GW-Höhenrettung | SRHT |
| THW-Notversorgung (Strom/Beleuchtung), THW-Führung | THW-Module |

Für INKUB bekommt der ITW zusätzlich die Fähigkeit „Inkubator“.

## 5. Meldebilder

- **Rettungsdienst und KBF:** rund 150 Meldebilder mit CEDUS-Code und Vorschlags-Stichwort entsprechend der Wiki-Struktur. Die Meldebild-Bezeichnungen sind medizinische Fachbegriffe wie „Akutes Koronarsyndrom“; Hinweistexte formuliere ich selbst.
- **Feuer, TH und Polizei:** eigene Meldebilder (ohne CEDUS) mit Vorschlags-Stichwort. Beispiele:

| Meldebild | Vorschlag |
|---|---|
| Brand Abfallbehälter | FEU K 00 |
| Brand PKW | FEU 00 |
| Zimmerbrand | FEU 00 |
| Wohnungsbrand, Personen vermisst | FEU 00 Y |
| Dachstuhlbrand | FEU 2 |
| Brand Lagerhalle | FEU 3 |
| Verkehrsunfall, Person eingeklemmt | TH 00 Y |
| Türöffnung, Person hilflos | TH K TV 01 |
| Ölspur | TH K AUST |
| Baum auf Straße | TH K 00 |
| Gasgeruch | TH GAS |
| Wasserrettung | TH WASSER Y |

## 6. SH-Szenarien

- Die bestehenden 71 Szenarien bekommen ein SH-Stichwort und ein SH-Meldebild als „richtige Lösung“.
- Dazu kommen **neue SH-Szenarien**, die zu Stichwörtern ohne bisheriges Szenario passen, z. B.:
  - Schiffsbrand im Hafen, Brand im Bahnbereich, Kampfmittelfund,
  - Person droht von einer Brücke über Wasser zu springen,
  - Inkubatortransport, Dialysefahrt, Zwangseinweisung, Adipositas-Transport,
  - Tauchunfall, Badeunfall,
  - Verlegungen (ITW/RTH),
  - Anrufe, die an den ärztlichen Bereitschaftsdienst weiterzuleiten sind.

## 7. Offene Punkte für dich

1. Passen die Fahrzeugzuordnungen (Abschnitt 2), oder willst du einzelne Zeilen ändern?
2. Sollen die weggelassenen Stichwörter (Abschnitt 3) so bleiben?
3. Sind die neuen Fahrzeugtypen (Abschnitt 4) in Ordnung?
