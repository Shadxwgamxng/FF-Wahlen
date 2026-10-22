import type { ScenarioDef } from '../scenarios';
import { oneOf, range, need } from '../scenarioHelpers';

/**
 * Brandszenarien, die nur im Katalog Schleswig-Holstein vorkommen.
 * Stichwort = SH-Code, Meldebild = exakte Bezeichnung aus SH_MELDEBILDER.
 * Schwerpunkte: Häfen und Schiffe, Gleisbereich, Brandmeldeanlagen mit Objektstufen,
 * Moor- und Heidebrände, Gefahrstoffe, Großbrände mit Verletzten, Reetdächer.
 */
export const SH_SCENARIOS_BRAND: ScenarioDef[] = [
  // ------------------------------------------------------------------ SCHIFF
  {
    id: 'sh_schiffsbrand_hafen', name: 'Schiffsbrand am Liegeplatz', category: 'brand', catalogs: ['sh'],
    keyword: 'FEU SCHIFF', sh: { keyword: 'FEU SCHIFF', meldebild: 'Brand auf Schiff / Boot' },
    weight: 0.4, location: 'wasser',
    openings: [
      'Im Hafen brennt ein Boot am Steg, da kommt schwarzer Rauch aus der Kajüte!',
      'Hier ist der Hafenmeister, auf einem Kutter an der Kaimauer ist Feuer ausgebrochen.',
      'Am Anleger qualmt es aus einem Ausflugsboot, ich glaube, das brennt da drin!',
    ],
    facts: {
      what: 'Brand auf einem Schiff, das an der Kaimauer festgemacht ist.',
      object: oneOf('Ein Fischkutter, Brand im Steuerhaus.', 'Eine Motoryacht, es brennt in der Kajüte.', 'Ein kleines Fahrgastschiff, Rauch aus dem Maschinenraum.'),
      smoke: oneOf('Schwarzer Rauch aus der Kajüte, Flammen sehe ich keine.', 'Flammen am Heck und dichter Rauch über dem Hafenbecken.'),
      trapped: false, injured: oneOf(0, 0, 1),
      floor: 'Liegt direkt an der Kaimauer, man kommt über die Pier ran.',
      spreading: oneOf(false, false, true),
    },
    keyQuestions: ['b_objekt', 'b_personen', 'b_ausbreitung'], workMin: [45, 90],
    patients: { count: 'injured', doctorProb: 0.3, departments: ['verbrennung', 'innere'], noTransportProb: 0.2 },
    escalation: { prob: 0.2, needs: [need('loeschen', 1), need('oel', 1)], text: 'Treibstoff läuft ins Hafenbecken aus, Ölsperre und weiteres LF erforderlich.' },
    variants: [
      {
        label: 'Besatzung noch an Bord', weight: 0.3, keyword: 'FEU SCHIFF Y', sh: { keyword: 'FEU SCHIFF Y', meldebild: 'Brand auf Schiff / Boot' },
        facts: { trapped: true, injured: 1, object: 'Ein Fischkutter, der Schiffer ist noch unter Deck!' },
        patients: { count: [1, 2], doctorProb: 0.7, departments: ['verbrennung', 'intensiv'] },
      },
      {
        label: 'Fähre am Anleger, Maschinenraum', weight: 0.3, keyword: 'FEU G SCHIFF', sh: { keyword: 'FEU G SCHIFF', meldebild: 'Brand auf Schiff / Boot' },
        openings: ['Hier ist die Brücke der Fähre am Fährhafen, wir haben Feuer im Maschinenraum, die Fahrgäste sind schon an Land!'],
        facts: {
          what: 'Brand im Maschinenraum einer Fähre am Anleger.',
          object: 'Die Fähre, Brand im Maschinenraum, Fahrzeugdeck ist halb beladen.',
          smoke: 'Dichter Rauch aus dem Schornstein und den Lüftern.',
          trapped: false, injured: oneOf(0, 1, 2), spreading: true,
        },
        workMin: [120, 240],
        escalation: { prob: 0.4, needs: [need('atemschutz', 1), need('loeschen', 2), need('fuehrung_2', 1)], text: 'Brand im Maschinenraum nicht unter Kontrolle, Atemschutzlogistik und zwei weitere LF nachgefordert.' },
      },
    ],
  },
  {
    id: 'sh_bootsbrand_reede', name: 'Bootsbrand vor Anker', category: 'brand', catalogs: ['sh'],
    keyword: 'FEU SCHIFF W', sh: { keyword: 'FEU SCHIFF W', meldebild: 'Brand auf Schiff / Boot' },
    weight: 0.25, location: 'wasser', time: { day: 1.5, night: 0.5 }, weather: { klar: 2, hitze: 1.5, regen: 0.4, gewitter: 0.3 },
    openings: [
      'Draußen auf der Förde brennt ein Segelboot, das liegt vor Anker, da kommt keiner mit dem Auto hin!',
      'Ich steh am Strand und sehe ein Boot draußen auf dem Wasser brennen, so 300 Meter raus.',
      'Auf der Schlei qualmt eine Motoryacht mitten im Fahrwasser!',
    ],
    facts: {
      what: 'Brand auf einem Boot, das nur vom Wasser aus erreichbar ist.',
      object: oneOf('Eine Segelyacht, die vor Anker liegt.', 'Ein Motorboot mitten auf der Förde.', 'Ein Hausboot an einer Boje.'),
      smoke: oneOf('Flammen am Bug, schwarzer Rauch.', 'Viel Rauch aus der Kajüte, Flammen nur ab und zu.'),
      trapped: oneOf(false, false, true), injured: oneOf(0, 1),
      floor: 'Draußen auf dem Wasser, gut 300 Meter vom Ufer.',
      spreading: oneOf(true, false),
    },
    keyQuestions: ['b_objekt', 'b_personen'], workMin: [40, 90],
    patients: { count: 'injured', doctorProb: 0.4, departments: ['verbrennung', 'innere'], noTransportProb: 0.2 },
    escalation: { prob: 0.25, needs: [need('wasserrettung', 1), need('rtw', 1)], text: 'Zwei Personen von Bord gesprungen und im Wasser, weiteres Wasserrettungsmittel und RTW erforderlich.', extraPatients: 2 },
    variants: [
      {
        label: 'Ausflugsschiff auf der Ostsee', weight: 0.3, keyword: 'FEU G SCHIFF W', sh: { keyword: 'FEU G SCHIFF W', meldebild: 'Brand auf Schiff / Boot' },
        openings: ['Wir sind auf einem Ausflugsschiff vor der Küste, im Unterdeck brennt es und der Kapitän sagt, wir sollen Hilfe holen!'],
        facts: {
          what: 'Brand auf einem Ausflugsschiff vor der Küste.',
          object: 'Ein Ausflugsschiff mit etwa 60 Fahrgästen, Brand im Unterdeck.',
          smoke: 'Rauch kommt aus dem Unterdeck, alle Fahrgäste stehen oben an Deck.',
          trapped: true, injured: range(1, 3), spreading: true,
          floor: 'Etwa zwei Seemeilen vor dem Strand.',
        },
        workMin: [90, 180],
        patients: { count: 'injured', doctorProb: 0.5, departments: ['innere', 'verbrennung'], noTransportProb: 0.2 },
        escalation: { prob: 0.4, needs: [need('wasserrettung', 2), need('rd_fuehrung', 1), need('rtw', 2)], text: 'Evakuierung der Fahrgäste auf See, weitere Wasserrettung und Rettungsdienstführung erforderlich.', extraPatients: 3 },
      },
    ],
  },
  // ------------------------------------------------------------------ BAHN
  {
    id: 'sh_brand_gleisboeschung', name: 'Brand am Bahndamm', category: 'brand', catalogs: ['sh'],
    keyword: 'FEU K BAHN', sh: { keyword: 'FEU K BAHN', meldebild: 'Brand im Gleisbereich' },
    weight: 0.8, location: 'land', weather: { hitze: 4, klar: 1.5, regen: 0.1, schnee: 0 },
    openings: [
      'An der Bahnstrecke brennt das Gras neben den Schienen, gerade ist ein Zug vorbeigefahren.',
      'Neben den Gleisen kokelt eine alte Holzschwelle, da kommt Rauch raus.',
      'Der Bahndamm brennt auf ein paar Metern, so wie von Funken angesteckt.',
    ],
    facts: {
      what: 'Kleiner Brand im Gleisbereich.',
      object: oneOf('Trockenes Gras am Bahndamm, etwa 20 Quadratmeter.', 'Eine ausgebaute Holzschwelle neben dem Gleis.', 'Ein Haufen Gestrüpp neben der Strecke.'),
      smoke: 'Weißer Rauch, kleine Flammen am Boden.',
      trapped: false, injured: 0, spreading: oneOf(false, false, true),
    },
    keyQuestions: ['b_objekt', 'b_ausbreitung'], workMin: [20, 45],
    escalation: { prob: 0.15, needs: [need('loeschen', 1), need('fuehrung_1', 1)], text: 'Feuer läuft den Bahndamm entlang, Streckensperrung und weiteres LF erforderlich.' },
  },
  {
    id: 'sh_brand_zug', name: 'Brand Schienenfahrzeug', category: 'brand', catalogs: ['sh'],
    keyword: 'FEU BAHN', sh: { keyword: 'FEU BAHN', meldebild: 'Brand im Gleisbereich' },
    weight: 0.2, location: 'land',
    openings: [
      'Hier ist der Triebfahrzeugführer, an meinem Triebwagen raucht es unter dem Fahrzeug, ich habe auf freier Strecke gehalten.',
      'Auf der Bahnstrecke steht ein Zug und unten am Wagen brennt etwas!',
    ],
    facts: {
      what: 'Brand an einem Schienenfahrzeug auf freier Strecke.',
      object: oneOf('Der Dieseltriebwagen, Brand im Bereich des Motors unter dem Wagen.', 'Ein Güterwagen mit Holzladung, die Bremse ist heißgelaufen.', 'Ein Bauzug, Brand am Aggregat.'),
      smoke: 'Dunkler Rauch unter dem Fahrzeug, Flammen am Drehgestell.',
      trapped: false, injured: oneOf(0, 0, 1),
      floor: 'Auf freier Strecke zwischen zwei Bahnhöfen, Zugang nur über einen Feldweg.',
      spreading: oneOf(false, true),
    },
    keyQuestions: ['b_objekt', 'b_personen', 'b_ausbreitung'], workMin: [60, 120],
    patients: { count: 'injured', doctorProb: 0.2, departments: ['innere'], noTransportProb: 0.4 },
    escalation: { prob: 0.2, needs: [need('wasser_gross', 1), need('logistik', 1)], text: 'Keine Wasserentnahme an der Strecke, Tanklöschfahrzeug und Schlauchmaterial nachgefordert.' },
    variants: [
      {
        label: 'Reisende noch im Zug', weight: 0.4, keyword: 'FEU BAHN Y', sh: { keyword: 'FEU BAHN Y', meldebild: 'Brand im Gleisbereich' },
        openings: ['Ich sitze im Regionalzug, der ist auf freier Strecke stehen geblieben, unten am Wagen brennt es und der Rauch kommt rein!'],
        facts: { trapped: true, injured: range(1, 2), object: 'Der Dieseltriebwagen, Brand im Bereich des Motors unter dem Wagen.', smoke: 'Rauch zieht in den Fahrgastraum, die Türen gehen nicht auf!' },
        patients: { count: 'injured', doctorProb: 0.5, departments: ['innere'], noTransportProb: 0.2 },
      },
      {
        label: 'Mehrere Güterwagen brennen', weight: 0.25, keyword: 'FEU G BAHN', sh: { keyword: 'FEU G BAHN', meldebild: 'Brand im Gleisbereich' },
        openings: ['Hier ist der Lokführer vom Güterzug, hinter mir brennen mehrere Wagen, ich habe den Zug angehalten!'],
        facts: { object: 'Drei Güterwagen mit Holzhackschnitzeln stehen in Flammen.', smoke: 'Hohe Flammen und eine große Rauchsäule.', spreading: true, injured: 0 },
        workMin: [150, 300],
        patients: null,
      },
    ],
  },
  // ------------------------------------------------------------------ BRANDMELDEANLAGEN
  {
    id: 'sh_bma_gefahrstoffbetrieb', name: 'BMA Gefahrstoffbetrieb', category: 'brand', catalogs: ['sh'],
    keyword: 'FEU BMA X', sh: { keyword: 'FEU BMA X', meldebild: 'Brandmeldeanlage ausgelöst' },
    weight: 0.5, location: 'gewerbe',
    openings: [
      'Automatische Meldung: Brandmeldeanlage im Tanklager am Hafen ausgelöst.',
      'Hier ist der Werkschutz vom Düngemittelwerk, bei uns hat die Brandmeldeanlage im Lager ausgelöst.',
    ],
    facts: {
      what: 'Brandmeldeanlage in einem Betrieb mit Gefahrstoffen hat ausgelöst.',
      object: oneOf('Ein Rauchmelder im Gefahrstofflager.', 'Ein Melder in der Abfüllhalle.', 'Ein Handmelder im Chemikalienlager wurde gedrückt.'),
      smoke: 'Kein Rauch, wir erkunden gerade.',
      trapped: false, injured: 0, spreading: false,
    },
    keyQuestions: ['b_objekt', 'b_rauch'], workMin: [20, 40],
    variants: [
      { label: 'Fehlalarm durch Staub', weight: 3, workMin: [15, 30] },
      {
        label: 'Bestätigter Brand im Lager', weight: 0.4,
        facts: { smoke: 'Der Werkschutz meldet Rauch aus dem Lager, es riecht chemisch.' },
        workMin: [90, 180],
        escalation: { prob: 0.9, needs: [need('gefahrgut', 1), need('loeschen', 2), need('fuehrung_2', 1)], text: 'Brand im Gefahrstofflager bestätigt, Gefahrgutzug und weitere Kräfte nachgefordert.' },
      },
    ],
  },
  {
    id: 'sh_bma_pflegeheim', name: 'BMA Pflegeheim', category: 'brand', catalogs: ['sh'],
    keyword: 'FEU BMA Y', sh: { keyword: 'FEU BMA Y', meldebild: 'Brandmeldeanlage ausgelöst' },
    weight: 0.8, location: 'oeffentlich', time: { night: 1.3 },
    openings: [
      'Automatischer Alarm: Brandmeldeanlage im Seniorenwohnheim ausgelöst.',
      'Hier ist die Nachtwache vom Pflegeheim, bei uns hat die Brandmeldeanlage im zweiten Stock ausgelöst.',
      'Brandmeldeanlage Kurklinik am Strand, Melder im Bettenhaus.',
    ],
    facts: {
      what: 'Brandmeldeanlage in einer Einrichtung mit bettlägerigen Bewohnern hat ausgelöst.',
      object: oneOf('Melder in einem Bewohnerzimmer.', 'Melder in der Teeküche auf Station.', 'Melder im Flur vor dem Aufenthaltsraum.'),
      smoke: 'Ich sehe noch keinen Rauch, ich gehe gleich nachschauen.',
      trapped: false, injured: 0,
      floor: oneOf('2. Obergeschoss, Wohnbereich Möwe.', '1. Obergeschoss.', 'Erdgeschoss, Pflegebereich.'),
      spreading: false,
    },
    keyQuestions: ['b_objekt', 'b_stock'], workMin: [15, 35],
    variants: [
      { label: 'Toast in der Teeküche', weight: 2.5, facts: { object: 'Melder in der Teeküche auf Station.' }, workMin: [10, 25] },
      {
        label: 'Brand in Bewohnerzimmer', weight: 0.4,
        facts: { object: 'Melder in einem Bewohnerzimmer.', smoke: 'Aus einem Zimmer kommt Rauch, eine Bewohnerin ist noch drin!', trapped: true, injured: 1 },
        workMin: [60, 120],
        patients: { count: [1, 3], doctorProb: 0.6, departments: ['innere', 'intensiv'] },
        escalation: { prob: 0.6, needs: [need('loeschen', 2), need('rtw', 2), need('rd_fuehrung', 1)], text: 'Rauch im Wohnbereich, Evakuierung mehrerer bettlägeriger Bewohner erforderlich.', extraPatients: 2 },
      },
    ],
  },
  {
    id: 'sh_bma_grossobjekt', name: 'BMA Großobjekt', category: 'brand', catalogs: ['sh'],
    keyword: 'FEU G BMA', sh: { keyword: 'FEU G BMA', meldebild: 'Brandmeldeanlage ausgelöst' },
    weight: 0.6, location: 'oeffentlich',
    openings: [
      'Automatische Meldung: Brandmeldeanlage im Einkaufszentrum ausgelöst, mehrere Melder.',
      'Hier ist die Sicherheitszentrale vom Fährterminal, die Brandmeldeanlage zeigt Alarm im Abfertigungsgebäude.',
      'Brandmeldeanlage Veranstaltungshalle am Hafen, Melder in der Bühnentechnik.',
    ],
    facts: {
      what: 'Brandmeldeanlage in einem großen, öffentlichen Gebäude hat ausgelöst.',
      object: oneOf('Mehrere Melder im Untergeschoss, Bereich Tiefgarage.', 'Melder im Abfertigungsbereich.', 'Melder in der Bühnentechnik.'),
      smoke: 'Bisher sehen wir nichts, die Räumung läuft.',
      trapped: false, injured: 0, spreading: false,
    },
    keyQuestions: ['b_objekt', 'b_rauch'], workMin: [20, 45],
    variants: [
      {
        label: 'Täuschungsalarm Nebelmaschine', weight: 2, workMin: [15, 30],
        openings: ['Hier ist die Haustechnik der Veranstaltungshalle, die Brandmeldeanlage hat in der Bühnentechnik ausgelöst, gerade läuft eine Probe.'],
        facts: { object: 'Melder in der Bühnentechnik, bei der Probe lief die Nebelmaschine.' },
      },
      {
        label: 'PKW-Brand in der Tiefgarage', weight: 0.4,
        openings: ['Automatische Meldung: Brandmeldeanlage im Einkaufszentrum ausgelöst, mehrere Melder in der Tiefgarage.'],
        facts: { object: 'In der Tiefgarage brennt ein Auto.', smoke: 'Die Tiefgarage ist komplett verraucht.' },
        workMin: [60, 120],
        escalation: { prob: 0.7, needs: [need('atemschutz', 1), need('loeschen', 1), need('rtw', 1)], text: 'Tiefgaragenbrand bestätigt, Atemschutzlogistik und Rettungsdienst nachgefordert.', extraPatients: 1 },
      },
    ],
  },
  {
    id: 'sh_bma_krankenhaus', name: 'BMA Krankenhaus', category: 'brand', catalogs: ['sh'],
    keyword: 'FEU G BMA Y', sh: { keyword: 'FEU G BMA Y', meldebild: 'Brandmeldeanlage ausgelöst' },
    weight: 0.4, location: 'klinik',
    openings: [
      'Automatischer Alarm: Brandmeldeanlage Kreiskrankenhaus, Melder im Bettenhaus.',
      'Hier ist die Technik vom Klinikum, wir haben eine Brandmeldung auf der Intensivstation.',
    ],
    facts: {
      what: 'Brandmeldeanlage in einem Krankenhaus mit nicht gehfähigen Patienten hat ausgelöst.',
      object: oneOf('Melder in einem Patientenzimmer.', 'Melder im Lagerraum neben der Intensivstation.', 'Melder im Technikraum unter dem OP-Bereich.'),
      smoke: 'Bisher kein Rauch zu sehen, Personal erkundet.',
      trapped: false, injured: 0,
      floor: oneOf('3. Obergeschoss, Station 3B.', '1. Obergeschoss, Intensivstation.', 'Untergeschoss, Technik.'),
      spreading: false,
    },
    keyQuestions: ['b_objekt', 'b_stock'], workMin: [20, 40],
    variants: [
      { label: 'Melder durch Wasserdampf ausgelöst', weight: 2.5, facts: { object: 'Melder in einem Patientenzimmer, nebenan wurde geduscht.' }, workMin: [15, 30] },
      {
        label: 'Schwelbrand im Lager', weight: 0.4,
        facts: { object: 'Melder im Lagerraum neben der Intensivstation.', floor: '1. Obergeschoss, Intensivstation.', smoke: 'Aus dem Lagerraum kommt Rauch, der Flur wird verraucht!', spreading: true },
        workMin: [60, 120],
        escalation: { prob: 0.7, needs: [need('rtw', 2), need('rd_fuehrung', 1), need('intensiv', 1)], text: 'Horizontale Räumung der Station, beatmete Patienten müssen verlegt werden.' },
      },
    ],
  },
  // ------------------------------------------------------------------ WALD / MOOR
  {
    id: 'sh_moorbrand', name: 'Großer Moor- oder Heidebrand', category: 'brand', catalogs: ['sh'],
    keyword: 'FEU G WALD', sh: { keyword: 'FEU G WALD', meldebild: 'Großer Wald- / Flächenbrand' },
    weight: 0.2, location: 'land', weather: { hitze: 6, klar: 1.5, bewoelkt: 0.5, regen: 0.05, schnee: 0, nebel: 0.2, gewitter: 0.5 },
    openings: [
      'Im Moor brennt es auf einer riesigen Fläche, der Rauch zieht schon über die Bundesstraße!',
      'Die Heide brennt, das Feuer läuft mit dem Wind auf den Kiefernwald zu!',
    ],
    facts: {
      what: 'Großflächiger Vegetationsbrand.',
      object: oneOf('Hochmoor, mehrere Hektar, der Torf brennt auch.', 'Heidefläche, mehrere Hektar, Kiefernwald angrenzend.'),
      smoke: 'Riesige Rauchwand, der Wind treibt sie Richtung Dorf.',
      trapped: false, injured: 0, spreading: true,
    },
    keyQuestions: ['b_objekt', 'b_ausbreitung', 'b_personen'], workMin: [240, 600],
    escalation: { prob: 0.45, needs: [need('fuehrung_2', 1), need('wasser_gross', 2), need('loeschen', 3), need('logistik', 1)], text: 'Feuer springt über die Schneise, Verbandsführung und weitere Löschzüge mit Tanklöschfahrzeugen nachgefordert.' },
    variants: [
      {
        label: 'Campingplatz bedroht', weight: 0.3,
        openings: ['Am Dünengürtel brennt der Kiefernwald, das sieht man vom ganzen Strand aus, und dahinter liegt der Campingplatz!'],
        facts: { trapped: true, object: 'Kiefernwald in den Dünen, das Feuer ist nah am Campingplatz.' },
        escalation: { prob: 0.7, needs: [need('polizei', 2), need('rtw', 2), need('rd_fuehrung', 1)], text: 'Räumung des Campingplatzes, Polizei und Rettungsdienst zur Absicherung nachgefordert.', extraPatients: 2 },
      },
    ],
  },
  // ------------------------------------------------------------------ GEFAHRSTOFF
  {
    id: 'sh_brand_pflanzenschutzlager', name: 'Brand Pflanzenschutzlager', category: 'brand', catalogs: ['sh'],
    keyword: 'FEU 00 X', sh: { keyword: 'FEU 00 X', meldebild: 'Brand mit Gefahrstoffen' },
    weight: 0.25, location: 'land',
    openings: [
      'Auf unserem Hof brennt es im Schuppen, da stehen Kanister mit Spritzmitteln drin!',
      'Beim Landhandel brennt ein Lagerraum, und da ist Dünger und Pflanzenschutz gelagert.',
    ],
    facts: {
      what: 'Brand in einem Lager mit Pflanzenschutzmitteln.',
      object: oneOf('Ein Geräteschuppen mit Spritzmittelkanistern und einer Feldspritze.', 'Ein Lagerraum mit Pflanzenschutzmitteln und Säcken Dünger.'),
      smoke: 'Gelblicher Rauch, es stinkt beißend.',
      trapped: false, injured: oneOf(0, 0, 1), spreading: oneOf(false, true),
    },
    keyQuestions: ['b_objekt', 'b_rauch', 'b_personen'], workMin: [90, 180],
    patients: { count: 'injured', doctorProb: 0.3, departments: ['innere'], noTransportProb: 0.2 },
    escalation: { prob: 0.3, needs: [need('gefahrgut', 1), need('polizei', 1)], text: 'Rauchwolke zieht über das Dorf, Messtrupp und Warnung der Bevölkerung erforderlich.' },
    variants: [
      {
        label: 'Landwirt im Schuppen', weight: 0.3, keyword: 'FEU 00 XY', sh: { keyword: 'FEU 00 XY', meldebild: 'Brand mit Gefahrstoffen' },
        openings: ['Mein Mann ist in den brennenden Schuppen gerannt, um den Trecker rauszuholen, und kommt nicht wieder raus! Da stehen Spritzmittel drin!'],
        facts: { trapped: true, injured: 1, object: 'Ein Geräteschuppen mit Spritzmittelkanistern, dem Trecker und einer Feldspritze.' },
        patients: { count: [1, 1], doctorProb: 0.9, departments: ['verbrennung', 'intensiv'] },
      },
    ],
  },
  {
    id: 'sh_brand_galvanik', name: 'Brand Gewerbebetrieb mit Gefahrstoffen', category: 'brand', catalogs: ['sh'],
    keyword: 'FEU 2 X', sh: { keyword: 'FEU 2 X', meldebild: 'Brand mit Gefahrstoffen' },
    weight: 0.1, location: 'gewerbe',
    openings: [
      'In unserer Halle brennt es, da lagern jede Menge Chemikalien, wir haben alle Leute rausgeholt!',
      'Im Gewerbegebiet am Hafen brennt ein Betrieb, an der Halle hängen Warnschilder für ätzende und entzündbare Stoffe!',
    ],
    facts: {
      what: 'Brand in einem Betrieb mit größeren Gefahrstoffmengen.',
      object: oneOf('Galvanikhalle mit Säure- und Laugenbecken.', 'Lackiererei mit Fässern voller Lösemittel.', 'Bootswerft mit Harzen und Lacken.'),
      smoke: 'Dichter schwarzer Rauch aus dem Hallendach, es riecht stechend.',
      trapped: false, injured: oneOf(0, 1, 2), spreading: true,
    },
    keyQuestions: ['b_objekt', 'b_personen', 'b_ausbreitung'], workMin: [150, 300],
    patients: { count: 'injured', doctorProb: 0.4, departments: ['innere', 'verbrennung'], noTransportProb: 0.2 },
    escalation: { prob: 0.4, needs: [need('gefahrgut', 1), need('fuehrung_2', 1), need('loeschen', 2)], text: 'Behälter bersten, Löschwasser läuft Richtung Hafenbecken – Gefahrgutzug, Einsatzleitung und weitere LF nachgefordert.' },
  },
  // ------------------------------------------------------------------ GROSSBRAND MIT VERLETZTEN
  {
    id: 'sh_grossbrand_hafenlager', name: 'Großbrand Hafenschuppen', category: 'brand', catalogs: ['sh'],
    keyword: 'FEU 3', sh: { keyword: 'FEU 3', meldebild: 'Brand Gewerbe- / Lagerhalle' },
    weight: 0.1, location: 'gewerbe', time: { night: 1.5 },
    openings: [
      'Am Hafen brennt der ganze alte Lagerschuppen, die Flammen sind meterhoch!',
      'Hier ist die Nachtschicht, unsere Lagerhalle steht komplett in Flammen, Kollegen haben Rauch eingeatmet!',
    ],
    facts: {
      what: 'Großbrand einer Lagerhalle im Hafen.',
      object: oneOf('Holzlagerschuppen mit Strohballen und Netzen.', 'Lagerhalle mit Futtermitteln und Paletten.', 'Hafenspeicher mit Bootszubehör.'),
      smoke: 'Die Halle steht im Vollbrand, das Dach ist schon eingestürzt.',
      trapped: false, injured: range(1, 2), spreading: true,
    },
    keyQuestions: ['b_objekt', 'b_personen', 'verletzt', 'b_ausbreitung'], workMin: [240, 480],
    patients: { count: 'injured', doctorProb: 0.4, departments: ['innere', 'verbrennung'], noTransportProb: 0.2 },
    escalation: { prob: 0.35, needs: [need('wasser_gross', 1), need('logistik', 1), need('loeschen', 2)], text: 'Löschwasserversorgung aus dem Hafenbecken, Schlauchwagen für die Wasserförderung und weitere Löschzüge nachgefordert.' },
  },
  {
    id: 'sh_brand_unterkunft_verletzte', name: 'Brand Unterkunft mit mehreren Verletzten', category: 'brand', catalogs: ['sh'],
    keyword: 'FEU 2 R5', sh: { keyword: 'FEU 2 R5', meldebild: 'Brand Mehrfamilienhaus, Personen eingeschlossen' },
    weight: 0.12, location: 'wohn', time: { night: 2 },
    openings: [
      'In der Ferienwohnanlage brennt es im Treppenhaus, mehrere Leute husten und kommen kaum raus!',
      'Bei uns im Haus brennt es, ein paar Nachbarn sind über den Balkon raus und haben sich verletzt!',
      'Im Gästehaus am Deich ist ein Feuer, hier stehen Urlauber auf der Straße und kriegen keine Luft!',
    ],
    facts: {
      what: 'Gebäudebrand mit mehreren Verletzten.',
      object: oneOf('Ferienwohnanlage, Brand im Treppenhaus.', 'Mehrfamilienhaus, Brand in einer Wohnung im 1. OG.', 'Gästehaus mit Zimmervermietung.'),
      smoke: 'Das Treppenhaus ist voller Rauch, aus einem Fenster schlagen Flammen.',
      trapped: true, injured: range(3, 6),
      floor: oneOf('1. Obergeschoss.', 'Erdgeschoss, Rauch bis unters Dach.', '2. Obergeschoss.'),
      spreading: true,
    },
    keyQuestions: ['b_personen', 'verletzt', 'b_stock'], workMin: [120, 240],
    patients: { count: 'injured', doctorProb: 0.5, departments: ['innere', 'verbrennung', 'unfallchirurgie'], noTransportProb: 0.15 },
    escalation: { prob: 0.25, needs: [need('rtw', 2), need('notarzt', 1), need('psnv', 1)], text: 'Weitere Bewohner mit Rauchgasvergiftung aufgefunden, zusätzliche Rettungsmittel und PSNV erforderlich.', extraPatients: 2 },
    variants: [
      {
        label: 'Saisonarbeiterunterkunft, viele Verletzte', weight: 0.4, keyword: 'FEU G 00 R10', sh: { keyword: 'FEU G 00 R10', meldebild: 'Brand Mehrfamilienhaus, Personen eingeschlossen' },
        openings: ['Auf dem Hof brennt die Unterkunft der Erntehelfer, da wohnen über zwanzig Leute, viele sind verletzt!'],
        facts: {
          what: 'Brand in einer Sammelunterkunft mit vielen Verletzten.',
          object: 'Eine umgebaute Scheune als Unterkunft für Erntehelfer.',
          smoke: 'Das ganze Gebäude brennt, Leute sind aus den Fenstern gesprungen.',
          injured: range(7, 10), floor: 'Erdgeschoss und Obergeschoss.',
        },
        workMin: [180, 360],
        patients: { count: 'injured', doctorProb: 0.6, departments: ['verbrennung', 'unfallchirurgie', 'innere'], noTransportProb: 0.1 },
        escalation: { prob: 0.3, needs: [need('fuehrung_2', 1), need('san_gross', 1), need('psnv', 1)], text: 'Viele Betroffene ohne Unterkunft, Betreuung und weitere Verletztenversorgung erforderlich.', extraPatients: 3 },
      },
    ],
  },
  // ------------------------------------------------------------------ REETDACH
  {
    id: 'sh_reetdachbrand', name: 'Reetdachbrand', category: 'brand', catalogs: ['sh'],
    keyword: 'FEU 2', sh: { keyword: 'FEU 2', meldebild: 'Dachstuhlbrand' },
    weight: 0.3, location: 'wohn', weather: { hitze: 2, klar: 1.3, gewitter: 2, regen: 0.4 },
    openings: [
      'Das Reetdach von unserem Nachbarn brennt, das geht rasend schnell!',
      'Bei dem alten Friesenhaus am Ortsrand qualmt das Reetdach, oben am First kommen schon Flammen raus!',
      'Hier hat der Blitz eingeschlagen, unser Reetdach brennt!',
    ],
    facts: {
      what: 'Brand eines Reetdachs.',
      object: oneOf('Das Reetdach eines Wohnhauses.', 'Das Reetdach einer Ferienkate.', 'Ein reetgedecktes Friesenhaus, der Brand ist im First.'),
      smoke: 'Gelber Qualm aus dem Reet, oben am First Flammen.',
      trapped: false, injured: oneOf(0, 0, 1),
      floor: 'Dachgeschoss.',
      spreading: true,
    },
    keyQuestions: ['b_objekt', 'b_personen', 'b_ausbreitung'], workMin: [150, 300],
    patients: { count: 'injured', doctorProb: 0.3, departments: ['verbrennung', 'innere'], noTransportProb: 0.3 },
    escalation: { prob: 0.3, needs: [need('wasser_gross', 1), need('th', 1), need('logistik', 1)], text: 'Reet muss großflächig abgetragen werden, Einreißhaken, Material und zusätzlicher Löschwassertank nachgefordert.' },
    variants: [
      {
        label: 'Feuer springt auf Nachbardach über', weight: 0.4, keyword: 'FEU G 00', sh: { keyword: 'FEU G 00', meldebild: 'Dachstuhlbrand' },
        openings: ['Zwei Reetdachhäuser nebeneinander brennen, der Funkenflug geht schon aufs dritte Haus!'],
        facts: { object: 'Zwei reetgedeckte Häuser in der Dorfstraße, Funkenflug auf weitere Dächer.', smoke: 'Riesige Flammen, überall fliegen brennende Reetstücke.' },
        workMin: [240, 420],
        escalation: { prob: 0.5, needs: [need('loeschen', 3), need('fuehrung_2', 1), need('wasser_gross', 1)], text: 'Weitere Reetdächer durch Funkenflug gefährdet, zusätzliche Löschzüge und Verbandsführung nachgefordert.' },
      },
      {
        label: 'Bewohnerin im Obergeschoss', weight: 0.25, keyword: 'FEU 2 Y', sh: { keyword: 'FEU 2 Y', meldebild: 'Dachstuhlbrand' },
        facts: { trapped: true, injured: 1 },
        patients: { count: [1, 1], doctorProb: 0.8, departments: ['verbrennung', 'intensiv'] },
      },
    ],
  },
  // ------------------------------------------------------------------ KLEINEINSÄTZE
  {
    id: 'sh_brandnachschau', name: 'Brandnachschau', category: 'brand', catalogs: ['sh'],
    keyword: 'FEU K AUS', sh: { keyword: 'FEU K AUS', meldebild: 'Brandnachschau' },
    weight: 0.8, location: 'wohn',
    openings: [
      'Bei uns hat es gestern gebrannt, die Feuerwehr war da, aber jetzt riecht es wieder verbrannt in der Wand.',
      'Ich hab eben einen kleinen Brand im Mülleimer selbst gelöscht, können Sie trotzdem mal jemanden schicken, der nachschaut?',
    ],
    facts: {
      what: 'Ein bereits gelöschter Brand soll nachkontrolliert werden.',
      object: oneOf('Die Zwischendecke über der Küche, wo es gestern gebrannt hat.', 'Ein Mülleimer im Badezimmer, den ich ausgegossen habe.'),
      smoke: oneOf('Kein Rauch, nur Brandgeruch.', 'Ein bisschen Qualm, keine Flammen.'),
      trapped: false, injured: 0, spreading: false,
    },
    keyQuestions: ['b_objekt', 'b_rauch'], workMin: [15, 30],
    variants: [
      {
        label: 'Glutnest in der Zwischendecke', weight: 0.3,
        openings: ['Bei uns hat es gestern in der Küche gebrannt, und jetzt qualmt es aus der Decke!'],
        facts: { object: 'Die Zwischendecke über der Küche, wo es gestern gebrannt hat.', smoke: 'Jetzt kommt Rauch aus der Deckenlampe!', spreading: true },
        workMin: [45, 90],
        escalation: { prob: 0.6, needs: [need('loeschen', 1), need('atemschutz', 1)], text: 'Glutnest in der Zwischendecke wieder aufgeflammt, Decke muss geöffnet werden – weiteres LF und Atemschutzreserve nachgefordert.' },
      },
    ],
  },
  {
    id: 'sh_heimrauchmelder_ohne_brand', name: 'Heimrauchmelder ohne Brandanzeichen', category: 'brand', catalogs: ['sh'],
    keyword: 'FEU K BMA P', sh: { keyword: 'FEU K BMA P', meldebild: 'Heimrauchmelder piept' },
    weight: 2, location: 'wohn', time: { night: 1.5 },
    openings: [
      'In der Ferienwohnung über uns piept seit einer halben Stunde der Rauchmelder, die Gäste sind wohl am Strand.',
      'Bei meiner Nachbarin geht der Rauchmelder, sie macht nicht auf, aber riechen tu ich nichts.',
      'Im Treppenhaus hört man einen Rauchmelder aus einer Wohnung, Rauch sehe ich keinen.',
    ],
    facts: {
      what: 'Ein Heimrauchmelder piept, Brandanzeichen sind nicht erkennbar.',
      object: 'Ich weiß es nicht, man hört nur den Melder.',
      smoke: 'Kein Rauch, kein Brandgeruch.',
      trapped: oneOf(false, false, true), injured: 0,
      floor: oneOf('Erdgeschoss links.', '1. OG rechts.', 'Dachgeschoss, Ferienwohnung.'),
      spreading: false,
    },
    keyQuestions: ['b_rauch', 'b_personen', 'b_stock'], workMin: [15, 30],
    variants: [
      { label: 'Melder defekt oder Batterie schwach', weight: 2, facts: { trapped: false }, workMin: [10, 20] },
      {
        label: 'Topf auf dem Herd, Bewohner schläft', weight: 0.6,
        facts: { smoke: 'Jetzt riecht es doch angebrannt aus dem Türspalt.', trapped: true },
        patients: { count: [1, 1], doctorProb: 0.1, departments: ['innere'], noTransportProb: 0.5 },
        escalation: { prob: 0.3, needs: [need('rtw', 1)], text: 'Bewohner mit leichter Rauchgasintoxikation, RTW nachgefordert.' },
      },
    ],
  },
];
