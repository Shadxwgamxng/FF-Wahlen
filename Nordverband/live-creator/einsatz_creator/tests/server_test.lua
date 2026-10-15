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
function GetResourcePath() return '/nicht/vorhanden/einsatz_creator' end
os.execute = function() return true end
io.popen = function() return nil end
function GetResourceState() return 'missing' end
function GetConvar() return 'on' end
function Wait(ms) clock = clock + (ms or 0) + 1 end
function CreateThread() end
function SetTimeout(_, fn) fn() end
promise = { new = function()
    local p = { done = false }
    function p:resolve(v) if not self.done then self.done, self.value = true, v end end
    return p
end }
Citizen = { Await = function(p) return p.value end }

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
    'config.lua', 'config_catalog.lua', 'config_medical.lua', 'config_material.lua', 'config_names.lua', 'shared/constants.lua', 'shared/utils.lua', 'shared/schema.lua',
    'server/storage.lua', 'bridge/framework.lua', 'server/permissions.lua', 'server/validation.lua',
    'server/spawner.lua', 'server/fire.lua', 'server/zfire.lua', 'server/medical.lua', 'bridge/inventory.lua', 'bridge/tools.lua', 'server/variants.lua', 'server/rescue.lua', 'bridge/dispatch.lua', 'server/alarm.lua',
    'server/incidents.lua', 'server/random.lua', 'server/main.lua',
}
for _, f in ipairs(files_to_load) do dofile(f) end
Storage.init()
local initBackendOk = Storage.backend == 'json' and Storage.ready
-- Grundtests mit eigenem Feuersystem und Event-Bridge; z_fire/EmergencyDispatch werden weiter unten getestet
Config.Fire.backend = 'internal'
Config.Dispatch.adapter = 'event'
Config.Framework = 'none'
Config.Medical.enabled = false   -- Grundablauf zuerst ohne detaillierte Behandlung

local passed, failed = 0, 0
local function check(cond, msg)
    if cond then passed = passed + 1 print('  ok   ' .. msg)
    else failed = failed + 1 print('  FAIL ' .. msg) end
end
check(initBackendOk, 'Ohne oxmysql: JSON-Speicherung')

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
        { id = 'tree1', kind = 'object', model = 'prop_tree_fallen_pine_01', pos = { x = 196, y = -797, z = 30 }, props = {} },
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
check(files['data/incidents/index.json'] ~= nil and files['data/incidents/' .. tostring(scenarioId) .. '.json'] ~= nil, 'Einsatz als eigene Datei gespeichert (incidents/<ID>.json + index.json)')

print('Ausloesen (live)')
waitRate()
local s2 = EC.Utils.deepcopy(sc)
s2.id = scenarioId
ok, res = request('trigger', { scenario = s2, scenarioId = scenarioId, mode = 'live' })
check(ok, 'Live-Einsatz erstellt ' .. tostring(ok and res.id or res))
local incId = ok and res.id
local inc = Incidents.get(incId)
check(inc and inc.status == 'aktiv', 'Status aktiv')
check(inc and EC.Utils.tableCount(inc.entities) == 4, 'Fahrzeug, 2 NPCs und Baum erzeugt')
local bridgeCreated = false
for _, ev in ipairs(serverEvents) do if ev.name == 'einsatzcreator:bridge:created' then bridgeCreated = ev.args[1] end end
check(bridgeCreated and bridgeCreated.incidentId == incId and bridgeCreated.priority == 1, 'Leitstellen-Bridge "created" mit Payload')
local alarmed = false
for _, ev in ipairs(clientEvents) do if ev.name == 'einsatzcreator:client:alarm' then alarmed = true end end
check(not alarmed, 'Keine eigene Alarmierung an Spieler/Jobs')

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
Config.Tools.minigames.minSeconds = 8
local sok, sres = request('rescueStart', { incidentId = incId, targetId = 'ped1', action = 'free' })
check(sok and sres.minigame == 'tdspreader', 'Befreien laeuft als Spreizer-Minispiel')
waitRate()
ok, res = request('rescueComplete', { incidentId = incId, targetId = 'ped1', action = 'free' })
check(not ok, 'Zu frueh abgeschlossene Massnahme abgelehnt: ' .. tostring(res))
ok = doAction('ped1', 'free')
check(ok and Rescue.patientStatus(inc.rescue.patients.ped1) == 'gesichtet', 'Patient befreit')
ok = doAction('ped1', 'treat')
check(ok and Rescue.patientStatus(inc.rescue.patients.ped1) == 'stabil', 'Patient versorgt')
local amb = newEnt('vehicle', GetHashKey('bftecrtw'), player.coords.x + 2, player.coords.y, player.coords.z)
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
ok, res = doAction('oil1', 'sweep')
check(not ok and tostring(res):find('abstreuen'), 'Aufkehren erst nach dem Abstreuen')
ok = doAction('oil1', 'bind')
check(ok and inc.rescue.spills.oil1.status == 'abgestreut', 'Oelbindemittel abgestreut')
ok = doAction('oil1', 'sweep')
check(ok and inc.rescue.spills.oil1.status == 'beseitigt', 'Oelspur aufgekehrt und beseitigt')
check(inc.rescue.trees.tree1 and inc.rescue.trees.tree1.status == 'liegt', 'Baummodell automatisch als Hindernis erkannt')
-- Werkzeuge aus Technical Dispatches
check(Config.Tools.require == false and Tools.check(1, 'saw') == true, 'Standard: keine Items noetig')
Config.Tools.require = 'auto'
local tdItems = {}
local oldGRS = GetResourceState
GetResourceState = function(r) if r == 'technical_dispatches' or r == 'ox_inventory' then return 'started' end return oldGRS(r) end
local oldEx2 = exports
exports = setmetatable({}, { __call = oldEx2, __index = function(_, k)
    if k == 'ox_inventory' then return { Search = function(_, src, what, name) return tdItems[name] or 0 end, RemoveItem = function() return true end } end
    return oldEx2[k] end })
player.coords = vector3(196, -797, 30)
ok, res = doAction('tree1', 'saw')
check(not ok and tostring(res):find('Kettensaege'), 'Ohne Kettensaege kein Zersaegen: ' .. tostring(res))
tdItems.kettensaege = 1
local treeEnt = inc.entities.tree1
ok, res = doAction('tree1', 'saw')
check(ok and inc.rescue.trees.tree1.status == 'gesaegt' and inc.entities.tree1 == nil, 'Baum mit Kettensaege zersaegt und entfernt')
check(Incidents.tasksDone(inc) == false, 'Spaene zaehlen als offene Aufgabe')
ok, res = doAction('tree1', 'sweepchips')
check(not ok and tostring(res):find('Besen'), 'Ohne Besen keine Spaene aufkehren: ' .. tostring(res))
tdItems.besen = 1
ok, res = doAction('tree1', 'saw')
check(not ok, 'Zersaegter Baum kann nicht erneut gesaegt werden')
ok, res = doAction('tree1', 'sweepchips')
check(ok and inc.rescue.trees.tree1.status == 'beseitigt', 'Saegespaene mit Besen aufgekehrt: ' .. tostring(res))
exports, GetResourceState = oldEx2, oldGRS
Config.Tools.require = false
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
Storage.init()
check(Storage.scenarios[scenarioId] ~= nil, 'Szenario nach Neustart geladen')
files['data/incidents/index.json'] = '{ kaputt'
Storage.init()
check(Storage.scenarios[scenarioId] ~= nil, 'Beschaedigte Datei: Backup geladen')
local corruptKept = false
for k in pairs(files) do if k:find('index.json.corrupt', 1, true) then corruptKept = true end end
check(corruptKept, 'Beschaedigte Datei als .corrupt gesichert')

print('z_fire-Backend und EmergencyDispatch')
IsPlayerAceAllowed = function() return true end
local zf = { fires = {}, smokes = {}, created = {} }
local resources = { z_fire = 'started', emergencydispatch = 'started' }
GetResourceState = function(r) return resources[r] or 'missing' end
local zexp = {
    createFire = function(_, data, src)
        if data == nil or data.ptfxData.fallbackPos == nil then return nil end   -- wie das echte z_fire
        local id = 'zf' .. tostring(#zf.created + 1)
        zf.created[#zf.created + 1] = data
        zf.fires[id] = { ptfxData = data.ptfxData, origin = data.origin }
        return id
    end,
    createSmoke = function(_, data) local id = 'zs' .. tostring(#zf.created + 1) zf.created[#zf.created + 1] = data zf.smokes[id] = data return id end,
    getAllFires = function() return zf.fires end,
    getAllSmoke = function() return zf.smokes end,
    deleteFire = function(_, list) for _, e in ipairs(list) do zf.fires[e.id] = nil end return true end,
}
exports = setmetatable({}, { __call = function(_, name, fn) exported[name] = fn end, __index = function(_, k) if k == 'z_fire' then return zexp end end })
Config.Fire.backend = 'auto'
check(EC.fireBackend() == 'z_fire', 'auto: z_fire laeuft -> z_fire-Backend')
resources.z_fire = 'stopped'
check(EC.fireBackend() == 'internal', 'auto: ohne z_fire -> eigenes Feuersystem')
resources.z_fire = 'started'
Config.Dispatch.adapter = 'emergencydispatch'
Incidents.list, Fire.nodes, Fire.smokes = {}, {}, {}
serverEvents = {}
waitRate()
ok, res = request('trigger', { scenarioId = scenarioId, mode = 'live' })
check(ok, 'Live-Einsatz mit z_fire erstellt ' .. tostring(ok and res.id or res))
local zinc = ok and Incidents.get(res.id)
local vehFire, grassFire
for _, d in ipairs(zf.created) do
    if d.behaviourType == 'vehicle' then vehFire = d elseif d.behaviourType == 'grass' then grassFire = d end
end
check(vehFire and vehFire.networkEntity and vehFire.ptfxData.fallbackPos, 'Fahrzeugbrand mit networkEntity und fallbackPos an z_fire')
check(grassFire and grassFire.canSpread == true and grassFire.spreadSize, 'Flaechenbrand mit Ausbreitung an z_fire')
check(grassFire and grassFire.ptfxData.fallbackPos ~= nil, 'Auch Flaechenbrand bekommt fallbackPos (von z_fire verlangt)')
local calls = {}
for _, ev in ipairs(serverEvents) do if ev.name == 'emergencydispatch:emergencycall:new' then calls[#calls + 1] = ev.args end end
check(#calls == 1 and calls[1][1] == 'ambulance', 'Fester Job: genau ein Notruf an ambulance (' .. #calls .. ')')
check(calls[1] and type(calls[1][2]) == 'string' and calls[1][3].x and calls[1][4] == true, 'Notruf-Parameter: job, meldung, coords, true')
do
    local before = zinc.scenario.info.dispatchJob
    check(before == 'ambulance', 'Szenario ohne Auswahl bekommt Vorauswahl ambulance')
    zinc.scenario.info.dispatchJob = 'fire'
    serverEvents = {}
    Dispatch.created(zinc)
    local c2 = {}
    for _, ev in ipairs(serverEvents) do if ev.name == 'emergencydispatch:emergencycall:new' then c2[#c2 + 1] = ev.args end end
    check(#c2 == 1 and c2[1][1] == 'fire', 'Im Szenario gewaehlte Leitstelle wird genutzt (' .. #c2 .. ')')
    local n = EC.Schema.normalizeScenario({ name = 'x', category = 'brand', center = { x = 1, y = 2, z = 3 }, info = { dispatchJob = 'hacker' } })
    check(n and n.info.dispatchJob == 'ambulance', 'Unbekannte Leitstelle wird auf Vorauswahl gesetzt')
    zinc.scenario.info.dispatchJob = before
end
local foreignId = 'fremd1'
zf.fires[foreignId] = { origin = { is = true } }
waitRate()
ok = request('incidentAction', { id = zinc.id, action = 'end' })
local ownLeft = 0
for id in pairs(zf.fires) do if id ~= foreignId then ownLeft = ownLeft + 1 end end
check(ok and ownLeft == 0, 'Eigene z_fire-Feuer beim Beenden geloescht')
check(zf.fires[foreignId] ~= nil, 'Fremdes z_fire-Feuer bleibt unberuehrt')
local smokeDel = false
for _, ev in ipairs(clientEvents) do if ev.name == 'einsatzcreator:client:zfireDeleteSmoke' then smokeDel = true end end
check(smokeDel, 'Rauch-Loeschung an Client delegiert')
resources.z_fire = 'missing'
waitRate()
ok, res = request('trigger', { scenarioId = scenarioId, mode = 'test' })
local autoInc = ok and Incidents.get(res.id)
local internalNodes = 0
for _, n in pairs(Fire.nodes) do if autoInc and n.incident == autoInc.id then internalNodes = internalNodes + 1 end end
check(ok and internalNodes > 0, 'auto ohne z_fire: Einsatz laeuft mit eigenem Feuersystem')
if autoInc then
    waitRate()
    request('incidentAction', { id = autoInc.id, action = 'end' })
    local left = 0
    for _, n in pairs(Fire.nodes) do if n.incident == autoInc.id then left = left + 1 end end
    check(left == 0, 'auto ohne z_fire: eigene Brandherde beim Beenden entfernt')
end
Config.Fire.backend = 'z_fire'
waitRate()
ok, res = request('trigger', { scenarioId = scenarioId, mode = 'test' })
check(not ok and tostring(res):find('z_fire'), 'Fest auf z_fire ohne z_fire: verstaendliche Fehlermeldung + Rollback')
resources.z_fire = 'started'

print('Zufallseinsaetze')
Incidents.list = {}
waitRate()
ok, res = request('randomSetPool', { id = scenarioId, pool = { enabled = true, weight = 3, minOnDuty = { ems = 5 } } })
check(ok and #res.candidates == 1 and not res.candidates[1].eligible, 'Zu wenig Kraefte im Dienst -> nicht startbar')
waitRate()
ok, res = request('randomSetPool', { id = scenarioId, pool = { enabled = true, weight = 3 } })
check(ok and res.candidates[1].eligible, 'Szenario im Pool startbar')
waitRate()
ok, res = request('randomRunNow')
check(ok and Incidents.get(res.id) and Incidents.get(res.id).random, 'Zufallseinsatz gestartet')
waitRate()
ok, res = request('randomRunNow')
check(not ok, 'Laufendes Szenario wird nicht doppelt gestartet')
waitRate()
ok, res = request('randomSaveSettings', { settings = { enabled = true, intervalMin = 5, intervalMax = 2 } })
check(ok and res.settings.intervalMax == 5 and res.nextAt, 'Einstellungen gespeichert und normalisiert')
check(files['data/settings.json'] ~= nil, 'settings.json geschrieben')

print('Medizinische Behandlung, Ortsvarianten, Notruftext')
Config.Medical.enabled = true
Config.Fire.backend = 'internal'
Config.Dispatch.adapter = 'event'
Incidents.list = {}
local medScenario = {
    name = 'Sturz Treppenhaus', category = 'rd', keyword = 'RD - Sturz', priority = 2,
    info = { alarmText = '{anruf}' },
    center = { x = 300.0, y = -500.0, z = 30.0 },
    variants = { { x = 1000.0, y = 1000.0, z = 50.0, h = 90.0, label = 'Variante Nord' } },
    elements = {
        { id = 'p1', kind = 'ped', model = 'a_m_m_business_01', pos = { x = 302, y = -500, z = 30 },
            props = { pose = 'schmerz', isPatient = true, patient = { profile = 'sturz', variant = 1, gender = 'm',
                body = { kopf = 3, wadeli = 3, oberarmre = 1, thorax = 2 }, destination = 'other_hospital' } } },
        { id = 'p2', kind = 'ped', model = 'a_f_y_tourist_01', pos = { x = 298, y = -500, z = 30 }, props = { randomModel = true,
            pose = 'sitzend', isPatient = true, patient = { profile = 'atemnot', variant = 0 } } },
    },
}
waitRate()
ok, res = request('trigger', { scenario = medScenario, mode = 'live', variant = 1 })
check(ok, 'RD-Einsatz mit Ortsvariante erstellt ' .. tostring(ok and res.id or res))
local minc = ok and Incidents.get(res.id)
check(minc and minc.scenario.center.x == 1000.0 and minc.variant == 1, 'Einsatzort auf Variante verschoben')
local p1el
for _, el in ipairs(minc.scenario.elements) do if el.id == 'p1' then p1el = el end end
check(p1el and math.abs(p1el.pos.x - 1000.0) < 0.01 and math.abs(p1el.pos.y - 1002.0) < 0.01, 'Element relativ verschoben und um 90 Grad gedreht')
check(minc.alarmText and #minc.alarmText > 20 and not minc.alarmText:find('{anruf}', 1, true), 'Notruftext aus Meldebild eingesetzt: ' .. tostring(minc.alarmText))
local pt1 = minc.rescue.patients.p1
local pt2 = minc.rescue.patients.p2
check(pt1.med and pt1.med.hf >= 70 and pt1.med.hf <= 100, 'Vitalwerte aus Meldebild (Sturz) gewuerfelt')
check(pt2.name ~= '' and pt2.name:find(' '), 'Zufallsname vergeben: ' .. tostring(pt2.name))
check(pt1.dest and pt1.dest.label, 'Transportziel andere Klinik: ' .. tostring(pt1.dest and pt1.dest.label))
-- Spritze wie aus dem Materialschrank: Medikament zur Medikation passend, Dosis als Vielfaches der ueblichen Dosis
local function syringe(medId, factor, extra)
    local d = Material.DrugByMed[medId]
    local ml = d.dose * (factor or 1) / d.conc
    local r = { drug = d.id, drugMl = ml, totalMl = math.max(ml, d.dilute or 0), air = 0, syringe = 'll10', needle = 'aufz18', labeled = true, checked = true }
    for k, v in pairs(extra or {}) do r[k] = v end
    return r
end
local function med(action, arg, result)
    advance(2000)
    waitRate()
    if action == 'med' and result == nil and Material.DrugByMed[arg] then result = syringe(arg) end
    return request('medAction', { incidentId = minc.id, patientId = 'p1', action = action, arg = arg, result = result })
end
player.coords = GetEntityCoords(minc.entities.p1.entity)
ok, res = med('talk_name')
check(ok and res.view.name == pt1.name, 'Name erfragt -> bekannt')
ok, res = med('med', 'ebrantil')
check(ok and pt1.med.rrsys == pt1.med.rrsys and not pt1.med.canula and res.lines[#res.lines].text:find('Zugang'), 'Medikament ohne Zugang abgelehnt')
med('canula')
local sysBefore = pt1.med.rrsys
ok, res = med('med', 'ebrantil')
check(pt1.med.rrsys == sysBefore, 'Medikament vor Messung ohne Wirkung')
med('measure', 'rr')
ok, res = med('med', 'ebrantil')
check(pt1.med.rrsys == math.max(0, sysBefore - 25), 'Ebrantil senkt RR systolisch um 25')
do
    advance(2000); waitRate()
    local o, r = request('medAction', { incidentId = minc.id, patientId = 'p1', action = 'med', arg = 'ebrantil' })
    check(not o and tostring(r):find('aufgezogen'), 'Medikament ohne Aufziehen abgelehnt')
    advance(2000); waitRate()
    local sys0 = pt1.med.rrsys
    o, r = med('med', 'ebrantil', syringe('ebrantil', 0.25))
    local txtU = ''; for _, l in ipairs(r.lines) do txtU = txtU .. l.text .. ' | ' end
    check(o and pt1.med.rrsys == sys0 and txtU:find('unterdosiert'), 'Unterdosierung: kaum Wirkung: ' .. txtU)
    sys0 = pt1.med.rrsys
    o, r = med('med', 'ebrantil', syringe('ebrantil', 6))
    local txt = ''; for _, l in ipairs(r.lines) do txt = txt .. l.text .. ' | ' end
    check(o and txt:find('UEBERDOSIERUNG') and pt1.med.rrsys < sys0 - 40, 'Ueberdosierung senkt RR stark: ' .. txt)
    local hf0 = pt1.med.hf
    o, r = med('med', 'ebrantil', syringe('atropin'))
    txt = ''; for _, l in ipairs(r.lines) do txt = txt .. l.text .. ' | ' end
    check(o and txt:find('statt') and pt1.med.hf > hf0, 'Falsches Medikament: Atropin statt Urapidil wirkt als Atropin')
    local spo0 = pt1.med.spo2Base
    o, r = med('med', 'ebrantil', syringe('ebrantil', 1, { air = 1.0 }))
    check(pt1.med.spo2Base < spo0, 'Luft in der Spritze verschlechtert die Saettigung')
    o, r = med('med', 'ebrantil', syringe('ebrantil', 1, { syringe = 'ent10' }))
    check(o and r.lines[#r.lines].text:find('Enteralspritze'), 'Enteralspritze nicht an den i.v.-Zugang')
end
med('measure', 'hf')
local spoBefore
ok, res = med('measure', 'spo2'); spoBefore = res.view.vitals.spo2
med('oxygen', 6)
ok, res = med('measure', 'spo2')
check(res.view.vitals.spo2 >= math.min(100, spoBefore + 4), 'Sauerstoff erhoeht SpO2')
ok, res = med('pflaster')
check(res.lines[#res.lines].text:find('Bodycheck'), 'Wundversorgung erst nach Bodycheck')
ok, res = med('bodycheck')
check(#res.view.findings == 4, 'Bodycheck findet 4 Verletzungen')
check(not res.view.complete, 'Noch nicht versorgt')
waitRate()
local lok, lerr = request('rescueStart', { incidentId = minc.id, targetId = 'p1', action = 'load' })
check(not lok and tostring(lerr):find('zuerst versorgen'), 'Einladen vor Versorgung abgelehnt: ' .. tostring(lerr))
for _, a in ipairs({ 'pflaster', 'verband', 'schiene', 'stifneck' }) do med(a) end
ok, res = med('bodycheck')
check(res.view.complete and Rescue.patientStatus(pt1) == 'stabil', 'Alle Massnahmen erledigt -> versorgt/transportbereit')
local stretcher = newEnt('vehicle', GetHashKey('rda_stretcher'), player.coords.x + 1, player.coords.y, player.coords.z)
ok, res = med('stretcher', NetworkGetNetworkIdFromEntity(stretcher))
check(ok and Rescue.patientStatus(pt1) == 'auf_trage', 'Patient auf Trage gelegt')
check(ents[minc.entities.p1.entity].state.ec.st == 'stretcher', 'State-Bag fuer Trage gesetzt')
-- Uebergabe: falsche Klinik vs. Zielklinik
local wrong
for _, h in ipairs(Config.Rescue.hospitals) do if h.label ~= pt1.dest.label then wrong = h end end
ents[minc.entities.p1.entity].pos = vector3(wrong.coords.x, wrong.coords.y, wrong.coords.z)
player.coords = ents[minc.entities.p1.entity].pos
local savedInc = incId
incId = minc.id
ok, res = doAction('p1', 'handover')
check(not ok and tostring(res):find('Falscher Zielort'), 'Uebergabe an falscher Klinik abgelehnt')
ents[minc.entities.p1.entity].pos = pt1.dest.coords
player.coords = pt1.dest.coords
ok, res = doAction('p1', 'handover')
incId = savedInc
check(ok and pt1.handedOver, 'Uebergabe an Zielklinik')

print('Erweiterte Versorgung: Reanimation, Spannungspneu, ACS, Anamnese, Minispiele')
do
    Incidents.list = {}
    local sc = {
        name = 'Erweiterte Versorgung', category = 'rd', keyword = 'RD - Test', priority = 1,
        info = { alarmText = 'Test' }, center = { x = 500.0, y = 500.0, z = 30.0 },
        elements = {
            { id = 'rea', kind = 'ped', model = 'a_m_m_business_01', pos = { x = 500, y = 500, z = 30 },
                props = { pose = 'bewusstlos', isPatient = true, patient = { profile = 'reanimation', variant = 1, gender = 'm' } } },
            { id = 'pneu', kind = 'ped', model = 'a_m_m_business_01', pos = { x = 501, y = 500, z = 30 },
                props = { pose = 'sitzend', isPatient = true, patient = { profile = 'spannungspneu', variant = 1, gender = 'm' } } },
            { id = 'acs', kind = 'ped', model = 'a_m_m_business_01', pos = { x = 499, y = 500, z = 30 },
                props = { pose = 'sitzend', isPatient = true, patient = { profile = 'acs', variant = 1, gender = 'm' } } },
        },
    }
    waitRate()
    local okc, rc = request('trigger', { scenario = sc, mode = 'test' })
    check(okc, 'Einsatz mit neuen Meldebildern erstellt ' .. tostring(okc and rc.id or rc))
    local inc = okc and Incidents.get(rc.id)
    local function m2(pid, action, arg, result)
        advance(2000)
        waitRate()
        player.coords = GetEntityCoords(inc.entities[pid].entity)
        if action == 'med' and result == nil and Material.DrugByMed[arg] then result = syringe(arg) end
        return request('medAction', { incidentId = inc.id, patientId = pid, action = action, arg = arg, result = result })
    end
    local rea = inc.rescue.patients.rea.med
    check(rea.arrest and rea.ekgBase == 'vf', 'Reanimation: Kreislaufstillstand mit Kammerflimmern')
    local o, r = m2('rea', 'measure', 'ekg')
    check(not o and tostring(r):find('Minispiel'), 'EKG ohne Minispiel-Ergebnis abgelehnt')
    o, r = m2('rea', 'measure', 'ekg', false)
    check(o and rea.ekgLeads == 0, 'EKG falsch geklebt -> keine Ableitung')
    o, r = m2('rea', 'measure', 'ekg', true)
    check(o and r.view.ekg and r.view.ekg.rhythm == 'vf' and r.view.ekg.wave == 'vf', 'EKG zeigt Kammerflimmern im Monitor')
    o, r = m2('rea', 'proc', 'cpr', true)
    o, r = m2('rea', 'proc', 'defi')
    check(rea.shocks == 1, 'Defibrillation bei Kammerflimmern')
    o, r = m2('rea', 'proc', 'io', true)
    check(rea.canula and rea.access == 'i.o.', 'IO-Zugang gebohrt')
    o, r = m2('rea', 'med', 'suprarenin')
    o, r = m2('rea', 'proc', 'tubus', true)
    check(rea.airway == 'tubus' and rea.arrest, 'Atemweg gesichert, noch kein ROSC (erst 1 Zyklus HDM)')
    o, r = m2('rea', 'proc', 'cpr', true)
    check(not rea.arrest and rea.done.rosc and rea.hf > 0, 'ROSC nach vollstaendiger Reanimation')
    check(r.view.complete == false or #r.view.open >= 0, 'Offene Massnahmen abrufbar')

    local pneu = inc.rescue.patients.pneu.med
    local spoBefore = pneu.spo2Base
    o, r = m2('pneu', 'proc', 'thorax', 'links')
    check(not pneu.relieved and pneu.spo2Base < spoBefore, 'Thoraxentlastung auf falscher Seite verschlechtert')
    o, r = m2('pneu', 'proc', 'thorax', 'rechts')
    check(pneu.relieved and pneu.spo2Base > spoBefore, 'Thoraxentlastung rechts hebt die Saettigung')
    o, r = m2('pneu', 'measure', 'lung')
    check(r.view.findingsExtra.lung and r.view.findingsExtra.lung:find('Entlastung'), 'Auskultation nach Entlastung')

    local acs = inc.rescue.patients.acs.med
    o, r = m2('acs', 'measure', 'ekg', true)
    check(r.view.ekg.rhythm ~= 'stemi', 'ST-Hebung im 4-Kanal-EKG nicht sichtbar')
    o, r = m2('acs', 'measure', 'ekg12', true)
    check(r.view.ekg.rhythm == 'stemi' and r.view.ekg.leads == 12, '12-Kanal-EKG zeigt STEMI')
    o, r = m2('acs', 'med', 'nitro')
    check(not acs.given.nitro, 'Nitro ohne RR-Messung nicht gegeben')
    for _, k in ipairs({ 'o', 'p', 'q', 'r', 's', 't' }) do o, r = m2('acs', 'opqrst', k) end
    check(acs.done.opqrst and r.view.anamnesis.opqrst.r and r.view.anamnesis.opqrst.r:find('Arm'), 'OPQRST vollstaendig erhoben')
    for _, k in ipairs({ 's', 'a', 'm', 'p', 'l', 'e', 'r' }) do o, r = m2('acs', 'sampler', k) end
    check(acs.done.sampler and r.view.anamnesis.sampler.a ~= nil, 'SAMPLER vollstaendig erhoben')
    local openText = table.concat(r.view.open, ' | ')
    check(openText:find('ASS') and openText:find('Heparin'), 'Pflichtmassnahmen ACS offen: ' .. openText)
    o, r = m2('acs', 'proc', 'iv', false)
    check(not acs.canula, 'Fehlpunktion i.v. -> kein Zugang')
    o, r = m2('acs', 'proc', 'iv', true)
    m2('acs', 'med', 'ass'); m2('acs', 'med', 'heparin'); m2('acs', 'proc', 'lagerung')
    o, r = m2('acs', 'measure', 'rr')
    openText = table.concat(r.view.open, ' | ')
    check(not openText:find('ASS') and not openText:find('12%-Kanal') and not openText:find('Lagerung'), 'ACS-Pflichtmassnahmen erledigt: ' .. openText)

    -- Aufgezogene Spritze als Item (ox_inventory) und Injektion aus dem Inventar
    local inv, nextSlot = {}, 1
    local fakeInv = {
        AddItem = function(_, src, item, count, meta) local sl = nextSlot nextSlot = nextSlot + 1 inv[sl] = { name = item, count = 1, metadata = meta, slot = sl } return true, { slot = sl } end,
        GetSlot = function(_, src, slot) return inv[slot] end,
        RemoveItem = function(_, src, item, count, meta, slot) if inv[slot] and inv[slot].name == item then inv[slot] = nil return true end return false end,
    }
    local oldEx, oldRs = exports, GetResourceState
    exports = setmetatable({}, { __call = oldEx, __index = function(_, k) if k == 'ox_inventory' then return fakeInv end return oldEx[k] end })
    GetResourceState = function(r) if r == 'ox_inventory' then return 'started' end return oldRs(r) end
    waitRate()
    local po, pr = request('prepStore', { prep = syringe('heparin') })
    local it = po and inv[pr.slot]
    check(it and it.name == 'spritze_aufgezogen' and it.metadata.label:find('Heparin') and it.metadata.ec.drug == 'heparin', 'Aufgezogene Spritze als Item mit Metadaten: ' .. tostring(it and it.metadata.label or pr))
    waitRate()
    local po2, pr2 = request('prepStore', { prep = syringe('heparin', 1, { syringe = 'ins05' }) })
    check(not po2, 'Mehr Inhalt als in die Spritze passt -> abgelehnt')
    local pneuMed = inc.rescue.patients.pneu.med
    o, r = m2('pneu', 'inject', pr.slot)
    check(not o and inv[pr.slot] ~= nil, 'Ohne Zugang wird die Spritze nicht verbraucht')
    acs.given.heparin = nil
    o, r = m2('acs', 'inject', pr.slot)
    local usedItem
    for _, v in pairs(inv) do if v.name == 'spritze_benutzt' then usedItem = v end end
    check(o and inv[pr.slot] == nil and acs.given.heparin and usedItem, 'Injektion verbraucht die Spritze, Heparin gegeben, benutzte Spritze im Inventar')
    o, r = m2('acs', 'inject', pr.slot)
    check(not o, 'Leeres Fach -> keine Injektion')
    waitRate()
    po, pr = request('prepStore', { prep = { drug = 'noradrenalin', drugMl = 0.01, totalMl = 1, air = 0, syringe = 'll2', needle = 'aufz18', labeled = true, checked = true } })
    o, r = m2('acs', 'inject', pr.slot)
    local t = ''; for _, l in ipairs(r.lines or {}) do t = t .. l.text .. ' | ' end
    check(o and t:find('Noradrenalin'), 'Medikament ohne Menueeintrag (Noradrenalin) injizierbar: ' .. t)
    exports, GetResourceState = oldEx, oldRs
end


print('Medikamente: Behandlungsmenue und Materialschrank synchron')
do
    local inCab, missing, orphan = {}, {}, {}
    for _, d in ipairs(Material.Drugs) do
        if d.med then inCab[d.med] = true end
        if not d.med or not EC.MedicationById[d.med] then orphan[#orphan + 1] = d.id end
    end
    for _, m in ipairs(Medical.Medications) do if not inCab[m.id] then missing[#missing + 1] = m.id end end
    check(#missing == 0, 'Jedes Menue-Medikament steht im Schrank: ' .. table.concat(missing, ', '))
    check(#orphan == 0, 'Jedes Schrank-Medikament steht im Menue: ' .. table.concat(orphan, ', '))
end

print('Automatisches Beenden')
do
    local inc
    for _, i in pairs(Incidents.list) do if i.status == EC.Status.active and i.rescue and next(i.rescue.patients) then inc = i break end end
    check(inc ~= nil, 'Aktiven Einsatz mit Patienten gefunden')
    if inc then
        inc.fire = { total = 0 }
        for _, p in pairs(inc.rescue.patients) do p.handedOver = false end
        local t0 = os.time()
        Incidents.checkAutoEnd(inc, t0)
        check(inc.status == EC.Status.active and not inc.doneAt, 'Offene Patienten: Einsatz bleibt aktiv')
        for _, p in pairs(inc.rescue.patients) do p.handedOver = true end
        for _, d in pairs(inc.rescue.doors) do d.status = 'geoeffnet' end
        for _, sp in pairs(inc.rescue.spills) do sp.status = 'beseitigt' end
        for _, m in pairs(inc.rescue.markers) do m.status = 'gesichert' end
        Incidents.checkAutoEnd(inc, t0)
        check(inc.status == EC.Status.active and inc.doneAt == t0, 'Alle Aufgaben erledigt: Wartezeit laeuft')
        Incidents.checkAutoEnd(inc, t0 + Config.Modes.autoEndDelaySeconds)
        check(inc.status == EC.Status.ended, 'Nach der Wartezeit automatisch beendet')
    end
    local inc2
    for _, i in pairs(Incidents.list) do if i.status == EC.Status.active then inc2 = i break end end
    if inc2 then
        inc2.doneAt = nil
        Incidents.checkAutoEnd(inc2, (inc2.expiresAt or os.time()) + 1)
        check(inc2.status == EC.Status.ended, 'Zeitablauf beendet den Einsatz')
    end
    check(Config.Modes.autoCancelMinutes == 60, 'Standard: spaetestens nach 60 Minuten')
end

print('Speicherung: Datenbank (oxmysql)')
do
    local db = { scen = {}, store = {}, hist = {}, created = 0 }
    local fakeOx = { query = function(_, sql, params, cb)
        local r
        if sql:find('^CREATE TABLE') then db.created = db.created + 1 r = {}
        elseif sql:find('^SHOW TABLES') then r = { { name = 'einsatz_creator_scenarios' } }
        elseif sql:find('^SELECT `id`, `valid`, `data`') then
            r = {} for id, row in pairs(db.scen) do r[#r + 1] = { id = id, valid = row.valid, data = row.data } end
        elseif sql:find('^INSERT INTO `einsatz_creator_scenarios`') then
            db.scen[params[1]] = { name = params[2], valid = params[5], data = params[6] } r = { affectedRows = 1 }
        elseif sql:find('^DELETE FROM `einsatz_creator_scenarios`') then db.scen[params[1]] = nil r = { affectedRows = 1 }
        elseif sql:find('^SELECT `data` FROM `einsatz_creator_store`') then
            r = {} if db.store[params[1]] then r[1] = { data = db.store[params[1]] } end
        elseif sql:find('^INSERT INTO `einsatz_creator_store`') then db.store[params[1]] = params[2] r = {}
        elseif sql:find('^SELECT `data` FROM `einsatz_creator_history`') then
            r = {} for i = #db.hist, 1, -1 do r[#r + 1] = { data = db.hist[i] } end
        elseif sql:find('^INSERT INTO `einsatz_creator_history`') then db.hist[#db.hist + 1] = params[2] r = {}
        elseif sql:find('^DELETE FROM `einsatz_creator_history`') then r = {}
        else error('unbekannte Abfrage: ' .. sql) end
        if cb then cb(r) end
    end }
    local oldExports, oldState = exports, GetResourceState
    exports = setmetatable({}, { __call = oldExports, __index = function(_, k) if k == 'oxmysql' then return fakeOx end return oldExports[k] end })
    GetResourceState = function(r) if r == 'oxmysql' then return 'started' end return oldState(r) end
    local jsonCount = EC.Utils.tableCount(Storage.scenarios)
    Config.Storage.backend = 'oxmysql'
    Storage.init()
    check(Storage.backend == 'oxmysql' and db.created == 3, 'oxmysql erkannt, Tabellen angelegt')
    check(EC.Utils.tableCount(db.scen) == jsonCount and jsonCount > 0, 'Vorhandene JSON-Szenarien in die Datenbank uebernommen (' .. jsonCount .. ')')
    check(db.store.settings ~= nil or next(Storage.settings) == nil, 'Einstellungen uebernommen')
    -- Szenario ueber den normalen Weg speichern
    waitRate()
    local okSave, resSave = request('getScenario', { id = scenarioId })
    local sc = okSave and resSave.scenario
    sc.name = 'DB-Test'
    waitRate()
    okSave, resSave = request('saveScenario', { scenario = sc })
    check(okSave and db.scen[scenarioId] and db.scen[scenarioId].name == 'DB-Test', 'Szenario in der Datenbank aktualisiert')
    local dbRow = db.scen[scenarioId] and EC.Utils.deepcopy(db.scen[scenarioId])
    -- "Neustart": alles aus der Datenbank laden
    Storage.scenarios = {}
    Storage.init()
    check(Storage.scenarios[scenarioId] and Storage.scenarios[scenarioId].scenario.name == 'DB-Test', 'Nach Neustart aus der Datenbank geladen')
    local histBefore = #db.hist
    Storage.addHistory({ id = 'EC-TEST', name = 'x', endedAt = os.time() })
    check(#db.hist == histBefore + 1, 'Verlauf in die Datenbank geschrieben')
    Storage.settings.random = Storage.settings.random or {}
    Storage.settings.random.enabled = true
    check(Storage.saveSettings() and db.store.settings and db.store.settings:find('enabled'), 'Einstellungen in der Datenbank gespeichert')
    waitRate()
    local okDel = request('deleteScenario', { id = scenarioId })
    check(okDel and db.scen[scenarioId] == nil, 'Geloeschtes Szenario aus der Datenbank entfernt')
    -- Zurueck auf Datei: Einsaetze aus der Datenbank werden in incidents.json uebernommen
    Config.Storage.backend = 'json'
    for k in pairs(files) do if k:find('^data/incidents') or k:find('^data/scenarios') then files[k] = nil end end
    db.scen = { [scenarioId] = dbRow }
    Storage.init()
    check(Storage.backend == 'json' and files['data/incidents/' .. scenarioId .. '.json'] ~= nil and Storage.scenarios[scenarioId] ~= nil,
        'Datei-Speicherung: Einsaetze aus der Datenbank als Einzeldateien uebernommen')
    -- Umstieg von einer Sammeldatei (1.1.1)
    local single = files['data/incidents/' .. scenarioId .. '.json']
    for k in pairs(files) do if k:find('^data/incidents') then files[k] = nil end end
    local rec = json.decode(single).data
    files['data/incidents.json'] = json.encode({ format = 1, data = { scenarios = { [scenarioId] = rec }, invalid = {} } })
    exports, GetResourceState = oldExports, oldState
    Storage.init()
    check(Storage.scenarios[scenarioId] ~= nil and files['data/incidents/' .. scenarioId .. '.json'] ~= nil, 'Sammeldatei incidents.json in Einzeldateien umgewandelt')
    -- Loeschen entfernt die Einzeldatei aus dem Index
    Storage.scenarios[scenarioId] = nil
    Storage.saveScenarios()
    local idx = json.decode(files['data/incidents/index.json']).data
    check(#idx.ids == 0 and (files['data/incidents/' .. scenarioId .. '.json'] or '') == '', 'Geloeschter Einsatz: Datei geleert und aus dem Index entfernt')
    Storage.scenarios[scenarioId] = { scenario = EC.Schema.normalizeScenario(rec.scenario), meta = rec.meta }
    Storage.scenarios[scenarioId].scenario.id = scenarioId
    Storage.saveScenarios()
    exports, GetResourceState = oldExports, oldState
    Storage.init()
end

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
