# Styleguide Leitplatz-Overlay

Zwei Stile, umschaltbar über `<html data-style="klassisch">` bzw. `"modern"`. Alles hängt an CSS-Variablen in `html/style.css` – neue Elemente **immer mit diesen Variablen** bauen, nie mit festen Farben (Ausnahme: Statusfarben, siehe unten).

Bilder: `bilder/klassisch-*.png` und `bilder/modern-*.png` (Einsatz, Notruf, klingelnder Notruf, Wachentableau, Funk).

## 1. Grundidee

- **Klassisch**: wie ein klassisches Einsatzleitsystem in deutschen Leitstellen – hell, graublau, dicht, Tahoma 12 px, eckig (Radius 2 px), Reiter-Kacheln mit „×“, Abschnitte mit Titelleiste („Einsatzort:“), Beschriftung links neben dem Feld, leere Pflichtfelder **orange**.
- **Modern**: dunkel, ruhig, Inter 13 px, Radius 6–7 px, Überschriften in Großbuchstaben mit Sperrung, Akzent Blau.
- Beide: viel Information auf wenig Platz, keine Animationen außer Klingeln (Notruf) und blinkendem Alarmieren-Knopf.

## 2. Farben

| Variable | Klassisch | Modern | Verwendung |
|---|---|---|---|
| `--bg` | `#d6d9e0` | `#0d1117` | Fensterfläche |
| `--bg-2` | `#e4e6eb` | `#131a23` | Leisten |
| `--panel` | `#ffffff` | `#161e29` | Listen, Tabellen, Felder |
| `--panel-2` | `#eceef2` | `#1c2633` | Kopfzeilen, Gruppenzeilen |
| `--line` / `--line-2` | `#c3c7ce` / `#9aa1ab` | `#2a3646` / `#364457` | Linien, Rahmen |
| `--text` / `--text-2` / `--text-3` | `#111` / `#3c4048` / `#6d727c` | `#dbe3ec` / `#9aa8b8` / `#6b7a8c` | Schrift, gedämpft, sehr gedämpft |
| `--accent` | `#2a5d9f` | `#3d8bfd` | Auswahl, Fokus, Primärknopf |
| `--sel` | `#b8cfe5` | `#1d3557` | ausgewählte Zeile |
| `--alarm` | `#c4161c` | `#f2555a` | Alarm, Fehler |
| `--prio1/2/3` | rot / orange / blau | rot / orange / blau | Prioritätsbalken in der Einsatzliste |
| `--req-bg` | `#ffa449` | `#2a2412` | leeres Pflichtfeld |

**Alarmieren-Knopf**: in beiden Stilen rot `#c4161c`, blinkt (0,9 s), sobald etwas ausgewählt ist.

### Statusfarben (FMS) – fest je Stil

| Status | Bedeutung | Klassisch (Hintergrund / Schrift) | Modern |
|---|---|---|---|
| 1 | frei über Funk | `#97ff9b` / schwarz | `#30a46c` |
| 2 | frei auf Wache | `#ffffff` / schwarz | `#46a758` |
| A | alarmiert | `#ffb3e6` / schwarz | `#ffb224` |
| 3 | Anfahrt | `#ffff00` / schwarz | `#f76b15` |
| 4 | am Einsatzort | `#ff6665` / **weiß** | `#e5484d` |
| 5 | Sprechwunsch | `#ffa53b` / schwarz | `#f5d90a` |
| 6 | nicht einsatzbereit | `#000000` / **gelb `#e8e84a`** | `#6f6f6f` |
| 7 | Transport | `#989898` / weiß | `#8e4ec6` |
| 8 | am Ziel | `#9cc8ff` / schwarz | `#3e63dd` |

Im Wachentableau ist die **ganze Zeile** (Rufname + Status) in der Statusfarbe, sonst ein kleines Kästchen mit der Ziffer.

## 3. Schrift und Maße

| | Klassisch | Modern |
|---|---|---|
| Schrift | Tahoma, Segoe UI, Verdana | Inter, system-ui |
| Grundgröße | 12 px | 13 px |
| Zahlen/Zeiten | Consolas (mono) | JetBrains Mono / Consolas |
| Radius | 2 px | 6–7 px |
| Zeilenhöhe Tabelle | ~20 px | ~22 px |
| Fenster | 3 vh oben/unten, 2 vw links/rechts Abstand, Schatten | gleich |

## 4. Aufbau

```
┌ Titelleiste: ● LEITWARTE · Leitstelle            [Klassisch][Modern] ✕ ┐
├ Werkzeugleiste: Uhr          Notrufe n · Offene Einsätze n · Sprechwünsche n · Fahrzeuge frei ┤
├ Reiter: Leitstand | Wachentableau | Funk (n)                                    ┤
│ Leitstand:  links 330 px: „Notrufe“, „Laufende Einsätze“                        │
│             rechts: Einsatzmaske                                                │
│               Kopf: Einsatz-Nr. · ZUSTAND · Stichwort · Zeiten · Schließen      │
│               Symbolleiste: ⎙ anlegen/speichern · ⌖ Wegpunkt · ⇤ entlassen · ✓  │
│               links (400–520 px): Abschnitte Einsatzort / Anruferdaten /        │
│                                   Einsatzanlass / Zielort                       │
│               rechts Kacheln: R E-Mittel | F E-Mittel, Maßnahmen (breit),       │
│                               Meldungen, Gesprächsverlauf                       │
├ Statuszeile: Disponent · Leitstelle · F2 · F3 · A · Esc                         ┘
```

## 5. Bausteine (Klassen)

| Baustein | Klasse | Merkmale |
|---|---|---|
| Listenfenster | `.panel` + `.panel-head h4` | Klassisch: Reiterkopf grau mit Rahmen; Modern: Großbuchstaben-Überschrift |
| Listeneintrag | `.item` (+ `.sel`, `.ringing`) | Prioritätsbalken `.prio .prio-1..3` links |
| Maskenabschnitt | `.sec` / `.sec-head` / `.sec-body` | Titel mit Doppelpunkt, ein-/ausklappbar, Beschriftung 118 px links |
| Kachel | `.tile` / `.tile-tab` / `.tile-body` | Klassisch: Reiter „Name ×“; Modern: Karte mit Rahmen |
| Tabelle | `table.grid` | Kopf mit Verlauf (klassisch), Gruppenzeile `tr.group` |
| Knopf | `.btn` (`.small`, `.primary`, `.alarm`, `.active`) | |
| Symbolknopf | `.ico` | 26 × 24 px, Zeichen ⎙ ⌖ ⇤ ✓ |
| Status | `.st` | Farben per JS (`STATUS` in `app.js`) |
| Zähler oben | `.tb-field` (`.alarm`, `.warn`) | Klassisch: lachsrot / gelb |
| Kennzeichen | `.tag` | AG / EG / FZG vor dem Namen |

## 6. Texte und Begriffe

Deutsch, knapp, Leitstellensprache: „Einsatzmittel“, „Alarmieren“, „Entlassen“, „Sprechwunsch“, „Ansprechen“, „Rufgruppe“, „Stärke“, „UNERLEDIGT / DISPONIERT / VOR ORT“, „nicht disponiert“. Zeiten immer `HH:MM`. Funkrufnamen ausgeschrieben („Florian Ostholstein 80/48-01“), im Tableau kurz („FL 80/48-01“).

## 7. Nicht machen

- Keine festen Farben außerhalb der Variablen/Statusfarben.
- Keine Emojis als Symbole (nur die schlichten Zeichen ⎙ ⌖ ⇤ ✓ ☎).
- Keine abgerundeten „App-Karten“ im Stil Klassisch.
- Keine Logos oder Namen echter Leitsystem-Hersteller.
