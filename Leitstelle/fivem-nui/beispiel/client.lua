-- LEITWARTE Overlay – Client (QBCore/Qbox). Öffnen: /leitstelle oder F6 (änderbar in den Tastenbelegungen)
local QBCore = exports['qb-core']:GetCoreObject()
local isOpen = false
local ALLOWED_JOBS = { leitstelle = true, dispatch = true } -- HIER an eure Jobs anpassen

local function setOpen(state, style)
  isOpen = state
  SetNuiFocus(state, state)
  if state then
    SendNUIMessage({ type = 'open', state = state, style = style or GetResourceKvpString('lw_style') or 'klassisch' })
  else
    SendNUIMessage({ type = 'close' })
  end
end

RegisterCommand('leitstelle', function()
  if isOpen then return setOpen(false) end
  local job = QBCore.Functions.GetPlayerData().job
  if not job or not ALLOWED_JOBS[job.name] then
    return QBCore.Functions.Notify('Kein Zugriff auf den Leitplatz', 'error')
  end
  QBCore.Functions.TriggerCallback('lw:getState', function(state) setOpen(state) end)
end, false)
RegisterKeyMapping('leitstelle', 'Leitplatz öffnen', 'keyboard', 'F6')

-- Server schickt neuen Zustand (nach jeder Änderung)
RegisterNetEvent('lw:state', function(state)
  if isOpen then SendNUIMessage({ type = 'state', state = state }) end
end)
RegisterNetEvent('lw:toast', function(text, kind)
  SendNUIMessage({ type = 'toast', text = text, kind = kind })
end)

-- Callbacks aus dem Overlay
RegisterNUICallback('close', function(_, cb) setOpen(false); cb({ ok = true }) end)
RegisterNUICallback('setStyle', function(data, cb) SetResourceKvp('lw_style', data.style); cb({ ok = true }) end)
RegisterNUICallback('setWaypoint', function(data, cb)
  QBCore.Functions.TriggerCallback('lw:coords', function(c) if c then SetNewWaypoint(c.x, c.y) end end, data.kind, data.id)
  cb({ ok = true })
end)
RegisterNUICallback('ptt', function(data, cb)
  -- z. B. pma-voice: exports['pma-voice']:setRadioChannel(...) / Funk-Taste simulieren
  cb({ ok = true })
end)

-- Alle übrigen Bedienungen gehen an den Server; die Antwort (z. B. incidentId) zurück ans Overlay
for _, name in ipairs({ 'openCall', 'openIncident', 'acceptCall', 'endCall', 'createIncident', 'newIncident', 'saveIncident',
  'alarm', 'releaseUnit', 'releaseAll', 'closeIncident', 'answerRequest', 'setRadioGroup', 'sendRadio', 'sendMessage' }) do
  RegisterNUICallback(name, function(data, cb)
    QBCore.Functions.TriggerCallback('lw:action', function(res) cb(res or { ok = true }) end, name, data)
  end)
end
