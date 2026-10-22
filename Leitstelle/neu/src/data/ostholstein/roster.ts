import type { ServiceWindow } from '../../model/types';
import { parseCsv } from '../../persistence/csv';
import fahrzeugeCsv from './fahrzeuge.csv?raw';
import ergaenzungenCsv from './fahrzeuge-ergaenzungen.csv?raw';
import adressenCsv from './wachen-adressen.csv?raw';
import { gemeindenByOkz, okzOf } from './gemeinden';
import { KENNER, normTypeLabel, resolveType, type TypeGroup } from './fahrzeugtypen';
import { ORG_SHORT, WACHE_ALIAS, WACHEN, type WacheDef } from './wachen';

/**
 * Fahrzeuge und Wachen der Beispielleitstelle Ostholstein aus den öffentlichen Listen
 * (bos-fahrzeuge.info, Websites der Wehren, brianpeschke.de, Rettungsdienst Holstein).
 * Reines Modul ohne OSM-Bezug: liest die CSV-Dateien, führt Liste und Ergänzungen zusammen,
 * löst Dubletten auf, ordnet Typen, Organisationen und Dienstzeiten zu und vergibt Rufnamen
 * für Fahrzeuge ohne veröffentlichten Funkrufnamen.
 */

export interface RosterRow {
  wache: string;
  funkrufname: string;
  fahrzeugtyp: string;
  organisation: string;
  kennzeichen: string;
  baujahr: string;
  quelle: string;
  hinweis: string;
  liste: 'liste' | 'ergaenzung';
}

export interface RosterVehicle {
  callsign: string;
  /** Rufname nach Schema erzeugt (kein veröffentlichter Funkrufname) */
  generated: boolean;
  /** Typbezeichnung aus der Liste */
  typeLabel: string;
  typeId: string;
  wache: string;
  organizationId: string;
  identifier: string;
  year?: number;
  serviceWindows: ServiceWindow[];
  /** nie alarmiert (Info-/Werbefahrzeug, Jugendfeuerwehr, Musikzug) */
  outOfService: boolean;
  /** Hinweis aus der Ergänzungsliste */
  note: string;
  source: string;
}

export interface RosterStation {
  def: WacheDef;
  /** Adresse aus wachen-adressen.csv, dem Hinweis der Liste oder der Wachentabelle */
  address: string;
  /** Ortskennziffer (für erzeugte Rufnamen) */
  okz: string;
}

export interface RosterNote {
  wache: string;
  callsign: string;
  type: string;
  reason: string;
}

export interface Roster {
  vehicles: RosterVehicle[];
  stations: RosterStation[];
  /** weggelassene Einträge mit Grund */
  omitted: RosterNote[];
  /** zusammengeführte, umgehängte oder umnummerierte Einträge */
  merged: RosterNote[];
}

export interface RosterInput {
  fahrzeuge: string;
  ergaenzungen: string;
  adressen: string;
}

export const ROSTER_INPUT: RosterInput = { fahrzeuge: fahrzeugeCsv, ergaenzungen: ergaenzungenCsv, adressen: adressenCsv };

// ---------------------------------------------------------------- Regeln für Dubletten (Hinweise der Ergänzungsliste)

/** Einträge der Liste, die einem Fahrzeug mit Rufnamen entsprechen: Kennzeichen übernehmen, Eintrag einmal führen */
const MERGE_INTO: Record<string, string> = {
  'Rettung Ostholstein 67/83-xx': 'Rettung Ostholstein 67/83-02',
  'Rettung Ostholstein RTW (OH-RD 6800)': 'Rettung Ostholstein 89/83-01',
  'Rettung Ostholstein NEF (OH-R 4300)': 'Rettung Ostholstein 67/82-01',
};

/** Weggelassene Einträge: [Wache, Rufname oder Typ, Liste, Grund] */
const DROP: [string | null, string, RosterRow['liste'] | null, string][] = [
  [null, 'Rettung Ostholstein XX/83-0X', null, 'einer der Tages-RTW 67/83-03 bis -05 der RW Eutin (Dublette)'],
  [null, 'Rettung Ostholstein xx/83-xx', null, 'nicht zuzuordnen, vermutlich Dublette eines bekannten RTW'],
  ['FF Timmendorfer Strand OF Hemmelsdorf', 'MZF', 'ergaenzung', 'vermutlich identisch mit MTW 89/18-01 der Liste'],
  ['FF Fehmarn OF Burg auf Fehmarn', 'DLK (F32 TLK)', 'ergaenzung', 'Bronto F32 TLK ist eine Teleskopmastbühne – vermutlich identisch mit TMB 33/36-01 der Liste'],
];

/** Eintrag einer anderen Wache zuordnen */
const MOVE_TO: Record<string, string> = {
  'Rettung Ostholstein KTW (OH-RD 7400)': 'rdh. RW Eutin',
  // Führungsdienst Rettungsdienst (Kreisebene) an der Lehrrettungswache Eutin
  'Rettung Ostholstein 01/10-02': 'rdh. RW Eutin',
  'Rettung Ostholstein 01/10-03': 'rdh. RW Eutin',
};

/** Rufname ist doppelt vergeben: Dieser Eintrag (Wache|Rufname|Liste) bekommt die nächste freie Nummer */
const RENUMBER = new Set(['FF Timmendorfer Strand|Florian Ostholstein 89/47-01|ergaenzung']);

/** Präfix im Funkrufnamen je Organisation (für erzeugte Rufnamen) */
const PREFIX_BY_ORG: [RegExp, string][] = [
  [/Feuerwehr/i, 'Florian'],
  [/Rettungsdienst/i, 'Rettung'],
  [/DRK/i, 'Rotkreuz'],
  [/Johanniter|JUH/i, 'Akkon'],
  [/ASB/i, 'Sama'],
  [/DLRG/i, 'Pelikan'],
  [/THW/i, 'Heros'],
  [/Malteser/i, 'Johannes'],
];
const KNOWN_PREFIXES = new Set(['Florian', 'Rettung', 'Rotkreuz', 'Akkon', 'Sama', 'Kater', 'Pelikan', 'Adler', 'Heros', 'Johannes', 'Christoph', 'Kreis']);

/** Funkrufname nach Schema "OKZ/Kenner-NN" (vollständig, mit zweistelligen Zahlen) */
const SCHEMA = /(\d\d)\/(\d\d)-(\d\d)$/;

/** Ist der Funkrufname veröffentlicht (und nicht nur ein Platzhalter)? */
export function isRealCallsign(cs: string): boolean {
  if (!cs.trim() || /nicht veröffentlicht/i.test(cs)) return false;
  if (/xx|0X/i.test(cs)) return false;
  if (/\((OH|SHG)[-\s]/.test(cs)) return false; // "RTW (OH-RD 6800)": nur Kennzeichen
  if (/\d\/[^\d\s]/.test(cs)) return false; // "92/Werbefahrzeug", "86/Gabelstapler": Nummer fehlt
  return /\d/.test(cs);
}

// ---------------------------------------------------------------- Dienstzeiten aus dem Hinweis

const SEASON = [5, 6, 7, 8, 9];

/**
 * Dienstzeiten aus dem Hinweistext: "Tages-RTW"/"tagsüber" → 7–19 Uhr, "Mo–Fr" → werktags,
 * "nur Saison"/"Mai–Sept" → nur Mai bis September, "24h" → ganztags. Ohne Angabe: rund um die Uhr.
 */
export function parseServiceWindows(hint: string): ServiceWindow[] {
  const h = hint.toLowerCase();
  const months = /mai\s*[–-]\s*sept?|nur saison/.test(h) ? SEASON : undefined;
  const weekdays = /\bmo\s*[–-]\s*fr\b/.test(h) ? [1, 2, 3, 4, 5] : [];
  const day = /tages-rtw|tagsüber/.test(h);
  if (!day && !months && !weekdays.length) return [];
  return [{ fromHour: day ? 7 : 0, toHour: day ? 19 : 24, weekdays, ...(months ? { months: [...months] } : {}) }];
}

/** Adresse aus einem Hinweis ("…; Adresse: Poststraße 3, 23623 Ahrensbök") */
const hintAddress = (hint: string) => /Adresse:\s*([^;"]+)/.exec(hint)?.[1].trim() ?? '';

// ---------------------------------------------------------------- Hilfen

const mode = (xs: string[]): string | undefined => {
  const n = new Map<string, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
};

function typeGroup(def: WacheDef, organisation: string): TypeGroup {
  if (def.kind === 'rw' || def.kind === 'luft') return 'rd';
  if (/Feuerwehr|Rettungshunde/i.test(organisation)) return 'ff';
  if (/THW/i.test(organisation)) return 'thw';
  if (/DLRG/i.test(organisation)) return 'dlrg';
  if (/Rettungsdienst/i.test(organisation)) return 'rd';
  return 'san';
}

function organizationOf(def: WacheDef, group: TypeGroup, typeId: string): string {
  if (def.kind === 'luft') return 'org_ext';
  if (def.kind === 'rw') return typeId === 'nef' ? 'org_na' : typeId === 'ktw' || typeId === 'oh_mzrtw' ? 'org_ktp' : 'org_rd';
  // Feuerwehrfahrzeuge an anderen Standorten (GW-Dekon P beim THW Oldenburg) bleiben Feuerwehr
  if (group === 'ff' && def.kind !== 'kats') return 'org_ff';
  return def.kind === 'thw' ? 'org_thw' : def.kind === 'kats' ? 'org_kats' : 'org_ff';
}

const isNeverAlarmed = (r: RosterRow, typeId: string) => typeId === 'oh_info' || /Jugendfeuerwehr/i.test(r.organisation) || /Musikzug|JFW/i.test(r.funkrufname);

// ---------------------------------------------------------------- Aufbau

export function buildRoster(input: RosterInput = ROSTER_INPUT): Roster {
  const defs = new Map(WACHEN.map((d) => [d.name, d]));
  const omitted: RosterNote[] = [];
  const merged: RosterNote[] = [];
  const row = (r: Record<string, string>, liste: RosterRow['liste']): RosterRow => ({
    wache: WACHE_ALIAS[r.wache?.trim()] ?? r.wache?.trim() ?? '',
    funkrufname: r.funkrufname?.trim() ?? '',
    fahrzeugtyp: r.fahrzeugtyp?.trim() ?? '',
    organisation: r.organisation?.trim() ?? '',
    kennzeichen: r.kennzeichen?.trim() ?? '',
    baujahr: r.baujahr?.trim() ?? '',
    quelle: r.quelle?.trim() ?? '',
    hinweis: r.hinweis?.trim() ?? '',
    liste,
  });
  let rows = [...parseCsv(input.fahrzeuge).map((r) => row(r, 'liste')), ...parseCsv(input.ergaenzungen).map((r) => row(r, 'ergaenzung'))];
  const note = (r: RosterRow, reason: string): RosterNote => ({ wache: r.wache, callsign: r.funkrufname, type: r.fahrzeugtyp, reason });

  // weglassen
  rows = rows.filter((r) => {
    const d = DROP.find(([w, what, l]) => (w === null || w === r.wache) && (what === r.funkrufname || what === r.fahrzeugtyp) && (l === null || l === r.liste));
    if (d) omitted.push(note(r, d[3]));
    return !d;
  });
  // Dubletten zusammenführen (gleicher Rufname bzw. ausdrückliche Zuordnung)
  const byCallsign = new Map<string, RosterRow>();
  const kept: RosterRow[] = [];
  const mergeInto = (target: RosterRow, r: RosterRow) => {
    target.kennzeichen ||= r.kennzeichen;
    target.baujahr ||= r.baujahr;
    target.hinweis ||= r.hinweis;
    if (r.liste === 'ergaenzung' && r.hinweis) target.hinweis = r.hinweis;
  };
  const pendingMerge: RosterRow[] = [];
  for (const r of rows) {
    if (MERGE_INTO[r.funkrufname]) {
      pendingMerge.push(r);
      continue;
    }
    const key = `${r.funkrufname}`;
    const renumber = RENUMBER.has(`${r.wache}|${r.funkrufname}|${r.liste}`);
    if (isRealCallsign(r.funkrufname) && !renumber && byCallsign.has(key)) {
      const t = byCallsign.get(key)!;
      mergeInto(t, r);
      merged.push(note(r, `doppelt in den Listen – zusammengeführt`));
      continue;
    }
    if (isRealCallsign(r.funkrufname) && !renumber) byCallsign.set(key, r);
    kept.push(r);
  }
  for (const r of pendingMerge) {
    const target = byCallsign.get(MERGE_INTO[r.funkrufname]);
    if (!target) {
      omitted.push(note(r, `Dublette von ${MERGE_INTO[r.funkrufname]}, das in den Listen fehlt`));
      continue;
    }
    const ident = r.kennzeichen;
    target.kennzeichen = ident || target.kennzeichen;
    target.baujahr ||= r.baujahr;
    merged.push(note(r, `= ${target.funkrufname}${ident ? ` (Kennzeichen ${ident} übernommen)` : ''}`));
  }

  // Wache: umhängen, "unbekannt" über die Ortskennziffer ableiten
  const resolved: (RosterRow & { def: WacheDef })[] = [];
  for (const r of kept) {
    let wache = MOVE_TO[r.funkrufname] ?? r.wache;
    if (MOVE_TO[r.funkrufname]) merged.push(note(r, `Wache ${r.wache} → ${wache}`));
    if (wache === 'unbekannt') {
      const m = /^(\S+) Ostholstein (\d\d)\//.exec(r.funkrufname);
      const short = m ? ORG_SHORT[m[1]] : undefined;
      const cands = m && short ? gemeindenByOkz(m[2]).flatMap((g) => [`${short} ${g.name}`, `${short.replace(/ OV$/, '')} ${g.name}`]) : [];
      const hit = cands.find((n) => defs.has(n));
      if (!hit) {
        omitted.push(note(r, 'Wache unbekannt und nicht aus der Ortskennziffer ableitbar'));
        continue;
      }
      merged.push(note(r, `Wache aus Ortskennziffer ${m![2]} abgeleitet: ${hit}`));
      wache = hit;
    }
    const def = defs.get(wache);
    if (!def) {
      omitted.push(note(r, `Wache „${wache}“ nicht in der Wachentabelle`));
      continue;
    }
    resolved.push({ ...r, wache, def });
  }

  // Typen, Organisation, Dienstzeiten
  const typed = resolved.flatMap((r) => {
    const group = typeGroup(r.def, r.organisation);
    const typeId = resolveType(r.fahrzeugtyp, group);
    if (!typeId) {
      omitted.push(note(r, `Fahrzeugtyp „${r.fahrzeugtyp}“ unbekannt`));
      return [];
    }
    return [{ r, group, typeId }];
  });

  // Ortskennziffer je Wache: häufigste OKZ der echten Rufnamen (ohne Kreisebene 0x), sonst nach Gemeinde
  const okzOfWache = new Map<string, string>();
  for (const def of WACHEN) {
    const own = typed.filter((x) => x.r.def === def && isRealCallsign(x.r.funkrufname)).map((x) => SCHEMA.exec(x.r.funkrufname)?.[1]).filter((o): o is string => !!o && !o.startsWith('0'));
    okzOfWache.set(def.name, mode(own) ?? okzOf({ name: def.name, position: def.pos }));
  }

  // Kenner je Typ (und Präfix) aus den echten Rufnamen
  const prefixOf = (r: RosterRow) => {
    const w = r.funkrufname.split(/\s+/)[0];
    if (KNOWN_PREFIXES.has(w)) return w;
    return PREFIX_BY_ORG.find(([re]) => re.test(r.organisation))?.[1] ?? 'Florian';
  };
  const real = typed.filter((x) => isRealCallsign(x.r.funkrufname) && !RENUMBER.has(`${x.r.wache}|${x.r.funkrufname}|${x.r.liste}`));
  const kennerOf = (typeId: string, prefix: string) =>
    mode(real.filter((x) => x.typeId === typeId && prefixOf(x.r) === prefix).map((x) => SCHEMA.exec(x.r.funkrufname)?.[2]).filter((k): k is string => !!k)) ??
    mode(real.filter((x) => x.typeId === typeId).map((x) => SCHEMA.exec(x.r.funkrufname)?.[2]).filter((k): k is string => !!k)) ??
    KENNER[typeId] ??
    '00';

  // belegte Nummern "OKZ/Kenner-NN" (über alle Präfixe, damit erzeugte Rufnamen eindeutig sprechbar bleiben)
  const usedNumbers = new Set(real.map((x) => SCHEMA.exec(x.r.funkrufname)?.slice(1, 4).join('|')).filter((s): s is string => !!s));
  const usedCallsigns = new Set(real.map((x) => x.r.funkrufname));
  const generate = (r: RosterRow, def: WacheDef, typeId: string) => {
    const prefix = prefixOf(r);
    // Teile des Platzhalters übernehmen: "Pelikan Ostholstein 67/18-xx" → OKZ 67, Kenner 18
    const part = /Ostholstein (\d\d)\/(?:(\d\d)-)?/.exec(r.funkrufname);
    const okz = part?.[1] ?? okzOfWache.get(def.name)!;
    const kenner = part?.[2] ?? kennerOf(typeId, prefix);
    for (let nr = 1; nr < 100; nr++) {
      const nn = String(nr).padStart(2, '0');
      const cs = `${prefix} Ostholstein ${okz}/${kenner}-${nn}`;
      if (usedNumbers.has(`${okz}|${kenner}|${nn}`) || usedCallsigns.has(cs)) continue;
      usedNumbers.add(`${okz}|${kenner}|${nn}`);
      usedCallsigns.add(cs);
      return cs;
    }
    throw new Error(`Kein freier Rufname für ${r.funkrufname}`);
  };

  const vehicles: RosterVehicle[] = [];
  for (const { r, group, typeId } of typed) {
    const renumber = RENUMBER.has(`${r.wache}|${r.funkrufname}|${r.liste}`);
    const realCs = isRealCallsign(r.funkrufname) && !renumber;
    const callsign = realCs ? r.funkrufname : generate(r, r.def, typeId);
    if (renumber) merged.push(note(r, `Rufname doppelt – neu: ${callsign}`));
    // Rettungshubschrauber: Dienstzeit Tag (7–20 Uhr)
    const serviceWindows = typeId === 'rth' ? [{ fromHour: 7, toHour: 20, weekdays: [] }] : parseServiceWindows(r.hinweis);
    vehicles.push({
      callsign,
      generated: !realCs,
      typeLabel: normTypeLabel(r.fahrzeugtyp),
      typeId,
      wache: r.wache,
      organizationId: organizationOf(r.def, group, typeId),
      identifier: r.kennzeichen && r.kennzeichen !== 'k.A.' ? r.kennzeichen : '',
      ...(Number(r.baujahr) > 1900 ? { year: Number(r.baujahr) } : {}),
      serviceWindows,
      outOfService: isNeverAlarmed(r, typeId),
      note: r.hinweis,
      source: r.quelle,
    });
  }

  // Wachen mit Adresse (wachen-adressen.csv, sonst Hinweis, sonst Tabelle)
  const adressen = new Map(parseCsv(input.adressen).map((a) => [a.wache?.trim(), a.adresse?.trim() ?? '']));
  const hintAddr = new Map<string, string>();
  for (const { r } of typed) if (!hintAddr.has(r.wache) && hintAddress(r.hinweis)) hintAddr.set(r.wache, hintAddress(r.hinweis));
  const stations: RosterStation[] = WACHEN.map((def) => ({
    def,
    address: (def.kind === 'luft' ? def.address : undefined) || adressen.get(def.adr ?? def.name) || hintAddr.get(def.name) || def.address || '',
    okz: okzOfWache.get(def.name)!,
  }));

  // nach Wachen geordnet (Reihenfolge der Wachentabelle), innerhalb der Wache wie in den Listen
  const order = new Map(WACHEN.map((d, i) => [d.name, i]));
  vehicles.sort((a, b) => order.get(a.wache)! - order.get(b.wache)!);
  return { vehicles, stations, omitted, merged };
}
