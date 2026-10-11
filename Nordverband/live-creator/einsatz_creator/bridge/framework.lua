--[[
    Optionale Framework-Anbindung (nur fuer Job-Abfragen)

    Unterstuetzt: es_extended (ESX), qb-core (QBCore), qbx_core (QBox).
    Ohne Framework arbeitet der Creator ausschliesslich mit ACE-Rechten.
]]

local U = EC.Utils

Framework = { name = 'none' }

local ESX, QBCore

local function started(res)
    return GetResourceState(res) == 'started'
end

function Framework.init()
    local wanted = Config.Framework
    if wanted == 'auto' then
        if started('qbx_core') then wanted = 'qbx'
        elseif started('qb-core') then wanted = 'qb'
        elseif started('es_extended') then wanted = 'esx'
        else wanted = 'none' end
    end

    local ok, err = pcall(function()
        if wanted == 'esx' then
            ESX = exports['es_extended']:getSharedObject()
        elseif wanted == 'qb' then
            QBCore = exports['qb-core']:GetCoreObject()
        end
    end)
    if not ok then
        U.log('error', 'Framework "%s" konnte nicht geladen werden (%s). Es werden nur ACE-Rechte genutzt.', wanted, tostring(err))
        wanted = 'none'
    end

    Framework.name = wanted
    U.log('info', 'Framework: %s', wanted)
end

-- Rueckgabe: { name = 'fire', grade = 3, onDuty = true } oder nil
function Framework.getJob(src)
    local ok, job = pcall(function()
        if Framework.name == 'esx' and ESX then
            local xPlayer = ESX.GetPlayerFromId(src)
            if not xPlayer or not xPlayer.job then return nil end
            return { name = xPlayer.job.name, grade = tonumber(xPlayer.job.grade) or 0, onDuty = true }
        elseif Framework.name == 'qb' and QBCore then
            local player = QBCore.Functions.GetPlayer(src)
            local j = player and player.PlayerData and player.PlayerData.job
            if not j then return nil end
            return { name = j.name, grade = tonumber(j.grade and j.grade.level) or 0, onDuty = j.onduty ~= false }
        elseif Framework.name == 'qbx' then
            local player = exports.qbx_core:GetPlayer(src)
            local j = player and player.PlayerData and player.PlayerData.job
            if not j then return nil end
            return { name = j.name, grade = tonumber(j.grade and j.grade.level) or 0, onDuty = j.onduty ~= false }
        end
        return nil
    end)
    if ok then return job end
    U.log('debug', 'Job-Abfrage fuer %s fehlgeschlagen: %s', tostring(src), tostring(job))
    return nil
end

-- Anzeigename (Charaktername falls verfuegbar, sonst Spielername)
function Framework.getName(src)
    local ok, name = pcall(function()
        if Framework.name == 'esx' and ESX then
            local xPlayer = ESX.GetPlayerFromId(src)
            return xPlayer and xPlayer.getName and xPlayer.getName() or nil
        elseif (Framework.name == 'qb' and QBCore) or Framework.name == 'qbx' then
            local player = Framework.name == 'qb' and QBCore.Functions.GetPlayer(src) or exports.qbx_core:GetPlayer(src)
            local ci = player and player.PlayerData and player.PlayerData.charinfo
            if ci then return ('%s %s'):format(ci.firstname or '', ci.lastname or '') end
        end
        return nil
    end)
    if ok and name and name ~= '' and name ~= ' ' then return name end
    return GetPlayerName(src) or ('ID ' .. tostring(src))
end
