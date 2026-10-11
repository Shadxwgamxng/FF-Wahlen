--[[
    Einsatzkraefte: Alarmierung, Blips, Route, Einsatzinformationen
]]

local U = EC.Utils

Alarms = {
    list = {},     -- id -> Alarm-Payload
    blips = {},    -- id -> { blip, ... }
    last = nil,
}

local function removeBlips(id)
    for _, b in ipairs(Alarms.blips[id] or {}) do
        if DoesBlipExist(b) then RemoveBlip(b) end
    end
    Alarms.blips[id] = nil
end

local function createBlips(a)
    removeBlips(a.id)
    local list = {}
    local c = a.center
    local main = AddBlipForCoord(c.x, c.y, c.z)
    SetBlipSprite(main, Config.Alarm.blipSprite)
    SetBlipColour(main, a.mode == 'test' and 5 or Config.Alarm.blipColour)
    SetBlipScale(main, Config.Alarm.blipScale)
    SetBlipAsShortRange(main, false)
    SetBlipFlashes(main, true)
    SetBlipFlashTimer(main, 10000)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentSubstringPlayerName(('%sEinsatz: %s'):format(a.mode == 'test' and '[TEST] ' or '', a.keyword ~= '' and a.keyword or a.name))
    EndTextCommandSetBlipName(main)
    list[#list + 1] = main

    for _, area in ipairs(a.areas or {}) do
        local kind = EC.AreaKindById[area.kind]
        local b = AddBlipForRadius(area.pos.x, area.pos.y, area.pos.z, area.r + 0.0)
        SetBlipColour(b, kind and kind.colour or 1)
        SetBlipAlpha(b, Config.Alarm.areaBlipAlpha)
        list[#list + 1] = b
    end
    for _, m in ipairs(a.markers or {}) do
        local kind = EC.MarkerKindById[m.kind]
        local b = AddBlipForCoord(m.pos.x, m.pos.y, m.pos.z)
        SetBlipSprite(b, kind and kind.sprite or 1)
        SetBlipColour(b, kind and kind.colour or 0)
        SetBlipScale(b, 0.7)
        SetBlipAsShortRange(b, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName(m.label ~= '' and m.label or (kind and kind.label or 'Position'))
        EndTextCommandSetBlipName(b)
        list[#list + 1] = b
    end
    Alarms.blips[a.id] = list
end

function Alarms.route(id)
    local a = Alarms.list[id or Alarms.last]
    if not a then
        NUI.toast('error', 'Kein aktiver Einsatz fuer dich')
        return
    end
    SetNewWaypoint(a.center.x, a.center.y)
    NUI.toast('success', 'Route zum Einsatz gesetzt')
end

RegisterNetEvent(EC.Events.alarm, function(a)
    if type(a) ~= 'table' or not a.id then return end
    Alarms.list[a.id] = a
    Alarms.last = a.id
    createBlips(a)
    if Config.Alarm.sound then
        PlaySoundFrontend(-1, 'TIMER_STOP', 'HUD_MINI_GAME_SOUNDSET', true)
    end
    a.street = Editor.addressAt(U.vec(a.center))
    NUI.send('alarm', {
        alarm = a,
        seconds = Config.Alarm.popupSeconds,
        routeKey = '/' .. Config.Commands.route,
        infoKey = '/' .. Config.Commands.info,
    })
    if Config.Alarm.autoRouteOnAlarm then Alarms.route(a.id) end
end)

RegisterNetEvent(EC.Events.incidentRemoved, function(id, endedOnly)
    if Alarms.list[id] then
        local a = Alarms.list[id]
        Alarms.list[id] = nil
        removeBlips(id)
        if Alarms.last == id then Alarms.last = nil end
        NUI.toast('info', ('Einsatz %s beendet'):format(a.keyword ~= '' and a.keyword or a.name))
    end
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
RegisterCommand(Config.Commands.route, function()
    Alarms.route()
end, false)

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

AddEventHandler('onResourceStop', function(res)
    if res ~= GetCurrentResourceName() then return end
    for id in pairs(Alarms.blips) do removeBlips(id) end
end)
