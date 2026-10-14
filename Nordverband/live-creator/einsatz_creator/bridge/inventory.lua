--[[
    Inventar-Bruecke (ox_inventory)
    Aufgezogene Spritzen werden als Item mit Metadaten ausgegeben; beim Injizieren wird das Item
    verbraucht und eine benutzte Spritze ausgegeben. Ohne ox_inventory (oder Config.Items.enabled = false)
    wird ohne Items direkt verabreicht.
]]
Inv = {}
local U = EC.Utils

function Inv.active()
    local cfg = Config.Items or {}
    return cfg.enabled ~= false and GetResourceState(cfg.resource or 'ox_inventory') == 'started'
end

local function ox() return exports[(Config.Items and Config.Items.resource) or 'ox_inventory'] end

-- gibt (true, slot) oder (false, Fehler) zurueck
function Inv.add(src, item, metadata)
    local ok, res = pcall(function() return { ox():AddItem(src, item, 1, metadata) } end)
    if not ok then return false, 'Inventar-Fehler: ' .. tostring(res) end
    local success, info = res[1], res[2]
    if not success then
        return false, info == 'inventory_full' and 'Inventar ist voll' or ('Item konnte nicht ausgegeben werden (%s)'):format(tostring(info))
    end
    local slot = type(info) == 'table' and (info.slot or (info[1] and info[1].slot)) or nil
    return true, slot
end

-- Item in einem Slot lesen (nur wenn es das erwartete Item ist)
function Inv.get(src, slot, item)
    local ok, data = pcall(function() return ox():GetSlot(src, slot) end)
    if not ok or type(data) ~= 'table' or data.name ~= item or (data.count or 0) < 1 then return nil end
    return data
end

function Inv.remove(src, item, slot, metadata)
    local ok, res = pcall(function() return ox():RemoveItem(src, item, 1, metadata, slot) end)
    return ok and res and true or false
end

-- Metadaten fuer die aufgezogene Spritze (Anzeige im Inventar + Werte fuer die Gabe)
function Inv.syringeMeta(prep, by)
    local drug = Material.DrugById[prep.drug]
    local syr = Material.SyringeById[prep.syringe or '']
    local amount = drug and prep.drugMl * drug.conc or 0
    local amountTxt = drug and Med.fmtAmount(amount, drug.unit) or '?'
    local mlTxt = (('%g'):format(U.round(prep.totalMl, 1))):gsub('%.', ',')
    local time = os.date('%H:%M')
    return {
        label = drug and ('%s %s / %s ml'):format(drug.label, amountTxt, mlTxt) or 'Spritze (unbeschriftet)',
        description = ('%s · %s ml%s · aufgezogen %s Uhr%s%s'):format(syr and syr.label or 'Spritze', mlTxt,
            prep.air > 0.02 and (' · Luft ' .. (('%g'):format(U.round(prep.air, 2))):gsub('%.', ',') .. ' ml') or '',
            time, by and (' von ' .. by) or '', prep.labeled and '' or ' · OHNE ETIKETT'),
        ec = { drug = prep.drug, drugMl = prep.drugMl, totalMl = prep.totalMl, air = prep.air, syringe = prep.syringe,
            needle = prep.needle, labeled = prep.labeled, checked = prep.checked, at = os.time() },
    }
end
