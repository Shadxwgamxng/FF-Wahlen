--[[
    Einsatzinformationen fuer Einsatzkraefte (/einsatzinfo).

    Dieses Script alarmiert NICHT selbst. Live-Einsaetze werden ausschliesslich
    als Notruf an EmergencyDispatch uebergeben (bridge/dispatch.lua); die
    Alarmierung der Fahrzeuge erfolgt dort.
]]

local U = EC.Utils

Alarm = {}

-- Darf der Spieler die Einsatzdetails sehen?
function Alarm.canSee(src, incident)
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
            dest = p.dest and p.dest.label or nil,
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
        priority = sc.priority, alarmText = incident.alarmText or sc.info.alarmText, description = sc.info.description,
        address = incident.address or sc.info.address, hazards = sc.info.hazards, persons = sc.info.persons,
        units = sc.info.units, unitsText = sc.info.unitsText, sop = sc.info.sop, custom = custom,
        center = sc.center, patients = patients, fire = Fire.summary(incident.id),
        fireExtinguished = incident.fire and incident.fire.extinguished or 0,
        createdAt = incident.createdAt, log = log,
    }
end
