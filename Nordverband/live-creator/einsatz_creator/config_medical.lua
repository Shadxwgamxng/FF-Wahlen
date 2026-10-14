--[[
    Medizinische Behandlung (Rettungsdienst)

    Uebernommen aus nv_medicDispatches und datengetrieben aufbereitet:
      - Meldebilder mit Vitalwert-Bereichen, Gespraechsantworten und Pupillenbefund
      - Diagnostik (RR, HF, SpO2, BZ, Temperatur, Pupillen, GCS, AF, EKG 4/12-Kanal, Auskultation, Rekap, Haut)
      - Anamnese SAMPLER und OPQRST
      - Massnahmen mit Minispielen (i.v., IO, Larynxtubus, Thoraxentlastung, Herzdruckmassage, Defibrillation)
      - Sauerstoff 2/4/6/8 l (SpO2 + 0,8 je Liter)
      - Medikamente und Infusionen mit Wirkung auf die Vitalwerte
        (nur mit Zugang; Kreislauf-/Atem-/BZ-Medikamente erst nach Messung)
      - Bodycheck mit Koerperregionen; Pflaster, Verband, Schiene, Zervikalstuetze, Beckenschlinge
      - Trage (Patient wird auf die Trage gelegt)
    Neu: Notruftexte je Meldebild (Tag/Nacht) fuer die Leitstelle.

    Platzhalter in Texten: {anrede} {vorname} {nachname} {pain} {name}
]]

Medical = {}

-- Koerperregionen fuer den Bodycheck. maxLevel: hoechste moegliche Verletzungsstufe
--   1 = kleine Wunde (Pflaster), 2 = grosse Wunde (Verband),
--   3 = schwere Verletzung: Kopf -> SHT (Zervikalstuetze), Becken -> instabil (Beckenschlinge),
--       Extremitaeten -> Fraktur (Schiene)
Medical.BodyParts = {
    { id = 'kopf', label = 'Kopf', maxLevel = 3, severe = 'stifneck', severeText = 'wahrscheinlich ein SHT' },
    { id = 'hals', label = 'Hals', maxLevel = 2 },
    { id = 'thorax', label = 'Thorax', maxLevel = 2 },
    { id = 'becken', label = 'Becken', maxLevel = 3, severe = 'beckenschlinge', severeText = 'ist instabil' },
    { id = 'oberarmli', label = 'li. Oberarm', maxLevel = 3, severe = 'schiene', severeText = 'Verdacht auf Fraktur' },
    { id = 'oberarmre', label = 're. Oberarm', maxLevel = 3, severe = 'schiene', severeText = 'Verdacht auf Fraktur' },
    { id = 'unterarmli', label = 'li. Unterarm', maxLevel = 3, severe = 'schiene', severeText = 'Verdacht auf Fraktur' },
    { id = 'unterarmre', label = 're. Unterarm', maxLevel = 3, severe = 'schiene', severeText = 'Verdacht auf Fraktur' },
    { id = 'handli', label = 'li. Hand', maxLevel = 3, severe = 'schiene', severeText = 'Verdacht auf Fraktur' },
    { id = 'handre', label = 're. Hand', maxLevel = 3, severe = 'schiene', severeText = 'Verdacht auf Fraktur' },
    { id = 'oberschenkelli', label = 'li. Oberschenkel', maxLevel = 3, severe = 'schiene', severeText = 'Verdacht auf Fraktur' },
    { id = 'oberschenkelre', label = 're. Oberschenkel', maxLevel = 3, severe = 'schiene', severeText = 'Verdacht auf Fraktur' },
    { id = 'wadeli', label = 'li. Unterschenkel', maxLevel = 3, severe = 'schiene', severeText = 'Verdacht auf Fraktur' },
    { id = 'wadere', label = 're. Unterschenkel', maxLevel = 3, severe = 'schiene', severeText = 'Verdacht auf Fraktur' },
    { id = 'fussli', label = 'li. Fuss', maxLevel = 3, severe = 'schiene', severeText = 'Verdacht auf Fraktur' },
    { id = 'fussre', label = 're. Fuss', maxLevel = 3, severe = 'schiene', severeText = 'Verdacht auf Fraktur' },
}

Medical.Insurances = { 'AOK', 'Techniker Krankenkasse', 'Barmer', 'DAK-Gesundheit', 'IKK classic', 'KKH', 'hkk', 'privat versichert' }

-- Standardwerte, wenn ein Meldebild nichts anderes vorgibt
Medical.Defaults = {
    rr = { 115, 140, 70, 90 },       -- sys min, sys max, dia min, dia max
    hf = { 65, 95 },
    spo2 = { 94, 100 },
    bz = { 4.5, 7.5 },               -- mmol/l
    temp = { 36.0, 37.4 },
    af = { 12, 18 },
    gcs = 15,
    pain = 0,
    pupils = 'seitengleich, lichtreagibel und normal',
    ekg = 'sinus',                   -- Grundrhythmus (siehe Medical.Rhythms); Sinus passt sich der HF an
    lung = 'vesikulaeres Atemgeraeusch beidseits, keine Nebengeraeusche',
    recap = { 1.0, 1.8 },            -- Rekapillarisierungszeit in Sekunden
    skin = 'rosig, warm und trocken',
}

--[[
    EKG-Rhythmen (Anzeige im Monitor und Befund)
      wave: Kurvenform im Monitor (sinus | vf | flat | stemi | afib)
      shockable: defibrillierbar
]]
Medical.Rhythms = {
    sinus = { label = 'Sinusrhythmus', wave = 'sinus' },
    sinustachy = { label = 'Sinustachykardie', wave = 'sinus' },
    sinusbrady = { label = 'Sinusbradykardie', wave = 'sinus' },
    afib = { label = 'Tachyarrhythmia absoluta bei Vorhofflimmern', wave = 'afib' },
    stemi = { label = 'Sinusrhythmus mit ST-Hebungen in V2-V4 (Vorderwandinfarkt)', wave = 'stemi', twelveOnly = true },
    vf = { label = 'Kammerflimmern', wave = 'vf', shockable = true },
    asystolie = { label = 'Asystolie', wave = 'flat' },
}

--[[
    SAMPLER(S) - Anamnese. Jede Variante kann einzelne Antworten mit sampler = { a=, m=, p=, l=, e=, r= } festlegen,
    sonst wird zufaellig aus diesen Listen gewaehlt. S (Symptome) und E (Ereignis) kommen aus "what".
]]
Medical.Sampler = {
    a = { 'Allergien? Nein, keine.', 'Ja, gegen Penicillin.', 'Ich vertrage kein Ibuprofen.', 'Gegen Nuesse und Pflaster.', 'Nur Heuschnupfen.' },
    m = { 'Ich nehme keine Medikamente.', 'Ramipril gegen den Blutdruck.', 'Nur die Pille.', 'L-Thyroxin fuer die Schilddruese.',
        'ASS 100 und was fuer das Cholesterin.', 'Metformin, ich bin Diabetiker.' },
    p = { 'Ich bin eigentlich gesund.', 'Ich habe Bluthochdruck.', 'Ich hatte vor zwei Jahren eine Blinddarm-OP.', 'Asthma als Kind.',
        'Ich habe was mit der Schilddruese.' },
    l = { 'Heute Morgen ein Broetchen.', 'Vor zwei Stunden habe ich zu Mittag gegessen.', 'Gestern Abend, heute noch nichts.',
        'Gerade eben einen Kaffee und ein Croissant.' },
    r = { 'Ich rauche eine Schachtel am Tag.', 'Ich mache leider gar keinen Sport.', 'Mein Vater hatte auch einen Herzinfarkt.',
        'Nichts Besonderes eigentlich.', 'Ich trinke am Wochenende ganz gerne.' },
}

--[[
    OPQRST - Schmerzanamnese. Variante: opqrst = { o=, p=, q=, r=, t= } (S = Schmerzstaerke)
]]
Medical.Opqrst = {
    o = 'Das kam ganz ploetzlich.',
    p = 'Wenn ich mich bewege, wird es schlimmer.',
    q = 'Es ist so ein dumpfer Schmerz.',
    r = 'Nein, das strahlt nirgendwo hin.',
    t = 'Seit etwa einer halben Stunde.',
}

--[[
    Massnahmen (Prozeduren). game = Minispiel in der Oberflaeche:
      timing    Zeiger im gruenen Bereich stoppen (hits = noetige Treffer)
      drill     Bohrstelle waehlen und Bohrer im richtigen Moment loslassen
      landmark  richtige Punktionsstelle am Thorax waehlen
    Herzdruckmassage hat kein Minispiel: die Einsatzkraft fuehrt die CPR-Animation aus (Config.Medical.cpr).
      ekg       Elektroden an die richtigen Stellen ziehen (twelve = 12-Kanal)
]]
Medical.Procedures = {
    { id = 'iv', label = 'Venenzugang (i.v.)', group = 'Zugang', game = 'timing', hits = 2, icon = 'syringe' },
    { id = 'io', label = 'Intraossaerer Zugang (Bohrsystem)', group = 'Zugang', game = 'drill', icon = 'bore-hole' },
    { id = 'bvm', label = 'Beutel-Masken-Beatmung', group = 'Atemweg', icon = 'mask-ventilator' },
    { id = 'tubus', label = 'Larynxtubus einlegen', group = 'Atemweg', game = 'timing', hits = 1, icon = 'lungs' },
    { id = 'thorax', label = 'Thoraxentlastungspunktion', group = 'Atemweg', game = 'landmark', icon = 'lungs' },
    { id = 'cpr', label = 'Herzdruckmassage (30:2)', group = 'Reanimation', icon = 'heart-pulse' },
    { id = 'defi', label = 'Defibrillation (200 J)', group = 'Reanimation', icon = 'bolt' },
    { id = 'waerme', label = 'Waermeerhalt (Rettungsdecke)', group = 'Sonstiges', icon = 'temperature-arrow-up' },
    { id = 'lagerung', label = 'Oberkoerperhochlagerung', group = 'Sonstiges', icon = 'bed' },
}

-- Bezeichnungen fuer Pflichtmassnahmen (required) einer Variante
Medical.RequiredLabels = {
    ekg = 'EKG (4-Kanal)', ekg12 = '12-Kanal-EKG', zugang = 'Zugang (i.v. oder i.o.)', airway = 'Atemwegssicherung (Beutel/Tubus)',
    cpr = 'Herzdruckmassage', defi = 'Defibrillation', thorax = 'Thoraxentlastung', bz = 'BZ messen', spo2 = 'SpO2 messen',
    sampler = 'SAMPLER-Anamnese', opqrst = 'OPQRST-Schmerzanamnese', lung = 'Auskultation', waerme = 'Waermeerhalt',
    lagerung = 'Oberkoerperhochlagerung',
}

--[[
    Sprechweise:
      wach        normale Antworten
      rausch      "Patient (Rauschzustand)"
      undeutlich  Antworten werden unverstaendlich (Buchstaben fehlen)
      erschoepft  "Patient (erschoepft)"
      bewusstlos  keine Reaktion
]]
Medical.Speech = {
    wach = {
        prefix = 'Patient',
        hello = 'Hallo! Ja, ich hoere Sie klar und deutlich.',
        name = 'Mein Name ist {vorname} {nachname}.',
        insurance = 'Ich bin bei der {kasse}.',
        noPain = 'Nein, ich habe keine Schmerzen.',
        transportYes = 'Ja, machen Sie das.',
        noTransport = 'Dann gehe ich wieder nach Hause. Danke!',
    },
    rausch = {
        prefix = 'Patient (Rauschzustand)',
        hello = 'Was? Wer sind Sie denn? Ach, der Rettungsdienst ... was wollen Sie?',
        name = 'Du musst mich doch kennen! Ich bin doch {vorname} ... {nachname}, das vergesst ihr immer.',
        insurance = 'Ich glaub die heisst OKA Land haha ... keine Ahnung.',
        noPain = 'Ne Doktor, weh tun macht nichts bei mir.',
        transportYes = 'Krankenhaus? Na gut ... gibt es da was zu trinken?',
        noTransport = 'Super, dann geh ich weiter feiern!',
    },
    undeutlich = {
        prefix = 'Patient (undeutlich)',
        garble = true,
        hello = 'Ja, ich hoere Sie ... mehr oder weniger.',
        name = 'Mein Name ist {vorname} {nachname}.',
        insurance = 'Ich bin bei der {kasse}.',
        noPain = 'Nein, keine Schmerzen.',
        transportYes = 'Ja ... machen Sie das.',
        noTransport = 'Ich ... gehe nach Hause.',
    },
    erschoepft = {
        prefix = 'Patient (erschoepft)',
        hello = 'Ja ... ich hoere Sie ... ich krieg nur schlecht Luft.',
        name = 'Ich heisse ... {vorname} {nachname}.',
        insurance = '{kasse} ...',
        noPain = 'Nein ... keine Schmerzen.',
        transportYes = 'Ja ... bitte.',
        noTransport = 'Ich versuche es zu Hause ...',
    },
    bewusstlos = {
        prefix = 'Patient',
        silent = true,
        hello = '*keine Reaktion*', name = '*keine Reaktion*', insurance = '*keine Reaktion*',
        noPain = '*keine Reaktion*', transportYes = '*keine Reaktion*', noTransport = '*keine Reaktion*',
    },
}

--[[
    Meldebilder
    Jede Variante kann ueberschreiben: speech, rr, hf, spo2, bz, temp, af, gcs, pain, pupils,
    what (Antwort auf "Was ist passiert?"), painText, randomInjuries, worsenParts
    callTexts: Notruftexte fuer die Leitstelle (Platzhalter {anrede} {vorname} {nachname})
]]
Medical.Profiles = {
    {
        id = 'kreislauf', label = 'Kreislauf / Blutdruck', keyword = 'RD - Notfall', severity = 'mittel',
        variants = {
            { label = 'Hypertensive Entgleisung', rr = { 140, 175, 90, 115 }, hf = { 90, 130 }, temp = { 33.5, 37.4 },
                what = 'Oh mein Gott! Ich habe so Kopfschmerzen und mir ist schlecht!',
                painText = 'Ich habe nur so einen Druck auf der Brust, aber keine Schmerzen.' },
            { label = 'Sonnenstich / Hitzeerschoepfung', rr = { 100, 140, 60, 90 }, hf = { 60, 80 }, temp = { 37.0, 41.5 }, pain = 3,
                what = 'Ich war zu lang in der Sonne und jetzt ist mir schlecht!',
                painText = 'Habe Kopfschmerzen, ja. Die liegen so bei einer {pain}.' },
        },
        callTexts = {
            day = {
                'Guten Tag, hier ist {anrede} {nachname}. Ich habe seit Stunden starke Kopfschmerzen, mir ist uebel und mein Blutdruckmessgeraet zeigt sehr hohe Werte.',
                'Hallo, {vorname} {nachname} hier. Ich glaube, ich habe einen Sonnenstich. Mir ist schwindelig und ich habe Kopfweh, koennen Sie jemanden schicken?',
                'Hier sitzt eine Person auf der Parkbank, total rot im Gesicht und ihr ist schlecht. Bitte kommen Sie.',
            },
            night = {
                'Guten Abend, {anrede} {nachname} mein Name. Mein Blutdruck spielt verrueckt, mir dreht sich alles und ich habe Druck auf der Brust.',
                'Hallo, mein Mann fuehlt sich seit dem Abendessen gar nicht gut, er hat Kopfschmerzen und sein Blutdruck ist sehr hoch.',
            },
        },
    },
    {
        id = 'alkohol', label = 'Alkoholintoxikation', keyword = 'RD - Notfall', severity = 'mittel',
        variants = {
            { label = 'Alkoholisiert, ansprechbar', rr = { 145, 155, 95, 120 }, hf = { 85, 105 },
                what = 'Ich glaube, ich habe meine zwei Bierchen nicht vertragen.' },
            { label = 'Rauschzustand', speech = 'rausch', rr = { 150, 160, 100, 125 }, hf = { 90, 115 },
                what = 'Die Party war zu geil, Alter! Hast du Vodka-Infusion im Rucksack?' },
        },
        callTexts = {
            day = {
                'Hallo, hier liegt jemand auf dem Gehweg und riecht stark nach Alkohol. Er ist kaum ansprechbar.',
                'Hier ist {anrede} {nachname}, mein Kumpel hat gestern Nacht uebertrieben und uebergibt sich staendig. Koennen Sie nach ihm sehen?',
            },
            night = {
                'Hallo, wir sind gerade aus dem Club raus und unser Freund ist umgekippt. Er reagiert kaum, bitte schnell!',
                'Guten Abend, hier ist die Leitstelle der Verkehrsbetriebe. Ein Busfahrer meldet eine stark betrunkene Person an der Haltestelle.',
                'Hier liegt ein Betrunkener vor meiner Haustuer und ich bekomme ihn nicht wach.',
            },
        },
    },
    {
        id = 'drogen', label = 'Drogenintoxikation', keyword = 'RD - Notfall', severity = 'mittel',
        variants = {
            { label = 'Intoxikation, ansprechbar', rr = { 145, 155, 95, 120 }, hf = { 100, 130 }, pupils = 'seitengleich, lichtreagibel, aber weit',
                what = 'Mir geht es nicht so gut, ich habe einen Joint geraucht.' },
            { label = 'Rauschzustand', speech = 'rausch', rr = { 150, 160, 100, 125 }, hf = { 120, 165 }, pupils = 'seitengleich, lichtreagibel, aber weit',
                what = 'Bei mir ist alles gut. Koennen Sie Ihr Einhorn wegparken?' },
        },
        callTexts = {
            day = {
                'Hallo, mein Mitbewohner hat irgendwas genommen. Er sieht Dinge, die nicht da sind, und sein Herz rast.',
                'Hier ist {anrede} {nachname}. Ich sehe alles verschwommen und die Lichter sind so grell ... bitte keine Polizei.',
            },
            night = {
                'Ich habe meinen besten Freund gefunden, er ist kaum ansprechbar und hat ganz grosse Pupillen. Kommen Sie schnell!',
                'Auf der Party ist jemand zusammengebrochen, wir glauben er hat Pillen genommen.',
            },
        },
    },
    {
        id = 'reanimation', label = 'Leblose Person / Reanimation', keyword = 'RD - Reanimation', severity = 'kritisch',
        variants = {
            { label = 'Kreislaufstillstand (Kammerflimmern)', speech = 'bewusstlos', rr = { 0, 0, 0, 0 }, hf = { 0, 0 }, spo2 = { 35, 80 },
                bz = { 3.5, 7.5 }, temp = { 34.0, 36.0 }, af = { 0, 0 }, gcs = 3, ekg = 'vf', arrest = true,
                lung = 'kein Atemgeraeusch (Atemstillstand)', skin = 'blass-zyanotisch, kalt', recap = { 4.0, 6.0 },
                pupils = 'seitengleich, lichtreagibel, aber weit', what = '*keine Reaktion*',
                required = { 'ekg', 'cpr', 'defi', 'zugang', 'suprarenin', 'airway' } },
            { label = 'Kreislaufstillstand (Asystolie)', speech = 'bewusstlos', rr = { 0, 0, 0, 0 }, hf = { 0, 0 }, spo2 = { 35, 70 },
                bz = { 3.5, 7.5 }, temp = { 33.0, 35.5 }, af = { 0, 0 }, gcs = 3, ekg = 'asystolie', arrest = true,
                lung = 'kein Atemgeraeusch (Atemstillstand)', skin = 'blass-zyanotisch, kalt', recap = { 4.0, 6.0 },
                pupils = 'seitengleich, lichtstarr und weit', what = '*keine Reaktion*',
                required = { 'ekg', 'cpr', 'zugang', 'suprarenin', 'airway' } },
        },
        callTexts = {
            day = {
                'Hier liegt jemand auf dem Boden und atmet nicht mehr! Kommen Sie schnell!',
                'Mein Vater ist einfach umgefallen und reagiert nicht mehr! Ich glaube, er atmet nicht!',
            },
            night = {
                'Bitte kommen Sie sofort, mein Mann ist im Schlaf ganz blau geworden und atmet nicht!',
                'Vor der Kneipe liegt ein Mann, der sich nicht mehr bewegt. Wir finden keinen Puls!',
            },
        },
    },
    {
        id = 'schwindel', label = 'Schwindel', keyword = 'RD - Notfall', severity = 'leicht',
        variants = {
            { label = 'Hypotonie', rr = { 65, 100, 40, 60 }, hf = { 90, 115 },
                what = 'Ich habe so ein Flimmern vor den Augen und mir ist so schwindelig, das geht gar nicht.' },
            { label = 'Hypertonie', rr = { 150, 160, 100, 125 }, hf = { 90, 115 },
                what = 'Mir dreht sich alles und mein Kopf platzt gleich.' },
        },
        callTexts = {
            day = {
                'Hallo, hier ist {anrede} {nachname}. Mir ist ganz furchtbar schwindelig und mein Hausarzt ist im Urlaub.',
                'Meiner Kollegin ist im Buero schwarz vor Augen geworden, sie sitzt jetzt auf dem Boden.',
            },
            night = {
                'Guten Abend, {vorname} {nachname} hier. Ich bin aufgestanden und mir ist so schwindelig, dass ich nicht mehr laufen kann.',
            },
        },
    },
    {
        id = 'sturz', label = 'Sturz', keyword = 'RD - Sturz', severity = 'mittel',
        variants = {
            { label = 'Sturz, ansprechbar', rr = { 100, 140, 60, 90 }, hf = { 70, 100 }, pain = 5, randomInjuries = true,
                what = 'Ich bin gestuerzt und habe jetzt starke Schmerzen.',
                painText = 'Die Schmerzen liegen so bei einer {pain}.' },
            { label = 'Sturz mit Kopfbeteiligung', speech = 'undeutlich', rr = { 150, 190, 95, 135 }, hf = { 80, 110 }, pain = 7,
                randomInjuries = true, worsenParts = { 'kopf', 'becken' }, pupils = 'ungleich, aber lichtreagibel', gcs = 12,
                what = 'Ich bin gestuerzt und habe jetzt so starke Schmerzen.',
                painText = 'Die liegen so bei einer {pain}.' },
        },
        callTexts = {
            day = {
                'Moin, ich bin eben gestolpert und jetzt tut mir alles weh. Ich heisse {vorname} {nachname}.',
                'Hallo, {anrede} {nachname} hier. Ich wurde angerempelt, bin gefallen und komme nicht mehr hoch.',
                'Hier ist ein Radfahrer gestuerzt, er blutet am Kopf und ist ganz durcheinander.',
            },
            night = {
                'Meine Mutter ist im Badezimmer gestuerzt und hat sich den Kopf angeschlagen. Sie redet ganz komisch.',
                'Hier ist jemand die Treppe runtergefallen und kann das Bein nicht mehr bewegen.',
            },
        },
    },
    {
        id = 'diabetes', label = 'Diabetischer Notfall', keyword = 'RD - Notfall', severity = 'mittel',
        variants = {
            { label = 'Hyperglykaemie (Insulin vergessen)', bz = { 7.5, 15.5 }, rr = { 65, 100, 40, 60 }, hf = { 90, 130 },
                what = 'Ich glaube, ich habe was mit dem Zucker. Ich habe mein Insulin vergessen.' },
            { label = 'Hypoglykaemie (zu viel Insulin)', bz = { 1.8, 3.2 }, rr = { 150, 190, 95, 135 }, hf = { 95, 135 },
                skin = 'blass, kaltschweissig', sampler = { m = 'Insulin, Lantus und Novorapid.', p = 'Ich habe Diabetes Typ 1.' },
                what = 'Ich glaube, ich habe zu viel Insulin genommen. Ich dachte, da passiert nichts Schlimmes.',
                required = { 'bz', 'zugang', 'g20' } },
        },
        callTexts = {
            day = {
                'Hallo, hier ist {anrede} {nachname}. Ich bin Diabetiker, ich zittere am ganzen Koerper und schwitze stark.',
                'Mein Sohn ist Diabetiker und plötzlich ganz verwirrt. Er hat heute kaum etwas gegessen.',
            },
            night = {
                'Mein Mann ist Diabetiker und ich bekomme ihn kaum wach. Er ist ganz kaltschweissig.',
                'Hier ist {vorname} {nachname}, ich habe mein Insulin vergessen und mir ist total uebel, ich habe staendig Durst.',
            },
        },
    },
    {
        id = 'atemnot', label = 'Atemnot', keyword = 'RD - Atemnot', severity = 'schwer',
        variants = {
            { label = 'Atemnot', speech = 'erschoepft', rr = { 140, 175, 90, 115 }, hf = { 90, 120 }, spo2 = { 80, 91 }, af = { 24, 32 },
                what = 'Hallo ... ich kriege nicht mehr so gut Luft ...' },
            { label = 'Asthmaanfall', speech = 'erschoepft', rr = { 150, 190, 95, 135 }, hf = { 95, 135 }, spo2 = { 80, 91 }, af = { 26, 36 },
                lung = 'exspiratorisches Giemen und Brummen beidseits, verlaengertes Ausatmen',
                sampler = { m = 'Salbutamol-Spray, aber das habe ich zu Hause.', p = 'Ich habe Asthma seit der Kindheit.' },
                what = 'Ich bin Asthmatiker und habe mein Spray nicht dabei.',
                required = { 'spo2', 'lung', 'salbutamol', 'lagerung' } },
        },
        callTexts = {
            day = {
                'Hallo, mein Kind hat einen Asthmaanfall und das Spray hilft nicht!',
                'Hier ist {anrede} {nachname} ... ich bekomme ... kaum Luft ... bitte kommen Sie.',
            },
            night = {
                'Meine Frau ist nachts aufgewacht und bekommt keine Luft mehr, die Lippen werden blau.',
                'Hallo, mein Opa ringt nach Luft und kann nicht mehr sprechen.',
            },
        },
    },
    {
        id = 'bauch', label = 'Bauchschmerzen', keyword = 'RD - Notfall', severity = 'mittel',
        variants = {
            { label = 'Bauchschmerzen', rr = { 130, 155, 90, 105 }, hf = { 70, 105 }, pain = 6,
                what = 'Mein Bauch tut seit Tagen weh. Heute ist es so schlimm geworden.',
                painText = 'Die Schmerzen liegen so bei {pain}.' },
            { label = 'Verdacht Appendizitis', rr = { 150, 190, 95, 135 }, hf = { 95, 135 }, pain = 7, temp = { 37.6, 38.9 },
                what = 'Ich habe ganz doll Schmerzen im rechten Unterbauch.',
                painText = 'Rechts unten, so bei einer {pain}. Es wird immer schlimmer.' },
        },
        callTexts = {
            day = {
                'Hallo, {anrede} {nachname} hier. Ich habe seit heute Morgen kaum auszuhaltende Bauchschmerzen.',
                'Mein Kollege kruemmt sich vor Schmerzen und haelt sich den rechten Unterbauch.',
            },
            night = {
                'Guten Abend, ich habe so starke Bauchschmerzen, dass ich nicht schlafen kann, und habe mich uebergeben.',
            },
        },
    },
    {
        id = 'acs', label = 'Brustschmerz / Akutes Koronarsyndrom', keyword = 'RD - ACS', severity = 'schwer',
        variants = {
            { label = 'Vorderwandinfarkt (STEMI)', rr = { 145, 180, 90, 110 }, hf = { 90, 115 }, spo2 = { 90, 95 }, pain = 8,
                ekg = 'stemi', skin = 'blass, kaltschweissig', speech = 'erschoepft',
                what = 'Ich habe so einen Druck auf der Brust ... als wuerde ein Elefant draufsitzen.',
                painText = 'Das ist so eine {pain} ... ganz schlimm.',
                opqrst = { o = 'Vor etwa 40 Minuten, ganz ploetzlich beim Treppensteigen.', p = 'Es wird nicht besser, egal wie ich sitze.',
                    q = 'Ein Druck, ein Brennen, ganz eng.', r = 'Das zieht in den linken Arm und in den Kiefer.', t = 'Seit 40 Minuten, durchgehend.' },
                sampler = { r = 'Ich rauche und mein Vater hatte auch einen Infarkt.', p = 'Bluthochdruck und hohes Cholesterin.' },
                required = { 'ekg12', 'zugang', 'ass', 'heparin', 'opqrst', 'lagerung' } },
            { label = 'Instabile Angina pectoris', rr = { 150, 175, 90, 105 }, hf = { 80, 100 }, spo2 = { 93, 97 }, pain = 6,
                ekg = 'sinus', skin = 'blass', what = 'Ich habe wieder diese Schmerzen in der Brust, diesmal gehen sie nicht weg.',
                painText = 'So eine {pain} ungefaehr.',
                opqrst = { o = 'Beim Spaziergang vor einer Stunde.', p = 'In Ruhe wird es etwas besser.', q = 'Druckend, eng.',
                    r = 'Ein bisschen in den linken Arm.', t = 'Seit einer Stunde, mal mehr, mal weniger.' },
                sampler = { m = 'Nitrospray und ASS 100.', p = 'Ich habe eine koronare Herzkrankheit.' },
                required = { 'ekg12', 'zugang', 'nitro', 'opqrst' } },
        },
        callTexts = {
            day = {
                'Hallo, hier ist {anrede} {nachname}. Ich habe seit einer halben Stunde starke Schmerzen in der Brust, die in den Arm ziehen.',
                'Mein Kollege ist ganz blass, schwitzt und haelt sich die Brust. Er sagt, es drueckt total.',
            },
            night = {
                'Mein Mann ist aufgewacht und hat einen furchtbaren Druck auf der Brust, er ist ganz grau im Gesicht.',
                'Hier ist {vorname} {nachname}, mir ist schlecht und ich habe Schmerzen in der Brust und im Kiefer.',
            },
        },
    },
    {
        id = 'spannungspneu', label = 'Thoraxtrauma / Spannungspneumothorax', keyword = 'RD - Trauma', severity = 'kritisch',
        variants = {
            { label = 'Spannungspneumothorax rechts', speech = 'erschoepft', rr = { 75, 95, 40, 60 }, hf = { 120, 145 },
                spo2 = { 72, 85 }, af = { 30, 40 }, pain = 8, tension = 'rechts', skin = 'zyanotisch, kaltschweissig', recap = { 3.0, 4.5 },
                lung = 'rechts kein Atemgeraeusch, hypersonorer Klopfschall, gestaute Halsvenen, Trachea nach links verschoben',
                body = { thorax = 2 }, what = 'Ich bin ... mit dem Brustkorb aufs Lenkrad ... ich krieg keine Luft ...',
                painText = 'Rechts ... {pain} ... beim Atmen.',
                required = { 'lung', 'thorax', 'zugang', 'airway' } },
            { label = 'Spannungspneumothorax links', speech = 'erschoepft', rr = { 75, 95, 40, 60 }, hf = { 120, 145 },
                spo2 = { 72, 85 }, af = { 30, 40 }, pain = 8, tension = 'links', skin = 'zyanotisch, kaltschweissig', recap = { 3.0, 4.5 },
                lung = 'links kein Atemgeraeusch, hypersonorer Klopfschall, gestaute Halsvenen, Trachea nach rechts verschoben',
                body = { thorax = 2 }, what = 'Ich bin gestuerzt ... auf die linke Seite ... Luft ...',
                painText = 'Links ... so {pain}.',
                required = { 'lung', 'thorax', 'zugang', 'airway' } },
        },
        callTexts = {
            day = {
                'Hier ist ein Motorradfahrer gestuerzt, er ringt nach Luft und wird ganz blau!',
                'Ein Arbeiter ist vom Geruest gefallen, er bekommt kaum Luft und haelt sich die Brust.',
            },
            night = {
                'Nach einem Unfall sitzt der Fahrer im Auto und bekommt immer schlechter Luft!',
            },
        },
    },
    {
        id = 'verlegung', label = 'Verlegung / Krankentransport', keyword = 'KTW - Verlegung', severity = 'leicht', transport = true,
        variants = {
            { label = 'Verlegung Klinik -> Klinik',
                what = 'Die Aerzte haben gesagt, die haben hier keine Kapazitaeten fuer mich, ich soll in ein anderes Krankenhaus.' },
            { label = 'Einweisung durch Hausarzt',
                what = 'Mein Hausarzt hat gesagt, das muesste sein. Ich hoffe, das macht keine Umstaende.' },
            { label = 'Entlassung nach Hause',
                what = 'Ich lag leider lange im Krankenhaus und darf endlich nach Hause.' },
        },
        callTexts = {
            day = {
                'Hier ist die Station 3 der Klinik. Wir haben eine Verlegung fuer {anrede} {nachname}, liegend, nicht dringend.',
                'Praxis Dr. Berger hier, wir benoetigen einen Krankentransport fuer {anrede} {nachname} in die Klinik.',
            },
            night = {
                'Hier ist die Notaufnahme, wir brauchen eine Verlegung fuer {anrede} {nachname} in ein anderes Krankenhaus.',
            },
        },
    },
}

--[[
    Medikamente / Infusionen
      needs:  zuvor gemessene Werte (sonst "Sie muessen doch erst mal Vitalwerte nehmen!")
      effect: feste Aenderung; effectRange: zufaellige Aenderung { min, max }
      spo2Bonus: erhoeht die SpO2 (max. 100)
      route:  iv (Standard, braucht Zugang i.v./i.o.) | inhal | sl | im | in (ohne Zugang)
      minSys: Gabe nur ab diesem systolischen Blutdruck (z. B. Nitro)
]]
Medical.Medications = {
    { id = 'akrinor', label = 'Cafedrin/Theodrenalin', group = 'Kreislauf', needs = { 'rr' }, effect = { rrsys = 25, rrdia = 15 } },
    { id = 'ebrantil', label = 'Urapidil', group = 'Kreislauf', needs = { 'rr' }, effect = { rrsys = -25, rrdia = -10 } },
    { id = 'haemiton', label = 'Clonidin', group = 'Kreislauf', needs = { 'rr' }, effect = { rrsys = -15, rrdia = -10 } },
    { id = 'atropin', label = 'Atropin', group = 'Kreislauf', needs = { 'hf' }, effect = { hf = 40 } },
    { id = 'suprarenin', label = 'Adrenalin 1 mg', group = 'Kreislauf', needs = { 'hf' }, effect = { hf = 50 } },
    { id = 'atrovent', label = 'Ipratropiumbromid (vernebelt)', group = 'Atmung', route = 'inhal', needs = { 'spo2' }, effect = { spo2Bonus = 10 } },
    { id = 'salbutamol', label = 'Salbutamol (vernebelt)', group = 'Atmung', route = 'inhal', needs = { 'spo2' }, effect = { spo2Bonus = 4 } },
    { id = 'prednisolon', label = 'Prednisolon 250 mg', group = 'Atmung', needs = { 'spo2' }, effect = { spo2Bonus = 3 } },
    { id = 'g20', label = 'Glukose 20 %', group = 'Stoffwechsel', needs = { 'bz' }, effect = { bz = 1.8 } },
    { id = 'buscopan', label = 'Butylscopolamin', group = 'Schmerz', effect = { pain = -2 } },
    { id = 'novalgin', label = 'Metamizol', group = 'Schmerz', effect = { pain = -2 } },
    { id = 'fenistil', label = 'Dimetinden', group = 'Schmerz', effect = { pain = -3 } },
    { id = 'paracetamol', label = 'Paracetamol', group = 'Schmerz', effect = { pain = -4, temp = -2.0 } },
    { id = 'ketanest', label = 'Esketamin', group = 'Schmerz', effect = { pain = -9 } },
    { id = 'oxytocin', label = 'Oxytocin', group = 'Schmerz', effect = { pain = -10 } },
    { id = 'ass', label = 'ASS 250 mg i.v.', group = 'Herz', needs = { 'ekg' } },
    { id = 'heparin', label = 'Heparin 5000 I.E.', group = 'Herz', needs = { 'ekg' } },
    { id = 'nitro', label = 'Nitro-Spray 0,4 mg', group = 'Herz', route = 'sl', needs = { 'rr' }, minSys = 110, effect = { rrsys = -20, rrdia = -10, pain = -2 } },
    { id = 'amiodaron', label = 'Amiodaron 300 mg', group = 'Herz', needs = { 'ekg' } },
    { id = 'furosemid', label = 'Furosemid 40 mg', group = 'Herz', needs = { 'rr' }, effect = { rrsys = -10, spo2Bonus = 2 } },
    { id = 'morphin', label = 'Morphin 5 mg', group = 'Schmerz', effect = { pain = -5, af = -2 } },
    { id = 'fentanyl', label = 'Fentanyl 0,1 mg', group = 'Schmerz', effect = { pain = -6, af = -3 } },
    { id = 'midazolam', label = 'Midazolam 5 mg', group = 'Sonstiges' },
    { id = 'naloxon', label = 'Naloxon 0,4 mg', group = 'Sonstiges', effect = { gcs = 3, af = 4 } },
    { id = 'glucagon', label = 'Glucagon 1 mg (i.m.)', group = 'Stoffwechsel', route = 'im', needs = { 'bz' }, effect = { bz = 2.5 } },
    { id = 'ondansetron', label = 'Ondansetron 4 mg', group = 'Sonstiges' },
    { id = 'dimenhydrinat', label = 'Dimenhydrinat 62 mg', group = 'Sonstiges' },
    { id = 'g5', label = 'Glukose 5 % (Infusion)', group = 'Infusion', needs = { 'bz' }, effectRange = { bz = { 5.25, 10.5 } } },
    { id = 'jonosteril', label = 'Vollelektrolytloesung (Infusion)', group = 'Infusion', needs = { 'rr' },
        effectRange = { rrsys = { 45, 90 }, rrdia = { 15, 30 }, bz = { -3.0, -1.5 } } },
}

-- Sauerstoffgabe (Liter pro Minute)
Medical.Oxygen = { 2, 4, 6, 8 }
