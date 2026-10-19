import type { FactValue } from '../data/questions';
import { findScenario } from '../data/scenarios';
import type { GameState, Incident } from '../model/types';

/**
 * Lagemeldung der ersten Einheit an der Einsatzstelle – aus der tatsächlichen Lage (Szenario und
 * verdeckte Fakten des Notrufs), nicht aus dem gewählten Stichwort. Stimmt das Stichwort nicht,
 * merkt der Disponent es an der Lagemeldung.
 * Übernommen werden nur sachliche Fakten; Sätze aus Sicht des Anrufers ("Ich sehe …") werden ausgelassen.
 */

const firstPerson = /\b(ich|mir|mich|mein|meine|meinen|wir|uns|unser|unsere)\b|\?/i;

/** Fakt als sachlicher Satzteil (ohne Satzzeichen am Ende), sonst null */
function neutral(v: FactValue | undefined): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/[.!]+$/, '');
  if (!t || firstPerson.test(t) || /^(nein|ja|nichts|keine?)\b/i.test(t)) return null;
  return t;
}

const count = (n: number, one: string, many: string) => (n === 1 ? `eine ${one}` : `${n} ${many}`);

/** Teile der Lagemeldung (ohne "Eingetroffen"), z. B. für die Lagemeldung auf Nachfrage */
export function sceneSummary(state: GameState, inc: Incident): string[] {
  const call = inc.callId ? state.runtime.calls.find((c) => c.id === inc.callId) : undefined;
  const f = call?.facts ?? {};
  const sc = findScenario(inc.scenarioId);
  const variant = sc && call && call.variantIdx >= 0 ? sc.variants?.[call.variantIdx] : undefined;
  const parts: string[] = [];

  const what = neutral(f.what) ?? sc?.name ?? null;
  if (what) parts.push(variant?.label ? `${what} – ${variant.label}` : what);

  // tatsächliche Lage: Kategorie des Szenarios, nicht die des gewählten Stichworts
  const cat = sc?.category ?? inc.category;
  switch (cat) {
    case 'brand': {
      const obj = neutral(f.object);
      if (obj) parts.push(`Brandobjekt: ${obj}`);
      const floor = neutral(f.floor);
      if (floor) parts.push(floor);
      const smoke = neutral(f.smoke);
      if (smoke) parts.push(smoke);
      if (f.trapped === true) parts.push('Person noch im Gebäude vermisst, Menschenrettung unter Atemschutz eingeleitet');
      else if (f.trapped === false) parts.push('keine Personen mehr im Gebäude');
      if (f.spreading === true) parts.push('Brand breitet sich aus');
      else if (f.spreading === false) parts.push('Brand begrenzt');
      parts.push(f.trapped === true ? 'Brandbekämpfung läuft parallel' : 'Brandbekämpfung eingeleitet');
      break;
    }
    case 'th': {
      const help = neutral(f.help);
      if (help && help !== what) parts.push(help);
      const hazard = neutral(f.hazard);
      if (hazard) parts.push(`Gefahr: ${hazard}`);
      parts.push(f.trapped === true ? 'Person eingeschlossen, technische Rettung eingeleitet' : 'technische Hilfe eingeleitet');
      break;
    }
    case 'vu': {
      const veh = neutral(f.vehicles);
      if (veh) parts.push(`beteiligt: ${veh}`);
      const leak = neutral(f.leak);
      if (leak) parts.push(leak);
      parts.push(f.trapped === true ? 'eine Person eingeklemmt, technische Rettung wird vorbereitet' : 'keine Person eingeklemmt');
      parts.push('Einsatzstelle wird abgesichert');
      break;
    }
    case 'rd': {
      if (f.breathing === 'nein') parts.push('Patient ohne Atmung, Reanimation eingeleitet');
      else if (f.conscious === false) parts.push('Patient nicht ansprechbar, wird versorgt');
      else if (f.breathing === 'schwer') parts.push('Patient mit schwerer Atemnot, wird versorgt');
      else parts.push('Patient ansprechbar, wird versorgt');
      if (typeof f.age === 'number') parts.push(`Patient etwa ${f.age} Jahre`);
      break;
    }
    case 'wasser': {
      const water = neutral(f.water);
      if (water) parts.push(water);
      parts.push(f.visible === false ? 'Person nicht mehr sichtbar, Wasserrettung und Suche eingeleitet' : 'Person im Wasser sichtbar, Rettung eingeleitet');
      break;
    }
    case 'abc': {
      const sub = neutral(f.substance);
      if (sub) parts.push(`Stoff: ${sub}`);
      const cloud = neutral(f.cloud);
      if (cloud) parts.push(cloud);
      parts.push('Gefahrenbereich wird abgesperrt, Erkundung unter Schutzausrüstung');
      break;
    }
    case 'tier': {
      const sit = neutral(f.situation);
      if (sit) parts.push(sit);
      parts.push('Tierrettung eingeleitet');
      break;
    }
    case 'pol': {
      const pers = neutral(f.persons);
      if (pers) parts.push(pers);
      if (f.weapon === true) parts.push('Person bewaffnet, Eigenschutz beachten');
      break;
    }
    default:
      parts.push('verschaffen uns einen Überblick');
  }

  const pts = inc.patients.filter((p) => p.state !== 'kein_transport').length;
  const injured = typeof f.injured === 'number' ? f.injured : 0;
  if (cat !== 'rd' && Math.max(pts, injured) > 0) parts.push(count(Math.max(pts, injured), 'verletzte Person', 'Verletzte'));
  return parts;
}

/** Erste Lagemeldung beim Eintreffen; missing: Kräfte reichen nicht (Nachforderung folgt) */
export function arrivalReport(state: GameState, inc: Incident, missing: boolean): string {
  const parts = ['Eingetroffen', ...sceneSummary(state, inc)];
  parts.push(missing ? 'weitere Kräfte erforderlich, Nachforderung folgt' : 'weitere Rückmeldung folgt');
  return `${parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('. ')}.`;
}
