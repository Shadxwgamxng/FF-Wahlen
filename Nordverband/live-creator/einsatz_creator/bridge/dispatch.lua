--[[
    Leitstellen-Bridge (austauschbare Uebergabestelle)

    Dies ist das INTERNE Datenmodell des Einsatz-Creators. Es trifft keine
    Annahme darueber, welche Parameter eine bestimmte Leitstelle erwartet.
    Fuer die endgueltige Anbindung wird ausschliesslich diese Datei bzw.
    Config.DispatchCustom angepasst.

    Adapter (Config.Dispatch.adapter):
      'none'   keine Uebergabe
      'event'  loest eigene, lokale Server-Events aus, die eine Leitstelle abonnieren kann:
                 einsatzcreator:bridge:created   (payload)
                 einsatzcreator:bridge:status    (payload)
                 einsatzcreator:bridge:update    (payload)
                 einsatzcreator:bridge:ended     (payload)
      'custom' ruft Config.DispatchCustom.onCreated/onStatus/onUpdate/onEnded(payload) auf
      'emergencydispatch' legt je alarmierter Rolle einen Notruf in EmergencyDispatch an
               (dokumentiertes Server-Event 'emergencydispatch:emergencycall:new').
               Status/Update/Ende werden zusaetzlich als 'event' ausgeloest, da
               EmergencyDispatch dafuer keine Schnittstelle bietet.

    Payload (alle Adapter):
      {
        incidentId   = 'EC-251011-0001',
        scenarioId   = 'SZ-1A2B3C' | nil,
        mode         = 'live' | 'test',
        category     = 'brand' | 'thl' | 'tuer' | 'vu' | 'rd',
        categoryLabel= 'Brandeinsatz',
        keyword      = 'B2 - Mittelbrand',
        name         = 'Wohnungsbrand Vinewood',
        priority     = 1..3,
        alarmText    = '...',
        description  = '...',
        address      = '...',
        coords       = { x, y, z },
        hazards      = '...',
        units        = { 'HLF', 'RTW', ... },   -- erwartete Einsatzmittel
        unitsText    = '...',
        roles        = { 'fire', 'ems' },       -- zu alarmierende Rollen
        persons      = { total, byStatus = {...}, bySeverity = {...}, text = '...' },
        fire         = { burning, smouldering, smoke, extinguished },
        status       = 'aktiv' | 'beendet' | 'abgebrochen' | 'fehlerhaft',
        phase        = 'alarmiert' | 'anfahrt' | 'vor_ort' | ...,
        custom       = { ... art-spezifische Felder ... },
        createdAt    = <Unix-Zeit>, createdBy = 'Name',
        timestamp    = <Unix-Zeit>,
        change       = { ... nur bei status/update: was hat sich geaendert ... },
      }
]]

local U = EC.Utils

Dispatch = {}

function Dispatch.payload(incident, change)
    local sc = incident.scenario
    local rescue = Rescue.summary(incident)
    local fire = Fire.summary(incident.id)
    local cat = EC.CategoryById[sc.category]
    return {
        incidentId = incident.id,
        scenarioId = incident.scenarioId,
        mode = incident.mode,
        category = sc.category,
        categoryLabel = cat and cat.label or sc.category,
        keyword = sc.keyword,
        name = sc.name,
        priority = sc.priority,
        alarmText = incident.alarmText or sc.info.alarmText,
        description = sc.info.description,
        address = incident.address or sc.info.address,
        coords = { x = sc.center.x, y = sc.center.y, z = sc.center.z },
        hazards = sc.info.hazards,
        units = U.deepcopy(sc.info.units),
        unitsText = sc.info.unitsText,
        roles = U.deepcopy(sc.info.alarmRoles),
        persons = {
            total = rescue.patients,
            byStatus = rescue.byStatus,
            bySeverity = rescue.bySeverity,
            text = sc.info.persons,
        },
        fire = {
            burning = fire.burning,
            smouldering = fire.smouldering,
            smoke = fire.smoke,
            extinguished = incident.fire and incident.fire.extinguished or 0,
        },
        status = incident.status,
        phase = incident.phase,
        custom = U.deepcopy(sc.info.custom),
        createdAt = incident.createdAt,
        createdBy = incident.createdBy and incident.createdBy.name or nil,
        timestamp = os.time(),
        change = change,
    }
end

local customFn = { created = 'onCreated', status = 'onStatus', update = 'onUpdate', ended = 'onEnded' }

-- Notrufmeldung aus Vorlage bauen
local function formatMessage(template, payload)
    local values = {
        keyword = payload.keyword ~= '' and payload.keyword or payload.categoryLabel,
        name = payload.name,
        alarmText = payload.alarmText ~= '' and payload.alarmText or payload.name,
        address = payload.address or '',
        patients = tostring(payload.persons.total or 0),
        id = payload.incidentId,
    }
    local text = template:gsub('{(%w+)}', function(k) return values[k] or '' end)
    text = text:gsub('%s+%-%s*$', ''):gsub('^%s+', '')
    return text
end

-- Notruf(e) in EmergencyDispatch anlegen. Rueckgabe: Anzahl angelegter Notrufe
local function emergencyCall(payload, template)
    local cfg = Config.EmergencyDispatch
    if GetResourceState(cfg.resource) ~= 'started' then
        U.log('error', 'EmergencyDispatch (%s) ist nicht gestartet - Einsatz %s wurde NICHT an die Leitstelle uebergeben', cfg.resource, payload.incidentId)
        return 0
    end
    local coords = vector3(payload.coords.x, payload.coords.y, payload.coords.z)
    local message = formatMessage(template, payload)
    local sent, seen = 0, {}
    for _, role in ipairs(payload.roles or {}) do
        local job = cfg.jobsByRole[role]
        if job and not seen[job] then
            seen[job] = true
            TriggerEvent('emergencydispatch:emergencycall:new', job, message, coords, true)
            sent = sent + 1
            U.log('info', 'Einsatz %s: Notruf an Leitstelle "%s" uebergeben', payload.incidentId, job)
        end
    end
    return sent
end

local function emit(kind, incident, change)
    -- Testeinsaetze gehen nie an die Leitstelle
    if incident.mode ~= 'live' then return end
    local adapter = Config.Dispatch.adapter
    if adapter == 'none' then return end

    local payload = Dispatch.payload(incident, change)
    local ok, err = pcall(function()
        if adapter == 'emergencydispatch' then
            if kind == 'created' then
                incident.dispatchCalls = emergencyCall(payload, Config.EmergencyDispatch.message)
            end
            TriggerEvent('einsatzcreator:bridge:' .. kind, payload)
        elseif adapter == 'event' then
            TriggerEvent('einsatzcreator:bridge:' .. kind, payload)
        elseif adapter == 'custom' then
            local fn = Config.DispatchCustom[customFn[kind]]
            if type(fn) == 'function' then fn(payload) end
        end
    end)
    if not ok then
        U.log('error', 'Leitstellen-Bridge (%s/%s) fuer %s fehlgeschlagen: %s', adapter, kind, incident.id, tostring(err))
    else
        U.log('debug', 'Bridge %s -> %s (%s)', kind, incident.id, adapter)
    end
end

function Dispatch.created(incident) emit('created', incident) end
function Dispatch.status(incident, change) emit('status', incident, change) end
function Dispatch.update(incident, change) emit('update', incident, change) end
function Dispatch.ended(incident, change) emit('ended', incident, change) end

-- Nachalarmierung ueber die Leitstelle. Rueckgabe: Anzahl Notrufe
function Dispatch.reAlarm(incident)
    if incident.mode ~= 'live' or Config.Dispatch.adapter ~= 'emergencydispatch' then return 0 end
    local ok, n = pcall(emergencyCall, Dispatch.payload(incident, { reAlarm = true }), Config.EmergencyDispatch.reAlarmMessage)
    return ok and n or 0
end
