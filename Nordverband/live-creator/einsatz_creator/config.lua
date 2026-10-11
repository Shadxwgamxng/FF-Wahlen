--[[
    Einsatz-Creator - zentrale Konfiguration

    Alles, was fuer normale Einsatzerstellungen noetig ist, passiert ingame.
    Diese Datei enthaelt nur Server-Grundeinstellungen (Rechte, Grenzen,
    Verhalten). Kataloge (Fahrzeuge, Props, NPCs, Feuerarten) stehen in
    config_catalog.lua.
]]

Config = {}

-- Ausfuehrliche Meldungen in Server- und F8-Konsole
Config.Debug = false

-- Befehle
Config.Commands = {
    creator = 'einsatzcreator',   -- oeffnet den Creator
    info = 'einsatzinfo',         -- Einsatzinformationen fuer alarmierte Kraefte
    route = 'einsatzroute',       -- Route zum zuletzt alarmierten Einsatz
}

--[[
    Berechtigungen (serverseitig geprueft)

    ACE-Beispiele fuer server.cfg:
        add_ace group.admin einsatzcreator.use allow
        add_ace group.admin einsatzcreator.live allow
        add_ace group.admin einsatzcreator.manage allow
        add_ace group.admin einsatzcreator.delete allow

    Jede Aktion verlangt eine Stufe. Erlaubt ist eine Aktion, wenn der Spieler
    das passende ACE-Recht hat ODER (falls Framework aktiv) einen der Jobs mit
    mindestens dem angegebenen Rang.
]]
Config.Permissions = {
    ace = {
        use = 'einsatzcreator.use',         -- Creator oeffnen, Vorschau, Szenarien bearbeiten/speichern
        test = 'einsatzcreator.use',        -- Testeinsatz ausloesen
        live = 'einsatzcreator.live',       -- Live-Einsatz ausloesen
        manage = 'einsatzcreator.manage',   -- fremde Einsaetze beenden/abbrechen
        delete = 'einsatzcreator.delete',   -- fremde Szenarien loeschen
    },
    -- Optionale Freigabe ueber Framework-Jobs (nur wenn Config.Framework ~= 'none')
    -- Beispiel: use = { { job = 'fire', minGrade = 3 } }
    jobs = {
        use = {},
        test = {},
        live = {},
        manage = {},
        delete = {},
    },
}

--[[
    Framework fuer Job-Abfragen (Alarmierung nach Job, Berechtigungen nach Job).
    'auto'  = es_extended, qb-core oder qbx_core erkennen, sonst 'none'
    'none'  = nur ACE (komplett eigenstaendig)
    'esx' | 'qb' | 'qbx'
]]
Config.Framework = 'auto'

--[[
    Rollen der Einsatzkraefte (fuer Alarmierung und Interaktionen).
    Ein Spieler hat eine Rolle, wenn er das ACE-Recht besitzt ODER einen der Jobs.
    Ohne Framework funktionieren nur die ACE-Rechte, z. B.:
        add_ace group.feuerwehr einsatzcreator.role.fire allow
]]
Config.Roles = {
    fire = { label = 'Feuerwehr', ace = 'einsatzcreator.role.fire', jobs = { 'fire', 'firefighter', 'fd' } },
    ems = { label = 'Rettungsdienst', ace = 'einsatzcreator.role.ems', jobs = { 'ambulance', 'ems', 'medic' } },
    police = { label = 'Polizei', ace = 'einsatzcreator.role.police', jobs = { 'police', 'sheriff' } },
}

-- Nur Spieler im Dienst alarmieren (ESX: job, QB/QBX: job.onduty)
Config.OnlyOnDuty = true

-- Grenzen pro Einsatz (Feuer und Rauch werden getrennt gezaehlt)
Config.Limits = {
    vehicle = 10,
    object = 60,
    fire = 30,
    smoke = 15,
    ped = 12,
    marker = 20,
    area = 8,
    door = 6,
    spill = 15,
    total = 150,
    scenarios = 500,          -- maximal gespeicherte Szenarien
    activeIncidents = 10,     -- gleichzeitig aktive Einsaetze (Test + Live)
}

-- Modelle: nur Katalogmodelle erlauben? (false = auch freie Spawnnamen, ausser Sperrliste)
Config.OnlyCatalogModels = false
-- Gesperrte Modelle (Militaer, bewaffnete Fahrzeuge ...)
Config.ModelBlacklist = {
    'rhino', 'khanjali', 'apc', 'halftrack', 'insurgent', 'insurgent2', 'insurgent3', 'menacer', 'barrage',
    'chernobog', 'thruster', 'oppressor', 'oppressor2', 'deluxo', 'ruiner2', 'scramjet', 'vigilante', 'toreador',
    'stromberg', 'tampa3', 'lazer', 'hydra', 'hunter', 'akula', 'savage', 'valkyrie', 'valkyrie2', 'buzzard',
    'annihilator', 'annihilator2', 'strikeforce', 'b11', 'jet', 'cargoplane', 'titan', 'avenger', 'volatol', 'bombushka',
}

-- Editor / Kamera
Config.Editor = {
    maxDistance = 800.0,      -- maximale Entfernung der Kamera vom Einsatzmittelpunkt (bzw. Oeffnungsort)
    maxElementDistance = 400.0, -- maximale Entfernung eines Elements vom Einsatzmittelpunkt
    speed = 0.6,              -- Grundgeschwindigkeit (m pro Frame bei 60 FPS * 0.016)
    fastMultiplier = 4.0,     -- Shift
    slowMultiplier = 0.2,     -- Strg
    lookSensitivity = 6.0,
    rotateStep = 15.0,        -- Grad pro Mausrad-Schritt
    fineRotateStep = 1.0,     -- Grad pro Mausrad-Schritt mit Alt
    raycastDistance = 300.0,
    fov = 60.0,
}

-- Betriebsmodi
Config.Modes = {
    -- Testeinsatz: wer wird alarmiert? Nur der Ausloesende + Spieler mit diesem ACE-Recht
    testReceiversAce = 'einsatzcreator.testempfang',
    -- Darf ein Szenario gleichzeitig mehrfach aktiv sein?
    allowMultipleInstances = false,
    -- Bei Fehler waehrend des Aufbaus alles bereits Erzeugte zuruecknehmen
    rollbackOnError = true,
    -- Automatisches Abbrechen aktiver Einsaetze nach x Minuten (0 = aus)
    autoCancelMinutes = 180,
    -- Testeinsaetze automatisch nach x Minuten abbrechen (0 = aus)
    autoCancelTestMinutes = 45,
}

-- Verhalten beim normalen Beenden (Abbrechen entfernt immer alles)
Config.EndCleanup = {
    delaySeconds = 0,         -- Verzoegerung, bevor Szene geraeumt wird
    removeVehicles = true,
    removeObjects = true,
    removePeds = true,
    removeEffects = true,
}

-- Alarmierung (interne Alarmierung im Spiel; die Leitstelle haengt an bridge/dispatch.lua)
Config.Alarm = {
    enabled = true,
    sound = true,             -- kurzer Hinweiston (Frontend-Sound)
    blipSprite = 436,
    blipColour = 1,
    blipScale = 1.0,
    areaBlipAlpha = 80,
    autoRouteOnAlarm = false, -- automatisch GPS setzen
    popupSeconds = 25,
}

-- Feuer
Config.Fire = {
    renderDistance = 150.0,   -- ab dieser Entfernung zeichnet ein Client Feuer/Rauch
    tickSeconds = 2,          -- Simulationstakt auf dem Server
    maxHealth = 100.0,
    -- Loeschwirkung pro Sekunde Strahl bei voller Wirkung (wird mit fireType.resistance verrechnet)
    extinguishPerSecond = {
        hose = 22.0,          -- z_hose Wasser
        foam = 34.0,          -- z_hose Schaum
        extinguisher = 14.0,  -- GTA Feuerloescher
    },
    hoseRange = 28.0,         -- Wurfweite Strahlrohr (m)
    extinguisherRange = 7.0,
    coneAngle = 14.0,         -- halber Oeffnungswinkel des Strahls in Grad
    regenPerTick = 1.5,       -- nicht bekaempftes Feuer erholt sich je Tick
    reigniteChance = 8,       -- % pro Tick, dass ein Glutnest wieder aufflammt (nur wenn smoulder aktiv)
    smoulderSeconds = 45,     -- wie lange ein geloeschter Brandherd glimmt
    playerDamage = true,      -- Spieler in den Flammen nehmen Schaden
    playerDamagePerSecond = 6,
    maxHitsPerSecond = 12,    -- Anti-Cheat: maximale Trefferpakete pro Sekunde
}

-- z_hose (optional, wird automatisch erkannt)
Config.ZHose = {
    resource = 'z_hose',
    -- Waffen laut z_hose cfg.hoses (Standardwerte aus der Dokumentation)
    waterWeapons = { 'WEAPON_REELBRANCH' },
    foamWeapons = { 'WEAPON_FOAMBRANCH' },
    -- GTA-Feuerloescher ebenfalls zulassen
    allowExtinguisher = true,
}

-- Interaktionen der Einsatzkraefte (Tasten siehe https://docs.fivem.net/docs/game-references/controls/)
Config.Interaction = {
    key = 38,          -- E
    keyLabel = 'E',
    cancelKey = 73,    -- X
    cancelLabel = 'X',
    maxMoveDistance = 3.0, -- Abbruch, wenn man sich waehrend einer Massnahme entfernt
}

-- Rettungsdienst / Patienten
Config.Rescue = {
    interactDistance = 2.2,
    vehicleDistance = 7.0,    -- Abstand Patient <-> RTW zum Einladen
    -- Fahrzeugmodelle, in die Patienten eingeladen werden duerfen (leer = jedes Fahrzeug)
    transportVehicles = { 'ambulance' },
    -- Uebergabeorte (Kliniken). Patient wird dort uebergeben, wenn der RTW in Reichweite ist.
    hospitals = {
        { label = 'Pillbox Hill Medical Center', coords = vector3(294.6, -1448.3, 29.9), radius = 35.0 },
        { label = 'Mount Zonah', coords = vector3(-449.7, -340.6, 34.5), radius = 35.0 },
        { label = 'Sandy Shores Medical', coords = vector3(1839.4, 3672.9, 34.3), radius = 30.0 },
        { label = 'Paleto Bay Medical', coords = vector3(-247.8, 6331.5, 32.4), radius = 30.0 },
    },
    -- Dauer der Massnahmen in Sekunden je Schweregrad
    durations = {
        assess = 6,
        treat = { leicht = 10, mittel = 18, schwer = 28, kritisch = 40 },
        free = 25,            -- technische Rettung (eingeklemmt)
        load = 5,
    },
    -- Wer darf was? (Rollen aus Config.Roles; leer = jeder)
    roles = {
        assess = { 'ems', 'fire' },
        treat = { 'ems' },
        free = { 'fire' },
        load = { 'ems' },
        handover = { 'ems' },
    },
    invincible = true,        -- Patienten koennen nicht getoetet werden
}

-- Tueroeffnung
Config.Doors = {
    durationSeconds = 15,
    roles = { 'fire', 'police' },
    -- Echte Kartentueren ueber das GTA-Tuersystem verriegeln (Konflikte mit Doorlock-Scripts moeglich)
    useDoorSystem = true,
}

-- Betriebsstoffe / Oelspur
Config.Spills = {
    durationSeconds = 12,
    roles = { 'fire' },
}

-- Fundstellen / Marker mit Interaktion ("Fundstelle sichern")
Config.Markers = {
    durationSeconds = 6,
    roles = { 'fire', 'police' },
    interactDistance = 2.5,
}

-- Speicherung (JSON im Resource-Ordner)
Config.Storage = {
    directory = 'data',       -- relativ zur Resource; bei Updates diesen Ordner NICHT ueberschreiben
    historyLimit = 300,       -- Anzahl gespeicherter beendeter Einsaetze
}

-- Leitstellen-Bridge (siehe bridge/dispatch.lua)
--   'none'  = nur interne Einsatzverwaltung, keine Uebergabe
--   'event' = eigene Server-Events 'einsatzcreator:bridge:*' werden ausgeloest (zum Abonnieren durch die Leitstelle)
--   'custom' = Funktionen in Config.DispatchCustom werden aufgerufen
Config.Dispatch = {
    adapter = 'event',
    -- Interne Alarmierung auch dann senden, wenn eine Leitstelle angebunden ist?
    internalAlarm = true,
}

-- Optionale eigene Uebergabe an eine Leitstelle (adapter = 'custom').
-- Jede Funktion bekommt das unter bridge/dispatch.lua dokumentierte Payload.
Config.DispatchCustom = {
    onCreated = nil,          -- function(payload) end
    onStatus = nil,           -- function(payload) end
    onUpdate = nil,           -- function(payload) end
    onEnded = nil,            -- function(payload) end
}
