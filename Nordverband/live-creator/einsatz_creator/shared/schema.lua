--[[
    Datenmodell und Normalisierung

    Wird auf Client (Vorbelegung, Vorpruefung) und Server (verbindliche
    Pruefung) identisch verwendet. Der Server vertraut keinem Wert vom Client:
    jedes Szenario laeuft vor dem Speichern/Ausloesen durch normalizeScenario.
]]

EC = EC or {}
local U = EC.Utils
local Schema = {}
EC.Schema = Schema

local WORLD = { minX = -4500.0, maxX = 4500.0, minY = -4500.0, maxY = 8500.0, minZ = -200.0, maxZ = 1500.0 }

local function inWorld(p)
    return p.x >= WORLD.minX and p.x <= WORLD.maxX and p.y >= WORLD.minY and p.y <= WORLD.maxY
        and p.z >= WORLD.minZ and p.z <= WORLD.maxZ
end

local function pos(raw)
    if type(raw) ~= 'table' then return nil end
    local x, y, z = tonumber(raw.x), tonumber(raw.y), tonumber(raw.z)
    if not x or not y or not z then return nil end
    if x ~= x or y ~= y or z ~= z then return nil end
    local p = { x = U.round(x, 3), y = U.round(y, 3), z = U.round(z, 3) }
    if not inWorld(p) then return nil end
    return p
end

local function rot(raw)
    raw = type(raw) == 'table' and raw or {}
    local function a(v)
        v = U.num(v, 0.0) % 360.0
        if v > 180.0 then v = v - 360.0 end
        return U.round(v, 2)
    end
    return { x = a(raw.x), y = a(raw.y), z = a(raw.z) }
end

local function offset(raw, limit)
    raw = type(raw) == 'table' and raw or {}
    limit = limit or 15.0
    return {
        x = U.round(U.num(raw.x, 0.0, -limit, limit), 3),
        y = U.round(U.num(raw.y, 0.0, -limit, limit), 3),
        z = U.round(U.num(raw.z, 0.0, -limit, limit), 3),
    }
end

local function oneOf(value, lookup, default)
    if value ~= nil and lookup[value] then return value end
    return default
end

local function inArray(value, list, default)
    if U.inList(list, value) then return value end
    return default
end

local function idString(v)
    if type(v) == 'string' and #v >= 1 and #v <= 24 and v:match('^[%w_%-]+$') then return v end
    return nil
end

----------------------------------------------------------------------------
-- Standardwerte je Elementart
----------------------------------------------------------------------------
Schema.Defaults = {
    vehicle = function()
        return { vehType = 'automobile', damage = 0, hazard = false, lights = false, locked = true, frozen = true,
            doorsOpen = false, windowsBroken = false, tyresBurst = false, engineOff = true, plate = '', colour = -1 }
    end,
    object = function() return { frozen = true, collision = true } end,
    ped = function()
        return {
            pose = 'bewusstlos', vehicleId = nil, seat = -1, isPatient = true, randomModel = false,
            patient = {
                name = '', severity = 'mittel', consciousness = 'wach', mobility = 'nicht gehfaehig',
                injuries = {}, description = '', measures = '', transport = true,
                vitals = { puls = 90, rr = '120/80', spo2 = 97, af = 16, gcs = 15 },
                profile = 'none', variant = 0, gender = 'auto', body = {},
                destination = 'hospital', destMarker = nil,
            },
        }
    end,
    fire = function()
        return { fireType = 'normal', size = 1.0, canSpread = false, spreadRadius = 8.0, maxSpread = 5,
            spreadInterval = 45, burnTime = 0, smoulder = true, smoke = 'auto', attachTo = nil,
            offset = { x = 0.0, y = 0.0, z = 0.0 }, spreadPoints = {},
            zfEffect = Config.ZFire.defaultFireEffect, zfBehaviour = 'auto', roomHash = 0 }
    end,
    smoke = function()
        return { smokeType = 'mittel', size = 1.0, density = 1, untilFiresOut = true, attachTo = nil,
            offset = { x = 0.0, y = 0.0, z = 0.0 }, zfEffect = Config.ZFire.defaultSmokeEffect, zfDisperse = true }
    end,
    marker = function() return { markerKind = 'fundstelle', description = '', blip = true, interactive = false } end,
    area = function() return { areaKind = 'einsatzgebiet', radius = 50.0, blip = true } end,
    door = function()
        return { doorModel = 0, doorPos = nil, urgency = 'dringend', description = '', linked = {}, lockRealDoor = true }
    end,
    spill = function() return { spillKind = 'oel', width = 2.5 } end,
}

function Schema.newElement(kind)
    local def = Schema.Defaults[kind]
    if not def then return nil end
    return {
        id = U.randomId('', 8),
        kind = kind,
        label = '',
        model = nil,
        pos = { x = 0.0, y = 0.0, z = 0.0 },
        rot = { x = 0.0, y = 0.0, z = 0.0 },
        props = def(),
    }
end

function Schema.newScenario(category)
    return {
        schema = EC.SCHEMA_VERSION,
        id = nil,
        name = '',
        category = EC.CategoryById[category] and category or Catalog.Categories[1].id,
        keyword = '',
        priority = 2,
        info = {
            alarmText = '', description = '', address = '', hazards = '', persons = '',
            units = {}, unitsText = '', notes = '', sop = '', custom = {},
            alarmRoles = U.deepcopy((EC.CategoryById[category] or Catalog.Categories[1]).roles or {}),
        },
        center = nil,
        elements = {},
    }
end

----------------------------------------------------------------------------
-- Normalisierung je Elementart
----------------------------------------------------------------------------
local Props = {}

function Props.vehicle(raw)
    local d = Schema.Defaults.vehicle()
    local plate = U.cleanText(raw.plate, 8):upper():gsub('[^%w ]', '')
    return {
        vehType = EC.VehicleTypes[raw.vehType] and raw.vehType or d.vehType,
        damage = math.floor(U.num(raw.damage, d.damage, 0, 4)),
        hazard = U.bool(raw.hazard, d.hazard),
        lights = U.bool(raw.lights, d.lights),
        locked = U.bool(raw.locked, d.locked),
        frozen = U.bool(raw.frozen, d.frozen),
        doorsOpen = U.bool(raw.doorsOpen, d.doorsOpen),
        windowsBroken = U.bool(raw.windowsBroken, d.windowsBroken),
        tyresBurst = U.bool(raw.tyresBurst, d.tyresBurst),
        engineOff = U.bool(raw.engineOff, d.engineOff),
        plate = plate,
        colour = math.floor(U.num(raw.colour, -1, -1, 160)),
    }
end

function Props.object(raw)
    return { frozen = U.bool(raw.frozen, true), collision = U.bool(raw.collision, true) }
end

function Props.ped(raw)
    local d = Schema.Defaults.ped()
    local p = type(raw.patient) == 'table' and raw.patient or {}
    local vit = type(p.vitals) == 'table' and p.vitals or {}
    local injuries = {}
    if type(p.injuries) == 'table' then
        for _, inj in ipairs(p.injuries) do
            local t = U.cleanText(inj, 48)
            if t ~= '' and #injuries < 8 then injuries[#injuries + 1] = t end
        end
    end
    local body = {}
    if type(p.body) == 'table' then
        for _, part in ipairs(Medical.BodyParts) do
            local lvl = math.floor(U.num(p.body[part.id], 0, 0, part.maxLevel))
            if lvl > 0 then body[part.id] = lvl end
        end
    end
    local profile = (p.profile ~= nil and EC.ProfileById[p.profile]) and p.profile or 'none'
    local maxVariant = profile ~= 'none' and #EC.ProfileById[profile].variants or 0
    return {
        pose = oneOf(raw.pose, EC.PoseById, d.pose),
        vehicleId = idString(raw.vehicleId),
        seat = math.floor(U.num(raw.seat, -1, -1, 6)),
        isPatient = U.bool(raw.isPatient, true),
        randomModel = U.bool(raw.randomModel, false),
        patient = {
            profile = profile,
            variant = math.floor(U.num(p.variant, 0, 0, maxVariant)),
            gender = inArray(p.gender, { 'auto', 'm', 'w' }, 'auto'),
            body = body,
            destination = inArray(p.destination, { 'hospital', 'other_hospital', 'marker' }, 'hospital'),
            destMarker = idString(p.destMarker),
            name = U.cleanText(p.name, 48),
            severity = oneOf(p.severity, EC.SeverityById, 'mittel'),
            consciousness = inArray(p.consciousness, Catalog.Consciousness, 'wach'),
            mobility = inArray(p.mobility, Catalog.Mobility, 'nicht gehfaehig'),
            injuries = injuries,
            description = U.cleanText(p.description, 400),
            measures = U.cleanText(p.measures, 400),
            transport = U.bool(p.transport, true),
            vitals = {
                puls = math.floor(U.num(vit.puls, 90, 0, 250)),
                rr = U.cleanText(vit.rr or '120/80', 16),
                spo2 = math.floor(U.num(vit.spo2, 97, 0, 100)),
                af = math.floor(U.num(vit.af, 16, 0, 60)),
                gcs = math.floor(U.num(vit.gcs, 15, 3, 15)),
            },
        },
    }
end

function Props.fire(raw, element)
    local d = Schema.Defaults.fire()
    local radius = U.num(raw.spreadRadius, d.spreadRadius, 1.0, 40.0)
    local points = {}
    if type(raw.spreadPoints) == 'table' then
        for _, sp in ipairs(raw.spreadPoints) do
            local p = pos(sp)
            if p and element.pos and U.dist(p, element.pos) <= radius + 3.0 and #points < 20 then
                points[#points + 1] = p
            end
        end
    end
    local smoke = raw.smoke
    if smoke ~= 'auto' and smoke ~= 'none' and not EC.SmokeTypeById[smoke] then smoke = 'auto' end
    return {
        fireType = oneOf(raw.fireType, EC.FireTypeById, d.fireType),
        size = U.round(U.num(raw.size, d.size, 0.2, 5.0), 2),
        canSpread = U.bool(raw.canSpread, d.canSpread),
        spreadRadius = U.round(radius, 1),
        maxSpread = math.floor(U.num(raw.maxSpread, d.maxSpread, 0, 20)),
        spreadInterval = math.floor(U.num(raw.spreadInterval, d.spreadInterval, 10, 600)),
        burnTime = math.floor(U.num(raw.burnTime, d.burnTime, 0, 7200)),
        smoulder = U.bool(raw.smoulder, d.smoulder),
        smoke = smoke,
        attachTo = idString(raw.attachTo),
        offset = offset(raw.offset),
        spreadPoints = points,
        zfEffect = inArray(raw.zfEffect, Config.ZFire.fireEffects, Config.ZFire.defaultFireEffect),
        zfBehaviour = inArray(raw.zfBehaviour, { 'auto', 'grass', 'interior', 'prop', 'vehicle' }, 'auto'),
        roomHash = math.floor(U.num(raw.roomHash, 0, -2147483648, 4294967295)),
    }
end

function Props.smoke(raw)
    local d = Schema.Defaults.smoke()
    return {
        smokeType = oneOf(raw.smokeType, EC.SmokeTypeById, d.smokeType),
        size = U.round(U.num(raw.size, d.size, 0.2, 5.0), 2),
        density = math.floor(U.num(raw.density, d.density, 1, 3)),
        untilFiresOut = U.bool(raw.untilFiresOut, d.untilFiresOut),
        attachTo = idString(raw.attachTo),
        offset = offset(raw.offset),
        zfEffect = inArray(raw.zfEffect, Config.ZFire.smokeEffects, Config.ZFire.defaultSmokeEffect),
        zfDisperse = U.bool(raw.zfDisperse, true),
    }
end

function Props.marker(raw)
    return {
        markerKind = oneOf(raw.markerKind, EC.MarkerKindById, 'fundstelle'),
        description = U.cleanText(raw.description, 400),
        blip = U.bool(raw.blip, true),
        interactive = U.bool(raw.interactive, false),
    }
end

function Props.area(raw)
    return {
        areaKind = oneOf(raw.areaKind, EC.AreaKindById, 'einsatzgebiet'),
        radius = U.round(U.num(raw.radius, 50.0, 5.0, 500.0), 1),
        blip = U.bool(raw.blip, true),
    }
end

function Props.door(raw)
    local linked = {}
    if type(raw.linked) == 'table' then
        for _, id in ipairs(raw.linked) do
            local v = idString(id)
            if v and #linked < 8 then linked[#linked + 1] = v end
        end
    end
    local hash = math.floor(U.num(raw.doorModel, 0, -2147483648, 4294967295))
    return {
        doorModel = hash,
        doorPos = hash ~= 0 and pos(raw.doorPos) or nil,
        urgency = inArray(raw.urgency, { 'dringend', 'nicht dringend' }, 'dringend'),
        description = U.cleanText(raw.description, 300),
        linked = linked,
        lockRealDoor = U.bool(raw.lockRealDoor, true),
    }
end

function Props.spill(raw)
    return {
        spillKind = oneOf(raw.spillKind, EC.SpillKindById, 'oel'),
        width = U.round(U.num(raw.width, 2.5, 0.5, 8.0), 1),
    }
end

----------------------------------------------------------------------------
-- Element pruefen. Rueckgabe: element | nil, fehlertext
----------------------------------------------------------------------------
function Schema.normalizeElement(raw, center)
    if type(raw) ~= 'table' then return nil, 'Ungueltiges Element' end
    local kind = raw.kind
    if not EC.Kinds[kind] then return nil, 'Unbekannte Elementart' end

    local p = pos(raw.pos)
    if not p then return nil, ('%s: Position ungueltig oder ausserhalb der Karte'):format(EC.Kinds[kind].label) end
    if center and U.dist(p, center) > Config.Editor.maxElementDistance + 0.5 then
        return nil, ('%s ist zu weit vom Einsatzort entfernt (max. %d m)'):format(EC.Kinds[kind].label, math.floor(Config.Editor.maxElementDistance))
    end

    local el = {
        id = idString(raw.id) or U.randomId('', 8),
        kind = kind,
        label = U.cleanText(raw.label, 48),
        pos = p,
        rot = rot(raw.rot),
    }

    if EC.Kinds[kind].entity then
        if not U.isModelName(raw.model) then
            return nil, ('%s: Modellname ungueltig'):format(EC.Kinds[kind].label)
        end
        el.model = raw.model:lower()
    end

    el.props = Props[kind](type(raw.props) == 'table' and raw.props or {}, el)
    return el
end

----------------------------------------------------------------------------
-- Szenario pruefen. Rueckgabe: scenario | nil, fehlertext
----------------------------------------------------------------------------
function Schema.normalizeScenario(raw)
    if type(raw) ~= 'table' then return nil, 'Ungueltige Szenariodaten' end

    local name = U.cleanText(raw.name, 64)
    if name == '' then return nil, 'Bitte einen Einsatznamen angeben' end

    local category = EC.CategoryById[raw.category] and raw.category or nil
    if not category then return nil, 'Bitte eine Einsatzart waehlen' end

    local center = pos(raw.center)
    if not center then return nil, 'Bitte den Einsatzort (Hauptposition) festlegen' end

    local info = type(raw.info) == 'table' and raw.info or {}
    local units = {}
    if type(info.units) == 'table' then
        for _, u in ipairs(info.units) do
            local t = U.cleanText(u, 24)
            if t ~= '' and #units < 20 and not U.inList(units, t) then units[#units + 1] = t end
        end
    end

    -- Art-spezifische Felder nur laut Katalog uebernehmen
    local custom = {}
    local rawCustom = type(info.custom) == 'table' and info.custom or {}
    for _, f in ipairs(EC.CategoryById[category].fields or {}) do
        local v = rawCustom[f.key]
        if f.type == 'checkbox' then
            custom[f.key] = v == true
        elseif f.type == 'number' then
            custom[f.key] = math.floor(U.num(v, 0, 0, 9999))
        elseif f.type == 'select' then
            custom[f.key] = inArray(v, f.options, f.options[1])
        elseif f.type == 'textarea' then
            custom[f.key] = U.cleanText(v, 1000)
        else
            custom[f.key] = U.cleanText(v, 160)
        end
    end

    local alarmRoles = {}
    if type(info.alarmRoles) == 'table' then
        for _, r in ipairs(info.alarmRoles) do
            if Config.Roles[r] and not U.inList(alarmRoles, r) then alarmRoles[#alarmRoles + 1] = r end
        end
    end
    if #alarmRoles == 0 then alarmRoles = U.deepcopy(EC.CategoryById[category].roles or {}) end

    local sc = {
        schema = EC.SCHEMA_VERSION,
        id = (type(raw.id) == 'string' and raw.id:match('^SZ%-[%w]+$') and #raw.id <= 24) and raw.id or nil,
        name = name,
        category = category,
        keyword = U.cleanText(raw.keyword, 64),
        priority = math.floor(U.num(raw.priority, 2, 1, 3)),
        info = {
            alarmText = U.cleanText(info.alarmText, 300),
            description = U.cleanText(info.description, 1500),
            address = U.cleanText(info.address, 120),
            hazards = U.cleanText(info.hazards, 600),
            persons = U.cleanText(info.persons, 300),
            units = units,
            unitsText = U.cleanText(info.unitsText, 200),
            notes = U.cleanText(info.notes, 1500),
            sop = U.cleanText(info.sop, 3000),
            custom = custom,
            alarmRoles = alarmRoles,
        },
        center = center,
        elements = {},
    }

    -- Ortsvarianten: alternative Einsatzorte (die Szene wird beim Ausloesen dorthin verschoben)
    sc.variants = {}
    if type(raw.variants) == 'table' then
        for _, v in ipairs(raw.variants) do
            local p = pos(v)
            if p and #sc.variants < 20 then
                local h = U.num(v.h, 0.0) % 360.0
                sc.variants[#sc.variants + 1] = { x = p.x, y = p.y, z = p.z, h = U.round(h, 1), label = U.cleanText(v.label, 48) }
            end
        end
    end

    -- Elemente
    local counts, total, seen = {}, 0, {}
    if type(raw.elements) == 'table' then
        for _, rawEl in ipairs(raw.elements) do
            local el, err = Schema.normalizeElement(rawEl, center)
            if not el then return nil, err end
            if seen[el.id] then el.id = U.randomId('', 8) end
            seen[el.id] = true
            counts[el.kind] = (counts[el.kind] or 0) + 1
            total = total + 1
            local limit = Config.Limits[el.kind]
            if limit and counts[el.kind] > limit then
                return nil, ('Zu viele Elemente vom Typ "%s" (max. %d)'):format(EC.Kinds[el.kind].label, limit)
            end
            if total > Config.Limits.total then
                return nil, ('Zu viele Elemente insgesamt (max. %d)'):format(Config.Limits.total)
            end
            sc.elements[#sc.elements + 1] = el
        end
    end

    -- Verweise zwischen Elementen pruefen (ungueltige Verweise werden entfernt)
    local byId = {}
    for _, el in ipairs(sc.elements) do byId[el.id] = el end
    for _, el in ipairs(sc.elements) do
        local p = el.props
        if (el.kind == 'fire' or el.kind == 'smoke') and p.attachTo then
            local target = byId[p.attachTo]
            if not target or (target.kind ~= 'vehicle' and target.kind ~= 'object') then p.attachTo = nil end
        elseif el.kind == 'ped' then
            if p.vehicleId then
                local target = byId[p.vehicleId]
                if not target or target.kind ~= 'vehicle' then p.vehicleId = nil end
            end
            if p.pose == 'fahrzeug' and not p.vehicleId then p.pose = 'bewusstlos' end
            if p.pose ~= 'fahrzeug' then p.vehicleId = nil end
            local pt = p.patient
            if pt.destMarker then
                local m = byId[pt.destMarker]
                if not m or m.kind ~= 'marker' then pt.destMarker = nil end
            end
            if pt.destination == 'marker' and not pt.destMarker then pt.destination = 'hospital' end
        elseif el.kind == 'door' then
            local keep = {}
            for _, id in ipairs(p.linked) do
                if byId[id] and byId[id].kind == 'ped' then keep[#keep + 1] = id end
            end
            p.linked = keep
        end
    end

    return sc
end

-- Zaehlt Elemente je Art (fuer Anzeige)
function Schema.countKinds(elements)
    local counts = {}
    for _, el in ipairs(elements or {}) do counts[el.kind] = (counts[el.kind] or 0) + 1 end
    return counts
end
