import type { KeywordCategory } from '../model/types';
import { matchDetails, type SpanHit } from './details';

/**
 * Regelbasierte Erkennung, was der Disponent gefragt oder gesagt hat.
 * Ergebnis sind Frage-IDs aus data/questions.ts (die Antwort kommt immer aus den Szenariofakten)
 * oder Gesprächsabsichten ohne Faktenbezug (Begrüßung, Beruhigung, Anweisung …).
 * Kein KI-Dienst, keine Netzwerkzugriffe – nur Mustervergleich.
 */

export type ConversationIntent = 'name' | 'beruhigen' | 'wiederholen' | 'buchstabieren' | 'anweisung' | 'ende' | 'begruessung';

export interface IntentMatch {
  /** Frage-IDs in der Reihenfolge, in der sie im Satz vorkommen (Detailthemen beginnen mit "x_") */
  questions: string[];
  /** Gesprächsabsichten ohne Faktenbezug */
  intents: ConversationIntent[];
}

/** Kleinbuchstaben, Umlaute ausgeschrieben, Satzzeichen entfernt */
export function normalize(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

interface Rule {
  id: string;
  /** Muster auf dem normalisierten Text (mit führendem/abschließendem Leerzeichen) */
  strong: RegExp[];
  /** Schwache Muster zählen nur, wenn kein starkes Muster einer anderen Frage passt */
  weak?: RegExp[];
}

const w = (s: string) => new RegExp(` (?:${s}) `);
const p = (s: string) => new RegExp(s);

const COMMON: Rule[] = [
  {
    id: 'ort',
    strong: [
      p(' adresse'),
      w('hausnummer|notfallort|einsatzort|postleitzahl'),
      p(' (welche[rnm]?|wie heisst die|wie lautet die) strasse'),
      p(' wo (genau )?(ist|sind|befinde|wohn|steh)(?! (der |die |das )?(tier|hund|katze|pferd|kuh|reh) )'),
      p(' (in )?welche[mnr]? (ort|stadt|gemeinde|dorf|ortsteil)'),
      p(' wo (genau )?(ist|liegt) (der|die|das) (notfall|unfall|brand|einsatz)'),
      p(' von wo (aus )?rufen'),
    ],
    weak: [p('(?<! weiss| wissen| klar) wo '), p('(?<! vor) ort '), w('strasse')],
  },
  {
    id: 'was',
    strong: [
      p(' was (genau )?(ist|wurde|hat sich) (denn |da |dort |bei ihnen )*(genau )?(passiert|los|geschehen|ereignet)'),
      p(' was (genau )?(passiert|los) '),
      p(' (erzaehlen|schildern|beschreiben) sie'),
      p(' worum geht'),
      p(' was (kann ich|koennen wir) (fuer sie )?tun'),
      p(' (weshalb|warum|weswegen|wieso) rufen sie'),
      p(' (was ist der )?(grund|anlass) (ihres|fuer ihren) anruf'),
    ],
  },
  { id: 'rueckruf', strong: [p(' (telefon|rueckruf|handy)?nummer'), w('erreichbar|zurueckrufen|rueckruf')] },
];

/**
 * Allgemeine Abfragefragen ohne Fachrichtung (Antwort aus voice/diasAnswer.ts, kritische Angaben
 * immer aus den Szenariofakten). Eigene Formulierungen.
 */
const SNA: Rule[] = [
  {
    id: 'sna_bei_person',
    strong: [
      p(' (sind|bist|bleiben) sie (\\w+ ){0,2}(bei|neben) (der|dem|ihm|ihr|ihrem|ihrer|den) '),
      p(' (sind|bist) sie (\\w+ ){0,2}an (der|dem) (person|patient\\w*|verletzte\\w*|betroffene\\w*) '),
    ],
  },
  { id: 'sna_selbst', strong: [p(' (sind|ist|bist) (sie|es) (\\w+ )?selbst (\\w+ )?(betroffen|verletzt|erkrankt|krank) '), p(' sind sie (der|die) (patient|patientin|betroffene) '), p(' geht es um sie (selbst )?')] },
  { id: 'sna_medizinisch', strong: [p(' (medizinische[nrs]?|gesundheitliche[nrs]?) (notfall|problem|grund|hilfe)'), p(' (handelt es sich|geht es) um (einen |eine )?(medizinisch|krank)')] },
  { id: 'sna_krampf', strong: [w('krampfanfall|krampfanfaelle|gekrampft|krampft|krampfen|krampf|epileptisch\\w*|zuckungen|zuckt')] },
  { id: 'sna_schwanger', strong: [p(' schwanger'), w('wehen|geburt|fruchtblase')] },
  { id: 'sna_alter_grenze', strong: [p(' (ueber|unter|aelter als|juenger als|mindestens) \\d+ (jahre|jahren|jahr)')] },
  { id: 'sna_anzahl', strong: [p(' wie ?viele (\\w+ ){0,2}(personen|leute|menschen|patienten|verletzte|betroffene|insassen) '), p(' wie viele sind (\\w+ )?(verletzt|betroffen|erkrankt) ')] },
  {
    id: 'sna_gefahr',
    strong: [
      p(' (ist|sind|besteht) (die |der |das )?(person|personen|jemand|patient\\w*|verletzte\\w*|betroffene\\w*|mann|frau|kind|leute|lebens)? ?(\\w+ ){0,2}in (akuter |unmittelbarer )?gefahr'),
      p(' (akute|unmittelbare) gefahr'),
      p(' lebensgefahr'),
    ],
  },
];
/** Allgemeine Regel fällt weg, wenn eine fachliche Frage dasselbe schon abdeckt */
const SUPERSEDED: Record<string, string[]> = {
  sna_anzahl: ['verletzt', 'p_beteiligte'],
  sna_gefahr: ['b_personen', 'th_personen', 'th_gefahr', 'vu_eingeklemmt'],
  sna_krampf: ['rd_vorerkrankung'],
  rd_alter: ['sna_alter_grenze'],
};

const INJURED: Rule = {
  id: 'verletzt',
  strong: [p(' verletz'), w('blutet|blut|wunde|rauchvergiftung'), p(' eingeatmet'), p(' (jemand|wer|personen?|leute|menschen) (\\w+ ){0,2}(zu schaden|getroffen|betroffen|beschwerden)')],
};

const STUCK = p(' steck\\w* (\\w+ ){0,3}fest ');

const CATEGORY: Record<KeywordCategory, Rule[]> = {
  brand: [
    {
      id: 'b_objekt',
      strong: [p(' was (genau )?brennt'), p(' welche[snrm]? (gebaeude|objekt|raum|zimmer)'), p(' brennt (es|das) (im|in|auf) '), p(' was fuer ein (gebaeude|objekt|haus)'), w('wohnhaus|einfamilienhaus|mehrfamilienhaus|scheune|lagerhalle|gartenhaus|garage')],
      weak: [w('brennt')],
    },
    { id: 'b_rauch', strong: [p(' rauch (?!eingeatmet )'), w('qualm|qualmt|flammen|flamme|feuerschein|rauchentwicklung'), p(' sehen sie (das )?feuer')] },
    {
      id: 'b_personen',
      strong: [
        p(' (noch )?(jemand|personen?|menschen|leute|bewohner|kinder) (im|in|drin|drinnen|in der|in dem|eingeschlossen|vermisst)'),
        w('eingeschlossen|vermisst|alle draussen|alle raus|noch drin|noch drinnen|in gefahr'),
        p(' (sind|ist) (noch )?(alle|jemand) (draussen|raus|drin)'),
        p(' (noch )?(wer|irgendwer|irgendjemand|jemand|bewohner|leute|personen?|alle) (\\w+ ){0,3}(drin|drinnen|draussen|raus) '),
        p(' wohnt (da|dort|hier|darueber|drueber) (noch )?(jemand|wer)'),
      ],
    },
    INJURED,
    { id: 'b_stock', strong: [p(' stock'), w('etage|geschoss|obergeschoss|erdgeschoss|dachgeschoss|keller|gebaeudeteil'), p(' welche[rnm]? wohnung')] },
    { id: 'b_ausbreitung', strong: [p(' (aus)?breit'), p(' uebergreif'), w('groesser|schlimmer|ausdehnen|nachbarwohnung|nachbarhaus'), p(' wie gross'), p(' brennt (es|das) (immer )?noch')] },
  ],
  th: [
    { id: 'th_hilfe', strong: [p(' welche hilfe'), p(' (was|wobei) (genau )?(brauchen|benoetigen) sie'), p(' wobei (sollen|koennen) wir')] },
    { id: 'th_personen', strong: [w('eingeklemmt|eingeschlossen|gefangen|kommt nicht raus|in gefahr'), p(' (jemand|personen?) (in gefahr|eingeschlossen|gefangen)'), STUCK] },
    { id: 'th_gefahr', strong: [p('(?<! in) gefahr '), w('strom|gas|einsturz|einsturzgefahr|stromleitung|wasser')] },
    INJURED,
  ],
  vu: [
    { id: 'vu_fzg', strong: [p(' wie viele (autos|fahrzeuge|wagen|pkw|lkw)'), p(' welche (art von )?(autos|fahrzeuge)'), w('beteiligt')], weak: [w('fahrzeuge|fahrzeug|autos|auto|pkw|lkw|motorrad')] },
    {
      id: 'vu_eingeklemmt',
      strong: [
        w('eingeklemmt|eingeschlossen'),
        p(' (aus dem|aus den) (auto|fahrzeug|wagen)'),
        p(' (raus|heraus)kommen'),
        p(' kommt (noch )?(jemand )?nicht raus'),
        p(' (jemand|wer|leute|personen?|insassen|fahrer) (\\w+ ){0,2}(im|in dem|in den) (auto|autos|fahrzeug|fahrzeugen|wagen)'),
      ],
    },
    INJURED,
    { id: 'vu_auslauf', strong: [p(' (laeuft|laufen|tritt|treten) (\\w+ ){0,2}aus '), w('benzin|oel|diesel|betriebsstoffe|auslaufen|raucht|brennt|qualmt')] },
    { id: 'vu_strasse', strong: [w('fahrtrichtung|richtung|autobahn|bundesstrasse|landstrasse|kilometer|abfahrt|ausfahrt'), p(' (auf )?welche[rnm]? strasse')] },
  ],
  rd: [
    { id: 'rd_alter', strong: [p(' wie alt'), w('alter|jahre alt|geburtsjahr')] },
    { id: 'rd_bewusst', strong: [w('wach|ansprechbar|bewusstlos|bewusstsein|reagiert|reagieren|antwortet|bei sich')] },
    { id: 'rd_atmung', strong: [p(' atm'), w('atem|luft|luftnot|atemnot|schnappt|brustkorb')] },
    { id: 'rd_beschwerden', strong: [w('beschwerden|schmerzen|schmerz|symptome|was fehlt|tut weh|wo tut|blutet|blutung'), p(' verletz')] },
    { id: 'rd_vorerkrankung', strong: [p(' vorerkrank'), w('medikamente|tabletten|krankheiten|erkrankungen|vorgeschichte|diabetes|herzkrank|zucker|zuckerkrank|asthma|epilepsie|allergien|blutverduenner')] },
  ],
  ktp: [
    {
      id: 'ktp_ziel',
      strong: [
        w('wohin|nach wo|zielklinik|ziel|abholen|abholort|klinik|krankenhaus|station'),
        p(' (transport|fahrt|reise)?ziel\\w*'),
        p(' von wo(?! (aus )?rufen)'),
        // "Wo soll es hingehen?", "Wo muss der Patient hin?", "Wo fahren wir hin?"
        p(' wo (soll|sollen|muss|muessen|geht|gehts|fahren|faehrt|kommt) (\\w+ ){0,3}hin'),
        p(' (hin)?(gebracht|verlegt) werden'),
      ],
    },
    { id: 'ktp_mobil', strong: [w('sitzen|sitzend|liegen|liegend|gehfaehig|rollstuhl|trage|laufen')] },
    { id: 'ktp_infekt', strong: [p(' infekt'), w('keime|mrsa|ansteckend|corona|covid|isolation|isoliert')] },
    { id: 'ktp_zeit', strong: [w('wann|uhrzeit|termin|zeitpunkt|abholzeit')] },
    { id: 'ktp_intensiv', strong: [w('beatmet|intensiv|intensivpflichtig|perfusor|perfusoren|ueberwachung')] },
  ],
  abc: [
    { id: 'abc_stoff', strong: [w('stoff|warntafel|warntafeln|kennzeichnung|gefahrstoff|chemikalie|chemikalien|un nummer|gefahrzettel|fass|behaelter|kanister|aufschrift|etikett')] },
    { id: 'abc_menge', strong: [p(' wie ?viel '), w('menge|liter')] },
    { id: 'abc_wolke', strong: [w('geruch|riecht|riechen|wolke|nebel|daempfe|dampf')] },
    INJURED,
  ],
  wasser: [
    { id: 'w_sicht', strong: [p(' (noch )?(zu )?sehen(?! sie zu)'), w('sichtbar|untergegangen|oberflaeche|treibt')] },
    { id: 'w_gewaesser', strong: [w('gewaesser|see|fluss|kanal|ufer|strand|hafen|ostsee|meer|wo genau im wasser')] },
    INJURED,
  ],
  tier: [
    { id: 't_tier', strong: [p(' (welches|was fuer ein) tier'), w('tierart|hund|katze|pferd|kuh|reh')] },
    { id: 't_lage', strong: [p(' wo (ist|befindet sich) (das tier|es)'), w('verletzt|feststecken|steckt fest|eingeklemmt'), STUCK] },
  ],
  pol: [
    { id: 'p_beteiligte', strong: [w('beteiligt|beteiligte|wie viele personen|wer ist'), p(' wie viele (leute|menschen)')] },
    { id: 'p_waffe', strong: [w('waffe|waffen|messer|pistole|schusswaffe|bedroht|bedrohung')] },
    INJURED,
  ],
  sonstiges: [{ id: 's_lage', strong: [p(' was (genau )?(sehen|hoeren)'), p(' (sehen|hoeren) sie (genau|etwas|was)')] }, INJURED],
};

const CONVERSATION: { id: ConversationIntent; patterns: RegExp[] }[] = [
  { id: 'begruessung', patterns: [w('notruf|leitstelle|feuerwehr und rettungsdienst|rettungsleitstelle|integrierte leitstelle|hallo|guten tag|guten abend|moin')] },
  { id: 'name', patterns: [p(' wie (heissen|ist ihr name)'), w('ihr name|ihren namen|mit wem spreche')] },
  {
    id: 'beruhigen',
    patterns: [
      w('ruhig|beruhigen|keine sorge|keine angst|alles gut'),
      p(' ich schicke '),
      p(' (ich )?hab(e)? (\\w+ ){0,4}(alarmiert|verstaendigt|informiert|losgeschickt) '),
      p(' (feuerwehr|rettungsdienst|rettungswagen|krankenwagen|notarzt|polizei|hilfe|kollegen) (ist|sind|kommt|kommen) (schon |gleich |sofort )*(unterwegs|alarmiert|informiert|verstaendigt|auf dem weg|gleich|sofort)'),
      p(' (ist|es ist) (schon )?(jemand|hilfe) unterwegs'),
      p(' (wir|die kollegen) (kommen|sind unterwegs|sind gleich)'),
    ],
  },
  { id: 'wiederholen', patterns: [w('wie bitte|nochmal|noch mal|noch einmal|wiederholen|nicht verstanden|langsamer|etwas lauter')] },
  { id: 'buchstabieren', patterns: [p(' buchstabier'), p(' wie schreibt man'), p(' wie (wird|schreibt sich) (das|die strasse|der name|der ort)')] },
  {
    id: 'anweisung',
    patterns: [
      p(' (gehen|verlassen|schliessen|bleiben|legen|machen|oeffnen|halten|warten|druecken|stellen|bringen|holen|schicken|loeschen) sie'),
      p(' (tueren?|fenster) (zu|schliessen)'),
      p(' (beginnen|fangen) sie (mit|an)'),
    ],
  },
  { id: 'ende', patterns: [w('auf wiederhoeren|wiederhoeren|tschuess|ich lege (jetzt )?auf|sie koennen (jetzt )?auflegen')] },
];

/** Reihenfolge im zweiten Durchlauf (medizinische Fragen zuerst) */
const CROSS_ORDER: KeywordCategory[] = ['rd', 'vu', 'th', 'brand', 'ktp', 'abc', 'wasser', 'pol', 'tier', 'sonstiges'];
/** Zu allgemeine Muster, die nur in der eigenen Fachrichtung gelten ("wann", "beteiligt", "sehen" …) */
const CROSS_SKIP = new Set(['ktp_zeit', 'ktp_ziel', 'ktp_mobil', 'w_sicht', 'vu_fzg', 'abc_menge', 'p_beteiligte', 'th_hilfe', 's_lage']);

/** Satz beginnt mit einer Anweisung ("Gehen Sie …") – Stichwörter darin sind keine Fragen */
const IMPERATIVE = /^ (?:gehen|verlassen|schliessen|bleiben|legen|machen|oeffnen|halten|warten|druecken|stellen|bringen|holen|schicken|beginnen|fangen|loeschen|schauen|gucken|pruefen|kontrollieren|versuchen|achten|nehmen) sie /;
const QUESTION_PART = / (?:wo|wie|was|wer|wann|welche\w*|wohin|wieviel\w*|ist|sind|hat|haben|gibt|kann|koennen|atmet|blutet) \w/;
const FILLERS = /^ (?:(?:ok|okay|so|aeh|aehm|gut|also|bitte|dann|jetzt|und) )*/;

function firstMatch(text: string, patterns: RegExp[]): { at: number; end: number } | null {
  let best: { at: number; end: number } | null = null;
  for (const re of patterns) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.at)) best = { at: m.index, end: m.index + m[0].length };
  }
  return best;
}
const firstIndex = (text: string, patterns: RegExp[]) => firstMatch(text, patterns)?.at ?? -1;

/** Treffer, die vollständig in einem längeren Treffer liegen, fallen weg ("wie viele Etagen" schlägt "Etage") */
function dropContained(hits: SpanHit[]): SpanHit[] {
  return hits.filter((h) => !hits.some((o) => o !== h && o.at <= h.at && o.end >= h.end && o.end - o.at > h.end - h.at));
}

/** Erkennt Fragen und Gesprächsabsichten in einer Äußerung des Disponenten */
export function matchIntents(utterance: string, category: KeywordCategory): IntentMatch {
  const text = normalize(utterance);
  const rules = [...COMMON, ...CATEGORY[category], ...SNA];
  let strongHits: SpanHit[] = [];
  for (const r of rules) {
    const m = firstMatch(text, r.strong);
    if (m && !strongHits.some((h) => h.id === r.id)) strongHits.push({ id: r.id, ...m });
  }
  strongHits.push(...matchDetails(text, category));
  strongHits = strongHits.filter((h) => !SUPERSEDED[h.id]?.some((id) => strongHits.some((o) => o.id === id)));
  if (!strongHits.length) {
    // Zweiter Durchlauf: Fragen anderer Fachrichtungen ("Atmet die Person?" beim Brand).
    // Bei gleicher Fundstelle gewinnt die zuerst geprüfte Fachrichtung.
    const cross: SpanHit[] = [];
    const add = (h: SpanHit) => {
      if (!cross.some((o) => o.id === h.id || (o.at < h.end && h.at < o.end))) cross.push(h);
    };
    for (const cat of CROSS_ORDER) {
      if (cat === category) continue;
      for (const r of CATEGORY[cat]) {
        if (CROSS_SKIP.has(r.id)) continue;
        const m = firstMatch(text, r.strong);
        if (m) add({ id: r.id, ...m });
      }
    }
    for (const h of matchDetails(text, null)) add(h);
    strongHits = cross;
  }
  const intents: ConversationIntent[] = [];
  for (const c of CONVERSATION) if (firstIndex(text, c.patterns) >= 0) intents.push(c.id);
  let hits = dropContained(strongHits);
  // Schwache Muster ("wo", "Straße" …) nur, wenn nichts anderes erkannt wurde
  if (!strongHits.length && !intents.some((i) => i !== 'begruessung')) {
    for (const r of rules) {
      if (!r.weak) continue;
      const m = firstMatch(text, r.weak);
      if (m && !hits.some((h) => h.id === r.id)) hits.push({ id: r.id, ...m });
    }
  }
  const lead = text.replace(FILLERS, ' ');
  const imp = IMPERATIVE.exec(lead);
  if (imp && !QUESTION_PART.test(lead.slice(imp[0].length - 1))) hits = [];
  return { questions: hits.sort((a, b) => a.at - b.at).map((h) => h.id), intents };
}
