EC = EC or {}

EC.SCHEMA_VERSION = 1
EC.RESOURCE = GetCurrentResourceName()

-- Elementarten im Szenario
EC.Kinds = {
    vehicle = { label = 'Fahrzeug', entity = true },
    object = { label = 'Objekt', entity = true },
    ped = { label = 'NPC / Patient', entity = true },
    fire = { label = 'Feuer', entity = false },
    smoke = { label = 'Rauch', entity = false },
    marker = { label = 'Position / Fundstelle', entity = false },
    area = { label = 'Einsatzgebiet', entity = false },
    door = { label = 'Tuer', entity = false },
    spill = { label = 'Betriebsstoff', entity = false },
}

-- Status eines Szenarios (gespeicherter Entwurf)
EC.ScenarioStatus = {
    draft = 'Entwurf',
    saved = 'Gespeichert',
}

-- Status eines Einsatzes (Laufzeit)
EC.Status = {
    creating = 'wird_erstellt',
    active = 'aktiv',
    ended = 'beendet',
    cancelled = 'abgebrochen',
    failed = 'fehlerhaft',
}

EC.StatusLabels = {
    wird_erstellt = 'Wird erstellt',
    aktiv = 'Aktiv',
    beendet = 'Beendet',
    abgebrochen = 'Abgebrochen',
    fehlerhaft = 'Fehlerhaft',
}

-- Einsatzphasen fuer die Leitstelle (frei setzbar, unabhaengig vom Lebenszyklus)
EC.Phases = {
    'alarmiert', 'anfahrt', 'vor_ort', 'lage_unter_kontrolle', 'nachalarmierung', 'abschluss',
}

EC.Modes = { test = 'Test', live = 'Live' }

-- Patientenstatus
EC.PatientStatus = {
    eingeklemmt = 'Eingeklemmt',
    unversorgt = 'Unversorgt',
    gesichtet = 'Gesichtet',
    in_behandlung = 'In Behandlung',
    stabil = 'Versorgt / transportbereit',
    auf_trage = 'Auf der Trage',
    im_fahrzeug = 'Im Rettungsmittel',
    uebergeben = 'In Klinik uebergeben',
    vor_ort_entlassen = 'Vor Ort entlassen',
}

-- Erlaubte Fahrzeugtypen fuer CreateVehicleServerSetter
EC.VehicleTypes = {
    automobile = true, bike = true, boat = true, heli = true, plane = true,
    submarine = true, trailer = true, train = true,
}

-- Netzwerk-Events (zentral, damit Tippfehler auffallen)
EC.Events = {
    request = 'einsatzcreator:server:request',
    response = 'einsatzcreator:client:response',
    openEditor = 'einsatzcreator:client:openEditor',
    forceClose = 'einsatzcreator:client:forceClose',
    activeList = 'einsatzcreator:client:activeList',
    incidentSync = 'einsatzcreator:client:incidentSync',
    incidentRemoved = 'einsatzcreator:client:incidentRemoved',
    alarm = 'einsatzcreator:client:alarm',
    notify = 'einsatzcreator:client:notify',
    fireState = 'einsatzcreator:client:fireState',
    fireRemove = 'einsatzcreator:client:fireRemove',
    fireHits = 'einsatzcreator:server:fireHits',
    rescueState = 'einsatzcreator:client:rescueState',
}
