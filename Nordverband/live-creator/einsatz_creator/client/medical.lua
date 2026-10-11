--[[
    Medizinische Versorgung - Menue (ox_lib Context) und Ablauf

    Alle Werte und Entscheidungen liegen auf dem Server (Request 'medAction').
    Der Client zeigt Menues, spielt Gespraeche/Befunde als Untertitel ab und
    oeffnet danach das Menue erneut.
]]

local U = EC.Utils

MedClient = { busy = false, current = nil }

local MEASURES = {
    { 'rr', 'Blutdruck messen', 'heart-pulse' },
    { 'hf', 'Herzfrequenz messen', 'heart' },
    { 'spo2', 'Sauerstoffsaettigung messen', 'lungs' },
    { 'bz', 'Blutzucker messen', 'droplet' },
    { 'temp', 'Temperatur messen', 'temperature-half' },
    { 'pupils', 'Pupillen pruefen', 'eye' },
    { 'gcs', 'Bewusstseinslage (GCS)', 'brain' },
    { 'af', 'Atemfrequenz zaehlen', 'wind' },
}

local TALKS = {
    { 'talk_hello', 'Ansprechen', 'Koennen Sie mich hoeren?' },
    { 'talk_what', 'Was ist passiert?', nil },
    { 'talk_pain', 'Schmerzen erfragen', 'Skala 1 bis 10' },
    { 'talk_name', 'Name erfragen', nil },
    { 'talk_insurance', 'Krankenkasse erfragen', nil },
}

local function valueText(v, key)
    local x = v[key]
    if x == nil then return 'noch nicht gemessen' end
    if key == 'rr' then return x .. ' mmHg' end
    if key == 'hf' or key == 'af' then return x .. ' /min' end
    if key == 'spo2' then return x .. ' %' end
    if key == 'bz' then return ('%.1f mmol/l'):format(x) end
    if key == 'temp' then return ('%.1f °C'):format(x) end
    return tostring(x)
end

-- Naechste Trage in der Naehe des Patienten
local stretcherHashes
local function nearestStretcher(pos)
    if not stretcherHashes then
        stretcherHashes = {}
        for _, m in ipairs(Config.Rescue.stretcherModels) do stretcherHashes[GetHashKey(m)] = true end
    end
    local best, bestD = nil, Config.Rescue.stretcherDistance
    for _, pool in ipairs({ 'CVehicle', 'CObject' }) do
        for _, ent in ipairs(GetGamePool(pool)) do
            if stretcherHashes[GetEntityModel(ent)] and NetworkGetEntityIsNetworked(ent) then
                local d = #(GetEntityCoords(ent) - pos)
                if d < bestD then best, bestD = ent, d end
            end
        end
    end
    return best
end

local function patientPos(incidentId, patientId)
    local inc = World.incidents[incidentId]
    local p = inc and inc.rescue and inc.rescue.patients[patientId]
    if p and p.net and NetworkDoesNetworkIdExist(p.net) then
        local ent = NetworkGetEntityFromNetworkId(p.net)
        if ent and ent ~= 0 then return GetEntityCoords(ent) end
    end
    return nil
end

----------------------------------------------------------------------------
-- Massnahme ausfuehren und danach Menue wieder oeffnen
----------------------------------------------------------------------------
function MedClient.act(action, arg, reopen)
    local cur = MedClient.current
    if not cur or MedClient.busy then return end
    MedClient.busy = true
    CreateThread(function()
        local ped = PlayerPedId()
        if action == 'stretcher' then
            local pos = patientPos(cur.incident, cur.patient)
            local s = pos and nearestStretcher(pos)
            if not s then
                NUI.toast('error', 'Keine Trage in der Naehe des Patienten (max. ' .. math.floor(Config.Rescue.stretcherDistance) .. ' m)')
                MedClient.busy = false
                return MedClient.open(cur.incident, cur.patient, reopen)
            end
            arg = NetworkGetNetworkIdFromEntity(s)
        end
        local kneel = not IsPedInAnyVehicle(ped, false) and not action:find('^talk_')
        if kneel then TaskStartScenarioInPlace(ped, 'CODE_HUMAN_MEDIC_KNEEL', 0, true) end
        local ok, res = Request('medAction', { incidentId = cur.incident, patientId = cur.patient, action = action, arg = arg })
        if not ok then
            NUI.toast('error', res or 'Massnahme nicht moeglich')
            if kneel then ClearPedTasks(ped) end
            MedClient.busy = false
            return MedClient.open(cur.incident, cur.patient, reopen)
        end
        local lines = res.lines or {}
        NUI.send('subtitles', { lines = lines, ms = Config.Medical.subtitleMs })
        Wait(#lines * Config.Medical.subtitleMs)
        if kneel then ClearPedTasks(ped) end
        MedClient.busy = false
        if action ~= 'no_transport' then MedClient.open(cur.incident, cur.patient, reopen, res.view) end
    end)
end

----------------------------------------------------------------------------
-- Menues
----------------------------------------------------------------------------
local function register(id, title, options, parent)
    lib.registerContext({ id = id, title = title, menu = parent, options = options })
end

local function buildMenus(view)
    local v = view.vitals or {}
    local main = 'ec_med_main'

    -- Gespraech
    local talk = {}
    for _, t in ipairs(TALKS) do
        talk[#talk + 1] = { title = t[2], description = t[3], icon = 'comment-medical',
            onSelect = function() MedClient.act(t[1], nil, 'ec_med_talk') end }
    end
    register('ec_med_talk', 'Gespraech', talk, main)

    -- Diagnostik
    local diag = {}
    for _, m in ipairs(MEASURES) do
        diag[#diag + 1] = { title = m[2], description = valueText(v, m[1]), icon = m[3],
            onSelect = function() MedClient.act('measure', m[1], 'ec_med_diag') end }
    end
    register('ec_med_diag', 'Diagnostik', diag, main)

    -- Sauerstoff
    local o2 = {}
    for _, l in ipairs(Medical.Oxygen) do
        o2[#o2 + 1] = { title = ('%d l/min'):format(l), icon = 'lungs', disabled = view.o2 == l,
            description = view.o2 == l and 'laeuft' or nil,
            onSelect = function() MedClient.act('oxygen', l, 'ec_med_o2') end }
    end
    o2[#o2 + 1] = { title = 'Sauerstoff abnehmen', icon = 'ban', disabled = view.o2 == 0,
        onSelect = function() MedClient.act('oxygen', 0, 'ec_med_o2') end }
    register('ec_med_o2', ('Sauerstoff (aktuell %d l/min)'):format(view.o2 or 0), o2, main)

    -- Medikamente (nach Gruppen)
    local groups, order = {}, {}
    for _, m in ipairs(Medical.Medications) do
        if not groups[m.group] then groups[m.group] = {} order[#order + 1] = m.group end
        local needs = {}
        for _, n in ipairs(m.needs or {}) do needs[#needs + 1] = n:upper() end
        groups[m.group][#groups[m.group] + 1] = { title = m.label, icon = 'syringe',
            description = #needs > 0 and ('erfordert Messung: ' .. table.concat(needs, ', ')) or nil,
            onSelect = function() MedClient.act('med', m.id, 'ec_med_meds_' .. m.group) end }
    end
    local meds = {}
    for _, g in ipairs(order) do
        register('ec_med_meds_' .. g, g, groups[g], 'ec_med_meds')
        meds[#meds + 1] = { title = g, icon = 'pills', menu = 'ec_med_meds_' .. g }
    end
    register('ec_med_meds', view.canula and 'Medikamente' or 'Medikamente (kein Zugang!)', meds, main)

    -- Wunden und Immobilisation
    local wounds = {
        { title = 'Bodycheck', description = view.bodyChecked and 'durchgefuehrt' or 'Patient abtasten', icon = 'hand',
            onSelect = function() MedClient.act('bodycheck', nil, 'ec_med_wounds') end },
        { title = 'Pflaster', icon = 'bandage', onSelect = function() MedClient.act('pflaster', nil, 'ec_med_wounds') end },
        { title = 'Verband', icon = 'bandage', onSelect = function() MedClient.act('verband', nil, 'ec_med_wounds') end },
        { title = 'Schiene (SAM Splint)', icon = 'bone', onSelect = function() MedClient.act('schiene', nil, 'ec_med_wounds') end },
        { title = 'Stifneck', description = view.stifneck and 'angelegt' or nil, icon = 'user-injured',
            onSelect = function() MedClient.act('stifneck', nil, 'ec_med_wounds') end },
        { title = 'Beckenschlinge', description = view.beckenschlinge and 'angelegt' or nil, icon = 'user-injured',
            onSelect = function() MedClient.act('beckenschlinge', nil, 'ec_med_wounds') end },
    }
    for _, f in ipairs(view.findings or {}) do
        wounds[#wounds + 1] = { title = ('%s: %s'):format(f.label, f.text), icon = f.treated and 'check' or 'triangle-exclamation',
            description = f.treated and 'versorgt' or 'unversorgt', disabled = true }
    end
    register('ec_med_wounds', 'Wunden und Immobilisation', wounds, main)

    -- Transport
    register('ec_med_transport', 'Transport', {
        { title = 'Transport besprechen', icon = 'comments', onSelect = function() MedClient.act('transport_ask', nil, 'ec_med_transport') end },
        { title = 'Auf die Trage legen', icon = 'bed', disabled = view.onStretcher or view.trapped,
            description = view.trapped and 'Patient ist eingeklemmt' or ('Trage im Umkreis von %d m'):format(math.floor(Config.Rescue.stretcherDistance)),
            onSelect = function() MedClient.act('stretcher', nil, 'ec_med_transport') end },
        { title = 'Kein Transport notwendig', icon = 'house', description = 'Patient bleibt vor Ort / geht nach Hause',
            disabled = view.onStretcher or view.trapped,
            onSelect = function()
                local alert = lib.alertDialog({ header = 'Kein Transport', content = 'Patient wirklich vor Ort entlassen?', centered = true, cancel = true })
                if alert == 'confirm' then MedClient.act('no_transport', nil) end
            end },
    }, main)

    -- Offene Massnahmen
    local open = {}
    for _, o in ipairs(view.open or {}) do open[#open + 1] = { title = o, icon = 'circle-exclamation', disabled = true } end
    if #open == 0 then open[1] = { title = 'Alles erledigt - transportbereit', icon = 'check', disabled = true } end
    register('ec_med_open', 'Offene Massnahmen', open, main)

    local vitalsLine = ('RR %s · HF %s · SpO2 %s'):format(valueText(v, 'rr'), valueText(v, 'hf'), valueText(v, 'spo2'))
    register(main, ('%s - %s'):format(view.name, EC.PatientStatus[view.status] or view.status), {
        { title = 'Zustand', description = vitalsLine, icon = view.complete and 'circle-check' or 'stethoscope', disabled = true },
        { title = 'Gespraech', icon = 'comment-medical', menu = 'ec_med_talk' },
        { title = 'Diagnostik', icon = 'stethoscope', menu = 'ec_med_diag' },
        { title = 'Sauerstoff', description = ('%d l/min'):format(view.o2 or 0), icon = 'lungs', menu = 'ec_med_o2' },
        { title = view.canula and 'Zugang liegt' or 'Zugang legen', icon = 'syringe', disabled = view.canula,
            onSelect = function() MedClient.act('canula', nil) end },
        { title = 'Medikamente', icon = 'pills', menu = 'ec_med_meds' },
        { title = 'Wunden und Immobilisation', icon = 'bandage', menu = 'ec_med_wounds' },
        { title = 'Transport', icon = 'truck-medical', menu = 'ec_med_transport' },
        { title = ('Offene Massnahmen (%d)'):format(#(view.open or {})), icon = 'list-check', menu = 'ec_med_open' },
    })
end

function MedClient.open(incidentId, patientId, menuId, view)
    if GetResourceState('ox_lib') ~= 'started' or not lib then
        NUI.toast('error', 'ox_lib ist nicht gestartet - Behandlungsmenue nicht verfuegbar')
        return
    end
    MedClient.current = { incident = incidentId, patient = patientId }
    if not view then
        local ok, res = Request('medView', { incidentId = incidentId, patientId = patientId })
        if not ok then return NUI.toast('error', res or 'Patient nicht erreichbar') end
        view = res
    end
    buildMenus(view)
    lib.showContext(menuId or 'ec_med_main')
end
