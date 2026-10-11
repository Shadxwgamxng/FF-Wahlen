--[[
    Berechtigungen - ausschliesslich serverseitig ausgewertet.
]]

Perm = {}

local function aceAllowed(src, ace)
    return ace and ace ~= '' and IsPlayerAceAllowed(src, ace)
end

-- Darf der Spieler die Creator-Aktion der Stufe level ausfuehren?
-- level: use | test | live | manage | delete
function Perm.can(src, level)
    src = tonumber(src)
    if not src or src <= 0 then return false end
    if aceAllowed(src, Config.Permissions.ace[level]) then return true end

    local rules = Config.Permissions.jobs[level]
    if rules and #rules > 0 and Framework.name ~= 'none' then
        local job = Framework.getJob(src)
        if job then
            for _, rule in ipairs(rules) do
                if rule.job == job.name and job.grade >= (rule.minGrade or 0) then return true end
            end
        end
    end
    return false
end

-- Hat der Spieler die Einsatzrolle (fire | ems | police)?
function Perm.hasRole(src, role)
    local def = Config.Roles[role]
    if not def then return false end
    if aceAllowed(src, def.ace) then return true end
    if Framework.name ~= 'none' and def.jobs then
        local job = Framework.getJob(src)
        if job and EC.Utils.inList(def.jobs, job.name) then
            return job.onDuty or not Config.OnlyOnDuty
        end
    end
    return false
end

function Perm.rolesOf(src)
    local roles = {}
    for role in pairs(Config.Roles) do
        if Perm.hasRole(src, role) then roles[#roles + 1] = role end
    end
    return roles
end

-- Hat der Spieler eine der Rollen? Leere Liste = jeder
function Perm.hasAnyRole(src, roles)
    if not roles or #roles == 0 then return true end
    for _, role in ipairs(roles) do
        if Perm.hasRole(src, role) then return true end
    end
    return false
end

function Perm.identifier(src)
    for _, kind in ipairs({ 'license', 'license2', 'fivem', 'discord', 'steam' }) do
        local id = GetPlayerIdentifierByType(src, kind)
        if id then return id end
    end
    return 'unknown:' .. tostring(src)
end

function Perm.actor(src)
    return { name = Framework.getName(src), id = Perm.identifier(src), src = src }
end

-- Rechte-Uebersicht fuer die Oberflaeche (nur Anzeige; jede Aktion wird erneut geprueft)
function Perm.summary(src)
    return {
        use = Perm.can(src, 'use'),
        test = Perm.can(src, 'test'),
        live = Perm.can(src, 'live'),
        manage = Perm.can(src, 'manage'),
        delete = Perm.can(src, 'delete'),
    }
end
