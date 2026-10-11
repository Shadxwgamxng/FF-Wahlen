--[[
    Serverseitige Validierung: Szenarien, Modelle, Abstaende, Rate-Limits.
]]

local U = EC.Utils

Validate = {}

local blacklist = {}
for _, m in ipairs(Config.ModelBlacklist or {}) do blacklist[m:lower()] = true end

local catalogModels = {}
for _, list in ipairs({ Catalog.Vehicles, Catalog.Props, Catalog.Peds }) do
    for _, cat in ipairs(list) do
        for _, m in ipairs(cat.models) do catalogModels[m:lower()] = true end
    end
end

-- Rate-Limit je Spieler und Schluessel
local lastCall = {}
function Validate.rate(src, key, intervalMs)
    local now = GetGameTimer()
    lastCall[src] = lastCall[src] or {}
    local last = lastCall[src][key]
    if last and now - last < intervalMs then return false end
    lastCall[src][key] = now
    return true
end

function Validate.forget(src)
    lastCall[src] = nil
end

function Validate.modelAllowed(model)
    if not U.isModelName(model) then return false, 'Ungueltiger Modellname' end
    model = model:lower()
    if blacklist[model] then return false, ('Modell "%s" ist gesperrt'):format(model) end
    if Config.OnlyCatalogModels and not catalogModels[model] then
        return false, ('Modell "%s" ist nicht im Katalog freigegeben'):format(model)
    end
    return true
end

-- Vollstaendige Szenariopruefung. Rueckgabe: scenario | nil, fehler
function Validate.scenario(raw)
    local sc, err = EC.Schema.normalizeScenario(raw)
    if not sc then return nil, err end
    for _, el in ipairs(sc.elements) do
        if el.model then
            local ok, merr = Validate.modelAllowed(el.model)
            if not ok then return nil, merr end
        end
    end
    return sc
end

function Validate.playerCoords(src)
    local ped = GetPlayerPed(src)
    if not ped or ped == 0 then return nil end
    return GetEntityCoords(ped)
end

-- Steht der Spieler nah genug an einer Position?
function Validate.near(src, coords, maxDist)
    local p = Validate.playerCoords(src)
    if not p then return false end
    return #(p - U.vec(coords)) <= maxDist
end

-- Grobe Groessenbegrenzung fuer eingehende Daten
function Validate.payloadOk(payload, maxBytes)
    if payload == nil then return true end
    local ok, encoded = pcall(json.encode, payload)
    if not ok or not encoded then return false end
    return #encoded <= (maxBytes or 200000)
end

function Validate.idString(v, maxLen)
    return type(v) == 'string' and #v >= 1 and #v <= (maxLen or 32) and v:match('^[%w_%-]+$') ~= nil
end
