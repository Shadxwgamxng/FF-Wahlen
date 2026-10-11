--[[
    Einsatzkraefte: Einsatzinformationen (/einsatzinfo) und Weltstand.
    Alarmierung, Blips und Route kommen ausschliesslich aus EmergencyDispatch.
]]

local U = EC.Utils

RegisterNetEvent(EC.Events.incidentRemoved, function(id, endedOnly)
    if not endedOnly then World.removeIncident(id) end
end)

RegisterNetEvent(EC.Events.incidentSync, function(data)
    if type(data) ~= 'table' or not data.id then return end
    if data.status == EC.Status.active then
        World.updateIncident(data)
    else
        World.removeIncident(data.id)
    end
end)

----------------------------------------------------------------------------
-- Befehle
----------------------------------------------------------------------------
RegisterCommand(Config.Commands.info, function()
    if State.open then return end
    CreateThread(function()
        local ok, list = Request('myIncidents')
        if not ok then return NUI.toast('error', list or 'Keine Einsatzinformationen') end
        if #list == 0 then return NUI.toast('info', 'Aktuell kein Einsatz fuer dich') end
        NUI.send('infoPanel', { incidents = list, patientStatus = EC.PatientStatus })
        SetNuiFocus(true, true)
    end)
end, false)

NUI.on('infoClose', function()
    if not State.open then SetNuiFocus(false, false) end
    return true
end)

NUI.on('infoRoute', function(data)
    if type(data.pos) == 'table' then
        SetNewWaypoint(U.num(data.pos.x, 0.0), U.num(data.pos.y, 0.0))
        NUI.toast('success', 'Route gesetzt')
    end
    return true
end)

----------------------------------------------------------------------------
-- Weltstand beim Verbinden / Resource-Start laden
----------------------------------------------------------------------------
local function syncWorld()
    local ok, data = Request('syncWorld', nil, 20000)
    if not ok then return false end
    for _, inc in ipairs(data.incidents or {}) do World.updateIncident(inc) end
    FireClient.setAll(data.fire or {})
    Interactions.roles = data.roles or {}
    return true
end

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(500) end
    Wait(2000)
    for _ = 1, 5 do
        if syncWorld() then break end
        Wait(5000)
    end
    -- Rollen regelmaessig aktualisieren (Dienstantritt, Jobwechsel)
    while true do
        Wait(60000)
        local ok, roles = Request('myRoles')
        if ok then Interactions.roles = roles or {} end
    end
end)

