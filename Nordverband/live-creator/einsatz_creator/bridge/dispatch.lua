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
        alarmText = sc.info.alarmText,
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

local function emit(kind, incident, change)
    -- Testeinsaetze gehen nie an die Leitstelle
    if incident.mode ~= 'live' then return end
    local adapter = Config.Dispatch.adapter
    if adapter == 'none' then return end

    local payload = Dispatch.payload(incident, change)
    local ok, err = pcall(function()
        if adapter == 'event' then
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
