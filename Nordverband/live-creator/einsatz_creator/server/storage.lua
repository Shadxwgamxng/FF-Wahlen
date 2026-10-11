--[[
    Persistente Speicherung

    Config.Storage.backend:
      'oxmysql'  Szenarien, Einstellungen und Verlauf in der Datenbank (Tabellen werden automatisch angelegt)
      'json'     alles als JSON im Ordner Config.Storage.directory
      'auto'     oxmysql, wenn die Resource vorhanden ist, sonst json
    Beim ersten Start mit Datenbank werden vorhandene JSON-Daten einmalig uebernommen.
    Laufzeitdaten (runtime.json, nur fuer die Bereinigung nach Absturz) liegen immer als Datei vor.

    JSON-Dateien:

    Dateien:
      incidents.json  gespeicherte Einsaetze (Vorlagen; frueher scenarios.json)
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
local function scenarioFile() return Config.Storage.file or 'incidents.json' end

local function jsonLoadScenarios()
    Storage.scenarios, Storage.invalid = {}, {}
    local file = scenarioFile()
    local data = Storage.load(file)
    -- Umstieg von scenarios.json (bis Version 1.1.0)
    if data == nil and file ~= 'scenarios.json' then
        local old = Storage.load('scenarios.json')
        if type(old) == 'table' then
            data = old
            Storage.migrateFile = true
            U.log('info', 'Einsaetze aus scenarios.json uebernommen, sie werden ab jetzt in %s gespeichert', file)
        end
    end
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

local function jsonSaveScenarios()
    if Storage.loadFailed then
        -- Nie eine unlesbare Datei mit einem leeren Stand ueberschreiben, ohne dass bewusst gespeichert wurde
        U.log('warn', '%s war beim Start unlesbar; neuer Stand wird jetzt geschrieben (Kopie liegt als .corrupt-*)', scenarioFile())
        Storage.loadFailed = false
    end
    return Storage.save(scenarioFile(), { scenarios = Storage.scenarios, invalid = Storage.invalid })
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
local function jsonLoadSettings()
    local data = Storage.load('settings.json')
    Storage.settings = type(data) == 'table' and data or {}
    return Storage.settings
end

local function jsonSaveSettings()
    return Storage.save('settings.json', Storage.settings or {})
end

----------------------------------------------------------------------------
-- Verlauf
----------------------------------------------------------------------------
local function jsonLoadHistory()
    local data = Storage.load('history.json')
    Storage.history = type(data) == 'table' and data or {}
end

local function trimHistory()
    while #Storage.history > Config.Storage.historyLimit do
        table.remove(Storage.history)
    end
end

----------------------------------------------------------------------------
-- Datenbank (oxmysql)
----------------------------------------------------------------------------
local DB = {}
Storage.DB = DB
local T_SCEN, T_STORE, T_HIST = 'einsatz_creator_scenarios', 'einsatz_creator_store', 'einsatz_creator_history'

local function oxState() return GetResourceState(Config.Storage.mysqlResource or 'oxmysql') end

-- Abfrage ausfuehren. wait = true wartet auf das Ergebnis (nur in einem Thread/Handler moeglich).
-- Rueckgabe bei wait: Ergebnis | nil bei Fehler/Zeitueberschreitung
function DB.query(sql, params, wait)
    local ox = exports[Config.Storage.mysqlResource or 'oxmysql']
    if not wait then
        local ok, err = pcall(function() ox:query(sql, params or {}, function() end) end)
        if not ok then U.log('error', 'Datenbank: %s', tostring(err)) end
        return ok
    end
    local p = promise.new()
    local ok, err = pcall(function()
        ox:query(sql, params or {}, function(result) p:resolve({ result }) end)
    end)
    if not ok then
        U.log('error', 'Datenbank: %s', tostring(err))
        return nil
    end
    SetTimeout(15000, function() p:resolve(false) end)
    local res = Citizen.Await(p)
    if res == false then
        U.log('error', 'Datenbank: Zeitueberschreitung bei "%s"', sql:sub(1, 60))
        return nil
    end
    return res[1]
end

local function enc(v)
    local ok, s = pcall(json.encode, v)
    return ok and s or nil
end

function DB.init()
    local stmts = {
        ([[CREATE TABLE IF NOT EXISTS `%s` (
            `id` VARCHAR(32) NOT NULL,
            `name` VARCHAR(100) NOT NULL DEFAULT '',
            `category` VARCHAR(32) NOT NULL DEFAULT '',
            `keyword` VARCHAR(100) NOT NULL DEFAULT '',
            `valid` TINYINT(1) NOT NULL DEFAULT 1,
            `data` LONGTEXT NOT NULL,
            `updated_at` INT NOT NULL DEFAULT 0,
            PRIMARY KEY (`id`)
        ) DEFAULT CHARSET=utf8mb4]]):format(T_SCEN),
        ([[CREATE TABLE IF NOT EXISTS `%s` (
            `name` VARCHAR(32) NOT NULL,
            `data` LONGTEXT NOT NULL,
            `updated_at` INT NOT NULL DEFAULT 0,
            PRIMARY KEY (`name`)
        ) DEFAULT CHARSET=utf8mb4]]):format(T_STORE),
        ([[CREATE TABLE IF NOT EXISTS `%s` (
            `id` INT NOT NULL AUTO_INCREMENT,
            `incident_id` VARCHAR(32) NOT NULL DEFAULT '',
            `data` LONGTEXT NOT NULL,
            `ended_at` INT NOT NULL DEFAULT 0,
            PRIMARY KEY (`id`),
            KEY `ended_at` (`ended_at`)
        ) DEFAULT CHARSET=utf8mb4]]):format(T_HIST),
    }
    for _, sql in ipairs(stmts) do
        if DB.query(sql, {}, true) == nil then return false end
    end
    return true
end

local saved = {}   -- id -> zuletzt gespeicherter JSON-Text (nur Geaendertes schreiben)

local function scenarioRow(id, record, valid)
    local sc = valid and record.scenario or {}
    local data = enc(record)
    return {
        id, U.cleanText(sc.name or '', 100), tostring(sc.category or ''), U.cleanText(sc.keyword or '', 100),
        valid and 1 or 0, data, os.time(),
    }, data
end

function DB.loadScenarios()
    local rows = DB.query(('SELECT `id`, `valid`, `data` FROM `%s`'):format(T_SCEN), {}, true)
    if rows == nil then return false end
    Storage.scenarios, Storage.invalid, saved = {}, {}, {}
    local okCount, badCount = 0, 0
    for _, row in ipairs(rows) do
        local ok, record = pcall(json.decode, row.data or '')
        local sc, err
        if ok and type(record) == 'table' and tonumber(row.valid) ~= 0 then
            sc, err = EC.Schema.normalizeScenario(record.scenario)
        end
        if sc then
            sc.id = row.id
            Storage.scenarios[row.id] = { scenario = sc, meta = type(record.meta) == 'table' and record.meta or {},
                random = type(record.random) == 'table' and record.random or nil }
            okCount = okCount + 1
        else
            Storage.invalid[row.id] = ok and record or row.data
            badCount = badCount + 1
            U.log('warn', 'Szenario %s ist ungueltig und wird nicht angeboten: %s', tostring(row.id), tostring(err or 'nicht lesbar'))
        end
        saved[row.id] = row.data
    end
    U.log('info', '%d Szenarien aus der Datenbank geladen%s', okCount, badCount > 0 and (' (%d ungueltig)'):format(badCount) or '')
    return okCount + badCount
end

function DB.saveScenarios()
    local ok = true
    local present = {}
    local function upsert(id, record, valid)
        present[id] = true
        local params, data = scenarioRow(id, record, valid)
        if not data then return end
        if saved[id] == data then return end
        local r = DB.query(('INSERT INTO `%s` (`id`, `name`, `category`, `keyword`, `valid`, `data`, `updated_at`) VALUES (?, ?, ?, ?, ?, ?, ?) ' ..
            'ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `category` = VALUES(`category`), `keyword` = VALUES(`keyword`), ' ..
            '`valid` = VALUES(`valid`), `data` = VALUES(`data`), `updated_at` = VALUES(`updated_at`)'):format(T_SCEN), params, true)
        if r == nil then ok = false else saved[id] = data end
    end
    for id, record in pairs(Storage.scenarios) do upsert(id, record, true) end
    for id, record in pairs(Storage.invalid) do upsert(id, type(record) == 'table' and record or { raw = record }, false) end
    for id in pairs(saved) do
        if not present[id] then
            if DB.query(('DELETE FROM `%s` WHERE `id` = ?'):format(T_SCEN), { id }, true) == nil then ok = false
            else saved[id] = nil end
        end
    end
    return ok
end

function DB.loadStore(name)
    local rows = DB.query(('SELECT `data` FROM `%s` WHERE `name` = ?'):format(T_STORE), { name }, true)
    if rows == nil then return false end
    if not rows[1] then return nil end
    local ok, data = pcall(json.decode, rows[1].data or '')
    return ok and data or nil
end

function DB.saveStore(name, data)
    local text = enc(data)
    if not text then return false end
    return DB.query(('INSERT INTO `%s` (`name`, `data`, `updated_at`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `data` = VALUES(`data`), `updated_at` = VALUES(`updated_at`)'):format(T_STORE),
        { name, text, os.time() }, true) ~= nil
end

function DB.loadHistory()
    local rows = DB.query(('SELECT `data` FROM `%s` ORDER BY `id` DESC LIMIT ?'):format(T_HIST), { Config.Storage.historyLimit }, true)
    if rows == nil then return false end
    Storage.history = {}
    for _, row in ipairs(rows) do
        local ok, e = pcall(json.decode, row.data or '')
        if ok and type(e) == 'table' then Storage.history[#Storage.history + 1] = e end
    end
    return #rows
end

-- Verlaufseintrag schreiben (ohne zu warten, funktioniert auch beim Stoppen der Resource)
function DB.addHistory(entry)
    local text = enc(entry)
    if not text then return end
    DB.query(('INSERT INTO `%s` (`incident_id`, `data`, `ended_at`) VALUES (?, ?, ?)'):format(T_HIST),
        { tostring(entry.id or ''), text, tonumber(entry.endedAt) or os.time() }, false)
    DB.historyWrites = (DB.historyWrites or 0) + 1
    if DB.historyWrites % 50 == 0 then
        -- alte Eintraege ueber dem Limit entfernen
        DB.query(('DELETE FROM `%s` WHERE `id` NOT IN (SELECT `id` FROM (SELECT `id` FROM `%s` ORDER BY `id` DESC LIMIT ?) AS t)'):format(T_HIST, T_HIST),
            { Config.Storage.historyLimit }, false)
    end
end

-- Datei-Speicherung, aber Einsaetze liegen noch in der Datenbank (Version 1.1.0): einmalig in die Datei holen
function DB.importToFile()
    if oxState() ~= 'started' then return end
    local t = DB.query("SHOW TABLES LIKE 'einsatz_creator_scenarios'", {}, true)
    if type(t) ~= 'table' or not t[1] then return end
    local count = DB.loadScenarios()
    if not count or count == 0 then return end
    if jsonSaveScenarios() then
        U.log('info', '%d Einsaetze aus der Datenbank in %s uebernommen (die Datenbank wird nicht mehr genutzt)', count, scenarioFile())
    end
    local settings = DB.loadStore('settings')
    if type(settings) == 'table' and next(Storage.settings or {}) == nil then
        Storage.settings = settings
        jsonSaveSettings()
    end
end

----------------------------------------------------------------------------
-- Backend-Auswahl und oeffentliche Funktionen
----------------------------------------------------------------------------
-- Ermittelt das Backend. Wartet kurz, falls oxmysql noch startet.
function Storage.detectBackend()
    local b = Config.Storage.backend or 'auto'
    if b == 'json' then return 'json' end
    local deadline = GetGameTimer() + 15000
    while oxState() ~= 'started' and oxState() ~= 'missing' and GetGameTimer() < deadline do Wait(250) end
    if oxState() == 'started' then return 'oxmysql' end
    if b == 'oxmysql' then
        U.log('error', 'Config.Storage.backend = oxmysql, aber %s laeuft nicht - es wird vorerst als JSON gespeichert', Config.Storage.mysqlResource or 'oxmysql')
    end
    return 'json'
end

-- Laedt alle Daten. Muss in einem Thread aufgerufen werden.
function Storage.init()
    Storage.backend = Storage.detectBackend()
    if Storage.backend == 'oxmysql' then
        if not DB.init() then
            U.log('error', 'Datenbanktabellen konnten nicht angelegt werden - es wird als JSON gespeichert')
            Storage.backend = 'json'
        end
    end

    if Storage.backend == 'oxmysql' then
        local count = DB.loadScenarios()
        if count == false then
            Storage.loadFailed = true
        elseif count == 0 then
            -- Erster Start mit Datenbank: vorhandene JSON-Daten uebernehmen
            jsonLoadScenarios()
            local n = U.tableCount(Storage.scenarios) + U.tableCount(Storage.invalid)
            if n > 0 then
                if DB.saveScenarios() then
                    U.log('info', '%d Einsaetze aus %s in die Datenbank uebernommen', n, scenarioFile())
                else
                    U.log('error', 'Uebernahme der Szenarien in die Datenbank fehlgeschlagen')
                end
            end
        end
        local settings = DB.loadStore('settings')
        if settings == nil then
            jsonLoadSettings()
            if next(Storage.settings) then DB.saveStore('settings', Storage.settings) end
        else
            Storage.settings = type(settings) == 'table' and settings or {}
        end
        local hist = DB.loadHistory()
        if hist == 0 then
            jsonLoadHistory()
            for i = #Storage.history, 1, -1 do DB.addHistory(Storage.history[i]) end
        elseif hist == false then
            Storage.history = {}
        end
    else
        jsonLoadScenarios()
        jsonLoadSettings()
        jsonLoadHistory()
        if not Storage.loadFailed and next(Storage.scenarios) == nil and next(Storage.invalid) == nil then
            DB.importToFile()
        end
        if Storage.migrateFile then
            Storage.migrateFile = nil
            jsonSaveScenarios()
        end
    end
    Storage.ready = true
    U.log('info', 'Speicherung: %s', Storage.backend == 'oxmysql' and 'Datenbank (oxmysql)' or ('JSON-Dateien im Ordner ' .. Config.Storage.directory))
end

function Storage.saveScenarios()
    if Storage.backend == 'oxmysql' then
        Storage.loadFailed = false
        return DB.saveScenarios()
    end
    return jsonSaveScenarios()
end

function Storage.saveSettings()
    if Storage.backend == 'oxmysql' then return DB.saveStore('settings', Storage.settings or {}) end
    return jsonSaveSettings()
end

function Storage.addHistory(entry)
    table.insert(Storage.history, 1, entry)
    trimHistory()
    if Storage.backend == 'oxmysql' then return DB.addHistory(entry) end
    Storage.save('history.json', Storage.history)
end
