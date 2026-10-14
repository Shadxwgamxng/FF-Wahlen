-- In ox_inventory/data/items.lua einfuegen (innerhalb der return-Tabelle).
-- Bilder: install/ox_inventory/web/images/*.png nach ox_inventory/web/images/ kopieren.

['spritze_aufgezogen'] = {
    label = 'Aufgezogene Spritze',
    weight = 20,
    stack = false,      -- jede Spritze hat eigenen Inhalt (Metadaten)
    close = true,
    description = 'Vorbereitetes Medikament - am Patienten ueber das Behandlungsmenue injizieren',
},

['spritze_benutzt'] = {
    label = 'Benutzte Spritze',
    weight = 15,
    stack = true,
    close = true,
    description = 'In den Abwurfbehaelter entsorgen',
},
