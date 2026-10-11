--[[
    Client-Einstieg: Creator oeffnen/schliessen, Spielerzustand sichern
    und zuverlaessig wiederherstellen.
]]

local U = EC.Utils

State = {
    open = false,
    busy = false,
    draft = nil,          -- aktuelles Szenario im Editor
    meta = nil,           -- Metadaten des gespeicherten Szenarios
    dirty = false,
    selected = nil,       -- Element-ID
    perms = {},
    user = '',
    anchor = nil,         -- Bezugspunkt fuer Kamerareichweite
    inputFocused = false,
    saved = nil,          -- gesicherter Spielerzustand
}

local function savePlayerState()
    local ped = PlayerPedId()
    State.saved = {
        ped = ped,
        coords = GetEntityCoords(ped),
        heading = GetEntityHeading(ped),
        invincible = GetPlayerInvincible(PlayerId()),
    }
end

local function freezePlayer()
    local ped = PlayerPedId()
    ClearPedTasksImmediately(ped)
    FreezeEntityPosition(ped, true)
    SetEntityInvincible(ped, true)
    SetPlayerCanDoDriveBy(PlayerId(), false)
end

-- Spieler sicher zurueckgeben (auch nach Fehlern mehrfach aufrufbar)
local function restorePlayer()
    local ped = PlayerPedId()
    local saved = State.saved
    if saved then
        -- Umgebung am Spieler laden, bevor die Freeze geloest wird (sonst Durchfallen)
        RequestCollisionAtCoord(saved.coords.x, saved.coords.y, saved.coords.z)
        local deadline = GetGameTimer() + 3000
        while not HasCollisionLoadedAroundEntity(ped) and GetGameTimer() < deadline do
            Wait(0)
        end
        if #(GetEntityCoords(ped) - saved.coords) > 2.0 then
            SetEntityCoordsNoOffset(ped, saved.coords.x, saved.coords.y, saved.coords.z, false, false, false)
            SetEntityHeading(ped, saved.heading)
        end
        SetEntityInvincible(ped, saved.invincible == true)
    else
        SetEntityInvincible(ped, false)
    end
    FreezeEntityPosition(ped, false)
    SetPlayerCanDoDriveBy(PlayerId(), true)
    State.saved = nil
end

----------------------------------------------------------------------------
-- Oeffnen
----------------------------------------------------------------------------
function OpenCreator()
    if State.open or State.busy then return end
    if IsPauseMenuActive() then return end
    State.busy = true

    local ok, data = Request('openEditor')
    if not ok then
        State.busy = false
        NUI.toast('error', data or 'Creator konnte nicht geoeffnet werden')
        return
    end
    if IsPedInAnyVehicle(PlayerPedId(), false) then
        State.busy = false
        NUI.toast('error', 'Bitte zuerst aus dem Fahrzeug aussteigen')
        Request('closeEditor')
        return
    end

    savePlayerState()
    freezePlayer()

    State.perms = data.perms or {}
    State.user = data.user or ''
    State.open = true
    State.busy = false
    State.selected = nil
    State.inputFocused = false

    local ped = PlayerPedId()
    State.anchor = GetEntityCoords(ped)
    Editor.newDraft(true)

    local camPos = GetGameplayCamCoord()
    local camRot = GetGameplayCamRot(2)
    Cam.create(camPos, vector3(math.max(-60.0, math.min(10.0, camRot.x)), 0.0, camRot.z))

    SetNuiFocus(true, true)
    SetNuiFocusKeepInput(true)
    NUI.send('editorOpen', {
        catalog = Editor.catalogPayload(),
        config = {
            limits = Config.Limits,
            maxDistance = Config.Editor.maxDistance,
            maxElementDistance = Config.Editor.maxElementDistance,
            roles = Config.Roles,
            phases = EC.Phases,
            statusLabels = EC.StatusLabels,
            patientStatus = EC.PatientStatus,
            fireBackend = EC.fireBackend(),
            dispatchJobs = Config.EmergencyDispatch and Config.EmergencyDispatch.jobsByRole or {},
            zfire = {
                fireEffects = Config.ZFire.fireEffects,
                smokeEffects = Config.ZFire.smokeEffects,
                running = GetResourceState(Config.ZFire.resource) == 'started',
            },
        },
        perms = State.perms,
        user = State.user,
        scenarios = data.scenarios,
        incidents = data.incidents,
        storageProblem = data.storageProblem,
    })
    Editor.pushState()
    if data.storageProblem then
        NUI.toast('error', 'Achtung: Die Szenariodatei war beim Serverstart beschaedigt. Siehe Serverkonsole.')
    end

    CreateThread(EditorLoop)
end

----------------------------------------------------------------------------
-- Schliessen (idempotent, auch bei Fehlern)
----------------------------------------------------------------------------
function CloseCreator(skipServer)
    if not State.open then return end
    State.open = false

    pcall(Editor.cleanup)
    pcall(Preview.clear)
    pcall(Cam.destroy)

    SetNuiFocusKeepInput(false)
    SetNuiFocus(false, false)
    NUI.send('editorClose', {})

    restorePlayer()
    if not skipServer then
        CreateThread(function() Request('closeEditor') end)
    end
end

-- Hauptschleife solange der Creator offen ist
function EditorLoop()
    local last = GetGameTimer()
    while State.open do
        local now = GetGameTimer()
        local dt = math.min(0.1, (now - last) / 1000.0)
        last = now

        DisableAllControlActions(0)
        DisableAllControlActions(1)
        DisableAllControlActions(2)
        HideHudAndRadarThisFrame()

        local ok, err = pcall(function()
            Cam.update(dt)
            Editor.frame(dt)
            Preview.draw(State.selected)
        end)
        if not ok then
            U.log('error', 'Editor: %s', tostring(err))
            NUI.toast('error', 'Fehler im Editor: ' .. tostring(err))
            Wait(250)
        end

        -- Sicherheit: Spieler tot oder Ped gewechselt -> Creator schliessen
        local ped = PlayerPedId()
        if IsEntityDead(ped) or (State.saved and State.saved.ped ~= ped) then
            NUI.toast('error', 'Creator wurde geschlossen (Spielerzustand geaendert)')
            CloseCreator()
        end
        Wait(0)
    end
end

----------------------------------------------------------------------------
-- Befehle
----------------------------------------------------------------------------
RegisterCommand(Config.Commands.creator, function()
    if State.open then return end
    CreateThread(OpenCreator)
end, false)

exports('OpenCreator', function()
    CreateThread(OpenCreator)
end)

exports('IsCreatorOpen', function()
    return State.open
end)

RegisterNetEvent(EC.Events.forceClose, function()
    CloseCreator(true)
end)

-- Resource wird gestoppt: alles sicher zuruecksetzen
AddEventHandler('onResourceStop', function(res)
    if res ~= GetCurrentResourceName() then return end
    if State.open then
        pcall(Editor.cleanup)
        pcall(Preview.clear)
        pcall(Cam.destroy)
        SetNuiFocusKeepInput(false)
        SetNuiFocus(false, false)
        local ped = PlayerPedId()
        FreezeEntityPosition(ped, false)
        SetEntityInvincible(ped, State.saved and State.saved.invincible == true or false)
        State.open = false
    end
end)
