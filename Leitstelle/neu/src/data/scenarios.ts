import type { AaoRequirement, KeywordCategory, Weather } from '../model/types';
import type { FactValue } from './questions';
import { oneOf, range, need } from './scenarioHelpers';
import { SH_SCENARIO_MAP } from './sh/scenarioMap';
import { SH_SCENARIOS } from './sh/scenarios';

/**
 * Szenariokatalog. Jedes Szenario beschreibt einen Einsatzgrundtyp mit
 *  - Eröffnungssätzen des Anrufers (zufällig gewählt),
 *  - verdeckten Fakten (zufällig parametrisiert), die erst durch Abfrage sichtbar werden,
 *  - dem "richtigen" Stichwort (Spielwahrheit, steuert den tatsächlichen Bedarf),
 *  - Patienten, Arbeitsumfang und möglicher Lageentwicklung (Eskalation),
 *  - Varianten, die Fakten/Stichwort/Patienten überschreiben.
 *
 * Der Katalog ist Code (nicht Teil des Spielstands); Spielstände referenzieren Szenarien per ID.
 */

export type FactSpec = FactValue | { oneOf: FactValue[] } | { range: [number, number] };

export interface PatientSpec {
  /** feste Spanne oder Name eines Fakts (z. B. "injured") */
  count: [number, number] | string;
  doctorProb: number;
  departments: string[];
  /** Wahrscheinlichkeit, dass ein Patient nach Versorgung nicht transportiert werden muss */
  noTransportProb?: number;
}

export interface EscalationSpec {
  prob: number;
  needs: AaoRequirement[];
  text: string;
  /** zusätzliche Patienten */
  extraPatients?: number;
}

/** Lösung im Katalog Schleswig-Holstein: Stichwort-Code und passendes Meldebild (Bezeichnung) */
export interface ShTruth {
  keyword: string;
  meldebild?: string;
}

export interface VariantDef {
  label: string;
  weight?: number;
  keyword?: string;
  sh?: ShTruth;
  openings?: string[];
  facts?: Record<string, FactSpec>;
  patients?: PatientSpec | null;
  escalation?: EscalationSpec | null;
  workMin?: [number, number];
}

export type LocationKind = 'wohn' | 'strasse' | 'land' | 'gewerbe' | 'wasser' | 'oeffentlich' | 'klinik';

export interface ScenarioDef {
  id: string;
  name: string;
  category: KeywordCategory;
  keyword: string;
  /** Lösung im SH-Katalog (aus data/sh/scenarioMap.ts ergänzt) */
  sh?: ShTruth;
  /** Nur in diesen Katalogen verwenden (leer = alle) */
  catalogs?: string[];
  weight: number;
  location: LocationKind;
  openings: string[];
  facts: Record<string, FactSpec>;
  /** Fragen, nach deren Beantwortung die Abfragehilfe ein Stichwort vorschlägt */
  keyQuestions: string[];
  patients?: PatientSpec;
  workMin: [number, number];
  escalation?: EscalationSpec;
  variants?: VariantDef[];
  /** Multiplikatoren nach Tageszeit */
  time?: { day?: number; night?: number };
  weather?: Partial<Record<Weather, number>>;
}

export { oneOf, range, need };

const PAT_LIGHT: PatientSpec = { count: 'injured', doctorProb: 0.1, departments: ['unfallchirurgie'], noTransportProb: 0.3 };

const BASE_SCENARIOS: ScenarioDef[] = [
  // ------------------------------------------------------------------ BRAND
  {
    id: 'brand_muell', name: 'Mülltonnenbrand', category: 'brand', keyword: 'B 1', weight: 6, location: 'wohn',
    openings: ['Hier brennt eine Mülltonne direkt an der Hauswand!', 'Bei uns im Hof brennen die Mülltonnen!', 'Da kokelt ein Müllcontainer vor sich hin, das stinkt fürchterlich.'],
    facts: { what: 'Mülltonnen brennen.', object: oneOf('Eine Papiertonne.', 'Zwei Restmülltonnen.', 'Ein Gelber-Sack-Haufen.'), smoke: 'Ja, Flammen ungefähr einen Meter hoch.', trapped: false, injured: 0, spreading: oneOf(false, false, true), floor: 'Im Hof, draußen.' },
    keyQuestions: ['b_objekt', 'b_ausbreitung'], workMin: [10, 20], time: { night: 2 },
    escalation: { prob: 0.08, needs: [need('loeschen', 1)], text: 'Feuer droht auf Fassade überzugreifen, benötige weiteres Löschfahrzeug.' },
  },
  {
    id: 'brand_pkw', name: 'PKW-Brand', category: 'brand', keyword: 'B 1', weight: 5, location: 'strasse',
    openings: ['Hier brennt ein Auto am Straßenrand!', 'Mein Auto qualmt unter der Motorhaube und jetzt kommen Flammen raus!'],
    facts: { what: 'Ein PKW brennt.', object: oneOf('Ein Kleinwagen.', 'Ein Kombi, abgestellt.', 'Ein Elektroauto!'), smoke: 'Schwarzer Rauch aus dem Motorraum.', trapped: false, injured: oneOf(0, 0, 1), spreading: false },
    keyQuestions: ['b_objekt', 'b_personen'], workMin: [15, 30], patients: PAT_LIGHT,
    variants: [{ label: 'Elektrofahrzeug', facts: { object: 'Ein Elektroauto, die Batterie zischt.' }, workMin: [40, 70], escalation: { prob: 0.4, needs: [need('wasser_gross', 1)], text: 'Batteriebrand, erhöhter Löschwasserbedarf – TLF nachgefordert.' } }],
  },
  {
    id: 'brand_container', name: 'Containerbrand', category: 'brand', keyword: 'B 1', weight: 2, location: 'gewerbe',
    openings: ['Auf der Baustelle brennt ein Container.', 'Ein Bauschuttcontainer steht in Flammen.'],
    facts: { what: 'Ein Container brennt.', object: oneOf('Bauschuttcontainer.', 'Altkleidercontainer.', 'Wertstoffcontainer.'), smoke: 'Dichter Rauch.', trapped: false, injured: 0, spreading: false },
    keyQuestions: ['b_objekt'], workMin: [15, 30],
  },
  {
    id: 'brand_kueche', name: 'Küchenbrand in Wohnung', category: 'brand', keyword: 'B 3', weight: 4, location: 'wohn',
    openings: ['In der Wohnung über mir brennt es, aus dem Fenster kommt Rauch!', 'Meine Pfanne hat Feuer gefangen und jetzt brennt die Küche!'],
    facts: { what: 'Küchenbrand in einer Wohnung.', object: 'Die Küche, angefangen hat es am Herd.', smoke: 'Rauch aus dem Küchenfenster.', trapped: false, injured: oneOf(0, 1), floor: oneOf('2. Obergeschoss.', '1. Obergeschoss.', 'Erdgeschoss.', '3. Obergeschoss.'), spreading: oneOf(false, true) },
    keyQuestions: ['b_personen', 'b_stock'], workMin: [30, 50],
    patients: { count: 'injured', doctorProb: 0.2, departments: ['innere', 'verbrennung'], noTransportProb: 0.2 },
    variants: [
      { label: 'Person in Wohnung', weight: 0.4, keyword: 'B 3 Y', facts: { trapped: true, injured: 1 }, patients: { count: [1, 2], doctorProb: 0.7, departments: ['verbrennung', 'innere'] } },
    ],
    escalation: { prob: 0.1, needs: [need('loeschen', 1), need('rtw', 1)], text: 'Brandausbreitung in Nachbarwohnung, weitere Kräfte erforderlich.', extraPatients: 1 },
  },
  {
    id: 'brand_keller', name: 'Kellerbrand Mehrfamilienhaus', category: 'brand', keyword: 'B 3', weight: 3, location: 'wohn',
    openings: ['Aus unserem Keller kommt ganz dicker Rauch, das ganze Treppenhaus ist voll!', 'Im Mehrfamilienhaus brennt es im Keller!'],
    facts: { what: 'Brand im Keller eines Mehrfamilienhauses.', object: 'Kellerabteil, vermutlich Sperrmüll.', smoke: 'Das ganze Treppenhaus ist verraucht.', trapped: false, injured: 0, floor: 'Keller, Rauch bis ins 3. OG.', spreading: true },
    keyQuestions: ['b_personen', 'b_rauch'], workMin: [40, 70],
    patients: { count: 'injured', doctorProb: 0.3, departments: ['innere'] },
    variants: [{ label: 'Bewohner im Treppenhaus eingeschlossen', weight: 0.5, keyword: 'B 3 Y', facts: { trapped: true, injured: 2 }, patients: { count: [1, 3], doctorProb: 0.5, departments: ['innere', 'intensiv'] } }],
    escalation: { prob: 0.15, needs: [need('atemschutz', 1), need('loeschen', 1)], text: 'Hoher Atemschutzverbrauch, GW-A und weiteres LF nachgefordert.' },
  },
  {
    id: 'brand_dachstuhl', name: 'Dachstuhlbrand', category: 'brand', keyword: 'B 4', weight: 1.5, location: 'wohn',
    openings: ['Bei meinem Nachbarn brennt das Dach lichterloh!', 'Aus dem Dach eines Hauses schlagen Flammen!'],
    facts: { what: 'Dachstuhl brennt.', object: 'Der Dachstuhl eines Mehrfamilienhauses.', smoke: 'Flammen schlagen aus dem Dach.', trapped: oneOf(false, false, true), injured: oneOf(0, 1), floor: 'Dachgeschoss.', spreading: true },
    keyQuestions: ['b_objekt', 'b_ausbreitung'], workMin: [90, 150],
    patients: { count: 'injured', doctorProb: 0.4, departments: ['verbrennung', 'innere'] },
    escalation: { prob: 0.3, needs: [need('hoehenrettung', 1), need('loeschen', 2)], text: 'Brand greift auf Nachbargebäude über, zweite DLK und zwei LF nachgefordert.' },
  },
  {
    id: 'brand_efh', name: 'Brand Einfamilienhaus', category: 'brand', keyword: 'B 3', weight: 2, location: 'wohn',
    openings: ['Das Haus gegenüber brennt!', 'Bei uns im Wohnzimmer brennt es, wir sind raus!'],
    facts: { what: 'Brand in einem Einfamilienhaus.', object: oneOf('Das Wohnzimmer.', 'Der Wintergarten.', 'Ein Kinderzimmer.'), smoke: 'Flammen hinter dem Fenster.', trapped: false, injured: oneOf(0, 1), floor: oneOf('Erdgeschoss.', 'Obergeschoss.'), spreading: oneOf(true, false) },
    keyQuestions: ['b_personen', 'b_ausbreitung'], workMin: [45, 80],
    patients: { count: 'injured', doctorProb: 0.3, departments: ['verbrennung', 'innere'] },
    variants: [{ label: 'Kind vermisst', weight: 0.3, keyword: 'B 3 Y', facts: { trapped: true }, patients: { count: [1, 1], doctorProb: 1, departments: ['paediatrie', 'verbrennung'] } }],
  },
  {
    id: 'brand_scheune', name: 'Scheunenbrand', category: 'brand', keyword: 'B 4', weight: 1, location: 'land',
    openings: ['Auf dem Hof brennt die Scheune, voll mit Heu!', 'Da hinten am Feldrand steht eine Scheune in Vollbrand.'],
    facts: { what: 'Scheune brennt.', object: 'Scheune mit Heu und Stroh, eventuell Maschinen.', smoke: 'Riesige Rauchsäule, kilometerweit sichtbar.', trapped: false, injured: 0, spreading: true },
    keyQuestions: ['b_objekt'], workMin: [120, 240], weather: { hitze: 2 },
    escalation: { prob: 0.25, needs: [need('wasser_gross', 1), need('logistik', 1)], text: 'Wasserversorgung über lange Wegstrecke nötig – Tanklöschfahrzeug und Logistik nachgefordert.' },
  },
  {
    id: 'brand_gewerbe', name: 'Brand Gewerbehalle', category: 'brand', keyword: 'B 4', weight: 1, location: 'gewerbe',
    openings: ['In unserer Lagerhalle brennt es, der Rauch kommt aus dem Dach!', 'Bei der Firma im Gewerbegebiet brennt eine Halle!'],
    facts: { what: 'Brand in einer Gewerbehalle.', object: oneOf('Lagerhalle mit Paletten.', 'Produktionshalle Kunststoff.', 'Werkstatt mit Gasflaschen!'), smoke: 'Schwarzer Rauch aus dem Hallendach.', trapped: oneOf(false, false, true), injured: oneOf(0, 1, 2), spreading: true },
    keyQuestions: ['b_objekt', 'b_personen'], workMin: [120, 200],
    patients: { count: 'injured', doctorProb: 0.4, departments: ['verbrennung', 'unfallchirurgie'] },
    escalation: { prob: 0.3, needs: [need('gefahrgut', 1), need('loeschen', 2)], text: 'Gasflaschen in der Halle – Gefahrgutzug und zwei weitere LF nachgefordert.' },
  },
  {
    id: 'brand_bma', name: 'Brandmeldeanlage', category: 'brand', keyword: 'B BMA', weight: 4, location: 'gewerbe',
    openings: ['Automatischer Alarm: Brandmeldeanlage ausgelöst.', 'Hier ist der Haustechniker, bei uns hat die Brandmeldeanlage ausgelöst.'],
    facts: { what: 'Brandmeldeanlage hat ausgelöst.', object: oneOf('Unbekannt, Melder im 2. OG.', 'Rauchmelder in der Küche des Pflegeheims.', 'Melder im Serverraum.'), smoke: 'Kein Rauch sichtbar.', trapped: false, injured: 0, spreading: false },
    keyQuestions: ['b_objekt'], workMin: [10, 25],
    variants: [
      { label: 'Täuschungsalarm', weight: 3, workMin: [5, 15] },
      { label: 'Tatsächlicher Brand', weight: 0.5, facts: { smoke: 'Jetzt sehe ich Rauch im Flur!' }, workMin: [40, 70], escalation: { prob: 0.9, needs: [need('loeschen', 2), need('rtw', 1)], text: 'Bestätigter Brand im Objekt, Alarmstufe erhöht.', extraPatients: 1 } },
    ],
  },
  {
    id: 'brand_wald', name: 'Wald- oder Flächenbrand', category: 'brand', keyword: 'B WALD', weight: 1.5, location: 'land',
    openings: ['Am Waldrand brennt es, das Feuer läuft über das Feld!', 'Die Böschung an der Bahnlinie brennt.'],
    facts: { what: 'Vegetationsbrand.', object: oneOf('Getreidefeld, ca. 1 Hektar.', 'Unterholz am Waldrand.', 'Böschung, ca. 200 m².'), smoke: 'Weißgrauer Rauch, Wind treibt ihn Richtung Ort.', trapped: false, injured: 0, spreading: true },
    keyQuestions: ['b_objekt', 'b_ausbreitung'], workMin: [60, 150], weather: { hitze: 5, regen: 0.1, schnee: 0, gewitter: 0.5 },
    escalation: { prob: 0.3, needs: [need('loeschen', 2), need('wasser_gross', 1)], text: 'Feuer breitet sich durch Wind schnell aus, zwei LF und ein TLF nachgefordert.' },
  },
  {
    id: 'brand_kamin', name: 'Kaminbrand', category: 'brand', keyword: 'B KAMIN', weight: 1, location: 'wohn',
    openings: ['Aus unserem Schornstein kommen Funken und Flammen!', 'Bei uns brennt der Kamin, es knistert in der Wand!'],
    facts: { what: 'Schornsteinbrand.', object: 'Der Schornstein vom Holzofen.', smoke: 'Funkenflug aus dem Schornstein.', trapped: false, injured: 0, spreading: false },
    keyQuestions: ['b_objekt'], workMin: [40, 70], weather: { schnee: 4, klar: 1 }, time: { night: 1.5 },
  },
  {
    id: 'brand_rm', name: 'Heimrauchmelder', category: 'brand', keyword: 'B RM', weight: 3, location: 'wohn',
    openings: ['In der Nachbarwohnung piept seit Minuten der Rauchmelder und keiner macht auf.', 'Der Rauchmelder im Flur geht die ganze Zeit.'],
    facts: { what: 'Ein Rauchmelder piept in einer Wohnung.', object: 'Ich weiß nicht, ob es überhaupt brennt.', smoke: 'Ich rieche vielleicht etwas Angebranntes.', trapped: oneOf(false, true), injured: 0, floor: oneOf('1. OG links.', '2. OG rechts.', 'Dachgeschoss.') },
    keyQuestions: ['b_rauch', 'b_personen'], workMin: [15, 30], time: { night: 1.5 },
    variants: [
      { label: 'Essen auf Herd, Bewohner schläft', weight: 1, patients: { count: [1, 1], doctorProb: 0.1, departments: ['innere'], noTransportProb: 0.5 } },
      { label: 'Batterie leer', weight: 1, workMin: [10, 15] },
    ],
  },
  {
    id: 'brand_unklar', name: 'Unklare Rauchentwicklung', category: 'brand', keyword: 'B UNKLAR', weight: 2, location: 'oeffentlich',
    openings: ['Ich sehe da hinten eine Rauchsäule, weiß aber nicht genau, was brennt.', 'Es riecht im ganzen Viertel nach Rauch.'],
    facts: { what: 'Rauch aus unklarer Quelle.', object: 'Kann ich nicht erkennen.', smoke: 'Grauer Rauch hinter den Häusern.', trapped: false, injured: 0, spreading: oneOf(false, true) },
    keyQuestions: ['b_rauch'], workMin: [15, 30],
    variants: [
      { label: 'Gartenfeuer', weight: 2, workMin: [10, 20] },
      { label: 'Gartenlaube brennt', weight: 1, escalation: { prob: 0.6, needs: [need('loeschen', 1)], text: 'Gartenlaube in Vollbrand, weiteres LF.' } },
    ],
  },
  {
    id: 'brand_lkw', name: 'LKW-Brand', category: 'brand', keyword: 'B 2', weight: 1, location: 'strasse',
    openings: ['Ein Lastwagen brennt auf der Landstraße!', 'Bei einem Sattelzug brennen die Reifen!'],
    facts: { what: 'LKW-Brand.', object: oneOf('Reifen der Hinterachse.', 'Führerhaus.', 'Ladung: Kartonagen.'), smoke: 'Schwarzer Rauch.', trapped: false, injured: 0, spreading: oneOf(true, false) },
    keyQuestions: ['b_objekt'], workMin: [40, 80],
    escalation: { prob: 0.15, needs: [need('wasser_gross', 1), need('polizei', 1)], text: 'Ladung brennt durch, Vollsperrung und TLF erforderlich.' },
  },
  {
    id: 'brand_elektro', name: 'Brand Elektroverteiler', category: 'brand', keyword: 'B 2', weight: 1, location: 'gewerbe',
    openings: ['Aus dem Stromkasten im Keller kommen Funken und Rauch!', 'Der Sicherungskasten raucht!'],
    facts: { what: 'Elektrobrand.', object: 'Unterverteilung im Keller.', smoke: 'Beißender Rauch.', trapped: false, injured: 0, spreading: false },
    keyQuestions: ['b_objekt'], workMin: [25, 45],
  },
  {
    id: 'brand_balkon', name: 'Balkonbrand', category: 'brand', keyword: 'B 2', weight: 1.5, location: 'wohn',
    openings: ['Auf einem Balkon brennt es, da stehen Möbel in Flammen!'],
    facts: { what: 'Brand auf einem Balkon.', object: 'Gartenmöbel und Sonnenschirm.', smoke: 'Flammen bis zum Balkon darüber.', trapped: false, injured: 0, floor: oneOf('2. OG.', '4. OG.', '6. OG.'), spreading: oneOf(true, false) },
    keyQuestions: ['b_stock', 'b_ausbreitung'], workMin: [25, 45],
    escalation: { prob: 0.15, needs: [need('hoehenrettung', 1)], text: 'Brand im oberen Geschoss, Drehleiter wird benötigt.' },
  },
  // ------------------------------------------------------------------ TECHNISCHE HILFE
  {
    id: 'th_baum', name: 'Baum auf Straße', category: 'th', keyword: 'TH 1', weight: 3, location: 'strasse',
    openings: ['Hier liegt ein Baum quer über der Straße!', 'Ein großer Ast ist auf die Fahrbahn gekracht.'],
    facts: { what: 'Baum blockiert Fahrbahn.', help: 'Der Baum muss weggeräumt werden.', trapped: false, hazard: oneOf('Nein.', 'Autos weichen auf den Gehweg aus.'), injured: 0 },
    keyQuestions: ['th_hilfe', 'th_personen'], workMin: [20, 40], weather: { gewitter: 6, regen: 1.5, schnee: 2 },
    variants: [{ label: 'Baum auf PKW', weight: 0.3, keyword: 'TH Y', facts: { trapped: true, injured: 1, help: 'Der Baum liegt auf einem Auto, da sitzt noch jemand drin!' }, patients: { count: [1, 1], doctorProb: 0.8, departments: ['unfallchirurgie'] } }],
  },
  {
    id: 'th_oel', name: 'Ölspur', category: 'th', keyword: 'TH OEL', weight: 3, location: 'strasse',
    openings: ['Auf der Straße ist eine lange Ölspur, die Autos rutschen!', 'Ein Lastwagen hat Diesel verloren, alles ist glatt.'],
    facts: { what: 'Ölspur auf der Fahrbahn.', help: 'Die Straße muss abgestreut werden.', trapped: false, hazard: 'Rutschgefahr, besonders für Motorräder.', injured: 0 },
    keyQuestions: ['th_hilfe'], workMin: [30, 60], weather: { regen: 1.5 },
  },
  {
    id: 'th_tuer', name: 'Türöffnung – hilflose Person', category: 'th', keyword: 'TH TUER', weight: 4, location: 'wohn',
    openings: ['Meine Mutter macht nicht auf, ich höre sie aber rufen!', 'Die Nachbarin ist gestürzt, sie liegt hinter der Tür und kommt nicht hoch.'],
    facts: { what: 'Person hilflos hinter verschlossener Tür.', help: 'Die Tür muss geöffnet werden.', trapped: true, hazard: 'Nein.', injured: 1 },
    keyQuestions: ['th_personen'], workMin: [15, 30],
    patients: { count: [1, 1], doctorProb: 0.15, departments: ['unfallchirurgie', 'innere'], noTransportProb: 0.2 },
  },
  {
    id: 'th_wasserschaden', name: 'Wasserschaden', category: 'th', keyword: 'TH WASSER', weight: 2, location: 'wohn',
    openings: ['Bei mir läuft Wasser durch die Decke, oben ist keiner da!', 'Ein Rohr ist geplatzt, das Wasser spritzt überall hin!'],
    facts: { what: 'Wasserschaden in einem Gebäude.', help: 'Wasser muss abgestellt und abgepumpt werden.', trapped: false, hazard: oneOf('Das Wasser läuft in die Steckdosen!', 'Nein.'), injured: 0 },
    keyQuestions: ['th_hilfe'], workMin: [30, 60],
  },
  {
    id: 'th_aufzug', name: 'Person im Aufzug', category: 'th', keyword: 'TH AUFZUG', weight: 2, location: 'wohn',
    openings: ['Ich stecke im Aufzug fest!', 'Im Aufzug unseres Hauses ist jemand eingeschlossen.'],
    facts: { what: 'Personen im steckengebliebenen Aufzug.', help: 'Befreiung aus dem Aufzug.', trapped: true, hazard: oneOf('Nein, aber die Person hat Platzangst.', 'Es ist sehr heiß in der Kabine.'), injured: 0 },
    keyQuestions: ['th_personen'], workMin: [15, 30],
  },
  {
    id: 'th_gas', name: 'Gasgeruch', category: 'th', keyword: 'TH GAS', weight: 2, location: 'wohn',
    openings: ['Im ganzen Treppenhaus riecht es stark nach Gas!', 'Bauarbeiter haben eine Gasleitung beschädigt, es zischt!'],
    facts: { what: 'Gasgeruch.', help: 'Gebäude räumen, Gaszufuhr unterbrechen.', trapped: false, hazard: 'Ja! Es riecht stark nach Gas.', injured: 0 },
    keyQuestions: ['th_gefahr'], workMin: [30, 60],
    variants: [{ label: 'Leitung beschädigt (Baustelle)', weight: 0.5, facts: { hazard: 'Es zischt laut aus dem Boden.' }, escalation: { prob: 0.5, needs: [need('gefahrgut', 1), need('rtw', 1)], text: 'Großflächige Evakuierung notwendig, Gefahrgutkomponente nachgefordert.' } }],
  },
  {
    id: 'th_sturmdach', name: 'Sturmschaden am Dach', category: 'th', keyword: 'TH UNWETTER', weight: 1.5, location: 'wohn',
    openings: ['Bei dem Sturm haben sich Dachziegel gelöst, die fallen auf den Gehweg!', 'Ein Teil vom Blechdach flattert im Wind.'],
    facts: { what: 'Sturmschaden am Dach.', help: 'Lose Teile sichern.', trapped: false, hazard: 'Ja, Teile fallen auf den Gehweg.', injured: 0 },
    keyQuestions: ['th_gefahr'], workMin: [30, 60], weather: { gewitter: 8, regen: 1.5, klar: 0.2 },
  },
  {
    id: 'th_baum_haus', name: 'Baum auf Haus', category: 'th', keyword: 'TH UNWETTER', weight: 0.8, location: 'wohn',
    openings: ['Ein Baum ist auf unser Haus gestürzt!'],
    facts: { what: 'Baum ist auf ein Wohnhaus gestürzt.', help: 'Baum vom Dach entfernen, Dach sichern.', trapped: oneOf(false, false, true), hazard: 'Das Dach ist eingedrückt.', injured: oneOf(0, 0, 1) },
    keyQuestions: ['th_personen', 'th_gefahr'], workMin: [60, 120], weather: { gewitter: 8, regen: 1 },
    patients: PAT_LIGHT,
    escalation: { prob: 0.3, needs: [need('thw_bergung', 1)], text: 'Gebäudestatik fraglich, THW-Bergung nachgefordert.' },
  },
  {
    id: 'th_keller', name: 'Keller unter Wasser', category: 'th', keyword: 'TH WASSER', weight: 1.5, location: 'wohn',
    openings: ['Unser Keller läuft voll, das Wasser steht schon 30 Zentimeter!'],
    facts: { what: 'Keller überflutet.', help: 'Abpumpen.', trapped: false, hazard: oneOf('Die Heizung steht im Wasser.', 'Nein.'), injured: 0 },
    keyQuestions: ['th_hilfe'], workMin: [40, 90], weather: { regen: 5, gewitter: 8, klar: 0.1 },
  },
  {
    id: 'th_absturz', name: 'Person abgestürzt', category: 'th', keyword: 'TH HOEHE', weight: 0.8, location: 'gewerbe',
    openings: ['Ein Arbeiter ist vom Gerüst gefallen und liegt in der Baugrube!', 'Mein Freund ist im Steinbruch abgerutscht und hängt fest!'],
    facts: { what: 'Absturz einer Person.', help: 'Rettung aus der Tiefe/Höhe.', trapped: true, hazard: 'Die Stelle ist schwer zugänglich.', injured: 1 },
    keyQuestions: ['th_personen', 'th_gefahr'], workMin: [45, 90],
    patients: { count: [1, 1], doctorProb: 0.9, departments: ['unfallchirurgie'] },
  },
  {
    id: 'th_trage', name: 'Tragehilfe', category: 'th', keyword: 'TH TRAGE', weight: 1.5, location: 'wohn',
    openings: ['Hier ist der Rettungsdienst, wir brauchen Tragehilfe, Patient 150 kg im 4. OG ohne Aufzug.'],
    facts: { what: 'Tragehilfe für den Rettungsdienst.', help: 'Patient muss über Drehleiter oder Treppenhaus getragen werden.', trapped: false, hazard: 'Enges Treppenhaus.', injured: 0 },
    keyQuestions: ['th_hilfe'], workMin: [20, 40],
  },
  {
    id: 'th_maschine', name: 'Person in Maschine eingeklemmt', category: 'th', keyword: 'TH Y', weight: 0.6, location: 'gewerbe',
    openings: ['Ein Kollege ist mit dem Arm in die Maschine geraten!', 'Bei uns im Betrieb ist jemand unter eine Palette gekommen und eingeklemmt!'],
    facts: { what: 'Arbeitsunfall mit eingeklemmter Person.', help: 'Befreiung mit schwerem Gerät.', trapped: true, hazard: 'Die Maschine ist abgeschaltet.', injured: 1 },
    keyQuestions: ['th_personen'], workMin: [40, 80],
    patients: { count: [1, 1], doctorProb: 1, departments: ['unfallchirurgie'] },
  },
  {
    id: 'th_hochwasser', name: 'Überflutung nach Starkregen', category: 'th', keyword: 'TH HW', weight: 0.6, location: 'wohn',
    openings: ['Der Bach ist über die Ufer getreten, die ganze Straße steht unter Wasser!'],
    facts: { what: 'Überflutung mehrerer Häuser.', help: 'Sandsäcke und Pumpen werden gebraucht.', trapped: oneOf(false, true), hazard: 'Das Wasser steigt weiter.', injured: 0 },
    keyQuestions: ['th_gefahr', 'th_personen'], workMin: [120, 240], weather: { regen: 4, gewitter: 10, klar: 0, hitze: 0 },
  },
  {
    id: 'th_strom', name: 'Herabgefallene Stromleitung', category: 'th', keyword: 'TH 1', weight: 0.6, location: 'strasse',
    openings: ['Eine Stromleitung hängt runter bis auf die Straße!'],
    facts: { what: 'Freileitung abgerissen.', help: 'Absichern bis zum Eintreffen des Netzbetreibers.', trapped: false, hazard: 'Ja, das Kabel funkt!', injured: 0 },
    keyQuestions: ['th_gefahr'], workMin: [30, 60], weather: { gewitter: 6, schnee: 2 },
  },
  // ------------------------------------------------------------------ VERKEHRSUNFALL
  {
    id: 'vu_pkw', name: 'Verkehrsunfall PKW', category: 'vu', keyword: 'VU 1', weight: 5, location: 'strasse',
    openings: ['Hier hat es gekracht, zwei Autos sind zusammengestoßen!', 'Auffahrunfall an der Ampel, eine Frau hält sich den Nacken.'],
    facts: { what: 'Verkehrsunfall zwischen PKW.', vehicles: oneOf('Zwei PKW.', 'Drei PKW, Auffahrunfall.'), trapped: false, injured: range(1, 2), leak: oneOf('Nein.', 'Ein bisschen Kühlwasser.'), road: oneOf('Kreuzung im Ortskern.', 'Landstraße zwischen den Orten.') },
    keyQuestions: ['vu_eingeklemmt', 'verletzt'], workMin: [25, 45], weather: { regen: 1.6, schnee: 2.5, nebel: 1.5 },
    patients: PAT_LIGHT,
    variants: [{ label: 'Person eingeklemmt', weight: 0.4, keyword: 'VU Y', facts: { trapped: true }, patients: { count: 'injured', doctorProb: 0.7, departments: ['unfallchirurgie'] } }],
  },
  {
    id: 'vu_eingeklemmt', name: 'Verkehrsunfall mit eingeklemmter Person', category: 'vu', keyword: 'VU Y', weight: 2, location: 'strasse',
    openings: ['Ein Auto hat sich überschlagen, der Fahrer hängt noch drin!', 'Frontalzusammenstoß! Ich kriege die Tür nicht auf!'],
    facts: { what: 'Schwerer Verkehrsunfall.', vehicles: oneOf('Ein PKW, überschlagen.', 'Zwei PKW frontal.'), trapped: true, injured: range(1, 3), leak: oneOf('Benzin läuft aus!', 'Es qualmt aus dem Motorraum.'), road: oneOf('Landstraße, Kurve am Wald.', 'Ortsumgehung.') },
    keyQuestions: ['vu_eingeklemmt'], workMin: [45, 80], weather: { regen: 1.5, schnee: 2, nebel: 2 }, time: { night: 1.3 },
    patients: { count: 'injured', doctorProb: 0.7, departments: ['unfallchirurgie'] },
    escalation: { prob: 0.15, needs: [need('rth', 1)], text: 'Patient polytraumatisiert, Luftrettung angefordert.' },
  },
  {
    id: 'vu_motorrad', name: 'Motorradunfall', category: 'vu', keyword: 'VU 1', weight: 1.5, location: 'strasse',
    openings: ['Ein Motorradfahrer ist gestürzt und liegt im Graben!'],
    facts: { what: 'Motorradunfall.', vehicles: 'Ein Motorrad, alleinbeteiligt.', trapped: false, injured: 1, leak: 'Benzin tropft aus dem Tank.', road: 'Kurvige Landstraße.' },
    keyQuestions: ['verletzt'], workMin: [30, 50], weather: { hitze: 2, klar: 2, schnee: 0, regen: 0.6 },
    patients: { count: [1, 1], doctorProb: 0.8, departments: ['unfallchirurgie'] },
    escalation: { prob: 0.3, needs: [need('notarzt', 1)], text: 'Schwer verletzter Motorradfahrer, Notarzt nachgefordert.' },
  },
  {
    id: 'vu_lkw', name: 'LKW-Unfall', category: 'vu', keyword: 'VU Y', weight: 0.6, location: 'strasse',
    openings: ['Ein LKW ist in einen PKW gekracht, das Auto ist total zerquetscht!'],
    facts: { what: 'Unfall LKW gegen PKW.', vehicles: 'Ein LKW und ein Kleinwagen.', trapped: true, injured: range(1, 2), leak: 'Diesel läuft aus.', road: 'Bundesstraße.' },
    keyQuestions: ['vu_eingeklemmt', 'vu_fzg'], workMin: [60, 120],
    patients: { count: 'injured', doctorProb: 0.8, departments: ['unfallchirurgie'] },
    escalation: { prob: 0.3, needs: [need('oel', 1), need('polizei', 1)], text: 'Größere Mengen Diesel ausgelaufen, Ölschadenbekämpfung nachgefordert.' },
  },
  {
    id: 'vu_bus', name: 'Busunfall', category: 'vu', keyword: 'VU MANV', weight: 0.2, location: 'strasse',
    openings: ['Ein Linienbus ist von der Straße abgekommen, viele Leute verletzt!'],
    facts: { what: 'Busunfall mit vielen Fahrgästen.', vehicles: 'Ein Linienbus, umgekippt im Graben.', trapped: oneOf(true, false), injured: range(5, 10), leak: 'Nein.', road: 'Kreisstraße.' },
    keyQuestions: ['verletzt', 'vu_eingeklemmt'], workMin: [90, 160],
    patients: { count: 'injured', doctorProb: 0.3, departments: ['unfallchirurgie', 'innere'], noTransportProb: 0.3 },
    escalation: { prob: 0.4, needs: [need('rtw', 2), need('san_gross', 1)], text: 'Mehr Verletzte als gemeldet, weitere RTW und GW-San nachgefordert.', extraPatients: 3 },
  },
  {
    id: 'vu_rad', name: 'Fahrradunfall', category: 'vu', keyword: 'VU 1', weight: 1.5, location: 'strasse',
    openings: ['Ein Radfahrer wurde von einem Auto erfasst!'],
    facts: { what: 'Radfahrer angefahren.', vehicles: 'Ein PKW und ein Fahrrad.', trapped: false, injured: 1, leak: 'Nein.', road: 'Innerorts, Kreuzung.' },
    keyQuestions: ['verletzt'], workMin: [20, 35], weather: { klar: 1.5, hitze: 1.5, schnee: 0.2 },
    patients: { count: [1, 1], doctorProb: 0.3, departments: ['unfallchirurgie'] },
  },
  {
    id: 'vu_baum', name: 'PKW gegen Baum', category: 'vu', keyword: 'VU Y', weight: 1, location: 'land',
    openings: ['Ein Auto ist gegen einen Baum gefahren, es raucht!'],
    facts: { what: 'PKW gegen Baum.', vehicles: 'Ein PKW.', trapped: oneOf(true, false), injured: range(1, 2), leak: 'Es raucht aus dem Motorraum.', road: 'Landstraße, Allee.' },
    keyQuestions: ['vu_eingeklemmt'], workMin: [40, 70], time: { night: 1.6 }, weather: { nebel: 2, schnee: 2 },
    patients: { count: 'injured', doctorProb: 0.6, departments: ['unfallchirurgie'] },
    variants: [{ label: 'Nicht eingeklemmt', weight: 1, keyword: 'VU 1', facts: { trapped: false }, workMin: [25, 40] }],
  },
  // ------------------------------------------------------------------ RETTUNGSDIENST
  {
    id: 'rd_brust', name: 'Brustschmerz', category: 'rd', keyword: 'RD 2', weight: 6, location: 'wohn',
    openings: ['Mein Mann hat starke Schmerzen in der Brust!', 'Mir drückt es so auf der Brust und der linke Arm kribbelt.'],
    facts: { what: 'Akute Brustschmerzen.', age: range(45, 85), conscious: true, breathing: 'normal', symptoms: 'Starker Druck auf der Brust, Ausstrahlung in den Arm, kaltschweißig.', history: oneOf('Bluthochdruck.', 'Hatte schon mal einen Herzinfarkt.', 'Diabetes.') },
    keyQuestions: ['rd_beschwerden', 'rd_bewusst'], workMin: [20, 35],
    patients: { count: [1, 1], doctorProb: 1, departments: ['kardiologie'] },
    variants: [{ label: 'Muskulär, ohne Notarzt', weight: 0.5, keyword: 'RD 1', facts: { symptoms: 'Stechender Schmerz bei Bewegung nach dem Umzugstragen.', age: range(20, 40) }, patients: { count: [1, 1], doctorProb: 0, departments: ['innere'], noTransportProb: 0.3 } }],
  },
  {
    id: 'rd_atemnot', name: 'Atemnot', category: 'rd', keyword: 'RD 2', weight: 4, location: 'wohn',
    openings: ['Meine Oma kriegt keine Luft mehr!', 'Ich bekomme so schlecht Luft …'],
    facts: { what: 'Akute Atemnot.', age: range(55, 90), conscious: true, breathing: 'schwer', symptoms: 'Pfeifende Atmung, kann nur in Satzfetzen sprechen.', history: oneOf('COPD, Sauerstoff zuhause.', 'Asthma.', 'Herzschwäche.') },
    keyQuestions: ['rd_atmung'], workMin: [20, 35],
    patients: { count: [1, 1], doctorProb: 0.9, departments: ['innere'] },
  },
  {
    id: 'rd_sturz', name: 'Sturz', category: 'rd', keyword: 'RD 1', weight: 6, location: 'wohn',
    openings: ['Meine Mutter ist gestürzt und kommt nicht mehr hoch.', 'Mein Nachbar ist auf dem Gehweg ausgerutscht, sein Bein tut ihm höllisch weh.'],
    facts: { what: 'Sturz mit Verletzung.', age: range(60, 95), conscious: true, breathing: 'normal', symptoms: oneOf('Schmerzen in der Hüfte, Bein verkürzt.', 'Platzwunde am Kopf.', 'Handgelenk verformt.'), history: 'Blutverdünner.' },
    keyQuestions: ['rd_bewusst', 'rd_beschwerden'], workMin: [20, 35],
    patients: { count: [1, 1], doctorProb: 0.05, departments: ['unfallchirurgie'], noTransportProb: 0.15 },
    variants: [{ label: 'Bewusstlos nach Sturz', weight: 0.25, keyword: 'RD 2', openings: ['Mein Vater ist die Treppe runtergefallen und reagiert nicht mehr richtig!'], facts: { conscious: false }, patients: { count: [1, 1], doctorProb: 1, departments: ['neurologie', 'unfallchirurgie'] } }],
  },
  {
    id: 'rd_rea', name: 'Reanimation', category: 'rd', keyword: 'RD REA', weight: 1.2, location: 'wohn',
    openings: ['Mein Mann ist umgekippt und atmet nicht mehr!', 'Hier liegt jemand auf dem Gehweg und rührt sich nicht!'],
    facts: { what: 'Leblose Person.', age: range(40, 90), conscious: false, breathing: 'nein', symptoms: 'Keine Reaktion, keine Atmung.', history: oneOf('Herzkrank.', 'Unbekannt.') },
    keyQuestions: ['rd_bewusst', 'rd_atmung'], workMin: [40, 60],
    patients: { count: [1, 1], doctorProb: 1, departments: ['kardiologie', 'intensiv'], noTransportProb: 0.35 },
    escalation: { prob: 0.25, needs: [need('th', 1)], text: 'Patient muss über enges Treppenhaus – Tragehilfe Feuerwehr nachgefordert.' },
  },
  {
    id: 'rd_schlaganfall', name: 'Schlaganfall', category: 'rd', keyword: 'RD 2', weight: 3, location: 'wohn',
    openings: ['Mein Vater redet so komisch und sein Mundwinkel hängt!', 'Meine Frau kann den rechten Arm nicht mehr bewegen.'],
    facts: { what: 'Verdacht auf Schlaganfall.', age: range(55, 90), conscious: true, breathing: 'normal', symptoms: 'Sprachstörung, hängender Mundwinkel, Lähmung einer Seite. Seit etwa 30 Minuten.', history: 'Vorhofflimmern.' },
    keyQuestions: ['rd_beschwerden'], workMin: [20, 35],
    patients: { count: [1, 1], doctorProb: 0.7, departments: ['neurologie'] },
  },
  {
    id: 'rd_bewusstlos', name: 'Bewusstlose Person', category: 'rd', keyword: 'RD 2', weight: 2.5, location: 'oeffentlich',
    openings: ['Da liegt ein Mann auf der Bank und reagiert nicht.', 'Eine Frau ist im Supermarkt zusammengebrochen!'],
    facts: { what: 'Bewusstlose Person.', age: range(20, 85), conscious: false, breathing: 'normal', symptoms: 'Reagiert nicht auf Ansprache.', history: 'Unbekannt.' },
    keyQuestions: ['rd_bewusst', 'rd_atmung'], workMin: [25, 40],
    patients: { count: [1, 1], doctorProb: 1, departments: ['innere', 'neurologie'], noTransportProb: 0.1 },
    variants: [{ label: 'Atmet nicht', weight: 0.2, keyword: 'RD REA', facts: { breathing: 'nein' } }],
  },
  {
    id: 'rd_krampf', name: 'Krampfanfall', category: 'rd', keyword: 'RD 2', weight: 1.5, location: 'wohn',
    openings: ['Mein Sohn krampft am ganzen Körper!', 'Ein Mann hat hier auf der Straße einen Krampfanfall.'],
    facts: { what: 'Krampfanfall.', age: oneOf(3, 16, 28, 45), conscious: false, breathing: 'normal', symptoms: 'Zuckt am ganzen Körper, Schaum vor dem Mund.', history: oneOf('Epilepsie bekannt.', 'Fieber seit gestern.', 'Nichts bekannt.') },
    keyQuestions: ['rd_bewusst', 'rd_alter'], workMin: [25, 40],
    patients: { count: [1, 1], doctorProb: 0.8, departments: ['neurologie', 'paediatrie'] },
  },
  {
    id: 'rd_geburt', name: 'Einsetzende Geburt', category: 'rd', keyword: 'RD 2', weight: 0.6, location: 'wohn',
    openings: ['Meine Frau bekommt das Baby, die Wehen kommen alle zwei Minuten!'],
    facts: { what: 'Geburt hat eingesetzt.', age: range(22, 40), conscious: true, breathing: 'normal', symptoms: 'Wehen im Abstand von 2 Minuten, Fruchtblase geplatzt.', history: 'Zweites Kind.' },
    keyQuestions: ['rd_beschwerden'], workMin: [30, 50],
    patients: { count: [1, 1], doctorProb: 0.8, departments: ['gynaekologie'] },
  },
  {
    id: 'rd_allergie', name: 'Allergische Reaktion', category: 'rd', keyword: 'RD 2', weight: 1, location: 'oeffentlich',
    openings: ['Meine Freundin wurde von einer Wespe gestochen und schwillt total an!'],
    facts: { what: 'Allergische Reaktion.', age: range(15, 60), conscious: true, breathing: 'schwer', symptoms: 'Schwellung im Gesicht, Quaddeln, Atemnot.', history: 'Allergie bekannt, Notfallset vergessen.' },
    keyQuestions: ['rd_atmung'], workMin: [20, 30], weather: { hitze: 3, klar: 1.5, schnee: 0 },
    patients: { count: [1, 1], doctorProb: 1, departments: ['innere'] },
  },
  {
    id: 'rd_diabetes', name: 'Unterzuckerung', category: 'rd', keyword: 'RD 1', weight: 1.5, location: 'wohn',
    openings: ['Mein Mann ist Diabetiker und total verwirrt und schwitzig.'],
    facts: { what: 'Verdacht auf Unterzucker.', age: range(30, 85), conscious: true, breathing: 'normal', symptoms: 'Verwirrt, kaltschweißig, zittrig.', history: 'Insulinpflichtiger Diabetes.' },
    keyQuestions: ['rd_vorerkrankung', 'rd_bewusst'], workMin: [20, 35],
    patients: { count: [1, 1], doctorProb: 0.2, departments: ['innere'], noTransportProb: 0.5 },
  },
  {
    id: 'rd_intox', name: 'Intoxikation', category: 'rd', keyword: 'RD 1', weight: 1.5, location: 'oeffentlich',
    openings: ['Ein Jugendlicher liegt hier stark betrunken im Park.', 'Meine Freundin hat Tabletten genommen!'],
    facts: { what: 'Vergiftung / Intoxikation.', age: range(15, 50), conscious: true, breathing: 'normal', symptoms: 'Benommen, erbricht.', history: 'Unbekannt.' },
    keyQuestions: ['rd_bewusst'], workMin: [20, 35], time: { night: 2.5 },
    patients: { count: [1, 1], doctorProb: 0.3, departments: ['innere', 'psychiatrie'] },
    variants: [{ label: 'Tabletten, eingetrübt', weight: 0.4, keyword: 'RD 2', facts: { conscious: false, history: 'Depression bekannt.' }, patients: { count: [1, 1], doctorProb: 1, departments: ['intensiv', 'innere'] } }],
  },
  {
    id: 'rd_schnitt', name: 'Schnittverletzung / Arbeitsunfall', category: 'rd', keyword: 'RD 1', weight: 2, location: 'gewerbe',
    openings: ['Ein Kollege hat sich mit der Flex ins Bein geschnitten!', 'Ich hab mir beim Kochen tief in die Hand geschnitten.'],
    facts: { what: 'Schnittverletzung.', age: range(18, 65), conscious: true, breathing: 'normal', symptoms: oneOf('Blutet stark.', 'Tiefer Schnitt, Blutung steht unter Druckverband.'), history: 'Keine.' },
    keyQuestions: ['rd_beschwerden'], workMin: [15, 30],
    patients: { count: [1, 1], doctorProb: 0.2, departments: ['unfallchirurgie'] },
  },
  {
    id: 'rd_psych', name: 'Psychiatrischer Notfall', category: 'rd', keyword: 'RD 1', weight: 1, location: 'wohn',
    openings: ['Mein Bruder ist völlig durcheinander und droht, sich etwas anzutun.'],
    facts: { what: 'Psychische Ausnahmesituation.', age: range(18, 60), conscious: true, breathing: 'normal', symptoms: 'Sehr unruhig, hört Stimmen.', history: 'Psychiatrische Vorgeschichte.' },
    keyQuestions: ['rd_beschwerden'], workMin: [30, 50],
    patients: { count: [1, 1], doctorProb: 0.3, departments: ['psychiatrie'] },
    escalation: { prob: 0.4, needs: [need('polizei', 1)], text: 'Patient aggressiv, Polizei zur Unterstützung nachgefordert.' },
  },
  {
    id: 'rd_kind', name: 'Kindernotfall', category: 'rd', keyword: 'RD 2', weight: 1, location: 'wohn',
    openings: ['Mein Baby hat ganz hohes Fieber und atmet so schnell!', 'Mein Kind hat etwas verschluckt und hustet!'],
    facts: { what: 'Notfall bei einem Kind.', age: oneOf(1, 2, 4, 6), conscious: true, breathing: oneOf('schwer', 'normal'), symptoms: oneOf('Fieber 40 Grad, apathisch.', 'Husten nach Verschlucken eines Spielzeugteils.'), history: 'Nichts bekannt.' },
    keyQuestions: ['rd_alter', 'rd_atmung'], workMin: [20, 35],
    patients: { count: [1, 1], doctorProb: 0.9, departments: ['paediatrie'] },
  },
  {
    id: 'rd_manv', name: 'Viele Verletzte bei Veranstaltung', category: 'rd', keyword: 'RD MANV', weight: 0.15, location: 'oeffentlich',
    openings: ['Auf dem Stadtfest ist eine Tribüne eingestürzt, viele Leute liegen am Boden!'],
    facts: { what: 'Tribüneneinsturz mit vielen Verletzten.', age: 'Alle Altersgruppen.', conscious: true, breathing: 'normal', symptoms: 'Viele Prellungen und Knochenbrüche.', injured: range(6, 12) },
    keyQuestions: ['rd_beschwerden'], workMin: [90, 150], time: { day: 1.5, night: 0.6 },
    patients: { count: 'injured', doctorProb: 0.2, departments: ['unfallchirurgie'], noTransportProb: 0.35 },
    escalation: { prob: 0.4, needs: [need('rtw', 2), need('th', 1)], text: 'Personen unter Trümmern, weitere RTW und Feuerwehr nachgefordert.' },
  },
  {
    id: 'rd_hitze', name: 'Hitzenotfall', category: 'rd', keyword: 'RD 1', weight: 0.5, location: 'oeffentlich',
    openings: ['Ein älterer Mann ist in der Hitze zusammengesackt.'],
    facts: { what: 'Kollaps bei Hitze.', age: range(60, 90), conscious: true, breathing: 'normal', symptoms: 'Schwindel, heiße trockene Haut.', history: 'Herzschwäche.' },
    keyQuestions: ['rd_bewusst'], workMin: [20, 30], weather: { hitze: 10, klar: 1, regen: 0.2, schnee: 0 },
    patients: { count: [1, 1], doctorProb: 0.2, departments: ['innere'] },
  },
  // ------------------------------------------------------------------ KRANKENTRANSPORT
  {
    id: 'ktp_entlassung', name: 'Krankentransport', category: 'ktp', keyword: 'KTP', weight: 5, location: 'klinik',
    openings: ['Hier ist die Station 4b, wir bräuchten einen Liegendtransport nach Hause.', 'Pflegeheim Sonnenhof, wir bestellen einen Transport zur Dialyse.'],
    facts: { what: 'Bestellter Krankentransport.', target: oneOf('Vom Klinikum nach Hause.', 'Vom Pflegeheim zur Dialyse.', 'Von zuhause zur Strahlentherapie.'), mobility: oneOf('Liegend.', 'Tragestuhl.'), infection: false, when: 'In der nächsten Stunde.', intensive: false },
    keyQuestions: ['ktp_infekt', 'ktp_mobil'], workMin: [15, 25], time: { day: 2, night: 0.15 },
    patients: { count: [1, 1], doctorProb: 0, departments: ['allgemein'] },
  },
  {
    id: 'ktp_inf', name: 'Infektionstransport', category: 'ktp', keyword: 'KTP INF', weight: 1, location: 'klinik',
    openings: ['Wir brauchen einen Transport für einen Patienten mit MRSA.'],
    facts: { what: 'Infektionstransport.', target: 'Klinikverlegung.', mobility: 'Liegend.', infection: true, pathogen: oneOf('MRSA', '3MRGN', 'Norovirus'), when: 'Heute Vormittag.', intensive: false },
    keyQuestions: ['ktp_infekt'], workMin: [25, 40], time: { day: 2, night: 0.1 },
    patients: { count: [1, 1], doctorProb: 0, departments: ['allgemein'] },
  },
  {
    id: 'ktp_itw', name: 'Intensivverlegung', category: 'ktp', keyword: 'KTP ITW', weight: 0.5, location: 'klinik',
    openings: ['Intensivstation Kreisklinik: Wir müssen einen beatmeten Patienten ins Zentrum verlegen.'],
    facts: { what: 'Intensivverlegung.', target: 'Von der Kreisklinik ins Klinikum.', mobility: 'Liegend.', infection: false, when: 'Dringend.', intensive: true },
    keyQuestions: ['ktp_intensiv'], workMin: [30, 45],
    patients: { count: [1, 1], doctorProb: 0, departments: ['intensiv'] },
  },
  // ------------------------------------------------------------------ ABC
  {
    id: 'abc_lkw', name: 'Gefahrstoffaustritt LKW', category: 'abc', keyword: 'ABC 1', weight: 0.6, location: 'strasse',
    openings: ['Aus einem Tanklaster tropft irgendeine Flüssigkeit, da ist ein orangenes Schild dran!'],
    facts: { what: 'Gefahrstoffaustritt an einem LKW.', substance: oneOf('Warntafel 33/1203 (Benzin).', 'Warntafel 80/1789 (Salzsäure).', 'Kann die Zahlen nicht lesen.'), amount: 'Es tropft stetig.', cloud: 'Stechender Geruch.', injured: 0 },
    keyQuestions: ['abc_stoff'], workMin: [60, 120],
    escalation: { prob: 0.25, needs: [need('fuehrung_2', 1), need('atemschutz', 1), need('rtw', 1)], text: 'Leck größer als angenommen, Gefahrstoffzug in voller Stärke nachgefordert.', extraPatients: 1 },
  },
  {
    id: 'abc_chemie', name: 'Chemieunfall im Betrieb', category: 'abc', keyword: 'ABC 2', weight: 0.4, location: 'gewerbe',
    openings: ['Hier ist die Werksleitung, bei uns ist ein Behälter mit Chemikalien geborsten, Mitarbeiter klagen über Augenreizungen!'],
    facts: { what: 'Chemikalienaustritt in Produktionsbetrieb.', substance: oneOf('Ammoniak.', 'Chlorgas aus der Desinfektion.', 'Lösungsmittelgemisch.'), amount: 'Mehrere hundert Liter.', cloud: 'Ja, eine weiße Wolke über der Halle!', injured: range(1, 4) },
    keyQuestions: ['abc_stoff', 'abc_wolke'], workMin: [90, 180],
    patients: { count: 'injured', doctorProb: 0.4, departments: ['innere', 'intensiv'] },
  },
  {
    id: 'abc_co', name: 'CO-Warnmelder', category: 'abc', keyword: 'ABC CO', weight: 1, location: 'wohn',
    openings: ['Bei uns piept so ein Kohlenmonoxid-Melder und mir ist schwindelig.'],
    facts: { what: 'CO-Melder ausgelöst.', substance: 'Kohlenmonoxid, vermutlich von der Gastherme.', amount: 'Unbekannt.', cloud: 'Nein, man riecht nichts.', injured: range(1, 3) },
    keyQuestions: ['abc_stoff', 'verletzt'], workMin: [30, 50], weather: { schnee: 3, klar: 1 },
    patients: { count: 'injured', doctorProb: 0.4, departments: ['innere'], noTransportProb: 0.2 },
  },
  // ------------------------------------------------------------------ WASSER
  {
    id: 'w_person', name: 'Person im Wasser', category: 'wasser', keyword: 'W 1', weight: 0.4, location: 'wasser',
    openings: ['Da treibt jemand im Fluss und ruft um Hilfe!', 'Ein Kind ist in den Baggersee gefallen!'],
    facts: { what: 'Person in Wassernot.', visible: oneOf(true, false), water: oneOf('Fluss, unterhalb der Brücke.', 'Baggersee am Badestrand.'), injured: 1 },
    keyQuestions: ['w_sicht'], workMin: [40, 80], weather: { hitze: 6, klar: 2, regen: 0.3, schnee: 0.1 },
    patients: { count: [1, 1], doctorProb: 1, departments: ['intensiv'] },
  },
  {
    id: 'w_eis', name: 'Person im Eis eingebrochen', category: 'wasser', keyword: 'W 1', weight: 0.1, location: 'wasser',
    openings: ['Auf dem Weiher ist jemand ins Eis eingebrochen!'],
    facts: { what: 'Eiseinbruch.', visible: true, water: 'Dorfweiher.', injured: 1 },
    keyQuestions: ['w_sicht'], workMin: [40, 70], weather: { schnee: 40, klar: 0.5, hitze: 0, regen: 0 },
    patients: { count: [1, 1], doctorProb: 1, departments: ['intensiv'] },
  },
  // ------------------------------------------------------------------ TIER
  {
    id: 'tier_katze', name: 'Katze in Notlage', category: 'tier', keyword: 'TIER', weight: 1, location: 'wohn',
    openings: ['Unsere Katze sitzt seit gestern oben im Baum und kommt nicht runter.'],
    facts: { what: 'Tier in Notlage.', animal: 'Eine Katze.', situation: 'Ganz oben in einer Birke, ca. 10 m.' },
    keyQuestions: ['t_tier'], workMin: [20, 40],
  },
  {
    id: 'tier_pferd', name: 'Großtier in Notlage', category: 'tier', keyword: 'TIER GROSS', weight: 0.3, location: 'land',
    openings: ['Ein Pferd ist in einen Graben gestürzt und kommt nicht mehr raus!'],
    facts: { what: 'Großtier in Notlage.', animal: oneOf('Ein Pferd.', 'Eine Kuh.'), situation: 'Liegt im Entwässerungsgraben, wirkt erschöpft.' },
    keyQuestions: ['t_tier'], workMin: [60, 120],
  },
  {
    id: 'tier_wild', name: 'Wildunfall / Tier auf Fahrbahn', category: 'tier', keyword: 'TIER', weight: 0.8, location: 'strasse',
    openings: ['Hier liegt ein angefahrenes Reh auf der Straße.'],
    facts: { what: 'Wildunfall.', animal: 'Ein Reh.', situation: 'Liegt verletzt auf der Fahrbahn.' },
    keyQuestions: ['t_tier'], workMin: [15, 30], time: { night: 2.5 },
  },
  // ------------------------------------------------------------------ POLIZEI
  {
    id: 'pol_schlaegerei', name: 'Schlägerei mit Verletzten', category: 'pol', keyword: 'POL RD', weight: 1, location: 'oeffentlich',
    openings: ['Vor der Kneipe prügeln sich mehrere Leute, einer blutet!'],
    facts: { what: 'Schlägerei.', persons: 'Fünf bis sechs Männer.', weapon: oneOf(false, false, true), injured: range(1, 2) },
    keyQuestions: ['p_waffe', 'verletzt'], workMin: [30, 50], time: { night: 4, day: 0.4 },
    patients: { count: 'injured', doctorProb: 0.2, departments: ['unfallchirurgie'], noTransportProb: 0.3 },
  },
  {
    id: 'pol_verkehr', name: 'Verkehrsbehinderung', category: 'pol', keyword: 'POL 1', weight: 1, location: 'strasse',
    openings: ['Hier steht ein Auto mit Panne mitten auf der Kreuzung, keiner regelt den Verkehr.'],
    facts: { what: 'Verkehrsbehinderung.', persons: 'Ein Fahrer.', weapon: false, injured: 0 },
    keyQuestions: ['p_beteiligte'], workMin: [20, 40],
  },
  {
    id: 'pol_sui', name: 'Person droht zu springen', category: 'pol', keyword: 'POL SUI', weight: 0.2, location: 'wohn',
    openings: ['Auf dem Dach vom Hochhaus steht jemand an der Kante!'],
    facts: { what: 'Suizidankündigung.', persons: 'Eine Person, männlich.', weapon: false, injured: 0 },
    keyQuestions: ['p_beteiligte'], workMin: [60, 120],
    patients: { count: [1, 1], doctorProb: 0.5, departments: ['psychiatrie'] },
  },
  // ------------------------------------------------------------------ SONSTIGES
  {
    id: 'son_explosion', name: 'Knall / Explosion gemeldet', category: 'sonstiges', keyword: 'B 3', weight: 0.3, location: 'wohn',
    openings: ['Es gab gerade einen lauten Knall, die Fensterscheiben haben gewackelt!'],
    facts: { what: 'Explosion in einem Wohnhaus.', help: 'Es raucht aus einem Fenster, Scheiben sind rausgeflogen.', injured: range(0, 3) },
    keyQuestions: ['s_lage', 'verletzt'], workMin: [60, 120],
    patients: { count: 'injured', doctorProb: 0.6, departments: ['verbrennung', 'unfallchirurgie'] },
    escalation: { prob: 0.6, needs: [need('gefahrgut', 1), need('rtw', 1), need('loeschen', 1)], text: 'Gasexplosion, Einsturzgefahr – Gefahrgut, RTW und LF nachgefordert.', extraPatients: 1 },
  },
  {
    id: 'son_helfer', name: 'Person in hilfloser Lage im Freien', category: 'sonstiges', keyword: 'RD 1', weight: 0.8, location: 'oeffentlich',
    openings: ['Hier sitzt eine verwirrte ältere Dame an der Bushaltestelle, sie weiß nicht, wo sie wohnt.'],
    facts: { what: 'Hilflose Person.', help: 'Die Frau ist unterkühlt und desorientiert.', injured: 1 },
    keyQuestions: ['s_lage'], workMin: [20, 35], weather: { schnee: 2.5 }, time: { night: 1.5 },
    patients: { count: [1, 1], doctorProb: 0.05, departments: ['innere'] },
  },
  {
    id: 'son_fehlanruf', name: 'Fehlanruf / kein Einsatzbedarf', category: 'sonstiges', keyword: '-', weight: 1.2, location: 'wohn',
    openings: ['… (Rascheln, Stimmen im Hintergrund – offenbar ein Hosentaschenanruf)', 'Ich wollte nur fragen, welche Apotheke heute Notdienst hat.', 'Bei uns ist der Strom ausgefallen, wann geht der wieder?'],
    facts: { what: 'Kein Notfall.', help: 'Es wird keine Hilfe benötigt.', injured: 0 },
    keyQuestions: ['s_lage'], workMin: [3, 6],
  },
];

/** Stichwort-Code "-" bedeutet: Kein Einsatz erforderlich (Notruf ohne Einsatz beenden). */
export const NO_INCIDENT_KEYWORD = '-';

/** Basisszenarien mit SH-Lösung ergänzt, plus SH-spezifische Szenarien */
export const SCENARIOS: ScenarioDef[] = [
  ...BASE_SCENARIOS.map((sc) => {
    const m = SH_SCENARIO_MAP[sc.id];
    if (!m) return sc;
    return {
      ...sc,
      sh: { keyword: m.keyword, meldebild: m.meldebild },
      variants: sc.variants?.map((v, i) => (m.variants?.[i] ? { ...v, sh: m.variants[i] } : v)),
    };
  }),
  ...SH_SCENARIOS.map((sc) => ({ ...sc, catalogs: sc.catalogs ?? ['sh'] })),
];

const byId = new Map(SCENARIOS.map((s) => [s.id, s]));

export function scenariosForCatalog(catalogId: string): ScenarioDef[] {
  return SCENARIOS.filter((s) => (!s.catalogs || s.catalogs.includes(catalogId)) && (catalogId !== 'sh' || s.sh));
}

export function findScenario(id: string): ScenarioDef | undefined {
  return byId.get(id);
}
