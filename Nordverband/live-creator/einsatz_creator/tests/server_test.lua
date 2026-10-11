--[[
    Offline-Test der Server-Logik (ausserhalb von FiveM)

    Simuliert die benoetigten FiveM-Natives und spielt einen kompletten
    Einsatz durch: Speichern, Ausloesen, Loeschen mit z_hose, Patientenablauf,
    Tueroeffnung, Oelspur, Beenden, Neustart-Bereinigung, beschaedigte Dateien.

    Aufruf (im Resource-Ordner):  lua5.4 tests/server_test.lua
    Benoetigt: dkjson (z. B. Paket lua-dkjson)
]]

package.path = package.path .. ';/usr/share/lua/5.4/?.lua'
local dkjson = require('dkjson')

----------------------------------------------------------------------------
-- Stubs
----------------------------------------------------------------------------
local V = {}
V.__index = V
function vector3(x, y, z) return setmetatable({ x = x + 0.0, y = y + 0.0, z = z + 0.0 }, V) end
V.__add = function(a, b) return vector3(a.x + b.x, a.y + b.y, a.z + b.z) end
V.__sub = function(a, b) return vector3(a.x - b.x, a.y - b.y, a.z - b.z) end
V.__mul = function(a, b)
    if type(a) == 'number' then return vector3(b.x * a, b.y * a, b.z * a) end
    return vector3(a.x * b, a.y * b, a.z * b)
end
V.__div = function(a, b) return vector3(a.x / b, a.y / b, a.z / b) end
V.__len = function(a) return math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) end

json = {
    encode = function(v, opts) return dkjson.encode(v, opts and { indent = opts.indent } or nil) end,
    decode = function(s) local v, _, err = dkjson.decode(s) if err then error(err) end return v end,
}

local clock = 1000
function GetGameTimer() return clock end
local function advance(ms) clock = clock + ms end

function IsDuplicityVersion() return true end
function GetCurrentResourceName() return 'einsatz_creator' end
function GetResourceState() return 'missing' end
function GetConvar() return 'on' end
function Wait(ms) clock = clock + (ms or 0) + 1 end
function CreateThread() end
function SetTimeout(_, fn) fn() end

local netHandlers, eventHandlers, clientEvents, serverEvents, exported = {}, {}, {}, {}, {}
function RegisterNetEvent(name, fn) if fn then netHandlers[name] = fn end end
function AddEventHandler(name, fn) eventHandlers[name] = eventHandlers[name] or {} table.insert(eventHandlers[name], fn) end
function TriggerClientEvent(name, target, ...) table.insert(clientEvents, { name = name, target = target, args = { ... } }) end
function TriggerEvent(name, ...) table.insert(serverEvents, { name = name, args = { ... } }) end
function exports(name, fn) exported[name] = fn end
function AddStateBagChangeHandler() end

-- Dateien im Speicher
local files = {}
function LoadResourceFile(_, path) return files[path] end
function SaveResourceFile(_, path, content) files[path] = content return true end

-- Spieler
local player = { ped = 9001, coords = vector3(0, 0, 0), weapon = 0 }
function GetPlayers() return { '1' } end
function GetPlayerName(src) return tonumber(src) == 1 and 'Tester' or nil end
function GetPlayerPed() return player.ped end
function IsPlayerAceAllowed() return true end
function GetPlayerIdentifierByType(_, kind) return kind == 'license' and 'license:test' or nil end
function GetSelectedPedWeapon() return player.weapon end

local function hash(s)
    local h = 0
    for i = 1, #s do h = (h * 31 + s:lower():byte(i)) % 4294967296 end
    if h >= 2147483648 then h = h - 4294967296 end
    return h
end
GetHashKey = hash

-- Entities
local ents, nextEnt = {}, 100
local function newEnt(kind, model, x, y, z)
    nextEnt = nextEnt + 1
    ents[nextEnt] = { kind = kind, model = model, pos = vector3(x, y, z), net = nextEnt + 5000, state = {}, seats = {} }
    return nextEnt
end
function CreateVehicleServerSetter(model, _, x, y, z) return newEnt('vehicle', model, x, y, z) end
function CreateObjectNoOffset(model, x, y, z) return newEnt('object', model, x, y, z) end
function CreatePed(_, model, x, y, z) return newEnt('ped', model, x, y, z) end
function DoesEntityExist(e) return e == player.ped or ents[e] ~= nil end
function DeleteEntity(e) ents[e] = nil end
function NetworkGetNetworkIdFromEntity(e) return ents[e] and ents[e].net end
function NetworkGetEntityFromNetworkId(n)
    for e, d in pairs(ents) do if d.net == n then return e end end
    return 0
end
function GetEntityCoords(e)
    if e == player.ped then return player.coords end
    local d = ents[e]
    if d and d.vehicle and ents[d.vehicle] then return ents[d.vehicle].pos end
    return d and d.pos or vector3(0, 0, 0)
end
function GetEntityModel(e) return ents[e] and ents[e].model or 0 end
function GetEntityType(e) local d = ents[e] return d and ({ ped = 1, vehicle = 2, object = 3 })[d.kind] or 0 end
function GetEntityHeading() return 90.0 end
function GetVehiclePedIsIn(ped) return ents[ped] and ents[ped].vehicle or 0 end
function GetPedInVehicleSeat(veh, seat) return ents[veh] and ents[veh].seats[seat] or 0 end
function SetPedIntoVehicle(ped, veh, seat)
    ents[ped].vehicle = veh
    ents[veh].seats[seat] = ped
    ents[ped].pos = ents[veh].pos
end
function ClearPedTasksImmediately(ped)
    local veh = ents[ped] and ents[ped].vehicle
    if veh and ents[veh] then
        for s, p in pairs(ents[veh].seats) do if p == ped then ents[veh].seats[s] = nil end end
    end
    if ents[ped] then ents[ped].vehicle = nil end
end
function SetEntityCoords(e, x, y, z) if ents[e] then ents[e].pos = vector3(x, y, z) end end
function Entity(e)
    local d = ents[e]
    return { state = setmetatable({ set = function(_, k, v) d.state[k] = v end }, { __index = function(_, k) return d.state[k] end }) }
end
for _, n in ipairs({ 'SetEntityRotation', 'FreezeEntityPosition', 'SetVehicleDoorsLocked', 'SetVehicleNumberPlateText', 'SetVehicleColours' }) do
    _G[n] = function() end
end

----------------------------------------------------------------------------
-- Resource laden (Reihenfolge wie fxmanifest)
----------------------------------------------------------------------------
local files_to_load = {
    'config.lua', 'config_catalog.lua', 'shared/constants.lua', 'shared/utils.lua', 'shared/schema.lua',
    'server/storage.lua', 'bridge/framework.lua', 'server/permissions.lua', 'server/validation.lua',
    'server/spawner.lua', 'server/fire.lua', 'server/rescue.lua', 'bridge/dispatch.lua', 'server/alarm.lua',
    'server/incidents.lua', 'server/main.lua',
}
for _, f in ipairs(files_to_load) do dofile(f) end

local passed, failed = 0, 0
local function check(cond, msg)
    if cond then passed = passed + 1 print('  ok   ' .. msg)
    else failed = failed + 1 print('  FAIL ' .. msg) end
end

local function fire(name, ...) for _, fn in ipairs(eventHandlers[name] or {}) do fn(...) end end

-- Anfrage wie vom Client
local reqId = 0
local function request(name, payload)
    reqId = reqId + 1
    source = 1
    netHandlers[EC.Events.request](reqId, name, payload)
    for i = #clientEvents, 1, -1 do
        local ev = clientEvents[i]
        if ev.name == EC.Events.response and ev.args[1] == reqId then
            return ev.args[2], ev.args[3]
        end
    end
    error('keine Antwort auf ' .. name)
end

local function waitRate() advance(5000) end

----------------------------------------------------------------------------
print('Start')
fire('onResourceStart', 'einsatz_creator')

local center = { x = 200.0, y = -800.0, z = 30.0 }
local scenario = {
    name = 'VU mit eingeklemmter Person',
    category = 'vu',
    keyword = 'VU - Person eingeklemmt',
    priority = 1,
    info = { alarmText = 'PKW gegen Baum, Person eingeklemmt, Fahrzeug brennt', units = { 'HLF', 'RTW' },
        custom = { unfallart = 'Fahrzeug gegen Baum', verletzte = 1, eingeklemmt = 1, brand = true } },
    center = center,
    elements = {
        { id = 'veh1', kind = 'vehicle', model = 'sultan', pos = { x = 201, y = -801, z = 30.5 }, rot = { x = 0, y = 0, z = 90 }, props = { damage = 3, hazard = true } },
        { id = 'ped1', kind = 'ped', model = 'a_m_m_business_01', pos = { x = 201, y = -801, z = 30.5 }, rot = { z = 0 },
            props = { pose = 'fahrzeug', vehicleId = 'veh1', seat = -1, isPatient = true,
                patient = { name = 'Fahrer', severity = 'schwer', mobility = 'eingeklemmt', injuries = { 'Polytrauma' } } } },
        { id = 'ped2', kind = 'ped', model = 'a_f_y_tourist_01', pos = { x = 205, y = -805, z = 30.0 }, props = { pose = 'sitzend', isPatient = true,
            patient = { severity = 'leicht', mobility = 'gehfaehig' } } },
        { id = 'fire1', kind = 'fire', pos = { x = 202, y = -801, z = 31 }, props = { fireType = 'fahrzeug', size = 1.0, attachTo = 'veh1', offset = { x = 1, y = 0, z = 0.5 } } },
        { id = 'fire2', kind = 'fire', pos = { x = 210, y = -810, z = 30 }, props = { fireType = 'vegetation', canSpread = true, maxSpread = 2, spreadInterval = 10,
            spreadPoints = { { x = 212, y = -810, z = 30 }, { x = 208, y = -812, z = 30 } } } },
        { id = 'smk1', kind = 'smoke', pos = { x = 202, y = -801, z = 32 }, props = { smokeType = 'stark', untilFiresOut = true } },
        { id = 'door1', kind = 'door', pos = { x = 190, y = -790, z = 30 }, props = { linked = { 'ped2' } } },
        { id = 'oil1', kind = 'spill', pos = { x = 198, y = -799, z = 30 }, props = { spillKind = 'oel' } },
        { id = 'mk1', kind = 'marker', pos = { x = 195, y = -795, z = 30 }, props = { markerKind = 'fundstelle', interactive = true } },
        { id = 'area1', kind = 'area', pos = center, props = { radius = 60 } },
    },
}

print('Validierung')
local sc, err = EC.Schema.normalizeScenario(scenario)
check(sc ~= nil, 'Szenario ist gueltig ' .. tostring(err or ''))
check(sc and sc.info.custom.unfallart == 'Fahrzeug gegen Baum', 'Art-spezifisches Feld uebernommen')
check(sc and #sc.info.alarmRoles == 3, 'Standard-Alarmrollen der Einsatzart gesetzt')
local bad = EC.Utils.deepcopy(scenario)
bad.elements[1].pos = { x = 5000, y = 0, z = 0 }
check(EC.Schema.normalizeScenario(bad) == nil, 'Position ausserhalb wird abgelehnt')
bad = EC.Utils.deepcopy(scenario)
bad.elements[1].model = 'rhino'
check(Validate.scenario(bad) == nil, 'Gesperrtes Modell wird abgelehnt')
bad = EC.Utils.deepcopy(scenario)
bad.elements[1].model = 'abc"; drop'
check(EC.Schema.normalizeScenario(bad) == nil, 'Manipulierter Modellname wird abgelehnt')

print('Speichern')
local ok, res = request('saveScenario', { scenario = scenario })
check(ok and res.id, 'Szenario gespeichert ' .. tostring(ok and res.id or res))
local scenarioId = ok and res.id
waitRate()
ok, res = request('saveScenario', { scenario = scenario })
check(not ok or res.id ~= scenarioId, 'Neues Szenario ohne ID bekommt neue ID')
check(files['data/scenarios.json'] ~= nil, 'scenarios.json geschrieben')

print('Ausloesen (live)')
waitRate()
local s2 = EC.Utils.deepcopy(sc)
s2.id = scenarioId
ok, res = request('trigger', { scenario = s2, scenarioId = scenarioId, mode = 'live' })
check(ok, 'Live-Einsatz erstellt ' .. tostring(ok and res.id or res))
local incId = ok and res.id
local inc = Incidents.get(incId)
check(inc and inc.status == 'aktiv', 'Status aktiv')
check(inc and EC.Utils.tableCount(inc.entities) == 3, 'Fahrzeug + 2 NPCs erzeugt')
local bridgeCreated = false
for _, ev in ipairs(serverEvents) do if ev.name == 'einsatzcreator:bridge:created' then bridgeCreated = ev.args[1] end end
check(bridgeCreated and bridgeCreated.incidentId == incId and bridgeCreated.priority == 1, 'Leitstellen-Bridge "created" mit Payload')
local alarmed = false
for _, ev in ipairs(clientEvents) do if ev.name == EC.Events.alarm then alarmed = true end end
check(alarmed, 'Interne Alarmierung gesendet')

waitRate()
ok, res = request('trigger', { scenarioId = scenarioId, mode = 'live' })
check(not ok, 'Doppelte Ausloesung desselben Szenarios verhindert: ' .. tostring(res))

print('Feuer loeschen mit z_hose')
local nodes = {}
for id, n in pairs(Fire.nodes) do if n.incident == incId then nodes[#nodes + 1] = n end end
check(#nodes == 2, 'Zwei Brandherde angelegt')
local vegNode
for _, n in ipairs(nodes) do if n.fireType == 'vegetation' then vegNode = n end end
player.coords = vector3(205, -805, 30)
player.weapon = 0
source = 1
netHandlers[EC.Events.fireHits]({ [vegNode.id] = { t = 0.5, m = 'water' } })
check(vegNode.health == vegNode.maxHealth, 'Ohne Strahlrohr kein Loescheffekt')
player.weapon = GetHashKey('WEAPON_REELBRANCH')
for _ = 1, 60 do
    advance(1100)
    if not Fire.nodes[vegNode.id] or Fire.nodes[vegNode.id].state ~= 'burning' then break end
    netHandlers[EC.Events.fireHits]({ [vegNode.id] = { t = 0.5, m = 'water' } })
end
check(Fire.nodes[vegNode.id] == nil or Fire.nodes[vegNode.id].state == 'smoulder', 'Brandherd geloescht bzw. glimmt')
-- Glutnest nachloeschen
for _ = 1, 30 do
    if not Fire.nodes[vegNode.id] then break end
    advance(1100)
    netHandlers[EC.Events.fireHits]({ [vegNode.id] = { t = 0.5, m = 'water' } })
end
check(Fire.nodes[vegNode.id] == nil, 'Glutnest nachgeloescht')
player.coords = vector3(900, 900, 30)
local other
for _, n in ipairs(nodes) do if n ~= vegNode then other = n end end
local before = other.health
advance(1100)
netHandlers[EC.Events.fireHits]({ [other.id] = { t = 0.5, m = 'water' } })
check(other.health == before, 'Treffer aus zu grosser Entfernung wird ignoriert')

print('Patientenablauf')
local veh = inc.entities.veh1.entity
player.coords = GetEntityCoords(veh)
waitRate()
ok, res = request('rescueStart', { incidentId = incId, targetId = 'ped1', action = 'treat' })
check(not ok, 'Behandeln ohne Sichtung abgelehnt')
local function doAction(target, action, extra)
    waitRate()
    local sok, sres = request('rescueStart', { incidentId = incId, targetId = target, action = action })
    if not sok then return false, sres end
    advance((sres.duration or 0) * 1000 + 100)
    waitRate()
    return request('rescueComplete', { incidentId = incId, targetId = target, action = action, extra = extra })
end
ok, res = doAction('ped1', 'assess')
check(ok and res.patient and res.patient.severity == 'schwer', 'Sichtung liefert Patientendaten')
waitRate()
local sok = request('rescueStart', { incidentId = incId, targetId = 'ped1', action = 'free' })
waitRate()
ok, res = request('rescueComplete', { incidentId = incId, targetId = 'ped1', action = 'free' })
check(not ok, 'Zu frueh abgeschlossene Massnahme abgelehnt: ' .. tostring(res))
ok = doAction('ped1', 'free')
check(ok and Rescue.patientStatus(inc.rescue.patients.ped1) == 'gesichtet', 'Patient befreit')
ok = doAction('ped1', 'treat')
check(ok and Rescue.patientStatus(inc.rescue.patients.ped1) == 'stabil', 'Patient versorgt')
local amb = newEnt('vehicle', GetHashKey('ambulance'), player.coords.x + 2, player.coords.y, player.coords.z)
ok, res = doAction('ped1', 'load', { vehicleNet = NetworkGetNetworkIdFromEntity(amb) })
check(ok and Rescue.patientStatus(inc.rescue.patients.ped1) == 'im_fahrzeug', 'Patient eingeladen ' .. tostring(res))
ok = doAction('ped1', 'handover')
check(not ok, 'Uebergabe ohne Klinik abgelehnt')
local h = Config.Rescue.hospitals[1].coords
ents[amb].pos = vector3(h.x, h.y, h.z)
player.coords = vector3(h.x + 1, h.y, h.z)
ok, res = doAction('ped1', 'handover')
check(ok and res.hospital, 'Patient in Klinik uebergeben')
check(inc.entities.ped1 == nil, 'Patienten-NPC nach Uebergabe entfernt')

print('Tuer, Oelspur, Fundstelle')
player.coords = vector3(205, -805, 30)
ok, res = doAction('ped2', 'assess')
check(not ok, 'Patient hinter verschlossener Tuer nicht erreichbar')
player.coords = vector3(190, -790, 30)
ok = doAction('door1', 'open')
check(ok and inc.rescue.doors.door1.status == 'geoeffnet', 'Tuer geoeffnet')
player.coords = vector3(205, -805, 30)
ok = doAction('ped2', 'assess')
check(ok, 'Patient nach Tueroeffnung erreichbar')
ok = doAction('ped2', 'release')
check(ok and inc.rescue.patients.ped2.released, 'Leicht verletzter Patient vor Ort entlassen')
player.coords = vector3(198, -799, 30)
ok = doAction('oil1', 'clean')
check(ok and inc.rescue.spills.oil1.status == 'beseitigt', 'Oelspur beseitigt')
player.coords = vector3(195, -795, 30)
ok = doAction('mk1', 'secure')
check(ok and inc.rescue.markers.mk1.status == 'gesichert', 'Fundstelle gesichert')

print('Phase und Beenden')
waitRate()
ok = request('incidentAction', { id = incId, action = 'phase', phase = 'vor_ort' })
check(ok and inc.phase == 'vor_ort', 'Phase gesetzt')
local entCount = 0
for _ in pairs(ents) do entCount = entCount + 1 end
waitRate()
ok, res = request('incidentAction', { id = incId, action = 'cancel' })
check(ok, 'Einsatz abgebrochen: ' .. tostring(res))
check(Incidents.get(incId) == nil, 'Einsatz aus aktiver Liste entfernt')
local left = 0
for e, d in pairs(ents) do if d.state.ec and d.state.ec.i == incId then left = left + 1 end end
check(left == 0, 'Alle Einsatz-Entities entfernt')
check(ents[amb] ~= nil, 'Fremdes Fahrzeug (RTW) nicht angefasst')
local leftFires = 0
for _, n in pairs(Fire.nodes) do if n.incident == incId then leftFires = leftFires + 1 end end
check(leftFires == 0, 'Alle Feuer entfernt')
waitRate()
ok, res = request('incidentAction', { id = incId, action = 'cancel' })
check(ok and tostring(res):find('bereits'), 'Zweites Beenden ist idempotent')
check(#Storage.history >= 1 and Storage.history[1].id == incId, 'Verlaufseintrag geschrieben')

print('Test-Modus und Rollback')
waitRate()
ok, res = request('trigger', { scenarioId = scenarioId, mode = 'test' })
check(ok, 'Testeinsatz erstellt')
local bridgeForTest = false
for _, ev in ipairs(serverEvents) do
    if ev.name == 'einsatzcreator:bridge:created' and ev.args[1].incidentId == res.id then bridgeForTest = true end
end
check(not bridgeForTest, 'Testeinsatz geht NICHT an die Leitstelle')
local testId = res.id
-- Neustart simulieren: Laufzeitdaten bleiben, Resource startet neu
local persisted = files['data/runtime.json']
check(persisted and persisted:find(testId, 1, true), 'Laufzeitdaten enthalten aktiven Einsatz')
Incidents.list = {}
Incidents.recover()
local leftTest = 0
for _, d in pairs(ents) do if d.state.ec and d.state.ec.i == testId then leftTest = leftTest + 1 end end
check(leftTest == 0, 'Nach Neustart: zurueckgebliebene Entities entfernt')

local oldCreate = CreateVehicleServerSetter
CreateVehicleServerSetter = function() return 0 end
Fire.nodes, Fire.smokes = {}, {}
waitRate()
ok, res = request('trigger', { scenarioId = scenarioId, mode = 'test' })
check(not ok, 'Fehler beim Aufbau wird gemeldet: ' .. tostring(res))
local orphan = 0
for _, d in pairs(ents) do if d.state.ec and d.state.ec.i and Incidents.get(d.state.ec.i) == nil then orphan = orphan + 1 end end
check(orphan == 0, 'Rollback: keine halb erzeugten Entities')
CreateVehicleServerSetter = oldCreate

print('Speicherung: Neustart und beschaedigte Datei')
Storage.loadScenarios()
check(Storage.scenarios[scenarioId] ~= nil, 'Szenario nach Neustart geladen')
files['data/scenarios.json'] = '{ kaputt'
Storage.loadScenarios()
check(Storage.scenarios[scenarioId] ~= nil, 'Beschaedigte Datei: Backup geladen')
local corruptKept = false
for k in pairs(files) do if k:find('scenarios.json.corrupt', 1, true) then corruptKept = true end end
check(corruptKept, 'Beschaedigte Datei als .corrupt gesichert')

print('Berechtigungen')
IsPlayerAceAllowed = function() return false end
waitRate()
ok, res = request('trigger', { scenarioId = scenarioId, mode = 'live' })
check(not ok and res == 'Keine Berechtigung', 'Ohne Rechte kein Ausloesen')
waitRate()
ok, res = request('deleteScenario', { id = scenarioId })
check(not ok, 'Ohne Rechte kein Loeschen')

print(('\n%d bestanden, %d fehlgeschlagen'):format(passed, failed))
os.exit(failed == 0 and 0 or 1)
