--[[
    Interne Alarmierung (funktioniert ohne Leitstelle).

    Live: alle Spieler mit einer der Alarmierungsrollen des Einsatzes.
    Test: nur der Ausloesende und Spieler mit Config.Modes.testReceiversAce.
]]

local U = EC.Utils

Alarm = {}

function Alarm.recipients(incident)
    local list, seen = {}, {}
    local function add(src)
        src = tonumber(src)
        if src and not seen[src] and GetPlayerName(src) then
            seen[src] = true
            list[#list + 1] = src
        end
    end

    if incident.mode == 'test' then
        if incident.createdBy then add(incident.createdBy.src) end
        for _, src in ipairs(GetPlayers()) do
            if IsPlayerAceAllowed(src, Config.Modes.testReceiversAce) then add(src) end
        end
    else
        for _, src in ipairs(GetPlayers()) do
            if Perm.hasAnyRole(tonumber(src), incident.scenario.info.alarmRoles) then add(src) end
        end
    end
    return list
end

-- Daten fuer Alarm-Popup und Blips
function Alarm.payload(incident)
    local sc = incident.scenario
    local cat = EC.CategoryById[sc.category]
    local areas, markers = {}, {}
    for _, el in ipairs(sc.elements) do
        if el.kind == 'area' and el.props.blip then
            areas[#areas + 1] = { pos = el.pos, r = el.props.radius, kind = el.props.areaKind, label = el.label }
        elseif el.kind == 'marker' and el.props.blip then
            markers[#markers + 1] = { pos = el.pos, kind = el.props.markerKind, label = el.label }
        end
    end
    local rescue = Rescue.summary(incident)
    return {
        id = incident.id,
        mode = incident.mode,
        name = sc.name,
        keyword = sc.keyword,
        category = sc.category,
        categoryLabel = cat and cat.label or sc.category,
        priority = sc.priority,
        alarmText = sc.info.alarmText,
        address = incident.address or sc.info.address,
        center = sc.center,
        areas = areas,
        markers = markers,
        patients = rescue.patients,
        units = sc.info.units,
    }
end

function Alarm.send(incident, isReAlarm)
    if not Config.Alarm.enabled then return 0 end
    if incident.mode == 'live' and Config.Dispatch.adapter ~= 'none' and not Config.Dispatch.internalAlarm then
        return 0
    end
    local recipients = Alarm.recipients(incident)
    local payload = Alarm.payload(incident)
    payload.reAlarm = isReAlarm == true
    incident.recipients = incident.recipients or {}
    for _, src in ipairs(recipients) do
        incident.recipients[src] = true
        TriggerClientEvent(EC.Events.alarm, src, payload)
    end
    U.log('info', 'Einsatz %s (%s): %d Empfaenger alarmiert%s', incident.id, incident.mode, #recipients, isReAlarm and ' (Nachalarmierung)' or '')
    return #recipients
end

-- Darf der Spieler die Einsatzdetails sehen?
function Alarm.canSee(src, incident)
    if incident.recipients and incident.recipients[src] then return true end
    if Perm.can(src, 'use') then return true end
    if incident.mode == 'live' then return Perm.hasAnyRole(src, incident.scenario.info.alarmRoles) end
    return false
end

-- Detailansicht (/einsatzinfo)
function Alarm.details(incident)
    local sc = incident.scenario
    local cat = EC.CategoryById[sc.category]
    local custom = {}
    for _, f in ipairs(cat and cat.fields or {}) do
        local v = sc.info.custom[f.key]
        if v ~= nil and v ~= '' and v ~= 0 and v ~= false then
            custom[#custom + 1] = { label = f.label, value = f.type == 'checkbox' and 'ja' or tostring(v) }
        end
    end
    local patients = {}
    for id, p in pairs(incident.rescue and incident.rescue.patients or {}) do
        patients[#patients + 1] = {
            id = id, name = p.name, severity = p.severity,
            status = Rescue.patientStatus(p), statusLabel = EC.PatientStatus[Rescue.patientStatus(p)],
        }
    end
    table.sort(patients, function(a, b) return a.name < b.name end)
    local log = {}
    for i = #(incident.log or {}), math.max(1, #(incident.log or {}) - 15), -1 do
        log[#log + 1] = incident.log[i]
    end
    return {
        id = incident.id, mode = incident.mode, status = incident.status, phase = incident.phase,
        name = sc.name, keyword = sc.keyword, categoryLabel = cat and cat.label or sc.category,
        priority = sc.priority, alarmText = sc.info.alarmText, description = sc.info.description,
        address = incident.address or sc.info.address, hazards = sc.info.hazards, persons = sc.info.persons,
        units = sc.info.units, unitsText = sc.info.unitsText, sop = sc.info.sop, custom = custom,
        center = sc.center, patients = patients, fire = Fire.summary(incident.id),
        fireExtinguished = incident.fire and incident.fire.extinguished or 0,
        createdAt = incident.createdAt, log = log,
    }
end
