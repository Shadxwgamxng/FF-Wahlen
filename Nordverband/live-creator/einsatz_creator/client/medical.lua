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
    { 'ekg', 'EKG kleben (4-Kanal)', 'wave-square' },
    { 'ekg12', '12-Kanal-EKG schreiben', 'heart-circle-check' },
    { 'lung', 'Lunge abhoeren (Auskultation)', 'stethoscope' },
    { 'recap', 'Rekapillarisierungszeit', 'hand-pointer' },
    { 'skin', 'Haut beurteilen', 'hand' },
}

local SAMPLER = {
    { 's', 'S - Symptome' }, { 'a', 'A - Allergien' }, { 'm', 'M - Medikamente' }, { 'p', 'P - Patientengeschichte' },
    { 'l', 'L - Letzte Mahlzeit' }, { 'e', 'E - Ereignis' }, { 'r', 'R - Risikofaktoren' },
}
local OPQRST = {
    { 'o', 'O - Onset (Beginn)' }, { 'p', 'P - Provokation / Linderung' }, { 'q', 'Q - Qualitaet' },
    { 'r', 'R - Radiation (Ausstrahlung)' }, { 's', 'S - Severity (Staerke)' }, { 't', 'T - Time (Dauer)' },
}

-- Minispiele je Massnahme (Ergebnis wird an den Server geschickt)
local GAMES = {
    ['measure:bz'] = { type = 'bz', title = 'Blutzucker messen', awaitValue = true },
    ['measure:ekg'] = { type = 'ekg', title = 'EKG-Elektroden kleben (4-Kanal)', twelve = false, awaitValue = true },
    ['measure:ekg12'] = { type = 'ekg', title = '12-Kanal-EKG anlegen', twelve = true, awaitValue = true },
    ['proc:iv'] = { type = 'iv', title = 'Venenzugang legen' },
    ['proc:tubus'] = { type = 'timing', title = 'Larynxtubus einlegen', hint = 'Im richtigen Moment vorschieben', hits = 1, speed = 1.5 },
    ['proc:io'] = { type = 'io', title = 'Intraossaerer Zugang' },
    ['proc:thorax'] = { type = 'landmark', title = 'Thoraxentlastungspunktion' },
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
-- Minispiel in der Oberflaeche spielen. Rueckgabe: ergebnis (true/false/Seite) oder nil bei Abbruch
----------------------------------------------------------------------------
function MedClient.game(def)
    local p = promise.new()
    MedClient.gamePromise = p
    SetNuiFocus(true, true)
    NUI.send('minigame', def)
    local res = Citizen.Await(p)
    if not State.open then SetNuiFocus(false, false) end
    return res
end

NUI.on('minigameDone', function(data)
    local p = MedClient.gamePromise
    MedClient.gamePromise = nil
    if p then p:resolve({ result = data.result, cancel = data.cancel == true }) end
    return true
end)

----------------------------------------------------------------------------
-- Medikament aufziehen: Materialschrank mit Spritzen, Kanuelen, Gebinden und Medikamenten
----------------------------------------------------------------------------
local materialSent = false

function MedClient.itemsActive()
    local cfg = Config.Items or {}
    return cfg.enabled ~= false and GetResourceState(cfg.resource or 'ox_inventory') == 'started'
end

-- aufgezogene Spritzen im eigenen Inventar
function MedClient.preparedSyringes()
    if not MedClient.itemsActive() then return {} end
    local ok, slots = pcall(function() return exports[Config.Items.resource or 'ox_inventory']:Search('slots', Config.Items.prepared) end)
    if not ok or type(slots) ~= 'table' then return {} end
    table.sort(slots, function(a, b) return (a.slot or 0) < (b.slot or 0) end)
    return slots
end

function MedClient.prepGame(medId, cur)
    local m = medId and EC.MedicationById[medId]
    local view = cur and cur.view or {}
    local def = {
        type = 'prep', title = medId and 'Medikament vorbereiten' or 'Medikament aufziehen',
        order = medId and { id = medId, label = m and m.label or medId, route = m and m.route or 'iv' } or nil,
        items = MedClient.itemsActive(),
        patient = view.name or 'Patient',
        access = view.access,
        staff = GetPlayerName(PlayerId()),
    }
    if not materialSent then
        def.material = { syringes = Material.Syringes, needles = Material.Needles, containers = Material.Containers,
            drugs = Material.Drugs, colors = Material.LabelColors }
        materialSent = true
    end
    return def
end

-- Aufziehen ohne Verordnung: Spritze kommt nur ins Inventar
function MedClient.prepareFree(reopen)
    local cur = MedClient.current
    if MedClient.busy then return end
    MedClient.busy = true
    CreateThread(function()
        local g = MedClient.game(MedClient.prepGame(nil, cur))
        if g and not g.cancel and type(g.result) == 'table' and g.result.prep then
            local ok, res = Request('prepStore', { prep = g.result.prep })
            NUI.toast(ok and 'success' or 'error', ok and 'Aufgezogene Spritze eingesteckt' or (res or 'Fehler'))
        end
        MedClient.busy = false
        if cur then MedClient.open(cur.incident, cur.patient, reopen) end
    end)
end

----------------------------------------------------------------------------
-- Herzdruckmassage: Einsatzkraft kniet neben dem Patienten und drueckt (Animation mit Fortschrittsbalken)
----------------------------------------------------------------------------
function MedClient.cpr(cur)
    local ped = PlayerPedId()
    local cfg = Config.Medical.cpr or {}
    local pos = patientPos(cur.incident, cur.patient)
    if pos then
        TaskTurnPedToFaceCoord(ped, pos.x, pos.y, pos.z, 800)
        Wait(800)
    end
    return lib.progressBar({
        duration = cfg.durationMs or 18000,
        label = 'Herzdruckmassage 30:2',
        canCancel = true,
        disable = { move = true, car = true, combat = true },
        anim = { dict = cfg.dict or 'mini@cpr@char_a@cpr_str', clip = cfg.clip or 'cpr_pumpchest', flag = 1 },
    })
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
        local talking = action:find('^talk_') or action == 'sampler' or action == 'opqrst'
        if action == 'proc' and arg == 'cpr' then
            -- Herzdruckmassage: nur die CPR-Animation, kein Minispiel
            if not MedClient.cpr(cur) then
                MedClient.busy = false
                return MedClient.open(cur.incident, cur.patient, reopen)
            end
            talking = true
        end
        local kneel = not IsPedInAnyVehicle(ped, false) and not talking
        if kneel then TaskStartScenarioInPlace(ped, 'CODE_HUMAN_MEDIC_KNEEL', 0, true) end
        local result
        local game = GAMES[action .. ':' .. tostring(arg)]
        if action == 'med' and Material.isDrawable(Material.DrugByMed[arg]) then game = MedClient.prepGame(arg, cur) end
        if game then
            local g = MedClient.game(game)
            if not g or g.cancel then
                if kneel then ClearPedTasks(ped) end
                MedClient.busy = false
                return MedClient.open(cur.incident, cur.patient, reopen)
            end
            result = g.result
            if action == 'med' and type(result) == 'table' and result.prep then
                local okS, resS = Request('prepStore', { prep = result.prep })
                if not okS then
                    NUI.toast('error', resS or 'Spritze konnte nicht eingesteckt werden')
                    if kneel then ClearPedTasks(ped) end
                    MedClient.busy = false
                    return MedClient.open(cur.incident, cur.patient, reopen)
                end
                if not result.give then
                    NUI.toast('success', 'Aufgezogene Spritze eingesteckt')
                    if kneel then ClearPedTasks(ped) end
                    MedClient.busy = false
                    return MedClient.open(cur.incident, cur.patient, 'ec_med_syringes')
                end
                action, arg, result = 'inject', resS.slot, nil
                game = nil
            end
        end
        local ok, res = Request('medAction', { incidentId = cur.incident, patientId = cur.patient, action = action, arg = arg, result = result })
        if game and game.awaitValue then
            -- Messwert im Minispiel anzeigen (BZ-Geraet / EKG-Streifen)
            local view = ok and res and res.view or nil
            NUI.send('minigameValue', view and result == true and { bz = view.vitals and view.vitals.bz, ekg = view.ekg, monitor = view.monitor, name = view.name } or false)
        end
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
    local an = view.anamnesis or { sampler = {}, opqrst = {} }
    local sampler = {}
    for _, q in ipairs(SAMPLER) do
        sampler[#sampler + 1] = { title = q[2], description = an.sampler[q[1]] or 'noch nicht erfragt', icon = 'clipboard-question',
            onSelect = function() MedClient.act('sampler', q[1], 'ec_med_sampler') end }
    end
    register('ec_med_sampler', 'SAMPLER-Anamnese', sampler, 'ec_med_talk')
    local opqrst = {}
    for _, q in ipairs(OPQRST) do
        opqrst[#opqrst + 1] = { title = q[2], description = an.opqrst[q[1]] or 'noch nicht erfragt', icon = 'clipboard-question',
            onSelect = function() MedClient.act('opqrst', q[1], 'ec_med_opqrst') end }
    end
    register('ec_med_opqrst', 'OPQRST-Schmerzanamnese', opqrst, 'ec_med_talk')
    talk[#talk + 1] = { title = 'SAMPLER-Anamnese', icon = 'clipboard-list', menu = 'ec_med_sampler' }
    talk[#talk + 1] = { title = 'OPQRST (Schmerz)', icon = 'clipboard-list', menu = 'ec_med_opqrst' }
    register('ec_med_talk', 'Gespraech und Anamnese', talk, main)

    -- Diagnostik
    local diag = {}
    local extra = view.findingsExtra or {}
    for _, m in ipairs(MEASURES) do
        local desc = valueText(v, m[1])
        if m[1] == 'ekg' or m[1] == 'ekg12' then
            desc = view.ekg and view.ekg.leads >= (m[1] == 'ekg12' and 12 or 4) and view.ekg.label or 'nicht angelegt (Minispiel)'
        elseif m[1] == 'lung' or m[1] == 'recap' or m[1] == 'skin' then
            local x = extra[m[1]]
            desc = x and (m[1] == 'recap' and ('%.1f s'):format(x) or x) or 'noch nicht erhoben'
        elseif m[1] == 'bz' and v.bz == nil then
            desc = 'noch nicht gemessen (Minispiel)'
        end
        diag[#diag + 1] = { title = m[2], description = desc, icon = m[3],
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
    -- genau die Medikamente aus dem Materialschrank (config_material.lua), in Schrankreihenfolge
    local groups, order = {}, {}
    for _, d in ipairs(Material.Drugs) do
        local m = d.med and EC.MedicationById[d.med]
        if m then
            if not groups[m.group] then groups[m.group] = {} order[#order + 1] = m.group end
            local needs = {}
            for _, n in ipairs(m.needs or {}) do needs[#needs + 1] = n:upper() end
            local route = ({ inhal = 'vernebelt', sl = 'sublingual', im = 'i.m.', ['in'] = 'nasal' })[m.route or 'iv']
            local desc = {}
            desc[#desc + 1] = Material.isDrawable(d) and ('aufziehen: %s %s/ml'):format(d.conc, d.unit) or ({ inhal = 'Fertiginhalat', spray = 'Spray', infusion = 'Infusion' })[d.form]
            if route then desc[#desc + 1] = route .. ', ohne Zugang' end
            if #needs > 0 then desc[#desc + 1] = 'erfordert: ' .. table.concat(needs, ', ') end
            groups[m.group][#groups[m.group] + 1] = { title = d.label, icon = Material.isDrawable(d) and 'syringe' or 'pump-medical',
                description = table.concat(desc, ' · '),
                onSelect = function() MedClient.act('med', m.id, 'ec_med_meds_' .. m.group) end }
        end
    end
    local meds = {}
    for _, g in ipairs(order) do
        register('ec_med_meds_' .. g, g, groups[g], 'ec_med_meds')
        meds[#meds + 1] = { title = g, icon = 'pills', menu = 'ec_med_meds_' .. g }
    end
    if MedClient.itemsActive() then
        local syr = {}
        for _, it in ipairs(MedClient.preparedSyringes()) do
            local md = it.metadata or {}
            syr[#syr + 1] = { title = md.label or 'Aufgezogene Spritze', description = md.description, icon = 'syringe',
                onSelect = function() MedClient.act('inject', it.slot, 'ec_med_syringes') end }
        end
        if #syr == 0 then syr[1] = { title = 'Keine aufgezogenen Spritzen im Inventar', icon = 'ban', disabled = true } end
        syr[#syr + 1] = { title = 'Medikament aufziehen (frei)', description = 'Spritze vorbereiten und einstecken', icon = 'prescription-bottle-medical',
            onSelect = function() MedClient.prepareFree('ec_med_syringes') end }
        register('ec_med_syringes', 'Aufgezogene Spritzen', syr, 'ec_med_meds')
        table.insert(meds, 1, { title = ('Aufgezogene Spritzen (%d)'):format(#MedClient.preparedSyringes()), description = 'Injizieren oder neue Spritze aufziehen',
            icon = 'syringe', menu = 'ec_med_syringes' })
    end
    register('ec_med_meds', view.canula and 'Medikamente' or 'Medikamente (kein Zugang!)', meds, main)

    -- Massnahmen (mit Minispielen)
    local pgroups, porder = {}, {}
    for _, pr in ipairs(Medical.Procedures) do
        if not pgroups[pr.group] then pgroups[pr.group] = {} porder[#porder + 1] = pr.group end
        local desc = pr.game and 'Minispiel' or nil
        if pr.id == 'iv' or pr.id == 'io' then desc = view.canula and ('Zugang liegt (' .. tostring(view.access) .. ')') or desc end
        if (pr.id == 'bvm' or pr.id == 'tubus') and view.airway then desc = 'Atemweg gesichert (' .. view.airway .. ')' end
        pgroups[pr.group][#pgroups[pr.group] + 1] = { title = pr.label, description = desc, icon = pr.icon or 'kit-medical',
            onSelect = function() MedClient.act('proc', pr.id, 'ec_med_proc_' .. pr.group) end }
    end
    local procs = {}
    for _, g in ipairs(porder) do
        register('ec_med_proc_' .. g, g, pgroups[g], 'ec_med_proc')
        procs[#procs + 1] = { title = g, icon = 'kit-medical', menu = 'ec_med_proc_' .. g }
    end
    register('ec_med_proc', 'Massnahmen', procs, main)

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
    if view.arrest then vitalsLine = 'KREISLAUFSTILLSTAND - Reanimation!' end
    register(main, ('%s - %s'):format(view.name, EC.PatientStatus[view.status] or view.status), {
        { title = 'Zustand', description = vitalsLine, icon = view.complete and 'circle-check' or 'stethoscope', disabled = true },
        { title = 'Gespraech', icon = 'comment-medical', menu = 'ec_med_talk' },
        { title = 'Diagnostik', icon = 'stethoscope', menu = 'ec_med_diag' },
        { title = 'Massnahmen', description = 'Zugang, Atemweg, Reanimation, Thoraxentlastung ...', icon = 'kit-medical', menu = 'ec_med_proc' },
        { title = 'Sauerstoff', description = ('%d l/min'):format(view.o2 or 0), icon = 'lungs', menu = 'ec_med_o2' },
        { title = MedClient.monitorFor and 'Monitor ausblenden' or 'Monitor einblenden', icon = 'desktop',
            description = 'Vitalwerte und EKG-Kurve am Bildschirmrand',
            onSelect = function()
                if MedClient.monitorFor then MedClient.stopMonitor() else MedClient.startMonitor(MedClient.current.incident, MedClient.current.patient) end
                MedClient.open(MedClient.current.incident, MedClient.current.patient)
            end },
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
    MedClient.current.view = view
    buildMenus(view)
    lib.showContext(menuId or 'ec_med_main')
end

----------------------------------------------------------------------------
-- Monitor (Vitalwerte + EKG-Kurve) solange man beim Patienten ist
----------------------------------------------------------------------------
function MedClient.stopMonitor()
    MedClient.monitorFor = nil
    NUI.send('monitor', nil)
end

function MedClient.startMonitor(incidentId, patientId)
    MedClient.monitorFor = { incident = incidentId, patient = patientId }
    local token = {}
    MedClient.monitorToken = token
    CreateThread(function()
        while MedClient.monitorFor and MedClient.monitorToken == token do
            local cur = MedClient.monitorFor
            local pos = patientPos(cur.incident, cur.patient)
            if not pos or #(GetEntityCoords(PlayerPedId()) - pos) > 12.0 then
                MedClient.stopMonitor()
                break
            end
            local ok, view = Request('medView', { incidentId = cur.incident, patientId = cur.patient })
            if ok and MedClient.monitorToken == token then
                NUI.send('monitor', { name = view.name, monitor = view.monitor or {}, ekg = view.ekg, arrest = view.arrest, rosc = view.rosc })
            end
            Wait(2000)
        end
    end)
end
