EC = EC or {}
local U = {}
EC.Utils = U

local IS_SERVER = IsDuplicityVersion()

function U.log(level, msg, ...)
    if level == 'debug' and not Config.Debug then return end
    local ok, text = pcall(string.format, msg, ...)
    if not ok then text = tostring(msg) end
    local colour = ({ error = '^1', warn = '^3', info = '^5', debug = '^7' })[level] or '^7'
    print(('%s[einsatz_creator][%s]^7 %s'):format(colour, level, text))
end

function U.deepcopy(value, seen)
    if type(value) ~= 'table' then return value end
    seen = seen or {}
    if seen[value] then return seen[value] end
    local copy = {}
    seen[value] = copy
    for k, v in pairs(value) do
        copy[U.deepcopy(k, seen)] = U.deepcopy(v, seen)
    end
    return copy
end

function U.clamp(v, lo, hi)
    if v < lo then return lo end
    if v > hi then return hi end
    return v
end

function U.round(v, decimals)
    local m = 10 ^ (decimals or 0)
    return math.floor(v * m + 0.5) / m
end

function U.tableCount(t)
    local n = 0
    for _ in pairs(t or {}) do n = n + 1 end
    return n
end

-- {x,y,z} <-> vector3
function U.vec(t)
    if type(t) == 'vector3' then return t end
    if type(t) ~= 'table' then return vector3(0.0, 0.0, 0.0) end
    return vector3((t.x or 0) + 0.0, (t.y or 0) + 0.0, (t.z or 0) + 0.0)
end

function U.xyz(v)
    return { x = U.round(v.x, 3), y = U.round(v.y, 3), z = U.round(v.z, 3) }
end

function U.dist(a, b)
    local dx, dy, dz = a.x - b.x, a.y - b.y, (a.z or 0) - (b.z or 0)
    return math.sqrt(dx * dx + dy * dy + dz * dz)
end

function U.dist2d(a, b)
    local dx, dy = a.x - b.x, a.y - b.y
    return math.sqrt(dx * dx + dy * dy)
end

local hex = '0123456789ABCDEF'
function U.randomId(prefix, len)
    local out = {}
    for i = 1, (len or 6) do
        local n = math.random(1, 16)
        out[i] = hex:sub(n, n)
    end
    return (prefix or '') .. table.concat(out)
end

-- Text bereinigen: Steuerzeichen entfernen, kuerzen
function U.cleanText(s, maxLen)
    if s == nil then return '' end
    s = tostring(s)
    s = s:gsub('[%z\1-\8\11\12\14-\31\127]', '')
    s = s:gsub('^%s+', ''):gsub('%s+$', '')
    if maxLen and #s > maxLen then
        s = s:sub(1, maxLen)
        -- ein am Ende abgeschnittenes UTF-8-Zeichen entfernen
        local i = #s
        while i > 0 and i > #s - 4 do
            local b = s:byte(i)
            if b < 0x80 then break end
            if b >= 0xC0 then
                local need = b >= 0xF0 and 4 or b >= 0xE0 and 3 or 2
                if #s - i + 1 < need then s = s:sub(1, i - 1) end
                break
            end
            i = i - 1
        end
    end
    return s
end

function U.isModelName(s)
    return type(s) == 'string' and #s >= 2 and #s <= 64 and s:match('^[%w_%-]+$') ~= nil
end

function U.num(v, default, lo, hi)
    v = tonumber(v)
    if v == nil or v ~= v or v == math.huge or v == -math.huge then v = default end
    if lo and hi then v = U.clamp(v, lo, hi) end
    return v
end

function U.bool(v, default)
    if v == nil then return default end
    return v == true
end

function U.inList(list, value)
    for _, v in ipairs(list or {}) do
        if v == value then return true end
    end
    return false
end

function U.findById(list, id)
    for i, v in ipairs(list or {}) do
        if v.id == id then return v, i end
    end
    return nil
end

function U.now()
    return os.time()
end

function U.isoTime(ts)
    return os.date('!%Y-%m-%dT%H:%M:%SZ', ts or os.time())
end

-- Kataloge als Nachschlagetabellen
function U.indexBy(list, key)
    local out = {}
    for _, v in ipairs(list or {}) do out[v[key]] = v end
    return out
end

EC.CategoryById = U.indexBy(Catalog.Categories, 'id')
EC.FireTypeById = U.indexBy(Catalog.FireTypes, 'id')
EC.SmokeTypeById = U.indexBy(Catalog.SmokeTypes, 'id')
EC.PoseById = U.indexBy(Catalog.Poses, 'id')
EC.MarkerKindById = U.indexBy(Catalog.MarkerKinds, 'id')
EC.AreaKindById = U.indexBy(Catalog.AreaKinds, 'id')
EC.SpillKindById = U.indexBy(Catalog.SpillKinds, 'id')
EC.SeverityById = U.indexBy(Catalog.Severities, 'id')
EC.ProfileById = U.indexBy(Medical.Profiles, 'id')
EC.MedicationById = U.indexBy(Medical.Medications, 'id')
EC.BodyPartById = U.indexBy(Medical.BodyParts, 'id')

if not IS_SERVER then
    -- Client: Zufall mit Spielzeit initialisieren
    math.randomseed(GetGameTimer())
else
    math.randomseed(os.time())
end

-- Aktives Feuer-Backend: 'z_fire' oder 'internal'.
-- Bei Config.Fire.backend = 'auto' wird z_fire genutzt, sobald die Resource laeuft, sonst das eigene Feuersystem.
function EC.fireBackend()
    local b = Config.Fire and Config.Fire.backend or 'auto'
    if b == 'auto' then
        return GetResourceState(Config.ZFire.resource) == 'started' and 'z_fire' or 'internal'
    end
    return b == 'z_fire' and 'z_fire' or 'internal'
end
