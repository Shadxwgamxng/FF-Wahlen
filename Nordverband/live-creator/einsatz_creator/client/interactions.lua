--[[
    Interaktionen der Einsatzkraefte vor Ort
    (Patienten, Tueroeffnung, Betriebsstoffe, Fundstellen)

    Eigene, frameworkunabhaengige Interaktion per Taste (Config.Interaction.key).
    Der Client zeigt nur passende Aktionen an; der Server prueft jede Aktion
    erneut (Rolle, Abstand, Zustand, Dauer).
]]

local U = EC.Utils

Interactions = {
    roles = {},
    current = nil,     -- naechstes Ziel { incident, kind, id, label, pos }
    running = false,
    menuOpen = false,
}

local function hasRole(list)
    if not list or #list == 0 then return true end
    for _, r in ipairs(list) do
        if U.inList(Interactions.roles, r) then return true end
    end
    return false
end

local ACTION_ROLES = {
    medical = function() return Config.Medical.roles end,
    assess = function() return Config.Rescue.roles.assess end,
    free = function() return Config.Rescue.roles.free end,
    treat = function() return Config.Rescue.roles.treat end,
    load = function() return Config.Rescue.roles.load end,
    handover = function() return Config.Rescue.roles.handover end,
    release = function() return Config.Rescue.roles.treat end,
    open = function() return Config.Doors.roles end,
    clean = function() return Config.Spills.roles end,
    secure = function() return Config.Markers.roles end,
}

local ACTION_LABELS = {
    medical = 'Medizinische Versorgung',
    assess = 'Sichten / Erstuntersuchung', free = 'Patient befreien (technische Rettung)',
    treat = 'Patient versorgen', load = 'In Rettungsmittel einladen', handover = 'In Klinik uebergeben',
    release = 'Vor Ort entlassen', open = 'Tuer oeffnen', clean = 'Betriebsstoff abstreuen / aufnehmen',
    secure = 'Fundstelle sichern',
}

local SCENARIOS = {
    assess = 'CODE_HUMAN_MEDIC_TEND_TO_DEAD', treat = 'CODE_HUMAN_MEDIC_TEND_TO_DEAD',
    free = 'WORLD_HUMAN_WELDING', open = 'WORLD_HUMAN_HAMMERING', clean = 'WORLD_HUMAN_JANITOR',
    secure = 'CODE_HUMAN_MEDIC_KNEEL', load = 'CODE_HUMAN_MEDIC_KNEEL',
}

----------------------------------------------------------------------------
-- Ziele in der Naehe finden
----------------------------------------------------------------------------
local function patientEntity(p)
    if p.net and NetworkDoesNetworkIdExist(p.net) then
        local ent = NetworkGetEntityFromNetworkId(p.net)
        if ent and ent ~= 0 and DoesEntityExist(ent) then return ent end
    end
    return nil
end

local function candidates(me)
    local best, bestD = nil, 999.0
    local function consider(c, d, maxD)
        if d <= maxD and d < bestD then best, bestD = c, d end
    end
    for _, inc in pairs(World.incidents) do
        local r = inc.rescue or {}
        for id, p in pairs(r.patients or {}) do
            if p.s ~= 'uebergeben' and p.s ~= 'vor_ort_entlassen' then
                local ent = patientEntity(p)
                if ent then
                    local pos = GetEntityCoords(ent)
                    consider({ incident = inc.id, kind = 'patient', id = id, data = p, pos = pos,
                        label = ('Patient: %s (%s)'):format(p.name or '?', EC.PatientStatus[p.s] or p.s) },
                        #(me - pos), Config.Rescue.interactDistance + (p.s == 'im_fahrzeug' and 2.5 or 0.0))
                end
            end
        end
        for id, d in pairs(r.doors or {}) do
            if d.s == 'verschlossen' then
                local pos = U.vec(d.pos)
                consider({ incident = inc.id, kind = 'door', id = id, data = d, pos = pos,
                    label = ('Tuer (%s)'):format(d.urg or 'dringend') }, #(me - pos), Config.Rescue.interactDistance)
            end
        end
        for id, s in pairs(r.spills or {}) do
            if s.s == 'vorhanden' then
                local pos = U.vec(s.pos)
                local kind = EC.SpillKindById[s.kind]
                consider({ incident = inc.id, kind = 'spill', id = id, data = s, pos = pos,
                    label = kind and kind.label or 'Betriebsstoff' }, #(me - pos), (s.w or 2.0) + 1.5)
            end
        end
        for id, m in pairs(r.markers or {}) do
            if m.i and m.s == 'offen' then
                local pos = U.vec(m.pos)
                local kind = EC.MarkerKindById[m.kind]
                consider({ incident = inc.id, kind = 'marker', id = id, data = m, pos = pos,
                    label = (m.label and m.label ~= '' and m.label) or (kind and kind.label) or 'Fundstelle' },
                    #(me - pos), Config.Markers.interactDistance)
            end
        end
    end
    return best
end

local function useTarget()
    return Config.Interaction.mode == 'ox_target' and GetResourceState(Config.Interaction.targetResource) == 'started'
end
Interactions.useTarget = useTarget

local function actionsFor(target)
    local list = {}
    local function add(id, enabled, reason)
        if hasRole(ACTION_ROLES[id]()) then
            list[#list + 1] = { id = id, label = ACTION_LABELS[id], enabled = enabled ~= false, reason = reason }
        end
    end
    local d = target.data
    if target.kind == 'patient' then
        local s = d.s
        if d.b then
            return { { id = 'none', label = 'Patient ist hinter einer verschlossenen Tuer', enabled = false } }
        end
        if s == 'eingeklemmt' then add('free') end
        if d.med then
            -- detaillierte Versorgung (Menue) statt Sichten/Versorgen/Entlassen
            add('medical')
            if s == 'stabil' or s == 'auf_trage' then add('load') end
            if s == 'im_fahrzeug' or s == 'auf_trage' then add('handover') end
            return list
        end
        if s ~= 'im_fahrzeug' then add('assess') end
        -- bei Eingeklemmten prueft der Server, ob bereits gesichtet wurde
        if s == 'gesichtet' or s == 'eingeklemmt' then add('treat') end
        if s == 'unversorgt' then add('treat', false, 'Zuerst sichten') end
        if s == 'stabil' then add('load') end
        if s == 'im_fahrzeug' then add('handover') end
        if d.sev == 'leicht' and d.walk and (s == 'gesichtet' or s == 'stabil') then add('release') end
    elseif target.kind == 'door' then
        add('open')
    elseif target.kind == 'spill' then
        add('clean')
    elseif target.kind == 'marker' then
        add('secure')
    end
    return list
end

----------------------------------------------------------------------------
-- Rettungsmittel in der Naehe (fuer "Einladen")
----------------------------------------------------------------------------
local transportHashes
local function nearestTransport(pos)
    if not transportHashes then
        transportHashes = {}
        for _, m in ipairs(Config.Rescue.transportVehicles or {}) do transportHashes[GetHashKey(m)] = true end
    end
    local best, bestD = nil, Config.Rescue.vehicleDistance
    for _, veh in ipairs(GetGamePool('CVehicle')) do
        if next(transportHashes) == nil or transportHashes[GetEntityModel(veh)] then
            local d = #(GetEntityCoords(veh) - pos)
            if d < bestD and NetworkGetEntityIsNetworked(veh) then best, bestD = veh, d end
        end
    end
    return best
end

----------------------------------------------------------------------------
-- Massnahme ausfuehren
----------------------------------------------------------------------------
function Interactions.run(target, action)
    if Interactions.running then return end
    if action == 'medical' then
        MedClient.open(target.incident, target.id)
        return
    end
    Interactions.running = true
    local ped = PlayerPedId()

    local extra
    if action == 'load' then
        local veh = nearestTransport(target.pos)
        if not veh then
            Interactions.running = false
            NUI.toast('error', 'Kein Rettungsmittel in der Naehe (max. ' .. math.floor(Config.Rescue.vehicleDistance) .. ' m)')
            return
        end
        extra = { vehicleNet = NetworkGetNetworkIdFromEntity(veh) }
    end

    local kindMap = { patient = 'patient', door = 'door', spill = 'spill', marker = 'marker' }
    local ok, res = Request('rescueStart', { incidentId = target.incident, targetId = target.id, action = action })
    if not ok then
        Interactions.running = false
        NUI.toast('error', res or 'Aktion nicht moeglich')
        return
    end

    local duration = (res and res.duration or 0) * 1000
    local cancelled = false
    if duration > 0 then
        local start = GetEntityCoords(ped)
        if SCENARIOS[action] and not IsPedInAnyVehicle(ped, false) then
            TaskTurnPedToFaceCoord(ped, target.pos.x, target.pos.y, target.pos.z, 800)
            Wait(400)
            TaskStartScenarioInPlace(ped, SCENARIOS[action], 0, true)
        end
        NUI.send('progress', { label = res.label or ACTION_LABELS[action], duration = duration, cancelKey = Config.Interaction.cancelLabel })
        local endAt = GetGameTimer() + duration
        while GetGameTimer() < endAt do
            if IsControlJustReleased(0, Config.Interaction.cancelKey) or IsEntityDead(ped)
                or #(GetEntityCoords(ped) - start) > Config.Interaction.maxMoveDistance then
                cancelled = true
                break
            end
            Wait(0)
        end
        NUI.send('progress', nil)
        ClearPedTasks(ped)
    end

    if cancelled then
        Request('rescueCancel', { incidentId = target.incident, targetId = target.id, kind = kindMap[target.kind] })
        NUI.toast('info', 'Massnahme abgebrochen')
        Interactions.running = false
        return
    end

    local cok, cres = Request('rescueComplete', { incidentId = target.incident, targetId = target.id, action = action, extra = extra })
    Interactions.running = false
    if not cok then
        NUI.toast('error', cres or 'Massnahme fehlgeschlagen')
        return
    end
    if action == 'assess' and cres and cres.patient then
        NUI.send('patientCard', { name = cres.name, patient = cres.patient, severities = Catalog.Severities })
    elseif action == 'handover' and cres and cres.hospital then
        NUI.toast('success', 'Patient uebergeben: ' .. cres.hospital)
    else
        NUI.toast('success', (ACTION_LABELS[action] or 'Massnahme') .. ': erledigt')
    end
end

----------------------------------------------------------------------------
-- Schleifen: Ziel suchen, Hinweis anzeigen, Taste abfragen
----------------------------------------------------------------------------
CreateThread(function()
    local shown = nil
    while true do
        local sleep = 800
        if next(World.incidents) and not useTarget() and not State.open and not Interactions.running and not Interactions.menuOpen then
            sleep = 300
            local ped = PlayerPedId()
            local target = nil
            if not IsEntityDead(ped) then target = candidates(GetEntityCoords(ped)) end
            Interactions.current = target
            local text = target and ('[%s] %s'):format(Config.Interaction.keyLabel, target.label) or nil
            if text ~= shown then
                shown = text
                NUI.send('prompt', text and { text = text } or nil)
            end
        elseif shown then
            shown = nil
            Interactions.current = nil
            NUI.send('prompt', nil)
        end
        Wait(sleep)
    end
end)

CreateThread(function()
    while true do
        if Interactions.current and not State.open and not Interactions.running and not Interactions.menuOpen then
            if IsControlJustReleased(0, Config.Interaction.key) then
                local target = Interactions.current
                local actions = actionsFor(target)
                if #actions == 0 then
                    NUI.toast('error', 'Keine passenden Massnahmen fuer deine Rolle')
                else
                    Interactions.menuOpen = true
                    Interactions.menuTarget = target
                    NUI.send('prompt', nil)
                    NUI.send('actionMenu', { title = target.label, actions = actions })
                    SetNuiFocus(true, true)
                end
            end
            Wait(0)
        else
            Wait(250)
        end
    end
end)

NUI.on('actionChoose', function(data)
    local target = Interactions.menuTarget
    Interactions.menuOpen = false
    Interactions.menuTarget = nil
    if not State.open then SetNuiFocus(false, false) end
    if target and ACTION_LABELS[data.action] then
        CreateThread(function() Interactions.run(target, data.action) end)
    end
    return true
end)

NUI.on('actionClose', function()
    Interactions.menuOpen = false
    Interactions.menuTarget = nil
    if not State.open then SetNuiFocus(false, false) end
    return true
end)

NUI.on('patientCardClose', function()
    return true
end)

----------------------------------------------------------------------------
-- ox_target (Config.Interaction.mode = 'ox_target')
--   Patienten:   exports.ox_target:addEntity(netId, options)
--   Tueren usw.: exports.ox_target:addSphereZone({ coords, radius, options })
-- Angezeigt werden nur Massnahmen, die zum aktuellen Zustand und zur Rolle passen
-- (canInteract); der Server prueft jede Massnahme erneut.
----------------------------------------------------------------------------
local ICONS = {
    medical = 'fa-solid fa-user-doctor',
    assess = 'fa-solid fa-stethoscope', free = 'fa-solid fa-screwdriver-wrench', treat = 'fa-solid fa-kit-medical',
    load = 'fa-solid fa-truck-medical', handover = 'fa-solid fa-hospital', release = 'fa-solid fa-person-walking',
    open = 'fa-solid fa-door-open', clean = 'fa-solid fa-broom', secure = 'fa-solid fa-flag-checkered',
}
local KIND_ACTIONS = {
    patient = { 'medical', 'free', 'assess', 'treat', 'load', 'handover', 'release' },
    door = { 'open' }, spill = { 'clean' }, marker = { 'secure' },
}
local registered = {}   -- key -> { kind, net | zone }

local function currentTarget(incidentId, kind, id)
    local inc = World.incidents[incidentId]
    local r = inc and inc.rescue
    if not r then return nil end
    local data = (kind == 'patient' and r.patients or kind == 'door' and r.doors or kind == 'spill' and r.spills or r.markers)[id]
    if not data then return nil end
    local pos
    if kind == 'patient' then
        local ent = patientEntity(data)
        pos = ent and GetEntityCoords(ent) or nil
    else
        pos = U.vec(data.pos)
    end
    if not pos then return nil end
    local label = kind == 'patient' and ('Patient: %s'):format(data.name or '?') or kind
    return { incident = incidentId, kind = kind, id = id, data = data, pos = pos, label = label }
end

local function buildOptions(incidentId, kind, id)
    local options = {}
    for _, action in ipairs(KIND_ACTIONS[kind]) do
        options[#options + 1] = {
            name = ('ec_%s_%s'):format(id, action),
            label = ACTION_LABELS[action],
            icon = ICONS[action],
            distance = kind == 'spill' and 4.0 or 2.5,
            canInteract = function()
                if Interactions.running or State.open then return false end
                local t = currentTarget(incidentId, kind, id)
                if not t then return false end
                for _, a in ipairs(actionsFor(t)) do
                    if a.id == action then return a.enabled end
                end
                return false
            end,
            onSelect = function()
                local t = currentTarget(incidentId, kind, id)
                if t then CreateThread(function() Interactions.run(t, action) end) end
            end,
        }
    end
    return options
end

local function optionNames(kind, id)
    local names = {}
    for _, action in ipairs(KIND_ACTIONS[kind]) do names[#names + 1] = ('ec_%s_%s'):format(id, action) end
    return names
end

local function unregister(key)
    local r = registered[key]
    if not r then return end
    local ox = exports[Config.Interaction.targetResource]
    pcall(function()
        if r.net then ox:removeEntity(r.net, optionNames(r.kind, r.id)) else ox:removeZone(r.zone) end
    end)
    registered[key] = nil
end

CreateThread(function()
    while true do
        Wait(1000)
        if useTarget() then
            local ox = exports[Config.Interaction.targetResource]
            local wanted = {}
            for incId, inc in pairs(World.incidents) do
                local r = inc.rescue or {}
                for id, p in pairs(r.patients or {}) do
                    if p.net and p.s ~= 'uebergeben' and p.s ~= 'vor_ort_entlassen' then
                        local key = incId .. ':p:' .. id
                        wanted[key] = true
                        if not registered[key] then
                            local ok = pcall(function() ox:addEntity(p.net, buildOptions(incId, 'patient', id)) end)
                            if ok then registered[key] = { kind = 'patient', id = id, net = p.net } end
                        end
                        -- Liegende NPCs trifft der Ziel-Strahl oft nicht (Kollision bleibt aufrecht an der Hueftposition).
                        -- Deshalb zusaetzlich eine Zone um den Koerper, die dem Patienten folgt.
                        local ent = patientEntity(p)
                        if ent and not IsPedInAnyVehicle(ent, false) and not IsEntityAttached(ent) then
                            local zkey = incId .. ':pz:' .. id
                            local pos = GetEntityCoords(ent)
                            local reg = registered[zkey]
                            if reg and #(reg.pos - pos) > 1.0 then unregister(zkey) reg = nil end
                            wanted[zkey] = true
                            if not reg then
                                local ok, zid = pcall(function()
                                    return ox:addSphereZone({ coords = pos - vector3(0.0, 0.0, 0.5), radius = 1.2,
                                        debug = Config.Debug, options = buildOptions(incId, 'patient', id) })
                                end)
                                if ok and zid then registered[zkey] = { kind = 'patient', id = id, zone = zid, pos = pos } end
                            end
                        end
                    end
                end
                local function zone(kind, list, active, radius)
                    for id, d in pairs(list or {}) do
                        if active(d) then
                            local key = incId .. ':' .. kind .. ':' .. id
                            wanted[key] = true
                            if not registered[key] then
                                local ok, zid = pcall(function()
                                    return ox:addSphereZone({ coords = U.vec(d.pos) + vector3(0.0, 0.0, 0.8), radius = radius(d),
                                        debug = Config.Debug, options = buildOptions(incId, kind, id) })
                                end)
                                if ok and zid then registered[key] = { kind = kind, id = id, zone = zid } end
                            end
                        end
                    end
                end
                zone('door', r.doors, function(d) return d.s == 'verschlossen' end, function() return 1.2 end)
                zone('spill', r.spills, function(d) return d.s == 'vorhanden' end, function(d) return math.max(1.0, d.w or 2.0) end)
                zone('marker', r.markers, function(d) return d.i and d.s == 'offen' end, function() return 1.2 end)
            end
            for key in pairs(registered) do
                if not wanted[key] then unregister(key) end
            end
        elseif next(registered) then
            for key in pairs(registered) do unregister(key) end
        end
    end
end)

AddEventHandler('onResourceStop', function(res)
    if res ~= GetCurrentResourceName() then return end
    for key in pairs(registered) do unregister(key) end
end)

----------------------------------------------------------------------------
-- Fehlersuche: /einsatzdebug zeigt in der F8-Konsole, warum keine Optionen erscheinen
----------------------------------------------------------------------------
RegisterCommand('einsatzdebug', function()
    CreateThread(function()
        local ok, roles = Request('myRoles')
        if ok then Interactions.roles = roles or {} end
        local me = GetEntityCoords(PlayerPedId())
        local out = {}
        local function line(fmt, ...) out[#out + 1] = fmt:format(...) end
        line('Rollen: %s | ox_target aktiv: %s | Modus: %s | Creator offen: %s | Massnahme laeuft: %s',
            table.concat(Interactions.roles, ', ') ~= '' and table.concat(Interactions.roles, ', ') or 'KEINE',
            tostring(useTarget()), Config.Interaction.mode, tostring(State.open == true), tostring(Interactions.running))
        local nInc, nPat = 0, 0
        for incId, inc in pairs(World.incidents) do
            nInc = nInc + 1
            for id, p in pairs((inc.rescue or {}).patients or {}) do
                nPat = nPat + 1
                local ent = patientEntity(p)
                local dist = ent and #(GetEntityCoords(ent) - me) or -1
                if dist < 0 or dist < 30.0 then
                    local t = currentTarget(incId, 'patient', id)
                    local acts = {}
                    for _, a in ipairs(t and actionsFor(t) or {}) do acts[#acts + 1] = a.id .. (a.enabled and '' or '(gesperrt)') end
                    line('Patient %s/%s "%s": Status=%s Meldebild=%s net=%s Entity=%s Abstand=%.1f m | Ziel registriert: Entity=%s Zone=%s | Aktionen: %s',
                        incId, id, tostring(p.name), tostring(p.s), tostring(p.med ~= nil and p.med ~= false), tostring(p.net),
                        ent and tostring(ent) or 'NICHT GEFUNDEN', dist,
                        tostring(registered[incId .. ':p:' .. id] ~= nil), tostring(registered[incId .. ':pz:' .. id] ~= nil),
                        #acts > 0 and table.concat(acts, ', ') or 'KEINE')
                end
            end
        end
        line('Bekannte Einsaetze: %d, Patienten: %d', nInc, nPat)
        for _, l in ipairs(out) do print('[einsatzdebug] ' .. l) end
        NUI.toast('info', 'Diagnose in der F8-Konsole ausgegeben (' .. nPat .. ' Patienten bekannt)')
    end)
end, false)
