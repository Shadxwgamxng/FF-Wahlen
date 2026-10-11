--[[
    Persistente Speicherung (JSON im Ordner Config.Storage.directory)

    Dateien:
      scenarios.json  gespeicherte Szenarien (Vorlagen fuer Einsaetze)
      runtime.json    aktuell erzeugte Spielwelt-Elemente (fuer Bereinigung nach Absturz/Neustart)
      history.json    beendete / abgebrochene Einsaetze (Protokoll)

    Jede Datei hat das Format { format = <Version>, savedAt = <Zeit>, data = ... }.
    Vor jedem Schreiben wird eine .bak-Kopie angelegt; nach dem Schreiben wird
    die Datei zurueckgelesen und geprueft. Unlesbare Dateien werden als
    .corrupt-<Zeit> gesichert und nie stillschweigend ueberschrieben.
]]

local U = EC.Utils
local RES = GetCurrentResourceName()
local FORMAT = 1

Storage = {
    scenarios = {},   -- id -> { scenario = {...}, meta = {...} }
    invalid = {},     -- id -> Rohdaten, die beim Laden nicht valide waren (bleiben erhalten)
    history = {},     -- Liste beendeter Einsaetze (neueste zuerst)
}

local function path(name)
    return ('%s/%s'):format(Config.Storage.directory, name)
end

local function readRaw(name)
    return LoadResourceFile(RES, path(name))
end

local function writeRaw(name, content)
    return SaveResourceFile(RES, path(name), content, -1)
end

local function decode(content)
    if not content or content == '' then return nil end
    local ok, doc = pcall(json.decode, content)
    if ok and type(doc) == 'table' then return doc end
    return nil
end

-- Migrationen: [vonVersion] = function(doc) ... return doc end
local migrations = {
    -- [1] = function(doc) doc.format = 2 return doc end,
}

local function migrate(name, doc)
    doc.format = tonumber(doc.format) or 1
    while doc.format < FORMAT do
        local fn = migrations[doc.format]
        if not fn then
            U.log('error', '%s: keine Migration von Format %d vorhanden', name, doc.format)
            return nil
        end
        doc = fn(doc)
        U.log('info', '%s: auf Format %d migriert', name, doc.format)
    end
    return doc
end

-- Laedt eine Datei. Rueckgabe: data | nil (Datei fehlt) ; false bei Totalfehler
function Storage.load(name)
    local content = readRaw(name)
    if not content then return nil end

    local doc = decode(content)
    if not doc then
        local stamp = os.date('%Y%m%d-%H%M%S')
        writeRaw(name .. '.corrupt-' .. stamp, content)
        U.log('error', '%s ist beschaedigt. Kopie gesichert als %s.corrupt-%s, versuche Backup.', name, name, stamp)
        doc = decode(readRaw(name .. '.bak'))
        if not doc then
            U.log('error', '%s: auch das Backup ist nicht lesbar. Starte mit leeren Daten.', name)
            return false
        end
        U.log('warn', '%s: Backup erfolgreich geladen.', name)
    end

    doc = migrate(name, doc)
    if not doc then return false end
    return doc.data
end

function Storage.save(name, data)
    local ok, content = pcall(json.encode, { format = FORMAT, savedAt = os.time(), data = data }, { indent = true })
    if not ok or not content then
        U.log('error', '%s konnte nicht kodiert werden: %s', name, tostring(content))
        return false
    end

    local previous = readRaw(name)
    if previous and decode(previous) then
        writeRaw(name .. '.bak', previous)
    end

    if not writeRaw(name, content) then
        U.log('error', '%s konnte nicht geschrieben werden (Schreibrechte fuer %s pruefen)', name, path(name))
        return false
    end

    -- Gegenlesen
    if not decode(readRaw(name)) then
        U.log('error', '%s: Pruefung nach dem Schreiben fehlgeschlagen, stelle Backup wieder her', name)
        if previous then writeRaw(name, previous) end
        return false
    end
    return true
end

----------------------------------------------------------------------------
-- Szenarien
----------------------------------------------------------------------------
function Storage.loadScenarios()
    Storage.scenarios, Storage.invalid = {}, {}
    local data = Storage.load('scenarios.json')
    if data == false then
        Storage.loadFailed = true
        return
    end
    data = data or {}
    local okCount, badCount = 0, 0
    for id, record in pairs(data.scenarios or {}) do
        local sc, err = EC.Schema.normalizeScenario(type(record) == 'table' and record.scenario or nil)
        if sc then
            sc.id = id
            Storage.scenarios[id] = { scenario = sc, meta = type(record.meta) == 'table' and record.meta or {},
                random = type(record.random) == 'table' and record.random or nil }
            okCount = okCount + 1
        else
            Storage.invalid[id] = record
            badCount = badCount + 1
            U.log('warn', 'Szenario %s ist ungueltig und wird nicht angeboten: %s', tostring(id), tostring(err))
        end
    end
    for id, record in pairs(data.invalid or {}) do
        Storage.invalid[id] = record
    end
    U.log('info', '%d Szenarien geladen%s', okCount, badCount > 0 and (' (%d ungueltig)'):format(badCount) or '')
end

function Storage.saveScenarios()
    if Storage.loadFailed then
        -- Nie eine unlesbare Datei mit einem leeren Stand ueberschreiben, ohne dass bewusst gespeichert wurde
        U.log('warn', 'scenarios.json war beim Start unlesbar; neuer Stand wird jetzt geschrieben (Kopie liegt als .corrupt-*)')
        Storage.loadFailed = false
    end
    return Storage.save('scenarios.json', { scenarios = Storage.scenarios, invalid = Storage.invalid })
end

function Storage.newScenarioId()
    local id
    repeat id = U.randomId('SZ-', 6) until not Storage.scenarios[id] and not Storage.invalid[id]
    return id
end

----------------------------------------------------------------------------
-- Laufzeitdaten (welche Entities gehoeren zu welchem Einsatz)
----------------------------------------------------------------------------
function Storage.loadRuntime()
    local data = Storage.load('runtime.json')
    return type(data) == 'table' and data or {}
end

function Storage.saveRuntime(data)
    return Storage.save('runtime.json', data)
end

----------------------------------------------------------------------------
-- Einstellungen (ingame aenderbar, z. B. Zufallseinsaetze)
----------------------------------------------------------------------------
function Storage.loadSettings()
    local data = Storage.load('settings.json')
    Storage.settings = type(data) == 'table' and data or {}
    return Storage.settings
end

function Storage.saveSettings()
    return Storage.save('settings.json', Storage.settings or {})
end

----------------------------------------------------------------------------
-- Verlauf
----------------------------------------------------------------------------
function Storage.loadHistory()
    local data = Storage.load('history.json')
    Storage.history = type(data) == 'table' and data or {}
end

function Storage.addHistory(entry)
    table.insert(Storage.history, 1, entry)
    while #Storage.history > Config.Storage.historyLimit do
        table.remove(Storage.history)
    end
    Storage.save('history.json', Storage.history)
end
