import type { KeywordCategory } from '../model/types';

/**
 * Regelbasierte Erkennung, was der Disponent gefragt oder gesagt hat.
 * Ergebnis sind Frage-IDs aus data/questions.ts (die Antwort kommt immer aus den Szenariofakten)
 * oder Gesprächsabsichten ohne Faktenbezug (Begrüßung, Beruhigung, Anweisung …).
 * Kein KI-Dienst, keine Netzwerkzugriffe – nur Mustervergleich.
 */

export type ConversationIntent = 'name' | 'beruhigen' | 'wiederholen' | 'buchstabieren' | 'anweisung' | 'ende' | 'begruessung';

export interface IntentMatch {
  /** Frage-IDs in der Reihenfolge, in der sie im Satz vorkommen */
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
    strong: [p(' adresse'), w('strasse|hausnummer|notfallort|einsatzort|postleitzahl'), p(' wo (genau )?(ist|sind|befinde|wohn|steh)'), p(' (in )?welche[mnr]? (ort|stadt|gemeinde|dorf|ortsteil)'), p(' wo (genau )?(ist|liegt) (der|die|das) (notfall|unfall|brand|einsatz)'), p(' von wo (aus )?rufen')],
    weak: [w('wo genau|wo'), w('ort')],
  },
  { id: 'was', strong: [p(' was (genau )?(ist|wurde|hat sich) (denn )?(genau )?(passiert|los|geschehen|ereignet)'), p(' was (genau )?(passiert|los) '), p(' (erzaehlen|schildern|beschreiben) sie'), p(' worum geht'), p(' was (kann ich|koennen wir) (fuer sie )?tun')] },
  { id: 'rueckruf', strong: [p(' (telefon|rueckruf|handy)?nummer'), w('erreichbar|zurueckrufen|rueckruf')] },
];

const INJURED: Rule = {
  id: 'verletzt',
  strong: [p(' verletz'), w('blutet|blut|wunde'), p(' (jemand|wer|personen?) (zu schaden|getroffen)')],
};

const CATEGORY: Record<KeywordCategory, Rule[]> = {
  brand: [
    { id: 'b_objekt', strong: [p(' was (genau )?brennt'), p(' welche[snrm]? (gebaeude|objekt|raum|zimmer)'), p(' brennt (es|das) (im|in|auf) ')], weak: [w('brennt')] },
    { id: 'b_rauch', strong: [w('rauch|qualm|qualmt|flammen|flamme|feuerschein|rauchentwicklung'), p(' sehen sie (das )?feuer')] },
    {
      id: 'b_personen',
      strong: [p(' (noch )?(jemand|personen?|menschen|leute|bewohner|kinder) (im|in|drin|drinnen|in der|in dem|eingeschlossen|vermisst)'), w('eingeschlossen|vermisst|alle draussen|alle raus|noch drin|noch drinnen|in gefahr'), p(' (sind|ist) (noch )?(alle|jemand) (draussen|raus|drin)')],
    },
    INJURED,
    { id: 'b_stock', strong: [p(' stock'), w('etage|geschoss|obergeschoss|erdgeschoss|dachgeschoss|keller|gebaeudeteil'), p(' welche[rnm]? wohnung')] },
    { id: 'b_ausbreitung', strong: [p(' (aus)?breit'), p(' uebergreif'), w('groesser|schlimmer|ausdehnen|nachbarwohnung|nachbarhaus')] },
  ],
  th: [
    { id: 'th_hilfe', strong: [p(' welche hilfe'), p(' (was|wobei) (genau )?(brauchen|benoetigen) sie'), p(' wobei (sollen|koennen) wir')] },
    { id: 'th_personen', strong: [w('eingeklemmt|eingeschlossen|gefangen|kommt nicht raus|in gefahr'), p(' (jemand|personen?) (in gefahr|eingeschlossen|gefangen)')] },
    { id: 'th_gefahr', strong: [w('gefahr|strom|gas|einsturz|einsturzgefahr|stromleitung|wasser')] },
    INJURED,
  ],
  vu: [
    { id: 'vu_fzg', strong: [p(' wie viele (autos|fahrzeuge|wagen|pkw|lkw)'), w('fahrzeuge|fahrzeug|autos|auto|pkw|lkw|motorrad|beteiligt')] },
    { id: 'vu_eingeklemmt', strong: [w('eingeklemmt|eingeschlossen'), p(' (aus dem|aus den) (auto|fahrzeug|wagen)'), p(' (raus|heraus)kommen'), p(' kommt (noch )?(jemand )?nicht raus')] },
    INJURED,
    { id: 'vu_auslauf', strong: [p(' laeuft (etwas |was )?aus'), w('benzin|oel|diesel|betriebsstoffe|auslaufen|raucht|brennt|qualmt')] },
    { id: 'vu_strasse', strong: [w('fahrtrichtung|richtung|autobahn|bundesstrasse|landstrasse|kilometer|abfahrt|ausfahrt'), p(' (auf )?welche[rnm]? strasse')] },
  ],
  rd: [
    { id: 'rd_alter', strong: [p(' wie alt'), w('alter|jahre alt|geburtsjahr')] },
    { id: 'rd_bewusst', strong: [w('wach|ansprechbar|bewusstlos|bewusstsein|reagiert|reagieren|antwortet|bei sich')] },
    { id: 'rd_atmung', strong: [p(' atm'), w('atem|luft|luftnot|atemnot|schnappt')] },
    { id: 'rd_beschwerden', strong: [w('beschwerden|schmerzen|schmerz|symptome|was fehlt|tut weh|wo tut')] },
    { id: 'rd_vorerkrankung', strong: [p(' vorerkrank'), w('medikamente|tabletten|krankheiten|erkrankungen|vorgeschichte|diabetes|herzkrank')] },
  ],
  ktp: [
    { id: 'ktp_ziel', strong: [w('wohin|von wo|nach wo|zielklinik|ziel|abholen|abholort')] },
    { id: 'ktp_mobil', strong: [w('sitzen|sitzend|liegen|liegend|gehfaehig|rollstuhl|trage|laufen')] },
    { id: 'ktp_infekt', strong: [p(' infekt'), w('keime|mrsa|ansteckend|corona|covid|isolation|isoliert')] },
    { id: 'ktp_zeit', strong: [w('wann|uhrzeit|termin|zeitpunkt|abholzeit')] },
    { id: 'ktp_intensiv', strong: [w('beatmet|intensiv|intensivpflichtig|perfusor|perfusoren|ueberwachung')] },
  ],
  abc: [
    { id: 'abc_stoff', strong: [w('stoff|warntafel|warntafeln|kennzeichnung|gefahrstoff|chemikalie|chemikalien|un nummer|gefahrzettel')] },
    { id: 'abc_menge', strong: [p(' wie ?viel'), w('menge|liter')] },
    { id: 'abc_wolke', strong: [w('geruch|riecht|riechen|wolke|nebel|daempfe|dampf')] },
    INJURED,
  ],
  wasser: [
    { id: 'w_sicht', strong: [p(' (noch )?(zu )?sehen'), w('sichtbar|untergegangen|oberflaeche|treibt')] },
    { id: 'w_gewaesser', strong: [w('gewaesser|see|fluss|kanal|ufer|strand|hafen|ostsee|meer|wo genau im wasser')] },
    INJURED,
  ],
  tier: [
    { id: 't_tier', strong: [p(' (welches|was fuer ein) tier'), w('tierart|hund|katze|pferd|kuh|reh')] },
    { id: 't_lage', strong: [p(' wo (ist|befindet sich) (das tier|es)'), w('verletzt|feststecken|steckt fest|eingeklemmt')] },
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
    patterns: [w('ruhig|beruhigen|keine sorge|keine angst|alles gut'), p(' (hilfe|feuerwehr|rettungsdienst|rettungswagen|polizei|notarzt) ist (schon )?(unterwegs|alarmiert|auf dem weg)'), p(' (ich )?(schicke|habe .* alarmiert)'), p(' (wir|die kollegen) (kommen|sind unterwegs)')],
  },
  { id: 'wiederholen', patterns: [w('wie bitte|nochmal|noch einmal|wiederholen|nicht verstanden|langsamer|etwas lauter')] },
  { id: 'buchstabieren', patterns: [p(' buchstabier'), p(' wie schreibt man'), p(' wie (wird|schreibt sich) (das|die strasse)')] },
  {
    id: 'anweisung',
    patterns: [
      p(' (gehen|verlassen|schliessen|bleiben|legen|machen|oeffnen|halten|warten|druecken|stellen|bringen|holen|schicken) sie'),
      p(' (tueren?|fenster) (zu|schliessen)'),
      p(' (beginnen|fangen) sie (mit|an)'),
    ],
  },
  { id: 'ende', patterns: [w('auf wiederhoeren|wiederhoeren|tschuess|ich lege (jetzt )?auf|sie koennen (jetzt )?auflegen')] },
];

function firstIndex(text: string, patterns: RegExp[]): number {
  let best = -1;
  for (const re of patterns) {
    const m = re.exec(text);
    if (m && (best < 0 || m.index < best)) best = m.index;
  }
  return best;
}

/** Erkennt Fragen und Gesprächsabsichten in einer Äußerung des Disponenten */
export function matchIntents(utterance: string, category: KeywordCategory): IntentMatch {
  const text = normalize(utterance);
  const rules = [...COMMON, ...CATEGORY[category]];
  const strongHits: { id: string; at: number }[] = [];
  for (const r of rules) {
    const at = firstIndex(text, r.strong);
    if (at >= 0 && !strongHits.some((h) => h.id === r.id)) strongHits.push({ id: r.id, at });
  }
  const hits = [...strongHits];
  if (!strongHits.length) {
    for (const r of rules) {
      if (!r.weak) continue;
      const at = firstIndex(text, r.weak);
      if (at >= 0 && !hits.some((h) => h.id === r.id)) hits.push({ id: r.id, at });
    }
  }
  const intents: ConversationIntent[] = [];
  for (const c of CONVERSATION) if (firstIndex(text, c.patterns) >= 0) intents.push(c.id);
  return { questions: hits.sort((a, b) => a.at - b.at).map((h) => h.id), intents };
}
