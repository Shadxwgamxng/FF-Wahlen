--[[
    Zufallseinsaetze

    Waehlt in zufaelligen Abstaenden ein gespeichertes Szenario aus dem
    Zufallspool und loest es live aus (Uebergabe an die Leitstelle wie bei
    einem manuell ausgeloesten Einsatz).

    Pool-Einstellungen je Szenario (record.random):
      enabled      im Zufallspool
      weight       Gewichtung 1..10 (hoeher = haeufiger)
      time         'immer' | 'tag' | 'nacht'
      cooldown     Minuten Sperrzeit nach einem Zufallsstart dieses Szenarios
      minOnDuty    { fire = n, ems = n, police = n } benoetigte Kraefte im Dienst

    Globale Einstellungen (Storage.settings.random) siehe Config.Random.
]]

local U = EC.Utils

RandomGen = {
    nextAt = nil,
    lastRun = {},   -- scenarioId -> os.time()
    lastInfo = nil, -- letzter Versuch (fuer die Oberflaeche)
}

local function settings()
    Storage.settings = Storage.settings or {}
    local s = Storage.settings.random
    if type(s) ~= 'table' then
        s = {}
        Storage.settings.random = s
    end
    for k, v in pairs(Config.Random) do
        if s[k] == nil then s[k] = v end
    end
    return s
end
RandomGen.settings = settings

function RandomGen.normalizePool(raw)
    raw = type(raw) == 'table' and raw or {}
    local mod = type(raw.minOnDuty) == 'table' and raw.minOnDuty or {}
    local minOnDuty = {}
    for role in pairs(Config.Roles) do
        minOnDuty[role] = math.floor(U.num(mod[role], 0, 0, 20))
    end
    return {
        enabled = raw.enabled == true,
        weight = math.floor(U.num(raw.weight, 1, 1, 10)),
        time = U.inList({ 'immer', 'tag', 'nacht' }, raw.time) and raw.time or 'immer',
        cooldown = math.floor(U.num(raw.cooldown, 30, 0, 1440)),
        minOnDuty = minOnDuty,
    }
end

function RandomGen.normalizeSettings(raw)
    raw = type(raw) == 'table' and raw or {}
    local min = math.floor(U.num(raw.intervalMin, Config.Random.intervalMin, 1, 600))
    local max = math.floor(U.num(raw.intervalMax, Config.Random.intervalMax, 1, 600))
    if max < min then max = min end
    return {
        enabled = raw.enabled == true,
        intervalMin = min,
        intervalMax = max,
        maxActive = math.floor(U.num(raw.maxActive, Config.Random.maxActive, 1, Config.Limits.activeIncidents)),
        dayStart = math.floor(U.num(raw.dayStart, Config.Random.dayStart, 0, 23)),
        dayEnd = math.floor(U.num(raw.dayEnd, Config.Random.dayEnd, 0, 24)),
    }
end

local function isDay(s)
    local h = tonumber(os.date('%H'))
    if s.dayStart <= s.dayEnd then return h >= s.dayStart and h < s.dayEnd end
    return h >= s.dayStart or h < s.dayEnd
end

-- Anzahl Spieler je Rolle im Dienst
function RandomGen.onDutyCounts()
    local counts = {}
    for role in pairs(Config.Roles) do counts[role] = 0 end
    for _, src in ipairs(GetPlayers()) do
        for role in pairs(Config.Roles) do
            if Perm.hasRole(tonumber(src), role) then counts[role] = counts[role] + 1 end
        end
    end
    return counts
end

local function activeRandomCount()
    local n = 0
    for _, inc in pairs(Incidents.list) do
        if inc.random and inc.status ~= EC.Status.ended and inc.status ~= EC.Status.cancelled and inc.status ~= EC.Status.failed then
            n = n + 1
        end
    end
    return n
end

local function isRunning(scenarioId)
    for _, inc in pairs(Incidents.list) do
        if inc.scenarioId == scenarioId and (inc.status == EC.Status.active or inc.status == EC.Status.creating) then return true end
    end
    return false
end

-- Kandidaten mit Begruendung (fuer Anzeige und Auswahl)
function RandomGen.evaluate()
    local s = settings()
    local counts = RandomGen.onDutyCounts()
    local day = isDay(s)
    local now = os.time()
    local list = {}
    for id, record in pairs(Storage.scenarios) do
        local pool = RandomGen.normalizePool(record.random)
        if pool.enabled then
            local reason
            if pool.time == 'tag' and not day then reason = 'nur tagsueber'
            elseif pool.time == 'nacht' and day then reason = 'nur nachts'
            elseif RandomGen.lastRun[id] and now - RandomGen.lastRun[id] < pool.cooldown * 60 then
                reason = ('Sperrzeit noch %d min'):format(math.ceil((pool.cooldown * 60 - (now - RandomGen.lastRun[id])) / 60))
            elseif isRunning(id) then reason = 'laeuft bereits'
            else
                for role, need in pairs(pool.minOnDuty) do
                    if need > 0 and (counts[role] or 0) < need then
                        reason = ('zu wenig %s im Dienst (%d/%d)'):format(Config.Roles[role].label, counts[role] or 0, need)
                        break
                    end
                end
            end
            list[#list + 1] = { id = id, name = record.scenario.name, keyword = record.scenario.keyword,
                categoryLabel = (EC.CategoryById[record.scenario.category] or {}).label, pool = pool,
                eligible = reason == nil, reason = reason, lastRun = RandomGen.lastRun[id] }
        end
    end
    table.sort(list, function(a, b) return a.name < b.name end)
    return list, counts
end

local function scheduleNext()
    local s = settings()
    RandomGen.nextAt = os.time() + math.random(s.intervalMin, s.intervalMax) * 60
end

-- Einen Zufallseinsatz starten. force = Intervall und Gesamtgrenze ignorieren (manuell)
function RandomGen.run(force)
    local s = settings()
    if not force and activeRandomCount() >= s.maxActive then
        RandomGen.lastInfo = { at = os.time(), text = 'Grenze gleichzeitiger Zufallseinsaetze erreicht' }
        return false, RandomGen.lastInfo.text
    end
    local list = RandomGen.evaluate()
    local total, pool = 0, {}
    for _, c in ipairs(list) do
        if c.eligible then
            pool[#pool + 1] = c
            total = total + c.pool.weight
        end
    end
    if total == 0 then
        RandomGen.lastInfo = { at = os.time(), text = 'Kein passendes Szenario im Zufallspool' }
        return false, RandomGen.lastInfo.text
    end
    local pick = math.random(total)
    local chosen
    for _, c in ipairs(pool) do
        pick = pick - c.pool.weight
        if pick <= 0 then chosen = c break end
    end
    local sc, err = Validate.scenario(Storage.scenarios[chosen.id].scenario)
    if not sc then
        RandomGen.lastInfo = { at = os.time(), text = ('Szenario %s ungueltig: %s'):format(chosen.id, err) }
        return false, RandomGen.lastInfo.text
    end
    RandomGen.lastRun[chosen.id] = os.time()
    local ok, idOrErr = Incidents.create(nil, sc, 'live', chosen.id, { random = true, actorName = 'Zufallsgenerator', variant = 'random' })
    RandomGen.lastInfo = { at = os.time(), text = ok and ('%s gestartet (%s)'):format(chosen.name, idOrErr) or ('Fehler: %s'):format(idOrErr) }
    U.log(ok and 'info' or 'warn', 'Zufallseinsatz: %s', RandomGen.lastInfo.text)
    return ok, ok and idOrErr or idOrErr
end

function RandomGen.status()
    local s = settings()
    local list, counts = RandomGen.evaluate()
    return {
        settings = s,
        nextAt = s.enabled and RandomGen.nextAt or nil,
        now = os.time(),
        candidates = list,
        onDuty = counts,
        activeRandom = activeRandomCount(),
        lastInfo = RandomGen.lastInfo,
    }
end

function RandomGen.saveSettings(raw)
    local s = RandomGen.normalizeSettings(raw)
    local wasEnabled = settings().enabled
    Storage.settings.random = s
    if s.enabled and (not wasEnabled or not RandomGen.nextAt) then scheduleNext() end
    if not s.enabled then RandomGen.nextAt = nil end
    return Storage.saveSettings()
end

function RandomGen.setPool(scenarioId, raw)
    local record = Storage.scenarios[scenarioId]
    if not record then return false, 'Szenario nicht gefunden' end
    local old = record.random
    record.random = RandomGen.normalizePool(raw)
    if not Storage.saveScenarios() then
        record.random = old
        return false, 'Speichern fehlgeschlagen'
    end
    return true
end

CreateThread(function()
    while true do
        Wait(30000)
        local ok, err = pcall(function()
            local s = settings()
            if not s.enabled then return end
            if not RandomGen.nextAt then scheduleNext() return end
            if os.time() >= RandomGen.nextAt then
                scheduleNext()
                RandomGen.run(false)
            end
        end)
        if not ok then U.log('error', 'Zufallsgenerator: %s', tostring(err)) end
    end
end)
