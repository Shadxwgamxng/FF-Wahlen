--[[
    Patienten, Tueren, Betriebsstoffe und Fundstellen eines Einsatzes.

    Ablauf Patient:
      eingeklemmt -> (Befreien, Feuerwehr) -> unversorgt
      unversorgt  -> (Sichten)   -> gesichtet
      gesichtet   -> (Behandeln) -> versorgt/transportbereit
      versorgt    -> (Einladen in RTW) -> im Rettungsmittel -> (Uebergabe an Klinik) -> uebergeben
      leicht verletzt + gehfaehig: "vor Ort entlassen" moeglich
    Oelspur: abstreuen (Oelbindemittel) -> aufkehren (Besen) -> beseitigt
    Baum (Objekt mit Hindernis "Baum"): zersaegen (Kettensaege) -> Objekt entfernt,
      Saegespaene bleiben liegen -> aufkehren (Besen) -> beseitigt
    Werkzeuge aus Technical Dispatches: siehe Config.Tools
    Behandeln ist auch waehrend der Einklemmung moeglich.

    Alle Aktionen mit Dauer laufen zweistufig: start (Server merkt sich Beginn)
    und complete (Server prueft vergangene Zeit, Abstand, Rolle, Zustand).
]]

local U = EC.Utils

Rescue = {}

local function ms() return GetGameTimer() end

local ACTIONS = {
    -- Patienten
    assess = { target = 'patient', label = 'Sichten / Erstuntersuchung' },
    free = { target = 'patient', label = 'Patient befreien' },
    treat = { target = 'patient', label = 'Patient behandeln' },
    load = { target = 'patient', label = 'In Rettungsmittel einladen' },
    handover = { target = 'patient', label = 'In Klinik uebergeben' },
    release = { target = 'patient', label = 'Vor Ort entlassen' },
    -- sonstige
    open = { target = 'door', label = 'Tuer oeffnen' },
    bind = { target = 'spill', label = 'Oelbindemittel abstreuen' },
    sweep = { target = 'spill', label = 'Bindemittel aufkehren' },
    saw = { target = 'tree', label = 'Baum zersaegen' },
    sweepchips = { target = 'tree', label = 'Saegespaene aufkehren' },
    secure = { target = 'marker', label = 'Fundstelle sichern' },
}
Rescue.Actions = ACTIONS

local function patientStatus(p)
    if p.handedOver then return 'uebergeben' end
    if p.released then return 'vor_ort_entlassen' end
    if p.vehicleNet then return 'im_fahrzeug' end
    if p.stretcherNet then return 'auf_trage' end
    if p.trapped then return 'eingeklemmt' end
    if p.busy and p.busy.action == 'treat' then return 'in_behandlung' end
    if p.treated then return 'stabil' end
    if p.assessed then return 'gesichtet' end
    return 'unversorgt'
end
Rescue.patientStatus = patientStatus

-- Transportziel bestimmen: { coords, label, radius } oder nil (= jede Klinik)
local function resolveDestination(incident, el)
    local pt = el.props.patient
    if pt.destination == 'marker' and pt.destMarker then
        for _, m in ipairs(incident.scenario.elements) do
            if m.id == pt.destMarker then
                return { coords = U.vec(m.pos), label = m.label ~= '' and m.label or 'Zielort', radius = Config.Rescue.handoverRadius }
            end
        end
    elseif pt.destination == 'other_hospital' and #Config.Rescue.hospitals > 0 then
        local pickup = U.vec(el.pos)
        local nearest, nd = nil, math.huge
        for i, h in ipairs(Config.Rescue.hospitals) do
            local d = #(h.coords - pickup)
            if d < nd then nearest, nd = i, d end
        end
        local choices = {}
        for i, h in ipairs(Config.Rescue.hospitals) do
            if i ~= nearest or #Config.Rescue.hospitals == 1 then choices[#choices + 1] = h end
        end
        local h = choices[math.random(#choices)]
        return { coords = h.coords, label = h.label, radius = h.radius }
    end
    return nil
end

function Rescue.init(incident)
    local r = { patients = {}, doors = {}, spills = {}, markers = {}, trees = {} }
    for _, el in ipairs(incident.scenario.elements) do
        if el.kind == 'object' and el.props.obstacle == 'tree' then
            r.trees[el.id] = { id = el.id, status = 'liegt', pos = el.pos, h = el.rot and el.rot.z or 0.0, label = el.label ~= '' and el.label or 'Umgestuerzter Baum' }
        end
        if el.kind == 'ped' and el.props.isPatient then
            local pt = el.props.patient
            r.patients[el.id] = {
                id = el.id,
                name = pt.name ~= '' and pt.name or (el.label ~= '' and el.label or ('Patient ' .. el.id:sub(1, 4))),
                severity = pt.severity,
                transport = pt.transport,
                trapped = pt.mobility == 'eingeklemmt',
                walking = pt.mobility == 'gehfaehig',
                assessed = false, treated = false, handedOver = false, released = false,
                vehicleNet = nil, blockedBy = nil, busy = nil,
                med = Config.Medical.enabled and Med.initPatient(el) or nil,
                dest = resolveDestination(incident, el),
            }
            r.patients[el.id].id = el.id
        elseif el.kind == 'door' then
            r.doors[el.id] = {
                id = el.id, status = 'verschlossen', pos = el.pos, urgency = el.props.urgency,
                description = el.props.description, linked = el.props.linked,
                doorModel = el.props.doorModel, doorPos = el.props.doorPos, lockRealDoor = el.props.lockRealDoor,
                label = el.label,
            }
        elseif el.kind == 'spill' then
            r.spills[el.id] = { id = el.id, status = 'vorhanden', pos = el.pos, kind = el.props.spillKind, width = el.props.width, rot = el.rot.z }
        elseif el.kind == 'marker' then
            r.markers[el.id] = {
                id = el.id, status = 'offen', pos = el.pos, kind = el.props.markerKind, label = el.label,
                description = el.props.description, interactive = el.props.interactive, blip = el.props.blip,
            }
        end
    end
    -- Patienten hinter verschlossenen Tueren
    for doorId, door in pairs(r.doors) do
        for _, pid in ipairs(door.linked or {}) do
            if r.patients[pid] then r.patients[pid].blockedBy = doorId end
        end
    end
    incident.rescue = r
end

-- Oeffentlicher Stand (fuer alle Clients: Interaktionen, Tueren, Oelspuren)
function Rescue.publicState(incident)
    local r = incident.rescue
    if not r then return nil end
    local out = { patients = {}, doors = {}, spills = {}, markers = {}, trees = {} }
    for id, p in pairs(r.patients) do
        local rec = incident.entities and incident.entities[id]
        out.patients[id] = {
            s = patientStatus(p), name = p.name, sev = p.severity, b = p.blockedBy,
            net = rec and rec.netId or nil, busy = p.busy and true or false,
            walk = p.walking, tr = p.transport, med = p.med ~= nil,
            dest = p.dest and p.dest.label or nil,
        }
    end
    for id, d in pairs(r.doors) do
        out.doors[id] = { s = d.status, pos = d.pos, model = d.doorModel, dpos = d.doorPos, lock = d.lockRealDoor, label = d.label, urg = d.urgency }
    end
    for id, s in pairs(r.spills) do
        out.spills[id] = { s = s.status, pos = s.pos, kind = s.kind, w = s.width, r = s.rot }
    end
    for id, m in pairs(r.markers) do
        out.markers[id] = { s = m.status, pos = m.pos, kind = m.kind, label = m.label, i = m.interactive, desc = m.description }
    end
    for id, t in pairs(r.trees or {}) do
        local rec = incident.entities and incident.entities[id]
        out.trees[id] = { s = t.status, pos = t.pos, h = t.h, label = t.label, net = rec and rec.netId or nil }
    end
    return out
end

-- Zusammenfassung fuer Leitstelle / Anzeige
function Rescue.summary(incident)
    local r = incident.rescue
    local s = { patients = 0, byStatus = {}, bySeverity = {}, doorsClosed = 0, spillsOpen = 0 }
    if not r then return s end
    for _, p in pairs(r.patients) do
        s.patients = s.patients + 1
        local st = patientStatus(p)
        s.byStatus[st] = (s.byStatus[st] or 0) + 1
        s.bySeverity[p.severity] = (s.bySeverity[p.severity] or 0) + 1
    end
    for _, d in pairs(r.doors) do if d.status ~= 'geoeffnet' then s.doorsClosed = s.doorsClosed + 1 end end
    for _, sp in pairs(r.spills) do if sp.status ~= 'beseitigt' then s.spillsOpen = s.spillsOpen + 1 end end
    s.treesOpen = 0
    for _, t in pairs(r.trees or {}) do if t.status ~= 'beseitigt' then s.treesOpen = s.treesOpen + 1 end end
    return s
end

----------------------------------------------------------------------------
-- Hilfsfunktionen
----------------------------------------------------------------------------
local function targetOf(incident, kind, id)
    local r = incident.rescue
    if not r then return nil end
    if kind == 'patient' then return r.patients[id]
    elseif kind == 'door' then return r.doors[id]
    elseif kind == 'spill' then return r.spills[id]
    elseif kind == 'marker' then return r.markers[id]
    elseif kind == 'tree' then return r.trees and r.trees[id] end
end

local function elementOf(incident, id)
    for _, el in ipairs(incident.scenario.elements) do
        if el.id == id then return el end
    end
end

local function pedEntity(incident, id)
    local rec = incident.entities and incident.entities[id]
    if rec and Spawner.owns(rec.entity, incident.id) then return rec.entity, rec end
    return nil, rec
end

local function targetCoords(incident, kind, id, target)
    if kind == 'patient' then
        local ped = pedEntity(incident, id)
        if ped then return GetEntityCoords(ped) end
        local el = elementOf(incident, id)
        return el and U.vec(el.pos)
    end
    return U.vec(target.pos)
end

local function roleList(action)
    if ACTIONS[action].target == 'patient' then return Config.Rescue.roles[action] end
    if action == 'open' then return Config.Doors.roles end
    if action == 'bind' or action == 'sweep' then return Config.Spills.roles end
    if action == 'saw' or action == 'sweepchips' then return Config.Trees.roles end
    if action == 'secure' then return Config.Markers.roles end
    return {}
end

local function durationOf(action, target)
    local d = Config.Rescue.durations
    if action == 'assess' then return d.assess end
    if action == 'treat' then return d.treat[target.severity] or 20 end
    if action == 'free' then return d.free end
    if action == 'load' then return d.load end
    if action == 'open' then return Config.Doors.durationSeconds end
    if action == 'bind' or action == 'sweep' then return Config.Spills.durationSeconds end
    if action == 'saw' then return Config.Trees.durationSeconds end
    if action == 'sweepchips' then return Config.Trees.chips.durationSeconds end
    if action == 'secure' then return Config.Markers.durationSeconds end
    return 0
end

local function interactDistance(kind)
    if kind == 'marker' then return Config.Markers.interactDistance + 1.5 end
    if kind == 'spill' then return 8.0 end
    if kind == 'tree' then return 9.0 end
    return Config.Rescue.interactDistance + 2.0
end

local transportHashes
local function isTransportVehicle(entity)
    if not transportHashes then
        transportHashes = {}
        for _, m in ipairs(Config.Rescue.transportVehicles or {}) do transportHashes[GetHashKey(m)] = true end
    end
    if next(transportHashes) == nil then return true end
    return transportHashes[GetEntityModel(entity)] == true
end

-- Ist die Aktion im aktuellen Zustand erlaubt?
local function allowed(action, t)
    if action == 'open' then return t.status == 'verschlossen', 'Tuer ist bereits geoeffnet' end
    if action == 'bind' then return t.status == 'vorhanden', t.status == 'abgestreut' and 'Bereits abgestreut - jetzt aufkehren' or 'Bereits beseitigt' end
    if action == 'sweep' then return t.status == 'abgestreut', t.status == 'vorhanden' and 'Zuerst Oelbindemittel abstreuen' or 'Bereits beseitigt' end
    if action == 'saw' then return t.status == 'liegt', 'Baum ist bereits zersaegt' end
    if action == 'sweepchips' then return t.status == 'gesaegt', t.status == 'liegt' and 'Zuerst den Baum zersaegen' or 'Bereits beseitigt' end
    if action == 'secure' then
        if not t.interactive then return false, 'Diese Position hat keine Interaktion' end
        return t.status == 'offen', 'Bereits gesichert'
    end
    -- Patient
    if t.handedOver or t.released then return false, 'Patient ist nicht mehr vor Ort' end
    if t.blockedBy then return false, 'Patient ist noch nicht zugaenglich (Tuer verschlossen)' end
    if action == 'assess' then return not t.vehicleNet, 'Patient befindet sich im Rettungsmittel' end
    if action == 'free' then return t.trapped, 'Patient ist nicht eingeklemmt' end
    if action == 'treat' then
        if t.med then return false, 'Bitte die medizinische Versorgung nutzen' end
        if t.vehicleNet then return false, 'Patient befindet sich im Rettungsmittel' end
        if not t.assessed then return false, 'Patient zuerst sichten' end
        return not t.treated, 'Patient ist bereits versorgt'
    end
    if action == 'load' then
        if t.trapped then return false, 'Patient ist noch eingeklemmt' end
        if t.vehicleNet then return false, 'Patient ist bereits eingeladen' end
        return t.treated, 'Patient zuerst versorgen' .. (t.med and (': ' .. table.concat(Med.openMeasures(t.med), ', ')) or '')
    end
    if action == 'handover' then
        return t.vehicleNet ~= nil or t.stretcherNet ~= nil, 'Patient ist nicht im Rettungsmittel oder auf der Trage'
    end
    if action == 'release' then
        if t.trapped or t.vehicleNet then return false, 'Nicht moeglich' end
        if t.stretcherNet then return false, 'Patient liegt auf der Trage' end
        if not (t.severity == 'leicht' and t.walking and t.assessed) then
            return false, 'Nur bei gesichteten, leicht verletzten, gehfaehigen Patienten'
        end
        return true
    end
    return false, 'Unbekannte Aktion'
end

local function busyActive(t)
    if not t.busy then return false end
    if ms() > t.busy.startedAt + t.busy.duration + 15000 then
        t.busy = nil
        return false
    end
    return true
end

----------------------------------------------------------------------------
-- Aktion starten. Rueckgabe: true, { duration = Sekunden } | false, Fehler
----------------------------------------------------------------------------
function Rescue.start(src, incident, targetId, action)
    local def = ACTIONS[action]
    if not def then return false, 'Unbekannte Aktion' end
    local t = targetOf(incident, def.target, targetId)
    if not t then return false, 'Ziel nicht gefunden' end
    if not Perm.hasAnyRole(src, roleList(action)) then return false, 'Dafuer fehlt dir die Qualifikation/Rolle' end
    local ok, err = allowed(action, t)
    if not ok then return false, err end
    local hasTool, toolErr = Tools.check(src, action)
    if not hasTool then return false, toolErr end
    if busyActive(t) and t.busy.src ~= src then return false, 'Hier arbeitet bereits jemand' end

    local c = targetCoords(incident, def.target, targetId, t)
    if not c or not Validate.near(src, c, interactDistance(def.target)) then return false, 'Zu weit entfernt' end

    local duration = durationOf(action, t)
    t.busy = { src = src, action = action, startedAt = ms(), duration = duration * 1000 }
    Incidents.syncPublic(incident)
    return true, { duration = duration, label = def.label }
end

function Rescue.cancel(src, incident, targetId, kind)
    local t = targetOf(incident, kind, targetId)
    if t and t.busy and t.busy.src == src then
        t.busy = nil
        Incidents.syncPublic(incident)
    end
    return true
end

-- Sitzposition in einem Fahrzeug suchen (hinten zuerst)
local seatByHash
local function freeSeat(veh)
    if not seatByHash then
        seatByHash = {}
        for model, seat in pairs(Config.Rescue.transportSeats or {}) do seatByHash[GetHashKey(model)] = seat end
    end
    local preferred = seatByHash[GetEntityModel(veh)]
    if preferred and GetPedInVehicleSeat(veh, preferred) == 0 then return preferred end
    for _, seat in ipairs({ 2, 1, 0 }) do
        if GetPedInVehicleSeat(veh, seat) == 0 then return seat end
    end
    return nil
end

local function nearHospital(coords)
    for _, h in ipairs(Config.Rescue.hospitals) do
        if #(coords - h.coords) <= h.radius then return h end
    end
    return nil
end

----------------------------------------------------------------------------
-- Aktion abschliessen. extra.vehicleNet fuer "load"
-- Rueckgabe: true, Ergebnisdaten | false, Fehler
----------------------------------------------------------------------------
function Rescue.complete(src, incident, targetId, action, extra)
    local def = ACTIONS[action]
    if not def then return false, 'Unbekannte Aktion' end
    local t = targetOf(incident, def.target, targetId)
    if not t then return false, 'Ziel nicht gefunden' end
    if not Perm.hasAnyRole(src, roleList(action)) then return false, 'Dafuer fehlt dir die Qualifikation/Rolle' end
    local ok, err = allowed(action, t)
    if not ok then t.busy = nil return false, err end
    local hasTool, toolItem = Tools.check(src, action)
    if not hasTool then t.busy = nil return false, toolItem end

    local duration = durationOf(action, t)
    if duration > 0 then
        if not t.busy or t.busy.src ~= src or t.busy.action ~= action then
            return false, 'Massnahme wurde nicht gestartet oder abgebrochen'
        end
        if ms() - t.busy.startedAt < t.busy.duration - 1500 then
            return false, 'Massnahme wurde zu frueh beendet'
        end
    end

    local c = targetCoords(incident, def.target, targetId, t)
    if not c or not Validate.near(src, c, interactDistance(def.target) + (action == 'handover' and 12.0 or 0.0)) then
        t.busy = nil
        return false, 'Zu weit entfernt'
    end

    local result = {}
    local ped, rec = nil, nil
    if def.target == 'patient' then ped, rec = pedEntity(incident, targetId) end

    if action == 'assess' then
        t.assessed = true
        local el = elementOf(incident, targetId)
        result.patient = el and el.props.patient or nil
        result.name = t.name
    elseif action == 'free' then
        t.trapped = false
        if ped then
            local veh = GetVehiclePedIsIn(ped, false)
            if veh and veh ~= 0 then
                local vc = GetEntityCoords(veh)
                local h = math.rad(GetEntityHeading(veh))
                -- neben die Fahrerseite legen
                local x, y = vc.x - math.cos(h) * 2.2, vc.y - math.sin(h) * 2.2
                ClearPedTasksImmediately(ped)
                SetEntityCoords(ped, x, y, vc.z, false, false, false, false)
            end
            local el = elementOf(incident, targetId)
            local pose = (el and el.props.patient.consciousness == 'bewusstlos') and 'bewusstlos' or 'schmerz'
            Spawner.updateState(rec, incident.id, { pose = pose, st = 'freed' })
        end
    elseif action == 'treat' then
        t.treated = true
    elseif action == 'load' then
        local net = extra and tonumber(extra.vehicleNet)
        local veh = net and NetworkGetEntityFromNetworkId(net)
        if not veh or veh == 0 or not DoesEntityExist(veh) or GetEntityType(veh) ~= 2 then
            t.busy = nil
            return false, 'Kein Rettungsmittel gefunden'
        end
        if not isTransportVehicle(veh) then t.busy = nil return false, 'Dieses Fahrzeug ist kein zugelassenes Rettungsmittel' end
        if ped and #(GetEntityCoords(veh) - GetEntityCoords(ped)) > Config.Rescue.vehicleDistance + 3.0 then
            t.busy = nil
            return false, 'Rettungsmittel steht zu weit entfernt'
        end
        local seat = freeSeat(veh)
        if not seat then t.busy = nil return false, 'Kein freier Platz im Rettungsmittel' end
        if ped then
            Spawner.updateState(rec, incident.id, { st = 'transport', seat = seat })
            -- von der Trage loesen lassen (Besitzer-Client), dann einsetzen
            if t.stretcherNet then Wait(600) end
            SetPedIntoVehicle(ped, veh, seat)
        end
        t.vehicleNet = net
        t.stretcherNet = nil
    elseif action == 'handover' then
        local hospital
        if t.dest then
            if #(c - t.dest.coords) <= (t.dest.radius or Config.Rescue.handoverRadius) then hospital = t.dest end
            if not hospital then t.busy = nil return false, ('Falscher Zielort - Ziel: %s'):format(t.dest.label) end
        else
            hospital = nearHospital(c)
            if not hospital then t.busy = nil return false, 'Keine Klinik in Reichweite' end
        end
        if rec then Spawner.delete(rec, incident.id) incident.entities[targetId] = nil end
        t.handedOver = true
        t.vehicleNet = nil
        t.stretcherNet = nil
        result.hospital = hospital.label
    elseif action == 'release' then
        if rec then Spawner.delete(rec, incident.id) incident.entities[targetId] = nil end
        t.released = true
    elseif action == 'open' then
        t.status = 'geoeffnet'
        for _, pid in ipairs(t.linked or {}) do
            local p = incident.rescue.patients[pid]
            if p and p.blockedBy == targetId then p.blockedBy = nil end
        end
    elseif action == 'bind' then
        t.status = 'abgestreut'
    elseif action == 'sweep' then
        t.status = 'beseitigt'
    elseif action == 'saw' then
        local rec = incident.entities and incident.entities[targetId]
        if rec then Spawner.delete(rec, incident.id) incident.entities[targetId] = nil end
        t.status = Config.Trees.chips.enabled and 'gesaegt' or 'beseitigt'
    elseif action == 'sweepchips' then
        t.status = 'beseitigt'
    elseif action == 'secure' then
        t.status = 'gesichert'
    end

    Tools.consume(src, action, toolItem)
    t.busy = nil
    local actor = Perm.actor(src)
    incident.log = incident.log or {}
    table.insert(incident.log, { at = os.time(), by = actor.name, text = ('%s: %s'):format(def.label, t.name or t.label or targetId) })
    Incidents.onRescueChanged(incident, {
        target = def.target, id = targetId, action = action, by = actor.name,
        status = def.target == 'patient' and patientStatus(t) or t.status,
    })
    return true, result
end
