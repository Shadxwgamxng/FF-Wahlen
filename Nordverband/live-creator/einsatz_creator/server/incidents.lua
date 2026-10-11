--[[
    Einsatzverwaltung: Lebenszyklus aktiver Einsaetze

    wird_erstellt -> aktiv -> beendet | abgebrochen
                 \-> fehlerhaft (Aufbau gescheitert, Rollback)

    Beenden/Abbrechen ist idempotent: mehrfache Aufrufe liefern "bereits beendet"
    und verursachen keine weiteren Seiteneffekte.
]]

local U = EC.Utils

Incidents = {
    list = {},      -- id -> Einsatz
    seq = 0,
    locks = {},     -- Schutz vor Doppelausloesung
    editors = {},   -- src -> true (Spieler mit geoeffnetem Creator)
}

local FINAL = { [EC.Status.ended] = true, [EC.Status.cancelled] = true, [EC.Status.failed] = true }

function Incidents.get(id)
    return id and Incidents.list[id] or nil
end

local function countActive()
    local n = 0
    for _, inc in pairs(Incidents.list) do
        if not FINAL[inc.status] then n = n + 1 end
    end
    return n
end

local function newId()
    Incidents.seq = Incidents.seq + 1
    local id
    repeat
        id = ('EC-%s-%04d'):format(os.date('%y%m%d'), Incidents.seq % 10000)
        if Incidents.list[id] then Incidents.seq = Incidents.seq + 1 end
    until not Incidents.list[id]
    return id
end

----------------------------------------------------------------------------
-- Laufzeitdaten sichern (fuer Bereinigung nach Absturz)
----------------------------------------------------------------------------
function Incidents.persistRuntime()
    local data = { seq = Incidents.seq, incidents = {} }
    for id, inc in pairs(Incidents.list) do
        if not FINAL[inc.status] or next(inc.entities or {}) then
            local ents = {}
            for elId, rec in pairs(inc.entities or {}) do
                ents[#ents + 1] = { net = rec.netId, el = elId, kind = rec.kind }
            end
            data.incidents[id] = { mode = inc.mode, name = inc.scenario.name, createdAt = inc.createdAt, entities = ents,
                zfire = ZFire.snapshot(id) }
        end
    end
    Storage.saveRuntime(data)
end

----------------------------------------------------------------------------
-- Uebersicht fuer die Oberflaeche
----------------------------------------------------------------------------
local function summaryOf(inc)
    local sc = inc.scenario
    local cat = EC.CategoryById[sc.category]
    return {
        id = inc.id,
        scenarioId = inc.scenarioId,
        name = sc.name,
        keyword = sc.keyword,
        category = sc.category,
        categoryLabel = cat and cat.label or sc.category,
        priority = sc.priority,
        mode = inc.mode,
        status = inc.status,
        statusLabel = EC.StatusLabels[inc.status] or inc.status,
        phase = inc.phase,
        center = sc.center,
        address = sc.info.address,
        createdAt = inc.createdAt,
        createdBy = inc.createdBy and inc.createdBy.name or '?',
        elements = #sc.elements,
        entities = U.tableCount(inc.entities),
        fire = Fire.summary(inc.id),
        rescue = Rescue.summary(inc),
        errors = inc.errors or {},
        random = inc.random,
    }
end

function Incidents.listForUi()
    local active = {}
    for _, inc in pairs(Incidents.list) do active[#active + 1] = summaryOf(inc) end
    table.sort(active, function(a, b) return (a.createdAt or 0) > (b.createdAt or 0) end)
    local history = {}
    for i = 1, math.min(40, #Storage.history) do history[#history + 1] = Storage.history[i] end
    return { active = active, history = history }
end

function Incidents.broadcastList()
    local data = Incidents.listForUi()
    for src in pairs(Incidents.editors) do
        TriggerClientEvent(EC.Events.activeList, src, data)
    end
end

-- Oeffentlicher Weltstand (Interaktionen, Tueren, Betriebsstoffe) an alle Clients
function Incidents.publicOf(inc)
    local nets = {}
    for _, rec in pairs(inc.entities or {}) do nets[#nets + 1] = rec.netId end
    return {
        id = inc.id, mode = inc.mode, status = inc.status, name = inc.scenario.name,
        keyword = inc.scenario.keyword, center = inc.scenario.center,
        rescue = Rescue.publicState(inc), nets = nets,
    }
end

function Incidents.syncPublic(inc)
    TriggerClientEvent(EC.Events.incidentSync, -1, Incidents.publicOf(inc))
end

function Incidents.publicAll()
    local out = {}
    for _, inc in pairs(Incidents.list) do
        if inc.status == EC.Status.active then out[#out + 1] = Incidents.publicOf(inc) end
    end
    return out
end

----------------------------------------------------------------------------
-- Status / Phase
----------------------------------------------------------------------------
local function setStatus(inc, status, by, note)
    if inc.status == status then return end
    inc.status = status
    inc.statusHistory[#inc.statusHistory + 1] = { status = status, at = os.time(), by = by, note = note }
    inc.log[#inc.log + 1] = { at = os.time(), by = by or 'System', text = ('Status: %s%s'):format(EC.StatusLabels[status] or status, note and (' (' .. note .. ')') or '') }
end

function Incidents.setPhase(id, phase, src, note)
    local inc = Incidents.get(id)
    if not inc then return false, 'Einsatz nicht gefunden' end
    if inc.status ~= EC.Status.active then return false, 'Einsatz ist nicht aktiv' end
    if not U.inList(EC.Phases, phase) then return false, 'Unbekannte Phase' end
    if inc.phase == phase then return true end
    local old = inc.phase
    inc.phase = phase
    local by = src and Perm.actor(src).name or 'Leitstelle'
    inc.log[#inc.log + 1] = { at = os.time(), by = by, text = ('Phase: %s'):format(phase) }
    Dispatch.status(inc, { phase = phase, previous = old, by = by, note = note })
    Incidents.broadcastList()
    return true
end

----------------------------------------------------------------------------
-- Aufbau
----------------------------------------------------------------------------
local function historyEntry(inc, note)
    return {
        id = inc.id, scenarioId = inc.scenarioId, name = inc.scenario.name, keyword = inc.scenario.keyword,
        category = inc.scenario.category, mode = inc.mode, status = inc.status,
        statusLabel = EC.StatusLabels[inc.status] or inc.status,
        createdAt = inc.createdAt, endedAt = os.time(), createdBy = inc.createdBy and inc.createdBy.name or '?',
        note = note, errors = inc.errors,
        rescue = Rescue.summary(inc), fireExtinguished = inc.fire and inc.fire.extinguished or 0,
    }
end

local function cleanupWorld(inc, opts)
    opts = opts or {}
    local result = { deleted = 0, missing = 0, foreign = 0, fires = 0, smokes = 0 }
    if opts.effects ~= false then
        result.fires, result.smokes = Fire.removeIncident(inc.id)
    end
    local kinds = opts.kinds
    local r = Spawner.deleteAll(inc, kinds)
    result.deleted, result.missing, result.foreign = r.deleted, r.missing, r.foreign
    -- Entities, die bewusst stehen bleiben, werden aus der Verwaltung entlassen
    if kinds then inc.entities = {} end
    return result
end

--[[
    Einsatz erzeugen.
    sc: bereits validiertes Szenario, mode: 'test' | 'live'
    Rueckgabe: true, id | false, Fehler
]]
function Incidents.create(src, sc, mode, scenarioId, opts)
    opts = opts or {}
    if mode ~= 'test' and mode ~= 'live' then return false, 'Unbekannter Modus' end
    if countActive() >= Config.Limits.activeIncidents then
        return false, ('Es sind bereits %d Einsaetze aktiv (Grenze erreicht)'):format(Config.Limits.activeIncidents)
    end

    local lockKey = scenarioId or ('draft:' .. tostring(src))
    if Incidents.locks[lockKey] then return false, 'Dieser Einsatz wird bereits erstellt' end

    if scenarioId and not Config.Modes.allowMultipleInstances then
        for _, inc in pairs(Incidents.list) do
            if inc.scenarioId == scenarioId and not FINAL[inc.status] then
                return false, ('Dieses Szenario laeuft bereits als %s'):format(inc.id)
            end
        end
    end

    Incidents.locks[lockKey] = true
    local actor = src and Perm.actor(src) or { name = opts.actorName or 'System', id = 'system' }

    local inc = {
        id = newId(),
        scenarioId = scenarioId,
        mode = mode,
        status = EC.Status.creating,
        phase = 'alarmiert',
        scenario = U.deepcopy(sc),
        createdAt = os.time(),
        createdBy = actor,
        entities = {},
        statusHistory = {},
        log = {},
        errors = {},
        recipients = {},
        random = opts.random == true,
    }
    inc.statusHistory[1] = { status = inc.status, at = inc.createdAt, by = actor.name }
    inc.log[1] = { at = inc.createdAt, by = actor.name, text = ('Einsatz angelegt (%s)'):format(EC.Modes[mode]) }
    Incidents.list[inc.id] = inc
    Incidents.broadcastList()
    U.log('info', 'Einsatz %s wird erstellt (%s, Szenario %s, von %s)', inc.id, mode, tostring(scenarioId), actor.name)

    local ok, err = pcall(function()
        local entities, errors = Spawner.spawnAll(inc)
        inc.entities = entities
        Incidents.persistRuntime()

        if inc.aborted then
            errors[#errors + 1] = 'Aufbau wurde abgebrochen'
        end
        if #errors > 0 then
            inc.errors = errors
            for _, e in ipairs(errors) do U.log('warn', 'Einsatz %s: %s', inc.id, e) end
            if Config.Modes.rollbackOnError or inc.aborted then
                error({ rollback = true, message = errors[1] })
            end
        end

        Fire.createForIncident(inc)
        Rescue.init(inc)
    end)

    if not ok then
        local message = type(err) == 'table' and err.message or tostring(err)
        local res = cleanupWorld(inc)
        setStatus(inc, EC.Status.failed, actor.name, message)
        U.log('error', 'Einsatz %s fehlgeschlagen: %s (Rollback: %d entfernt, %d fehlten)', inc.id, message, res.deleted, res.missing)
        Storage.addHistory(historyEntry(inc, 'Aufbau fehlgeschlagen, zurueckgesetzt'))
        Incidents.list[inc.id] = nil
        Incidents.locks[lockKey] = nil
        Incidents.persistRuntime()
        Incidents.broadcastList()
        return false, ('Einsatz konnte nicht vollstaendig erstellt werden: %s'):format(message)
    end

    setStatus(inc, EC.Status.active, actor.name)
    local minutes = mode == 'test' and Config.Modes.autoCancelTestMinutes or Config.Modes.autoCancelMinutes
    inc.expiresAt = minutes > 0 and (os.time() + minutes * 60) or nil
    Incidents.locks[lockKey] = nil

    Incidents.persistRuntime()
    Incidents.syncPublic(inc)
    local count = Alarm.send(inc)
    if count > 0 then
        inc.log[#inc.log + 1] = { at = os.time(), by = 'System', text = ('%d Empfaenger intern alarmiert'):format(count) }
    end
    Dispatch.created(inc)
    if inc.dispatchCalls then
        inc.log[#inc.log + 1] = { at = os.time(), by = 'System', text = ('%d Notruf(e) an die Leitstelle uebergeben'):format(inc.dispatchCalls) }
        if inc.dispatchCalls == 0 then
            inc.errors[#inc.errors + 1] = 'Notruf konnte nicht an die Leitstelle uebergeben werden (EmergencyDispatch gestartet? Rollen-Zuordnung?)'
        end
    end
    Incidents.broadcastList()
    U.log('info', 'Einsatz %s aktiv (%d Entities, %d Fehler)', inc.id, U.tableCount(inc.entities), #inc.errors)
    return true, inc.id, #inc.errors
end

----------------------------------------------------------------------------
-- Beenden / Abbrechen (idempotent)
-- kind: 'end' | 'cancel'
----------------------------------------------------------------------------
function Incidents.finish(id, src, kind, reason)
    local inc = Incidents.get(id)
    if not inc then
        for _, h in ipairs(Storage.history) do
            if h.id == id then return true, 'Einsatz ist bereits beendet' end
        end
        return false, 'Einsatz nicht gefunden'
    end
    if FINAL[inc.status] then return true, 'Einsatz ist bereits beendet' end
    if inc.status == EC.Status.creating then
        inc.aborted = true
        return false, 'Einsatz wird gerade erstellt und wird danach zurueckgesetzt'
    end
    if src and not (Perm.can(src, 'manage') or (inc.createdBy and inc.createdBy.id == Perm.identifier(src))) then
        return false, 'Keine Berechtigung, diesen Einsatz zu beenden'
    end

    local by = src and Perm.actor(src).name or (reason or 'System')
    local status = kind == 'cancel' and EC.Status.cancelled or EC.Status.ended
    setStatus(inc, status, by, reason)

    local function doCleanup()
        local res
        if kind == 'cancel' then
            res = cleanupWorld(inc)
        else
            local c = Config.EndCleanup
            local kinds = {}
            if c.removeVehicles then kinds.vehicle = true end
            if c.removeObjects then kinds.object = true end
            if c.removePeds then kinds.ped = true end
            res = cleanupWorld(inc, { kinds = kinds, effects = c.removeEffects })
        end
        U.log('info', 'Einsatz %s %s: %d Entities entfernt, %d bereits weg, %d fremd (nicht angefasst), %d Feuer, %d Rauch',
            inc.id, status, res.deleted, res.missing, res.foreign, res.fires, res.smokes)
        if res.foreign > 0 then
            inc.errors[#inc.errors + 1] = ('Aufraeumen teilweise: %d Entities gehoerten nicht mehr zum Einsatz'):format(res.foreign)
        end
        TriggerClientEvent(EC.Events.incidentRemoved, -1, inc.id)
        Storage.addHistory(historyEntry(inc, reason))
        Incidents.list[inc.id] = nil
        Incidents.persistRuntime()
        Incidents.broadcastList()
    end

    Dispatch.ended(inc, { status = status, by = by, reason = reason })

    local delay = (kind == 'end') and (Config.EndCleanup.delaySeconds or 0) or 0
    if delay > 0 then
        TriggerClientEvent(EC.Events.incidentRemoved, -1, inc.id, true)
        Incidents.broadcastList()
        SetTimeout(delay * 1000, function()
            local ok, err = pcall(doCleanup)
            if not ok then U.log('error', 'Aufraeumen %s: %s', inc.id, tostring(err)) end
        end)
    else
        local ok, err = pcall(doCleanup)
        if not ok then
            U.log('error', 'Aufraeumen %s: %s', inc.id, tostring(err))
            return false, 'Aufraeumen teilweise fehlgeschlagen (siehe Serverkonsole)'
        end
    end
    return true, status == EC.Status.cancelled and 'Einsatz abgebrochen und Szene entfernt' or 'Einsatz beendet'
end

-- Nachalarmieren
function Incidents.reAlarm(id, src)
    local inc = Incidents.get(id)
    if not inc or inc.status ~= EC.Status.active then return false, 'Einsatz ist nicht aktiv' end
    local n = Alarm.send(inc, true)
    local calls = Dispatch.reAlarm(inc)
    inc.log[#inc.log + 1] = { at = os.time(), by = src and Perm.actor(src).name or 'System',
        text = ('Nachalarmierung: %d intern, %d Notruf(e) an Leitstelle'):format(n, calls) }
    return true, ('Nachalarmiert: %d intern, %d Notruf(e) an die Leitstelle'):format(n, calls)
end

----------------------------------------------------------------------------
-- Rueckmeldungen aus Feuer- und Rettungssystem
----------------------------------------------------------------------------
function Incidents.onFireChanged(inc)
    if inc.status ~= EC.Status.active then return end
    local now = GetGameTimer()
    if inc.lastFireUpdate and now - inc.lastFireUpdate < 5000 then
        inc.fireUpdatePending = true
        return
    end
    inc.lastFireUpdate = now
    inc.fireUpdatePending = false
    local s = Fire.summary(inc.id)
    if s.burning == 0 and s.smouldering == 0 and (inc.fire and inc.fire.total or 0) > 0 and not inc.fireOutLogged then
        inc.fireOutLogged = true
        inc.log[#inc.log + 1] = { at = os.time(), by = 'System', text = 'Alle Brandherde geloescht' }
    end
    Dispatch.update(inc, { fire = s })
    Incidents.broadcastList()
end

function Incidents.onRescueChanged(inc, change)
    Incidents.syncPublic(inc)
    Dispatch.update(inc, change)
    Incidents.broadcastList()
end

----------------------------------------------------------------------------
-- Wartung: Zeitablauf, verzoegerte Feuer-Updates
----------------------------------------------------------------------------
CreateThread(function()
    while true do
        Wait(15000)
        local t = os.time()
        for id, inc in pairs(Incidents.list) do
            if inc.status == EC.Status.active then
                if inc.expiresAt and t >= inc.expiresAt then
                    Incidents.finish(id, nil, 'cancel', 'Zeitueberschreitung')
                elseif inc.fireUpdatePending then
                    Incidents.onFireChanged(inc)
                end
            end
        end
    end
end)

----------------------------------------------------------------------------
-- Neustart / Absturz: zurueckgebliebene Entities eigener Einsaetze entfernen
----------------------------------------------------------------------------
function Incidents.recover()
    local data = Storage.loadRuntime()
    Incidents.seq = tonumber(data.seq) or 0
    local removed, count = 0, 0
    for id, info in pairs(data.incidents or {}) do
        count = count + 1
        for _, rec in ipairs(info.entities or {}) do
            local ent = rec.net and NetworkGetEntityFromNetworkId(rec.net)
            if ent and ent ~= 0 and DoesEntityExist(ent) then
                local state = Entity(ent).state.ec
                if type(state) == 'table' and state.i == id then
                    DeleteEntity(ent)
                    removed = removed + 1
                end
            end
        end
        if info.zfire then
            local ok, err = pcall(ZFire.removeSnapshot, info.zfire)
            if not ok then U.log('warn', 'z_fire-Reste von %s: %s', id, tostring(err)) end
        end
        Storage.addHistory({
            id = id, name = info.name, mode = info.mode, status = EC.Status.cancelled,
            statusLabel = EC.StatusLabels[EC.Status.cancelled], createdAt = info.createdAt, endedAt = os.time(),
            createdBy = '?', note = 'Server- oder Resource-Neustart',
        })
    end
    if count > 0 then
        U.log('warn', '%d Einsaetze aus vorherigem Lauf als abgebrochen markiert, %d zurueckgebliebene Entities entfernt', count, removed)
    end
    Incidents.persistRuntime()
end

-- Resource wird gestoppt: alle eigenen Einsaetze sauber entfernen
function Incidents.shutdown()
    for id, inc in pairs(Incidents.list) do
        local ok, err = pcall(function()
            if not FINAL[inc.status] then
                setStatus(inc, EC.Status.cancelled, 'System', 'Resource gestoppt')
                Dispatch.ended(inc, { status = EC.Status.cancelled, reason = 'Resource gestoppt' })
            end
            cleanupWorld(inc)
            Storage.addHistory(historyEntry(inc, 'Resource gestoppt'))
        end)
        if not ok then U.log('error', 'Shutdown %s: %s', id, tostring(err)) end
        Incidents.list[id] = nil
    end
    Incidents.persistRuntime()
end
