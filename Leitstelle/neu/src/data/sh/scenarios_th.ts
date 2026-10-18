import type { ScenarioDef } from '../scenarios';
import { oneOf, range, need } from '../scenarioHelpers';

/**
 * Technische-Hilfe-Szenarien, die nur im Katalog Schleswig-Holstein vorkommen.
 * Stichwort = SH-Code, Meldebild = exakte Bezeichnung aus SH_MELDEBILDER.
 * Schwerpunkte: Kampfmittel an Küste und Feld, Brücken über Kanal und Förde, Windkraft,
 * Wassersport, Bahnstrecken, Gefahrgut auf Bundesstraßen, Sturmflut und Stromausfall.
 */
export const SH_SCENARIOS_TH: ScenarioDef[] = [
  // ------------------------------------------------------------------ KAMPFMITTEL
  {
    id: 'sh_kampfmittelfund', name: 'Kampfmittelfund', category: 'th', catalogs: ['sh'],
    keyword: 'TH KMF', sh: { keyword: 'TH KMF', meldebild: 'Kampfmittelfund' },
    weight: 0.3, location: 'land', time: { day: 2, night: 0.2 },
    openings: [
      'Ich bin Landwirt, beim Pflügen ist mir ein verrostetes Ding hochgekommen, das sieht aus wie eine Granate!',
      'Am Strand liegt so ein länglicher Metallkörper, angespült, mit so Ringen dran. Ich trau mich da nicht ran.',
      'Hier ist der Polier von der Baustelle, der Bagger hat eben was freigelegt, das ist eindeutig eine alte Bombe.',
    ],
    facts: {
      what: 'Fund eines mutmaßlichen Kampfmittels.',
      help: 'Fundstelle absperren, Kampfmittelräumdienst verständigen.',
      trapped: false,
      hazard: oneOf(
        'Das Ding ist ungefähr unterarmlang, total verrostet. Wir sind alle zurückgegangen.',
        'Es ist etwa einen Meter lang, liegt halb im Boden. Ein Spaziergänger hat schon dagegen getreten.',
        'Da liegen mehrere Stücke, eins davon raucht leicht, wenn es an der Luft liegt.',
      ),
      injured: 0,
    },
    keyQuestions: ['th_gefahr', 'th_hilfe'], workMin: [90, 240],
    escalation: { prob: 0.2, needs: [need('polizei', 2), need('fuehrung_1', 1), need('loeschen', 1)], text: 'Kampfmittelräumdienst ordnet Evakuierung im Umkreis an, Polizei und Führungsunterstützung nachgefordert.' },
    variants: [
      {
        label: 'Phosphor am Strand', weight: 0.4,
        openings: ['Mein Sohn hat am Strand einen gelblichen Stein gesammelt, der hat in seiner Jackentasche plötzlich angefangen zu brennen!'],
        facts: {
          what: 'Vermutlich Phosphorbrocken aus alter Munition am Ostseestrand.',
          hazard: 'Der Brocken brennt im Sand weiter und raucht weiß. Das Kind hat sich die Hand verbrannt.',
          injured: 1,
        },
        patients: { count: [1, 1], doctorProb: 0.5, departments: ['verbrennung'] },
        workMin: [45, 90],
      },
      {
        label: 'Großbombe im Baufeld', weight: 0.2, keyword: 'TH G 00', sh: { keyword: 'TH G 00' },
        openings: ['Hier ist der Polier von der Baustelle am Ortsrand, der Bagger hat eine Fliegerbombe freigelegt, die ist riesig!'],
        facts: {
          what: 'Fliegerbombe auf einer Baustelle im Ortsgebiet freigelegt.',
          hazard: 'Die Bombe ist über einen Meter lang, der Zünder ist noch dran. Direkt nebenan sind Wohnhäuser.',
        },
        workMin: [240, 480],
        escalation: { prob: 0.6, needs: [need('polizei_fuehrung', 1), need('fuehrung_2', 1), need('logistik', 1), need('san_gross', 1)], text: 'Entschärfung angesetzt, Evakuierung mehrerer Straßenzüge: Führungsstab, Betreuung und Logistik nachgefordert.' },
      },
    ],
  },

  // ------------------------------------------------------------------ PERSON DROHT INS WASSER ZU SPRINGEN
  {
    id: 'sh_pdrzs_bruecke', name: 'Person droht von Brücke zu springen', category: 'th', catalogs: ['sh'],
    keyword: 'TH PDRZS W', sh: { keyword: 'TH PDRZS W', meldebild: 'Person droht ins Wasser zu springen' },
    weight: 0.15, location: 'wasser', time: { night: 1.8 },
    openings: [
      'Auf der Hochbrücke über den Kanal steht ein Mann außen am Geländer!',
      'Da sitzt eine junge Frau auf der Brüstung der Brücke und lässt die Beine über dem Wasser baumeln, die redet mit keinem.',
      'Ich bin Autofahrer, auf der Brücke über die Förde ist jemand über das Geländer geklettert!',
    ],
    facts: {
      what: 'Eine Person steht außerhalb des Brückengeländers über dem Wasser.',
      help: 'Die Person muss gesichert werden, sie will offenbar springen.',
      trapped: true,
      hazard: oneOf(
        'Die Brücke ist sehr hoch, bestimmt 40 Meter über dem Wasser. Es ist windig.',
        'Darunter fließt der Kanal, gerade kommt ein Frachter.',
        'Es sind vielleicht acht Meter bis zum Wasser, die Strömung ist stark.',
      ),
      injured: 0,
    },
    keyQuestions: ['th_personen', 'th_gefahr'], workMin: [60, 150],
    patients: { count: [1, 1], doctorProb: 0.6, departments: ['psychiatrie', 'intensiv'] },
    escalation: { prob: 0.25, needs: [need('wasserrettung', 1), need('rth', 1), need('psnv', 1)], text: 'Person ist gesprungen und treibt ab: weitere Wasserrettung und Luftrettung nachgefordert, PSNV für Zeugen.' },
  },

  // ------------------------------------------------------------------ HÖHENRETTUNG
  {
    id: 'sh_hoehenrettung_wka', name: 'Höhenrettung Windkraftanlage', category: 'th', catalogs: ['sh'],
    keyword: 'TH SRHT', sh: { keyword: 'TH SRHT', meldebild: 'Person in Höhe / Tiefe' },
    weight: 0.12, location: 'land', time: { day: 3, night: 0.2 }, weather: { gewitter: 0.3, schnee: 0.5 },
    openings: [
      'Hier ist der Servicetechniker vom Windpark, mein Kollege ist oben in der Gondel zusammengebrochen!',
      'Wir warten gerade eine Windkraftanlage, unser Kollege oben in der Gondel meldet sich nicht mehr über Funk.',
    ],
    facts: {
      what: 'Notfall eines Monteurs in der Gondel einer Windkraftanlage.',
      help: 'Rettung aus großer Höhe, die Person muss abgeseilt werden.',
      trapped: true,
      hazard: oneOf(
        'Die Gondel ist auf etwa 100 Meter, der Aufzug im Turm ist außer Betrieb.',
        'Die Gondel ist ungefähr 80 Meter hoch, oben weht ein kräftiger Wind.',
      ),
      injured: 1,
    },
    keyQuestions: ['th_personen', 'th_gefahr'], workMin: [90, 180],
    patients: { count: [1, 1], doctorProb: 0.9, departments: ['kardiologie', 'unfallchirurgie'] },
    escalation: { prob: 0.25, needs: [need('rth', 1)], text: 'Patient instabil, nach der Abseilung Luftrettung zum Windpark nachgefordert.' },
    variants: [
      {
        label: 'Monteur hängt im Turm im Gurt', weight: 0.6,
        openings: ['Wir arbeiten an der Windkraftanlage, einer ist auf der Leiter im Turm abgerutscht und hängt im Sicherungsgurt.'],
        facts: {
          what: 'Monteur hängt nach Absturz im Turm einer Windkraftanlage im Auffanggurt.',
          hazard: 'Er hängt auf halber Höhe im Turm, ungefähr 60 Meter, und wird schon ganz blass.',
        },
        workMin: [60, 150],
      },
    ],
  },
  {
    id: 'sh_hoehenrettung_kran', name: 'Höhenrettung Hafenkran', category: 'th', catalogs: ['sh'],
    keyword: 'TH SRHT', sh: { keyword: 'TH SRHT', meldebild: 'Person in Höhe / Tiefe' },
    weight: 0.08, location: 'gewerbe', time: { day: 2, night: 0.6 },
    openings: [
      'Am Containerterminal sitzt der Kranführer oben in der Kabine und reagiert nicht mehr über Funk!',
      'Hier ist die Schichtleitung vom Hafenumschlag, unserem Kranführer ist oben schlecht geworden, er kommt die Leiter nicht mehr runter.',
    ],
    facts: {
      what: 'Kranführer in der Kabine eines Hafenkrans nicht mehr handlungsfähig.',
      help: 'Die Person muss aus der Krankabine gerettet und abgeseilt werden.',
      trapped: true,
      hazard: 'Die Kabine hängt etwa 40 Meter hoch über dem Kai, außen führt nur eine Steigleiter hinauf.',
      injured: 1,
    },
    keyQuestions: ['th_personen', 'th_gefahr'], workMin: [60, 120],
    patients: { count: [1, 1], doctorProb: 0.9, departments: ['kardiologie', 'innere'] },
    escalation: { prob: 0.2, needs: [need('rth', 1)], text: 'Patient nach der Rettung instabil, Luftrettung zum Hafengelände nachgefordert.' },
  },

  // ------------------------------------------------------------------ WASSER
  {
    id: 'sh_boot_in_not', name: 'Boot in Not', category: 'wasser', catalogs: ['sh'],
    keyword: 'TH WASSER', sh: { keyword: 'TH WASSER', meldebild: 'Boot in Not' },
    weight: 0.35, location: 'wasser', time: { day: 2, night: 0.4 }, weather: { klar: 1.5, hitze: 2, gewitter: 2.5, schnee: 0.1 },
    openings: [
      'Draußen vor der Mole treibt ein Motorboot, die winken die ganze Zeit mit den Armen!',
      'Wir sind mit dem Schlauchboot unterwegs, der Motor ist aus und wir treiben auf die Steine zu.',
      'Ein Tretboot ist zu weit rausgefahren und kommt gegen den ablandigen Wind nicht mehr zurück.',
    ],
    facts: {
      what: 'Ein Boot ist manövrierunfähig und treibt ab, die Insassen sind noch an Bord.',
      water: oneOf(
        'Ostsee, etwa 300 Meter vor dem Badestrand.',
        'Auf der Schlei, kurz vor der Engstelle.',
        'Auf der Förde, zwischen Fähranleger und Sportboothafen.',
      ),
      injured: 0,
    },
    keyQuestions: ['w_gewaesser', 'verletzt'], workMin: [40, 80],
    escalation: { prob: 0.15, needs: [need('wasserrettung', 1), need('rtw', 1)], text: 'Boot ist voll Wasser gelaufen, Insassen im Wasser – weitere Wasserrettung und RTW.', extraPatients: 1 },
  },
  {
    id: 'sh_segler_gekentert', name: 'Segler gekentert', category: 'wasser', catalogs: ['sh'],
    keyword: 'TH WASSER Y', sh: { keyword: 'TH WASSER Y', meldebild: 'Person im Wasser' },
    weight: 0.25, location: 'wasser', time: { day: 2.5, night: 0.2 }, weather: { gewitter: 4, klar: 1, hitze: 1.5, schnee: 0 },
    openings: [
      'Da draußen ist eine Jolle umgekippt, die Segler sind ins Wasser gefallen!',
      'Ein Katamaran ist bei einer Böe umgeschlagen, da sind Leute im Wasser!',
      'Beim Gewitter eben ist ein Segelboot gekentert, da sind Leute im Wasser!',
    ],
    facts: {
      what: 'Personen nach Kenterung im Wasser.',
      visible: oneOf(true, true, false),
      water: oneOf(
        'Ostsee vor dem Strand, etwa 500 Meter raus, auflandiger Wind.',
        'Auf der Förde, Höhe Leuchtturm.',
        'Großer Binnensee, in der Mitte, nahe der Insel.',
      ),
      injured: range(1, 3),
    },
    keyQuestions: ['w_sicht', 'w_gewaesser', 'verletzt'], workMin: [45, 90],
    patients: { count: 'injured', doctorProb: 0.6, departments: ['intensiv', 'innere'], noTransportProb: 0.2 },
    escalation: { prob: 0.25, needs: [need('rth', 1), need('wasserrettung', 1)], text: 'Eine Person wird vermisst – Suche mit Luftrettung und weiteren Booten.' },
  },

  // ------------------------------------------------------------------ BAHN
  {
    id: 'sh_unfall_gleis', name: 'Person vom Zug erfasst', category: 'th', catalogs: ['sh'],
    keyword: 'TH BAHN Y', sh: { keyword: 'TH BAHN Y', meldebild: 'Unfall im Gleisbereich' },
    weight: 0.15, location: 'land', time: { night: 1.3 },
    openings: [
      'Hier ist der Triebfahrzeugführer vom Regionalzug, wir haben eine Person erfasst, wir stehen auf freier Strecke!',
      'Am Bahnübergang ist ein Traktor mit dem Zug zusammengestoßen, der Fahrer sitzt noch in der Kabine!',
    ],
    facts: {
      what: 'Unfall im Gleisbereich mit verletzter Person.',
      help: 'Person befreien bzw. unter dem Zug retten, Strecke muss gesperrt und geerdet werden.',
      trapped: true,
      hazard: oneOf(
        'Die Strecke ist elektrifiziert, die Oberleitung hängt über uns.',
        'Nicht elektrifizierte Nebenstrecke, aber der Gegenzug ist noch nicht gestoppt.',
      ),
      injured: 1,
    },
    keyQuestions: ['th_personen', 'th_gefahr'], workMin: [90, 180],
    patients: { count: [1, 1], doctorProb: 1, departments: ['unfallchirurgie', 'intensiv'], noTransportProb: 0.3 },
    escalation: { prob: 0.3, needs: [need('psnv', 1), need('polizei', 1)], text: 'Zugpersonal und Fahrgäste stark belastet, PSNV und Polizei nachgefordert.' },
  },

  // ------------------------------------------------------------------ GEBÄUDEEINSTURZ
  {
    id: 'sh_gebaeudeeinsturz', name: 'Gebäudeeinsturz', category: 'th', catalogs: ['sh'],
    keyword: 'TH G 00 Y', sh: { keyword: 'TH G 00 Y', meldebild: 'Gebäudeeinsturz' },
    weight: 0.06, location: 'wohn',
    openings: [
      'Bei uns in der Straße ist ein altes Haus zusammengesackt, da waren noch Leute drin!',
      'Beim Umbau des Wohnhauses nebenan ist die Decke eingebrochen, Arbeiter liegen unter dem Schutt!',
    ],
    facts: {
      what: 'Teileinsturz eines Gebäudes, Personen verschüttet.',
      help: 'Verschüttete Personen müssen gesucht und befreit werden.',
      trapped: true,
      hazard: oneOf(
        'Es knirscht immer noch, der Rest der Wand kann jeden Moment nachgeben.',
        'Es riecht nach Gas zwischen den Trümmern.',
      ),
      injured: range(1, 3),
    },
    keyQuestions: ['th_personen', 'th_gefahr', 'verletzt'], workMin: [180, 360],
    patients: { count: 'injured', doctorProb: 0.8, departments: ['unfallchirurgie', 'intensiv'] },
    escalation: { prob: 0.6, needs: [need('thw_bergung', 2), need('thw_fuehrung', 1), need('rd_fuehrung', 1)], text: 'Statik unsicher, weitere Verschüttete vermutet – THW-Bergung mit Ortung und Fachberatung nachgefordert.', extraPatients: 1 },
  },

  // ------------------------------------------------------------------ GAS
  {
    id: 'sh_gas_campingplatz', name: 'Gasgeruch auf Campingplatz', category: 'th', catalogs: ['sh'],
    keyword: 'TH GAS', sh: { keyword: 'TH GAS', meldebild: 'Gasgeruch' },
    weight: 0.4, location: 'oeffentlich', time: { day: 1.4 }, weather: { hitze: 2, klar: 1.5, schnee: 0.2 },
    openings: [
      'Hier ist der Platzwart vom Campingplatz an der Steilküste, bei einem Wohnwagen riecht es ganz stark nach Gas!',
      'Wir zelten hier auf dem Campingplatz, beim Nachbarn am Vorzelt riecht es stark nach Gas, wir sind schon weggegangen.',
    ],
    facts: {
      what: 'Gasgeruch an einer Flüssiggasanlage.',
      help: 'Bereich räumen, Gasflasche bzw. Leitung absperren.',
      trapped: false,
      hazard: oneOf(
        'An der Propanflasche vom Wohnwagen zischt es, der Nachbar grillt zehn Meter daneben.',
        'Am Flüssiggastank hinter dem Sanitärgebäude riecht es stark, die Abdeckhaube steht offen.',
        'Es riecht nur leicht, man hört nichts.',
      ),
      injured: 0,
    },
    keyQuestions: ['th_gefahr', 'th_personen'], workMin: [30, 60],
    escalation: { prob: 0.12, needs: [need('gefahrgut', 1), need('rtw', 1)], text: 'Gasaustritt nicht absperrbar, Gefahrgutkomponente und RTW zur Absicherung.' },
  },

  // ------------------------------------------------------------------ ÖL AUF DEM WASSER
  {
    id: 'sh_oel_hafenbecken', name: 'Ölfilm im Hafenbecken', category: 'th', catalogs: ['sh'],
    keyword: 'TH AUST W', sh: { keyword: 'TH AUST W', meldebild: 'Größere Menge Betriebsstoffe ausgelaufen' },
    weight: 0.3, location: 'wasser', time: { day: 1.5 },
    openings: [
      'Hier ist das Hafenbüro, im Fischereihafen schwimmt ein großer schillernder Ölfilm zwischen den Kuttern.',
      'Aus einem Sportboot im Yachthafen läuft Diesel, das ganze Becken riecht danach.',
      'Am Fähranleger treibt ein dunkler Teppich auf dem Wasser, keine Ahnung, wo der herkommt.',
    ],
    facts: {
      what: 'Betriebsstoff auf der Wasseroberfläche eines Hafenbeckens.',
      help: 'Ölsperre ausbringen und Öl aufnehmen, Quelle finden.',
      trapped: false,
      hazard: oneOf(
        'Der Film ist ungefähr 50 mal 20 Meter groß und treibt Richtung Hafenausfahrt.',
        'Es ist nur ein Streifen an der Kaimauer, aber es kommt immer mehr nach.',
        'Ein Boot an der Kaimauer liegt auffällig tief im Wasser, da kommt das Öl raus.',
      ),
      injured: 0,
    },
    keyQuestions: ['th_hilfe', 'th_gefahr'], workMin: [90, 180],
    escalation: { prob: 0.2, needs: [need('oel', 1), need('logistik', 1), need('thw_pumpen', 1)], text: 'Ölfilm erreicht die Hafenausfahrt, weiteres Ölsperrmaterial und Pumpen nachgefordert.' },
  },

  // ------------------------------------------------------------------ HUBSCHRAUBERLANDUNG
  {
    id: 'sh_flusi_landung', name: 'Absicherung Hubschrauberlandung', category: 'th', catalogs: ['sh'],
    keyword: 'TH K FLUSI', sh: { keyword: 'TH K FLUSI' },
    weight: 0.3, location: 'oeffentlich', time: { day: 1.5, night: 0.7 },
    openings: [
      'Hier ist die Besatzung des Rettungshubschraubers, wir brauchen eine Landeplatzabsicherung am Sportplatz.',
      'Der Notarzt vor Ort fordert an: Der Hubschrauber soll auf dem Parkplatz am Strand landen, bitte absichern.',
    ],
    facts: {
      what: 'Landeplatz für einen Rettungshubschrauber absichern.',
      help: 'Landefläche absperren, Brandschutz stellen, Schaulustige fernhalten.',
      trapped: false,
      hazard: oneOf(
        'Auf dem Platz sind noch Kinder beim Fußballtraining.',
        'Am Strandparkplatz stehen viele Badegäste, lose Strandmuscheln liegen herum.',
        'Es ist dunkel, die Fläche ist nicht beleuchtet.',
      ),
      injured: 0,
    },
    keyQuestions: ['th_hilfe', 'th_gefahr'], workMin: [20, 40],
  },

  // ------------------------------------------------------------------ ERKUNDUNG / CO
  {
    id: 'sh_unklarer_geruch', name: 'Unklarer Geruch', category: 'th', catalogs: ['sh'],
    keyword: 'TH K ERK', sh: { keyword: 'TH K ERK' },
    weight: 1, location: 'wohn',
    openings: [
      'Im Treppenhaus riecht es seit einer Stunde komisch, irgendwie verbrannt und chemisch.',
      'Bei uns im Dorf stinkt es seit heute Morgen ganz merkwürdig, das kommt vom Feld her.',
    ],
    facts: {
      what: 'Unklarer Geruch, Ursache unbekannt.',
      help: 'Jemand soll nachsehen, woher der Geruch kommt.',
      trapped: false,
      hazard: oneOf('Nein, keinem geht es schlecht.', 'Man hat ein bisschen Kopfweh, aber sonst nichts.'),
      injured: 0,
    },
    keyQuestions: ['th_gefahr', 'th_personen'], workMin: [15, 35],
    variants: [
      { label: 'Gülle oder Silage', weight: 1.2, facts: { hazard: 'Es riecht vor allem nach Gülle, aber viel stärker als sonst.' }, workMin: [10, 25] },
      {
        label: 'Chemischer Geruch im Keller', weight: 0.4, keyword: 'TH K ERK X', sh: { keyword: 'TH K ERK X' },
        openings: ['Im Keller unseres Mehrfamilienhauses riecht es beißend nach Chemie, das zieht schon ins Treppenhaus.'],
        facts: { what: 'Beißender chemischer Geruch im Keller eines Wohnhauses.', hazard: 'Die Augen tränen, wenn man runtergeht. Im Hobbyraum ist wohl ein Kanister umgekippt.' },
        workMin: [40, 80],
      },
    ],
  },
  {
    id: 'sh_co_erkundung', name: 'CO-Melder in Wohnung', category: 'abc', catalogs: ['sh'],
    keyword: 'TH K ERK X', sh: { keyword: 'TH K ERK X', meldebild: 'CO-Einsatz, bis 33 ppm' },
    weight: 0.8, location: 'wohn', time: { night: 1.3 }, weather: { schnee: 3, regen: 1.3, hitze: 0.3 },
    openings: [
      'Bei uns piept der Kohlenmonoxidmelder neben der Gastherme, uns geht es aber gut.',
      'Der CO-Warner im Bad zeigt was an und hört nicht auf zu piepen.',
    ],
    facts: {
      what: 'CO-Warnmelder hat ausgelöst.',
      substance: 'Kohlenmonoxid, der Melder zeigt eine niedrige Zahl.',
      amount: oneOf('Das Display zeigt 25.', 'Da steht 30 ppm.'),
      cloud: 'Nein, man riecht und sieht nichts.',
      injured: 0,
    },
    keyQuestions: ['abc_stoff', 'abc_menge', 'verletzt'], workMin: [25, 45],
    patients: { count: 'injured', doctorProb: 0.3, departments: ['innere'], noTransportProb: 0.3 },
    variants: [
      {
        label: 'Bewohner mit Kopfschmerzen', weight: 0.6, keyword: 'TH K ERK XY', sh: { keyword: 'TH K ERK XY', meldebild: 'CO-Einsatz, bis 83 ppm' },
        openings: ['Der CO-Melder piept und meine Frau und ich haben seit dem Aufstehen starke Kopfschmerzen und Übelkeit.'],
        facts: { amount: oneOf('Das Display zeigt 60.', 'Da steht 75 ppm.'), injured: range(1, 2) },
        workMin: [35, 60],
      },
      {
        label: 'Hohe Konzentration, Bewusstlose', weight: 0.25, keyword: 'TH 00 XY', sh: { keyword: 'TH 00 XY', meldebild: 'CO-Einsatz, größer 83 ppm' },
        openings: ['Ich bin vom Pflegedienst, die Melder piepen wie verrückt und die Patientin liegt benommen im Bett!'],
        facts: { amount: 'Das Gerät zeigt über 200!', cloud: 'Nein, aber mir wird auch schon schwindelig.', injured: range(1, 3) },
        patients: { count: 'injured', doctorProb: 0.8, departments: ['intensiv', 'innere'] },
        workMin: [45, 90],
        escalation: { prob: 0.3, needs: [need('rtw', 1), need('notarzt', 1), need('atemschutz', 1)], text: 'Weitere Bewohner im Haus betroffen, zusätzlicher RTW mit Notarzt erforderlich.', extraPatients: 2 },
      },
    ],
  },

  // ------------------------------------------------------------------ TÜRÖFFNUNG MIT NOTARZT
  {
    id: 'sh_tuer_bewusstlos', name: 'Türöffnung – Person bewusstlos', category: 'th', catalogs: ['sh'],
    keyword: 'TH K TV 11', sh: { keyword: 'TH K TV 11', meldebild: 'Türöffnung, Person bewusstlos' },
    weight: 1, location: 'wohn',
    openings: [
      'Durch das Fenster sehe ich meinen Nachbarn reglos auf dem Küchenboden liegen, die Tür ist zu!',
      'Mein Vater geht nicht ans Telefon, durch den Briefschlitz sehe ich ihn im Flur liegen, er bewegt sich nicht.',
      'Hausnotruf hier: Unsere Teilnehmerin hat den Knopf gedrückt, über die Freisprechanlage hören wir nur Stöhnen und jetzt gar nichts mehr. Ein Schlüssel ist bei uns nicht hinterlegt.',
    ],
    facts: {
      what: 'Person vermutlich bewusstlos hinter verschlossener Wohnungstür.',
      help: 'Die Tür muss sofort geöffnet werden.',
      trapped: true,
      hazard: oneOf('Nein, aber auf Klopfen und Rufen reagiert niemand.', 'Es riecht ein bisschen nach Gas im Flur.', 'Nein.'),
      injured: 1,
    },
    keyQuestions: ['th_personen', 'th_gefahr'], workMin: [20, 45],
    patients: { count: [1, 1], doctorProb: 1, departments: ['innere', 'neurologie', 'intensiv'], noTransportProb: 0.25 },
  },

  // ------------------------------------------------------------------ VERKEHRSUNFALL GEFAHRGUT
  {
    id: 'sh_vu_gefahrgut', name: 'Verkehrsunfall mit Gefahrgut', category: 'vu', catalogs: ['sh'],
    keyword: 'TH 00 X', sh: { keyword: 'TH 00 X', meldebild: 'Verkehrsunfall mit Gefahrgut' },
    weight: 0.2, location: 'strasse', weather: { regen: 1.4, nebel: 1.6, schnee: 1.8 },
    openings: [
      'Hier ist ein LKW verunglückt, da ist so eine orange Warntafel dran!',
      'Ein Gefahrgutfahrzeug hat einen Unfall gebaut, es läuft was aus und es stinkt.',
    ],
    facts: {
      what: 'Verkehrsunfall eines Gefahrguttransports.',
      vehicles: oneOf('Ein Tankwagen, allein beteiligt, er ist in den Graben gerutscht.', 'Ein Tankwagen und ein PKW.'),
      trapped: false,
      injured: 0,
      leak: 'Aus dem Tank tropft es, auf der orangen Tafel steht oben 33 und unten 1203.',
      road: oneOf('Bundesstraße in Richtung Fährhafen, Höhe Abzweig Gewerbegebiet.', 'Kreisstraße zwischen zwei Dörfern, neben einem Entwässerungsgraben.'),
    },
    keyQuestions: ['vu_auslauf', 'vu_fzg', 'verletzt'], workMin: [90, 200],
    patients: { count: 'injured', doctorProb: 0.4, departments: ['unfallchirurgie', 'innere'] },
    escalation: { prob: 0.25, needs: [need('gefahrgut', 1), need('fuehrung_2', 1), need('oel', 1)], text: 'Produkt läuft in den Graben Richtung Vorfluter, Gefahrgutzug und Umweltschutzmaßnahmen nachgefordert.' },
    variants: [
      {
        label: 'Fässer auf Kleintransporter', weight: 0.6,
        facts: {
          vehicles: 'Ein Kleintransporter mit Fässern und ein PKW, der Transporter liegt auf der Seite.',
          leak: 'Aus einem Fass läuft eine farblose Flüssigkeit, es riecht stechend.',
        },
      },
      {
        label: 'Düngemittel auf Sattelzug', weight: 0.4,
        facts: {
          vehicles: 'Ein Sattelzug mit Düngemitteln und ein Kleinwagen.',
          leak: 'Säcke sind aufgeplatzt, weißes Granulat liegt auf der Fahrbahn, der Regen löst es auf.',
        },
      },
      {
        label: 'Fahrer verletzt und eingeklemmt', weight: 0.4, keyword: 'TH 00 XY', sh: { keyword: 'TH 00 XY', meldebild: 'Gefahrstoffaustritt mit Verletzten' },
        openings: ['Ein Gefahrgut-LKW ist mit einem Auto zusammengestoßen, der Autofahrer ist eingeklemmt und überall riecht es nach Chemie!'],
        facts: { vehicles: 'Ein Tank-LKW mit Warntafel und ein PKW.', trapped: true, injured: range(1, 2) },
        patients: { count: 'injured', doctorProb: 0.9, departments: ['unfallchirurgie', 'intensiv'] },
        workMin: [120, 240],
      },
    ],
  },

  // ------------------------------------------------------------------ VERKEHRSUNFALL MANV
  {
    id: 'sh_vu_manv', name: 'Verkehrsunfall mit mehreren Verletzten', category: 'vu', catalogs: ['sh'],
    keyword: 'TH 00 R0', sh: { keyword: 'TH 00 R0', meldebild: 'Verkehrsunfall, viele Verletzte' },
    weight: 0.2, location: 'strasse', time: { day: 1.4 }, weather: { nebel: 2, regen: 1.5, schnee: 2 },
    openings: [
      'Hier hat es schwer gekracht, mehrere Leute sitzen blutend am Straßenrand!',
      'Mehrere Fahrzeuge sind zusammengestoßen, da sind viele Verletzte, auch Kinder!',
    ],
    facts: {
      what: 'Verkehrsunfall mit mehreren Verletzten.',
      vehicles: oneOf('Drei PKW.', 'Ein Kleinbus und ein PKW.', 'Ein Wohnmobil und zwei PKW.'),
      trapped: oneOf(false, true),
      injured: range(4, 6),
      leak: oneOf('Kühlwasser und etwas Öl.', 'Nein.'),
      road: oneOf('Bundesstraße an der Küste, Ausflugsverkehr.', 'Landstraße am Ortseingang, Kurve am Deich.'),
    },
    keyQuestions: ['verletzt', 'vu_eingeklemmt', 'vu_fzg'], workMin: [90, 150],
    patients: { count: 'injured', doctorProb: 0.4, departments: ['unfallchirurgie', 'innere'], noTransportProb: 0.25 },
    escalation: { prob: 0.25, needs: [need('rtw', 2), need('san_gross', 1)], text: 'Mehr Verletzte als gemeldet, Erhöhung der MANV-Stufe.', extraPatients: 3 },
    variants: [
      {
        label: 'Reisebus verunglückt', weight: 0.35, keyword: 'TH 00 R1', sh: { keyword: 'TH 00 R1', meldebild: 'Verkehrsunfall, viele Verletzte' },
        openings: ['Ein Reisebus ist von der Straße abgekommen und liegt auf der Seite im Graben, da sind viele Verletzte!'],
        facts: { vehicles: 'Ein Reisebus, auf der Seite liegend.', trapped: true, injured: range(7, 10) },
        workMin: [150, 240],
        escalation: { prob: 0.35, needs: [need('rtw', 4), need('san_gross', 1), need('rd_fuehrung', 1)], text: 'Über zehn Verletzte, MANV-Stufe erhöht.', extraPatients: 4 },
      },
    ],
  },

  // ------------------------------------------------------------------ THW: STURMFLUT / STROMAUSFALL
  {
    id: 'sh_thw_notstrom', name: 'THW-Anforderung Sturm / Sturmflut', category: 'th', catalogs: ['sh'],
    keyword: 'THW Strom', sh: { keyword: 'THW Strom' },
    weight: 0.15, location: 'oeffentlich', weather: { gewitter: 6, schnee: 3, regen: 2, klar: 0.2, hitze: 0.3 },
    openings: [
      'Hier ist die Pflegedienstleitung vom Seniorenheim, seit dem Sturm haben wir keinen Strom, die Beatmungsgeräte unserer Bewohner laufen nur noch auf Akku!',
      'Seniorenheim hier, wir sind seit Stunden ohne Strom, die Beatmungsgeräte und die Sauerstoffkonzentratoren halten nicht mehr lange durch.',
    ],
    facts: {
      what: 'Großflächiger Stromausfall nach Sturm, Pflegeeinrichtung ohne Strom.',
      help: 'Notstrom für eine wichtige Einrichtung wird gebraucht.',
      trapped: false,
      hazard: oneOf(
        'Die Akkus der Beatmungsgeräte reichen noch etwa zwei Stunden.',
        'Drei Bewohner sind auf Beatmung angewiesen, die Akkus sind schon halb leer.',
      ),
      injured: 0,
    },
    keyQuestions: ['th_hilfe', 'th_gefahr'], workMin: [180, 480],
    escalation: { prob: 0.2, needs: [need('thw_notstrom', 1), need('thw_fuehrung', 1)], text: 'Netzbetreiber rechnet mit Ausfall bis morgen, weiteres Notstromaggregat und Fachberatung nachgefordert.' },
    variants: [
      {
        label: 'Pumpstation am Deich ohne Strom', weight: 0.6,
        openings: ['Der Bürgermeister hier: Das ganze Dorf ist seit Stunden ohne Strom, die Pumpstation am Deich läuft nicht mehr.'],
        facts: {
          what: 'Stromausfall nach Sturm, Schöpfwerk am Deich steht still.',
          help: 'Ein Notstromaggregat für die Pumpstation wird gebraucht.',
          hazard: 'Ohne die Pumpe läuft Wasser in die Siedlung hinter dem Deich.',
        },
      },
      {
        label: 'Ausleuchtung Deichsicherung', weight: 0.6, keyword: 'THW Beleuchtung', sh: { keyword: 'THW Beleuchtung' },
        openings: ['Hier ist der Einsatzleiter am Deich, wir legen in der Dunkelheit Sandsäcke, wir brauchen dringend Licht.'],
        facts: {
          what: 'Ausleuchtung einer Einsatzstelle an einem Deich in der Nacht.',
          help: 'Großflächige Beleuchtung für die Deichverteidigung.',
          hazard: 'Es ist stockdunkel, die Helfer stehen auf der nassen Böschung.',
        },
        workMin: [120, 360],
      },
      {
        label: 'Sturmflut, Großpumpen', weight: 0.8, keyword: 'THW WASSER', sh: { keyword: 'THW WASSER', meldebild: 'Überflutung / Hochwasser' },
        openings: [
          'Hier ist der Hafenmeister, das Ostseewasser steht schon in der Altstadt, die Feuerwehr kommt mit dem Pumpen nicht hinterher!',
          'Feuerwehr vor Ort: Die Tiefgarage am Hafen läuft voll, wir brauchen leistungsstarke Pumpen vom THW.',
        ],
        facts: {
          what: 'Überflutung durch Sturmflut, große Wassermengen.',
          help: 'Großpumpen werden benötigt.',
          hazard: oneOf(
            'Das Wasser steht einen halben Meter hoch in der Tiefgarage am Hafen, da laufen Autos voll.',
            'Die Keller der ganzen Hafenstraße sind voll, und bis zum Höchststand der Flut steigt das Wasser noch weiter.',
          ),
        },
        workMin: [240, 600],
        escalation: { prob: 0.25, needs: [need('thw_pumpen', 1), need('logistik', 1), need('thw_notstrom', 1)], text: 'Pegel steigt weiter, zusätzliche Pumpen, Sandsacklogistik und Notstrom nachgefordert.' },
      },
    ],
  },
];
