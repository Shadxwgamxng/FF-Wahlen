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
Config.Framework = 'qb'

--[[
    Rollen der Einsatzkraefte (fuer Alarmierung und Interaktionen).
    Ein Spieler hat eine Rolle, wenn er das ACE-Recht besitzt ODER einen der Jobs.
    Ohne Framework funktionieren nur die ACE-Rechte, z. B.:
        add_ace group.feuerwehr einsatzcreator.role.fire allow
]]
Config.Roles = {
    fire = { label = 'Feuerwehr', ace = 'einsatzcreator.role.fire', jobs = { 'fire' } },
    ems = { label = 'Rettungsdienst', ace = 'einsatzcreator.role.ems', jobs = { 'ambulance', 'ambulance2' } },
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
    -- Testeinsaetze werden nie alarmiert und nie an EmergencyDispatch uebergeben.
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


--[[
    Zufallseinsaetze
    Startwerte - werden ingame im Creator (Tab "Zufall") geaendert und in
    data/settings.json gespeichert. Ins Zufallssystem kommen gespeicherte
    Szenarien, bei denen "Im Zufallspool" aktiviert ist.
]]
Config.Random = {
    enabled = false,          -- Generator an/aus
    intervalMin = 10,         -- Minuten bis zum naechsten Einsatz (zufaellig zwischen min und max)
    intervalMax = 25,
    maxActive = 2,            -- hoechstens so viele Zufallseinsaetze gleichzeitig
    dayStart = 6,             -- "Tag" = 06:00 bis 20:59 Serverzeit
    dayEnd = 21,
}

-- Feuer
Config.Fire = {
    --[[
        backend:
          'z_fire'   Brand und Rauch werden ueber die z_fire-Exports erzeugt (createFire/createSmoke).
                     Loeschen mit z_hose, Ausbreitung, Glutnester usw. uebernimmt z_fire selbst.
          'internal' eigenes Feuersystem dieses Scripts (loeschbar mit z_hose ueber IsUsingHose)
          'auto'     z_fire, wenn die Resource laeuft, sonst automatisch 'internal' (zum Testen ohne z_fire)
    ]]
    backend = 'auto',
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

-- z_fire (bei Config.Fire.backend = 'z_fire' oder 'auto' mit laufendem z_fire)
Config.ZFire = {
    resource = 'z_fire',
    -- Partikeltypen aus cfg.fireTypes / cfg.smokeTypes eurer z_fire-config.lua.
    -- Standardwerte = Beispiele aus der z_fire-Dokumentation; bitte mit eurer Config abgleichen.
    fireEffects = { 'normal2', 'grass1', 'grass2', 'veh1', 'interior1' },
    smokeEffects = { 'linger1', 'normal' },
    defaultFireEffect = 'normal2',
    defaultSmokeEffect = 'linger1',
    -- Brenndauer, wenn im Creator 0 (= bis geloescht) gewaehlt ist
    endlessBurnout = 99999,
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
    -- 'ox_target' (wenn gestartet, sonst automatisch Taste) | 'key'
    mode = 'ox_target',
    targetResource = 'ox_target',
    key = 38,          -- E (nur Modus 'key')
    keyLabel = 'E',
    cancelKey = 73,    -- X
    cancelLabel = 'X',
    maxMoveDistance = 3.0, -- Abbruch, wenn man sich waehrend einer Massnahme entfernt
}

-- Rettungsdienst / Patienten
Config.Rescue = {
    interactDistance = 2.2,
    vehicleDistance = 7.0,    -- Abstand Patient <-> RTW zum Einladen
    -- Rettungsdienst-Fahrzeuge je Typ (bftecrtw* + Sitz 3 aus nv_medicDispatches Config.Cars;
    -- NEF und KTW vorerst mit dem GTA-Modell 'ambulance' als Platzhalter)
    vehicles = {
        rtw = { 'bftecrtw', 'bftecrtw2', 'bftecrtw3' },
        nef = { 'ambulance' },
        ktw = { 'ambulance' },
    },
    -- Fahrzeugmodelle, in die Patienten eingeladen werden duerfen (leer = jedes Fahrzeug)
    transportVehicles = { 'bftecrtw', 'bftecrtw2', 'bftecrtw3', 'ambulance' },
    -- bevorzugter Sitz je Modell (sonst hinten rechts/links/Beifahrer)
    transportSeats = { bftecrtw = 3, bftecrtw2 = 3, bftecrtw3 = 3 },
    -- Tragen (Fahrzeug-Modelle) - Patient kann darauf gelegt werden (aus nv_medicDispatches)
    stretcherModels = { 'rda_stretcher', 'c5m-stretcher' },
    stretcherDistance = 8.0,
    -- Abstand zum Zielort (Klinik oder Transportziel) fuer die Uebergabe
    handoverRadius = 15.0,
    -- Uebergabeorte (Kliniken). Patient wird dort uebergeben, wenn der RTW in Reichweite ist.
    hospitals = {
        -- uebernommen aus nv_medicDispatches (Config.Coords.KH)
        { label = 'St. Fiacre', coords = vector3(3512.7549, 3752.7153, 30.1174), radius = 25.0 },
        { label = 'Central Medical', coords = vector3(293.8427, -1438.5770, 29.8041), radius = 25.0 },
        { label = 'Pillbox', coords = vector3(362.0883, -589.9072, 28.6702), radius = 25.0 },
        { label = 'Mount Zonah', coords = vector3(-492.0538, -336.2079, 34.3725), radius = 25.0 },
        { label = 'Eclipse Medical Tower', coords = vector3(-678.9181, 298.3909, 82.1767), radius = 25.0 },
        { label = 'Rehaklinik', coords = vector3(-1526.8976, 856.3002, 181.6011), radius = 25.0 },
        { label = 'Sandy Shores (alt)', coords = vector3(1828.4731, 3693.8779, 34.2243), radius = 25.0 },
        { label = 'Paleto (alt)', coords = vector3(-255.4370, 6339.7871, 32.4262), radius = 25.0 },
        { label = 'BWK', coords = vector3(-1874.8500, -303.2209, 49.4722), radius = 25.0 },
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

-- Detaillierte medizinische Behandlung (config_medical.lua)
Config.Medical = {
    enabled = true,          -- false = nur einfacher Ablauf (Sichten -> Versorgen)
    roles = { 'ems' },       -- wer darf behandeln
    distance = 3.0,          -- max. Abstand zum Patienten
    actionCooldownMs = 1200, -- Mindestabstand zwischen zwei Massnahmen am selben Patienten
    -- "versorgt / transportbereit" erst, wenn alle Wunden versorgt, Frakturen geschient,
    -- Stifneck/Beckenschlinge angelegt und RR, HF und SpO2 gemessen sind
    requireCompleteCare = true,
    subtitleMs = 3500,       -- Anzeigedauer je Gespraechszeile
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
    -- 'auto' = Datenbank ueber oxmysql, wenn vorhanden, sonst JSON-Dateien | 'oxmysql' | 'json'
    -- Tabellen (einsatz_creator_scenarios, _store, _history) werden automatisch angelegt;
    -- vorhandene JSON-Daten werden beim ersten Start einmalig in die Datenbank uebernommen.
    backend = 'auto',
    mysqlResource = 'oxmysql',
    directory = 'data',       -- relativ zur Resource; bei Updates diesen Ordner NICHT ueberschreiben
    historyLimit = 300,       -- Anzahl gespeicherter beendeter Einsaetze
}

--[[
    Leitstellen-Bridge (siehe bridge/dispatch.lua)
    Dieses Script alarmiert NICHT selbst. Jeder Live-Einsatz (manuell oder
    zufaellig generiert) wird per Event als Notruf an EmergencyDispatch
    uebergeben; EmergencyDispatch alarmiert die Fahrzeuge.
      'emergencydispatch'  Notruf an EmergencyDispatch (Standard)
      'event'              nur eigene Server-Events 'einsatzcreator:bridge:*'
      'custom'             Funktionen in Config.DispatchCustom
      'none'               keine Uebergabe
]]
Config.Dispatch = {
    adapter = 'emergencydispatch',
}

--[[
    EmergencyDispatch (LoveRP) - adapter = 'emergencydispatch'
    Dokumentierte Schnittstelle (Server):
        TriggerEvent('emergencydispatch:emergencycall:new', job, meldung, coords, true)
    Damit wird ein Notruf in der Leitstelle des Jobs angelegt; Stichwort und
    Alarmierung nach AAO erfolgen dort durch den Disponenten.
    EmergencyDispatch bietet keine dokumentierte Schnittstelle fuer Statusaenderungen
    oder das Beenden von Einsaetzen - diese bleiben in der Leitstelle.
]]
Config.EmergencyDispatch = {
    resource = 'emergencydispatch',
    -- Leitstellen (Jobs), die beim Anlegen eines Einsatzes zur Auswahl stehen.
    -- Jeder Einsatz geht als genau ein Notruf an die dort gewaehlte Leitstelle.
    jobs = {
        { job = 'ambulance', label = 'Rettungsdienst (ambulance)' },
        { job = 'fire', label = 'Feuerwehr (fire)' },
    },
    -- Vorauswahl fuer neue Einsaetze (und fuer alte Szenarien ohne Auswahl)
    job = 'ambulance',
    -- Nur wenn jobs leer ist und job = nil: Zuordnung ueber die alarmierten Rollen
    -- Welche Leitstelle (Job) bekommt den Notruf je alarmierter Rolle? (nur wenn job = nil)
    jobsByRole = {
        fire = 'fire',
        ems = 'fire',      -- Rettungsdienst-Notrufe laufen ueber die Leitstelle "fire"
        police = 'police',
    },
    -- Aufbau der Notrufmeldung. Platzhalter: {keyword} {name} {alarmText} {address} {patients} {id}
    message = '{keyword}: {alarmText} - {address}',
    -- Meldung bei Nachalarmierung
    reAlarmMessage = 'NACHALARMIERUNG {keyword}: {alarmText} - {address}',
}

-- Optionale eigene Uebergabe an eine Leitstelle (adapter = 'custom').
-- Jede Funktion bekommt das unter bridge/dispatch.lua dokumentierte Payload.
Config.DispatchCustom = {
    onCreated = nil,          -- function(payload) end
    onStatus = nil,           -- function(payload) end
    onUpdate = nil,           -- function(payload) end
    onEnded = nil,            -- function(payload) end
}
