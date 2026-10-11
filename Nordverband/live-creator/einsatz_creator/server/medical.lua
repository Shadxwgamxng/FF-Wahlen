--[[
    Medizinische Behandlung (serverseitig)

    Uebernommen aus nv_medicDispatches (Logik und Werte), aber:
      - alle Werte liegen auf dem Server (der Client sieht nur gemessene Werte)
      - jede Massnahme wird geprueft (Rolle, Abstand, Zugang, vorherige Messung, Abklingzeit)
      - mehrere Patienten pro Einsatz, beliebige Einsaetze gleichzeitig

    Zustand je Patient: incident.rescue.patients[id].med
]]

local U = EC.Utils

Med = {}

local function rnd(range)
    if type(range) ~= 'table' then return range end
    local a, b = range[1], range[2]
    if a == b then return a end
    if math.floor(a) == a and math.floor(b) == b then return math.random(a, b) end
    return U.round(a + math.random() * (b - a), 1)
end

local function pick(list)
    if type(list) ~= 'table' or #list == 0 then return nil end
    return list[math.random(#list)]
end

local function fill(text, vars)
    return (tostring(text or ''):gsub('{(%w+)}', function(k)
        local v = vars[k]
        return v ~= nil and tostring(v) or ''
    end))
end

-- Undeutliche Sprache: einzelne Buchstaben verschlucken
local function garble(text)
    local out = {}
    for ch in text:gmatch('[%z\1-\127\194-\244][\128-\191]*') do
        if ch:match('%a') and math.random(100) <= 30 then out[#out + 1] = '.' else out[#out + 1] = ch end
    end
    return table.concat(out)
end

local function isDay()
    local h = tonumber(os.date('%H'))
    local s = Config.Random
    return h >= s.dayStart and h < s.dayEnd
end
Med.isDay = isDay

----------------------------------------------------------------------------
-- Vorbereitung beim Ausloesen: Geschlecht, Name, Zufallsmodell, Variante
----------------------------------------------------------------------------
function Med.prepareScenario(sc)
    for _, el in ipairs(sc.elements) do
        if el.kind == 'ped' and el.props.isPatient then
            local pt = el.props.patient
            local gender = pt.gender
            if gender == 'auto' then gender = math.random(2) == 1 and 'm' or 'w' end
            pt.gender = gender
            if pt.name == '' then
                local first = pick(gender == 'm' and Names.male or Names.female) or 'Max'
                pt.firstName = first
                pt.lastName = pick(Names.last) or 'Mustermann'
                pt.name = first .. ' ' .. pt.lastName
            else
                local first, last = pt.name:match('^(%S+)%s+(.+)$')
                pt.firstName = first or pt.name
                pt.lastName = last or ''
            end
            if el.props.randomModel then
                local model = pick(gender == 'm' and PatientModels.male or PatientModels.female)
                if model and Validate.modelAllowed(model) then el.model = model:lower() end
            end
            if pt.profile ~= 'none' then
                local prof = EC.ProfileById[pt.profile]
                if pt.variant == 0 or not prof.variants[pt.variant] then pt.variant = math.random(#prof.variants) end
            end
        end
    end
end

-- Notruftext fuer die Leitstelle aus dem ersten Patienten mit Meldebild
function Med.callText(sc)
    for _, el in ipairs(sc.elements) do
        if el.kind == 'ped' and el.props.isPatient and el.props.patient.profile ~= 'none' then
            local pt = el.props.patient
            local prof = EC.ProfileById[pt.profile]
            local texts = prof.callTexts and (isDay() and prof.callTexts.day or prof.callTexts.night) or nil
            local text = pick(texts)
            if text then
                return fill(text, { anrede = pt.gender == 'm' and 'Herr' or 'Frau', vorname = pt.firstName, nachname = pt.lastName })
            end
        end
    end
    return nil
end

----------------------------------------------------------------------------
-- Patientenzustand anlegen
----------------------------------------------------------------------------
local PAIN_BY_SEVERITY = { leicht = 2, mittel = 4, schwer = 7, kritisch = 8 }
local SPEECH_BY_CONSCIOUSNESS = { wach = 'wach', eingetruebt = 'undeutlich', bewusstlos = 'bewusstlos' }

local function randomBody(worsen)
    local body = {}
    for _, part in ipairs(Medical.BodyParts) do
        local v = math.random(0, 6)
        if v > part.maxLevel then v = 0 end
        if v > 0 then body[part.id] = v end
    end
    for _, id in ipairs(worsen or {}) do
        local part = EC.BodyPartById[id]
        if part then body[id] = math.min(part.maxLevel, (body[id] or 0) + 1) end
    end
    return body
end

function Med.initPatient(el)
    local pt = el.props.patient
    local D = Medical.Defaults
    local med = {
        speech = 'wach', pupils = D.pupils, measured = {}, o2 = 0, spo2Bonus = 0, canula = false,
        body = {}, treatedParts = {}, bodyChecked = false, stifneck = false, beckenschlinge = false,
        nameKnown = false, nextAt = 0, log = {},
        firstName = pt.firstName or pt.name, lastName = pt.lastName or '', gender = pt.gender,
        kasse = pick(Medical.Insurances),
    }
    local v
    if pt.profile ~= 'none' then
        local prof = EC.ProfileById[pt.profile]
        v = prof.variants[pt.variant] or prof.variants[1]
        med.profile, med.variant = prof.id, pt.variant
        med.speech = v.speech or 'wach'
        med.what = v.what
        med.painText = v.painText
    else
        med.speech = SPEECH_BY_CONSCIOUSNESS[pt.consciousness] or 'wach'
        med.what = pt.description ~= '' and pt.description or nil
        v = {}
    end
    local rr = v.rr or D.rr
    med.rrsys = rnd({ rr[1], rr[2] })
    med.rrdia = rnd({ rr[3], rr[4] })
    med.hf = rnd(v.hf or D.hf)
    med.spo2Base = rnd(v.spo2 or D.spo2)
    med.bz = rnd(v.bz or D.bz)
    med.temp = rnd(v.temp or D.temp)
    med.af = rnd(v.af or D.af)
    med.gcs = v.gcs or D.gcs
    med.pupils = v.pupils or D.pupils
    med.pain = v.pain or D.pain

    if pt.profile == 'none' then
        -- Werte aus dem Creator uebernehmen
        local vit = pt.vitals
        local sys, dia = tostring(vit.rr or ''):match('(%d+)%s*/%s*(%d+)')
        if sys then med.rrsys, med.rrdia = tonumber(sys), tonumber(dia) end
        med.hf, med.spo2Base, med.af, med.gcs = vit.puls, vit.spo2, vit.af, vit.gcs
        med.pain = PAIN_BY_SEVERITY[pt.severity] or 0
        if pt.consciousness == 'bewusstlos' then med.pain = 0 end
    end

    -- Verletzungen: aus dem Creator, sonst zufaellig (Sturz)
    if next(pt.body or {}) then
        med.body = U.deepcopy(pt.body)
    elseif v.randomInjuries then
        med.body = randomBody(v.worsenParts)
    end
    return med
end

----------------------------------------------------------------------------
-- Auswertung
----------------------------------------------------------------------------
local function spo2Of(med)
    if med.spo2Base <= 0 then return 0 end
    return math.min(100, math.floor(med.spo2Base + med.spo2Bonus + 0.8 * med.o2 + 0.5))
end

-- Offene Massnahmen (fuer Anzeige und "versorgt"-Status)
function Med.openMeasures(med)
    local open = {}
    for _, k in ipairs({ 'rr', 'hf', 'spo2' }) do
        if not med.measured[k] then open[#open + 1] = ('Messung %s'):format(k == 'rr' and 'Blutdruck' or k == 'hf' and 'Herzfrequenz' or 'SpO2') end
    end
    local hasInjury = next(med.body) ~= nil
    if hasInjury and not med.bodyChecked then open[#open + 1] = 'Bodycheck' end
    if med.bodyChecked then
        for _, part in ipairs(Medical.BodyParts) do
            local lvl = med.body[part.id]
            if lvl and not med.treatedParts[part.id] then
                if lvl == 1 then open[#open + 1] = 'Pflaster: ' .. part.label
                elseif lvl == 2 then open[#open + 1] = 'Verband: ' .. part.label
                elseif part.severe == 'schiene' then open[#open + 1] = 'Schiene: ' .. part.label end
            end
        end
        if med.body.kopf == 3 and not med.stifneck then open[#open + 1] = 'Stifneck (SHT)' end
        if med.body.becken == 3 and not med.beckenschlinge then open[#open + 1] = 'Beckenschlinge' end
    end
    return open
end

function Med.careComplete(med)
    if not Config.Medical.requireCompleteCare then
        return next(med.measured) ~= nil or med.bodyChecked
    end
    return #Med.openMeasures(med) == 0
end

-- Sicht der Einsatzkraft (nur Bekanntes)
function Med.view(p)
    local med = p.med
    local m = med.measured
    local findings = {}
    if med.bodyChecked then
        for _, part in ipairs(Medical.BodyParts) do
            local lvl = med.body[part.id]
            if lvl then
                findings[#findings + 1] = {
                    part = part.id, label = part.label, level = lvl,
                    text = lvl == 1 and 'kleine Wunde' or lvl == 2 and 'grosse Wunde' or ('schwer, ' .. (part.severeText or 'verletzt')),
                    treated = med.treatedParts[part.id] == true
                        or (part.severe == 'stifneck' and lvl == 3 and med.stifneck)
                        or (part.severe == 'beckenschlinge' and lvl == 3 and med.beckenschlinge),
                }
            end
        end
    end
    return {
        name = med.nameKnown and p.name or 'Unbekannte Person',
        status = Rescue.patientStatus(p),
        vitals = {
            rr = m.rr and ('%d/%d'):format(med.rrsys, med.rrdia) or nil,
            hf = m.hf and med.hf or nil,
            spo2 = m.spo2 and m.spo2 or nil,
            bz = m.bz and med.bz or nil,
            temp = m.temp and med.temp or nil,
            af = m.af and med.af or nil,
            gcs = m.gcs and med.gcs or nil,
            pupils = m.pupils and med.pupils or nil,
            pain = m.pain and med.pain or nil,
        },
        o2 = med.o2, canula = med.canula, stifneck = med.stifneck, beckenschlinge = med.beckenschlinge,
        bodyChecked = med.bodyChecked, findings = findings, open = Med.openMeasures(med),
        complete = Med.careComplete(med), onStretcher = p.stretcherNet ~= nil,
        speechless = med.speech == 'bewusstlos', trapped = p.trapped,
    }
end

----------------------------------------------------------------------------
-- Massnahmen
----------------------------------------------------------------------------
local function say(lines, who, text) lines[#lines + 1] = { who = who, text = text } end

local function patientSays(med, lines, text)
    local sp = Medical.Speech[med.speech] or Medical.Speech.wach
    if sp.silent then
        say(lines, 'info', 'Der Patient reagiert nicht.')
        return
    end
    if sp.garble then text = garble(text) end
    say(lines, 'pt', sp.prefix .. ': ' .. text)
end

local function speechText(med, key)
    local sp = Medical.Speech[med.speech] or Medical.Speech.wach
    return fill(sp[key], { vorname = med.firstName, nachname = med.lastName, kasse = med.kasse })
end

local MEASURE_TEXT = {
    rr = { 'Ich messe jetzt mal Ihren Blutdruck.', 'Blutdruck wird gemessen ...' },
    hf = { 'Ich schaue jetzt mal nach Ihrem Puls.', 'Herzfrequenz wird gemessen ...' },
    spo2 = { 'Ich schaue jetzt mal nach Ihrer Sauerstoffsaettigung.', 'SpO2 wird gemessen ...' },
    bz = { 'Ich messe jetzt Ihren Blutzucker, das piekst kurz.', 'BZ wird gemessen ...' },
    temp = { 'Ich messe jetzt Ihre Temperatur.', 'Temperatur wird gemessen ...' },
    pupils = { 'Ich leuchte mal in beide Augen.', 'Pupillen werden ueberprueft ...' },
    gcs = { 'Ich pruefe jetzt Ihre Bewusstseinslage.', 'GCS wird erhoben ...' },
    af = { 'Ich zaehle mal Ihre Atemzuege.', 'Atemfrequenz wird gezaehlt ...' },
}

local function measureResult(med, k)
    if k == 'rr' then return ('Der Blutdruck ist %d / %d mmHg.'):format(med.rrsys, med.rrdia) end
    if k == 'hf' then return ('Die Herzfrequenz liegt bei %d /min.'):format(med.hf) end
    if k == 'spo2' then
        local v = spo2Of(med)
        med.measured.spo2 = v
        return ('Die SpO2 liegt bei %d %%.'):format(v)
    end
    if k == 'bz' then return ('Der BZ liegt bei %.1f mmol/l (%d mg/dl).'):format(med.bz, math.floor(med.bz * 18.02 + 0.5)) end
    if k == 'temp' then return ('Die Temperatur liegt bei %.1f Grad Celsius.'):format(med.temp) end
    if k == 'pupils' then return ('Die Pupillen sind %s.'):format(med.pupils) end
    if k == 'gcs' then return ('GCS %d.'):format(med.gcs) end
    if k == 'af' then return ('Die Atemfrequenz liegt bei %d /min.'):format(med.af) end
end

local function clampVitals(med)
    med.rrsys = U.clamp(math.floor(med.rrsys + 0.5), 0, 280)
    med.rrdia = U.clamp(math.floor(med.rrdia + 0.5), 0, 180)
    if med.rrsys > 0 and med.rrdia >= med.rrsys - 5 then med.rrdia = math.max(0, med.rrsys - 10) end
    med.hf = U.clamp(math.floor(med.hf + 0.5), 0, 250)
    med.bz = U.round(U.clamp(med.bz, 0.5, 40.0), 1)
    med.temp = U.round(U.clamp(med.temp, 30.0, 43.0), 1)
    med.pain = U.clamp(med.pain, 0, 10)
    med.spo2Bonus = U.clamp(med.spo2Bonus, 0, 100)
end

local SEVERE_ITEM = { schiene = 'schiene', stifneck = 'stifneck', beckenschlinge = 'beckenschlinge' }

--[[
    Massnahme ausfuehren. Rueckgabe: true, { lines, view } | false, Fehler
    action: talk_hello | talk_what | talk_pain | talk_name | talk_insurance
            measure (arg = rr|hf|spo2|bz|temp|pupils|gcs|af)
            oxygen (arg = Liter, 0 = aus) | canula | med (arg = Medikament)
            bodycheck | pflaster | verband | schiene | stifneck | beckenschlinge
            transport_ask | no_transport | stretcher (arg = Netz-ID der Trage)
]]
function Med.action(src, incident, p, action, arg)
    local med = p.med
    if not med then return false, 'Dieser Patient hat keine detaillierte Behandlung' end
    local now = GetGameTimer()
    if now < med.nextAt then return false, 'Bitte einen Moment warten' end
    med.nextAt = now + Config.Medical.actionCooldownMs

    local lines = {}
    local changed = false

    if action == 'talk_hello' then
        say(lines, 'rd', 'Rettungsdienst: Der Rettungsdienst, koennen Sie mich hoeren?')
        patientSays(med, lines, speechText(med, 'hello'))
    elseif action == 'talk_what' then
        say(lines, 'rd', 'Rettungsdienst: Was ist passiert?')
        patientSays(med, lines, med.what or 'Mir geht es einfach nicht gut.')
    elseif action == 'talk_pain' then
        say(lines, 'rd', 'Rettungsdienst: Haben Sie aktuell Schmerzen? Wenn ja, wie stark von 1 bis 10?')
        if med.pain > 0 then
            patientSays(med, lines, fill(med.painText or 'Die Schmerzen liegen so bei einer {pain}.', { pain = math.floor(med.pain + 0.5) }))
        else
            patientSays(med, lines, speechText(med, 'noPain'))
        end
        if med.speech ~= 'bewusstlos' then med.measured.pain = true end
    elseif action == 'talk_name' then
        say(lines, 'rd', 'Rettungsdienst: Wie ist Ihr Name?')
        patientSays(med, lines, speechText(med, 'name'))
        if med.speech ~= 'bewusstlos' then med.nameKnown = true end
    elseif action == 'talk_insurance' then
        say(lines, 'rd', 'Rettungsdienst: Bei welcher Krankenkasse sind Sie?')
        patientSays(med, lines, speechText(med, 'insurance'))
    elseif action == 'measure' then
        local t = MEASURE_TEXT[arg]
        if not t then return false, 'Unbekannte Messung' end
        say(lines, 'rd', 'Rettungsdienst: ' .. t[1])
        say(lines, 'info', t[2])
        med.measured[arg] = med.measured[arg] or true
        say(lines, 'info', measureResult(med, arg))
    elseif action == 'oxygen' then
        local l = math.floor(U.num(arg, 0, 0, 15))
        if l ~= 0 and not U.inList(Medical.Oxygen, l) then return false, 'Ungueltige Menge' end
        med.o2 = l
        if l == 0 then
            say(lines, 'rd', 'Rettungsdienst: Ich nehme Ihnen den Sauerstoff wieder ab.')
        else
            say(lines, 'rd', ('Rettungsdienst: Wir geben Ihnen jetzt %d Liter Sauerstoff.'):format(l))
        end
        say(lines, 'info', 'Neue Messung zeigt die Wirkung.')
    elseif action == 'canula' then
        say(lines, 'rd', 'Rettungsdienst: Ich lege Ihnen jetzt einen Zugang.')
        if med.canula then
            patientSays(med, lines, 'Ich habe doch schon einen!')
        else
            med.canula = true
            say(lines, 'info', 'Venenzugang (Flexuele) wurde gelegt.')
        end
    elseif action == 'med' then
        local m = EC.MedicationById[arg]
        if not m then return false, 'Unbekanntes Medikament' end
        say(lines, 'rd', ('Rettungsdienst: Sie bekommen von uns jetzt %s.'):format(m.label))
        if not med.canula then
            patientSays(med, lines, 'Das geht doch ohne Zugang nicht!')
            say(lines, 'info', 'Zuerst einen Zugang legen.')
        else
            for _, need in ipairs(m.needs or {}) do
                if not med.measured[need] then
                    say(lines, 'info', 'Vor der Gabe muessen erst die passenden Vitalwerte gemessen werden.')
                    return true, { lines = lines, view = Med.view(p) }
                end
            end
            for k, v in pairs(m.effect or {}) do med[k] = (med[k] or 0) + v end
            for k, range in pairs(m.effectRange or {}) do med[k] = (med[k] or 0) + rnd(range) end
            clampVitals(med)
            say(lines, 'info', ('%s wurde verabreicht.'):format(m.label))
            med.log[#med.log + 1] = { at = os.time(), text = m.label }
            changed = true
        end
    elseif action == 'bodycheck' then
        say(lines, 'rd', 'Rettungsdienst: Ich taste Sie jetzt einmal auf Verletzungen ab.')
        say(lines, 'info', 'Patient wird abgetastet ...')
        med.bodyChecked = true
        local any = false
        for _, part in ipairs(Medical.BodyParts) do
            local lvl = med.body[part.id]
            if lvl then
                any = true
                local txt = lvl == 1 and 'eine kleine Wunde' or lvl == 2 and 'eine grosse Wunde'
                    or ('eine schwere Verletzung (%s)'):format(part.severeText or 'verletzt')
                say(lines, 'info', ('%s: %s.'):format(part.label, txt))
            end
        end
        if not any then say(lines, 'info', 'Keine aeusseren Verletzungen festgestellt.') end
        changed = true
    elseif action == 'pflaster' or action == 'verband' or action == 'schiene' then
        local level = action == 'pflaster' and 1 or action == 'verband' and 2 or 3
        local labels = { pflaster = 'Ich klebe ein Pflaster auf die Wunde.', verband = 'Ich verbinde jetzt die Wunde.', schiene = 'Ich lege Ihnen eine Schiene an.' }
        say(lines, 'rd', 'Rettungsdienst: ' .. labels[action])
        if not med.bodyChecked then
            say(lines, 'info', 'Zuerst einen Bodycheck durchfuehren.')
        else
            local target
            for _, part in ipairs(Medical.BodyParts) do
                if med.body[part.id] == level and not med.treatedParts[part.id]
                    and (level < 3 or part.severe == 'schiene') then
                    target = part
                    break
                end
            end
            if not target then
                patientSays(med, lines, level == 3 and 'Ich kann alles frei bewegen!' or 'Ich habe da keine Wunde!')
            else
                med.treatedParts[target.id] = true
                say(lines, 'info', ('%s versorgt.'):format(target.label))
                changed = true
            end
        end
    elseif action == 'stifneck' or action == 'beckenschlinge' then
        say(lines, 'rd', action == 'stifneck' and 'Rettungsdienst: Ich lege Ihnen eine Halskrause (Stifneck) um.'
            or 'Rettungsdienst: Ich lege Ihnen eine Beckenschlinge an.')
        if med[action] then
            patientSays(med, lines, 'Ich habe doch schon eine um!')
        else
            med[action] = true
            say(lines, 'info', (action == 'stifneck' and 'Stifneck' or 'Beckenschlinge') .. ' wurde angelegt.')
            changed = true
        end
    elseif action == 'transport_ask' then
        say(lines, 'rd', 'Rettungsdienst: Wir wuerden Sie gerne mit ins Krankenhaus nehmen. Ist das in Ordnung?')
        patientSays(med, lines, speechText(med, 'transportYes'))
    elseif action == 'no_transport' then
        if p.trapped or p.vehicleNet or p.stretcherNet then return false, 'Nicht moeglich' end
        say(lines, 'rd', 'Rettungsdienst: Wir sehen keinen Grund, Sie zu transportieren.')
        patientSays(med, lines, speechText(med, 'noTransport'))
        local rec = incident.entities and incident.entities[p.id]
        if rec then
            SetTimeout(4000, function()
                if Spawner.delete(rec, incident.id) then incident.entities[p.id] = nil end
            end)
        end
        p.released = true
        changed = true
    elseif action == 'stretcher' then
        local net = tonumber(arg)
        local ent = net and NetworkGetEntityFromNetworkId(net)
        if not ent or ent == 0 or not DoesEntityExist(ent) then return false, 'Keine Trage gefunden' end
        local ok = false
        for _, m in ipairs(Config.Rescue.stretcherModels) do
            if GetEntityModel(ent) == GetHashKey(m) then ok = true break end
        end
        if not ok then return false, 'Das ist keine Trage' end
        local rec = incident.entities and incident.entities[p.id]
        if not rec or not DoesEntityExist(rec.entity) then return false, 'Patient nicht gefunden' end
        if #(GetEntityCoords(ent) - GetEntityCoords(rec.entity)) > Config.Rescue.stretcherDistance + 2.0 then
            return false, 'Die Trage steht zu weit entfernt'
        end
        if p.trapped then return false, 'Patient ist noch eingeklemmt' end
        say(lines, 'rd', 'Rettungsdienst: Bitte legen Sie sich auf die Trage, wir fahren mit Ihnen los.')
        patientSays(med, lines, 'Ja, mache ich.')
        p.stretcherNet = net
        Spawner.updateState(rec, incident.id, { st = 'stretcher', stretcher = net })
        changed = true
    else
        return false, 'Unbekannte Massnahme'
    end

    if action ~= 'no_transport' then p.assessed = true end
    local wasTreated = p.treated
    p.treated = Med.careComplete(med)
    if changed or wasTreated ~= p.treated then
        local actor = Perm.actor(src)
        Incidents.onRescueChanged(incident, {
            target = 'patient', id = p.id, action = 'med:' .. action, by = actor.name, status = Rescue.patientStatus(p),
        })
    else
        Incidents.syncPublic(incident)
    end
    return true, { lines = lines, view = Med.view(p) }
end
