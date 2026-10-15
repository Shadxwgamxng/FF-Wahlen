--[[
    Werkzeuge aus Technical Dispatches (siehe Config.Tools)
    Prueft, ob der Spieler das noetige Item hat (ox_inventory, sonst QBCore/ESX).
]]
Tools = {}
local U = EC.Utils

function Tools.active()
    local r = Config.Tools and Config.Tools.require
    if r == true then return true end
    if r == false or r == nil then return false end
    return GetResourceState(Config.Tools.resource or 'technical_dispatches') == 'started'
end

local function itemCount(src, name)
    if GetResourceState('ox_inventory') == 'started' then
        local ok, n = pcall(function() return exports.ox_inventory:Search(src, 'count', name) end)
        if ok then return tonumber(n) or 0 end
    end
    return Framework.itemCount and Framework.itemCount(src, name) or 0
end

-- Rueckgabe: true, itemName | false, Fehlertext
function Tools.check(src, action)
    local cfg = Config.Tools and Config.Tools.actions and Config.Tools.actions[action]
    if not cfg or not cfg.items or #cfg.items == 0 or not Tools.active() then return true end
    for _, name in ipairs(cfg.items) do
        if itemCount(src, name) > 0 then return true, name end
    end
    return false, ('Dafuer brauchst du: %s'):format(cfg.label or table.concat(cfg.items, ' / '))
end

-- Verbrauchsmaterial abziehen (z. B. Oelbindemittel, wenn consume = true)
function Tools.consume(src, action, item)
    local cfg = Config.Tools and Config.Tools.actions and Config.Tools.actions[action]
    if not cfg or not cfg.consume or not item or not Tools.active() then return end
    if GetResourceState('ox_inventory') == 'started' then
        pcall(function() exports.ox_inventory:RemoveItem(src, item, 1) end)
    elseif Framework.removeItem then
        Framework.removeItem(src, item)
    end
end
