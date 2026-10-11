--[[
    Server-Einstieg: Anfrage-Router, Creator-Sitzungen, Exports, Lebenszyklus.

    Alle Client-Anfragen laufen ueber EIN Event (EC.Events.request) und werden
    hier zentral auf Berechtigung, Rate-Limit und Datengroesse geprueft.
]]

local U = EC.Utils

local Handlers = {}

local function respond(src, reqId, ok, data)
    TriggerClientEvent(EC.Events.response, src, reqId, ok, data)
end

local function notify(src, kind, text)
    TriggerClientEvent(EC.Events.notify, src, kind, text)
end

----------------------------------------------------------------------------
-- Szenario-Hilfen
----------------------------------------------------------------------------
local function scenarioSummary(id, record)
    local sc, meta = record.scenario, record.meta or {}
    local cat = EC.CategoryById[sc.category]
    return {
        id = id, name = sc.name, category = sc.category, categoryLabel = cat and cat.label or sc.category,
        keyword = sc.keyword, priority = sc.priority, elements = #sc.elements,
        counts = EC.Schema.countKinds(sc.elements),
        createdAt = meta.createdAt, createdBy = meta.createdBy and meta.createdBy.name or '?',
        updatedAt = meta.updatedAt, updatedBy = meta.updatedBy and meta.updatedBy.name or nil,
        address = sc.info.address,
    }
end

local function scenarioList()
    local list = {}
    for id, record in pairs(Storage.scenarios) do list[#list + 1] = scenarioSummary(id, record) end
    table.sort(list, function(a, b) return (a.updatedAt or a.createdAt or 0) > (b.updatedAt or b.createdAt or 0) end)
    return list
end

local function isOwner(src, record)
    return record.meta and record.meta.createdBy and record.meta.createdBy.id == Perm.identifier(src)
end

----------------------------------------------------------------------------
-- Handler: { perm = Stufe|nil, rate = ms, fn = function(src, payload) return ok, data end }
----------------------------------------------------------------------------
Handlers.openEditor = { perm = 'use', rate = 1000, fn = function(src)
    Incidents.editors[src] = true
    return true, {
        perms = Perm.summary(src),
        user = Perm.actor(src).name,
        scenarios = scenarioList(),
        incidents = Incidents.listForUi(),
        framework = Framework.name,
        storageProblem = Storage.loadFailed == true,
    }
end }

Handlers.closeEditor = { rate = 200, fn = function(src)
    Incidents.editors[src] = nil
    return true
end }

Handlers.listScenarios = { perm = 'use', rate = 300, fn = function()
    return true, scenarioList()
end }

Handlers.getScenario = { perm = 'use', rate = 300, fn = function(_, p)
    local record = Storage.scenarios[p and p.id]
    if not record then return false, 'Szenario nicht gefunden' end
    local sc = U.deepcopy(record.scenario)
    sc.id = p.id
    return true, { scenario = sc, meta = record.meta }
end }

Handlers.saveScenario = { perm = 'use', rate = 1500, fn = function(src, p)
    local sc, err = Validate.scenario(p and p.scenario)
    if not sc then return false, err end

    local actor = Perm.actor(src)
    local stamp = os.time()
    local record = sc.id and Storage.scenarios[sc.id]
    if record then
        record.scenario = sc
        record.meta.updatedAt = stamp
        record.meta.updatedBy = { name = actor.name, id = actor.id }
    else
        if U.tableCount(Storage.scenarios) >= Config.Limits.scenarios then
            return false, ('Maximale Anzahl gespeicherter Szenarien erreicht (%d)'):format(Config.Limits.scenarios)
        end
        sc.id = Storage.newScenarioId()
        record = { scenario = sc, meta = { createdAt = stamp, createdBy = { name = actor.name, id = actor.id } } }
        Storage.scenarios[sc.id] = record
    end

    if not Storage.saveScenarios() then
        return false, 'Szenario konnte nicht gespeichert werden (siehe Serverkonsole)'
    end
    U.log('info', 'Szenario %s "%s" gespeichert von %s', sc.id, sc.name, actor.name)
    return true, { id = sc.id, scenario = sc, meta = record.meta, scenarios = scenarioList() }
end }

Handlers.duplicateScenario = { perm = 'use', rate = 1500, fn = function(src, p)
    local record = Storage.scenarios[p and p.id]
    if not record then return false, 'Szenario nicht gefunden' end
    if U.tableCount(Storage.scenarios) >= Config.Limits.scenarios then return false, 'Maximale Anzahl Szenarien erreicht' end
    local actor = Perm.actor(src)
    local copy = U.deepcopy(record.scenario)
    copy.id = Storage.newScenarioId()
    copy.name = U.cleanText(copy.name .. ' (Kopie)', 64)
    -- neue Element-IDs, damit Verweise eindeutig bleiben
    local map = {}
    for _, el in ipairs(copy.elements) do
        local newId = U.randomId('', 8)
        map[el.id] = newId
        el.id = newId
    end
    for _, el in ipairs(copy.elements) do
        local pr = el.props
        if pr.attachTo then pr.attachTo = map[pr.attachTo] end
        if pr.vehicleId then pr.vehicleId = map[pr.vehicleId] end
        if pr.linked then
            for i, id in ipairs(pr.linked) do pr.linked[i] = map[id] end
        end
    end
    Storage.scenarios[copy.id] = { scenario = copy, meta = { createdAt = os.time(), createdBy = { name = actor.name, id = actor.id }, copiedFrom = p.id } }
    if not Storage.saveScenarios() then
        Storage.scenarios[copy.id] = nil
        return false, 'Kopie konnte nicht gespeichert werden'
    end
    return true, { id = copy.id, scenarios = scenarioList() }
end }

Handlers.deleteScenario = { perm = 'use', rate = 1500, fn = function(src, p)
    local record = Storage.scenarios[p and p.id]
    if not record then return false, 'Szenario nicht gefunden' end
    if not isOwner(src, record) and not Perm.can(src, 'delete') then
        return false, 'Nur der Ersteller oder ein Berechtigter darf dieses Szenario loeschen'
    end
    Storage.scenarios[p.id] = nil
    if not Storage.saveScenarios() then
        Storage.scenarios[p.id] = record
        return false, 'Loeschen konnte nicht gespeichert werden'
    end
    U.log('info', 'Szenario %s geloescht von %s', p.id, Perm.actor(src).name)
    return true, { scenarios = scenarioList() }
end }

Handlers.trigger = { perm = 'use', rate = 3000, fn = function(src, p)
    p = p or {}
    local mode = p.mode == 'live' and 'live' or 'test'
    if not Perm.can(src, mode) then
        return false, mode == 'live' and 'Keine Berechtigung fuer Live-Einsaetze' or 'Keine Berechtigung fuer Testeinsaetze'
    end
    local raw = p.scenario
    local scenarioId = type(p.scenarioId) == 'string' and Storage.scenarios[p.scenarioId] and p.scenarioId or nil
    if not raw and scenarioId then raw = Storage.scenarios[scenarioId].scenario end
    local sc, err = Validate.scenario(raw)
    if not sc then return false, err end
    if mode == 'live' and sc.info.alarmText == '' then return false, 'Fuer Live-Einsaetze ist ein Alarmtext erforderlich' end
    local ok, idOrErr, warnings = Incidents.create(src, sc, mode, scenarioId)
    if not ok then return false, idOrErr end
    return true, { id = idOrErr, warnings = warnings, incidents = Incidents.listForUi() }
end }

Handlers.listIncidents = { perm = 'use', rate = 300, fn = function()
    return true, Incidents.listForUi()
end }

Handlers.incidentAction = { perm = 'use', rate = 800, fn = function(src, p)
    p = p or {}
    if not Validate.idString(p.id, 32) then return false, 'Ungueltige Einsatz-ID' end
    local action = p.action
    if action == 'end' or action == 'cancel' then
        return Incidents.finish(p.id, src, action, U.cleanText(p.reason, 120) ~= '' and U.cleanText(p.reason, 120) or nil)
    elseif action == 'realarm' then
        local inc = Incidents.get(p.id)
        if not inc then return false, 'Einsatz nicht gefunden' end
        if not Perm.can(src, inc.mode) then return false, 'Keine Berechtigung' end
        return Incidents.reAlarm(p.id, src)
    elseif action == 'phase' then
        return Incidents.setPhase(p.id, p.phase, src)
    end
    return false, 'Unbekannte Aktion'
end }

Handlers.incidentDetails = { rate = 500, fn = function(src, p)
    local inc = Incidents.get(p and p.id)
    if not inc then return false, 'Einsatz nicht gefunden' end
    if not Alarm.canSee(src, inc) then return false, 'Keine Berechtigung' end
    return true, Alarm.details(inc)
end }

-- Einsaetze, die der Spieler sehen darf (fuer /einsatzinfo)
Handlers.myIncidents = { rate = 1000, fn = function(src)
    local out = {}
    for _, inc in pairs(Incidents.list) do
        if inc.status == EC.Status.active and Alarm.canSee(src, inc) then
            out[#out + 1] = Alarm.details(inc)
        end
    end
    table.sort(out, function(a, b) return (a.createdAt or 0) > (b.createdAt or 0) end)
    return true, out
end }

Handlers.rescueStart = { rate = 400, fn = function(src, p)
    local inc = Incidents.get(p and p.incidentId)
    if not inc or inc.status ~= EC.Status.active then return false, 'Einsatz ist nicht aktiv' end
    if not Validate.idString(p.targetId, 24) then return false, 'Ungueltiges Ziel' end
    return Rescue.start(src, inc, p.targetId, p.action)
end }

Handlers.rescueComplete = { rate = 400, fn = function(src, p)
    local inc = Incidents.get(p and p.incidentId)
    if not inc or inc.status ~= EC.Status.active then return false, 'Einsatz ist nicht aktiv' end
    if not Validate.idString(p.targetId, 24) then return false, 'Ungueltiges Ziel' end
    return Rescue.complete(src, inc, p.targetId, p.action, type(p.extra) == 'table' and p.extra or nil)
end }

Handlers.rescueCancel = { rate = 200, fn = function(src, p)
    local inc = Incidents.get(p and p.incidentId)
    if not inc then return true end
    if not Validate.idString(p.targetId, 24) then return false, 'Ungueltiges Ziel' end
    return Rescue.cancel(src, inc, p.targetId, p.kind)
end }

-- Vollstaendiger Weltstand fuer neu verbundene Clients
Handlers.syncWorld = { rate = 2000, fn = function(src)
    return true, { incidents = Incidents.publicAll(), fire = Fire.fullState(), roles = Perm.rolesOf(src) }
end }

-- Rollen des Spielers (fuer die Anzeige passender Interaktionen; der Server prueft jede Aktion erneut)
Handlers.myRoles = { rate = 5000, fn = function(src)
    return true, Perm.rolesOf(src)
end }

----------------------------------------------------------------------------
-- Router
----------------------------------------------------------------------------
RegisterNetEvent(EC.Events.request, function(reqId, name, payload)
    local src = source
    if type(reqId) ~= 'number' or type(name) ~= 'string' then return end
    local h = Handlers[name]
    if not h then return respond(src, reqId, false, 'Unbekannte Anfrage') end

    if not Validate.rate(src, name, h.rate or 300) then
        return respond(src, reqId, false, 'Zu viele Anfragen, bitte kurz warten')
    end
    if payload ~= nil and type(payload) ~= 'table' then
        return respond(src, reqId, false, 'Ungueltige Daten')
    end
    if not Validate.payloadOk(payload, 300000) then
        return respond(src, reqId, false, 'Datenmenge zu gross')
    end
    if h.perm and not Perm.can(src, h.perm) then
        U.log('warn', 'Spieler %s (%s) ohne Berechtigung fuer "%s"', GetPlayerName(src) or '?', src, name)
        return respond(src, reqId, false, 'Keine Berechtigung')
    end

    local ok, res1, res2 = pcall(h.fn, src, payload or {})
    if not ok then
        U.log('error', 'Anfrage "%s" von %s: %s', name, src, tostring(res1))
        return respond(src, reqId, false, 'Interner Fehler (siehe Serverkonsole)')
    end
    respond(src, reqId, res1 == true, res2)
end)

AddEventHandler('playerDropped', function()
    local src = source
    Incidents.editors[src] = nil
    Validate.forget(src)
end)

----------------------------------------------------------------------------
-- Exports fuer andere Ressourcen (z. B. Leitstelle)
----------------------------------------------------------------------------
exports('GetActiveIncidents', function()
    local out = {}
    for _, inc in pairs(Incidents.list) do
        if inc.status == EC.Status.active then out[#out + 1] = Dispatch.payload(inc) end
    end
    return out
end)

exports('GetIncident', function(id)
    local inc = Incidents.get(id)
    return inc and Dispatch.payload(inc) or nil
end)

exports('SetIncidentPhase', function(id, phase, note)
    return Incidents.setPhase(id, phase, nil, note)
end)

exports('EndIncident', function(id, reason)
    return Incidents.finish(id, nil, 'end', reason or 'Leitstelle')
end)

exports('CancelIncident', function(id, reason)
    return Incidents.finish(id, nil, 'cancel', reason or 'Leitstelle')
end)

exports('ReAlarmIncident', function(id)
    return Incidents.reAlarm(id, nil)
end)

exports('GetScenarios', function()
    return scenarioList()
end)

-- Gespeichertes Szenario als Einsatz starten (mode: 'live' | 'test')
exports('StartScenario', function(scenarioId, mode)
    local record = Storage.scenarios[scenarioId]
    if not record then return false, 'Szenario nicht gefunden' end
    local sc, err = Validate.scenario(record.scenario)
    if not sc then return false, err end
    return Incidents.create(nil, sc, mode == 'test' and 'test' or 'live', scenarioId)
end)

----------------------------------------------------------------------------
-- Lebenszyklus
----------------------------------------------------------------------------
AddEventHandler('onResourceStart', function(res)
    if res ~= GetCurrentResourceName() then return end
    if GetConvar('onesync', 'off') == 'off' then
        U.log('error', 'OneSync ist deaktiviert. Der Einsatz-Creator benoetigt OneSync (Fahrzeuge/Objekte/NPCs werden serverseitig erzeugt).')
    end
    Framework.init()
    Storage.loadScenarios()
    Storage.loadHistory()
    CreateThread(function()
        Wait(1000)
        Incidents.recover()
        U.log('info', 'Einsatz-Creator bereit (Bridge-Adapter: %s, z_hose: %s)', Config.Dispatch.adapter,
            GetResourceState(Config.ZHose.resource) == 'started' and 'erkannt' or 'nicht gestartet')
    end)
end)

AddEventHandler('onResourceStop', function(res)
    if res ~= GetCurrentResourceName() then return end
    Incidents.shutdown()
end)
