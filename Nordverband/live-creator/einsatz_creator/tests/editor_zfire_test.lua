-- Offline-Test der z_fire-Pruefung im Creator (Aufruf im Resource-Ordner: lua5.4 tests/editor_zfire_test.lua)
vector3 = function(x, y, z) return setmetatable({ x = x, y = y, z = z }, { __sub = function(a, b) return vector3(a.x-b.x, a.y-b.y, a.z-b.z) end, __len = function(a) return math.sqrt(a.x^2+a.y^2+a.z^2) end }) end
json = { encode = function() return '{}' end, decode = function() return {} end }
local interiorAt = 0
setmetatable(_G, { __index = function(_, k) if k:match('^%u%l') and k ~= 'Config' and k ~= 'Catalog' and k ~= 'Editor' and k ~= 'State' then return function() return 0 end end end })
function IsDuplicityVersion() return false end
function GetResourceState(r) return r == 'z_fire' and 'started' or 'missing' end
function GetInteriorAtCoords() return interiorAt end
function GetRoomKeyFromEntity() return interiorAt ~= 0 and 12345 or 0 end
function Wait() end
function RegisterNetEvent() end
function AddEventHandler() end
function GetGameTimer() return 0 end
function LoadModel() return 1 end
local ground = 'GRASS'
function GetHashKey(n) local h = 0 for i = 1, #n do h = (h * 31 + n:byte(i)) % 2147483647 end return h end
function GetShapeTestResultIncludingMaterial() return 2, true, nil, nil, GetHashKey(ground), 0 end
for _, f in ipairs({ 'config.lua', 'config_catalog.lua', 'config_medical.lua', 'config_names.lua', 'shared/constants.lua', 'shared/utils.lua', 'shared/schema.lua' }) do dofile(f) end
Config.Fire.backend = 'auto'
NUI = { on = function() end, toast = function() end, send = function() end }
State = { draft = { elements = {} } }
Cam = {}; Preview = {}; World = {}
dofile('client/editor.lua')
local ok, err
local veh = { id = 'v1', kind = 'vehicle', pos = { x = 0, y = 0, z = 0 }, props = {} }
local obj = { id = 'o1', kind = 'object', model = 'prop_dumpster_01a', pos = { x = 5, y = 0, z = 0 }, props = {} }
State.draft.elements = { veh, obj }
local function fire(b) return { kind = 'fire', id = 'f', pos = { x = 1, y = 1, z = 1 }, props = { zfBehaviour = b, roomHash = 0 } } end
local passed, failed = 0, 0
local function check(c, m) if c then passed = passed + 1 print('ok   ' .. m) else failed = failed + 1 print('FAIL ' .. m) end end
local f = fire('vehicle'); ok = Editor.fitZFire(f, nil, true); check(not ok, 'Fahrzeugbrand ohne Fahrzeug abgelehnt')
f = fire('vehicle'); ok = Editor.fitZFire(f, 'v1', true); check(ok and f.props.attachTo == 'v1', 'Fahrzeugbrand auf Fahrzeug gekoppelt')
f = fire('vehicle'); ok = Editor.fitZFire(f, 'o1', true); check(not ok, 'Fahrzeugbrand auf Objekt abgelehnt')
f = fire('prop'); ok = Editor.fitZFire(f, 'o1', true); check(ok and f.props.attachTo == 'o1', 'Objektbrand auf Objekt gekoppelt')
f = fire('interior'); interiorAt = 0; ok = Editor.fitZFire(f, nil, true); check(not ok, 'Innenraumbrand im Freien abgelehnt')
f = fire('interior'); interiorAt = 7; ok = Editor.fitZFire(f, nil, true); check(ok and f.props.roomHash == 12345, 'Innenraumbrand im Gebaeude mit Room-Key')
f = fire('grass'); interiorAt = 7; ok = Editor.fitZFire(f, nil, true); check(not ok, 'Flaechenbrand im Gebaeude abgelehnt')
f = fire('grass'); interiorAt = 0; ok = Editor.fitZFire(f, nil, true); check(ok, 'Flaechenbrand im Freien ok')
f = fire('auto'); interiorAt = 0; ok = Editor.fitZFire(f, 'v1', true); check(ok and Editor.zfBehaviour(f) == 'vehicle', 'Automatisch auf Fahrzeug -> Fahrzeugbrand')
f = fire('auto'); interiorAt = 7; ok = Editor.fitZFire(f, nil, true); check(ok and Editor.zfBehaviour(f) == 'interior', 'Automatisch im Gebaeude -> Innenraum')
f = fire('auto'); interiorAt = 0; ok = Editor.fitZFire(f, nil, true); check(ok and Editor.zfBehaviour(f) == 'grass', 'Automatisch im Freien -> Flaeche')
obj.model = 'prop_roadcone02a'
f = fire('auto'); interiorAt = 0; ok, err = Editor.fitZFire(f, 'o1', true); check(not ok and tostring(err):find('nicht brennen'), 'Objektbrand an nicht erlaubtem Objekt abgelehnt')
obj.model = 'prop_dumpster_01a'
f = fire('auto'); interiorAt = 0; ok = Editor.fitZFire(f, 'o1', true); check(ok and f.props.attachTo == 'o1', 'Objektbrand an Muellcontainer erlaubt')
GetResourceState = function() return 'missing' end
f = fire('vehicle'); ok = Editor.fitZFire(f, nil, true); check(ok, 'Ohne z_fire keine z_fire-Pruefung')
print(passed .. " bestanden, " .. failed .. " fehlgeschlagen")
os.exit(failed == 0 and 0 or 1)
