--[[
    z_fire-Backend (Config.Fire.backend = 'z_fire' oder 'auto' mit laufendem z_fire)

    Verwendet ausschliesslich dokumentierte z_fire-Server-Exports:
      createFire(fire_data, source)   -> uuid | nil
      createSmoke(smoke_data)         -> uuid | nil
      deleteFires({ { id = uuid }, ... })
      getAllFires() / getAllSmoke()   -> Tabellen mit allen aktiven Feuern/Rauchquellen
    Rauch kann laut Doku nur clientseitig geloescht werden (deleteSmokeById):
    der Server beauftragt dafuer einen verbundenen Client.

    Geloescht wird nur, was dieser Einsatz selbst erzeugt hat (gespeicherte UUIDs)
    sowie Ableger, deren origin.id auf einen eigenen Brandherd verweist.
    Es wird nie nach Naehe zum Einsatzort geloescht.
]]

local U = EC.Utils

ZFire = {
    incidents = {},  -- incidentId -> { fires = { uuid = elementId }, smokes = { uuid = elementId }, src = number, last = {} }
}

local function res() return Config.ZFire.resource end

function ZFire.available()
    return GetResourceState(res()) == 'started'
end

local function z() return exports[res()] end

-- Weltversatz -> fahrzeug-/objektlokaler Versatz (z_fire erwartet bei Kopplung einen Offset)
local function toLocal(entity, offset)
    local h = math.rad(GetEntityHeading(entity))
    local rx, ry = math.cos(h), math.sin(h)     -- rechts
    local fx, fy = -math.sin(h), math.cos(h)    -- vorne
    return vector3(offset.x * rx + offset.y * ry, offset.x * fx + offset.y * fy, offset.z)
end

local function behaviourOf(el, attachKind)
    local b = el.props.zfBehaviour
    if b and b ~= 'auto' then return b end
    if attachKind == 'vehicle' then return 'vehicle' end
    if attachKind == 'object' then return 'prop' end
    if el.props.roomHash and el.props.roomHash ~= 0 then return 'interior' end
    return 'grass'
end

--[[
    Brandherde und Rauch eines Einsatzes ueber z_fire erzeugen.
    Wirft einen Fehler (-> Rollback des Einsatzes), wenn z_fire fehlt oder ein Effekt nicht erzeugt wird.
]]
function ZFire.createForIncident(incident)
    if not ZFire.available() then
        error({ message = ('z_fire (%s) ist nicht gestartet - Feuer/Rauch koennen nicht erzeugt werden'):format(res()) })
    end
    local rec = { fires = {}, smokes = {}, src = incident.createdBy and incident.createdBy.src or nil, last = {} }
    ZFire.incidents[incident.id] = rec
    incident.fire = { spread = {}, extinguished = 0, total = 0, backend = 'z_fire' }

    local src = rec.src
    if src and not GetPlayerName(src) then src = nil end

    for _, el in ipairs(incident.scenario.elements) do
        local p = el.props
        local target, attachKind
        if p.attachTo and incident.entities[p.attachTo] then
            target = incident.entities[p.attachTo]
            attachKind = target.kind
        end

        if el.kind == 'fire' then
            local behaviour = behaviourOf(el, attachKind)
            local data = {
                ptfxData = { type = p.zfEffect, pos = vector3(el.pos.x, el.pos.y, el.pos.z), scale = p.size },
                behaviourType = behaviour,
                canSpread = p.canSpread,
                spreadSize = p.spreadRadius,
                burnoutTime = p.burnTime > 0 and p.burnTime or Config.ZFire.endlessBurnout,
                origin = { is = true, id = nil },
            }
            if behaviour == 'vehicle' or behaviour == 'prop' then
                if not target or not DoesEntityExist(target.entity) then
                    error({ message = ('Feuer "%s": Fahrzeug-/Objektbrand braucht eine Kopplung an ein Fahrzeug oder Objekt'):format(el.label ~= '' and el.label or el.id) })
                end
                data.networkEntity = target.netId
                data.ptfxData.pos = toLocal(target.entity, p.offset)
                data.ptfxData.fallbackPos = vector3(el.pos.x, el.pos.y, el.pos.z)
            elseif behaviour == 'interior' then
                if not p.roomHash or p.roomHash == 0 then
                    error({ message = ('Feuer "%s": Innenraumbrand braucht einen Raum (Room-Key)'):format(el.label ~= '' and el.label or el.id) })
                end
                data.roomHash = p.roomHash
            end
            local ok, uuid = pcall(function() return z():createFire(data, src or -1) end)
            if not ok or not uuid then
                error({ message = ('z_fire konnte Feuer "%s" nicht erzeugen (%s)'):format(el.label ~= '' and el.label or el.id, ok and 'kein Rueckgabewert' or tostring(uuid)) })
            end
            rec.fires[uuid] = el.id
            incident.fire.total = incident.fire.total + 1
        elseif el.kind == 'smoke' then
            local data = {
                ptfxData = { type = p.zfEffect, pos = vector3(el.pos.x, el.pos.y, el.pos.z), scale = p.size },
                networkEntity = target and target.netId or nil,
                canDisperse = p.zfDisperse,
            }
            local ok, uuid = pcall(function() return z():createSmoke(data) end)
            if not ok or not uuid then
                error({ message = ('z_fire konnte Rauch nicht erzeugen (%s)'):format(ok and 'kein Rueckgabewert' or tostring(uuid)) })
            end
            rec.smokes[uuid] = el.id
        end
    end
    return U.tableCount(rec.fires), U.tableCount(rec.smokes)
end

-- Eigene Feuer inkl. Ableger (origin.id verweist auf eigenes Feuer)
local function ownFires(rec)
    local ok, all = pcall(function() return z():getAllFires() end)
    if not ok or type(all) ~= 'table' then return nil end
    local list = {}
    for key, fire in pairs(all) do
        local id = type(key) == 'string' and key or (type(fire) == 'table' and fire.id)
        local origin = type(fire) == 'table' and fire.origin
        if id and (rec.fires[id] or (type(origin) == 'table' and origin.id and rec.fires[origin.id])) then
            list[#list + 1] = id
        end
    end
    return list
end

local function ownSmokes(rec)
    local ok, all = pcall(function() return z():getAllSmoke() end)
    if not ok or type(all) ~= 'table' then return nil end
    local list = {}
    for key, smoke in pairs(all) do
        local id = type(key) == 'string' and key or (type(smoke) == 'table' and smoke.id)
        if id and rec.smokes[id] then list[#list + 1] = id end
    end
    return list
end

function ZFire.summary(incidentId)
    local rec = ZFire.incidents[incidentId]
    if not rec or not ZFire.available() then return { burning = 0, smouldering = 0, smoke = 0 } end
    local fires = ownFires(rec)
    local smokes = ownSmokes(rec)
    return { burning = fires and #fires or 0, smouldering = 0, smoke = smokes and #smokes or 0 }
end

-- Rauch loeschen: ueber einen verbundenen Client (z_fire bietet dafuer nur einen Client-Export)
local function deleteSmokes(ids, preferredSrc)
    if #ids == 0 then return true end
    local target = preferredSrc and GetPlayerName(preferredSrc) and preferredSrc or nil
    if not target then
        local players = GetPlayers()
        target = players[1] and tonumber(players[1]) or nil
    end
    if not target then
        U.log('warn', 'z_fire: %d Rauchquelle(n) konnten nicht entfernt werden - kein Spieler online (Client-Export noetig)', #ids)
        return false
    end
    TriggerClientEvent('einsatzcreator:client:zfireDeleteSmoke', target, ids)
    return true
end

-- Alles entfernen, was der Einsatz in z_fire erzeugt hat (idempotent)
function ZFire.removeIncident(incidentId)
    local rec = ZFire.incidents[incidentId]
    if not rec then return 0, 0 end
    ZFire.incidents[incidentId] = nil
    if not ZFire.available() then
        U.log('warn', 'z_fire nicht gestartet - Feuer/Rauch von %s konnten nicht entfernt werden', incidentId)
        return 0, 0
    end
    local fires = ownFires(rec) or {}
    if #fires > 0 then
        local payload = {}
        for _, id in ipairs(fires) do payload[#payload + 1] = { id = id } end
        local ok, err = pcall(function() return z():deleteFires(payload) end)
        if not ok then U.log('error', 'z_fire deleteFires (%s): %s', incidentId, tostring(err)) end
    end
    local smokes = ownSmokes(rec) or {}
    deleteSmokes(smokes, rec.src)
    return #fires, #smokes
end

-- Fuer Neustart-Bereinigung speichern / wiederherstellen
function ZFire.snapshot(incidentId)
    local rec = ZFire.incidents[incidentId]
    if not rec then return nil end
    local fires, smokes = {}, {}
    for id in pairs(rec.fires) do fires[#fires + 1] = id end
    for id in pairs(rec.smokes) do smokes[#smokes + 1] = id end
    return { fires = fires, smokes = smokes }
end

function ZFire.removeSnapshot(snapshot)
    if type(snapshot) ~= 'table' then return end
    local rec = { fires = {}, smokes = {} }
    for _, id in ipairs(snapshot.fires or {}) do rec.fires[id] = true end
    for _, id in ipairs(snapshot.smokes or {}) do rec.smokes[id] = true end
    local key = '__restore_' .. tostring(math.random(1e9))
    ZFire.incidents[key] = rec
    ZFire.removeIncident(key)
end

-- Feuerlage regelmaessig pruefen (z_fire meldet Loescherfolge nicht an andere Ressourcen)
CreateThread(function()
    while true do
        Wait(10000)
        if next(ZFire.incidents) and ZFire.available() then
            for incidentId, rec in pairs(ZFire.incidents) do
                local inc = Incidents.get(incidentId)
                if inc and inc.status == EC.Status.active then
                    local s = ZFire.summary(incidentId)
                    if s.burning ~= rec.last.burning or s.smoke ~= rec.last.smoke then
                        if rec.last.burning and s.burning < rec.last.burning and inc.fire then
                            inc.fire.extinguished = inc.fire.extinguished + (rec.last.burning - s.burning)
                        end
                        rec.last = s
                        Incidents.onFireChanged(inc)
                    end
                end
            end
        end
    end
end)
