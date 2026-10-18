import type { ScenarioDef } from '../scenarios';
import { oneOf, range, need } from '../scenarioHelpers';

/**
 * Krankenbeförderung, Weiterleitungen, Betreuung und Polizeilagen mit Bereitstellung –
 * nur im Katalog Schleswig-Holstein.
 * Stichwort = SH-Code, Meldebild = exakte Bezeichnung aus SH_MELDEBILDER.
 * Weiterleitungen (W …) erzeugen keinen Einsatz: Die Abfrage soll zeigen, dass weder
 * Rettungsdienst noch Feuerwehr gebraucht werden.
 */
export const SH_SCENARIOS_MISC: ScenarioDef[] = [
  // ------------------------------------------------------------------ KRANKENBEFÖRDERUNG
  {
    id: 'sh_kbf_dialyse', name: 'Dialysefahrt', category: 'ktp', catalogs: ['sh'],
    keyword: 'KBF AMBU', sh: { keyword: 'KBF AMBU', meldebild: 'Dialysetransport' },
    weight: 2.5, location: 'wohn', time: { day: 2.5, night: 0.05 },
    openings: [
      'Guten Morgen, ich muss meinen Mann zur Dialyse bringen lassen, der normale Fahrdienst hat abgesagt und er kann nicht sitzen.',
      'Hier ist der Pflegedienst, wir bestellen für Frau Petersen den Transport zur Dialyse und nachher wieder zurück.',
      'Hier Hausarztpraxis, für einen Dialysepatienten brauchen wir einen liegenden Transport ins Nierenzentrum, hin und zurück.',
    ],
    facts: {
      what: 'Bestellter Transport zur ambulanten Dialyse mit Rückfahrt am selben Tag.',
      target: oneOf(
        'Von zuhause zum Dialysezentrum in der Kreisstadt, nachmittags wieder zurück.',
        'Von der Wohnung zur Dialyse am Klinikum, nach etwa fünf Stunden zurück.',
        'Aus dem Dorf ins Nierenzentrum, die Rückfahrt bitte gleich mit einplanen.',
      ),
      mobility: oneOf('Liegend, seit einem Schlaganfall bettlägerig.', 'Liegend, Sitzen geht seit der Hüft-OP nicht.'),
      infection: false,
      when: oneOf('Morgen früh, Ankunft dort um 6:30 Uhr.', 'Heute um 12 Uhr ist der Termin.', 'Montag, Mittwoch und Freitag jeweils um 7 Uhr.'),
      intensive: false,
    },
    keyQuestions: ['ktp_ziel', 'ktp_mobil', 'ktp_infekt'], workMin: [15, 25],
    patients: { count: [1, 1], doctorProb: 0, departments: ['innere'] },
    variants: [
      {
        label: 'Strahlentherapie', weight: 0.6,
        sh: { keyword: 'KBF AMBU', meldebild: 'Bestrahlung' },
        openings: ['Ich brauche für meine Mutter einen Liegendtransport zur Bestrahlung, sie hat Termine die ganze Woche.'],
        facts: {
          what: 'Transport zur ambulanten Strahlentherapie mit Rückfahrt.',
          target: 'Von zuhause zur Strahlentherapie am Klinikum und danach wieder heim.',
          mobility: 'Liegend, sie ist sehr geschwächt.',
          when: 'Heute um 10:15 Uhr ist die Bestrahlung.',
        },
        patients: { count: [1, 1], doctorProb: 0, departments: ['allgemein'] },
      },
      {
        label: 'PEG-Sonde wechseln', weight: 0.4,
        sh: { keyword: 'KBF AMBU', meldebild: 'Katheterwechsel > PEG - Sonde' },
        openings: ['Hier Pflegeheim am Deich, Wohnbereich 2. Bei unserer Bewohnerin muss die Magensonde in der Klinik gewechselt werden.'],
        facts: {
          what: 'Transport zum ambulanten Wechsel einer PEG-Sonde, Rückfahrt am selben Tag.',
          target: 'Vom Pflegeheim in die Endoskopie der Kreisklinik und zurück ins Heim.',
          mobility: 'Liegend, die Dame ist bettlägerig.',
          when: 'Der Termin ist um 13 Uhr.',
        },
      },
    ],
  },
  {
    id: 'sh_kbf_entlassung', name: 'Entlassung liegend', category: 'ktp', catalogs: ['sh'],
    keyword: 'KBF STANDARD', sh: { keyword: 'KBF STANDARD', meldebild: 'Entlassung' },
    weight: 3, location: 'klinik', time: { day: 2.5, night: 0.1 },
    openings: [
      'Hier ist die Station 3 der Unfallchirurgie, wir haben eine Entlassung, die Patientin muss liegend nach Hause.',
      'Guten Tag, Kreisklinik, Station Innere. Wir brauchen einen Liegendtransport für eine Entlassung.',
      'Wir möchten heute jemanden entlassen, der noch nicht sitzen darf. Können Sie einen Krankenwagen schicken?',
    ],
    facts: {
      what: 'Entlassung aus dem Krankenhaus, liegender Transport.',
      target: oneOf(
        'Von der Klinik nach Hause, Erdgeschosswohnung.',
        'Von der Klinik in die Kurzzeitpflege im Nachbarort.',
        'Vom Krankenhaus zurück ins Pflegeheim.',
        'Von hier über die Fehmarnsundbrücke nach Hause auf die Insel.',
      ),
      mobility: oneOf('Liegend, frisch operierte Hüfte.', 'Liegend, Beckenbruch, konservativ behandelt.', 'Liegend, bettlägerig.'),
      infection: false,
      when: oneOf('Gerne bis 14 Uhr, die Angehörigen sind dann da.', 'Im Laufe des Vormittags.', 'Sobald es geht, das Bett wird gebraucht.'),
      intensive: false,
    },
    keyQuestions: ['ktp_ziel', 'ktp_mobil', 'ktp_infekt'], workMin: [15, 25],
    patients: { count: [1, 1], doctorProb: 0, departments: ['allgemein'] },
    variants: [
      {
        label: 'Verlegung ins Hospiz', weight: 0.3,
        sh: { keyword: 'KBF STANDARD', meldebild: 'Tumorleiden' },
        openings: ['Station Onkologie, wir haben einen Palliativpatienten, der ins Hospiz verlegt werden soll.'],
        facts: {
          what: 'Liegender Transport eines Palliativpatienten ins Hospiz.',
          target: 'Vom Klinikum ins Hospiz an der Förde.',
          mobility: 'Liegend, sehr schwach, eine Schmerzpumpe läuft.',
          when: 'Heute Nachmittag, das Hospiz erwartet ihn ab 15 Uhr.',
        },
      },
    ],
  },
  {
    id: 'sh_kbf_tragestuhl', name: 'Tragestuhltransport', category: 'ktp', catalogs: ['sh'],
    keyword: 'KBF ST', sh: { keyword: 'KBF ST', meldebild: 'Tragestuhltransport' },
    weight: 1.5, location: 'wohn', time: { day: 2.5, night: 0.1 },
    openings: [
      'Mein Vater muss heute zu einem Termin, er kann die Treppe nicht mehr runter. Kann ihn jemand mit dem Tragestuhl holen?',
      'Hier Hausarztpraxis. Eine Patientin von uns wohnt oben ohne Fahrstuhl, sie kann sitzen, aber keine Treppen laufen.',
    ],
    facts: {
      what: 'Transport sitzend im Tragestuhl, Treppenhaus ohne Aufzug.',
      target: oneOf(
        'Aus der Wohnung im 3. Stock zum Facharzt.',
        'Von zuhause zur Aufnahme ins Kreiskrankenhaus.',
        'Aus der Dachgeschosswohnung zur Röntgenpraxis.',
      ),
      mobility: 'Sitzen geht, laufen nicht. Die Treppe ist nicht zu schaffen, deshalb der Tragestuhl.',
      infection: false,
      when: oneOf('Der Termin ist um 11 Uhr.', 'Heute im Laufe des Tages.', 'Morgen um 9:30 Uhr.'),
      intensive: false,
    },
    keyQuestions: ['ktp_mobil', 'ktp_ziel'], workMin: [15, 25],
    patients: { count: [1, 1], doctorProb: 0, departments: ['allgemein'] },
  },
  {
    id: 'sh_kbf_infektion', name: 'Infektionstransport', category: 'ktp', catalogs: ['sh'],
    keyword: 'KBF INF', sh: { keyword: 'KBF INF', meldebild: 'Infektionstransport' },
    weight: 1, location: 'klinik', time: { day: 2, night: 0.1 },
    openings: [
      'Station 5, Isolierzimmer. Wir brauchen einen Transport für einen Patienten, der bei uns isoliert liegt.',
      'Wir brauchen einen Krankentransport, die Patientin ist infektiös, bitte mit Schutzausrüstung kommen.',
      'Hier Kreisklinik, wir haben einen Transport aus der Isolation, die Besatzung muss sich entsprechend schützen.',
    ],
    facts: {
      what: 'Krankentransport eines infektiösen Patienten.',
      target: oneOf('Von der Klinik in die Rehaklinik an der Ostsee.', 'Von der Klinik zurück ins Pflegeheim.', 'Von hier in ein Fachkrankenhaus in der Nachbarstadt.'),
      mobility: 'Liegend.',
      infection: true,
      pathogen: oneOf('4MRGN im Urin', 'Clostridium difficile, Durchfall', 'offene Lungentuberkulose', 'MRSA in einer Wunde', 'Norovirus'),
      when: oneOf('Heute Vormittag.', 'Zwischen 13 und 15 Uhr.'),
      intensive: false,
    },
    keyQuestions: ['ktp_infekt', 'ktp_mobil'], workMin: [30, 50],
    patients: { count: [1, 1], doctorProb: 0, departments: ['innere'] },
    variants: [
      {
        label: 'Infektiös im Tragestuhl', weight: 0.4,
        keyword: 'KBF ST INF', sh: { keyword: 'KBF ST INF', meldebild: 'Infektionstransport' },
        openings: ['Wir bräuchten einen Sitztransport mit Tragestuhl, die Patientin hat aber MRSA im Nasenabstrich.'],
        facts: {
          target: 'Von der Klinik nach Hause, zweiter Stock ohne Fahrstuhl.',
          mobility: 'Sie kann sitzen, aber keine Treppen laufen – also Tragestuhl.',
          pathogen: 'MRSA im Nasen-Rachen-Abstrich',
        },
      },
      {
        label: 'Dialyse mit Keimbesiedelung', weight: 0.4,
        keyword: 'KBF AMBU INF', sh: { keyword: 'KBF AMBU INF', meldebild: 'Dialysetransport' },
        openings: ['Wir brauchen den Transport zur Dialyse und zurück, der Patient ist mit 3MRGN besiedelt.'],
        facts: {
          what: 'Dialysefahrt mit Rückfahrt, Patient mit Keimbesiedelung.',
          target: 'Von der Station zur Dialyse im Nierenzentrum und wieder zurück.',
          pathogen: '3MRGN',
        },
      },
    ],
  },
  {
    id: 'sh_kbf_adipositas', name: 'Adipositastransport', category: 'ktp', catalogs: ['sh'],
    keyword: 'KBF ADIP', sh: { keyword: 'KBF ADIP', meldebild: 'Adipositastransport' },
    weight: 0.4, location: 'wohn', time: { day: 2, night: 0.2 },
    openings: [
      'Mein Bruder muss ins Krankenhaus, der Hausarzt hat eingewiesen. Er wiegt aber über 200 Kilo, das schafft eine normale Trage nicht.',
      'Hier ambulanter Pflegedienst. Unser Patient wiegt über 200 Kilo und muss in die Klinik, wir brauchen einen Schwerlasttransport.',
    ],
    facts: {
      what: 'Krankentransport eines schwergewichtigen Patienten.',
      target: oneOf('Von zuhause ins Kreiskrankenhaus, Einweisung vom Hausarzt.', 'Von der Wohnung ins Klinikum, Aufnahme wegen einer schlecht heilenden Wunde.'),
      mobility: oneOf(
        'Liegend. Ungefähr 205 Kilo, Wohnung im Erdgeschoss.',
        'Liegend, etwa 215 Kilo. Zwei Stufen vor der Haustür.',
      ),
      infection: false,
      when: oneOf('Heute noch, aber nicht dringend.', 'Morgen um 10 Uhr wird er dort erwartet.'),
      intensive: false,
    },
    keyQuestions: ['ktp_mobil', 'ktp_ziel', 'ktp_infekt'], workMin: [30, 50],
    patients: { count: [1, 1], doctorProb: 0, departments: ['innere'] },
    variants: [
      {
        label: 'Über 230 kg, Obergeschoss', weight: 0.6,
        keyword: 'KBF ADIP G', sh: { keyword: 'KBF ADIP G', meldebild: 'Adipositastransport' },
        openings: ['Meine Frau muss ins Krankenhaus, sie wiegt fast 260 Kilo und wir wohnen im ersten Stock. Das Treppenhaus ist sehr eng.'],
        facts: {
          mobility: 'Liegend, etwa 260 Kilo. Wohnung im 1. Stock, enges Treppenhaus – das schaffen zwei Leute niemals.',
          target: 'Von zuhause in die Klinik, sie hat offene Beine und Fieber.',
        },
        workMin: [60, 100],
      },
    ],
  },
  {
    id: 'sh_kbf_fernfahrt', name: 'Fernfahrt Krankentransport', category: 'ktp', catalogs: ['sh'],
    keyword: 'KBF FERN', sh: { keyword: 'KBF FERN', meldebild: 'Verlegung' },
    weight: 0.3, location: 'klinik', time: { day: 3, night: 0.05 },
    openings: [
      'Hier Rehaklinik an der Ostsee. Ein Urlauber soll heimatnah verlegt werden, liegend, das sind etliche hundert Kilometer.',
      'Wir haben einen Patienten, der nach seinem Unfall im Urlaub in ein Krankenhaus in der Nähe seines Wohnorts verlegt werden soll.',
    ],
    facts: {
      what: 'Heimatnahe Verlegung über eine weite Strecke, liegend.',
      target: oneOf(
        'Von hier nach München, gut 900 Kilometer.',
        'Ins Krankenhaus nach Dortmund, etwa 450 Kilometer.',
        'Nach Leipzig, ungefähr 430 Kilometer.',
      ),
      mobility: 'Liegend, Unterschenkel frisch operiert.',
      infection: false,
      when: 'Morgen früh, Abfahrt gerne um 7 Uhr. Kostenzusage der Kasse liegt vor.',
      intensive: false,
    },
    keyQuestions: ['ktp_ziel', 'ktp_intensiv', 'ktp_infekt'], workMin: [20, 30],
    patients: { count: [1, 1], doctorProb: 0, departments: ['unfallchirurgie'] },
  },
  {
    id: 'sh_kbf_zwang', name: 'Unterbringung gegen den Willen', category: 'ktp', catalogs: ['sh'],
    keyword: 'KBF ZWANG', sh: { keyword: 'KBF ZWANG', meldebild: 'Zwangseinweisung' },
    weight: 0.4, location: 'wohn', time: { day: 1.5, night: 0.6 },
    openings: [
      'Hier ist der Sozialpsychiatrische Dienst. Für einen Mann liegt ein Unterbringungsbeschluss vor, wir brauchen einen Transport in die Psychiatrie und die Polizei.',
      'Ordnungsamt, wir sind vor Ort bei einer Person, die sich und andere gefährdet. Die sofortige Unterbringung ist angeordnet, das ärztliche Zeugnis liegt vor.',
    ],
    facts: {
      what: 'Transport in die psychiatrische Klinik nach angeordneter Unterbringung, gegen den Willen des Patienten.',
      target: oneOf('Von der Wohnung in die Psychiatrie des Kreiskrankenhauses.', 'Ins Zentrum für Psychiatrie in der Nachbarstadt.'),
      mobility: 'Laufen geht, aber die Person will nicht mitkommen. Laut, bisher aber nicht handgreiflich.',
      infection: false,
      when: 'Jetzt, wir warten vor der Tür.',
      intensive: false,
    },
    keyQuestions: ['ktp_ziel', 'ktp_mobil'], workMin: [30, 60],
    patients: { count: [1, 1], doctorProb: 0, departments: ['psychiatrie'] },
    escalation: { prob: 0.15, needs: [need('polizei', 1)], text: 'Patient wehrt sich massiv, weitere Polizeistreife zur Unterstützung angefordert.' },
  },
  {
    id: 'sh_kbf_tragehilfe_dl', name: 'Liegendtransport mit Drehleiter', category: 'ktp', catalogs: ['sh'],
    keyword: 'KBF STANDARD DL', sh: { keyword: 'KBF STANDARD DL' },
    weight: 0.2, location: 'wohn', time: { day: 2, night: 0.3 },
    openings: [
      'Hier ist der Hausarzt. Mein Patient ganz oben im Altbau muss liegend in die Klinik, das Treppenhaus ist so eng gewendelt, da kommt keine Trage durch.',
      'Ich bin die Tochter. Meine Mutter muss ins Krankenhaus, aber im Altbau ist die Treppe viel zu schmal für eine Trage.',
    ],
    facts: {
      what: 'Liegender Krankentransport, Trage passt nicht durchs Treppenhaus.',
      target: 'Aus der Dachwohnung ins Kreiskrankenhaus, Einweisung liegt vor.',
      mobility: oneOf(
        'Nur liegend, Wirbelbruch. Wohnung im 4. Obergeschoss unterm Dach, Wendeltreppe.',
        'Liegend, Sitzen geht gar nicht. Dachgeschoss, das Treppenhaus ist zu eng für eine Trage.',
      ),
      infection: false,
      when: 'Heute, möglichst am Vormittag.',
      intensive: false,
    },
    keyQuestions: ['ktp_mobil', 'ktp_ziel'], workMin: [40, 70],
    patients: { count: [1, 1], doctorProb: 0, departments: ['unfallchirurgie'] },
  },

  // ------------------------------------------------------------------ WEITERLEITUNGEN (kein Einsatz)
  {
    id: 'sh_w_aebd', name: 'Bagatelle für den Bereitschaftsdienst', category: 'rd', catalogs: ['sh'],
    keyword: 'W ÄBD', sh: { keyword: 'W ÄBD', meldebild: 'Hausärztliches Anliegen (Bagatelle)' },
    weight: 2, location: 'wohn', time: { night: 2, day: 0.7 },
    openings: [
      'Ich hab seit drei Tagen Rückenschmerzen und mein Hausarzt hat Urlaub. Kann da mal jemand vorbeikommen?',
      'Mir tut seit ein paar Tagen der Rücken weh, die Praxis hat zu. Was soll ich jetzt machen?',
    ],
    facts: {
      what: 'Kein Notfall, gesundheitliches Anliegen für den ärztlichen Bereitschaftsdienst.',
      age: range(30, 75),
      conscious: true,
      breathing: 'normal',
      symptoms: 'Rückenschmerzen seit ein paar Tagen, kein Taubheitsgefühl, laufen geht.',
      history: oneOf('Nichts Besonderes.', 'Bluthochdruck, sonst nichts.'),
    },
    keyQuestions: ['rd_bewusst', 'rd_atmung', 'rd_beschwerden'], workMin: [2, 5],
    variants: [
      {
        label: 'Sonnenbrand im Urlaub', weight: 0.5,
        openings: ['Wir sind in einer Ferienwohnung an der Ostsee, ich habe mir einen ordentlichen Sonnenbrand geholt. Was soll ich machen?'],
        facts: {
          symptoms: 'Sonnenbrand an Schultern und Rücken, es spannt. Kein Fieber, keine Blasen.',
          age: range(20, 60),
          history: 'Nichts.',
        },
      },
      {
        label: 'Rezept vergessen', weight: 0.4,
        openings: ['Ich brauche ein neues Rezept für meine Blutdrucktabletten, die sind heute alle geworden.'],
        facts: {
          symptoms: 'Eigentlich nichts Akutes, mir sind nur die Tabletten ausgegangen.',
          age: range(50, 80),
          history: 'Bluthochdruck, dafür nehme ich die Tabletten.',
        },
      },
      {
        label: 'Fieber und Husten', weight: 0.4,
        keyword: 'W ÄBD COVID', sh: { keyword: 'W ÄBD COVID', meldebild: 'Hausärztliches Anliegen (Bagatelle)' },
        openings: ['Ich habe seit gestern Fieber und Husten und weiß nicht, ob ich zum Arzt soll.'],
        facts: {
          what: 'Leichter fieberhafter Infekt, kein Notfall.',
          symptoms: 'Fieber 38,4, Husten, Gliederschmerzen. Luft bekomme ich gut.',
          age: range(20, 55),
        },
      },
    ],
  },
  {
    id: 'sh_w_polizei', name: 'Reine Polizeiangelegenheit', category: 'pol', catalogs: ['sh'],
    keyword: 'W POLIZEI', sh: { keyword: 'W POLIZEI', meldebild: 'Anliegen für die Polizei' },
    weight: 1.5, location: 'strasse',
    openings: [
      'Mir hat jemand das Fahrrad vom Bahnhof geklaut, das ist ein ganz teures E-Bike!',
      'Mein Rad ist weg, das Schloss liegt durchgeknipst am Ständer!',
    ],
    facts: {
      what: 'Diebstahl eines Fahrrads.',
      persons: 'Nur ich, der Dieb ist längst weg.',
      weapon: false,
      injured: 0,
    },
    keyQuestions: ['verletzt', 'p_waffe'], workMin: [2, 4],
    variants: [
      {
        label: 'Zugeparkte Einfahrt', weight: 0.6,
        openings: ['Da parkt seit zwei Stunden einer genau vor meiner Einfahrt und ich komme nicht raus.'],
        facts: { what: 'Zugeparkte Grundstücksausfahrt.', persons: 'Niemand da, nur das fremde Auto.' },
      },
      {
        label: 'Unfallflucht mit Sachschaden', weight: 0.6,
        openings: ['Am Hafen hat einer mein Auto angefahren und ist einfach weggefahren. Verletzt ist niemand.'],
        facts: { what: 'Unfallflucht mit Sachschaden.', persons: 'Ich alleine, der andere ist abgehauen.' },
      },
    ],
  },
  {
    id: 'sh_w_vamt', name: 'Tierfund für das Veterinäramt', category: 'tier', catalogs: ['sh'],
    keyword: 'W V-AMT', sh: { keyword: 'W V-AMT' },
    weight: 0.6, location: 'land', time: { day: 2, night: 0.2 },
    openings: [
      'Am Teich liegen drei tote Schwäne, das sieht nicht gut aus. Ist das nicht diese Vogelgrippe?',
      'Am Ufer vom See liegen mehrere tote Schwäne. Wen muss ich da anrufen?',
    ],
    facts: {
      what: 'Fund toter Wildvögel, Verdacht auf Geflügelpest.',
      animal: 'Mehrere Schwäne.',
      situation: 'Die sind schon tot und liegen am Ufer. Es lebt keiner mehr, wir haben nichts angefasst.',
    },
    keyQuestions: ['t_tier', 't_lage'], workMin: [2, 4],
    variants: [
      {
        label: 'Tote Schafe auf der Weide', weight: 0.5,
        openings: ['Auf der Weide liegen zwei tote Schafe, ein Besitzer ist nirgends zu sehen. Wen muss ich da anrufen?'],
        facts: {
          what: 'Fund toter Nutztiere auf einer Weide.',
          animal: 'Zwei Schafe.',
          situation: 'Die liegen tot im Gras, die anderen Schafe stehen ganz normal daneben.',
        },
      },
      {
        label: 'Tote Seevögel am Strand', weight: 0.5,
        openings: ['Am Strand liegen ein paar tote Möwen und Enten nebeneinander, das ist doch nicht normal.'],
        facts: {
          animal: 'Möwen und Wildenten.',
          situation: 'Tot am Spülsaum, Menschen sind nicht in Gefahr. Die Hunde halten wir weg.',
        },
      },
    ],
  },
  {
    id: 'sh_w_oamt', name: 'Ruhestörung für das Ordnungsamt', category: 'sonstiges', catalogs: ['sh'],
    keyword: 'W O-AMT', sh: { keyword: 'W O-AMT' },
    weight: 1, location: 'wohn', time: { night: 3, day: 0.5 },
    openings: [
      'Im Ferienhaus nebenan läuft seit Stunden laute Musik, das geht jetzt jedes Wochenende so!',
      'Die Urlauber nebenan feiern schon wieder bis in die Nacht, ich kann nicht schlafen!',
    ],
    facts: {
      what: 'Lärmbelästigung, kein Notfall.',
      help: 'Nur laute Musik und Gelächter, gestritten wird nicht, es ist niemand in Gefahr.',
      injured: 0,
    },
    keyQuestions: ['s_lage', 'verletzt'], workMin: [2, 4],
    variants: [
      {
        label: 'Baulärm am Sonntag', weight: 0.4,
        openings: ['Auf der Baustelle gegenüber wird am Sonntag gehämmert und gebohrt, darf das überhaupt sein?'],
        facts: { help: 'Baulärm. Es ist niemand verletzt, nichts brennt, es ist einfach nur laut.' },
      },
      {
        label: 'Dauerbellender Hund', weight: 0.4,
        openings: ['Der Hund vom Nachbarn bellt seit dem frühen Morgen ununterbrochen, die Leute sind wohl verreist.'],
        facts: { help: 'Der Hund bellt nur, er hat Wasser im Napf und wirkt nicht verletzt.' },
      },
    ],
  },

  // ------------------------------------------------------------------ BETREUUNG
  {
    id: 'sh_psnv_todesfall', name: 'Betreuung nach plötzlichem Todesfall', category: 'sonstiges', catalogs: ['sh'],
    keyword: 'SOKO PSNV-B HAUS', sh: { keyword: 'SOKO PSNV-B HAUS', meldebild: 'Betreuung Angehöriger nach Todesfall' },
    weight: 0.4, location: 'wohn',
    openings: [
      'Hier ist die RTW-Besatzung, wir haben die Reanimation abgebrochen. Die Ehefrau ist alleine und völlig aufgelöst, wir bräuchten das Kriseninterventionsteam.',
    ],
    facts: {
      what: 'Plötzlicher Todesfall im häuslichen Umfeld, Angehörige benötigen Betreuung.',
      help: 'Der Ehemann ist beim Frühstück zusammengebrochen, die Reanimation war erfolglos. Die Frau ist allein, die Kinder wohnen weit weg.',
      injured: 0,
    },
    keyQuestions: ['s_lage'], workMin: [90, 180],
    variants: [
      {
        label: 'Überbringung einer Todesnachricht', weight: 0.6,
        openings: ['Polizei hier, wir haben eine Todesnachricht überbracht. Die Mutter ist zusammengebrochen, können Sie jemanden zur Betreuung schicken?'],
        facts: { help: 'Der Sohn ist auf der Bundesstraße tödlich verunglückt. Die Eltern sind fassungslos.' },
      },
      {
        label: 'Plötzlicher Kindstod', weight: 0.3,
        openings: ['Hier ist der Notarzt. Wir mussten bei einem Säugling die Reanimation einstellen, die Familie braucht dringend Betreuung.'],
        facts: { help: 'Säugling morgens leblos im Bett gefunden. Die Eltern und ein Geschwisterkind sind vor Ort.' },
      },
    ],
  },

  // ------------------------------------------------------------------ POLIZEILAGEN MIT BEREITSTELLUNG
  {
    id: 'sh_pol_bombendrohung', name: 'Bombendrohung', category: 'pol', catalogs: ['sh'],
    keyword: 'POL BOMBE', sh: { keyword: 'POL BOMBE', meldebild: 'Bombendrohung' },
    weight: 0.1, location: 'oeffentlich', time: { day: 2.5, night: 0.3 },
    openings: [
      'Hier ist die Polizei-Einsatzleitstelle. An einer Gesamtschule ist eine Bombendrohung per Mail eingegangen, wir räumen. Bitte RTW und Feuerwehr in Bereitstellung.',
    ],
    facts: {
      what: 'Bombendrohung, Gebäude wird geräumt.',
      persons: 'Rund 800 Schüler und Lehrer, die gehen gerade auf den Sportplatz.',
      weapon: false,
      injured: 0,
    },
    keyQuestions: ['p_beteiligte', 'verletzt'], workMin: [60, 150],
    escalation: { prob: 0.1, needs: [need('rtw', 1)], text: 'Bei der Räumung ist eine Person kollabiert, weiterer RTW angefordert.', extraPatients: 1 },
    variants: [
      {
        label: 'Fährterminal', weight: 0.5,
        openings: ['Ich bin die Schichtleiterin am Fähranleger, hier hat eben ein Anrufer gesagt, im Terminal liegt eine Bombe!'],
        facts: { persons: 'Etwa 200 Reisende im Terminal und auf dem Vorplatz, wir schicken alle raus.' },
      },
      {
        label: 'Rathaus', weight: 0.4,
        openings: ['Polizei, Einsatzleitstelle. Im Rathaus ist ein Drohschreiben eingegangen, das Gebäude wird geräumt. Bitte Feuerwehr und RTW in Bereitstellung.'],
        facts: { persons: 'Das Rathaus mit ungefähr 120 Beschäftigten und ein paar Besuchern.' },
      },
    ],
  },
  {
    id: 'sh_pol_usbv_bahnhof', name: 'Verdächtiger Gegenstand am Bahnhof', category: 'pol', catalogs: ['sh'],
    keyword: 'POL USBV', sh: { keyword: 'POL USBV', meldebild: 'Verdächtiger Gegenstand' },
    weight: 0.15, location: 'oeffentlich', time: { day: 2, night: 0.5 },
    openings: [
      'Bundespolizei am Hauptbahnhof. Am Gleis 3 steht ein herrenloser Koffer, aus dem Drähte rausgucken. Wir sperren, bitte Feuerwehr und RTW in Bereitstellung.',
      'Hier ist der Fahrdienstleiter, im Wartehäuschen am Bahnsteig liegt ein Rucksack, der tickt angeblich.',
    ],
    facts: {
      what: 'Verdächtiger Gegenstand, möglicherweise eine Spreng- oder Brandvorrichtung.',
      persons: oneOf(
        'Der Bahnsteig ist geräumt, etwa 60 Reisende stehen am Vorplatz.',
        'Ein Regionalzug mit rund 150 Fahrgästen steht am Gleis und wird evakuiert.',
      ),
      weapon: false,
      injured: 0,
    },
    keyQuestions: ['p_beteiligte', 'verletzt'], workMin: [60, 180],
    escalation: { prob: 0.1, needs: [need('loeschen', 1), need('fuehrung_1', 1)], text: 'Entschärfer bestätigt Sprengvorrichtung, Absperrradius wird erweitert – weiteres LF und Führungsunterstützung.' },
    variants: [
      {
        label: 'Fährterminal', weight: 0.5,
        openings: ['Hafensicherheit am Fährterminal. Im Abfertigungsbereich steht ein herrenloser Karton mit Klebeband und Kabeln. Die Polizei ist informiert.'],
        facts: {
          persons: 'Der Abfertigungsbereich ist geräumt, etwa 120 Reisende und ein Dutzend LKW-Fahrer warten draußen.',
        },
      },
    ],
  },
  {
    id: 'sh_pol_sek', name: 'SEK-Einsatz mit Bereitstellung', category: 'pol', catalogs: ['sh'],
    keyword: 'POL SEK', sh: { keyword: 'POL SEK', meldebild: 'Polizeieinsatz mit Bereitstellung RD' },
    weight: 0.1, location: 'wohn', time: { day: 0.6, night: 1.8 },
    openings: [
      'Hier Polizei-Einsatzleitstelle. Wir haben gleich einen Zugriff mit Spezialkräften in einem Einfamilienhaus, der Mann soll bewaffnet sein. Bitte RTW und Notarzt verdeckt in den Bereitstellungsraum.',
    ],
    facts: {
      what: 'Polizeilicher Spezialeinsatz, Rettungsdienst in Bereitstellung.',
      persons: 'Ein Tatverdächtiger im Haus, eventuell noch seine Lebensgefährtin.',
      weapon: true,
      injured: 0,
    },
    keyQuestions: ['p_beteiligte', 'p_waffe'], workMin: [60, 180],
    escalation: { prob: 0.3, needs: [need('rtw', 1)], text: 'Beim Zugriff wurde eine Person verletzt, Patientenübergabe an den bereitgestellten Rettungsdienst, zweiter RTW angefordert.', extraPatients: 1 },
    variants: [
      {
        label: 'Verbarrikadierter Mann', weight: 0.6,
        openings: ['Polizei, Führungsstelle. Ein Mann hat sich in seiner Wohnung verbarrikadiert und droht mit einem Messer. Das SEK ist angefordert, wir brauchen Rettungsdienst in Bereitstellung.'],
        facts: { persons: 'Ein Mann allein in der Wohnung, die Nachbarn sind evakuiert.' },
      },
    ],
  },
];
