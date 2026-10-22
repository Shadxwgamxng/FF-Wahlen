import type { ScenarioDef } from '../scenarios';
import { oneOf, range, need } from '../scenarioHelpers';

/**
 * Rettungsdienstszenarien, die nur im Katalog Schleswig-Holstein vorkommen.
 * Stichwort = SH-Code, Meldebild = exakte Bezeichnung aus SH_MELDEBILDER.
 * Schwerpunkte: Sonderstichwörter (Inkubator, Schwerlast, First Responder, Sonderschutz),
 * Notfallverlegungen ab Klinik, Ostseeküste, Inseln und Halligen, Autobahn A1, Großveranstaltungen.
 */
export const SH_SCENARIOS_RD: ScenarioDef[] = [
  // ------------------------------------------------------------------ INKUBATOR
  {
    id: 'sh_inkubator_fruehchen', name: 'Inkubatortransport Frühgeborenes', category: 'rd', catalogs: ['sh'],
    keyword: 'NOTF INKUB', sh: { keyword: 'NOTF INKUB', meldebild: 'Inkubatortransport' },
    weight: 0.25, location: 'klinik',
    openings: [
      'Kreißsaal der Kreisklinik hier, wir haben gerade ein Frühchen entbunden und brauchen sofort einen Inkubatortransport in die Kinderklinik.',
      'Hier ist die Geburtshilfe, ein Neugeborenes muss dringend ins Perinatalzentrum verlegt werden, mit Transportinkubator bitte.',
    ],
    facts: {
      what: 'Frühgeborenes muss im Transportinkubator in ein Perinatalzentrum verlegt werden.',
      age: oneOf('Frühgeborenes aus der 31. Schwangerschaftswoche, eine Stunde alt.', 'Neugeborenes aus der 34. Woche, vor 40 Minuten geboren.', 'Frühchen aus der 29. Woche, gerade erst abgenabelt.'),
      conscious: true,
      breathing: oneOf('schwer', 'schwer', 'normal'),
      symptoms: oneOf('Atemnotsyndrom, braucht Sauerstoff und Atemhilfe über die Nase.', 'Anpassungsstörung, die Sättigung fällt immer wieder ab.', 'Untergewichtig, unter 1500 Gramm, aktuell stabil im Wärmebett.'),
      history: 'Vorzeitige Wehen, Mutter bleibt hier bei uns auf Station.',
      target: 'Von der Geburtshilfe der Kreisklinik in die Neonatologie des Perinatalzentrums.',
    },
    keyQuestions: ['rd_alter', 'rd_atmung', 'rd_beschwerden'], workMin: [50, 90],
    patients: { count: [1, 1], doctorProb: 1, departments: ['paediatrie', 'intensiv'] },
    escalation: { prob: 0.1, needs: [need('rth', 1)], text: 'Zustand des Frühgeborenen verschlechtert sich, Verlegung per Hubschrauber mit Inkubator wird gewünscht.' },
  },
  // ------------------------------------------------------------------ SCHWERLAST
  {
    id: 'sh_adipositas_notfall', name: 'Notfall bei schwergewichtigem Patienten', category: 'rd', catalogs: ['sh'],
    keyword: 'NOTF ADIP', sh: { keyword: 'NOTF ADIP' },
    weight: 0.6, location: 'wohn',
    openings: [
      'Mein Mann bekommt kaum noch Luft, er wiegt über 190 Kilo, der kommt alleine nicht hoch!',
      'Meine Mutter ist aus dem Sessel gerutscht und liegt am Boden, sie ist sehr schwer, wir schaffen das nicht.',
      'Mein Bruder hat Fieber und ist ganz verwirrt, er wiegt bestimmt 200 Kilo.',
    ],
    facts: {
      what: 'Akute Erkrankung bei einem stark übergewichtigen Patienten.',
      age: range(35, 70),
      conscious: true,
      breathing: oneOf('schwer', 'normal'),
      symptoms: oneOf('Luftnot im Liegen, Beine stark geschwollen.', 'Liegt seit Stunden am Boden, Schmerzen in der Hüfte.', 'Hohes Fieber, gerötetes und überwärmtes Bein.'),
      history: oneOf('Diabetes und Herzschwäche.', 'Schlafapnoe, nachts mit Maske.', 'Bluthochdruck, Wassertabletten.'),
      weight: oneOf('Etwa 190 Kilo.', 'Um die 200 Kilo.', 'Zuletzt waren es 210 Kilo.'),
      floor: oneOf('Erdgeschoss.', 'Hochparterre, ein paar Stufen.', '1. Stock, schmales Treppenhaus.'),
    },
    keyQuestions: ['rd_beschwerden', 'rd_atmung', 'rd_vorerkrankung'], workMin: [45, 80],
    patients: { count: [1, 1], doctorProb: 0.3, departments: ['innere'] },
    escalation: { prob: 0.25, needs: [need('loeschen', 1)], text: 'Patient lässt sich nicht über das Treppenhaus tragen, Tragehilfe durch die Feuerwehr nachgefordert.' },
    variants: [
      {
        label: 'Über 230 kg, Obergeschoss', weight: 0.4, keyword: 'NOTF ADIP G', sh: { keyword: 'NOTF ADIP G' },
        openings: ['Mein Lebensgefährte wiegt fast 250 Kilo und hat starke Brustschmerzen, wir wohnen im zweiten Stock ohne Fahrstuhl!'],
        facts: {
          symptoms: 'Druck auf der Brust, kaltschweißig, kann nicht aufstehen.',
          weight: 'Fast 250 Kilo.',
          floor: '2. Obergeschoss, enges Treppenhaus, kein Aufzug.',
        },
        patients: { count: [1, 1], doctorProb: 0.8, departments: ['kardiologie', 'innere'] },
        workMin: [70, 120],
        escalation: { prob: 0.3, needs: [need('hoehenrettung', 1)], text: 'Rettung über das Treppenhaus nicht möglich, Drehleiter mit Schwerlasttrage nachgefordert.' },
      },
    ],
  },
  // ------------------------------------------------------------------ FIRST RESPONDER
  {
    id: 'sh_first_responder_dorf', name: 'Notfall im Dorf mit First Responder', category: 'rd', catalogs: ['sh'],
    keyword: 'NOTF 01 First', sh: { keyword: 'NOTF 01 First', meldebild: 'Betriebs-/Arbeitsunfall' },
    weight: 0.8, location: 'land',
    openings: [
      'Mein Vater ist auf dem Hof vom Heuboden gerutscht, er liegt in der Scheune und hält sich das Bein!',
      'Hier ist ein Landwirt, mein Mitarbeiter hat sich an der Maschine die Hand aufgerissen, es blutet ordentlich.',
    ],
    facts: {
      what: 'Unfall auf einem landwirtschaftlichen Betrieb weit außerhalb, der nächste Rettungswagen braucht lange.',
      age: range(25, 75),
      conscious: true,
      breathing: 'normal',
      symptoms: oneOf('Schmerzen im Unterschenkel, Fuß steht schief.', 'Tiefe Wunde an der Hand, Blutung mit einem Tuch abgedrückt.', 'Rückenschmerzen nach Sturz vom Anhänger, kann die Beine bewegen.'),
      history: 'Nichts Besonderes.',
    },
    keyQuestions: ['rd_bewusst', 'rd_beschwerden'], workMin: [35, 60], time: { day: 1.5, night: 0.5 },
    patients: { count: [1, 1], doctorProb: 0.1, departments: ['unfallchirurgie'], noTransportProb: 0.1 },
    escalation: { prob: 0.1, needs: [need('notarzt', 1)], text: 'Ersthelfer melden starke Schmerzen und Kreislaufprobleme, Notarzt nachgefordert.' },
    variants: [
      {
        label: 'Leblose Person auf dem Land', weight: 0.5, keyword: 'NOTF 11 First', sh: { keyword: 'NOTF 11 First', meldebild: 'Reanimation' },
        openings: ['Mein Mann ist beim Melken umgefallen und atmet nicht mehr, wir wohnen ganz draußen auf dem Hof!'],
        facts: {
          what: 'Leblose Person auf einem abgelegenen Hof.',
          age: range(50, 80),
          conscious: false,
          breathing: 'nein',
          symptoms: 'Reagiert nicht, atmet nicht, Gesicht ganz blau.',
          history: oneOf('Herzkrank, hatte zwei Stents.', 'Nichts bekannt.'),
        },
        patients: { count: [1, 1], doctorProb: 1, departments: ['kardiologie', 'intensiv'], noTransportProb: 0.35 },
        workMin: [45, 75],
        escalation: { prob: 0.3, needs: [need('rth', 1)], text: 'Rettungswagen und Notarzt mit langer Anfahrt, Hubschrauber zusätzlich angefordert.' },
      },
    ],
  },
  // ------------------------------------------------------------------ OSTSEE
  {
    id: 'sh_ostsee_badeunfall', name: 'Badeunfall an der Ostsee', category: 'rd', catalogs: ['sh'],
    keyword: 'NOTF 01', sh: { keyword: 'NOTF 01', meldebild: 'Badeunfall' },
    weight: 0.6, location: 'wasser',
    openings: [
      'Am Strand haben wir einen älteren Mann aus dem Wasser gezogen, der ist ganz blass und hustet!',
      'Hier ist die Badeaufsicht vom Strandabschnitt, eine Frau ist von der Seebrücke gesprungen und hat sich verletzt.',
      'Mein Sohn ist in der Ostsee in eine Strömung geraten, wir haben ihn rausgeholt, er zittert ganz stark.',
    ],
    facts: {
      what: 'Badeunfall am Ostseestrand, Person ist bereits an Land.',
      age: range(8, 75),
      conscious: true,
      breathing: oneOf('normal', 'normal', 'schwer'),
      symptoms: oneOf('Hat Wasser geschluckt, hustet und ist erschöpft.', 'Kopfsprung ins flache Wasser, Nackenschmerzen.', 'Unterkühlt nach langem Schwimmen, zittert stark.'),
      history: oneOf('Keine.', 'Herzprobleme, nimmt Tabletten.'),
      water: oneOf('Ostseestrand, Höhe der Seebrücke.', 'Hundestrand am Ortsende, an der Buhne.', 'Naturstrand an der Steilküste.'),
    },
    keyQuestions: ['rd_bewusst', 'rd_atmung', 'rd_beschwerden'], workMin: [25, 45],
    weather: { hitze: 8, klar: 3, bewoelkt: 0.8, regen: 0.1, gewitter: 0.2, schnee: 0, nebel: 0.3 }, time: { day: 2, night: 0.2 },
    patients: { count: [1, 1], doctorProb: 0.3, departments: ['innere', 'unfallchirurgie'], noTransportProb: 0.15 },
    escalation: { prob: 0.15, needs: [need('notarzt', 1)], text: 'Patient trübt ein und atmet schlechter, Notarzt nachgefordert.' },
    variants: [
      {
        label: 'Ertrinkungsunfall', weight: 0.3, keyword: 'NOTF 11', sh: { keyword: 'NOTF 11', meldebild: 'Ertrinken' },
        openings: ['Wir haben ein Kind leblos aus der Ostsee gezogen, die Rettungsschwimmer machen schon Wiederbelebung!'],
        facts: { age: range(4, 14), conscious: false, breathing: 'nein', symptoms: 'War unter Wasser, keine Atmung, die Rettungsschwimmer drücken.' },
        patients: { count: [1, 1], doctorProb: 1, departments: ['paediatrie', 'intensiv'] },
        workMin: [40, 70],
        escalation: { prob: 0.5, needs: [need('rth', 1)], text: 'Kinderreanimation am Strand, Rettungshubschrauber angefordert.' },
      },
      {
        label: 'Tauchunfall', weight: 0.25, keyword: 'NOTF 11', sh: { keyword: 'NOTF 11', meldebild: 'Tauchunfall' },
        openings: ['Hier ist ein Tauchboot vor der Küste, wir laufen gerade in den Hafen ein, ein Taucher ist zu schnell aufgestiegen und hat Lähmungen im Bein!'],
        facts: {
          what: 'Tauchunfall, Verdacht auf Dekompressionskrankheit.',
          age: range(25, 60),
          symptoms: 'Kribbeln und Schwäche im Bein, Gelenkschmerzen, Hautflecken. Bekommt Sauerstoff aus der Bordflasche.',
          history: 'Zwei Tauchgänge heute am Wrack, letzter auf 28 Metern.',
          water: 'Kommt mit dem Boot in den Sportboothafen, Liegeplatz an der Tankstelle.',
        },
        patients: { count: [1, 1], doctorProb: 1, departments: ['intensiv'] },
        workMin: [40, 70],
        escalation: { prob: 0.5, needs: [need('rth', 1)], text: 'Druckkammerbehandlung erforderlich, Transport per Hubschrauber in die Druckkammer.' },
      },
    ],
  },
  // ------------------------------------------------------------------ AUTOBAHN
  {
    id: 'sh_bab_a1_notfall', name: 'Notfall auf der Autobahn A1', category: 'vu', catalogs: ['sh'],
    keyword: 'NOTF BAB 11', sh: { keyword: 'NOTF BAB 11', meldebild: 'Verkehrsunfall, Hochgeschwindigkeit' },
    weight: 0.8, location: 'strasse',
    openings: [
      'Auf der A1 Richtung Lübeck hat sich ein Auto mehrmals gedreht und steht jetzt am Mittelstreifen, der Fahrer blutet am Kopf!',
      'Ich stehe auf dem Standstreifen der A1, vor mir ist ein Kleintransporter in die Leitplanke gefahren!',
    ],
    facts: {
      what: 'Unfall mit hoher Geschwindigkeit auf der Autobahn.',
      vehicles: oneOf('Ein PKW, gegen die Mittelleitplanke.', 'Ein Kleintransporter, in die Außenschutzplanke.', 'Zwei PKW, einer ist aufgefahren.'),
      trapped: false,
      injured: range(1, 2),
      leak: oneOf('Kühlwasser läuft aus.', 'Nein, aber Trümmerteile liegen auf allen Spuren.', 'Es dampft aus dem Motorraum.'),
      road: oneOf('A1 Richtung Lübeck, kurz hinter der Anschlussstelle.', 'A1 Richtung Hamburg, Höhe Rastplatz.', 'A1 Richtung Heiligenhafen, im Baustellenbereich.'),
    },
    keyQuestions: ['verletzt', 'vu_strasse', 'vu_eingeklemmt'], workMin: [40, 70],
    weather: { regen: 1.6, nebel: 2, schnee: 2 }, time: { day: 1.3 },
    patients: { count: 'injured', doctorProb: 0.6, departments: ['unfallchirurgie'] },
    escalation: { prob: 0.2, needs: [need('th', 1), need('polizei', 1)], text: 'Fahrbahn voller Trümmer und Betriebsstoffe, Feuerwehr zur Absicherung und weitere Polizei nachgefordert.' },
    variants: [
      {
        label: 'Auffahrunfall am Stauende, mehrere Verletzte', weight: 0.25, keyword: 'NOTF BAB R5', sh: { keyword: 'NOTF BAB R5', meldebild: 'Verkehrsunfall, viele Verletzte' },
        openings: ['Auf der A1 am Stauende sind mehrere Autos ineinandergekracht, hier laufen überall Verletzte rum!'],
        facts: {
          what: 'Auffahrunfall am Stauende mit mehreren Fahrzeugen.',
          vehicles: 'Vier PKW und ein Kleinbus.',
          injured: range(3, 6),
          leak: 'Benzin und Öl laufen aus.',
        },
        patients: { count: 'injured', doctorProb: 0.3, departments: ['unfallchirurgie', 'innere'], noTransportProb: 0.25 },
        workMin: [70, 120],
        escalation: { prob: 0.3, needs: [need('rtw', 2), need('th_schwer', 1)], text: 'Eine Person doch eingeklemmt und weitere Verletzte im Kleinbus, zusätzliche RTW und Rüstwagen.', extraPatients: 2 },
      },
    ],
  },
  // ------------------------------------------------------------------ MANV
  {
    id: 'sh_manv_festival', name: 'Viele Verletzte auf einem Open-Air-Festival', category: 'rd', catalogs: ['sh'],
    keyword: 'NOTF R10', sh: { keyword: 'NOTF R10' },
    weight: 0.08, location: 'oeffentlich',
    openings: [
      'Hier ist die Sanitätsleitung vom Festival, vor der Hauptbühne hat es ein Gedränge gegeben, wir haben bestimmt acht Verletzte!',
      'Auf dem Festivalgelände ist bei dem Sturm ein Zelt umgeweht, da liegen mehrere Leute drunter!',
    ],
    facts: {
      what: 'Mehrere Verletzte auf einem Open-Air-Festival.',
      age: 'Überwiegend junge Erwachsene.',
      conscious: true,
      breathing: 'normal',
      symptoms: oneOf('Quetschungen, Prellungen und Atemnot, einige sind kreislaufschwach.', 'Kopfplatzwunden und Knochenbrüche, mehrere klagen über Brustschmerzen.', 'Viele Prellungen und Schnittwunden, zwei sind zwischendurch kollabiert.'),
      injured: range(7, 10),
    },
    keyQuestions: ['rd_beschwerden', 'rd_bewusst'], workMin: [90, 160],
    weather: { hitze: 3, gewitter: 3, klar: 1.5, schnee: 0 }, time: { day: 0.8, night: 2 },
    patients: { count: 'injured', doctorProb: 0.25, departments: ['unfallchirurgie', 'innere'], noTransportProb: 0.35 },
    escalation: { prob: 0.3, needs: [need('rtw', 3), need('san_gross', 1), need('rd_fuehrung', 1)], text: 'Weitere Verletzte melden sich an den Sanitätsposten, Stufe erhöht.', extraPatients: 4 },
  },
  // ------------------------------------------------------------------ INFEKTION
  {
    id: 'sh_infekt_atemnot', name: 'Atemnot mit Infektionsverdacht', category: 'rd', catalogs: ['sh'],
    keyword: 'NOTF 01 COVID', sh: { keyword: 'NOTF 01 COVID', meldebild: 'Atemnot, allgemein' },
    weight: 1.2, location: 'wohn',
    openings: [
      'Meine Frau hat seit Tagen Fieber und jetzt bekommt sie schlecht Luft, ihr Schnelltest war positiv.',
      'Ich bin seit einer Woche krank, huste ständig und mir geht jetzt richtig die Puste aus.',
    ],
    facts: {
      what: 'Fieberhafter Atemwegsinfekt mit zunehmender Luftnot.',
      age: range(40, 88),
      conscious: true,
      breathing: oneOf('schwer', 'normal'),
      symptoms: 'Fieber, trockener Husten, Luftnot beim Gehen, kein Geschmack mehr.',
      history: oneOf('Positiver Schnelltest von vorgestern.', 'Enkel war letzte Woche krank, Test positiv.', 'Ungeimpft, Lungenerkrankung bekannt.'),
    },
    keyQuestions: ['rd_atmung', 'rd_vorerkrankung'], workMin: [35, 55], weather: { regen: 1.3, schnee: 1.5, hitze: 0.5 },
    patients: { count: [1, 1], doctorProb: 0.3, departments: ['innere'], noTransportProb: 0.15 },
    variants: [
      {
        label: 'Schwere Luftnot', weight: 0.35, keyword: 'NOTF 11 COVID', sh: { keyword: 'NOTF 11 COVID', meldebild: 'Atemnot, akut' },
        facts: { breathing: 'schwer', symptoms: 'Kann kaum sprechen, Lippen bläulich, Sättigungsgerät zeigt 82.' },
        patients: { count: [1, 1], doctorProb: 1, departments: ['intensiv', 'innere'] },
      },
    ],
  },
  {
    id: 'sh_hochinfektioes_reise', name: 'Verdacht auf hochinfektiöse Erkrankung', category: 'rd', catalogs: ['sh'],
    keyword: 'NOTF 11 X', sh: { keyword: 'NOTF 11 X' },
    weight: 0.05, location: 'wohn',
    openings: [
      'Mein Mann ist vor fünf Tagen aus Westafrika zurückgekommen und hat jetzt hohes Fieber und blutet aus dem Zahnfleisch.',
      'Hier ist der Hausarzt, ich habe einen Reiserückkehrer mit hohem Fieber und Blutungszeichen, Verdacht auf hämorrhagisches Fieber.',
    ],
    facts: {
      what: 'Verdacht auf eine hochansteckende Infektionskrankheit nach Auslandsaufenthalt.',
      age: range(25, 60),
      conscious: true,
      breathing: 'normal',
      symptoms: oneOf('Fieber über 40 Grad, Durchfall, Blutungen am Zahnfleisch.', 'Hohes Fieber, Erbrechen mit Blut, sehr schwach.'),
      history: 'Arbeitete in einem Ausbruchsgebiet, Rückkehr vor wenigen Tagen.',
    },
    keyQuestions: ['rd_beschwerden', 'rd_vorerkrankung'], workMin: [90, 150],
    patients: { count: [1, 1], doctorProb: 1, departments: ['intensiv'] },
    escalation: { prob: 0.4, needs: [need('gefahrgut', 1), need('rd_fuehrung', 1)], text: 'Verdacht erhärtet sich, Dekontaminationseinheit und Leitender Notarzt angefordert.' },
    variants: [
      {
        label: 'Kreislaufstabil, nur RTW', weight: 0.4, keyword: 'NOTF 01 X', sh: { keyword: 'NOTF 01 X' },
        openings: ['Ich bin vor einer Woche aus einem Ausbruchsgebiet in Westafrika zurückgekommen und habe seit heute Fieber und Gliederschmerzen, das Gesundheitsamt sagt, ich soll anrufen.'],
        facts: { symptoms: 'Fieber und Gliederschmerzen, bisher keine Blutungen, steht noch selbst auf.' },
        patients: { count: [1, 1], doctorProb: 0.2, departments: ['intensiv', 'innere'] },
      },
    ],
  },
  // ------------------------------------------------------------------ NOTFALLVERLEGUNGEN
  {
    id: 'sh_verl_itw_beatmet', name: 'Intensivverlegung mit ITW', category: 'ktp', catalogs: ['sh'],
    keyword: 'NOTF VERL ITW', sh: { keyword: 'NOTF VERL ITW', meldebild: 'Notfallverlegung ITW – dringend' },
    weight: 0.35, location: 'klinik',
    openings: [
      'Intensivstation Kreisklinik, wir haben eine beatmete Patientin mit Sepsis, die muss heute noch ins Universitätsklinikum.',
      'Hier ist die Intensiv, unser Patient braucht eine Dialyse am Bett, die wir nicht haben, bitte einen ITW.',
    ],
    facts: {
      what: 'Verlegung eines intensivpflichtigen Patienten in ein Zentrum.',
      target: oneOf('Von der Kreisklinik ins Universitätsklinikum.', 'Von der Inselklinik über die Fähre ins Schwerpunktkrankenhaus.', 'Von der Intensivstation ins Zentrum für Lungenheilkunde.'),
      mobility: 'Liegend, im Intensivbett.',
      infection: oneOf(false, false, true),
      pathogen: '4MRGN im Trachealsekret.',
      when: 'Dringend, in den nächsten zwei Stunden.',
      intensive: true,
    },
    keyQuestions: ['ktp_intensiv', 'ktp_ziel', 'ktp_zeit'], workMin: [60, 120], time: { day: 1.4, night: 0.7 },
    patients: { count: [1, 1], doctorProb: 0, departments: ['intensiv'] },
    variants: [
      {
        label: 'Sofort, unter 30 Minuten', weight: 0.3, sh: { keyword: 'NOTF VERL ITW', meldebild: 'Notfallverlegung ITW – sofort' },
        facts: { when: 'Sofort, der Patient wird immer instabiler.' },
      },
      {
        label: 'ECMO-Patient', weight: 0.15, keyword: 'NOTF VERL ECMO', sh: { keyword: 'NOTF VERL ECMO' },
        openings: ['Hier ist die Intensivstation, wir haben einen Patienten an der ECMO, der muss ins Herzzentrum verlegt werden, das ECMO-Team kommt mit.'],
        facts: {
          what: 'Verlegung eines Patienten an der extrakorporalen Lungenunterstützung (ECMO).',
          target: 'Von der Intensivstation des Schwerpunktkrankenhauses ins Herzzentrum.',
          mobility: 'Liegend, mit ECMO-Gerät und Kardiotechniker.',
          when: 'Sofort, das Zentrum hat zugesagt.',
        },
        workMin: [90, 150],
      },
    ],
  },
  {
    id: 'sh_verl_rth_insel', name: 'Notfallverlegung per Hubschrauber von der Insel', category: 'ktp', catalogs: ['sh'],
    keyword: 'NOTF VERL RTH', sh: { keyword: 'NOTF VERL RTH', meldebild: 'Notfallverlegung RTH – sofort' },
    weight: 0.3, location: 'klinik',
    openings: [
      'Hier ist die Notaufnahme der Inselklinik, wir haben einen Herzinfarkt, der muss sofort ins Herzkatheterlabor aufs Festland, die nächste Fähre ist zu spät.',
      'Inselklinik hier, wir haben eine Hirnblutung im CT, wir brauchen den Hubschrauber für die Neurochirurgie.',
    ],
    facts: {
      what: 'Zeitkritische Verlegung von einer Inselklinik auf das Festland.',
      target: 'Von der Inselklinik ins Universitätsklinikum auf dem Festland, die Fachabteilung dort ist informiert.',
      mobility: 'Liegend.',
      infection: false,
      when: 'Sofort, die Fähre fährt erst in zwei Stunden.',
      intensive: oneOf(false, true),
    },
    keyQuestions: ['ktp_ziel', 'ktp_zeit', 'ktp_intensiv'], workMin: [50, 90],
    weather: { nebel: 0.4, gewitter: 0.4 },
    patients: { count: [1, 1], doctorProb: 0, departments: ['kardiologie', 'neurologie'] },
    variants: [
      {
        label: 'Dringend, unter 2 Stunden', weight: 0.4, sh: { keyword: 'NOTF VERL RTH', meldebild: 'Notfallverlegung RTH – dringend' },
        openings: ['Inselklinik hier, wir haben ein Kind mit Blinddarmdurchbruch, das muss in die Kinderchirurgie aufs Festland, die Fähre fährt heute nicht mehr.'],
        facts: { what: 'Dringende Verlegung eines Kindes von der Inselklinik auf das Festland.', when: 'Dringend, in der nächsten Stunde.', target: 'Von der Inselklinik in die Kinderklinik auf dem Festland.', intensive: false },
        patients: { count: [1, 1], doctorProb: 0, departments: ['paediatrie'] },
      },
    ],
  },
  {
    id: 'sh_verl_11_herzkatheter', name: 'Notfallverlegung mit Notarzt', category: 'ktp', catalogs: ['sh'],
    keyword: 'NOTF VERL 11', sh: { keyword: 'NOTF VERL 11', meldebild: 'Notfallverlegung RTW / NEF – sofort' },
    weight: 0.6, location: 'klinik',
    openings: [
      'Notaufnahme der Kreisklinik, wir haben einen frischen Hinterwandinfarkt, der muss sofort ins Katheterlabor nach Kiel.',
      'Hier ist die Ambulanz vom kleinen Krankenhaus, wir haben einen Patienten mit Aortendissektion, der muss sofort in die Gefäßchirurgie.',
    ],
    facts: {
      what: 'Zeitkritische Verlegung eines Notfallpatienten mit ärztlicher Begleitung.',
      target: 'Von der Notaufnahme der Kreisklinik ins Universitätsklinikum, das Team dort steht bereit.',
      mobility: 'Liegend.',
      infection: false,
      when: 'Sofort.',
      intensive: false,
    },
    keyQuestions: ['ktp_ziel', 'ktp_zeit', 'ktp_intensiv'], workMin: [45, 80],
    patients: { count: [1, 1], doctorProb: 0, departments: ['kardiologie', 'neurologie'] },
    variants: [
      {
        label: 'Verlegungsarzt, dringend', weight: 0.6, keyword: 'NOTF VERL VEF', sh: { keyword: 'NOTF VERL VEF', meldebild: 'Notfallverlegung VEF / RTW – dringend' },
        openings: ['Hier ist die Innere, wir müssen eine Patientin mit Magenblutung in die Endoskopie des Zentrums verlegen, bitte mit Verlegungsarzt, innerhalb der nächsten zwei Stunden.'],
        facts: {
          target: 'Von der Inneren der Kreisklinik in die Endoskopie des Zentrums.',
          when: 'Dringend, innerhalb von zwei Stunden.',
        },
        patients: { count: [1, 1], doctorProb: 0, departments: ['innere'] },
      },
      {
        label: 'Planbar ohne Arzt', weight: 0.3, keyword: 'NOTF VERL 01', sh: { keyword: 'NOTF VERL 01', meldebild: 'Notfallverlegung RTW' },
        openings: ['Unfallchirurgie hier, wir haben eine stabile Patientin mit Beckenfraktur, die muss heute noch ins Traumazentrum, Arzt braucht nicht mit.'],
        facts: {
          target: 'Von der Unfallchirurgie der Kreisklinik ins Traumazentrum.',
          when: 'Heute, in den nächsten Stunden.',
        },
        patients: { count: [1, 1], doctorProb: 0, departments: ['unfallchirurgie'] },
        workMin: [40, 70],
      },
    ],
  },
  // ------------------------------------------------------------------ OHNE SONDERSIGNAL
  {
    id: 'sh_notf_k_hausarzt', name: 'Einweisung ohne Sondersignal', category: 'rd', catalogs: ['sh'],
    keyword: 'NOTF K', sh: { keyword: 'NOTF K', meldebild: 'Schlechter AZ' },
    weight: 2, location: 'wohn',
    openings: [
      'Hier ist die Hausarztpraxis, ich bin gerade bei einer Patientin zum Hausbesuch, sie muss ins Krankenhaus, liegend, ist aber stabil.',
      'Der Pflegedienst hier, unsere Patientin trinkt seit Tagen kaum und baut ab, der Hausarzt hat eine Einweisung geschrieben.',
    ],
    facts: {
      what: 'Ärztlich veranlasste Krankenhauseinweisung, Patient stabil.',
      age: range(70, 96),
      conscious: true,
      breathing: 'normal',
      symptoms: oneOf('Allgemeinzustand deutlich verschlechtert, trinkt kaum.', 'Harnwegsinfekt mit leichtem Fieber, etwas verwirrt.', 'Seit Tagen Durchfall, sehr schwach.'),
      history: oneOf('Demenz, wird zu Hause vom Pflegedienst versorgt.', 'Herzschwäche, mehrere Medikamente.', 'Diabetes, Nierenschwäche.'),
    },
    keyQuestions: ['rd_bewusst', 'rd_atmung', 'rd_beschwerden'], workMin: [25, 45], time: { day: 2, night: 0.4 },
    patients: { count: [1, 1], doctorProb: 0, departments: ['innere'] },
    variants: [
      {
        label: 'Mit Infektionsverdacht', weight: 0.3, keyword: 'NOTF K COVID', sh: { keyword: 'NOTF K COVID', meldebild: 'Schlechter AZ' },
        facts: { symptoms: 'Fieber und Husten, Schnelltest positiv, sonst stabil.' },
      },
    ],
  },
  // ------------------------------------------------------------------ RTH INSEL/HALLIG
  {
    id: 'sh_rth_hallig', name: 'Notfall auf einer Hallig', category: 'rd', catalogs: ['sh'],
    keyword: 'NOTF RTH', sh: { keyword: 'NOTF RTH' },
    weight: 0.2, location: 'land',
    openings: [
      'Ich rufe von der Hallig an, mein Nachbar auf der Warft ist umgekippt und redet ganz verwaschen!',
      'Hier ist die Halligwirtin, ein Feriengast ist von der Leiter gefallen und kann nicht aufstehen, es ist gerade Landunter.',
    ],
    facts: {
      what: 'Notfall auf einer Hallig, nur aus der Luft erreichbar.',
      age: range(30, 85),
      conscious: oneOf(true, true, false),
      breathing: 'normal',
      symptoms: oneOf('Hängender Mundwinkel, Arm kraftlos, seit 20 Minuten.', 'Starke Schmerzen in der Hüfte, Bein nach außen gedreht.', 'Starke Brustschmerzen, kaltschweißig.'),
      history: oneOf('Bluthochdruck.', 'Herzkrank.', 'Nichts bekannt.'),
      water: 'Landunter, die Hallig ist nur noch per Hubschrauber erreichbar.',
    },
    keyQuestions: ['rd_beschwerden', 'rd_bewusst'], workMin: [50, 90],
    weather: { gewitter: 1.5, regen: 1.5, nebel: 0.5 },
    patients: { count: [1, 1], doctorProb: 1, departments: ['neurologie', 'unfallchirurgie', 'kardiologie'] },
  },
  // ------------------------------------------------------------------ STROM
  {
    id: 'sh_stromunfall', name: 'Stromunfall', category: 'rd', catalogs: ['sh'],
    keyword: 'NOTF 11', sh: { keyword: 'NOTF 11', meldebild: 'Stromunfall Hochspannung >1000V' },
    weight: 0.3, location: 'gewerbe',
    openings: [
      'Im Umspannwerk hat ein Monteur einen Schlag bekommen, es gab einen Lichtbogen und jetzt liegt er am Boden!',
      'An der Windkraftanlage ist ein Techniker in der Gondel verunglückt, Stromschlag, er hat Verbrennungen an den Händen!',
    ],
    facts: {
      what: 'Stromunfall an einer Hochspannungsanlage.',
      age: range(20, 60),
      conscious: oneOf(true, false),
      breathing: 'normal',
      symptoms: 'Verbrennungen an Händen und Füßen, Herz schlägt schnell und unregelmäßig.',
      history: 'Keine bekannt.',
      hazard: 'Die Anlage ist inzwischen freigeschaltet, sagt der Kollege.',
    },
    keyQuestions: ['rd_bewusst', 'rd_beschwerden', 'rd_atmung'], workMin: [40, 70],
    patients: { count: [1, 1], doctorProb: 1, departments: ['verbrennung', 'kardiologie', 'intensiv'] },
    escalation: { prob: 0.3, needs: [need('hoehenretter', 1), need('th', 1)], text: 'Patient muss aus großer Höhe gerettet werden, Höhenrettungsgruppe nachgefordert.' },
    variants: [
      {
        label: 'Haushaltsstrom', weight: 1.2, keyword: 'NOTF 01', sh: { keyword: 'NOTF 01', meldebild: 'Stromunfall Niederspannung <1000V' },
        openings: ['Hier in der Werkstatt hat ein Kollege an einer Steckdose gearbeitet und einen Schlag bekommen, jetzt ist ihm schwindelig.'],
        facts: {
          what: 'Stromunfall mit Niederspannung (230 Volt) in einem Betrieb.',
          conscious: true,
          symptoms: 'Kribbeln im Arm, kleine Brandmarke am Finger, Herzklopfen.',
          hazard: 'Die Sicherung ist raus.',
        },
        patients: { count: [1, 1], doctorProb: 0.1, departments: ['innere', 'kardiologie'], noTransportProb: 0.1 },
        workMin: [25, 40],
        escalation: null,
      },
    ],
  },
  // ------------------------------------------------------------------ VERBRENNUNG
  {
    id: 'sh_verbrennung_grill', name: 'Verbrennung', category: 'rd', catalogs: ['sh'],
    keyword: 'NOTF 11', sh: { keyword: 'NOTF 11', meldebild: 'Verbrennung' },
    weight: 0.5, location: 'wohn',
    openings: [
      'Mein Freund hat Spiritus in den Grill gekippt, es gab eine Stichflamme, sein Gesicht und die Arme sind verbrannt!',
      'Mein Nachbar wollte im Garten Gartenabfälle mit Benzin anzünden, jetzt hat seine Jacke Feuer gefangen!',
    ],
    facts: {
      what: 'Verbrennung durch offene Flamme.',
      age: range(16, 65),
      conscious: true,
      breathing: oneOf('normal', 'normal', 'schwer'),
      symptoms: oneOf('Verbrennungen im Gesicht und an beiden Armen, Haare angesengt.', 'Großflächige Verbrennung am Rücken, Kleidung eingebrannt.', 'Hände und Unterarme verbrannt, Blasen, starke Schmerzen.'),
      history: 'Keine.',
    },
    keyQuestions: ['rd_beschwerden', 'rd_atmung'], workMin: [35, 60],
    weather: { hitze: 2, klar: 1.5, regen: 0.4 }, time: { day: 1, night: 1.4 },
    patients: { count: [1, 1], doctorProb: 1, departments: ['verbrennung'] },
    escalation: { prob: 0.15, needs: [need('rth', 1)], text: 'Großflächige Verbrennung, Transport in ein Brandverletztenzentrum per Hubschrauber.' },
    variants: [
      {
        label: 'Verbrühung Kleinkind', weight: 0.8, keyword: 'NOTF 01', sh: { keyword: 'NOTF 01', meldebild: 'Verbrühung' },
        openings: ['Mein Kind hat den Wasserkocher vom Tisch gezogen, das heiße Wasser ist über den Arm gelaufen!'],
        facts: { age: oneOf(1, 2, 3), breathing: 'normal', symptoms: 'Arm und Schulter rot mit Blasen, schreit sehr.', history: 'Gesund.' },
        patients: { count: [1, 1], doctorProb: 0.4, departments: ['paediatrie', 'verbrennung'] },
        workMin: [25, 45],
        escalation: null,
      },
    ],
  },
  // ------------------------------------------------------------------ SCHÄDEL-HIRN-TRAUMA
  {
    id: 'sh_sht_reitunfall', name: 'Schädel-Hirn-Trauma', category: 'rd', catalogs: ['sh'],
    keyword: 'NOTF 11', sh: { keyword: 'NOTF 11', meldebild: 'Schädel-Hirn-Trauma' },
    weight: 0.7, location: 'land',
    openings: [
      'Meine Tochter ist beim Ausritt vom Pferd gestürzt und mit dem Kopf auf einen Stein geknallt, sie ist ganz benommen!',
      'Ein Radfahrer ist auf dem Deichweg gestürzt, ohne Helm, er blutet aus dem Ohr!',
    ],
    facts: {
      what: 'Sturz mit Kopfverletzung im Gelände.',
      age: range(12, 70),
      conscious: oneOf(true, false),
      breathing: 'normal',
      symptoms: oneOf('War kurz bewusstlos und hat sich mehrfach übergeben.', 'Blut aus dem Ohr, Pupillen unterschiedlich groß.', 'Große Beule am Hinterkopf, wird immer schläfriger.'),
      history: oneOf('Keine.', 'Nimmt Blutverdünner.'),
    },
    keyQuestions: ['rd_bewusst', 'rd_beschwerden'], workMin: [35, 60],
    weather: { klar: 1.5, hitze: 1.3, schnee: 0.3 }, time: { day: 1.5, night: 0.5 },
    patients: { count: [1, 1], doctorProb: 1, departments: ['neurologie', 'unfallchirurgie'] },
    escalation: { prob: 0.25, needs: [need('rth', 1)], text: 'Patient trübt weiter ein, Hubschrauber für Transport in die Neurochirurgie angefordert.' },
    variants: [
      {
        label: 'Leichte Kopfverletzung', weight: 0.8, keyword: 'NOTF 01', sh: { keyword: 'NOTF 01', meldebild: 'Kopfverletzung' },
        openings: ['Mein Sohn ist auf dem Reitplatz vom Pony gefallen und hat sich die Stirn aufgeschlagen, er weint, ist aber ganz klar.'],
        facts: { conscious: true, symptoms: 'Platzwunde an der Stirn, war nicht bewusstlos, etwas Kopfschmerzen.', history: 'Keine.' },
        patients: { count: [1, 1], doctorProb: 0.05, departments: ['unfallchirurgie'], noTransportProb: 0.2 },
        workMin: [20, 35],
        escalation: null,
      },
    ],
  },
];
