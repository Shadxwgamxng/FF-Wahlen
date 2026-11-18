-- LEITWARTE Overlay – Server (QBCore/Qbox)
-- Dieses Beispiel zeigt nur die Anbindung. Die Daten kommen aus EUREM bestehenden Script:
-- BuildState() übersetzt eure Einsätze/Fahrzeuge in das Format aus SCHNITTSTELLE.md,
-- Actions[...] ruft eure vorhandenen Funktionen auf.
local QBCore = exports['qb-core']:GetCoreObject()

local function BuildState(src)
  -- HIER: aus eurem Script befüllen
  return {
    center = 'Leitstelle', dispatcher = GetPlayerName(src), clock = os.date('%H:%M:%S'),
    stations = {}, keywords = {}, hospitals = {},
    units = {}, calls = {}, incidents = {},
    radio = { groups = {}, requests = {}, log = {} },
  }
end

--- allen Disponenten den neuen Zustand schicken (nach jeder Änderung aufrufen)
function PushState()
  for _, id in pairs(QBCore.Functions.GetPlayers()) do
    local p = QBCore.Functions.GetPlayer(id)
    if p and (p.PlayerData.job.name == 'leitstelle' or p.PlayerData.job.name == 'dispatch') then
      TriggerClientEvent('lw:state', id, BuildState(id))
    end
  end
end
exports('PushState', PushState)

local Actions = {
  acceptCall     = function(src, d) --[[ eurer Notruf annehmen(d.callId) ]] return { ok = true } end,
  endCall        = function(src, d) return { ok = true } end,
  createIncident = function(src, d) --[[ local id = EuerEinsatzAnlegen(d.callId, d.mask) ]] return { ok = true, incidentId = nil } end,
  saveIncident   = function(src, d) return { ok = true } end,
  alarm          = function(src, d) --[[ for _, it in ipairs(d.items) do ... it.id, it.kind ('AG'|'EG'|'FZG') end ]] return { ok = true } end,
  releaseUnit    = function(src, d) return { ok = true } end,
  releaseAll     = function(src, d) return { ok = true } end,
  closeIncident  = function(src, d) return { ok = true } end,
  answerRequest  = function(src, d) return { ok = true } end,
  setRadioGroup  = function(src, d) return { ok = true } end,
  sendRadio      = function(src, d) return { ok = true } end,
  sendMessage    = function(src, d) return { ok = true } end,
}

QBCore.Functions.CreateCallback('lw:getState', function(src, cb) cb(BuildState(src)) end)
QBCore.Functions.CreateCallback('lw:action', function(src, cb, name, data)
  local fn = Actions[name]
  local res = fn and fn(src, data) or { ok = true }
  cb(res)
  PushState()
end)
QBCore.Functions.CreateCallback('lw:coords', function(src, cb, kind, id)
  cb(nil) -- HIER: Koordinaten des Einsatzes/Notrufs zurückgeben, z. B. vector3
end)
