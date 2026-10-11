--[[
    Serverseitige Erzeugung und Entfernung von Fahrzeugen, Objekten und NPCs.

    Jede erzeugte Entity bekommt den State-Bag-Eintrag "ec":
        { i = <Einsatz-ID>, e = <Element-ID>, k = <Art>, p = <Eigenschaften> }
    Geloescht wird nur, was diesen Eintrag mit passender Einsatz-ID traegt.
    So koennen niemals fremde Fahrzeuge, Props oder Spieler-Entities entfernt werden.
]]

local U = EC.Utils

Spawner = {}

local SPAWN_TIMEOUT = 3000

local function waitFor(entity)
    local deadline = GetGameTimer() + SPAWN_TIMEOUT
    while (not entity or entity == 0 or not DoesEntityExist(entity)) and GetGameTimer() < deadline do
        Wait(50)
    end
    return entity and entity ~= 0 and DoesEntityExist(entity)
end

local function keepAlive(entity)
    if SetEntityOrphanMode then
        -- 2 = Entity bleibt bestehen, auch wenn kein Spieler in der Naehe ist
        pcall(SetEntityOrphanMode, entity, 2)
    end
end

local function tag(entity, incidentId, el, extra)
    local state = { i = incidentId, e = el.id, k = el.kind, m = el.model, p = el.props }
    if extra then for k, v in pairs(extra) do state[k] = v end end
    Entity(entity).state:set('ec', state, true)
end

local function heading(el)
    return (el.rot.z or 0.0) % 360.0
end

local function spawnVehicle(incidentId, el)
    local veh = CreateVehicleServerSetter(GetHashKey(el.model), el.props.vehType, el.pos.x, el.pos.y, el.pos.z, heading(el))
    if not waitFor(veh) then return nil, ('Fahrzeug "%s" konnte nicht erzeugt werden (Modell vorhanden? Fahrzeugtyp %s?)'):format(el.model, el.props.vehType) end
    keepAlive(veh)
    SetEntityRotation(veh, el.rot.x, el.rot.y, el.rot.z, 2, true)
    FreezeEntityPosition(veh, el.props.frozen)
    SetVehicleDoorsLocked(veh, el.props.locked and 2 or 1)
    if el.props.plate ~= '' then SetVehicleNumberPlateText(veh, el.props.plate) end
    if el.props.colour >= 0 then SetVehicleColours(veh, el.props.colour, el.props.colour) end
    tag(veh, incidentId, el)
    return veh
end

local function spawnObject(incidentId, el)
    local obj = CreateObjectNoOffset(GetHashKey(el.model), el.pos.x, el.pos.y, el.pos.z, true, true, false)
    if not waitFor(obj) then return nil, ('Objekt "%s" konnte nicht erzeugt werden'):format(el.model) end
    keepAlive(obj)
    SetEntityRotation(obj, el.rot.x, el.rot.y, el.rot.z, 2, true)
    FreezeEntityPosition(obj, el.props.frozen)
    tag(obj, incidentId, el)
    return obj
end

local function spawnPed(incidentId, el, entities)
    local veh = el.props.vehicleId and entities[el.props.vehicleId] and entities[el.props.vehicleId].entity or nil
    local z = el.pos.z + (veh and 0.0 or 0.9)
    local ped = CreatePed(4, GetHashKey(el.model), el.pos.x, el.pos.y, z, heading(el), true, true)
    if not waitFor(ped) then return nil, ('NPC "%s" konnte nicht erzeugt werden'):format(el.model) end
    keepAlive(ped)
    if veh and DoesEntityExist(veh) then
        SetPedIntoVehicle(ped, veh, el.props.seat)
    end
    tag(ped, incidentId, el, { st = 'init' })
    return ped
end

--[[
    Erzeugt alle Entity-Elemente eines Einsatzes.
    Reihenfolge: Fahrzeuge -> Objekte -> NPCs (NPCs koennen in Fahrzeugen sitzen).
    Rueckgabe: entities (elementId -> Datensatz), errors (Liste)
]]
function Spawner.spawnAll(incident)
    local entities, errors = {}, {}
    local order = { vehicle = 1, object = 2, ped = 3 }
    local list = {}
    for _, el in ipairs(incident.scenario.elements) do
        if order[el.kind] then list[#list + 1] = el end
    end
    table.sort(list, function(a, b) return order[a.kind] < order[b.kind] end)

    for _, el in ipairs(list) do
        if incident.aborted then break end
        local ok, entity, err = pcall(function()
            if el.kind == 'vehicle' then return spawnVehicle(incident.id, el)
            elseif el.kind == 'object' then return spawnObject(incident.id, el)
            else return spawnPed(incident.id, el, entities) end
        end)
        if not ok then
            errors[#errors + 1] = ('%s %s: %s'):format(EC.Kinds[el.kind].label, el.model, tostring(entity))
        elseif not entity then
            errors[#errors + 1] = err
        else
            entities[el.id] = {
                entity = entity,
                netId = NetworkGetNetworkIdFromEntity(entity),
                kind = el.kind,
                model = el.model,
            }
        end
        -- Netzwerk nicht mit vielen Erzeugungen in einem Frame belasten
        Wait(0)
    end
    return entities, errors
end

-- Gehoert die Entity zu diesem Einsatz?
function Spawner.owns(entity, incidentId)
    if not entity or entity == 0 or not DoesEntityExist(entity) then return false end
    local state = Entity(entity).state.ec
    return type(state) == 'table' and state.i == incidentId
end

-- Loescht eine Entity des Einsatzes. Rueckgabe: 'deleted' | 'missing' | 'foreign'
function Spawner.delete(record, incidentId)
    local entity = record.entity
    if (not entity or not DoesEntityExist(entity)) and record.netId then
        entity = NetworkGetEntityFromNetworkId(record.netId)
    end
    if not entity or entity == 0 or not DoesEntityExist(entity) then return 'missing' end
    if not Spawner.owns(entity, incidentId) then
        U.log('warn', 'Einsatz %s: Entity %s gehoert nicht (mehr) zum Einsatz und wird nicht geloescht', incidentId, tostring(record.netId))
        return 'foreign'
    end
    DeleteEntity(entity)
    return 'deleted'
end

-- Loescht alle Entities eines Einsatzes, optional gefiltert nach Art
function Spawner.deleteAll(incident, kinds)
    local result = { deleted = 0, missing = 0, foreign = 0 }
    for elementId, record in pairs(incident.entities or {}) do
        if not kinds or kinds[record.kind] then
            local r = Spawner.delete(record, incident.id)
            result[r] = result[r] + 1
            incident.entities[elementId] = nil
        end
    end
    return result
end

-- Aktualisiert einen Teil des State-Bags (z. B. NPC-Pose nach Befreiung)
function Spawner.updateState(record, incidentId, changes)
    local entity = record.entity
    if not Spawner.owns(entity, incidentId) then return false end
    local state = U.deepcopy(Entity(entity).state.ec)
    for k, v in pairs(changes) do state[k] = v end
    Entity(entity).state:set('ec', state, true)
    return true
end
