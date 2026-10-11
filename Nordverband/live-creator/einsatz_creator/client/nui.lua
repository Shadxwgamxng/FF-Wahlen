--[[
    NUI-Kommunikation und Server-Anfragen

    Lua -> NUI:  SendNUIMessage({ action = '<name>', data = <Tabelle> })
    NUI -> Lua:  fetch('https://<resource>/<callback>', { body: JSON })
                 Antwort immer { ok = bool, data = ..., error = 'Text' }
    Client -> Server: EC.Events.request (reqId, name, payload) -> EC.Events.response
]]

local U = EC.Utils

NUI = {}

function NUI.send(action, data)
    SendNUIMessage({ action = action, data = data })
end

function NUI.toast(kind, text)
    NUI.send('toast', { kind = kind, text = text })
end

--[[
    Callback registrieren. fn(data) gibt ok, data|fehler zurueck.
    Handler laufen in einem eigenen Thread, damit sie auf den Server warten duerfen.
]]
function NUI.on(name, fn)
    RegisterNUICallback(name, function(data, cb)
        CreateThread(function()
            local ok, res1, res2 = pcall(fn, type(data) == 'table' and data or {})
            if not ok then
                U.log('error', 'NUI-Callback %s: %s', name, tostring(res1))
                cb({ ok = false, error = 'Interner Fehler' })
            elseif res1 == false then
                cb({ ok = false, error = res2 })
            else
                cb({ ok = true, data = res2 })
            end
        end)
    end)
end

----------------------------------------------------------------------------
-- Server-Anfragen (blockierend, nur aus Threads aufrufen)
----------------------------------------------------------------------------
local pending, nextId = {}, 0

function Request(name, payload, timeoutMs)
    nextId = nextId + 1
    local id = nextId
    local p = promise.new()
    pending[id] = p
    TriggerServerEvent(EC.Events.request, id, name, payload)
    SetTimeout(timeoutMs or 15000, function()
        if pending[id] then
            pending[id] = nil
            p:resolve({ false, 'Keine Antwort vom Server' })
        end
    end)
    local res = Citizen.Await(p)
    return res[1], res[2]
end

RegisterNetEvent(EC.Events.response, function(reqId, ok, data)
    local p = pending[reqId]
    if p then
        pending[reqId] = nil
        p:resolve({ ok, data })
    end
end)

RegisterNetEvent(EC.Events.notify, function(kind, text)
    NUI.toast(kind, text)
end)
