--[[
    Editor: Werkzeuge, Platzierung, Auswahl, Bearbeitung, Speichern, Ausloesen

    Werkzeuge (Editor.tool.name):
      select      Elemente anklicken und auswaehlen
      place       Element aus Vorlage setzen (bleibt aktiv fuer weitere Elemente)
      move        ausgewaehltes Element mit der Maus verschieben
      center      Einsatzort (Hauptposition) festlegen
      line        Absperrlinie: Start- und Endpunkt anklicken
      door        Tuer anklicken (echte Kartentuer wird erkannt)
      pickTarget  Feuer/Rauch an Fahrzeug/Objekt koppeln
      pickVehicle NPC in ein Fahrzeug setzen
]]

local U = EC.Utils
local Schema = EC.Schema

Editor = {
    tool = { name = 'select' },
    ghost = nil,           -- { entity, model, hash, min, max }
    cursorHit = nil,       -- letzte Welttrefferposition
    lastStatus = 0,
    stateQueued = false,
    previewHidden = false,
    scenarios = {},
}

local ENTITY_KINDS = { vehicle = true, object = true, ped = true }

----------------------------------------------------------------------------
-- Katalog fuer die Oberflaeche (inkl. Verfuegbarkeit der Modelle)
----------------------------------------------------------------------------
local function availability(list, check)
    local out = {}
    for _, cat in ipairs(list) do
        local models = {}
        for _, m in ipairs(cat.models) do
            local hash = GetHashKey(m)
            local ok = IsModelInCdimage(hash) and check(hash)
            models[#models + 1] = { model = m, ok = ok }
        end
        out[#out + 1] = { label = cat.label, models = models }
    end
    return out
end

function Editor.catalogPayload()
    return {
        categories = Catalog.Categories,
        priorities = Catalog.Priorities,
        units = Catalog.Units,
        vehicles = availability(Catalog.Vehicles, IsModelAVehicle),
        props = availability(Catalog.Props, function(h) return not IsModelAVehicle(h) and not IsModelAPed(h) end),
        peds = availability(Catalog.Peds, IsModelAPed),
        poses = Catalog.Poses,
        injuries = Catalog.Injuries,
        severities = Catalog.Severities,
        consciousness = Catalog.Consciousness,
        mobility = Catalog.Mobility,
        fireTypes = Catalog.FireTypes,
        smokeTypes = Catalog.SmokeTypes,
        markerKinds = Catalog.MarkerKinds,
        areaKinds = Catalog.AreaKinds,
        spillKinds = Catalog.SpillKinds,
        damageLevels = Catalog.DamageLevels,
        medical = {
            enabled = Config.Medical.enabled,
            profiles = (function()
                local out = { { id = 'none', label = 'Kein Meldebild (Werte manuell)', variants = {} } }
                for _, pr in ipairs(Medical.Profiles) do
                    local vs = {}
                    for i, v in ipairs(pr.variants) do vs[i] = v.label end
                    out[#out + 1] = { id = pr.id, label = pr.label, variants = vs, keyword = pr.keyword }
                end
                return out
            end)(),
            bodyParts = Medical.BodyParts,
        },
        kinds = EC.Kinds,
        defaults = {
            vehicle = Schema.Defaults.vehicle(), object = Schema.Defaults.object(), ped = Schema.Defaults.ped(),
            fire = Schema.Defaults.fire(), smoke = Schema.Defaults.smoke(), marker = Schema.Defaults.marker(),
            area = Schema.Defaults.area(), door = Schema.Defaults.door(), spill = Schema.Defaults.spill(),
        },
    }
end

----------------------------------------------------------------------------
-- Hilfsfunktionen
----------------------------------------------------------------------------
local TRAILER_WORDS = { 'trailer', 'tanker', 'tr2', 'tr3', 'tr4', 'trflat' }

function Editor.vehicleType(model)
    local hash = GetHashKey(model)
    if IsThisModelABike(hash) or IsThisModelABicycle(hash) then return 'bike' end
    if IsThisModelABoat(hash) or IsThisModelAJetski(hash) then return 'boat' end
    if IsThisModelAHeli(hash) then return 'heli' end
    if IsThisModelAPlane(hash) then return 'plane' end
    if IsThisModelATrain(hash) then return 'train' end
    local m = model:lower()
    for _, w in ipairs(TRAILER_WORDS) do
        if m:find(w, 1, true) then return 'trailer' end
    end
    return 'automobile'
end

function Editor.checkModel(model, kind)
    if not U.isModelName(model) then return false, 'Ungueltiger Modellname' end
    local hash = GetHashKey(model)
    if not IsModelInCdimage(hash) or not IsModelValid(hash) then return false, ('Modell "%s" ist nicht verfuegbar'):format(model) end
    if kind == 'vehicle' and not IsModelAVehicle(hash) then return false, ('"%s" ist kein Fahrzeug'):format(model) end
    if kind == 'ped' and not IsModelAPed(hash) then return false, ('"%s" ist kein NPC-Modell'):format(model) end
    if kind == 'object' and (IsModelAVehicle(hash) or IsModelAPed(hash)) then return false, ('"%s" ist kein Objekt'):format(model) end
    return true
end

local function addressAt(p)
    local s1, s2 = GetStreetNameAtCoord(p.x, p.y, p.z)
    local street = GetStreetNameFromHashKey(s1)
    local cross = s2 ~= 0 and GetStreetNameFromHashKey(s2) or nil
    local zone = GetLabelText(GetNameOfZone(p.x, p.y, p.z))
    local out = street ~= '' and street or 'Unbekannte Strasse'
    if cross and cross ~= '' then out = out .. ' / ' .. cross end
    if zone and zone ~= '' and zone ~= 'NULL' then out = out .. ', ' .. zone end
    return out
end
Editor.addressAt = addressAt

local function countKind(kind)
    local n = 0
    for _, el in ipairs(State.draft.elements) do if el.kind == kind then n = n + 1 end end
    return n
end

local function findEl(id)
    return U.findById(State.draft.elements, id)
end

function Editor.markDirty()
    State.dirty = true
    Editor.queueState()
end

function Editor.queueState()
    Editor.stateQueued = true
end

function Editor.pushState()
    Editor.stateQueued = false
    NUI.send('state', {
        draft = State.draft,
        selected = State.selected,
        dirty = State.dirty,
        meta = State.meta,
        tool = Editor.toolInfo(),
        previewHidden = Editor.previewHidden,
    })
end

function Editor.toolInfo()
    local t = Editor.tool
    return { name = t.name, kind = t.kind, model = t.template and t.template.model, step = t.lineStart and 2 or 1 }
end

----------------------------------------------------------------------------
-- Entwurf
----------------------------------------------------------------------------
function Editor.newDraft(silent)
    Cam.anchorOverride = nil
    Preview.clear()
    Editor.setTool({ name = 'select' })
    State.draft = Schema.newScenario(Catalog.Categories[1].id)
    State.meta = nil
    State.selected = nil
    State.dirty = false
    Editor.previewHidden = false
    if not silent then Editor.pushState() end
end

function Editor.loadScenario(sc, meta)
    Cam.anchorOverride = nil
    Editor.setTool({ name = 'select' })
    State.draft = sc
    State.meta = meta
    State.selected = nil
    State.dirty = false
    Editor.previewHidden = false
    if sc.center then Cam.focusOn(sc.center, 30.0) end
    -- kurz warten, damit die Umgebung um die Kamera laedt
    Wait(500)
    local errors = Preview.rebuild(sc)
    Editor.pushState()
    return errors
end

----------------------------------------------------------------------------
-- Elemente
----------------------------------------------------------------------------
-- Ausbreitungspunkte fuer Feuer per Raycast auf den Boden bestimmen
function Editor.computeSpread(el)
    local pr = el.props
    pr.spreadPoints = {}
    if not pr.canSpread or pr.maxSpread <= 0 or pr.attachTo then return end
    local base = U.vec(el.pos)
    local attempts = 0
    while #pr.spreadPoints < math.min(pr.maxSpread, 20) and attempts < pr.maxSpread * 4 do
        attempts = attempts + 1
        local a = math.random() * math.pi * 2
        local d = 1.5 + math.random() * math.max(0.5, pr.spreadRadius - 1.5)
        local probe = vector3(base.x + math.cos(a) * d, base.y + math.sin(a) * d, base.z + 2.0)
        local g = Cam.groundAt(probe)
        if g and math.abs(g.z - base.z) < 6.0 then
            pr.spreadPoints[#pr.spreadPoints + 1] = U.xyz(g)
        end
    end
end

local function normalize(el)
    local center = State.draft.center
    local res, err = Schema.normalizeElement(el, center)
    return res, err
end

function Editor.addElement(raw)
    local draft = State.draft
    local kind = raw.kind
    if not EC.Kinds[kind] then return false, 'Unbekannte Elementart' end
    if countKind(kind) >= (Config.Limits[kind] or 999) then
        return false, ('Grenze erreicht: maximal %d x %s'):format(Config.Limits[kind], EC.Kinds[kind].label)
    end
    if #draft.elements >= Config.Limits.total then return false, 'Maximale Anzahl Elemente erreicht' end
    if ENTITY_KINDS[kind] then
        local ok, err = Editor.checkModel(raw.model, kind)
        if not ok then return false, err end
        if kind == 'vehicle' then
            raw.props = raw.props or {}
            raw.props.vehType = raw.props.vehTypeManual and raw.props.vehType or Editor.vehicleType(raw.model)
        end
    end
    if not draft.center then
        draft.center = U.xyz(U.vec(raw.pos))
        if draft.info.address == '' then draft.info.address = addressAt(draft.center) end
        NUI.toast('info', 'Einsatzort wurde automatisch auf das erste Element gesetzt')
    end
    raw.id = U.randomId('', 8)
    local el, err = normalize(raw)
    if not el then return false, err end
    if el.kind == 'fire' then Editor.computeSpread(el) end
    local ok, perr = Preview.sync(el)
    if not ok and ENTITY_KINDS[kind] then
        Preview.remove(el.id)
        return false, perr
    end
    draft.elements[#draft.elements + 1] = el
    Editor.markDirty()
    if not ok then NUI.toast('warn', perr) end
    return true, el
end

function Editor.updateElement(id, raw)
    local el, idx = findEl(id)
    if not el then return false, 'Element nicht gefunden' end
    raw.id, raw.kind = el.id, el.kind
    if ENTITY_KINDS[el.kind] and raw.model ~= el.model then
        local ok, err = Editor.checkModel(raw.model, el.kind)
        if not ok then return false, err end
        if el.kind == 'vehicle' and not (raw.props and raw.props.vehTypeManual) then
            raw.props.vehType = Editor.vehicleType(raw.model)
        end
    end
    local new, err = normalize(raw)
    if not new then return false, err end
    if new.kind == 'fire' then
        local a, b = el.props, new.props
        if a.canSpread ~= b.canSpread or a.spreadRadius ~= b.spreadRadius or a.maxSpread ~= b.maxSpread
            or U.dist(el.pos, new.pos) > 0.3 or a.attachTo ~= b.attachTo or #b.spreadPoints == 0 then
            Editor.computeSpread(new)
        end
    end
    -- Kopplung an Fahrzeug: Offset aus aktueller Position bestimmen
    if (new.kind == 'fire' or new.kind == 'smoke') and new.props.attachTo and new.props.attachTo ~= el.props.attachTo then
        local target = findEl(new.props.attachTo)
        if target then
            new.props.offset = { x = new.pos.x - target.pos.x, y = new.pos.y - target.pos.y, z = new.pos.z - target.pos.z }
        end
    end
    State.draft.elements[idx] = new
    local ok, perr = Preview.sync(new)
    Preview.syncDependents(State.draft, new.id)
    Editor.markDirty()
    if not ok then return false, perr end
    return true, new
end

function Editor.deleteElement(id)
    local el, idx = findEl(id)
    if not el then return false, 'Element nicht gefunden' end
    table.remove(State.draft.elements, idx)
    Preview.remove(id)
    -- Verweise entfernen
    for _, other in ipairs(State.draft.elements) do
        local p = other.props
        local changed = false
        if p.attachTo == id then
            p.attachTo = nil
            other.pos = U.xyz(Preview.elementWorldPos(other))
            changed = true
        end
        if p.vehicleId == id then
            p.vehicleId = nil
            p.pose = 'bewusstlos'
            changed = true
        end
        if p.linked then
            for i = #p.linked, 1, -1 do
                if p.linked[i] == id then table.remove(p.linked, i) changed = true end
            end
        end
        if changed then Preview.sync(other) end
    end
    if State.selected == id then State.selected = nil end
    Editor.markDirty()
    return true
end

function Editor.duplicateElement(id)
    local el = findEl(id)
    if not el then return false, 'Element nicht gefunden' end
    local copy = U.deepcopy(el)
    local right = vector3(math.cos(math.rad(Cam.rot.z)), math.sin(math.rad(Cam.rot.z)), 0.0)
    local p = U.vec(el.pos) + right * (el.kind == 'vehicle' and 3.0 or 1.5)
    if el.kind ~= 'area' then
        local g = Cam.groundAt(p)
        if g then
            local dz = el.pos.z - (Cam.groundAt(U.vec(el.pos)) or U.vec(el.pos)).z
            p = vector3(p.x, p.y, g.z + dz)
        end
    end
    copy.pos = U.xyz(p)
    if copy.props.attachTo then copy.props.attachTo = nil end
    if copy.kind == 'ped' and copy.props.vehicleId then
        copy.props.vehicleId = nil
        copy.props.pose = 'bewusstlos'
    end
    local ok, res = Editor.addElement(copy)
    if ok then State.selected = res.id end
    return ok, res
end

function Editor.select(id)
    State.selected = id
    Editor.queueState()
end

function Editor.focusElement(id)
    local el = findEl(id)
    if not el then return false end
    local dist = el.kind == 'area' and math.max(15.0, el.props.radius * 1.5) or (el.kind == 'vehicle' and 9.0 or 6.0)
    Cam.focusOn(Preview.elementWorldPos(el), dist)
    return true
end

-- Auf Bodenhoehe setzen (nutzt GTA-Platzierung der Vorschau-Entity)
function Editor.snapToGround(id)
    local el = findEl(id)
    if not el then return false, 'Element nicht gefunden' end
    local ent = Preview.entityOf(id)
    local copy = U.deepcopy(el)
    if ent and el.kind == 'vehicle' then
        FreezeEntityPosition(ent, false)
        SetVehicleOnGroundProperly(ent)
        local c, r = GetEntityCoords(ent), GetEntityRotation(ent, 2)
        FreezeEntityPosition(ent, true)
        copy.pos = U.xyz(c)
        copy.rot = { x = r.x, y = r.y, z = r.z }
    elseif ent and el.kind == 'object' then
        PlaceObjectOnGroundProperly(ent)
        local c, r = GetEntityCoords(ent), GetEntityRotation(ent, 2)
        copy.pos = U.xyz(c)
        copy.rot = { x = r.x, y = r.y, z = r.z }
    else
        local g = Cam.groundAt(U.vec(el.pos) + vector3(0.0, 0.0, 1.0))
        if not g then return false, 'Bodenposition konnte nicht ermittelt werden' end
        copy.pos = U.xyz(g)
    end
    return Editor.updateElement(id, copy)
end

----------------------------------------------------------------------------
-- Werkzeuge
----------------------------------------------------------------------------
local function deleteGhost()
    local g = Editor.ghost
    if g and g.entity and DoesEntityExist(g.entity) then
        SetEntityAsMissionEntity(g.entity, true, true)
        DeleteEntity(g.entity)
    end
    Editor.ghost = nil
end

local function createGhost(kind, model)
    deleteGhost()
    local hash = LoadModel(model)
    if not hash then return false end
    local p = Cam.pos + Cam.rotToDir(Cam.rot) * 10.0
    local ent
    if kind == 'vehicle' then
        ent = CreateVehicle(hash, p.x, p.y, p.z, 0.0, false, false)
    elseif kind == 'ped' then
        ent = CreatePed(4, hash, p.x, p.y, p.z, 0.0, false, false)
        if ent and ent ~= 0 then
            SetBlockingOfNonTemporaryEvents(ent, true)
            SetEntityInvincible(ent, true)
        end
    else
        ent = CreateObjectNoOffset(hash, p.x, p.y, p.z, false, false, false)
    end
    SetModelAsNoLongerNeeded(hash)
    if not ent or ent == 0 then return false end
    SetEntityAsMissionEntity(ent, true, true)
    SetEntityAlpha(ent, 170, false)
    SetEntityCollision(ent, false, false)
    FreezeEntityPosition(ent, true)
    local min, max = GetModelDimensions(hash)
    Editor.ghost = { entity = ent, model = model, hash = hash, min = min, max = max, kind = kind }
    return true
end

-- Werkzeug wechseln. Bei "move" wird die Ausgangslage gemerkt (Esc = zuruecksetzen).
function Editor.setTool(tool)
    -- laufendes Verschieben verwerfen
    if Editor.tool.name == 'move' and Editor.tool.original then
        local el = findEl(Editor.tool.id)
        if el then
            el.pos = Editor.tool.original.pos
            el.rot = Editor.tool.original.rot
            Preview.sync(el)
            Preview.syncDependents(State.draft, el.id)
        end
    end
    deleteGhost()
    Editor.tool = tool or { name = 'select' }
    local t = Editor.tool

    if t.name == 'place' or t.name == 'line' then
        t.template = t.template or {}
        t.template.rot = t.template.rot or { x = 0.0, y = 0.0, z = 0.0 }
        t.template.props = t.template.props or {}
        if ENTITY_KINDS[t.kind] then
            local ok, err = Editor.checkModel(t.template.model, t.kind)
            if not ok then
                Editor.tool = { name = 'select' }
                Editor.queueState()
                return false, err
            end
            if not createGhost(t.kind, t.template.model) then
                Editor.tool = { name = 'select' }
                Editor.queueState()
                return false, 'Modell konnte nicht geladen werden'
            end
        end
    elseif t.name == 'move' then
        local el = findEl(t.id)
        if not el then Editor.tool = { name = 'select' } return false, 'Element nicht gefunden' end
        t.original = { pos = U.deepcopy(el.pos), rot = U.deepcopy(el.rot) }
        t.rot = U.deepcopy(el.rot)
        if el.props.attachTo or (el.kind == 'ped' and el.props.vehicleId) then
            Editor.tool = { name = 'select' }
            return false, 'Gekoppelte Elemente werden mit dem Fahrzeug/Objekt verschoben'
        end
    end
    Editor.queueState()
    return true
end

-- Platzierungsposition fuer ein Modell auf einer Trefferposition
local function placementPos(kind, hit, ghost, zOffset)
    local z = hit.z
    if ghost and (kind == 'vehicle' or kind == 'object') then
        z = hit.z - ghost.min.z
    end
    return vector3(hit.x, hit.y, z + (zOffset or 0.0))
end

local function cursorHit()
    local nx, ny = Cam.cursor()
    local ignore = 0
    if Editor.ghost then ignore = Editor.ghost.entity end
    if Editor.tool.name == 'move' then ignore = Preview.entityOf(Editor.tool.id) or 0 end
    local hit, coords, normal, entity = Cam.raycast(nx, ny, ignore, -1)
    return hit, coords, entity, nx, ny
end

local HINTS = {
    select = 'Linksklick: auswaehlen | Entf: loeschen | G: verschieben | F: Kamera hin | Strg+D: duplizieren',
    place = 'Linksklick: setzen | Mausrad: drehen | Shift+Rad: Groesse | Strg+Rad: Hoehe | Esc: beenden',
    move = 'Linksklick: ablegen | Mausrad: drehen | Strg+Rad: Hoehe | Esc: abbrechen',
    center = 'Linksklick: Einsatzort festlegen | Esc: abbrechen',
    line = 'Linksklick: Startpunkt, dann Endpunkt | Mausrad: Abstand | Esc: abbrechen',
    door = 'Linksklick auf eine Tuer (echte Kartentuer wird erkannt) | Esc: abbrechen',
    pickTarget = 'Fahrzeug oder Objekt anklicken, an das gekoppelt werden soll | Esc: abbrechen',
    pickVehicle = 'Fahrzeug anklicken, in dem der NPC sitzen soll | Esc: abbrechen',
    variant = 'Linksklick: Ortsvariante setzen | Mausrad: Ausrichtung drehen | Esc: beenden',
}

-- Jeden Frame
function Editor.frame()
    local t = Editor.tool
    local hit, coords, entity = false, nil, nil
    if not State.inputFocused then
        hit, coords, entity = cursorHit()
    end
    Editor.cursorHit = hit and coords or nil

    if hit and (t.name == 'place' or t.name == 'move') then
        local kind = t.kind
        local el
        if t.name == 'move' then
            el = findEl(t.id)
            kind = el and el.kind
        end
        if kind then
            local ghost = Editor.ghost
            if t.name == 'move' and el and ENTITY_KINDS[kind] then
                local ent = Preview.entityOf(el.id)
                if ent then
                    local min = GetModelDimensions(GetEntityModel(ent))
                    ghost = { entity = ent, min = min }
                end
            end
            local zOff = t.name == 'move' and (t.zOffset or 0.0) or (t.template.zOffset or 0.0)
            local p = placementPos(kind, coords, ghost, zOff)
            local rot = t.name == 'move' and t.rot or t.template.rot
            t.current = p
            if ghost and ghost.entity and DoesEntityExist(ghost.entity) then
                local gz = kind == 'ped' and p.z + 0.9 or p.z
                SetEntityCoordsNoOffset(ghost.entity, p.x, p.y, gz, false, false, false)
                SetEntityRotation(ghost.entity, rot.x, rot.y, rot.z, 2, true)
            else
                -- Markierung fuer Effekte/Positionen
                local size = (t.template and t.template.props and (t.template.props.radius or t.template.props.width or t.template.props.size)) or 1.0
                if t.name == 'move' and el then size = el.props.radius or el.props.width or el.props.size or 1.0 end
                local r = kind == 'area' and size or math.max(0.4, size * 0.8)
                DrawMarker(25, p.x, p.y, p.z + 0.05, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, r * 2, r * 2, 1.0, 255, 200, 40, 160, false, false, 2, false, nil, nil, false)
                DrawMarker(28, p.x, p.y, p.z + 0.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.25, 0.25, 0.25, 255, 200, 40, 220, false, false, 2, false, nil, nil, false)
            end
        end
    elseif hit and (t.name == 'center' or t.name == 'door' or t.name == 'pickTarget' or t.name == 'pickVehicle') then
        DrawMarker(28, coords.x, coords.y, coords.z + 0.2, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.3, 0.3, 0.3, 255, 200, 40, 220, false, false, 2, false, nil, nil, false)
        if t.name == 'door' and entity and entity ~= 0 and GetEntityType(entity) == 3 then
            SetEntityDrawOutline(entity, true)
            SetEntityDrawOutlineColor(70, 150, 255, 255)
            if Editor.doorOutline and Editor.doorOutline ~= entity and DoesEntityExist(Editor.doorOutline) then
                SetEntityDrawOutline(Editor.doorOutline, false)
            end
            Editor.doorOutline = entity
        end
    elseif hit and t.name == 'variant' then
        local h = math.rad(t.heading or 0.0)
        local dir = vector3(-math.sin(h), math.cos(h), 0.0)
        local tip = coords + dir * 4.0
        DrawMarker(1, coords.x, coords.y, coords.z - 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.5, 1.5, 3.0, 120, 200, 255, 120, false, false, 2, false, nil, nil, false)
        DrawLine(coords.x, coords.y, coords.z + 0.5, tip.x, tip.y, tip.z + 0.5, 120, 200, 255, 255)
        DrawMarker(28, tip.x, tip.y, tip.z + 0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.2, 0.2, 0.2, 120, 200, 255, 255, false, false, 2, false, nil, nil, false)
    elseif hit and t.name == 'line' then
        local spacing = t.template.spacing or 1.5
        local p = coords
        DrawMarker(28, p.x, p.y, p.z + 0.2, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.3, 0.3, 0.3, 255, 200, 40, 220, false, false, 2, false, nil, nil, false)
        if t.lineStart then
            local s = t.lineStart
            DrawLine(s.x, s.y, s.z + 0.3, p.x, p.y, p.z + 0.3, 255, 200, 40, 255)
            local len = #(p - s)
            local count = math.floor(len / spacing) + 1
            for i = 0, count - 1 do
                local f = count > 1 and i / (count - 1) or 0
                local q = s + (p - s) * f
                DrawMarker(28, q.x, q.y, q.z + 0.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.2, 0.2, 0.2, 255, 120, 40, 220, false, false, 2, false, nil, nil, false)
            end
        end
        if Editor.ghost and DoesEntityExist(Editor.ghost.entity) then
            local gp = placementPos('object', p, Editor.ghost, 0.0)
            SetEntityCoordsNoOffset(Editor.ghost.entity, gp.x, gp.y, gp.z, false, false, false)
        end
    end

    -- Statusleiste (begrenzt auf ~7 Updates pro Sekunde)
    local now = GetGameTimer()
    if now - Editor.lastStatus > 150 then
        Editor.lastStatus = now
        local center = State.draft and State.draft.center
        NUI.send('status', {
            tool = t.name,
            hint = HINTS[t.name] or '',
            cursor = Editor.cursorHit and U.xyz(Editor.cursorHit) or nil,
            cam = U.xyz(Cam.pos),
            centerDist = center and math.floor(#(Cam.pos - U.vec(center))) or nil,
            maxDist = Config.Editor.maxDistance,
        })
    end
    if Editor.stateQueued then Editor.pushState() end
end

----------------------------------------------------------------------------
-- Klick in die Welt
----------------------------------------------------------------------------
local function elementFromEntity(entity)
    if not entity or entity == 0 then return nil end
    return Preview.byEntity[entity]
end

function Editor.click(button, mods)
    if button ~= 0 then return end
    local t = Editor.tool
    local hit, coords, entity, nx, ny = cursorHit()

    if t.name == 'select' then
        local id = elementFromEntity(entity) or Preview.pickScreen(nx, ny)
        Editor.select(id)
        return
    end

    if not hit then
        NUI.toast('error', 'Bodenposition konnte nicht ermittelt werden (Umgebung noch nicht geladen?)')
        return
    end

    if t.name == 'center' then
        local p = U.xyz(coords)
        -- Elemente duerfen nicht ausserhalb des erlaubten Abstands landen
        for _, el in ipairs(State.draft.elements) do
            if U.dist(el.pos, p) > Config.Editor.maxElementDistance then
                NUI.toast('error', 'Neuer Einsatzort zu weit von vorhandenen Elementen entfernt')
                return
            end
        end
        State.draft.center = p
        State.draft.info.address = addressAt(p)
        Editor.setTool({ name = 'select' })
        Editor.markDirty()
        NUI.toast('success', 'Einsatzort gesetzt: ' .. State.draft.info.address)
    elseif t.name == 'place' then
        local p = t.current or placementPos(t.kind, coords, Editor.ghost, t.template.zOffset)
        local raw = U.deepcopy(t.template)
        raw.kind = t.kind
        raw.pos = U.xyz(p)
        raw.zOffset = nil
        local ok, res = Editor.addElement(raw)
        if not ok then
            NUI.toast('error', res)
        else
            State.selected = res.id
            if not mods.shift and (t.kind == 'area') then Editor.setTool({ name = 'select' }) end
        end
    elseif t.name == 'move' then
        local el = findEl(t.id)
        if el then
            local copy = U.deepcopy(el)
            copy.pos = U.xyz(t.current or coords)
            copy.rot = t.rot
            t.original = nil
            Editor.tool = { name = 'select' }
            local ok, err = Editor.updateElement(el.id, copy)
            if not ok then NUI.toast('error', err) Preview.sync(el) end
            Editor.queueState()
        end
    elseif t.name == 'line' then
        if not t.lineStart then
            t.lineStart = coords
            Editor.queueState()
            return
        end
        local s, e = t.lineStart, coords
        local spacing = t.template.spacing or 1.5
        local len = #(e - s)
        local count = math.max(1, math.floor(len / spacing) + 1)
        local free = Config.Limits.object - countKind('object')
        if count > free then
            NUI.toast('warn', ('Nur %d Objekte moeglich (Grenze erreicht)'):format(free))
            count = free
        end
        local heading = math.deg(math.atan(-(e.x - s.x), e.y - s.y)) + (t.template.rot.z or 0.0)
        local placed = 0
        for i = 0, count - 1 do
            local f = count > 1 and i / (count - 1) or 0
            local q = s + (e - s) * f
            local g = Cam.groundAt(q + vector3(0.0, 0.0, 1.0)) or q
            local raw = { kind = 'object', model = t.template.model, label = t.template.label or '',
                pos = U.xyz(placementPos('object', g, Editor.ghost, 0.0)), rot = { x = 0.0, y = 0.0, z = heading },
                props = U.deepcopy(t.template.props) }
            local ok, res = Editor.addElement(raw)
            if ok then placed = placed + 1 else NUI.toast('error', res) break end
        end
        t.lineStart = nil
        NUI.toast('success', ('%d Objekte als Linie gesetzt'):format(placed))
        Editor.queueState()
    elseif t.name == 'door' then
        local raw = U.deepcopy(t.template or {})
        raw.kind = 'door'
        raw.props = raw.props or {}
        local g = Cam.groundAt(coords + vector3(0.0, 0.0, 0.5)) or coords
        raw.pos = U.xyz(g)
        if entity and entity ~= 0 and GetEntityType(entity) == 3 and not elementFromEntity(entity) then
            raw.props.doorModel = GetEntityModel(entity)
            raw.props.doorPos = U.xyz(GetEntityCoords(entity))
        else
            raw.props.doorModel = 0
            raw.props.doorPos = nil
            NUI.toast('info', 'Keine Kartentuer erkannt - logische Tuer ohne Verriegelung gesetzt')
        end
        if Editor.doorOutline and DoesEntityExist(Editor.doorOutline) then SetEntityDrawOutline(Editor.doorOutline, false) end
        local ok, res = Editor.addElement(raw)
        if not ok then NUI.toast('error', res) else State.selected = res.id end
    elseif t.name == 'variant' then
        local d = State.draft
        if not d.center then
            NUI.toast('error', 'Zuerst den Einsatzort (Original) festlegen')
            return
        end
        d.variants = d.variants or {}
        if #d.variants >= 20 then
            NUI.toast('error', 'Maximal 20 Ortsvarianten')
            return
        end
        local v = U.xyz(coords)
        v.h = U.round((t.heading or 0.0) % 360.0, 1)
        v.label = addressAt(coords)
        d.variants[#d.variants + 1] = v
        Editor.markDirty()
        NUI.toast('success', ('Ortsvariante %d gesetzt: %s'):format(#d.variants, v.label))
    elseif t.name == 'pickTarget' then
        local targetId = elementFromEntity(entity)
        local target = targetId and findEl(targetId)
        if not target or (target.kind ~= 'vehicle' and target.kind ~= 'object') then
            NUI.toast('error', 'Bitte ein gesetztes Fahrzeug oder Objekt anklicken')
            return
        end
        local el = findEl(t.forId)
        if el then
            local copy = U.deepcopy(el)
            copy.pos = U.xyz(coords)
            copy.props.attachTo = targetId
            copy.props.offset = { x = coords.x - target.pos.x, y = coords.y - target.pos.y, z = coords.z - target.pos.z }
            local ok, err = Editor.updateElement(el.id, copy)
            if not ok then NUI.toast('error', err) end
        end
        Editor.setTool({ name = 'select' })
    elseif t.name == 'pickVehicle' then
        local targetId = elementFromEntity(entity)
        local target = targetId and findEl(targetId)
        if not target or target.kind ~= 'vehicle' then
            NUI.toast('error', 'Bitte ein gesetztes Fahrzeug anklicken')
            return
        end
        local el = findEl(t.forId)
        if el then
            local copy = U.deepcopy(el)
            copy.pos = U.deepcopy(target.pos)
            copy.props.vehicleId = targetId
            copy.props.pose = 'fahrzeug'
            if copy.props.seat == nil then copy.props.seat = -1 end
            local ok, err = Editor.updateElement(el.id, copy)
            if not ok then NUI.toast('error', err) end
        end
        Editor.setTool({ name = 'select' })
    end
end

----------------------------------------------------------------------------
-- Mausrad / Tasten
----------------------------------------------------------------------------
local function adjustSize(props, kind, delta)
    if kind == 'area' then
        props.radius = U.clamp((props.radius or 50.0) + delta * 5.0, 5.0, 500.0)
    elseif kind == 'spill' then
        props.width = U.clamp((props.width or 2.5) + delta * 0.25, 0.5, 8.0)
    elseif kind == 'fire' or kind == 'smoke' then
        props.size = U.round(U.clamp((props.size or 1.0) + delta * 0.1, 0.2, 5.0), 2)
    end
end

function Editor.wheel(delta, mods)
    local step = mods.alt and Config.Editor.fineRotateStep or Config.Editor.rotateStep
    local t = Editor.tool
    if t.name == 'place' then
        if mods.shift then
            adjustSize(t.template.props, t.kind, delta)
        elseif mods.ctrl then
            t.template.zOffset = U.clamp((t.template.zOffset or 0.0) + delta * 0.05, -5.0, 5.0)
        else
            t.template.rot.z = (t.template.rot.z + delta * step) % 360.0
        end
        return
    elseif t.name == 'variant' then
        t.heading = ((t.heading or 0.0) + delta * step) % 360.0
        return
    elseif t.name == 'line' then
        t.template.spacing = U.clamp((t.template.spacing or 1.5) + delta * 0.25, 0.5, 10.0)
        NUI.toast('info', ('Abstand: %.2f m'):format(t.template.spacing))
        return
    elseif t.name == 'move' then
        if mods.ctrl then
            t.zOffset = U.clamp((t.zOffset or 0.0) + delta * 0.05, -5.0, 5.0)
        else
            t.rot = { x = t.rot.x, y = t.rot.y, z = (t.rot.z + delta * step) % 360.0 }
        end
        return
    end
    -- Auswahl direkt bearbeiten
    local el = State.selected and findEl(State.selected)
    if not el then return end
    local copy = U.deepcopy(el)
    if mods.shift then
        adjustSize(copy.props, copy.kind, delta)
    elseif mods.ctrl then
        copy.pos.z = copy.pos.z + delta * 0.05
    else
        copy.rot.z = (copy.rot.z + delta * step) % 360.0
    end
    local ok, err = Editor.updateElement(el.id, copy)
    if not ok then NUI.toast('error', err) end
end

-- Pfeiltasten: relativ zur Blickrichtung verschieben
function Editor.nudge(dx, dy, dz, big)
    local el = State.selected and findEl(State.selected)
    if not el then return end
    local stepXY = big and 1.0 or 0.1
    local stepZ = big and 0.25 or 0.05
    local fwd = vector3(-math.sin(math.rad(Cam.rot.z)), math.cos(math.rad(Cam.rot.z)), 0.0)
    local right = vector3(math.cos(math.rad(Cam.rot.z)), math.sin(math.rad(Cam.rot.z)), 0.0)
    local move = fwd * (dy * stepXY) + right * (dx * stepXY) + vector3(0.0, 0.0, dz * stepZ)
    local copy = U.deepcopy(el)
    copy.pos = U.xyz(U.vec(el.pos) + move)
    local ok, err = Editor.updateElement(el.id, copy)
    if not ok then NUI.toast('error', err) end
end

-- Esc: Werkzeug abbrechen -> Auswahl aufheben -> Schliessen anfragen
function Editor.escape()
    if Editor.tool.name ~= 'select' then
        Editor.setTool({ name = 'select' })
        return 'tool'
    end
    if State.selected then
        Editor.select(nil)
        return 'selection'
    end
    return 'close'
end

function Editor.cleanup()
    if Editor.doorOutline and DoesEntityExist(Editor.doorOutline) then SetEntityDrawOutline(Editor.doorOutline, false) end
    Editor.doorOutline = nil
    deleteGhost()
    Editor.tool = { name = 'select' }
end

----------------------------------------------------------------------------
-- Vor dem Senden an den Server
----------------------------------------------------------------------------
local function prepareDraft()
    local d = State.draft
    if not d.center then return false, 'Bitte zuerst den Einsatzort festlegen' end
    for _, el in ipairs(d.elements) do
        if el.kind == 'fire' and el.props.canSpread and not el.props.attachTo and #(el.props.spreadPoints or {}) == 0 then
            Editor.computeSpread(el)
        end
    end
    -- vollstaendige Vorpruefung mit denselben Regeln wie der Server
    local sc, err = Schema.normalizeScenario(d)
    if not sc then return false, err end
    return true, sc
end

function Editor.save()
    local ok, sc = prepareDraft()
    if not ok then return false, sc end
    sc.id = State.draft.id
    local sok, res = Request('saveScenario', { scenario = sc })
    if not sok then return false, res end
    State.draft.id = res.id
    State.meta = res.meta
    State.dirty = false
    Editor.queueState()
    return true, res
end

function Editor.trigger(mode, variant)
    local ok, sc = prepareDraft()
    if not ok then return false, sc end
    sc.id = State.draft.id
    local tok, res = Request('trigger', { scenario = sc, scenarioId = State.draft.id, mode = mode, variant = variant }, 60000)
    if not tok then return false, res end
    -- Vorschau ausblenden, damit sie die echten Elemente nicht verdeckt
    Preview.clear()
    Editor.previewHidden = true
    Editor.queueState()
    return true, res
end

function Editor.togglePreview()
    if Editor.previewHidden then
        Editor.previewHidden = false
        local errors = Preview.rebuild(State.draft)
        if #errors > 0 then NUI.toast('warn', errors[1]) end
    else
        Preview.clear()
        Editor.previewHidden = true
    end
    Editor.queueState()
    return true
end

----------------------------------------------------------------------------
-- NUI-Callbacks des Editors
----------------------------------------------------------------------------
local function requireOpen()
    if not State.open then error('Creator ist nicht geoeffnet') end
end

local function mods(data)
    return { shift = data.shift == true, ctrl = data.ctrl == true, alt = data.alt == true }
end

NUI.on('inputFocus', function(data)
    State.inputFocused = data.focused == true
    if State.open then SetNuiFocusKeepInput(not State.inputFocused) end
    return true
end)

NUI.on('look', function(data)
    if not State.open then return true end
    Cam.addLook(U.num(data.dx, 0, -400, 400), U.num(data.dy, 0, -400, 400))
    return true
end)

NUI.on('viewportClick', function(data)
    requireOpen()
    Editor.click(math.floor(U.num(data.button, 0)), mods(data))
    return true
end)

NUI.on('wheel', function(data)
    requireOpen()
    Editor.wheel(U.num(data.delta, 0) > 0 and 1 or -1, mods(data))
    return true
end)

NUI.on('key', function(data)
    requireOpen()
    local k = data.key
    local big = data.shift == true
    if k == 'Delete' then
        if State.selected then return Editor.deleteElement(State.selected) end
    elseif k == 'Escape' then
        return true, { result = Editor.escape() }
    elseif k == 'g' or k == 'G' then
        if State.selected then return Editor.setTool({ name = 'move', id = State.selected }) end
    elseif k == 'f' or k == 'F' then
        if State.selected then Editor.focusElement(State.selected) end
    elseif (k == 'd' or k == 'D') and data.ctrl then
        if State.selected then return Editor.duplicateElement(State.selected) end
    elseif k == 'ArrowUp' then Editor.nudge(0, 1, 0, big)
    elseif k == 'ArrowDown' then Editor.nudge(0, -1, 0, big)
    elseif k == 'ArrowLeft' then Editor.nudge(-1, 0, 0, big)
    elseif k == 'ArrowRight' then Editor.nudge(1, 0, 0, big)
    elseif k == 'PageUp' then Editor.nudge(0, 0, 1, big)
    elseif k == 'PageDown' then Editor.nudge(0, 0, -1, big)
    end
    return true
end)

NUI.on('setTool', function(data)
    requireOpen()
    local tool = { name = data.name, kind = data.kind, template = data.template, id = data.id, forId = data.forId }
    if tool.name == 'move' and not tool.id then tool.id = State.selected end
    if tool.name == 'place' and not EC.Kinds[tool.kind or ''] then return false, 'Unbekannte Elementart' end
    if tool.name == 'line' then tool.kind = 'object' end
    return Editor.setTool(tool)
end)

NUI.on('selectElement', function(data)
    requireOpen()
    Editor.select(data.id)
    if data.focus then Editor.focusElement(data.id) end
    return true
end)

NUI.on('updateElement', function(data)
    requireOpen()
    if type(data.element) ~= 'table' then return false, 'Ungueltige Daten' end
    return Editor.updateElement(data.element.id, data.element)
end)

NUI.on('deleteElement', function(data) requireOpen() return Editor.deleteElement(data.id) end)
NUI.on('duplicateElement', function(data) requireOpen() return Editor.duplicateElement(data.id) end)
NUI.on('focusElement', function(data) requireOpen() return Editor.focusElement(data.id) end)
NUI.on('snapToGround', function(data) requireOpen() return Editor.snapToGround(data.id) end)
NUI.on('recomputeSpread', function(data)
    requireOpen()
    local el = findEl(data.id)
    if not el or el.kind ~= 'fire' then return false, 'Kein Feuer ausgewaehlt' end
    Editor.computeSpread(el)
    Editor.markDirty()
    return true, { count = #el.props.spreadPoints }
end)

-- Ortsvarianten bearbeiten (Liste kommt vollstaendig aus der Oberflaeche)
NUI.on('updateVariants', function(data)
    requireOpen()
    local list = {}
    for _, v in ipairs(type(data.variants) == 'table' and data.variants or {}) do
        local x, y, z = tonumber(v.x), tonumber(v.y), tonumber(v.z)
        if x and y and z and #list < 20 then
            list[#list + 1] = { x = x, y = y, z = z, h = U.num(v.h, 0.0) % 360.0, label = U.cleanText(v.label, 48) }
        end
    end
    State.draft.variants = list
    Editor.markDirty()
    return true
end)

NUI.on('focusVariant', function(data)
    requireOpen()
    local v = State.draft.variants and State.draft.variants[tonumber(data.index) or 0]
    if not v then return false, 'Variante nicht gefunden' end
    -- Kamerareichweite voruebergehend um die Variante legen
    Cam.anchorOverride = vector3(v.x, v.y, v.z)
    Cam.focusOn(Cam.anchorOverride, 30.0)
    return true
end)

NUI.on('cameraToCenterReset', function()
    requireOpen()
    Cam.anchorOverride = nil
    if State.draft.center then Cam.focusOn(State.draft.center, 25.0) end
    return true
end)

-- Room-Key fuer z_fire-Innenraumbraende an der Position eines Feuers bestimmen
NUI.on('roomHashAt', function(data)
    requireOpen()
    local el = findEl(data.id)
    if not el then return false, 'Element nicht gefunden' end
    local p = U.vec(el.pos)
    local interior = GetInteriorAtCoords(p.x, p.y, p.z)
    if interior == 0 then return false, 'An dieser Position ist kein Innenraum (Interior) geladen' end
    local hash = LoadModel('prop_cs_cardbox_01') or LoadModel('prop_ld_health_pack')
    if not hash then return false, 'Hilfsobjekt konnte nicht geladen werden' end
    local obj = CreateObjectNoOffset(hash, p.x, p.y, p.z + 0.2, false, false, false)
    SetEntityVisible(obj, false, false)
    SetEntityCollision(obj, false, false)
    FreezeEntityPosition(obj, true)
    local room = 0
    for _ = 1, 30 do
        Wait(50)
        room = GetRoomKeyFromEntity(obj)
        if room ~= 0 then break end
    end
    DeleteEntity(obj)
    SetModelAsNoLongerNeeded(hash)
    if room == 0 then return false, 'Kein Raum gefunden - alternativ /z_fire:roomkey im Raum nutzen' end
    local copy = U.deepcopy(el)
    copy.props.roomHash = room
    copy.props.zfBehaviour = 'interior'
    local ok, err = Editor.updateElement(el.id, copy)
    if not ok then return false, err end
    return true, { roomHash = room }
end)

NUI.on('updateInfo', function(data)
    requireOpen()
    local d = State.draft
    local p = type(data.patch) == 'table' and data.patch or {}
    if p.name ~= nil then d.name = U.cleanText(p.name, 64) end
    if p.category ~= nil and EC.CategoryById[p.category] and p.category ~= d.category then
        d.category = p.category
        d.info.custom = {}
        d.info.alarmRoles = U.deepcopy(EC.CategoryById[p.category].roles or {})
    end
    if p.keyword ~= nil then d.keyword = U.cleanText(p.keyword, 64) end
    if p.priority ~= nil then d.priority = math.floor(U.num(p.priority, 2, 1, 3)) end
    if type(p.info) == 'table' then
        for k, v in pairs(p.info) do
            if k == 'custom' and type(v) == 'table' then
                for ck, cv in pairs(v) do d.info.custom[ck] = cv end
            elseif k == 'units' or k == 'alarmRoles' then
                if type(v) == 'table' then d.info[k] = v end
            elseif d.info[k] ~= nil then
                d.info[k] = type(v) == 'string' and U.cleanText(v, 3000) or v
            end
        end
    end
    Editor.markDirty()
    return true
end)

NUI.on('cameraToCenter', function()
    requireOpen()
    local c = State.draft.center
    if not c then return false, 'Kein Einsatzort festgelegt' end
    Cam.anchorOverride = nil
    Cam.focusOn(c, 25.0)
    return true
end)

NUI.on('checkModel', function(data)
    local ok, err = Editor.checkModel(data.model, data.kind)
    if not ok then return false, err end
    local info = { model = data.model }
    if data.kind == 'vehicle' then info.vehType = Editor.vehicleType(data.model) end
    return true, info
end)

NUI.on('newScenario', function()
    requireOpen()
    Editor.newDraft()
    return true
end)

NUI.on('loadScenario', function(data)
    requireOpen()
    local ok, res = Request('getScenario', { id = data.id })
    if not ok then return false, res end
    local sc = res.scenario
    if data.copy then
        sc.id = nil
        sc.name = sc.name .. ' (Kopie)'
    end
    local errors = Editor.loadScenario(sc, not data.copy and res.meta or nil)
    if data.copy then State.dirty = true Editor.queueState() end
    if #errors > 0 then
        NUI.toast('warn', ('%d Element(e) konnten nicht dargestellt werden: %s'):format(#errors, errors[1]))
    end
    return true
end)

NUI.on('saveScenario', function()
    requireOpen()
    local ok, res = Editor.save()
    if not ok then return false, res end
    return true, { id = res.id, scenarios = res.scenarios }
end)

NUI.on('listScenarios', function()
    return Request('listScenarios')
end)

NUI.on('duplicateScenario', function(data)
    return Request('duplicateScenario', { id = data.id })
end)

NUI.on('deleteScenario', function(data)
    local ok, res = Request('deleteScenario', { id = data.id })
    if ok and State.draft and State.draft.id == data.id then
        State.draft.id = nil
        State.meta = nil
        State.dirty = true
        Editor.queueState()
    end
    return ok, res
end)

NUI.on('trigger', function(data)
    requireOpen()
    local mode = data.mode == 'live' and 'live' or 'test'
    local variant = data.variant == 'random' and 'random' or math.floor(U.num(data.variant, 0, 0, 20))
    return Editor.trigger(mode, variant)
end)

NUI.on('togglePreview', function()
    requireOpen()
    return Editor.togglePreview()
end)

NUI.on('listIncidents', function()
    return Request('listIncidents')
end)

NUI.on('incidentAction', function(data)
    return Request('incidentAction', { id = data.id, action = data.action, phase = data.phase, reason = data.reason }, 30000)
end)

NUI.on('incidentDetails', function(data)
    return Request('incidentDetails', { id = data.id })
end)

NUI.on('focusPosition', function(data)
    requireOpen()
    if type(data.pos) ~= 'table' then return false, 'Keine Position' end
    Cam.focusOn(data.pos, U.num(data.distance, 25.0, 3.0, 200.0))
    return true
end)

NUI.on('setWaypoint', function(data)
    if type(data.pos) ~= 'table' then return false, 'Keine Position' end
    SetNewWaypoint(U.num(data.pos.x, 0.0), U.num(data.pos.y, 0.0))
    return true
end)

-- Zufallseinsaetze (Pruefung und Speicherung auf dem Server)
NUI.on('randomStatus', function() return Request('randomStatus') end)
NUI.on('randomSaveSettings', function(data) return Request('randomSaveSettings', { settings = data.settings }) end)
NUI.on('randomSetPool', function(data) return Request('randomSetPool', { id = data.id, pool = data.pool }) end)
NUI.on('randomRunNow', function() return Request('randomRunNow', nil, 60000) end)

NUI.on('close', function()
    CloseCreator()
    return true
end)

-- Aktive Einsaetze werden vom Server an offene Creator geschickt
RegisterNetEvent(EC.Events.activeList, function(data)
    if State.open then NUI.send('incidents', data) end
end)
