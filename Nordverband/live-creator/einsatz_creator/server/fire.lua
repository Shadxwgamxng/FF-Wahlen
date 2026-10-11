--[[
    Eigenes Feuersystem (serverseitig verwaltet)

    - Jeder Brandherd ("Knoten") hat Lebenspunkte. Clients melden Loeschtreffer
      (z_hose Wasser/Schaum, GTA-Feuerloescher); der Server prueft Waffe,
      Abstand und Trefferrate und zieht Lebenspunkte ab.
    - Ausbreitung nutzt die im Editor vorberechneten Ausbreitungspunkte
      (Bodenhoehe wurde beim Erstellen per Raycast ermittelt).
    - Geloeschte Brandherde koennen glimmen und wieder aufflammen.
    - Clients zeichnen nur Knoten in ihrer Naehe (Config.Fire.renderDistance).
]]

local U = EC.Utils

Fire = {
    nodes = {},   -- id -> Brandherd
    smokes = {},  -- id -> Rauchquelle
    dirty = {},   -- Einsatz-IDs, deren Feuerlage sich geaendert hat
}

local hitBudget = {}  -- src -> { t = Sekunde, n = Anzahl Pakete }

local WEAPON = {}
local function hashList(list)
    local out = {}
    for _, w in ipairs(list or {}) do out[GetHashKey(w)] = true end
    return out
end
WEAPON.water = hashList(Config.ZHose.waterWeapons)
WEAPON.foam = hashList(Config.ZHose.foamWeapons)
WEAPON.extinguisher = GetHashKey('WEAPON_FIREEXTINGUISHER')

local function now() return os.time() end

-- Kompakte Darstellung fuer Clients
local function clientNode(n)
    return {
        id = n.id, inc = n.incident, t = n.fireType, s = n.size,
        h = math.floor(n.health / n.maxHealth * 100 + 0.5),
        st = n.state, p = n.pos, a = n.attachNet, o = n.offset, sm = n.smoke,
    }
end

local function clientSmoke(s)
    return { id = s.id, inc = s.incident, t = s.smokeType, s = s.size, d = s.density, p = s.pos, a = s.attachNet, o = s.offset }
end

local function broadcast(nodes, smokes)
    if (nodes and #nodes > 0) or (smokes and #smokes > 0) then
        TriggerClientEvent(EC.Events.fireState, -1, { nodes = nodes or {}, smokes = smokes or {} })
    end
end

local function broadcastRemove(nodeIds, smokeIds)
    if (nodeIds and #nodeIds > 0) or (smokeIds and #smokeIds > 0) then
        TriggerClientEvent(EC.Events.fireRemove, -1, { nodes = nodeIds or {}, smokes = smokeIds or {} })
    end
end

local function fireType(id)
    return EC.FireTypeById[id] or EC.FireTypeById.normal
end

local function newNode(incident, el, p, size, parent, attachNet)
    local id = U.randomId('F', 7)
    while Fire.nodes[id] do id = U.randomId('F', 7) end
    local maxHealth = Config.Fire.maxHealth * math.max(0.4, size)
    local node = {
        id = id,
        incident = incident.id,
        element = el.id,
        parent = parent,
        fireType = el.props.fireType,
        size = size,
        pos = { x = p.x, y = p.y, z = p.z },
        offset = el.props.offset,
        attachNet = attachNet,
        smoke = el.props.smoke,
        maxHealth = maxHealth,
        health = maxHealth,
        state = 'burning',
        createdAt = now(),
        burnUntil = el.props.burnTime > 0 and (now() + el.props.burnTime) or nil,
        smoulder = el.props.smoulder,
        lastHit = 0,
    }
    Fire.nodes[id] = node
    return node
end

-- Brandherde und Rauch eines Einsatzes erzeugen
function Fire.createForIncident(incident)
    local created = {}
    local smokes = {}
    incident.fire = { spread = {}, extinguished = 0, total = 0 }

    for _, el in ipairs(incident.scenario.elements) do
        local attachNet
        if el.props and el.props.attachTo then
            local rec = incident.entities[el.props.attachTo]
            if rec then attachNet = rec.netId end
        end

        if el.kind == 'fire' then
            local node = newNode(incident, el, el.pos, el.props.size, nil, attachNet)
            incident.fire.total = incident.fire.total + 1
            created[#created + 1] = clientNode(node)
            if el.props.canSpread and not attachNet and #el.props.spreadPoints > 0 then
                incident.fire.spread[el.id] = {
                    points = U.deepcopy(el.props.spreadPoints),
                    max = el.props.maxSpread,
                    interval = el.props.spreadInterval,
                    nextAt = now() + el.props.spreadInterval,
                    spawned = 0,
                    element = el,
                }
            end
        elseif el.kind == 'smoke' then
            local id = U.randomId('S', 7)
            while Fire.smokes[id] do id = U.randomId('S', 7) end
            local s = {
                id = id, incident = incident.id, element = el.id, smokeType = el.props.smokeType,
                size = el.props.size, density = el.props.density, untilFiresOut = el.props.untilFiresOut,
                pos = el.pos, offset = el.props.offset, attachNet = attachNet,
            }
            Fire.smokes[id] = s
            smokes[#smokes + 1] = clientSmoke(s)
        end
    end

    broadcast(created, smokes)
    return #created, #smokes
end

-- Alle Brandherde/Rauchquellen eines Einsatzes entfernen (idempotent)
function Fire.removeIncident(incidentId)
    local nodeIds, smokeIds = {}, {}
    for id, n in pairs(Fire.nodes) do
        if n.incident == incidentId then
            Fire.nodes[id] = nil
            nodeIds[#nodeIds + 1] = id
        end
    end
    for id, s in pairs(Fire.smokes) do
        if s.incident == incidentId then
            Fire.smokes[id] = nil
            smokeIds[#smokeIds + 1] = id
        end
    end
    broadcastRemove(nodeIds, smokeIds)
    return #nodeIds, #smokeIds
end

function Fire.summary(incidentId)
    local burning, smouldering = 0, 0
    for _, n in pairs(Fire.nodes) do
        if n.incident == incidentId then
            if n.state == 'burning' then burning = burning + 1 else smouldering = smouldering + 1 end
        end
    end
    local smoke = 0
    for _, s in pairs(Fire.smokes) do
        if s.incident == incidentId then smoke = smoke + 1 end
    end
    return { burning = burning, smouldering = smouldering, smoke = smoke }
end

-- Vollstaendiger Stand fuer einen neu verbundenen Client
function Fire.fullState()
    local nodes, smokes = {}, {}
    for _, n in pairs(Fire.nodes) do nodes[#nodes + 1] = clientNode(n) end
    for _, s in pairs(Fire.smokes) do smokes[#smokes + 1] = clientSmoke(s) end
    return { nodes = nodes, smokes = smokes }
end

-- Aktuelle Weltposition eines Knotens (bei angehaengten Feuern ueber die Entity)
local function nodeWorldPos(n)
    if n.attachNet then
        local ent = NetworkGetEntityFromNetworkId(n.attachNet)
        if ent and ent ~= 0 and DoesEntityExist(ent) then
            local c = GetEntityCoords(ent)
            return vector3(c.x + n.offset.x, c.y + n.offset.y, c.z + n.offset.z)
        end
    end
    return U.vec(n.pos)
end

----------------------------------------------------------------------------
-- Loeschtreffer von Clients
-- payload = { [nodeId] = { t = Sekunden, m = 'water' | 'foam' | 'extinguisher' } }
----------------------------------------------------------------------------
RegisterNetEvent(EC.Events.fireHits, function(payload)
    local src = source
    if type(payload) ~= 'table' then return end

    -- Rate-Limit
    local sec = os.time()
    local b = hitBudget[src]
    if not b or b.t ~= sec then b = { t = sec, n = 0 } hitBudget[src] = b end
    b.n = b.n + 1
    if b.n > Config.Fire.maxHitsPerSecond then return end

    local ped = GetPlayerPed(src)
    if not ped or ped == 0 then return end
    local weapon = GetSelectedPedWeapon(ped)
    local pcoords = GetEntityCoords(ped)

    local changed, count = {}, 0
    for nodeId, hit in pairs(payload) do
        count = count + 1
        if count > 30 then break end
        local n = type(nodeId) == 'string' and Fire.nodes[nodeId]
        if n and type(hit) == 'table' and (n.state == 'burning' or n.state == 'smoulder') then
            local method = hit.m
            local valid = (method == 'water' and WEAPON.water[weapon])
                or (method == 'foam' and WEAPON.foam[weapon])
                or (method == 'extinguisher' and Config.ZHose.allowExtinguisher and weapon == WEAPON.extinguisher)
            local range = method == 'extinguisher' and Config.Fire.extinguisherRange or Config.Fire.hoseRange
            local ft = fireType(n.fireType)
            local wp = nodeWorldPos(n)
            if valid and #(pcoords - wp) <= range + ft.radius * n.size + 6.0 then
                local t = U.num(hit.t, 0, 0, 0.6)
                local factor = ft[method] or 1.0
                local key = method == 'water' and 'hose' or method
                local dmg = t * (Config.Fire.extinguishPerSecond[key] or 10.0) * factor / math.max(0.1, ft.resistance)
                n.health = n.health - dmg
                n.lastHit = GetGameTimer()
                if n.health <= 0 then
                    n.health = 0
                    if n.state == 'smoulder' or not n.smoulder then
                        n.state = 'out'
                    else
                        n.state = 'smoulder'
                        n.smoulderUntil = now() + Config.Fire.smoulderSeconds
                        n.health = n.maxHealth * 0.25
                    end
                    if n.state == 'out' then
                        Fire.onExtinguished(n, src)
                    end
                end
                changed[#changed + 1] = n
            end
        end
    end

    local updates, removed = {}, {}
    for _, n in ipairs(changed) do
        if n.state == 'out' then
            removed[#removed + 1] = n.id
        else
            local pct = math.floor(n.health / n.maxHealth * 10)
            if pct ~= n.lastSentBucket or n.state ~= n.lastSentState then
                n.lastSentBucket, n.lastSentState = pct, n.state
                updates[#updates + 1] = clientNode(n)
            end
        end
    end
    broadcast(updates)
    broadcastRemove(removed)
end)

function Fire.onExtinguished(n, src)
    Fire.nodes[n.id] = nil
    local inc = Incidents and Incidents.get(n.incident)
    if inc and inc.fire then
        inc.fire.extinguished = inc.fire.extinguished + 1
    end
    Fire.dirty[n.incident] = true
end

----------------------------------------------------------------------------
-- Simulationstakt: Ausbreitung, Erholung, Abbrand, Glutnester, Rauch
----------------------------------------------------------------------------
local function tick()
    local t = now()
    local updates, removed, smokeRemoved = {}, {}, {}
    local touchedIncidents = Fire.dirty
    Fire.dirty = {}

    for id, n in pairs(Fire.nodes) do
        if n.state == 'burning' then
            if n.burnUntil and t >= n.burnUntil then
                -- natuerlich abgebrannt
                Fire.nodes[id] = nil
                removed[#removed + 1] = id
                touchedIncidents[n.incident] = true
            elseif n.health < n.maxHealth and GetGameTimer() - n.lastHit > 4000 then
                n.health = math.min(n.maxHealth, n.health + Config.Fire.regenPerTick * n.size)
                local pct = math.floor(n.health / n.maxHealth * 10)
                if pct ~= n.lastSentBucket then
                    n.lastSentBucket = pct
                    updates[#updates + 1] = clientNode(n)
                end
            end
        elseif n.state == 'smoulder' then
            if n.smoulderUntil and t >= n.smoulderUntil then
                n.state = 'out'
                Fire.nodes[id] = nil
                removed[#removed + 1] = id
                local inc = Incidents.get(n.incident)
                if inc and inc.fire then inc.fire.extinguished = inc.fire.extinguished + 1 end
                touchedIncidents[n.incident] = true
            elseif GetGameTimer() - n.lastHit > 8000 and math.random(100) <= Config.Fire.reigniteChance then
                n.state = 'burning'
                n.health = n.maxHealth * 0.35
                n.smoulderUntil = nil
                updates[#updates + 1] = clientNode(n)
                touchedIncidents[n.incident] = true
            end
        end
    end

    -- Ausbreitung
    for incidentId, inc in pairs(Incidents and Incidents.list or {}) do
        if inc.status == EC.Status.active and inc.fire and inc.fire.spread then
            for elementId, sp in pairs(inc.fire.spread) do
                if t >= sp.nextAt and sp.spawned < sp.max and #sp.points > 0 then
                    sp.nextAt = t + sp.interval
                    -- nur ausbreiten, wenn das Ursprungsfeuer (oder ein Ableger) noch kraeftig brennt
                    local strong = false
                    for _, n in pairs(Fire.nodes) do
                        if n.incident == incidentId and n.element == elementId and n.state == 'burning'
                            and n.health >= n.maxHealth * 0.5 then
                            strong = true
                            break
                        end
                    end
                    if strong then
                        local idx = math.random(#sp.points)
                        local p = table.remove(sp.points, idx)
                        local node = newNode(inc, sp.element, p, math.max(0.3, sp.element.props.size * 0.8), elementId, nil)
                        sp.spawned = sp.spawned + 1
                        inc.fire.total = inc.fire.total + 1
                        updates[#updates + 1] = clientNode(node)
                        touchedIncidents[incidentId] = true
                    end
                end
            end
        end
    end

    -- Rauch, der nur so lange besteht wie die Feuer des Einsatzes
    for incidentId in pairs(touchedIncidents) do
        local s = Fire.summary(incidentId)
        if s.burning == 0 and s.smouldering == 0 then
            for sid, smoke in pairs(Fire.smokes) do
                if smoke.incident == incidentId and smoke.untilFiresOut then
                    Fire.smokes[sid] = nil
                    smokeRemoved[#smokeRemoved + 1] = sid
                end
            end
        end
        local inc = Incidents.get(incidentId)
        if inc then Incidents.onFireChanged(inc) end
    end

    broadcast(updates)
    broadcastRemove(removed, smokeRemoved)
end

CreateThread(function()
    while true do
        Wait(Config.Fire.tickSeconds * 1000)
        if next(Fire.nodes) or next(Fire.smokes) or next(Fire.dirty) then
            local ok, err = pcall(tick)
            if not ok then U.log('error', 'Feuer-Simulation: %s', tostring(err)) end
        end
    end
end)

AddEventHandler('playerDropped', function()
    hitBudget[source] = nil
end)
