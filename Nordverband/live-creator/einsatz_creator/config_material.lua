--[[
    Materialschrank fuer das Aufziehen von Medikamenten
    - Spritzen, Kanuelen/Zugaenge, Loesungen/Gebinde und Medikamente
    - Medikamente mit "med" sind mit Medical.Medications verknuepft (Wirkung am Patienten).
      Ohne "med" sind sie im Schrank, haben aber im Meldebild keine eigene Wirkung.

    Felder Medikament:
      unit      Einheit der Dosis: 'mg' | 'µg' | 'g' | 'IE'
      conc      Wirkstoffmenge pro ml in der Ampulle (in unit)
      ml        Inhalt einer Ampulle/Flasche in ml
      container Gebinde (Material.Containers)
      dose      uebliche Einzeldosis Erwachsener (in unit) - Bezug fuer Unter-/Ueberdosierung
      max       Hoechstdosis je Gabe (in unit) - darueber Ueberdosierung
      dilute    empfohlene Verduennung: Gesamtvolumen in ml (z. B. Adrenalin 1 mg ad 10 ml)
      solvent   Loesungsmittel bei Trockensubstanz (ml)
      color     Farbe des Spritzenetiketts (nach Wirkstoffgruppe, angelehnt an ISO 26825)
      over      Wirkung bei Ueberdosierung (wird zusaetzlich angewendet)
      glass     'braun' = Braunglasampulle (lichtempfindlich), sonst klares Glas
      form      nil = wird aufgezogen; 'inhal' | 'spray' | 'infusion' = wird direkt gegeben
      med       Verknuepfung zu Medical.Medications. Das Behandlungsmenue zeigt genau die Medikamente aus diesem Schrank.
]]
Material = Material or {}

-- Etikettfarben nach Wirkstoffgruppen
Material.LabelColors = {
    katecholamin = { bg = '#d3b3e0', label = 'Vasopressor' },
    opioid = { bg = '#66a6e0', label = 'Opioid' },
    sedativum = { bg = '#f7a64a', label = 'Sedativum/Hypnotikum' },
    antagonist = { bg = '#ffffff', label = 'Antagonist', stripe = true },
    anticholinergikum = { bg = '#9fd8a3', label = 'Anticholinergikum' },
    antiemetikum = { bg = '#d8c49a', label = 'Antiemetikum' },
    sonstige = { bg = '#ffffff', label = 'Sonstige' },
    lokal = { bg = '#a8a8a8', label = 'Lokalanaesthetikum' },
    gerinnung = { bg = '#ffffff', label = 'Gerinnung' },
}

-- 19 Spritzen
Material.Syringes = {
    { id = 'ins05', label = 'Insulinspritze 0,5 ml (U-100)', ml = 0.5, kind = 'insulin', step = 0.01 },
    { id = 'ins1', label = 'Insulinspritze 1 ml (U-100)', ml = 1, kind = 'insulin', step = 0.01 },
    { id = 'tb1', label = 'Tuberkulinspritze 1 ml, Luer-Slip', ml = 1, kind = 'ls', step = 0.01 },
    { id = 'ls2', label = 'Spritze 2 ml, Luer-Slip', ml = 2, kind = 'ls', step = 0.1 },
    { id = 'll2', label = 'Spritze 2 ml, Luer-Lock', ml = 2, kind = 'll', step = 0.1 },
    { id = 'll3', label = 'Spritze 3 ml, Luer-Lock', ml = 3, kind = 'll', step = 0.1 },
    { id = 'ls5', label = 'Spritze 5 ml, Luer-Slip', ml = 5, kind = 'ls', step = 0.2 },
    { id = 'll5', label = 'Spritze 5 ml, Luer-Lock', ml = 5, kind = 'll', step = 0.2 },
    { id = 'ls10', label = 'Spritze 10 ml, Luer-Slip', ml = 10, kind = 'ls', step = 0.5 },
    { id = 'll10', label = 'Spritze 10 ml, Luer-Lock', ml = 10, kind = 'll', step = 0.5 },
    { id = 'ls20', label = 'Spritze 20 ml, Luer-Slip', ml = 20, kind = 'ls', step = 1 },
    { id = 'll20', label = 'Spritze 20 ml, Luer-Lock', ml = 20, kind = 'll', step = 1 },
    { id = 'll30', label = 'Spritze 30 ml, Luer-Lock', ml = 30, kind = 'll', step = 1 },
    { id = 'perf50', label = 'Perfusorspritze 50 ml', ml = 50, kind = 'perfusor', step = 1 },
    { id = 'perf50lg', label = 'Perfusorspritze 50 ml, lichtgeschuetzt', ml = 50, kind = 'perfusor', step = 1 },
    { id = 'll60', label = 'Spritze 60 ml, Luer-Lock', ml = 60, kind = 'll', step = 2 },
    { id = 'ent10', label = 'Enteralspritze 10 ml (ENFit, nicht i.v.!)', ml = 10, kind = 'enteral', step = 0.5 },
    { id = 'ent20', label = 'Enteralspritze 20 ml (ENFit, nicht i.v.!)', ml = 20, kind = 'enteral', step = 1 },
    { id = 'flush10', label = 'Fertigspritze NaCl 0,9 % 10 ml (Spuelung)', ml = 10, kind = 'flush', step = 0.5, prefilled = 10 },
}

-- 30 Kanuelen und Zugaenge (use: draw = zum Aufziehen, inject = Injektion i.m./s.c., access = Gefaesszugang)
Material.Needles = {
    { id = 'aufz18', label = 'Aufziehkanuele 18G (stumpf)', use = 'draw', color = '#f19fb8' },
    { id = 'filter5', label = 'Filterkanuele 5 µm (Glasampullen)', use = 'draw', filter = true, color = '#f19fb8' },
    { id = 'blunt18', label = 'Blunt-Fill-Kanuele 18G', use = 'draw', color = '#f19fb8' },
    { id = 'spike', label = 'Entnahmespike (Mehrdosisbehaelter)', use = 'draw', spike = true, color = '#6fb0e8' },
    { id = 'spikef', label = 'Entnahmespike mit Filter', use = 'draw', spike = true, filter = true, color = '#6fb0e8' },
    { id = 'inj18', label = 'Injektionskanuele 18G (rosa)', use = 'inject', color = '#f19fb8' },
    { id = 'inj19', label = 'Injektionskanuele 19G (creme)', use = 'inject', color = '#efe6c8' },
    { id = 'inj20', label = 'Injektionskanuele 20G (gelb)', use = 'inject', color = '#f4d03f' },
    { id = 'inj21', label = 'Injektionskanuele 21G (gruen)', use = 'inject', color = '#3fae5a' },
    { id = 'inj22', label = 'Injektionskanuele 22G (schwarz)', use = 'inject', color = '#333333' },
    { id = 'inj23', label = 'Injektionskanuele 23G (blau)', use = 'inject', color = '#2f6fd1' },
    { id = 'inj25', label = 'Injektionskanuele 25G (orange)', use = 'inject', color = '#f0883e' },
    { id = 'inj26', label = 'Injektionskanuele 26G (braun)', use = 'inject', color = '#8b5a2b' },
    { id = 'inj27', label = 'Injektionskanuele 27G (grau)', use = 'inject', color = '#9aa0a6' },
    { id = 'safe21', label = 'Sicherheitskanuele 21G', use = 'inject', color = '#3fae5a' },
    { id = 'iv14', label = 'Venenverweilkanuele 14G (orange)', use = 'access', color = '#f0883e' },
    { id = 'iv16', label = 'Venenverweilkanuele 16G (grau)', use = 'access', color = '#9aa0a6' },
    { id = 'iv17', label = 'Venenverweilkanuele 17G (weiss)', use = 'access', color = '#f5f5f5' },
    { id = 'iv18', label = 'Venenverweilkanuele 18G (gruen)', use = 'access', color = '#3fae5a' },
    { id = 'iv20', label = 'Venenverweilkanuele 20G (rosa)', use = 'access', color = '#f19fb8' },
    { id = 'iv22', label = 'Venenverweilkanuele 22G (blau)', use = 'access', color = '#2f6fd1' },
    { id = 'iv24', label = 'Venenverweilkanuele 24G (gelb)', use = 'access', color = '#f4d03f' },
    { id = 'iv26', label = 'Venenverweilkanuele 26G (violett)', use = 'access', color = '#8e5bd1' },
    { id = 'bf21', label = 'Butterfly 21G', use = 'access', color = '#3fae5a' },
    { id = 'bf23', label = 'Butterfly 23G', use = 'access', color = '#2f6fd1' },
    { id = 'bf25', label = 'Butterfly 25G', use = 'access', color = '#f0883e' },
    { id = 'io15', label = 'i.o.-Nadel 15 mm (rosa)', use = 'access', color = '#f19fb8' },
    { id = 'io25', label = 'i.o.-Nadel 25 mm (blau)', use = 'access', color = '#2f6fd1' },
    { id = 'io45', label = 'i.o.-Nadel 45 mm (gelb)', use = 'access', color = '#f4d03f' },
    { id = 'dwh', label = 'Dreiwegehahn mit Verlaengerung', use = 'access', color = '#2f6fd1' },
}

-- 23 Loesungen und Gebindetypen (kind: amp = Glasampulle, plamp = Kunststoffampulle, vial = Durchstechflasche,
-- dry = Trockensubstanz, bag = Infusionsbeutel/-flasche; diluent = als Loesungsmittel nutzbar)
Material.Containers = {
    { id = 'glas1', label = 'Glasampulle 1 ml', kind = 'amp', ml = 1 },
    { id = 'glas2', label = 'Glasampulle 2 ml', kind = 'amp', ml = 2 },
    { id = 'glas3', label = 'Glasampulle 3 ml', kind = 'amp', ml = 3 },
    { id = 'glas4', label = 'Glasampulle 4 ml', kind = 'amp', ml = 4 },
    { id = 'glas5', label = 'Glasampulle 5 ml', kind = 'amp', ml = 5 },
    { id = 'glas10', label = 'Glasampulle 10 ml', kind = 'amp', ml = 10 },
    { id = 'glas20', label = 'Glasampulle 20 ml', kind = 'amp', ml = 20 },
    { id = 'plamp5', label = 'Kunststoffampulle 5 ml', kind = 'plamp', ml = 5 },
    { id = 'plamp10', label = 'Kunststoffampulle 10 ml', kind = 'plamp', ml = 10 },
    { id = 'vial5', label = 'Durchstechflasche 5 ml', kind = 'vial', ml = 5 },
    { id = 'vial10', label = 'Durchstechflasche 10 ml', kind = 'vial', ml = 10 },
    { id = 'vial20', label = 'Durchstechflasche 20 ml', kind = 'vial', ml = 20 },
    { id = 'vial50', label = 'Durchstechflasche 50 ml', kind = 'vial', ml = 50 },
    { id = 'dry', label = 'Trockensubstanz mit Loesungsmittel', kind = 'dry', ml = 5 },
    { id = 'nacl10', label = 'NaCl 0,9 % 10 ml (Kunststoffampulle)', kind = 'plamp', ml = 10, diluent = true, solution = 'NaCl 0,9 %' },
    { id = 'nacl20', label = 'NaCl 0,9 % 20 ml (Kunststoffampulle)', kind = 'plamp', ml = 20, diluent = true, solution = 'NaCl 0,9 %' },
    { id = 'aqua10', label = 'Aqua ad iniectabilia 10 ml', kind = 'plamp', ml = 10, diluent = true, solution = 'Aqua ad inj.' },
    { id = 'nacl100', label = 'NaCl 0,9 % 100 ml (Flasche)', kind = 'bag', ml = 100, diluent = true, solution = 'NaCl 0,9 %' },
    { id = 'nacl250', label = 'NaCl 0,9 % 250 ml', kind = 'bag', ml = 250, diluent = true, solution = 'NaCl 0,9 %' },
    { id = 'nacl500', label = 'NaCl 0,9 % 500 ml', kind = 'bag', ml = 500, diluent = true, solution = 'NaCl 0,9 %' },
    { id = 'vel500', label = 'Vollelektrolytloesung 500 ml', kind = 'bag', ml = 500, solution = 'Vollelektrolyt' },
    { id = 'g5_250', label = 'Glukose 5 % 250 ml', kind = 'bag', ml = 250, diluent = true, solution = 'Glukose 5 %' },
    { id = 'g5_500', label = 'Glukose 5 % 500 ml', kind = 'bag', ml = 500, diluent = true, solution = 'Glukose 5 %' },
}

-- Rettungsdienst-Medikamente (einzige Quelle fuer das Behandlungsmenue)
Material.Drugs = {
    { id = 'adrenalin', med = 'suprarenin', label = 'Adrenalin', unit = 'mg', conc = 1, ml = 1, container = 'glas1', dose = 1, max = 1, dilute = 10, color = 'katecholamin', glass = 'braun' },
    { id = 'noradrenalin', med = 'noradrenalin', label = 'Noradrenalin', unit = 'µg', conc = 1000, ml = 1, container = 'glas1', dose = 10, max = 50, dilute = 50, color = 'katecholamin', over = { rrsys = 50, hf = 20 }, glass = 'braun' },
    { id = 'akrinor', med = 'akrinor', label = 'Cafedrin/Theodrenalin', unit = 'mg', conc = 100, ml = 2, container = 'glas2', dose = 40, max = 200, dilute = 10, color = 'katecholamin', over = { rrsys = 40, hf = 25 } },
    { id = 'atropin', med = 'atropin', label = 'Atropin', unit = 'mg', conc = 0.5, ml = 1, container = 'glas1', dose = 0.5, max = 3, color = 'anticholinergikum', over = { hf = 40 } },
    { id = 'amiodaron', med = 'amiodaron', label = 'Amiodaron', unit = 'mg', conc = 50, ml = 3, container = 'glas3', dose = 300, max = 300, color = 'sonstige' },
    { id = 'adenosin', med = 'adenosin', label = 'Adenosin', unit = 'mg', conc = 3, ml = 2, container = 'vial5', dose = 6, max = 12, color = 'sonstige', over = { hf = -40 } },
    { id = 'metoprolol', med = 'metoprolol', label = 'Metoprolol', unit = 'mg', conc = 1, ml = 5, container = 'glas5', dose = 5, max = 15, color = 'sonstige', over = { hf = -35, rrsys = -30 } },
    { id = 'urapidil', med = 'ebrantil', label = 'Urapidil', unit = 'mg', conc = 5, ml = 10, container = 'glas10', dose = 10, max = 50, color = 'sonstige', over = { rrsys = -45 } },
    { id = 'clonidin', med = 'haemiton', label = 'Clonidin', unit = 'µg', conc = 150, ml = 1, container = 'glas1', dose = 75, max = 150, dilute = 10, color = 'sonstige', over = { rrsys = -30, hf = -20 } },
    { id = 'nitro_iv', med = 'nitro_iv', label = 'Glyceroltrinitrat i.v.', unit = 'mg', conc = 1, ml = 5, container = 'glas5', dose = 0.4, max = 1, color = 'sonstige', over = { rrsys = -40 }, glass = 'braun' },
    { id = 'furosemid', med = 'furosemid', label = 'Furosemid', unit = 'mg', conc = 10, ml = 4, container = 'glas4', dose = 40, max = 80, color = 'sonstige', glass = 'braun' },
    { id = 'ass', med = 'ass', label = 'Acetylsalicylsaeure', unit = 'mg', conc = 100, ml = 5, container = 'dry', solvent = 5, dose = 250, max = 500, color = 'gerinnung' },
    { id = 'heparin', med = 'heparin', label = 'Heparin', unit = 'IE', conc = 5000, ml = 1, container = 'vial5', dose = 5000, max = 10000, color = 'gerinnung' },
    { id = 'tranexam', med = 'tranexam', label = 'Tranexamsaeure', unit = 'mg', conc = 100, ml = 10, container = 'glas10', dose = 1000, max = 2000, color = 'gerinnung' },
    { id = 'morphin', med = 'morphin', label = 'Morphin', unit = 'mg', conc = 10, ml = 1, container = 'glas1', dose = 5, max = 10, dilute = 10, color = 'opioid', over = { af = -8, spo2Bonus = -10, gcs = -4 } },
    { id = 'fentanyl', med = 'fentanyl', label = 'Fentanyl', unit = 'µg', conc = 50, ml = 2, container = 'glas2', dose = 100, max = 200, color = 'opioid', over = { af = -10, spo2Bonus = -12, gcs = -5 } },
    { id = 'piritramid', med = 'piritramid', label = 'Piritramid', unit = 'mg', conc = 7.5, ml = 2, container = 'glas2', dose = 7.5, max = 15, dilute = 10, color = 'opioid', over = { af = -6, gcs = -3 } },
    { id = 'tramadol', med = 'tramadol', label = 'Tramadol', unit = 'mg', conc = 50, ml = 2, container = 'glas2', dose = 100, max = 100, color = 'opioid' },
    { id = 'esketamin', med = 'ketanest', label = 'Esketamin', unit = 'mg', conc = 25, ml = 2, container = 'glas2', dose = 12.5, max = 50, color = 'sedativum', over = { gcs = -6, rrsys = 20 } },
    { id = 'midazolam', med = 'midazolam', label = 'Midazolam', unit = 'mg', conc = 5, ml = 1, container = 'glas1', dose = 2.5, max = 7.5, color = 'sedativum', over = { af = -6, gcs = -6, spo2Bonus = -8 } },
    { id = 'diazepam', med = 'diazepam', label = 'Diazepam', unit = 'mg', conc = 5, ml = 2, container = 'glas2', dose = 10, max = 20, color = 'sedativum', over = { af = -5, gcs = -5 } },
    { id = 'lorazepam', med = 'lorazepam', label = 'Lorazepam', unit = 'mg', conc = 2, ml = 1, container = 'glas1', dose = 2, max = 4, color = 'sedativum', over = { gcs = -5 } },
    { id = 'propofol', med = 'propofol', label = 'Propofol 1 %', unit = 'mg', conc = 10, ml = 20, container = 'glas20', dose = 100, max = 200, color = 'sedativum', over = { gcs = -10, af = -10, rrsys = -40 } },
    { id = 'etomidat', med = 'etomidat', label = 'Etomidat', unit = 'mg', conc = 2, ml = 10, container = 'glas10', dose = 20, max = 30, color = 'sedativum', over = { gcs = -10, af = -8 } },
    { id = 'naloxon', med = 'naloxon', label = 'Naloxon', unit = 'mg', conc = 0.4, ml = 1, container = 'glas1', dose = 0.4, max = 2, dilute = 10, color = 'antagonist' },
    { id = 'butylscopolamin', med = 'buscopan', label = 'Butylscopolamin', unit = 'mg', conc = 20, ml = 1, container = 'glas1', dose = 20, max = 40, color = 'anticholinergikum' },
    { id = 'metamizol', med = 'novalgin', label = 'Metamizol', unit = 'mg', conc = 500, ml = 2, container = 'glas2', dose = 1000, max = 2500, color = 'sonstige', over = { rrsys = -25 } },
    { id = 'dimetinden', med = 'fenistil', label = 'Dimetinden', unit = 'mg', conc = 1, ml = 4, container = 'glas4', dose = 4, max = 8, color = 'sonstige' },
    { id = 'clemastin', med = 'clemastin', label = 'Clemastin', unit = 'mg', conc = 1, ml = 2, container = 'glas2', dose = 2, max = 4, color = 'sonstige' },
    { id = 'prednisolon', med = 'prednisolon', label = 'Prednisolon', unit = 'mg', conc = 50, ml = 5, container = 'dry', solvent = 5, dose = 250, max = 1000, color = 'sonstige' },
    { id = 'reproterol', med = 'reproterol', label = 'Reproterol', unit = 'mg', conc = 0.09, ml = 1, container = 'glas1', dose = 0.09, max = 0.18, dilute = 10, color = 'sonstige', over = { hf = 35 } },
    { id = 'magnesium', med = 'magnesium', label = 'Magnesiumsulfat 10 %', unit = 'mg', conc = 100, ml = 10, container = 'glas10', dose = 2000, max = 4000, color = 'sonstige', over = { rrsys = -30, af = -6 } },
    { id = 'calcium', med = 'calcium', label = 'Calciumgluconat 10 %', unit = 'mg', conc = 100, ml = 10, container = 'glas10', dose = 1000, max = 3000, color = 'sonstige' },
    { id = 'g20', med = 'g20', label = 'Glukose 20 %', unit = 'g', conc = 0.2, ml = 10, container = 'plamp10', dose = 2, max = 10, color = 'sonstige' },
    { id = 'g40', med = 'g40', label = 'Glukose 40 %', unit = 'g', conc = 0.4, ml = 10, container = 'glas10', dose = 8, max = 16, color = 'sonstige' },
    { id = 'glucagon', med = 'glucagon', label = 'Glucagon', unit = 'mg', conc = 1, ml = 1, container = 'dry', solvent = 1, dose = 1, max = 1, color = 'sonstige', route = 'im' },
    { id = 'thiamin', med = 'thiamin', label = 'Thiamin (Vitamin B1)', unit = 'mg', conc = 50, ml = 2, container = 'glas2', dose = 100, max = 100, color = 'sonstige' },
    { id = 'ondansetron', med = 'ondansetron', label = 'Ondansetron', unit = 'mg', conc = 2, ml = 2, container = 'glas2', dose = 4, max = 8, color = 'antiemetikum' },
    { id = 'dimenhydrinat', med = 'dimenhydrinat', label = 'Dimenhydrinat', unit = 'mg', conc = 6.2, ml = 10, container = 'glas10', dose = 62, max = 124, color = 'antiemetikum' },
    { id = 'lidocain', med = 'lidocain', label = 'Lidocain 2 %', unit = 'mg', conc = 20, ml = 5, container = 'glas5', dose = 40, max = 100, color = 'lokal', over = { hf = -30, gcs = -4 } },
    -- nicht aufziehbar (form): werden im Behandlungsmenue direkt gegeben, stehen aber im Schrank
    { id = 'atrovent', med = 'atrovent', label = 'Ipratropiumbromid (Atrovent)', form = 'inhal', unit = 'mg', conc = 0.125, ml = 2, container = 'plamp5', dose = 0.5, max = 0.5, color = 'anticholinergikum' },
    { id = 'salbutamol', med = 'salbutamol', label = 'Salbutamol', form = 'inhal', unit = 'mg', conc = 1.25, ml = 2, container = 'plamp5', dose = 2.5, max = 5, color = 'sonstige' },
    { id = 'nitro', med = 'nitro', label = 'Nitro-Spray', form = 'spray', unit = 'mg', conc = 0.4, ml = 1, container = 'vial10', dose = 0.4, max = 0.8, color = 'sonstige' },
    { id = 'paracetamol', med = 'paracetamol', label = 'Paracetamol 1 g', form = 'infusion', unit = 'mg', conc = 10, ml = 100, container = 'nacl100', dose = 1000, max = 1000, color = 'sonstige' },
    { id = 'oxytocin', med = 'oxytocin', label = 'Oxytocin', unit = 'IE', conc = 3, ml = 1, container = 'glas1', dose = 3, max = 6, color = 'sonstige' },
    { id = 'g5', med = 'g5', label = 'Glukose 5 % (Infusion)', form = 'infusion', unit = 'g', conc = 0.05, ml = 500, container = 'g5_500', dose = 25, max = 25, color = 'sonstige' },
    { id = 'jonosteril', med = 'jonosteril', label = 'Vollelektrolyt (Jonosteril)', form = 'infusion', unit = 'ml', conc = 1, ml = 500, container = 'vel500', dose = 500, max = 1000, color = 'sonstige' },
}

-- Aufgezogen werden muessen alle Medikamente aus dem Behandlungsmenue, die hier ueber "med" verknuepft sind.
-- Infusionen, Sprays und Vernebler (ohne Verknuepfung) werden ohne Aufziehen gegeben.

Material.DrugById = {}
for _, d in ipairs(Material.Drugs) do Material.DrugById[d.id] = d end
Material.DrugByMed = {}
for _, d in ipairs(Material.Drugs) do if d.med then Material.DrugByMed[d.med] = d end end
Material.SyringeById = {}
for _, s in ipairs(Material.Syringes) do Material.SyringeById[s.id] = s end
Material.NeedleById = {}
for _, n in ipairs(Material.Needles) do Material.NeedleById[n.id] = n end
Material.ContainerById = {}
for _, c in ipairs(Material.Containers) do Material.ContainerById[c.id] = c end

-- aufziehbar = Spritze vorbereiten (Ampulle, Durchstechflasche, Trockensubstanz)
function Material.isDrawable(d) return d ~= nil and d.form == nil end
