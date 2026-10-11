--[[
    Feuer-Client: Darstellung + Loescherkennung

    Darstellung: Partikeleffekte fuer Brandherde/Rauch in Config.Fire.renderDistance.
    Loeschen:    Wird ein Strahlrohr von z_hose gespritzt (exports.z_hose:IsUsingHose())
                 oder der GTA-Feuerloescher benutzt, werden Brandherde im Strahlkegel
                 erkannt und als Treffer an den Server gemeldet. Der Server prueft
                 Waffe, Abstand und Trefferrate und entscheidet ueber das Loeschen.
]]

local U = EC.Utils

FireClient = {
    nodes = {},     -- id -> Knoten (vom Server)
    smokes = {},    -- id -> Rauch (vom Server)
    fx = {},        -- id -> { handles = {}, scale, state, pos }
}

local WATER, FOAM = {}, {}
for _, w in ipairs(Config.ZHose.waterWeapons) do WATER[GetHashKey(w)] = true end
for _, w in ipairs(Config.ZHose.foamWeapons) do FOAM[GetHashKey(w)] = true end
local EXTINGUISHER = GetHashKey('WEAPON_FIREEXTINGUISHER')

local function zhoseRunning()
    return GetResourceState(Config.ZHose.resource) == 'started'
end

----------------------------------------------------------------------------
-- Position eines Knotens
----------------------------------------------------------------------------
local function worldPos(n)
    if n.a and NetworkDoesNetworkIdExist(n.a) then
        local ent = NetworkGetEntityFromNetworkId(n.a)
        if ent and ent ~= 0 and DoesEntityExist(ent) then
            local c = GetEntityCoords(ent)
            local o = n.o or { x = 0, y = 0, z = 0 }
            return vector3(c.x + o.x, c.y + o.y, c.z + o.z)
        end
    end
    return U.vec(n.p)
end

----------------------------------------------------------------------------
-- Darstellung
----------------------------------------------------------------------------
local function stopFx(id)
    local f = FireClient.fx[id]
    if not f then return end
    for _, h in ipairs(f.handles) do FX.stop(h) end
    FireClient.fx[id] = nil
end

local function fireScale(n)
    local ft = EC.FireTypeById[n.t] or EC.FireTypeById.normal
    return ft.scale * n.s * (0.35 + 0.65 * (n.h or 100) / 100)
end

local function startNodeFx(id, n, pos)
    local ft = EC.FireTypeById[n.t] or EC.FireTypeById.normal
    local handles = {}
    local scale
    if n.st == 'smoulder' then
        -- Glutnest: nur Rauch
        local st = EC.SmokeTypeById.leicht
        local h = FX.startAt(st, Catalog.SmokeFallback, pos + vector3(0.0, 0.0, 0.3), st.scale * math.max(0.5, n.s))
        if h then handles[#handles + 1] = h end
        scale = 0
    else
        scale = fireScale(n)
        local h = FX.startAt(ft, Catalog.FireFallback, pos, scale)
        if h then handles[#handles + 1] = h end
        local smokeId = n.sm == 'auto' and ft.smoke or (n.sm ~= 'none' and n.sm or nil)
        local st = smokeId and EC.SmokeTypeById[smokeId]
        if st then
            local sh = FX.startAt(st, Catalog.SmokeFallback, pos + vector3(0.0, 0.0, 1.0 + n.s), st.scale * n.s * 0.7)
            if sh then handles[#handles + 1] = sh end
        end
    end
    FireClient.fx[id] = { handles = handles, scale = scale, state = n.st, pos = pos }
end

local function startSmokeFx(id, s, pos)
    local st = EC.SmokeTypeById[s.t] or EC.SmokeTypeById.mittel
    local handles = {}
    for i = 1, (s.d or 1) do
        local off = vector3((i - 1) * 0.6, (i - 1) * -0.4, (i - 1) * 0.8)
        local h = FX.startAt(st, Catalog.SmokeFallback, pos + off, st.scale * s.s)
        if h then handles[#handles + 1] = h end
    end
    FireClient.fx[id] = { handles = handles, state = 'smoke', pos = pos }
end

-- Darstellung regelmaessig an Entfernung und Zustand anpassen
CreateThread(function()
    while true do
        local sleep = 1500
        if next(FireClient.nodes) or next(FireClient.smokes) then
            sleep = 500
            local me = GetEntityCoords(PlayerPedId())
            local viewer = State.open and Cam.pos or me
            local range = Config.Fire.renderDistance

            for id, n in pairs(FireClient.nodes) do
                local pos = worldPos(n)
                local near = #(viewer - pos) <= range
                local f = FireClient.fx[id]
                if near then
                    if not f or f.state ~= n.st or #(f.pos - pos) > 1.0 then
                        stopFx(id)
                        startNodeFx(id, n, pos)
                    elseif n.st == 'burning' then
                        local scale = fireScale(n)
                        if math.abs(scale - f.scale) > 0.02 and f.handles[1] then
                            SetParticleFxLoopedScale(f.handles[1], scale)
                            f.scale = scale
                        end
                    end
                elseif f then
                    stopFx(id)
                end
            end

            for id, s in pairs(FireClient.smokes) do
                local pos = worldPos(s)
                local near = #(viewer - pos) <= range * 1.5
                local f = FireClient.fx[id]
                if near and (not f or #(f.pos - pos) > 1.0) then
                    stopFx(id)
                    startSmokeFx(id, s, pos)
                elseif not near and f then
                    stopFx(id)
                end
            end
        end
        Wait(sleep)
    end
end)

----------------------------------------------------------------------------
-- Netzwerk
----------------------------------------------------------------------------
RegisterNetEvent(EC.Events.fireState, function(data)
    for _, n in ipairs(data.nodes or {}) do
        local old = FireClient.nodes[n.id]
        FireClient.nodes[n.id] = n
        if old and old.st ~= n.st then stopFx(n.id) end
    end
    for _, s in ipairs(data.smokes or {}) do
        FireClient.smokes[s.id] = s
    end
end)

RegisterNetEvent(EC.Events.fireRemove, function(data)
    for _, id in ipairs(data.nodes or {}) do
        FireClient.nodes[id] = nil
        stopFx(id)
    end
    for _, id in ipairs(data.smokes or {}) do
        FireClient.smokes[id] = nil
        stopFx(id)
    end
end)

function FireClient.setAll(state)
    for id in pairs(FireClient.fx) do stopFx(id) end
    FireClient.nodes, FireClient.smokes = {}, {}
    for _, n in ipairs(state.nodes or {}) do FireClient.nodes[n.id] = n end
    for _, s in ipairs(state.smokes or {}) do FireClient.smokes[s.id] = s end
end

----------------------------------------------------------------------------
-- Loescherkennung
----------------------------------------------------------------------------
local function sprayMethod(ped)
    local weapon = GetSelectedPedWeapon(ped)
    local method
    if WATER[weapon] then method = 'water'
    elseif FOAM[weapon] then method = 'foam'
    elseif weapon == EXTINGUISHER and Config.ZHose.allowExtinguisher then method = 'extinguisher'
    else return nil end

    local spraying
    if method ~= 'extinguisher' and zhoseRunning() then
        local ok, using = pcall(function() return exports[Config.ZHose.resource]:IsUsingHose() end)
        spraying = ok and using == true
    else
        spraying = IsPedShooting(ped) or (IsControlPressed(0, 24) and IsPlayerFreeAiming(PlayerId()))
    end
    return method, spraying
end

-- Strahlrichtung: Blickrichtung der Spielkamera, Ursprung an der Waffe
local function sprayRay(ped)
    local rot = GetGameplayCamRot(2)
    local dir = Cam.rotToDir(rot)
    local weaponEnt = GetCurrentPedWeaponEntityIndex(ped)
    local origin
    if weaponEnt and weaponEnt ~= 0 and DoesEntityExist(weaponEnt) then
        origin = GetEntityCoords(weaponEnt)
    else
        origin = GetPedBoneCoords(ped, 57005, 0.0, 0.0, 0.0) -- rechte Hand
    end
    return origin, dir
end

local function nodeHitBy(origin, dir, pos, radius, range)
    local to = pos - origin
    local dist = #to
    if dist > range + radius then return false end
    if dist < radius + 1.0 then return true end
    local cosA = (to.x * dir.x + to.y * dir.y + to.z * dir.z) / dist
    local angle = math.deg(math.acos(U.clamp(cosA, -1.0, 1.0)))
    -- Wasserstrahl faellt ab: vertikal grosszuegiger werten
    local horiz = math.deg(math.acos(U.clamp((to.x * dir.x + to.y * dir.y) /
        math.max(0.001, math.sqrt(to.x ^ 2 + to.y ^ 2) * math.sqrt(dir.x ^ 2 + dir.y ^ 2)), -1.0, 1.0)))
    local allowance = Config.Fire.coneAngle + math.deg(math.atan(radius, dist))
    return horiz <= allowance and angle <= allowance + 25.0
end

CreateThread(function()
    local pending, lastSend = {}, GetGameTimer()
    while true do
        local sleep = 500
        if next(FireClient.nodes) and not State.open then
            local ped = PlayerPedId()
            local method, spraying = sprayMethod(ped)
            if method then
                sleep = 0
                if spraying then
                    local origin, dir = sprayRay(ped)
                    local range = method == 'extinguisher' and Config.Fire.extinguisherRange or Config.Fire.hoseRange
                    local dt = GetFrameTime()
                    for id, n in pairs(FireClient.nodes) do
                        local ft = EC.FireTypeById[n.t] or EC.FireTypeById.normal
                        local pos = worldPos(n)
                        if nodeHitBy(origin, dir, pos, ft.radius * n.s, range) then
                            local e = pending[id]
                            if not e then e = { t = 0.0, m = method } pending[id] = e end
                            e.t = e.t + dt
                            e.m = method
                        end
                    end
                end
                local now = GetGameTimer()
                if now - lastSend >= 250 then
                    lastSend = now
                    if next(pending) then
                        for _, e in pairs(pending) do e.t = math.min(0.5, e.t) end
                        TriggerServerEvent(EC.Events.fireHits, pending)
                        pending = {}
                    end
                end
            end
        end
        Wait(sleep)
    end
end)

-- Spieler in den Flammen nehmen Schaden
CreateThread(function()
    while true do
        local sleep = 1500
        if Config.Fire.playerDamage and next(FireClient.nodes) and not State.open then
            sleep = 500
            local ped = PlayerPedId()
            local me = GetEntityCoords(ped)
            for _, n in pairs(FireClient.nodes) do
                if n.st == 'burning' then
                    local ft = EC.FireTypeById[n.t] or EC.FireTypeById.normal
                    local r = ft.radius * n.s * 0.7
                    if #(me - worldPos(n)) <= r then
                        ApplyDamageToPed(ped, math.ceil(Config.Fire.playerDamagePerSecond / 2), false)
                        break
                    end
                end
            end
        end
        Wait(sleep)
    end
end)

AddEventHandler('onResourceStop', function(res)
    if res ~= GetCurrentResourceName() then return end
    for id in pairs(FireClient.fx) do stopFx(id) end
end)
