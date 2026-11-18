# Schnittstelle Overlay ↔ Lua (NUI)

Das Overlay (`html/`) enthält **keine Spiellogik**. Es zeigt an, was das Lua-Script schickt, und meldet jede Bedienung per NUI-Callback zurück. Der Server bleibt die einzige Quelle der Wahrheit: Nach jeder Bedienung schickt er den neuen Zustand.

## 1. Nachrichten Lua → Overlay (`SendNUIMessage`)

| `type` | Felder | Wirkung |
|---|---|---|
| `open` | `state` (komplett), `style?` (`'klassisch'`/`'modern'`), `view?` (`'leitstand'`/`'tableau'`/`'funk'`) | Fenster einblenden (vorher `SetNuiFocus(true, true)`) |
| `close` | – | Fenster ausblenden (danach `SetNuiFocus(false, false)`) |
| `state` | `state` (komplett oder Teilobjekt) | Felder auf oberster Ebene werden ersetzt (`{ ...alt, ...neu }`) |
| `patch` | `key`, `value` | genau eine Liste ersetzen, z. B. `{ type='patch', key='units', value=units }` |
| `select` | `incidentId` oder `callId` | Einsatz/Notruf in der Maske öffnen |
| `style` | `style` | Stil umschalten |
| `toast` | `text`, `kind?` (`'info'`/`'ok'`/`'fehler'`) | Hinweis unten rechts |

## 2. Der Zustand (`state`)

Alle Zeiten kommen **fertig formatiert als Text** (`'07:31'`), damit das Overlay nichts umrechnen muss.

```lua
state = {
  center     = 'IRLS Süd – Kreis Ostholstein',   -- Name der Leitstelle (Titelzeile)
  dispatcher = 'Disponent 1',                     -- Name des Spielers (Statuszeile)
  clock      = '07:38:12',                        -- Spielzeit; weglassen = lokale Uhr

  stations  = { { id = 'st_fw_scharbeutz', name = 'FF Scharbeutz' }, ... },
  keywords  = { { id = 'k1', code = 'FEU 00 Y', label = 'Brand Standard – Menschenleben in Gefahr', priority = 1 }, ... },
  hospitals = { { id = 'h1', name = 'UKSH Lübeck' }, ... },      -- optional (Abschnitt „Zielort“)

  units = {                      -- alle Einsatzmittel (Fahrzeuge/Einheiten)
    {
      id = 'u1',
      callsign = 'Florian Ostholstein 80/48-01',
      short = 'FL 80/48-01',     -- kurz fürs Wachentableau (optional)
      type = 'HLF 20',
      stationId = 'st_fw_scharbeutz',
      group = 'fw',              -- 'fw' | 'rd' | 'kats'  (rd → Kachel „R E-Mittel“, sonst „F E-Mittel“)
      status = '3',              -- '1'..'8' oder 'A' (alarmiert)
      statusTime = '07:31',      -- Zeit der letzten Statusänderung
      alarmAt = '07:30',         -- optional
      incidentId = 'i1',         -- gebunden an Einsatz (oder nil)
    },
  },

  calls = {                      -- Notrufe (klingelnd oder in Abfrage)
    {
      id = 'c1',
      state = 'klingelt',        -- 'klingelt' | 'in_abfrage'
      since = '0:14',            -- wartet/läuft seit
      receivedAt = '07:37:58',
      phone = '0151 2345678',
      callerName = 'Hahn',       -- optional
      preview = 'Im Keller riecht es …',   -- Kurztext in der Liste
      -- vorbelegte Maskenfelder (alle optional):
      street = 'Mühlenkamp', houseNumber = '19', city = 'Scharbeutz', postcode = '23683',
      object = '', meldebild = '', keywordId = '', info = '', notes = '',
      dialog = { { from = 'caller', time = '07:37', text = '…' }, { from = 'disp', time = '07:37', text = '…' } },
    },
  },

  incidents = {
    {
      id = 'i1', number = '2026-00041',
      keywordId = 'k1', priority = 1,          -- 1 rot, 2 orange, 3 blau
      state = 'neu',                           -- 'neu' | 'disponiert' | 'vor_ort' | 'beendet'
      createdAt = '07:30', alarmAt = '07:30', arrivalAt = '07:35',
      address = 'Strandallee 14, 23683 Scharbeutz',
      street = 'Strandallee', houseNumber = '14', city = 'Scharbeutz', postcode = '23683', object = '',
      callerName = 'Nowak', phone = '0172 5550199', meldebild = '', info = '', notes = '', hospitalId = '',
      units = { 'u1', 'u2' },                  -- gebundene Einsatzmittel (IDs aus units)
      open = '1× Drehleiter',                  -- offener Bedarf als Text (optional)
      suggestion = {                           -- Einsatzmittelvorschlag, vom Server berechnet
        { id = 'u4', kind = 'FZG', name = 'Florian Ostholstein 80/32-01', types = 'DLK 23-12',
          eta = '6 min', dist = '0,6 km', proposed = true, available = true, hint = 'deckt: Drehleiter' },
        -- kind: 'AG' = Alarmgruppe (Wehr), 'EG' = Erkundungsgruppe, 'FZG' = einzelnes Fahrzeug
      },
      messages = { { time = '07:31', text = 'FF Scharbeutz rückt aus mit ELW 1, HLF 20.' } },
      dialog = { ... },                        -- optional: Notrufgespräch
    },
  },

  radio = {
    groups   = { { code = 'OH_FW', name = 'Feuerwehren Ostholstein', active = true, waiting = 1 }, ... },
    requests = { { id = 'r1', unitId = 'u2', incidentId = 'i1', time = '07:37', text = 'Sprechwunsch' } },
    log      = { { time = '07:31', from = 'Florian Ostholstein 80/11-01', text = 'Status 3, Anfahrt.' } },
  },
}
```

Hinweise für Lua: Listen müssen als **Array** ankommen (Lua-Tabelle mit 1..n), leere Listen als `{}`. Damit eine leere Tabelle nicht als Objekt kodiert wird, ggf. `json.encode` mit leerem Array prüfen; im Zweifel weglassen – das Overlay setzt fehlende Listen nicht neu (nur übergebene Felder werden ersetzt).

## 3. Callbacks Overlay → Lua (`RegisterNUICallback`)

Jeder Callback bekommt `data` (Tabelle) und muss `cb({ ok = true })` aufrufen (bei Fehler `cb({ ok = false })`).

| Name | `data` | Erwartete Reaktion |
|---|---|---|
| `close` | – | `SetNuiFocus(false,false)`, `SendNUIMessage({type='close'})` |
| `setStyle` | `style` | Stil des Spielers speichern (KVP), optional |
| `openCall` / `openIncident` | `callId` / `incidentId` | optional (z. B. Wegpunkt setzen, „wer bearbeitet“) |
| `acceptCall` | `callId` | Notruf annehmen → `state` mit `calls[].state='in_abfrage'` |
| `endCall` | `callId` | Notruf ohne Einsatz beenden |
| `createIncident` | `callId` (oder nil), `mask` | Einsatz anlegen; **Antwort `cb({ ok=true, incidentId='…' })`**, damit die Maske ihn öffnet |
| `newIncident` | – | Einsatz ohne Notruf anlegen (z. B. eigenes Formular/Wegpunkt) |
| `saveIncident` | `incidentId`, `mask` | Maskenänderungen speichern |
| `setWaypoint` | `kind` (`'call'`/`'incident'`), `id` | GPS-Wegpunkt zum Einsatzort |
| `alarm` | `incidentId`, `items = { { id, kind }, … }` | ausgewählte AG/EG/FZG alarmieren |
| `releaseUnit` | `incidentId`, `unitId` | Einsatzmittel entlassen |
| `releaseAll` | `incidentId` | alle entlassen |
| `closeIncident` | `incidentId` | Einsatz abschließen |
| `answerRequest` | `requestId` | Sprechwunsch annehmen (z. B. Funkkanal öffnen, Spieler benachrichtigen) |
| `setRadioGroup` | `code` | Rufgruppe schalten (z. B. pma-voice-Kanal) |
| `ptt` | `down` (true/false) | Sendetaste gedrückt/losgelassen (z. B. Funk über pma-voice) |
| `sendRadio` | `text` | Funkspruch als Text |
| `sendMessage` | `kind`, `id`, `text` | Nachricht an den Anrufer (z. B. an den Spieler, der 112 gerufen hat) |

`mask` enthält: `street, houseNumber, city, postcode, object, callerName, phone, meldebild, keywordId, info, notes, hospitalId` (alles Text).

## 4. Tastatur im Overlay

| Taste | Wirkung |
|---|---|
| `Esc` | Callback `close` |
| `F2` | ersten klingelnden Notruf annehmen |
| `F3` | nächsten nicht disponierten Einsatz öffnen |
| `A` | ausgewählte Vorschläge alarmieren (wenn kein Eingabefeld aktiv ist) |

Zum Öffnen im Spiel ist ein eigener Befehl/Tastenbefehl nötig (siehe `beispiel/client.lua`).
