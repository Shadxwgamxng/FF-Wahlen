--[[
    Darstellung der Einsatz-Entities in der Welt

    Server-Entities tragen den State-Bag "ec". Der jeweilige Netzwerk-Besitzer
    wendet Unfallschaeden, Warnblinker, NPC-Posen usw. an (wird synchronisiert).
    Rein lokale Effekte (Schadenspakete an NPCs, Kollision, Tueren, Oelspuren)
    wendet jeder Client selbst an.
]]

local U = EC.Utils

World = {
    incidents = {},   -- id -> oeffentlicher Stand (vom Server)
    applied = {},     -- entity -> { owner = bool, local = bool }
    doors = {},       -- doorHash -> true
    decals = {},      -- incidentId:elementId -> { x, y, z, r }
    chips = {},       -- incidentId:elementId -> Saegespaene-Flaeche (Gitter mit Boden-Hoehen)
}

----------------------------------------------------------------------------
-- Fahrzeug-Darstellung (auch fuer die Vorschau)
----------------------------------------------------------------------------
local DEFORM = {
    -- { x, y, z, Schaden, Radius } relativ zum Fahrzeug
    { 0.0, 2.0, 0.2, 260.0, 900.0 },
    { -0.8, 1.6, 0.3, 200.0, 700.0 },
    { 0.8, 1.6, 0.3, 200.0, 700.0 },
    { -1.0, 0.0, 0.3, 180.0, 600.0 },
    { 1.0, 0.0, 0.3, 180.0, 600.0 },
    { 0.0, -2.0, 0.3, 200.0, 700.0 },
    { 0.0, 0.5, 0.9, 160.0, 600.0 },
}

-- skipDamage: Schaeden wurden bereits (von einem frueheren Besitzer) angewendet
function World.applyVehicle(veh, props, isLocal, skipDamage)
    if not DoesEntityExist(veh) then return end
    -- Vorschau: vor erneutem Anwenden zuruecksetzen, damit sich Schaeden nicht aufsummieren
    if isLocal then SetVehicleFixed(veh) end
    SetVehicleHasBeenOwnedByPlayer(veh, false)
    SetVehicleNeedsToBeHotwired(veh, false)
    SetVehicleDoorsLocked(veh, props.locked and 2 or 1)
    if props.engineOff then
        SetVehicleEngineOn(veh, false, true, true)
        SetVehicleUndriveable(veh, true)
    end
    SetVehicleIndicatorLights(veh, 0, props.hazard)
    SetVehicleIndicatorLights(veh, 1, props.hazard)
    SetVehicleLights(veh, props.lights and 2 or 1)
    if props.colour and props.colour >= 0 then SetVehicleColours(veh, props.colour, props.colour) end
    if props.plate and props.plate ~= '' then SetVehicleNumberPlateText(veh, props.plate) end

    if skipDamage then return end
    local level = props.damage or 0
    if level > 0 then
        SetVehicleEngineHealth(veh, math.max(-100.0, 1000.0 - level * 260.0))
        SetVehicleBodyHealth(veh, math.max(100.0, 1000.0 - level * 220.0))
        SetVehicleDirtLevel(veh, math.min(15.0, level * 4.0))
        local count = math.min(#DEFORM, level * 2)
        for i = 1, count do
            local d = DEFORM[i]
            SetVehicleDamage(veh, d[1], d[2], d[3], d[4] * level, d[5], true)
        end
        if level >= 4 then
            SetVehicleDoorBroken(veh, 4, true)
        end
    end
    if props.windowsBroken then
        for i = 0, 7 do SmashVehicleWindow(veh, i) end
    end
    if props.tyresBurst then
        for _, i in ipairs({ 0, 1, 4, 5 }) do SetVehicleTyreBurst(veh, i, true, 1000.0) end
    end
    if props.doorsOpen then
        for i = 0, 3 do SetVehicleDoorOpen(veh, i, false, true) end
    end
end

----------------------------------------------------------------------------
-- NPC-Darstellung
----------------------------------------------------------------------------
function World.playPose(ped, poseId)
    local pose = EC.PoseById[poseId] or EC.PoseById.bewusstlos
    if pose.vehicle then return true end
    if not LoadAnimDict(pose.dict) then
        pose = EC.PoseById.bewusstlos
        if not LoadAnimDict(pose.dict) then return false end
    end
    if not IsEntityPlayingAnim(ped, pose.dict, pose.anim, 3) then
        TaskPlayAnim(ped, pose.dict, pose.anim, 8.0, -8.0, -1, 1, 0, false, false, false)
    end
    return true
end

function World.isPosePlaying(ped, poseId)
    local pose = EC.PoseById[poseId]
    if not pose or pose.vehicle then return true end
    return IsEntityPlayingAnim(ped, pose.dict, pose.anim, 3)
end

function World.setupPed(ped, props, isLocal, state)
    if not DoesEntityExist(ped) then return end
    SetBlockingOfNonTemporaryEvents(ped, true)
    SetPedFleeAttributes(ped, 0, false)
    SetPedCombatAttributes(ped, 17, true)
    SetPedCanRagdoll(ped, false)
    SetPedDiesWhenInjured(ped, false)
    SetPedKeepTask(ped, true)
    SetPedCanBeDraggedOut(ped, false)
    SetPedConfigFlag(ped, 32, false)     -- nicht durch die Scheibe fliegen
    SetPedConfigFlag(ped, 184, true)     -- nicht automatisch Sitz wechseln
    SetEntityInvincible(ped, Config.Rescue.invincible or isLocal)

    local inVehicle = IsPedInAnyVehicle(ped, false)
    local transport = state and (state.st == 'transport' or state.st == 'stretcher')
    if state and state.st == 'stretcher' then World.attachStretcher(ped, state) end
    if not inVehicle and not transport then
        World.playPose(ped, (state and state.pose) or props.pose)
        if isLocal then FreezeEntityPosition(ped, true) end
    end
end

-- Patient auf die Trage legen (Trage = Fahrzeug-Modell, z. B. rda_stretcher)
function World.attachStretcher(ped, state)
    if not state.stretcher or not NetworkDoesNetworkIdExist(state.stretcher) then return end
    local stretcher = NetworkGetEntityFromNetworkId(state.stretcher)
    if not stretcher or stretcher == 0 or not DoesEntityExist(stretcher) then return end
    if IsEntityAttachedToEntity(ped, stretcher) then return end
    FreezeEntityPosition(ped, false)
    ClearPedTasksImmediately(ped)
    if LoadAnimDict('savecouch@') then
        TaskPlayAnim(ped, 'savecouch@', 't_sleep_loop_couch', 8.0, -8.0, -1, 1, 0, false, false, false)
    end
    AttachEntityToEntity(ped, stretcher, 0, 0.0, 0.2, 1.1, 0.0, 0.0, 180.0, false, false, false, false, 2, true)
end

----------------------------------------------------------------------------
-- Live-Entities: Anwenden ueber State-Bag
----------------------------------------------------------------------------
local function applyLive(entity, state)
    if not DoesEntityExist(entity) or type(state) ~= 'table' then return end
    local isOwner = NetworkGetEntityOwner(entity) == PlayerId()
    local rec = World.applied[entity]
    if not rec then
        rec = {}
        World.applied[entity] = rec
    end

    -- rein lokale Darstellung: einmal je Client
    if not rec.localDone then
        rec.localDone = true
        if state.k == 'object' then
            SetEntityCollision(entity, state.p.collision ~= false, state.p.collision ~= false)
        end
    end

    -- synchronisierte Darstellung: nur der Besitzer
    if isOwner and (not rec.ownerDone or rec.stateRef ~= state) then
        rec.ownerDone = true
        rec.stateRef = state
        rec.poseSince = GetGameTimer()
        if state.k == 'vehicle' then
            -- Schaeden nur einmal anwenden (werden mit dem Fahrzeug synchronisiert)
            local done = Entity(entity).state.ecDamage == true
            World.applyVehicle(entity, state.p, false, done)
            if not done then Entity(entity).state:set('ecDamage', true, true) end
        elseif state.k == 'ped' then
            World.setupPed(entity, state.p, false, state)
        end
    elseif not isOwner then
        rec.ownerDone = false
    end

    -- Pose pruefen (Besitzer): liegende NPCs nach kurzer Zeit fixieren, Animation erneuern
    if isOwner and state.k == 'ped' and state.st == 'stretcher' then
        World.attachStretcher(entity, state)
        if not IsEntityPlayingAnim(entity, 'savecouch@', 't_sleep_loop_couch', 3) and LoadAnimDict('savecouch@') then
            TaskPlayAnim(entity, 'savecouch@', 't_sleep_loop_couch', 8.0, -8.0, -1, 1, 0, false, false, false)
        end
    elseif isOwner and state.k == 'ped' and state.st ~= 'transport' and not IsPedInAnyVehicle(entity, false) then
        local pose = state.pose or state.p.pose
        if not World.isPosePlaying(entity, pose) then World.playPose(entity, pose) end
        if rec.poseSince and GetGameTimer() - rec.poseSince > 1500 and not rec.frozen then
            FreezeEntityPosition(entity, true)
            rec.frozen = true
        end
    end
end

AddStateBagChangeHandler('ec', nil, function(bagName, _, value)
    if type(value) ~= 'table' then return end
    CreateThread(function()
        local entity = GetEntityFromStateBagName(bagName)
        local deadline = GetGameTimer() + 2000
        while entity == 0 and GetGameTimer() < deadline do
            Wait(100)
            entity = GetEntityFromStateBagName(bagName)
        end
        if entity ~= 0 then
            local rec = World.applied[entity]
            if rec then rec.ownerDone = false rec.frozen = false end
            if value.st == 'freed' or value.st == 'transport' or value.st == 'stretcher' then
                if NetworkGetEntityOwner(entity) == PlayerId() then
                    FreezeEntityPosition(entity, false)
                    if value.st == 'transport' and IsEntityAttached(entity) then DetachEntity(entity, true, false) end
                end
            end
            applyLive(entity, value)
        end
    end)
end)

-- Regelmaessige Pruefung bekannter Einsatz-Entities in der Naehe
CreateThread(function()
    while true do
        local any = false
        for _, inc in pairs(World.incidents) do
            any = true
            for _, net in ipairs(inc.nets or {}) do
                if NetworkDoesNetworkIdExist(net) then
                    local ent = NetworkGetEntityFromNetworkId(net)
                    if ent and ent ~= 0 and DoesEntityExist(ent) then
                        local state = Entity(ent).state.ec
                        if type(state) == 'table' and state.i == inc.id then applyLive(ent, state) end
                    end
                end
            end
        end
        -- veraltete Eintraege aufraeumen
        for ent in pairs(World.applied) do
            if not DoesEntityExist(ent) then World.applied[ent] = nil end
        end
        Wait(any and 1000 or 3000)
    end
end)

----------------------------------------------------------------------------
-- Tueren (GTA-Tuersystem) und Betriebsstoffe (Decals)
----------------------------------------------------------------------------
local function doorHash(incidentId, doorId)
    return GetHashKey(('ec_%s_%s'):format(incidentId, doorId))
end

local function applyDoors(inc)
    if not Config.Doors.useDoorSystem then return end
    for id, d in pairs(inc.rescue and inc.rescue.doors or {}) do
        if d.model and d.model ~= 0 and d.dpos and d.lock then
            local hash = doorHash(inc.id, id)
            if not World.doors[hash] then
                AddDoorToSystem(hash, d.model, d.dpos.x, d.dpos.y, d.dpos.z, false, false, false)
                World.doors[hash] = true
            end
            DoorSystemSetDoorState(hash, d.s == 'verschlossen' and 1 or 0, false, true)
        end
    end
end

local function removeDoors(inc)
    for id in pairs(inc.rescue and inc.rescue.doors or {}) do
        local hash = doorHash(inc.id, id)
        if World.doors[hash] then
            DoorSystemSetDoorState(hash, 0, false, true)
            RemoveDoorFromSystem(hash)
            World.doors[hash] = nil
        end
    end
end

-- Oelflecken: Modelle aus technical_dispatches_objects (oelfleck / abgestreut), sonst Decal
World.spillProps = World.spillProps or {}
local function oilModel(status, width)
    local list = Config.Tools and Config.Tools.oilProps and Config.Tools.oilProps[status]
    if not list or GetResourceState(Config.Tools.objectsResource or 'technical_dispatches_objects') ~= 'started' then return nil end
    local idx = width < 2.0 and 1 or width < 3.5 and 2 or width < 5.0 and 3 or 4
    local hash = GetHashKey(list[math.min(idx, #list)])
    return IsModelInCdimage(hash) and hash or nil
end

local function setSpillProp(key, s)
    local cur = World.spillProps[key]
    local hash = s.s ~= 'beseitigt' and oilModel(s.s, s.w or 2.5) or nil
    if cur and cur.hash == hash then return hash ~= nil end
    if cur then if DoesEntityExist(cur.obj) then DeleteEntity(cur.obj) end World.spillProps[key] = nil end
    if not hash then return false end
    RequestModel(hash)
    local t = GetGameTimer() + 3000
    while not HasModelLoaded(hash) and GetGameTimer() < t do Wait(10) end
    if not HasModelLoaded(hash) then return false end
    local obj = CreateObject(hash, s.pos.x, s.pos.y, s.pos.z, false, false, false)
    SetEntityHeading(obj, s.r or 0.0)
    PlaceObjectOnGroundProperly(obj)
    FreezeEntityPosition(obj, true)
    SetEntityCollision(obj, false, false)
    SetModelAsNoLongerNeeded(hash)
    World.spillProps[key] = { obj = obj, hash = hash }
    return true
end

local function applySpills(inc)
    for id, s in pairs(inc.rescue and inc.rescue.spills or {}) do
        local key = inc.id .. ':' .. id
        local hasProp = setSpillProp(key, s)
        local wantDecal = s.s ~= 'beseitigt' and not hasProp
        if wantDecal and not World.decals[key] then
            AddPetrolDecal(s.pos.x, s.pos.y, s.pos.z, 2.0, s.w, 1.0)
            World.decals[key] = { x = s.pos.x, y = s.pos.y, z = s.pos.z, r = s.w + 0.5 }
        elseif not wantDecal and World.decals[key] then
            local d = World.decals[key]
            RemoveDecalsInRange(d.x, d.y, d.z, d.r)
            World.decals[key] = nil
        end
    end
end

local function removeSpills(incidentId)
    for key, d in pairs(World.decals) do
        if key:sub(1, #incidentId + 1) == incidentId .. ':' then
            RemoveDecalsInRange(d.x, d.y, d.z, d.r)
            World.decals[key] = nil
        end
    end
    for key, p in pairs(World.spillProps) do
        if key:sub(1, #incidentId + 1) == incidentId .. ':' then
            if DoesEntityExist(p.obj) then DeleteEntity(p.obj) end
            World.spillProps[key] = nil
        end
    end
end

----------------------------------------------------------------------------
-- Saegespaene nach dem Zersaegen eines Baums (Textur auf dem Boden)
----------------------------------------------------------------------------
local CHIP_TXD, CHIP_TXN = 'ec_chips', 'saegespaene'
local chipTexture = false
local function ensureChipTexture()
    if chipTexture then return true end
    local txd = CreateRuntimeTxd(CHIP_TXD)
    chipTexture = CreateRuntimeTextureFromImage(txd, CHIP_TXN, 'html/img/saegespaene.png') ~= nil
    return chipTexture
end

local CHIP_NX, CHIP_NY = 7, 3   -- Gitter folgt dem Gelaende

-- Abmessungen des liegenden Baums merken (Spaene liegen spaeter entlang des Stamms)
World.treeShape = {}
local function rememberTree(key, t)
    if World.treeShape[key] or not t.net or not NetworkDoesNetworkIdExist(t.net) then return end
    local ent = NetworkGetEntityFromNetworkId(t.net)
    if not ent or ent == 0 or not DoesEntityExist(ent) then return end
    local mn, mx = GetModelDimensions(GetEntityModel(ent))
    local c = GetEntityCoords(ent)
    local sx, sy = mx.x - mn.x, mx.y - mn.y
    local off = GetOffsetFromEntityInWorldCoords(ent, (mn.x + mx.x) / 2, (mn.y + mx.y) / 2, 0.0)
    World.treeShape[key] = {
        pos = vector3(off.x, off.y, c.z),
        h = GetEntityHeading(ent) + (sy > sx and 90.0 or 0.0),   -- Laengsachse auf lokale X-Achse drehen
        len = math.max(sx, sy),
        wid = math.min(sx, sy),
    }
end

-- Gitterpunkte einmalig berechnen (Bodenhoehe je Punkt)
local function buildChips(t, shape)
    local cfg = Config.Trees.chips
    local c = shape and shape.pos or U.vec(t.pos)
    local h = math.rad(shape and shape.h or t.h or 0.0)
    local len = shape and math.min(math.max(shape.len * 0.8, 3.0), cfg.length * 1.5) or cfg.length
    local wid = shape and math.max(shape.wid + 1.5, cfg.width * 0.8) or cfg.width
    local rx, ry = math.cos(h), math.sin(h)    -- lokale X-Achse (Stamm)
    local fx, fy = -math.sin(h), math.cos(h)   -- lokale Y-Achse
    local grid = {}
    for i = 0, CHIP_NX do
        grid[i] = {}
        for j = 0, CHIP_NY do
            local a = (i / CHIP_NX - 0.5) * len
            local b = (j / CHIP_NY - 0.5) * wid
            local x, y = c.x + rx * a + fx * b, c.y + ry * a + fy * b
            local ok, gz = GetGroundZFor_3dCoord(x, y, c.z + 2.0, false)
            if not ok or math.abs(gz - c.z) > 3.0 then gz = c.z end
            grid[i][j] = { x, y, gz + 0.03, i / CHIP_NX, j / CHIP_NY }
        end
    end
    return { center = vector3(c.x, c.y, c.z), grid = grid }
end

local function tri(a, b, c, alpha)
    DrawSpritePoly(a[1], a[2], a[3], b[1], b[2], b[3], c[1], c[2], c[3], 255, 255, 255, alpha,
        CHIP_TXD, CHIP_TXN, a[4], a[5], 1.0, b[4], b[5], 1.0, c[4], c[5], 1.0)
end

local function drawChips(ch)
    local g = ch.grid
    for i = 0, CHIP_NX - 1 do
        for j = 0, CHIP_NY - 1 do
            local p1, p2, p3, p4 = g[i][j], g[i + 1][j], g[i + 1][j + 1], g[i][j + 1]
            -- beide Umlaufrichtungen, damit die Flaeche von oben immer sichtbar ist
            tri(p1, p2, p3, 255) tri(p1, p3, p4, 255)
            tri(p3, p2, p1, 255) tri(p4, p3, p1, 255)
        end
    end
end

local chipThread = false
local function startChipThread()
    if chipThread then return end
    chipThread = true
    CreateThread(function()
        while next(World.chips) do
            local me = GetEntityCoords(PlayerPedId())
            local dist = Config.Trees.chips.drawDistance or 60.0
            local any = false
            for _, ch in pairs(World.chips) do
                if #(me - ch.center) < dist then
                    any = true
                    drawChips(ch)
                end
            end
            Wait(any and 0 or 750)
        end
        chipThread = false
    end)
end

local function applyChips(inc)
    if not (Config.Trees.chips and Config.Trees.chips.enabled) then return end
    if not (inc.rescue and inc.rescue.trees) then return end
    for id, t in pairs(inc.rescue and inc.rescue.trees or {}) do
        local key = inc.id .. ':' .. id
        if t.s == 'liegt' then
            rememberTree(key, t)
            World.chips[key] = nil
        elseif t.s == 'gesaegt' then
            if not World.chips[key] and ensureChipTexture() then
                World.chips[key] = buildChips(t, World.treeShape[key])
            end
        else
            World.chips[key] = nil
            World.treeShape[key] = nil
        end
    end
    if next(World.chips) then startChipThread() end
end

-- liegende Baeume sind evtl. erst spaeter gestreamt: Form nachtraeglich merken
CreateThread(function()
    while true do
        Wait(2000)
        for incId, inc in pairs(World.incidents) do
            for id, t in pairs(inc.rescue and inc.rescue.trees or {}) do
                if t.s == 'liegt' then rememberTree(incId .. ':' .. id, t) end
            end
        end
    end
end)

local function removeChips(incidentId)
    for key in pairs(World.chips) do
        if key:sub(1, #incidentId + 1) == incidentId .. ':' then World.chips[key] = nil end
    end
    for key in pairs(World.treeShape) do
        if key:sub(1, #incidentId + 1) == incidentId .. ':' then World.treeShape[key] = nil end
    end
end

function World.updateIncident(inc)
    -- inc.nets: Netzwerk-IDs aller Einsatz-Entities (vom Server)
    inc.nets = inc.nets or {}
    World.incidents[inc.id] = inc
    applyDoors(inc)
    applySpills(inc)
    applyChips(inc)
end

function World.removeIncident(id)
    local inc = World.incidents[id]
    if inc then removeDoors(inc) end
    removeSpills(id)
    removeChips(id)
    World.incidents[id] = nil
end

AddEventHandler('onResourceStop', function(res)
    if res ~= GetCurrentResourceName() then return end
    for id in pairs(World.incidents) do World.removeIncident(id) end
end)
