import type { CenterConfig, KeywordCategory, Station, Vehicle, Keyword } from '../model/types';
import { emptyVehicleRuntime } from '../data/sampleCenter';
import { newId } from '../model/ids';

/**
 * CSV-Importe für große Listen (Fahrzeuge, Wachen, Stichwörter).
 * Trennzeichen ";" oder "," werden automatisch erkannt, Anführungszeichen werden unterstützt.
 * Die erste Zeile enthält die Spaltennamen (Groß-/Kleinschreibung egal). Formate: docs/DATENFORMAT.md
 */

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const delim = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const split = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) {
        out.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const header = split(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((l) => {
    const cells = split(l);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  });
}

export interface CsvResult {
  added: number;
  errors: string[];
}

const num = (s: string) => Number(s.replace(',', '.'));

export function importStationsCsv(c: CenterConfig, text: string): CsvResult {
  const rows = parseCsv(text);
  const errors: string[] = [];
  let added = 0;
  rows.forEach((r, i) => {
    const line = i + 2;
    const org = c.organizations.find((o) => o.id === r.organisation || o.name.toLowerCase() === (r.organisation ?? '').toLowerCase());
    const lat = num(r.lat ?? '');
    const lng = num(r.lng ?? '');
    const kind = (r.art || 'feuerwache') as Station['kind'];
    if (!r.name) errors.push(`Zeile ${line}: Name fehlt.`);
    else if (!org) errors.push(`Zeile ${line}: Organisation "${r.organisation}" unbekannt.`);
    else if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) errors.push(`Zeile ${line}: Koordinaten ungültig.`);
    else if (!['feuerwache', 'feuerwehrhaus', 'rettungswache', 'notarztstandort', 'polizei', 'thw', 'kats', 'werkfeuerwehr', 'sonstige'].includes(kind)) errors.push(`Zeile ${line}: Art "${kind}" unbekannt.`);
    else if (c.stations.some((s) => s.name.toLowerCase() === r.name.toLowerCase())) errors.push(`Zeile ${line}: Wache "${r.name}" existiert bereits.`);
    else {
      c.stations.push({
        id: newId('st'),
        name: r.name,
        kind,
        organizationId: org.id,
        position: [lat, lng],
        address: r.adresse ?? '',
        capacity: Number.isFinite(num(r.stellplaetze ?? '')) && r.stellplaetze ? num(r.stellplaetze) : 4,
        turnoutSeconds: Number.isFinite(num(r.ausrueckzeit ?? '')) && r.ausrueckzeit ? num(r.ausrueckzeit) : 60,
      });
      added++;
    }
  });
  return { added, errors };
}

export function importVehiclesCsv(c: CenterConfig, text: string, now: number): CsvResult {
  const rows = parseCsv(text);
  const errors: string[] = [];
  let added = 0;
  rows.forEach((r, i) => {
    const line = i + 2;
    const type = c.vehicleTypes.find((t) => t.id === r.typ || t.code.toLowerCase() === (r.typ ?? '').toLowerCase());
    const station = c.stations.find((s) => s.id === r.wache || s.name.toLowerCase() === (r.wache ?? '').toLowerCase());
    if (!r.funkrufname) errors.push(`Zeile ${line}: Funkrufname fehlt.`);
    else if (!type) errors.push(`Zeile ${line}: Fahrzeugtyp "${r.typ}" unbekannt.`);
    else if (!station) errors.push(`Zeile ${line}: Wache "${r.wache}" unbekannt.`);
    else if (c.vehicles.some((v) => v.callsign.toLowerCase() === r.funkrufname.toLowerCase())) errors.push(`Zeile ${line}: Funkrufname "${r.funkrufname}" ist bereits vergeben.`);
    else {
      const v: Vehicle = {
        id: newId('v'),
        callsign: r.funkrufname,
        typeId: type.id,
        organizationId: station.organizationId,
        stationId: station.id,
        identifier: r.kennung ?? '',
        equipment: (r.ausstattung ?? '').split('|').map((s) => s.trim()).filter(Boolean),
        serviceWindows: [],
        maintenance: [],
        rt: emptyVehicleRuntime(station.position, now),
      };
      c.vehicles.push(v);
      added++;
    }
  });
  return { added, errors };
}

const CATS: KeywordCategory[] = ['brand', 'th', 'vu', 'rd', 'ktp', 'abc', 'wasser', 'tier', 'pol', 'sonstiges'];

export function importKeywordsCsv(c: CenterConfig, text: string): CsvResult {
  const rows = parseCsv(text);
  const errors: string[] = [];
  let added = 0;
  rows.forEach((r, i) => {
    const line = i + 2;
    const prio = Number(r.prioritaet || '2');
    const cat = (r.kategorie || '').toLowerCase() as KeywordCategory;
    if (!r.code || !r.bezeichnung) return errors.push(`Zeile ${line}: Code und Bezeichnung sind Pflicht.`);
    if (!CATS.includes(cat)) return errors.push(`Zeile ${line}: Kategorie "${r.kategorie}" unbekannt (erlaubt: ${CATS.join(', ')}).`);
    if (![1, 2, 3].includes(prio)) return errors.push(`Zeile ${line}: Priorität muss 1, 2 oder 3 sein.`);
    if (c.keywords.some((k) => k.code.toLowerCase() === r.code.toLowerCase())) return errors.push(`Zeile ${line}: Stichwort "${r.code}" existiert bereits.`);
    const reqs: { capability: string; count: number }[] = [];
    for (const part of (r.bedarf ?? '').split('|').map((s) => s.trim()).filter(Boolean)) {
      const [cap, cnt] = part.split(':');
      const n = Number(cnt ?? '1');
      if (!cap || !Number.isInteger(n) || n < 1) return errors.push(`Zeile ${line}: Bedarf "${part}" ungültig (Format faehigkeit:anzahl).`);
      reqs.push({ capability: cap, count: n });
    }
    const kw: Keyword = { id: newId('kw'), code: r.code, label: r.bezeichnung, category: cat, priority: prio as 1 | 2 | 3 };
    c.keywords.push(kw);
    c.aao.push({ id: newId('aao'), keywordId: kw.id, requirements: reqs, note: 'CSV-Import' });
    added++;
  });
  return { added, errors };
}
