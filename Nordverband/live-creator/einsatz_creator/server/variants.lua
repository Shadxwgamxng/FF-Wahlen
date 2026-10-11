--[[
    Ortsvarianten: verschiebt und dreht eine komplette Szene an einen
    alternativen Einsatzort. Variante 0 = urspruenglicher Ort.

    Alle Positionen werden relativ zum Einsatzmittelpunkt um die Drehung
    der Variante gedreht und an den neuen Ort verschoben. Hoehenunterschiede
    werden ueber die Hoehe des Mittelpunkts ausgeglichen - Varianten sollten
    daher auf aehnlichem Untergrund liegen.
]]

local U = EC.Utils

Variants = {}

local function rotate(dx, dy, rad)
    local c, s = math.cos(rad), math.sin(rad)
    return dx * c - dy * s, dx * s + dy * c
end

local function movePoint(p, center, target, rad)
    local dx, dy = rotate(p.x - center.x, p.y - center.y, rad)
    return { x = U.round(target.x + dx, 3), y = U.round(target.y + dy, 3), z = U.round(p.z - center.z + target.z, 3) }
end

-- Rueckgabe: neue Szenario-Kopie (Original bleibt unveraendert)
function Variants.apply(sc, index)
    local v = sc.variants and sc.variants[index]
    if not v then return sc end
    local out = U.deepcopy(sc)
    local center = sc.center
    local rad = math.rad(v.h or 0.0)
    for _, el in ipairs(out.elements) do
        el.pos = movePoint(el.pos, center, v, rad)
        if el.rot then el.rot.z = ((el.rot.z or 0.0) + (v.h or 0.0)) % 360.0 end
        local p = el.props or {}
        if p.offset then
            local ox, oy = rotate(p.offset.x, p.offset.y, rad)
            p.offset = { x = U.round(ox, 3), y = U.round(oy, 3), z = p.offset.z }
        end
        if p.spreadPoints then
            for i, sp in ipairs(p.spreadPoints) do p.spreadPoints[i] = movePoint(sp, center, v, rad) end
        end
        if el.kind == 'door' then
            -- Kartentueren existieren nur am Originalort
            p.doorModel, p.doorPos, p.lockRealDoor = 0, nil, false
        end
    end
    out.center = { x = v.x, y = v.y, z = v.z }
    if v.label and v.label ~= '' then out.info.address = v.label end
    out.variantIndex = index
    return out
end

-- Zufaellige Variante (0 = Original)
function Variants.random(sc)
    local n = sc.variants and #sc.variants or 0
    if n == 0 then return 0 end
    return math.random(0, n)
end
