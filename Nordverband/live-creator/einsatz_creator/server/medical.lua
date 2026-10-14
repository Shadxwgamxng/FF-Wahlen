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
        -- erweiterte Versorgung
        done = {}, given = {}, asked = { sampler = {}, opqrst = {} }, ekgLeads = 0, access = nil, airway = nil,
        cprCount = 0, shocks = 0, relieved = false,
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
    med.ekgBase = v.ekg or D.ekg
    med.arrest = v.arrest == true
    med.tension = v.tension
    med.lung = v.lung or D.lung
    med.recap = rnd(v.recap or D.recap)
    med.skin = v.skin or D.skin
    med.required = U.deepcopy(v.required or {})
    -- Anamnese: feste Antworten der Variante, sonst zufaellig
    local sv = v.sampler or {}
    med.sampler = {}
    for _, k in ipairs({ 'a', 'm', 'p', 'l', 'r' }) do med.sampler[k] = sv[k] or pick(Medical.Sampler[k]) end
    med.sampler.s = sv.s or med.what
    med.sampler.e = sv.e or med.what
    med.opqrst = {}
    for k, txt in pairs(Medical.Opqrst) do med.opqrst[k] = (v.opqrst and v.opqrst[k]) or txt end

    if pt.profile == 'none' then
        -- Werte aus dem Creator uebernehmen
        local vit = pt.vitals
        local sys, dia = tostring(vit.rr or ''):match('(%d+)%s*/%s*(%d+)')
        if sys then med.rrsys, med.rrdia = tonumber(sys), tonumber(dia) end
        med.hf, med.spo2Base, med.af, med.gcs = vit.puls, vit.spo2, vit.af, vit.gcs
        med.pain = PAIN_BY_SEVERITY[pt.severity] or 0
        if pt.consciousness == 'bewusstlos' then med.pain = 0 end
        if (tonumber(med.hf) or 0) <= 0 then
            med.arrest, med.ekgBase, med.af = true, 'vf', 0
            med.required = { 'ekg', 'cpr', 'defi', 'zugang', 'suprarenin', 'airway' }
        end
    end

    -- Verletzungen: aus dem Creator, sonst zufaellig (Sturz)
    if next(pt.body or {}) then
        med.body = U.deepcopy(pt.body)
    elseif v.randomInjuries then
        med.body = randomBody(v.worsenParts)
    elseif v.body then
        med.body = U.deepcopy(v.body)
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

-- Aktueller EKG-Rhythmus (Sinus passt sich der Herzfrequenz an; ST-Hebungen nur im 12-Kanal sichtbar)
local function rhythmOf(med)
    local base = med.ekgBase or 'sinus'
    if med.arrest then return base end
    if base == 'stemi' and med.ekgLeads < 12 then base = 'sinus' end
    if base == 'sinus' then
        if med.hf > 100 then return 'sinustachy' end
        if med.hf < 55 then return 'sinusbrady' end
    end
    return base
end
Med.rhythmOf = rhythmOf

-- Ist eine Pflichtmassnahme erledigt?
local function requiredDone(med, key)
    if med.done[key] or med.given[key] then return true end
    if med.measured[key] then return true end
    if key == 'zugang' then return med.canula == true end
    if key == 'airway' then return med.airway ~= nil end
    if key == 'ekg' then return med.ekgLeads >= 4 end
    if key == 'ekg12' then return med.ekgLeads >= 12 end
    if key == 'defi' then return med.shocks > 0 or not med.arrest end
    if key == 'cpr' then return med.cprCount > 0 or (med.done.rosc == true) end
    return false
end

local function requiredLabel(key)
    if Medical.RequiredLabels[key] then return Medical.RequiredLabels[key] end
    local m = EC.MedicationById[key]
    if m then return 'Medikament: ' .. m.label end
    local pr = EC.ProcedureById[key]
    return pr and pr.label or key
end

-- Offene Massnahmen (fuer Anzeige und "versorgt"-Status)
function Med.openMeasures(med)
    local open = {}
    for _, key in ipairs(med.required or {}) do
        if not requiredDone(med, key) then open[#open + 1] = requiredLabel(key) end
    end
    for _, k in ipairs({ 'rr', 'hf', 'spo2' }) do
        if not med.measured[k] and not (med.arrest and k ~= 'spo2') then open[#open + 1] = ('Messung %s'):format(k == 'rr' and 'Blutdruck' or k == 'hf' and 'Herzfrequenz' or 'SpO2') end
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
        if med.body.kopf == 3 and not med.stifneck then open[#open + 1] = 'Zervikalstuetze (SHT)' end
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
        ekg = med.ekgLeads > 0 and {
            leads = med.ekgLeads, rhythm = rhythmOf(med), label = Medical.Rhythms[rhythmOf(med)].label,
            wave = Medical.Rhythms[rhythmOf(med)].wave, hf = med.arrest and 0 or med.hf,
        } or nil,
        monitor = (med.ekgLeads > 0 or m.spo2) and {
            hf = med.ekgLeads > 0 and (med.arrest and 0 or med.hf) or nil,
            spo2 = m.spo2 and (med.arrest and 0 or spo2Of(med)) or nil,
            rr = m.rr and ('%d/%d'):format(med.rrsys, med.rrdia) or nil,
            af = m.af and med.af or nil,
        } or nil,
        findingsExtra = {
            lung = m.lung and med.lung or nil, recap = m.recap and med.recap or nil, skin = m.skin and med.skin or nil,
        },
        anamnesis = (function()
            local out = { sampler = {}, opqrst = {} }
            for k in pairs(med.asked.sampler) do out.sampler[k] = med.sampler[k] end
            for k in pairs(med.asked.opqrst) do out.opqrst[k] = k == 's' and ('%d/10'):format(math.floor(med.pain + 0.5)) or med.opqrst[k] end
            return out
        end)(),
        access = med.access, airway = med.airway, arrest = med.arrest, rosc = med.done.rosc == true,
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
    ekg = { 'Ich klebe Ihnen jetzt die EKG-Elektroden auf.', 'EKG (4-Kanal) wird abgeleitet ...' },
    ekg12 = { 'Ich schreibe jetzt ein 12-Kanal-EKG, bitte ganz ruhig liegen.', '12-Kanal-EKG wird geschrieben ...' },
    lung = { 'Ich hoere jetzt Ihre Lunge ab, bitte tief ein- und ausatmen.', 'Auskultation ...' },
    recap = { 'Ich druecke kurz auf Ihren Fingernagel.', 'Rekapillarisierungszeit wird geprueft ...' },
    skin = { 'Ich schaue mir mal Ihre Haut an.', 'Hautkolorit und -temperatur werden geprueft ...' },
}
-- Messungen mit Minispiel (Ergebnis kommt vom Client)
local MEASURE_GAME = { bz = true, ekg = true, ekg12 = true }

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
    if k == 'ekg' or k == 'ekg12' then
        local r = Medical.Rhythms[rhythmOf(med)]
        local txt = ('EKG: %s'):format(r.label)
        if not med.arrest then txt = txt .. (', Frequenz %d /min'):format(med.hf) end
        if k == 'ekg' and (med.ekgBase == 'stemi') then txt = txt .. '. ST-Strecke im 4-Kanal nicht sicher beurteilbar' end
        return txt .. '.'
    end
    if k == 'lung' then return ('Auskultation: %s.'):format(med.lung) end
    if k == 'recap' then return ('Rekapillarisierungszeit %.1f s%s.'):format(med.recap, med.recap > 2.0 and ' (verlaengert)' or '') end
    if k == 'skin' then return ('Die Haut ist %s.'):format(med.skin) end
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
    med.af = U.clamp(math.floor((med.af or 0) + 0.5), 0, 60)
    med.gcs = U.clamp(math.floor((med.gcs or 15) + 0.5), 3, 15)
end

-- Wiederbelebung erfolgreich? (alle Schritte der Reanimation erledigt)
local function checkRosc(med, lines)
    if not med.arrest then return false end
    local shockOk = not Medical.Rhythms[med.ekgBase].shockable or med.shocks > 0
    if med.cprCount >= 2 and med.canula and med.given.suprarenin and med.airway and med.ekgLeads > 0 and shockOk then
        med.arrest = false
        med.ekgBase = 'sinus'
        med.hf = math.random(95, 125)
        med.rrsys, med.rrdia = math.random(90, 115), math.random(50, 70)
        med.spo2Base = math.random(86, 93)
        med.af = 0
        med.gcs = 3
        med.speech = 'bewusstlos'
        med.lung = 'vesikulaeres Atemgeraeusch beidseits unter Beatmung'
        med.skin = 'blass, langsam waermer werdend'
        med.recap = 2.5
        med.done.rosc = true
        say(lines, 'info', 'ROSC! Ein Puls ist wieder tastbar, der Kreislauf ist zurueck.')
        return true
    end
    return false
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
function Med.action(src, incident, p, action, arg, result)
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
    elseif action == 'sampler' or action == 'opqrst' then
        local key = tostring(arg or '')
        local Q = action == 'sampler'
            and { s = 'Was fuer Beschwerden haben Sie genau?', a = 'Haben Sie Allergien?', m = 'Nehmen Sie regelmaessig Medikamente?',
                p = 'Haben Sie Vorerkrankungen?', l = 'Wann haben Sie zuletzt etwas gegessen oder getrunken?',
                e = 'Was haben Sie gemacht, als es angefangen hat?', r = 'Rauchen Sie oder gibt es sonst Risikofaktoren?' }
            or { o = 'Wann und wie hat der Schmerz angefangen?', p = 'Wird es durch irgendetwas besser oder schlimmer?',
                q = 'Wie fuehlt sich der Schmerz an?', r = 'Strahlt der Schmerz irgendwohin aus?',
                s = 'Wie stark ist der Schmerz von 1 bis 10?', t = 'Seit wann haben Sie die Schmerzen genau?' }
        if not Q[key] then return false, 'Unbekannte Frage' end
        say(lines, 'rd', 'Rettungsdienst: ' .. Q[key])
        local answer
        if action == 'sampler' then
            answer = med.sampler[key] or 'Das weiss ich nicht.'
        elseif key == 's' then
            answer = med.pain > 0 and ('So eine %d.'):format(math.floor(med.pain + 0.5)) or 'Ich habe keine Schmerzen.'
        else
            answer = med.pain > 0 and med.opqrst[key] or 'Ich habe doch gar keine Schmerzen.'
        end
        patientSays(med, lines, answer)
        if med.speech ~= 'bewusstlos' then
            med.asked[action][key] = true
            local need = action == 'sampler' and 7 or 6
            if U.tableCount(med.asked[action]) >= need then med.done[action] = true end
        end
    elseif action == 'measure' then
        local t = MEASURE_TEXT[arg]
        if not t then return false, 'Unbekannte Messung' end
        if (arg == 'ekg12') and med.ekgLeads < 4 then return false, 'Zuerst das 4-Kanal-EKG anlegen' end
        say(lines, 'rd', 'Rettungsdienst: ' .. t[1])
        if MEASURE_GAME[arg] and result ~= true then
            if result == nil then return false, 'Diese Messung wird ueber das Minispiel durchgefuehrt' end
            say(lines, 'info', arg == 'bz' and 'Fehlversuch - kein Blutstropfen auf dem Teststreifen. Nochmal versuchen.'
                or 'Elektroden falsch geklebt - die Ableitung ist nicht verwertbar. Nochmal versuchen.')
            return true, { lines = lines, view = Med.view(p) }
        end
        say(lines, 'info', t[2])
        if arg == 'ekg' then med.ekgLeads = math.max(med.ekgLeads, 4) end
        if arg == 'ekg12' then med.ekgLeads = 12 end
        med.measured[arg] = med.measured[arg] or true
        if med.arrest and (arg == 'rr' or arg == 'hf') then
            say(lines, 'info', arg == 'rr' and 'Kein Blutdruck messbar.' or 'Kein Puls tastbar!')
        else
            say(lines, 'info', measureResult(med, arg))
        end
        changed = arg == 'ekg' or arg == 'ekg12'
    elseif action == 'proc' then
        local pr = EC.ProcedureById[arg]
        if not pr then return false, 'Unbekannte Massnahme' end
        if pr.game and result == nil then return false, 'Diese Massnahme wird ueber das Minispiel durchgefuehrt' end
        local ok = result == true or (type(result) == 'string' and result ~= '' and result ~= 'fail') or not pr.game
        local conscious = med.speech ~= 'bewusstlos' and (med.gcs or 15) > 8
        if arg == 'iv' or arg == 'io' then
            say(lines, 'rd', arg == 'iv' and 'Rettungsdienst: Ich lege Ihnen jetzt einen Zugang, das piekst kurz.'
                or 'Rettungsdienst: Ich bohre jetzt einen intraossaeren Zugang am Schienbein.')
            if med.canula then
                say(lines, 'info', ('Es liegt bereits ein Zugang (%s).'):format(med.access or 'i.v.'))
            elseif not ok then
                say(lines, 'info', arg == 'iv' and 'Fehlpunktion - die Vene ist geplatzt. Neuer Versuch oder i.o.-Zugang.'
                    or 'Die Nadel sitzt nicht im Markraum. Nochmal ansetzen.')
            else
                med.canula, med.access = true, arg == 'iv' and 'i.v.' or 'i.o.'
                med.done.zugang = true
                say(lines, 'info', arg == 'iv' and 'Venenzugang liegt sicher, Infusion laeuft.' or 'Intraossaere Nadel an der proximalen Tibia liegt, Aspiration von Knochenmark moeglich.')
                changed = true
            end
        elseif arg == 'bvm' or arg == 'tubus' then
            say(lines, 'rd', arg == 'bvm' and 'Rettungsdienst: Ich beatme jetzt mit dem Beutel.' or 'Rettungsdienst: Ich lege jetzt einen Larynxtubus.')
            if conscious then
                patientSays(med, lines, 'Lassen Sie das! Ich atme doch!')
                say(lines, 'info', 'Patient hat Schutzreflexe - keine Atemwegssicherung noetig/moeglich.')
            elseif not ok then
                say(lines, 'info', 'Tubus liegt falsch - keine Beatmung moeglich. Neu einlegen.')
            else
                med.airway = arg
                med.spo2Bonus = med.spo2Bonus + (arg == 'tubus' and 12 or 8)
                med.done.airway = true
                say(lines, 'info', arg == 'bvm' and 'Beatmung ueber Beutel und Maske, Thorax hebt sich.' or 'Larynxtubus liegt, Beatmung seitengleich.')
                changed = true
                checkRosc(med, lines)
            end
        elseif arg == 'thorax' then
            say(lines, 'rd', 'Rettungsdienst: Ich entlaste jetzt den Brustkorb mit einer Nadel.')
            local side = type(result) == 'string' and result or nil
            if not ok then
                say(lines, 'info', 'Falsche Punktionsstelle gewaehlt - keine Entlastung. Landmarken nochmal pruefen.')
            elseif not med.tension then
                say(lines, 'info', 'Kein Luftaustritt - es lag kein Spannungspneumothorax vor.')
            elseif med.relieved then
                say(lines, 'info', 'Die Entlastung wurde bereits durchgefuehrt.')
            elseif side and side ~= med.tension then
                med.spo2Base = math.max(50, med.spo2Base - 5)
                say(lines, 'info', ('Falsche Seite! Auf der Seite %s ist kein Spannungspneu - Zustand verschlechtert sich.'):format(side))
                changed = true
            else
                med.relieved = true
                med.done.thorax = true
                med.spo2Base = math.min(100, med.spo2Base + 15)
                med.hf, med.af = med.hf - 25, med.af - 10
                med.rrsys, med.rrdia = med.rrsys + 30, med.rrdia + 15
                med.lung = ('nach Entlastung %s wieder Atemgeraeusch hoerbar (abgeschwaecht)'):format(med.tension)
                say(lines, 'info', 'Zischender Luftaustritt! Die Saettigung steigt, der Kreislauf stabilisiert sich.')
                changed = true
            end
        elseif arg == 'cpr' then
            say(lines, 'rd', 'Rettungsdienst: Herzdruckmassage! 30 Kompressionen, 2 Beatmungen.')
            if not med.arrest then
                say(lines, 'info', 'Der Patient hat einen Puls - keine Herzdruckmassage noetig!')
            else
                med.cprCount = med.cprCount + 1
                med.done.cpr = true
                say(lines, 'info', ('Zyklus %d Herzdruckmassage durchgefuehrt.'):format(med.cprCount))
                changed = true
                checkRosc(med, lines)
            end
        elseif arg == 'defi' then
            say(lines, 'rd', 'Rettungsdienst: Achtung, alle weg vom Patienten - Schock!')
            if med.ekgLeads < 4 then
                say(lines, 'info', 'Kein EKG/Pads angelegt - Rhythmusanalyse nicht moeglich.')
            elseif not med.arrest then
                say(lines, 'info', 'Patient hat einen Puls - kein Schock abgegeben.')
            elseif not Medical.Rhythms[med.ekgBase].shockable then
                say(lines, 'info', 'Kein schockbarer Rhythmus (Asystolie) - kein Schock abgegeben. Weiter mit Herzdruckmassage.')
            else
                med.shocks = med.shocks + 1
                med.done.defi = true
                say(lines, 'info', ('Schock %d mit 200 J abgegeben. Sofort weiter mit der Herzdruckmassage.'):format(med.shocks))
                changed = true
                checkRosc(med, lines)
            end
        elseif arg == 'waerme' then
            say(lines, 'rd', 'Rettungsdienst: Ich decke Sie mit einer Rettungsdecke zu.')
            if med.done.waerme then
                say(lines, 'info', 'Der Patient ist bereits zugedeckt.')
            else
                med.done.waerme = true
                med.temp = med.temp + 0.5
                say(lines, 'info', 'Waermeerhalt durchgefuehrt.')
                changed = true
            end
        elseif arg == 'lagerung' then
            say(lines, 'rd', 'Rettungsdienst: Ich lagere Sie jetzt mit erhoehtem Oberkoerper.')
            if not med.done.lagerung then
                med.done.lagerung = true
                if med.af > 20 then med.spo2Bonus = med.spo2Bonus + 2 end
                changed = true
            end
            say(lines, 'info', 'Oberkoerperhochlagerung.')
        end
        clampVitals(med)
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
            med.canula, med.access = true, 'i.v.'
            med.done.zugang = true
            say(lines, 'info', 'Venenzugang (Flexuele) wurde gelegt.')
        end
    elseif action == 'med' then
        local m = EC.MedicationById[arg]
        if not m then return false, 'Unbekanntes Medikament' end
        say(lines, 'rd', ('Rettungsdienst: Sie bekommen von uns jetzt %s.'):format(m.label))
        local route = m.route or 'iv'   -- inhal / sl / im / in brauchen keinen Zugang
        if route == 'iv' and not med.canula then
            patientSays(med, lines, 'Das geht doch ohne Zugang nicht!')
            say(lines, 'info', 'Zuerst einen Zugang legen (i.v. oder i.o.).')
        end
        if route ~= 'iv' or med.canula then
            for _, need in ipairs(m.needs or {}) do
                if not med.arrest and not med.measured[need] and not (need == 'ekg' and med.ekgLeads > 0) then
                    say(lines, 'info', 'Vor der Gabe muessen erst die passenden Werte erhoben werden (' .. need:upper() .. ').')
                    return true, { lines = lines, view = Med.view(p) }
                end
            end
            if m.minSys and med.rrsys < m.minSys then
                say(lines, 'info', ('Kontraindikation: Der systolische Blutdruck liegt unter %d mmHg - keine Gabe.'):format(m.minSys))
                return true, { lines = lines, view = Med.view(p) }
            end
            if not med.arrest then
                for k, v in pairs(m.effect or {}) do med[k] = (med[k] or 0) + v end
                for k, range in pairs(m.effectRange or {}) do med[k] = (med[k] or 0) + rnd(range) end
            end
            med.given[m.id] = true
            clampVitals(med)
            say(lines, 'info', ('%s wurde verabreicht.'):format(m.label))
            med.log[#med.log + 1] = { at = os.time(), text = m.label }
            changed = true
            checkRosc(med, lines)
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
        say(lines, 'rd', action == 'stifneck' and 'Rettungsdienst: Ich lege Ihnen eine Halskrause (Zervikalstuetze) um.'
            or 'Rettungsdienst: Ich lege Ihnen eine Beckenschlinge an.')
        if med[action] then
            patientSays(med, lines, 'Ich habe doch schon eine um!')
        else
            med[action] = true
            say(lines, 'info', (action == 'stifneck' and 'Zervikalstuetze' or 'Beckenschlinge') .. ' wurde angelegt.')
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
