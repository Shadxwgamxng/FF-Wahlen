--[[
    Einsatz-Creator - Kataloge

    Alle Listen koennen frei erweitert werden. Modelle, die im Spiel nicht
    existieren, werden im Creator automatisch als "nicht verfuegbar" markiert
    und koennen nicht gesetzt werden.
]]

Catalog = {}

----------------------------------------------------------------------------
-- Einsatzarten
-- fields: zusaetzliche, art-spezifische Felder im Tab "Einsatz"
--   type: text | textarea | number | select | checkbox
----------------------------------------------------------------------------
Catalog.Categories = {
    {
        id = 'brand', label = 'Brandeinsatz', icon = 'flame', roles = { 'fire' },
        keywords = {
            'B1 - Kleinbrand', 'B2 - Mittelbrand', 'B3 - Grossbrand', 'B4 - Grossbrand erweitert',
            'B Wohnung', 'B Gebaeude', 'B Gebaeude - Menschenleben in Gefahr', 'B Kfz', 'B Lkw',
            'B Flaeche / Vegetation', 'B Wald', 'B Industrie', 'B Lagerhalle', 'Rauchentwicklung',
        },
        fields = {
            { key = 'objekt', label = 'Brandobjekt', type = 'select', options = { 'Wohnung', 'Gebaeude', 'Fahrzeug', 'Mehrere Fahrzeuge', 'Flaeche / Vegetation', 'Wald', 'Industrie', 'Lagerhalle', 'Muell / Container', 'Sonstiges' } },
            { key = 'geschoss', label = 'Geschoss / Bereich', type = 'text' },
            { key = 'personenInGefahr', label = 'Personen in Gefahr', type = 'number' },
            { key = 'ausbreitung', label = 'Brandausbreitung', type = 'select', options = { 'keine', 'langsam', 'schnell', 'Uebergreifen droht' } },
            { key = 'rauch', label = 'Rauchentwicklung', type = 'select', options = { 'keine', 'leicht', 'mittel', 'stark', 'ohne sichtbares Feuer' } },
            { key = 'gefahrstoffe', label = 'Gefahrstoffe beteiligt', type = 'checkbox' },
            { key = 'loeschmittel', label = 'Empfohlenes Loeschmittel', type = 'select', options = { 'Wasser', 'Schaum', 'Wasser + Schaum', 'Sonderloeschmittel' } },
            { key = 'wasserversorgung', label = 'Hinweis Wasserversorgung', type = 'text' },
        },
    },
    {
        id = 'thl', label = 'Technische Hilfeleistung', icon = 'wrench', roles = { 'fire' },
        keywords = {
            'TH - klein', 'TH - mittel', 'TH - Person eingeklemmt', 'TH - Baum auf Strasse',
            'TH - Sturmschaden', 'TH - Gefahrgut', 'TH - Betriebsstoffe', 'TH - Baustellenunfall',
            'TH - Lkw-Unfall', 'TH - Motorradunfall', 'TH - Allgemein',
        },
        fields = {
            { key = 'lageart', label = 'Lageart', type = 'select', options = { 'Verkehrsunfall', 'Person eingeklemmt', 'Baum / Hindernis', 'Sturmschaden', 'Gefahrgut', 'Betriebsstoffe', 'Baustellenunfall', 'Lkw-Unfall', 'Motorradunfall', 'Sonstige TH' } },
            { key = 'eingeklemmt', label = 'Eingeklemmte Personen', type = 'number' },
            { key = 'gefahrgutUN', label = 'UN-Nummer / Kemler', type = 'text' },
            { key = 'stoff', label = 'Stoff / Betriebsstoff', type = 'text' },
            { key = 'menge', label = 'Ausgetretene Menge', type = 'text' },
            { key = 'strasseGesperrt', label = 'Fahrbahn gesperrt', type = 'checkbox' },
            { key = 'statik', label = 'Statik gefaehrdet', type = 'checkbox' },
        },
    },
    {
        id = 'tuer', label = 'Tueroeffnung', icon = 'door', roles = { 'fire', 'police' },
        keywords = { 'Tueroeffnung - dringend', 'Tueroeffnung - nicht dringend', 'Tueroeffnung - hilflose Person', 'Tueroeffnung - Notlage vermutet' },
        fields = {
            { key = 'dringlichkeit', label = 'Dringlichkeit', type = 'select', options = { 'dringend', 'nicht dringend' } },
            { key = 'grund', label = 'Grund', type = 'select', options = { 'Hilflose Person', 'Notlage vermutet', 'Kind / Person eingeschlossen', 'Wasserschaden', 'Brandgeruch', 'Sonstiges' } },
            { key = 'geschoss', label = 'Geschoss / Wohnung', type = 'text' },
            { key = 'melder', label = 'Melder / Angehoerige vor Ort', type = 'text' },
            { key = 'rdUnterstuetzung', label = 'Rettungsdienst erforderlich', type = 'checkbox' },
            { key = 'polizei', label = 'Polizei erforderlich', type = 'checkbox' },
            { key = 'zugang', label = 'Hinweis Zugang', type = 'text' },
        },
    },
    {
        id = 'vu', label = 'Verkehrsunfall', icon = 'car', roles = { 'fire', 'ems', 'police' },
        keywords = { 'VU - Sachschaden', 'VU - mit Verletzten', 'VU - Person eingeklemmt', 'VU - mehrere Fahrzeuge', 'VU - Lkw', 'VU - Motorrad', 'VU - Bus', 'MANV' },
        fields = {
            { key = 'unfallart', label = 'Unfallart', type = 'select', options = { 'Auffahrunfall', 'Frontalzusammenstoss', 'Seitenaufprall', 'Ueberschlag', 'Abkommen von Fahrbahn', 'Fahrzeug gegen Baum', 'Fussgaenger', 'Motorrad', 'Lkw beteiligt', 'Massenkarambolage' } },
            { key = 'fahrzeuge', label = 'Beteiligte Fahrzeuge', type = 'number' },
            { key = 'verletzte', label = 'Verletzte', type = 'number' },
            { key = 'eingeklemmt', label = 'Eingeklemmte Personen', type = 'number' },
            { key = 'betriebsstoffe', label = 'Auslaufende Betriebsstoffe', type = 'checkbox' },
            { key = 'brand', label = 'Fahrzeugbrand', type = 'checkbox' },
            { key = 'verkehr', label = 'Verkehrslage', type = 'select', options = { 'frei', 'teilweise blockiert', 'vollgesperrt' } },
        },
    },
    {
        id = 'rd', label = 'Rettungsdienst', icon = 'cross', roles = { 'ems' },
        keywords = { 'RD - Notfall', 'RD - Notfall mit NA', 'RD - Bewusstlose Person', 'RD - Reanimation', 'RD - Sturz', 'RD - Atemnot', 'RD - MANV' },
        fields = {
            { key = 'meldebild', label = 'Meldebild', type = 'select', options = { 'Bewusstlose Person', 'Atemnot', 'Brustschmerz', 'Sturz', 'Reanimation', 'Schlaganfall', 'Krampfanfall', 'Vergiftung', 'Verletzung', 'Sonstiges' } },
            { key = 'notarzt', label = 'Notarzt erforderlich', type = 'checkbox' },
            { key = 'rth', label = 'RTH sinnvoll', type = 'checkbox' },
            { key = 'ansprechbar', label = 'Patient ansprechbar', type = 'select', options = { 'ja', 'nein', 'unbekannt' } },
            { key = 'zugang', label = 'Hinweis Zugang', type = 'text' },
        },
    },
}

table.insert(Catalog.Categories, {
    id = 'ktw', label = 'Krankentransport / Verlegung', icon = 'cross', roles = { 'ems' },
    keywords = { 'KTW - Verlegung', 'KTW - Krankentransport', 'RTW - Verlegung', 'KTW - Entlassung' },
    fields = {
        { key = 'art', label = 'Transportart', type = 'select', options = { 'Verlegung Klinik -> Klinik', 'Einweisung', 'Entlassung nach Hause', 'Dialyse / Termin' } },
        { key = 'liegend', label = 'Liegendtransport', type = 'checkbox' },
        { key = 'infektion', label = 'Infektionstransport', type = 'checkbox' },
        { key = 'abholort', label = 'Abholort (Station / Zimmer)', type = 'text' },
        { key = 'termin', label = 'Termin / Uhrzeit', type = 'text' },
    },
})

Catalog.Priorities = {
    { value = 1, label = 'P1 - Sonderrechte, Lebensgefahr' },
    { value = 2, label = 'P2 - dringend' },
    { value = 3, label = 'P3 - nicht dringend' },
}

-- Auswahlliste fuer "Erwartete Einsatzmittel" (freie Eingabe zusaetzlich moeglich)
Catalog.Units = { 'ELW', 'HLF', 'LF', 'TLF', 'DLK', 'RW', 'GW-G', 'GW-L', 'MTF', 'RTW', 'NEF', 'KTW', 'RTH', 'FuStW', 'Abschleppdienst' }

----------------------------------------------------------------------------
-- Fahrzeuge (Spawnnamen)
----------------------------------------------------------------------------
Catalog.Vehicles = {
    { label = 'PKW', models = { 'asea', 'blista', 'premier', 'emperor', 'stanier', 'tailgater', 'sultan', 'primo', 'fugitive', 'schafter2', 'oracle', 'washington', 'intruder', 'ingot', 'glendale', 'warrener', 'dilettante', 'panto', 'issi2', 'felon', 'jackal' } },
    { label = 'SUV / Gelaende', models = { 'baller', 'cavalcade', 'granger', 'landstalker', 'patriot', 'radi', 'seminole', 'rocoto', 'serrano', 'dubsta', 'mesa', 'bison', 'sadler', 'rebel' } },
    { label = 'Transporter', models = { 'rumpo', 'speedo', 'burrito3', 'youga', 'pony', 'boxville', 'minivan', 'surfer', 'journey' } },
    { label = 'LKW', models = { 'mule', 'mule3', 'benson', 'pounder', 'phantom', 'hauler', 'packer', 'biff', 'mixer', 'tiptruck', 'flatbed', 'towtruck', 'trash', 'stockade' } },
    { label = 'Anhaenger', models = { 'tanker', 'trailers', 'trailerlogs', 'docktrailer' } },
    { label = 'Motorraeder / Raeder', models = { 'sanchez', 'bati', 'pcj', 'faggio', 'akuma', 'hexer', 'daemon', 'ruffian', 'vader', 'double', 'bagger', 'bmx', 'scorcher' } },
    { label = 'Busse', models = { 'bus', 'coach', 'airbus' } },
    { label = 'Arbeitsmaschinen', models = { 'tractor2', 'forklift', 'bulldozer', 'rubble', 'dump' } },
    { label = 'Rettungsdienst: RTW', models = { 'bftecrtw', 'bftecrtw2', 'bftecrtw3' } },
    { label = 'Rettungsdienst: NEF', models = { 'ambulance' } },
    { label = 'Rettungsdienst: KTW', models = { 'ambulance' } },
    { label = 'Einsatzfahrzeuge', models = { 'firetruk', 'ambulance', 'police', 'police2', 'police3', 'sheriff', 'fbi', 'riot', 'lguard', 'pbus' } },
}

----------------------------------------------------------------------------
-- Objekte / Props
----------------------------------------------------------------------------
Catalog.Props = {
    -- Objekte, an denen z_fire Objektbraende zulaesst (Config.ZFire.allowedProps)
    { label = 'Brandobjekte (z_fire)', models = {
        'prop_dumpster_01a', 'prop_dumpster_02a', 'prop_dumpster_02b', 'prop_dumpster_3a', 'prop_dumpster_4a', 'prop_skip_01a',
        'prop_skip_03', 'prop_skip_05a', 'prop_bin_05a', 'prop_bin_07a', 'prop_bin_14a', 'prop_cs_bin_03',
        'prop_rub_pile_01', 'prop_rub_pile_02', 'prop_rub_pile_03', 'prop_bbq_1', 'prop_bbq_5', 'prop_beach_bbq',
        'prop_homeles_shelter_01', 'prop_homeles_shelter_02', 'prop_skid_trolley_1',
    } },
    { label = 'Verkehrsunfall & Truemmer', models = {
        'prop_rub_carwreck_2', 'prop_rub_carwreck_3', 'prop_rub_carwreck_5', 'prop_rub_carwreck_7', 'prop_rub_carwreck_8',
        'prop_rub_carwreck_9', 'prop_rub_carwreck_10', 'prop_rub_carwreck_11', 'prop_rub_buswreck_01', 'prop_rub_buswreck_03',
        'prop_rub_buswreck_06', 'prop_rub_trukwreck_1', 'prop_rub_trukwreck_2', 'prop_rub_tyre_01', 'prop_rub_tyre_02',
        'prop_rub_tyre_03', 'prop_rub_wheel_01', 'prop_rub_wheel_02', 'prop_rub_carpart_02', 'prop_rub_carpart_03',
        'prop_rub_carpart_04', 'prop_wheel_01', 'prop_wheel_tyre', 'prop_rub_scrap_02',
    } },
    { label = 'Absperrungen & Leitkegel', models = {
        'prop_roadcone01a', 'prop_roadcone02a', 'prop_roadcone02b', 'prop_mp_cone_01', 'prop_mp_cone_02',
        'prop_barrier_work01a', 'prop_barrier_work02a', 'prop_barrier_work04a', 'prop_barrier_work05', 'prop_barrier_work06a',
        'prop_mp_barrier_01', 'prop_mp_barrier_02b', 'prop_mp_arrow_barrier_01', 'prop_barrier_wat_01a', 'prop_barrier_wat_03b',
        'prop_plas_barier_01a', 'prop_consign_01a', 'prop_consign_02a',
    } },
    { label = 'Baustelle', models = {
        'prop_worklight_01a', 'prop_worklight_03a', 'prop_worklight_03b', 'prop_worklight_04a', 'prop_generator_01a',
        'prop_generator_03b', 'prop_cementmixer_01a', 'prop_conc_blocks01a', 'prop_pipes_01a', 'prop_cons_crate',
        'prop_portacabin01', 'prop_portaloo_01a', 'prop_skip_01a', 'prop_skip_06a', 'prop_wheelbarrow01a',
    } },
    { label = 'Gefahrgut & Behaelter', models = {
        'prop_barrel_01a', 'prop_barrel_02a', 'prop_barrel_02b', 'prop_barrel_exp_01a', 'prop_barrel_exp_01b',
        'prop_barrel_exp_01c', 'prop_gas_tank_01a', 'prop_gas_tank_02a', 'prop_gascyl_01a', 'prop_gascyl_02a',
        'prop_jerrycan_01a',
    } },
    { label = 'Einsatzmaterial', models = {
        'prop_fire_exting_1a', 'prop_fire_exting_2a', 'prop_flare_01', 'prop_ld_health_pack', 'prop_med_bag_01b',
        'prop_toolchest_01', 'prop_tool_box_01', 'prop_tool_box_04', 'prop_fire_hydrant_1', 'prop_fire_hydrant_2', 'prop_fire_hydrant_4',
    } },
    { label = 'Brennbares & Container', models = {
        'prop_dumpster_01a', 'prop_dumpster_02a', 'prop_dumpster_4a', 'prop_bin_01a', 'prop_rub_binbag_01',
        'prop_rub_couch01', 'prop_rub_couch04', 'prop_pallet_pile_01', 'prop_pallet_pile_02', 'prop_boxpile_07d',
        'prop_haybale_01', 'prop_haybale_03', 'prop_woodpile_01a',
    } },
    { label = 'Baeume & Sturm', models = {
        'prop_tree_fallen_pine_01', 'prop_tree_fallen_01', 'prop_tree_fallen_02', 'prop_tree_log_01', 'prop_tree_log_02',
        'prop_rub_planks_01', 'prop_rub_planks_02',
    } },
    { label = 'Strasseninventar', models = {
        'prop_streetlight_01', 'prop_traffic_01a', 'prop_sign_road_01a', 'prop_bollard_02a', 'prop_elecbox_01a',
        'prop_elecbox_02a', 'prop_postbox_01a', 'prop_bench_01a', 'prop_busstop_02',
    } },
    { label = 'Fundstellen & Gegenstaende', models = {
        'prop_ld_suitcase_01', 'p_michael_backpack_s', 'prop_ld_wallet_01', 'prop_cs_heist_bag_01', 'prop_bomb_01',
        'prop_ld_bomb', 'prop_box_wood02a', 'prop_cardbordbox_02a',
    } },
}

----------------------------------------------------------------------------
-- NPC-Modelle (Patienten / Beteiligte)
----------------------------------------------------------------------------
Catalog.Peds = {
    { label = 'Maenner', models = { 'a_m_m_business_01', 'a_m_y_business_01', 'a_m_m_tourist_01', 'a_m_o_genstreet_01', 'a_m_y_genstreet_01', 'a_m_y_hipster_01', 'a_m_m_farmer_01', 'a_m_m_hillbilly_01', 'a_m_y_runner_01', 'a_m_o_tramp_01', 'a_m_y_beach_01', 'a_m_y_skater_01' } },
    { label = 'Frauen', models = { 'a_f_y_tourist_01', 'a_f_m_business_02', 'a_f_y_business_01', 'a_f_y_hipster_01', 'a_f_o_genstreet_01', 'a_f_m_fatwhite_01', 'a_f_y_runner_01' } },
    { label = 'Berufe / Verkehr', models = { 's_m_y_construct_01', 's_m_y_construct_02', 's_m_m_trucker_01', 'a_m_y_motox_01', 'a_m_y_roadcyc_01' } },
}

-- Koerperhaltungen fuer NPCs (Animationen werden vom Client geprueft, Fallback = bewusstlos)
Catalog.Poses = {
    { id = 'bewusstlos', label = 'Liegend, bewusstlos', dict = 'dead', anim = 'dead_a' },
    { id = 'bewusstlos_b', label = 'Liegend, bewusstlos (Bauch)', dict = 'dead', anim = 'dead_d' },
    { id = 'schmerz', label = 'Liegend, Schmerzen', dict = 'combat@damage@writhe', anim = 'writhe_loop' },
    { id = 'seitenlage', label = 'Seitenlage', dict = 'amb@world_human_bum_slumped@male@laying_on_left_side@base', anim = 'base' },
    { id = 'sitzend', label = 'Sitzend am Boden', dict = 'amb@world_human_picnic@male@base', anim = 'base' },
    { id = 'benommen', label = 'Sitzend, benommen', dict = 'amb@world_human_stupor@male@base', anim = 'base' },
    { id = 'kauernd', label = 'Kauernd, verängstigt', dict = 'amb@code_human_cower@male@base', anim = 'base' },
    { id = 'stehend', label = 'Stehend, leicht verletzt', dict = 'amb@world_human_bum_standing@depressed@idle_a', anim = 'idle_a' },
    { id = 'fahrzeug', label = 'Im Fahrzeug (Sitz waehlen)', vehicle = true },
}

Catalog.Injuries = {
    'Schaedel-Hirn-Trauma', 'Polytrauma', 'Wirbelsaeulentrauma', 'Fraktur Arm', 'Fraktur Bein', 'Beckenfraktur',
    'Verbrennung', 'Rauchgasvergiftung', 'Schnittverletzung', 'Prellungen', 'Starke Blutung', 'Herzinfarkt',
    'Schlaganfall', 'Kreislaufstillstand', 'Atemnot', 'Unterzuckerung', 'Krampfanfall', 'Intoxikation',
    'Unterkuehlung', 'Psychischer Ausnahmezustand',
}

Catalog.Severities = {
    { id = 'leicht', label = 'Leicht (gruen)', color = '#3fb950' },
    { id = 'mittel', label = 'Mittel (gelb)', color = '#d29922' },
    { id = 'schwer', label = 'Schwer (rot)', color = '#f85149' },
    { id = 'kritisch', label = 'Kritisch (rot, lebensbedrohlich)', color = '#ff2d55' },
}

Catalog.Consciousness = { 'wach', 'eingetruebt', 'bewusstlos' }
Catalog.Mobility = { 'gehfaehig', 'nicht gehfaehig', 'eingeklemmt' }

----------------------------------------------------------------------------
-- Feuer- und Rauchtypen (eigenes Feuersystem, loeschbar mit z_hose)
--   dict/name: Partikeleffekt; scale: Grundgroesse
--   resistance: >1 = schwerer zu loeschen
--   water/foam/extinguisher: Wirksamkeit des Loeschmittels (Faktor)
--   radius: Wirkradius bei Groesse 1.0 (Treffer & Spielerschaden)
--   smoke: begleitender Rauch (Index in SmokeTypes) oder nil
----------------------------------------------------------------------------
Catalog.FireTypes = {
    { id = 'klein', label = 'Kleinbrand / Glut', dict = 'core', name = 'ent_amb_torch_fire', scale = 1.6, resistance = 0.6, water = 1.0, foam = 1.0, extinguisher = 1.2, radius = 0.9, smoke = 'leicht' },
    { id = 'normal', label = 'Normales Feuer', dict = 'core', name = 'ent_ray_heli_aprtmnt_l_fire', scale = 0.7, resistance = 1.0, water = 1.0, foam = 1.1, extinguisher = 0.8, radius = 1.6, smoke = 'mittel' },
    { id = 'gross', label = 'Grossfeuer', dict = 'core', name = 'fire_wrecked_plane_cockpit', scale = 1.0, resistance = 1.6, water = 1.0, foam = 1.2, extinguisher = 0.3, radius = 2.6, smoke = 'stark' },
    { id = 'fahrzeug', label = 'Fahrzeugbrand', dict = 'core', name = 'fire_wrecked_plane_cockpit', scale = 0.8, resistance = 1.4, water = 0.9, foam = 1.4, extinguisher = 0.5, radius = 2.2, smoke = 'stark' },
    { id = 'vegetation', label = 'Vegetation / Flaeche', dict = 'core', name = 'ent_ray_heli_aprtmnt_l_fire', scale = 0.5, resistance = 0.8, water = 1.1, foam = 1.0, extinguisher = 0.9, radius = 1.4, smoke = 'mittel' },
    { id = 'fluessigkeit', label = 'Fluessigkeitsbrand', dict = 'core', name = 'ent_sht_petrol_fire', scale = 1.2, resistance = 2.2, water = 0.25, foam = 1.6, extinguisher = 0.7, radius = 1.8, smoke = 'stark' },
}
Catalog.FireFallback = { dict = 'core', name = 'ent_ray_heli_aprtmnt_l_fire' }

Catalog.SmokeTypes = {
    { id = 'leicht', label = 'Leichter Rauch', dict = 'core', name = 'ent_amb_generator_smoke', scale = 1.5 },
    { id = 'mittel', label = 'Mittlerer Rauch', dict = 'core', name = 'ent_amb_smoke_foundry', scale = 1.0 },
    { id = 'stark', label = 'Starker, dunkler Rauch', dict = 'scr_agencyheistb', name = 'scr_env_agency3b_smoke', scale = 1.0 },
    { id = 'gas', label = 'Gas / Chemikalien (grau)', dict = 'core', name = 'exp_grd_bzgas_smoke', scale = 1.0 },
}
Catalog.SmokeFallback = { dict = 'core', name = 'ent_amb_smoke_foundry' }

----------------------------------------------------------------------------
-- Marker, Gebiete, Betriebsstoffe
----------------------------------------------------------------------------
Catalog.MarkerKinds = {
    { id = 'fundstelle', label = 'Fundstelle', sprite = 280, colour = 5 },
    { id = 'bereitstellung', label = 'Bereitstellungsraum', sprite = 50, colour = 3 },
    { id = 'patientenablage', label = 'Patientenablage', sprite = 61, colour = 1 },
    { id = 'wasser', label = 'Wasserentnahme', sprite = 410, colour = 3 },
    { id = 'sammelplatz', label = 'Sammelplatz', sprite = 280, colour = 2 },
    { id = 'einsatzleitung', label = 'Einsatzleitung', sprite = 60, colour = 1 },
    { id = 'gefahr', label = 'Gefahrenstelle', sprite = 436, colour = 1 },
    { id = 'zugang', label = 'Zugang / Zufahrt', sprite = 38, colour = 0 },
    { id = 'zielort', label = 'Zielort (Transport)', sprite = 61, colour = 2 },
    { id = 'sonstiges', label = 'Sonstiges', sprite = 1, colour = 0 },
}

Catalog.AreaKinds = {
    { id = 'einsatzgebiet', label = 'Einsatzgebiet', colour = 1 },
    { id = 'suchgebiet', label = 'Suchgebiet', colour = 5 },
    { id = 'sperrzone', label = 'Sperrzone', colour = 49 },
    { id = 'gefahrenbereich', label = 'Gefahrenbereich', colour = 1 },
    { id = 'absperrung', label = 'Absperrbereich', colour = 47 },
}

Catalog.SpillKinds = {
    { id = 'oel', label = 'Oelspur' },
    { id = 'kraftstoff', label = 'Kraftstoff' },
    { id = 'chemikalie', label = 'Chemikalie / unbekannter Stoff' },
}

-- Unfall-Schadensstufen fuer Fahrzeuge
Catalog.DamageLevels = {
    { id = 0, label = 'Unbeschaedigt' },
    { id = 1, label = 'Leicht' },
    { id = 2, label = 'Mittel' },
    { id = 3, label = 'Schwer' },
    { id = 4, label = 'Totalschaden' },
}
