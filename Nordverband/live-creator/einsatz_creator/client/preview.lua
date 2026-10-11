--[[
    Vorschau im Editor

    Vorschau-Elemente existieren NUR lokal beim Ersteller (nicht vernetzt).
    Andere Spieler sehen nichts, es wird nichts alarmiert. Beim Schliessen
    oder Verwerfen werden ausschliesslich diese lokalen Elemente entfernt.

    Enthaelt ausserdem die gemeinsamen Helfer LoadModel, FX und DrawText3D.
]]

local U = EC.Utils

----------------------------------------------------------------------------
-- Gemeinsame Helfer
----------------------------------------------------------------------------
function LoadModel(model, timeout)
    local hash = type(model) == 'number' and model or GetHashKey(model)
    if not IsModelInCdimage(hash) or not IsModelValid(hash) then return nil end
    if HasModelLoaded(hash) then return hash end
    RequestModel(hash)
    local deadline = GetGameTimer() + (timeout or 5000)
    while not HasModelLoaded(hash) do
        if GetGameTimer() > deadline then return nil end
        Wait(0)
    end
    return hash
end

function LoadAnimDict(dict, timeout)
    if not DoesAnimDictExist(dict) then return false end
    if HasAnimDictLoaded(dict) then return true end
    RequestAnimDict(dict)
    local deadline = GetGameTimer() + (timeout or 3000)
    while not HasAnimDictLoaded(dict) do
        if GetGameTimer() > deadline then return false end
        Wait(0)
    end
    return true
end

FX = {}

function FX.load(dict)
    if HasNamedPtfxAssetLoaded(dict) then return true end
    RequestNamedPtfxAsset(dict)
    local deadline = GetGameTimer() + 3000
    while not HasNamedPtfxAssetLoaded(dict) do
        if GetGameTimer() > deadline then return false end
        Wait(0)
    end
    return true
end

-- Startet einen Schleifen-Effekt; faellt bei Fehlern auf den Ersatzeffekt zurueck
function FX.startAt(def, fallback, coords, scale)
    local function try(d)
        if not d or not FX.load(d.dict) then return nil end
        UseParticleFxAssetNextCall(d.dict)
        local h = StartParticleFxLoopedAtCoord(d.name, coords.x, coords.y, coords.z, 0.0, 0.0, 0.0, scale, false, false, false, false)
        if h and h ~= 0 then return h end
        return nil
    end
    local h = try(def)
    if not h and fallback then h = try(fallback) end
    return h
end

function FX.stop(handle)
    if handle and DoesParticleFxLoopedExist(handle) then
        StopParticleFxLooped(handle, false)
    end
end

function DrawText3D(pos, text, scale)
    local onScreen, sx, sy = GetScreenCoordFromWorldCoord(pos.x, pos.y, pos.z)
    if not onScreen then return end
    SetTextScale(0.0, scale or 0.3)
    SetTextFont(4)
    SetTextProportional(true)
    SetTextColour(255, 255, 255, 230)
    SetTextOutline()
    SetTextCentre(true)
    BeginTextCommandDisplayText('STRING')
    AddTextComponentSubstringPlayerName(text)
    EndTextCommandDisplayText(sx, sy)
end

----------------------------------------------------------------------------
-- Vorschau-Verwaltung
----------------------------------------------------------------------------
Preview = {
    items = {},       -- elementId -> { kind, entity, model, fx = {}, sig }
    byEntity = {},    -- entity -> elementId
}

local COLORS = {
    fire = { 255, 90, 40 }, smoke = { 160, 160, 160 }, marker = { 255, 200, 40 },
    area = { 255, 60, 60 }, door = { 70, 150, 255 }, spill = { 120, 90, 40 },
    center = { 255, 215, 0 },
}

local function deleteEntity(entity)
    if entity and DoesEntityExist(entity) then
        SetEntityAsMissionEntity(entity, true, true)
        DeleteEntity(entity)
    end
end

local function removeItem(id)
    local item = Preview.items[id]
    if not item then return end
    if item.entity then
        Preview.byEntity[item.entity] = nil
        deleteEntity(item.entity)
    end
    for _, h in ipairs(item.fx or {}) do FX.stop(h) end
    if item.decal then
        RemoveDecalsInRange(item.decal.x, item.decal.y, item.decal.z, item.decal.r)
    end
    Preview.items[id] = nil
end

function Preview.remove(id)
    removeItem(id)
end

function Preview.clear()
    for id in pairs(Preview.items) do removeItem(id) end
    Preview.items, Preview.byEntity = {}, {}
end

function Preview.entityOf(id)
    local item = Preview.items[id]
    return item and item.entity or nil
end

-- Signatur der darstellungsrelevanten Daten (Neuaufbau nur bei Aenderung)
local function signature(el, attachPos)
    local ok, s = pcall(json.encode, { el.model, el.pos, el.rot, el.props, attachPos and { attachPos.x, attachPos.y, attachPos.z } })
    return ok and s or tostring(math.random())
end

local function elementWorldPos(el)
    local p = U.vec(el.pos)
    local pr = el.props or {}
    if pr.attachTo then
        local ent = Preview.entityOf(pr.attachTo)
        if ent and DoesEntityExist(ent) then
            local c = GetEntityCoords(ent)
            return vector3(c.x + pr.offset.x, c.y + pr.offset.y, c.z + pr.offset.z)
        end
    end
    return p
end
Preview.elementWorldPos = elementWorldPos

local function createEntity(el)
    local hash = LoadModel(el.model)
    if not hash then return nil, ('Modell "%s" ist nicht verfuegbar'):format(el.model) end
    local p, r = el.pos, el.rot
    local ent
    if el.kind == 'vehicle' then
        if not IsModelAVehicle(hash) then return nil, ('"%s" ist kein Fahrzeug'):format(el.model) end
        ent = CreateVehicle(hash, p.x, p.y, p.z, r.z, false, false)
    elseif el.kind == 'object' then
        ent = CreateObjectNoOffset(hash, p.x, p.y, p.z, false, false, false)
    elseif el.kind == 'ped' then
        if not IsModelAPed(hash) then return nil, ('"%s" ist kein NPC-Modell'):format(el.model) end
        ent = CreatePed(4, hash, p.x, p.y, p.z + 0.9, r.z, false, false)
    end
    SetModelAsNoLongerNeeded(hash)
    if not ent or ent == 0 then return nil, 'Entity konnte nicht erzeugt werden' end
    SetEntityAsMissionEntity(ent, true, true)
    return ent
end

local function placeEntity(ent, el)
    local p, r = el.pos, el.rot
    if el.kind == 'ped' then
        if el.props.pose == 'fahrzeug' and el.props.vehicleId then
            local veh = Preview.entityOf(el.props.vehicleId)
            if veh and DoesEntityExist(veh) then
                SetPedIntoVehicle(ent, veh, el.props.seat)
            end
        else
            if IsPedInAnyVehicle(ent, false) then
                SetEntityCoordsNoOffset(ent, p.x, p.y, p.z + 0.9, false, false, false)
            end
            SetEntityCoordsNoOffset(ent, p.x, p.y, p.z + 0.9, false, false, false)
            SetEntityHeading(ent, r.z)
        end
        World.setupPed(ent, el.props, true)
        return
    end
    SetEntityCoordsNoOffset(ent, p.x, p.y, p.z, false, false, false)
    SetEntityRotation(ent, r.x, r.y, r.z, 2, true)
    FreezeEntityPosition(ent, true)
    if el.kind == 'vehicle' then
        World.applyVehicle(ent, el.props, true)
    elseif el.kind == 'object' then
        SetEntityCollision(ent, el.props.collision, el.props.collision)
    end
end

--[[
    Element in der Vorschau anlegen oder aktualisieren.
    Rueckgabe: true | false, fehler
]]
function Preview.sync(el)
    local attachPos
    if el.props and el.props.attachTo then
        local ent = Preview.entityOf(el.props.attachTo)
        if ent then attachPos = GetEntityCoords(ent) end
    end
    local sig = signature(el, attachPos)
    local item = Preview.items[el.id]
    if item and item.sig == sig then return true end

    if EC.Kinds[el.kind].entity then
        if item and item.model ~= el.model then
            removeItem(el.id)
            item = nil
        end
        if not item then
            local ent, err = createEntity(el)
            if not ent then return false, err end
            item = { kind = el.kind, entity = ent, model = el.model, fx = {} }
            Preview.items[el.id] = item
            Preview.byEntity[ent] = el.id
        end
        placeEntity(item.entity, el)
        item.sig = sig
        return true
    end

    -- Effekt-/Markierungselemente
    if item then removeItem(el.id) end
    item = { kind = el.kind, fx = {}, sig = sig }
    Preview.items[el.id] = item
    local wp = elementWorldPos(el)

    if el.kind == 'fire' then
        local ft = EC.FireTypeById[el.props.fireType] or EC.FireTypeById.normal
        local h = FX.startAt(ft, Catalog.FireFallback, wp, ft.scale * el.props.size)
        if h then item.fx[#item.fx + 1] = h end
        local smokeId = el.props.smoke == 'auto' and ft.smoke or (el.props.smoke ~= 'none' and el.props.smoke or nil)
        local st = smokeId and EC.SmokeTypeById[smokeId]
        if st then
            local sh = FX.startAt(st, Catalog.SmokeFallback, wp + vector3(0.0, 0.0, 1.0 + el.props.size), st.scale * el.props.size * 0.7)
            if sh then item.fx[#item.fx + 1] = sh end
        end
        if not h then return false, 'Feuereffekt konnte nicht geladen werden' end
    elseif el.kind == 'smoke' then
        local st = EC.SmokeTypeById[el.props.smokeType] or EC.SmokeTypeById.mittel
        for i = 1, el.props.density do
            local off = vector3((i - 1) * 0.6, (i - 1) * -0.4, (i - 1) * 0.8)
            local h = FX.startAt(st, Catalog.SmokeFallback, wp + off, st.scale * el.props.size)
            if h then item.fx[#item.fx + 1] = h end
        end
        if #item.fx == 0 then return false, 'Raucheffekt konnte nicht geladen werden' end
    elseif el.kind == 'spill' then
        AddPetrolDecal(wp.x, wp.y, wp.z, 2.0, el.props.width, 1.0)
        item.decal = { x = wp.x, y = wp.y, z = wp.z, r = el.props.width + 0.5 }
    end
    return true
end

-- Abhaengige Elemente (an Fahrzeug gekoppelt / im Fahrzeug) nachziehen
function Preview.syncDependents(draft, targetId)
    for _, el in ipairs(draft.elements) do
        local pr = el.props or {}
        if pr.attachTo == targetId or pr.vehicleId == targetId then
            Preview.sync(el)
        end
    end
end

-- Alle Elemente eines Szenarios aufbauen (z. B. nach Laden)
function Preview.rebuild(draft)
    Preview.clear()
    local errors = {}
    local order = { vehicle = 1, object = 2, ped = 3 }
    local list = {}
    for _, el in ipairs(draft.elements) do list[#list + 1] = el end
    table.sort(list, function(a, b) return (order[a.kind] or 9) < (order[b.kind] or 9) end)
    for _, el in ipairs(list) do
        local ok, err = Preview.sync(el)
        if not ok then errors[#errors + 1] = err end
    end
    return errors
end

----------------------------------------------------------------------------
-- Zeichnen (jeden Frame, nur im Editor)
----------------------------------------------------------------------------
local function marker(t, p, sx, sy, sz, c, a, rotate)
    DrawMarker(t, p.x, p.y, p.z, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, sx, sy, sz, c[1], c[2], c[3], a, false, false, 2, rotate or false, nil, nil, false)
end

function Preview.draw(selectedId)
    local draft = State.draft
    if not draft then return end
    local camPos = Cam.pos

    if draft.center then
        local c = U.vec(draft.center)
        marker(1, c - vector3(0.0, 0.0, 1.0), 0.6, 0.6, 30.0, COLORS.center, 60)
        marker(2, c + vector3(0.0, 0.0, 2.0), 1.0, 1.0, 1.0, COLORS.center, 200, true)
        if #(camPos - c) < 120.0 then DrawText3D(c + vector3(0.0, 0.0, 3.2), 'Einsatzort', 0.35) end
    end

    -- Ortsvarianten anzeigen
    for i, v in ipairs(draft.variants or {}) do
        local vp = vector3(v.x, v.y, v.z)
        if #(camPos - vp) < 300.0 then
            local h = math.rad(v.h or 0.0)
            local tip = vp + vector3(-math.sin(h), math.cos(h), 0.0) * 4.0
            marker(1, vp - vector3(0.0, 0.0, 1.0), 1.2, 1.2, 4.0, { 120, 200, 255 }, 90)
            DrawLine(vp.x, vp.y, vp.z + 0.5, tip.x, tip.y, tip.z + 0.5, 120, 200, 255, 255)
            DrawText3D(vp + vector3(0.0, 0.0, 3.4), ('Variante %d'):format(i), 0.35)
        end
    end

    for _, el in ipairs(draft.elements) do
        local selected = el.id == selectedId
        local p = elementWorldPos(el)
        local dist = #(camPos - p)
        if dist < 400.0 then
            local k = el.kind
            if k == 'fire' then
                local ft = EC.FireTypeById[el.props.fireType] or EC.FireTypeById.normal
                local r = ft.radius * el.props.size
                marker(25, p + vector3(0.0, 0.0, 0.05), r * 2, r * 2, 1.0, COLORS.fire, selected and 180 or 70)
                if selected and el.props.canSpread then
                    marker(1, p - vector3(0.0, 0.0, 0.5), el.props.spreadRadius * 2, el.props.spreadRadius * 2, 1.0, COLORS.fire, 35)
                    for _, sp in ipairs(el.props.spreadPoints or {}) do
                        marker(28, U.vec(sp) + vector3(0.0, 0.0, 0.1), 0.2, 0.2, 0.2, COLORS.fire, 160)
                    end
                end
            elseif k == 'smoke' then
                marker(28, p + vector3(0.0, 0.0, 0.3), 0.35, 0.35, 0.35, COLORS.smoke, selected and 200 or 90)
            elseif k == 'marker' then
                local kind = EC.MarkerKindById[el.props.markerKind]
                marker(0, p + vector3(0.0, 0.0, 1.2), 0.5, 0.5, 0.5, COLORS.marker, selected and 230 or 140, true)
                if dist < 60.0 then DrawText3D(p + vector3(0.0, 0.0, 1.9), el.label ~= '' and el.label or (kind and kind.label or 'Position')) end
            elseif k == 'area' then
                local r = el.props.radius
                marker(1, p - vector3(0.0, 0.0, 2.0), r * 2, r * 2, 6.0, COLORS.area, selected and 70 or 35)
            elseif k == 'door' then
                marker(0, p + vector3(0.0, 0.0, 0.6), 0.4, 0.4, 0.4, COLORS.door, selected and 230 or 150, true)
                if el.props.doorPos then
                    local dp = U.vec(el.props.doorPos)
                    DrawLine(p.x, p.y, p.z, dp.x, dp.y, dp.z, 70, 150, 255, 200)
                end
                if dist < 40.0 then DrawText3D(p + vector3(0.0, 0.0, 1.2), 'Tuer') end
            elseif k == 'spill' then
                marker(25, p + vector3(0.0, 0.0, 0.05), el.props.width * 2, el.props.width * 2, 1.0, COLORS.spill, selected and 160 or 50)
            end

            -- Auswahl hervorheben
            local item = Preview.items[el.id]
            if item and item.entity and DoesEntityExist(item.entity) then
                if selected ~= item.outlined then
                    SetEntityDrawOutline(item.entity, selected)
                    if selected then SetEntityDrawOutlineColor(255, 200, 40, 255) end
                    item.outlined = selected
                end
            end
            if selected then
                marker(28, p + vector3(0.0, 0.0, (EC.Kinds[k].entity and 2.2 or 1.6)), 0.15, 0.15, 0.15, { 255, 200, 40 }, 255)
            end
        end
    end
end

-- Bildschirmnahes Element fuer Klick-Auswahl (Effekte und Markierungen)
function Preview.pickScreen(nx, ny)
    local draft = State.draft
    if not draft then return nil end
    local best, bestD = nil, 0.025
    for _, el in ipairs(draft.elements) do
        if not EC.Kinds[el.kind].entity then
            local p = elementWorldPos(el)
            if el.kind == 'marker' then p = p + vector3(0.0, 0.0, 1.2) end
            local on, sx, sy = GetScreenCoordFromWorldCoord(p.x, p.y, p.z)
            if on then
                local d = math.sqrt((sx - nx) ^ 2 + (sy - ny) ^ 2)
                if d < bestD then best, bestD = el.id, d end
            end
        end
    end
    return best
end
