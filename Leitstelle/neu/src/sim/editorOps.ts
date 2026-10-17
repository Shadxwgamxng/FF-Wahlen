import type {
  AaoRule,
  Area,
  GameState,
  Hospital,
  Keyword,
  NeighborCenter,
  Organization,
  Person,
  Qualification,
  StatusDef,
  Station,
  Vehicle,
  VehicleType,
} from '../model/types';
import { emptyVehicleRuntime } from '../data/sampleCenter';

/**
 * Editor-Operationen auf der Leitstellenkonfiguration (Geschäftsregeln des Editors).
 * Jede Funktion liefert null bei Erfolg oder eine verständliche Fehlermeldung.
 * Sie werden vom Store (store.edit) und von Tests direkt aufgerufen.
 */

export type EditResult = string | null;

function upsert<T extends { id: string }>(list: T[], item: T, isNew: boolean): EditResult {
  const idx = list.findIndex((x) => x.id === item.id);
  if (isNew) {
    if (idx >= 0) return `ID "${item.id}" ist bereits vergeben.`;
    list.push(item);
  } else {
    if (idx < 0) return 'Eintrag existiert nicht mehr (wurde zwischenzeitlich gelöscht).';
    list[idx] = item;
  }
  return null;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// ------------------------------------------------------------------ Wachen

export function saveStation(g: GameState, st: Station, isNew: boolean): EditResult {
  const c = g.center;
  if (!st.name.trim()) return 'Name fehlt.';
  if (c.stations.some((x) => x.id !== st.id && same(x.name, st.name))) return `Eine Wache "${st.name}" existiert bereits.`;
  if (!c.organizations.some((o) => o.id === st.organizationId)) return 'Bitte eine Organisation wählen.';
  const count = c.vehicles.filter((v) => v.stationId === st.id).length;
  if (st.capacity < count) return `Kapazität (${st.capacity}) ist kleiner als die Zahl der zugeordneten Fahrzeuge (${count}).`;
  const old = c.stations.find((x) => x.id === st.id);
  const err = upsert(c.stations, { ...st, capacity: Number(st.capacity), turnoutSeconds: Number(st.turnoutSeconds) }, isNew);
  if (err) return err;
  // Verlegte Wache: Fahrzeuge auf der Wache mitnehmen
  if (old && (old.position[0] !== st.position[0] || old.position[1] !== st.position[1])) {
    for (const v of c.vehicles) if (v.stationId === st.id && !v.rt.move && (v.rt.status === 'frei_wache' || v.rt.status === 'ausser_dienst')) v.rt.position = [...st.position];
  }
  return null;
}

export function deleteStation(g: GameState, id: string): EditResult {
  const c = g.center;
  const n = c.vehicles.filter((v) => v.stationId === id).length;
  if (n > 0) return `Der Wache sind noch ${n} Fahrzeug(e) zugeordnet. Bitte zuerst verlegen oder löschen.`;
  c.stations = c.stations.filter((s) => s.id !== id);
  c.personnel = c.personnel.filter((p) => p.stationId !== id);
  for (const a of c.areas) a.responsibleStationIds = a.responsibleStationIds.filter((s) => s !== id);
  return null;
}

// ------------------------------------------------------------------ Fahrzeuge

export function saveVehicle(g: GameState, input: Vehicle, isNew: boolean): EditResult {
  const c = g.center;
  if (!input.callsign.trim()) return 'Funkrufname fehlt.';
  if (c.vehicles.some((x) => x.id !== input.id && same(x.callsign, input.callsign))) return `Funkrufname "${input.callsign}" ist bereits vergeben.`;
  const type = c.vehicleTypes.find((t) => t.id === input.typeId);
  if (!type) return 'Bitte einen Fahrzeugtyp wählen.';
  const st = c.stations.find((s) => s.id === input.stationId);
  if (!st) return 'Bitte eine Wache wählen.';
  const atStation = c.vehicles.filter((v) => v.stationId === st.id && v.id !== input.id).length;
  if (atStation >= st.capacity) return `Die Wache "${st.name}" hat keinen freien Stellplatz (Kapazität ${st.capacity}).`;
  for (const w of input.serviceWindows) if (w.fromHour >= w.toHour) return 'Dienstzeit: Beginn muss vor dem Ende liegen.';
  for (const m of input.maintenance) if (m.from >= m.to) return 'Wartung: Beginn muss vor dem Ende liegen.';
  if (input.external && !c.neighbors.some((n) => n.id === input.external!.neighborId)) return 'Externe Anforderung: Nachbarleitstelle wählen.';
  const existing = c.vehicles.find((v) => v.id === input.id);
  const v: Vehicle = {
    ...input,
    organizationId: input.organizationId || st.organizationId,
    // Laufzeitdaten nie aus dem Formular übernehmen (könnten veraltet sein)
    rt: existing && !isNew ? existing.rt : emptyVehicleRuntime(st.position, g.runtime.clock.now),
  };
  const err = upsert(c.vehicles, v, isNew);
  if (err) return err;
  if (existing && existing.stationId !== v.stationId && !v.rt.incidentId && !v.rt.move && (v.rt.status === 'frei_wache' || v.rt.status === 'ausser_dienst')) {
    v.rt.position = [...st.position];
    v.rt.crewIds = [];
  }
  return null;
}

export function deleteVehicle(g: GameState, id: string): EditResult {
  const v = g.center.vehicles.find((x) => x.id === id);
  if (!v) return 'Fahrzeug nicht gefunden.';
  if (v.rt.incidentId) return `${v.callsign} ist im Einsatz gebunden und kann nicht gelöscht werden.`;
  g.center.vehicles = g.center.vehicles.filter((x) => x.id !== id);
  g.runtime.radio = g.runtime.radio.filter((r) => r.vehicleId !== id);
  return null;
}

// ------------------------------------------------------------------ Fahrzeugtypen, Organisationen, Qualifikationen

export function saveVehicleType(g: GameState, t: VehicleType, isNew: boolean): EditResult {
  const c = g.center;
  if (c.vehicleTypes.some((x) => x.id !== t.id && same(x.code, t.code))) return `Kürzel "${t.code}" ist bereits vergeben.`;
  if (t.capabilities.length === 0) return 'Mindestens eine Fähigkeit auswählen.';
  for (const r of t.crewRequirements) if (!c.qualifications.some((q) => q.id === r.qualification) || r.count < 1) return 'Besatzung: ungültige Qualifikation oder Anzahl.';
  return upsert(c.vehicleTypes, { ...t, seats: Number(t.seats), speedKmh: Number(t.speedKmh) }, isNew);
}

export function deleteVehicleType(g: GameState, id: string): EditResult {
  const n = g.center.vehicles.filter((v) => v.typeId === id).length;
  if (n) return `Der Typ wird von ${n} Fahrzeug(en) verwendet.`;
  g.center.vehicleTypes = g.center.vehicleTypes.filter((t) => t.id !== id);
  return null;
}

export function saveOrganization(g: GameState, o: Organization, isNew: boolean): EditResult {
  if (g.center.organizations.some((x) => x.id !== o.id && same(x.name, o.name))) return `Organisation "${o.name}" existiert bereits.`;
  return upsert(g.center.organizations, o, isNew);
}

export function deleteOrganization(g: GameState, id: string): EditResult {
  const n = g.center.stations.filter((s) => s.organizationId === id).length;
  if (n) return `Die Organisation ist ${n} Wache(n) zugeordnet.`;
  g.center.organizations = g.center.organizations.filter((o) => o.id !== id);
  return null;
}

export function saveQualification(g: GameState, q: Qualification, isNew: boolean): EditResult {
  if (!/^[a-z0-9_]+$/.test(q.id)) return 'Kürzel: nur Kleinbuchstaben, Ziffern und _ erlaubt.';
  return upsert(g.center.qualifications, q, isNew);
}

export function deleteQualification(g: GameState, id: string): EditResult {
  const c = g.center;
  if (c.vehicleTypes.some((t) => t.crewRequirements.some((r) => r.qualification === id))) return 'Die Qualifikation wird in Besatzungsanforderungen verwendet.';
  c.qualifications = c.qualifications.filter((q) => q.id !== id);
  for (const p of c.personnel) p.qualifications = p.qualifications.filter((x) => x !== id);
  return null;
}

// ------------------------------------------------------------------ Stichwörter & AAO

export function saveKeyword(g: GameState, k: Keyword, isNew: boolean): EditResult {
  if (g.center.keywords.some((x) => x.id !== k.id && same(x.code, k.code))) return `Stichwort "${k.code}" existiert bereits.`;
  const err = upsert(g.center.keywords, { ...k, priority: Number(k.priority) as 1 | 2 | 3 }, isNew);
  if (err) return err;
  if (isNew && !g.center.aao.some((a) => a.keywordId === k.id)) g.center.aao.push({ id: `aao_${k.id}`, keywordId: k.id, requirements: [], note: '' });
  return null;
}

export function deleteKeyword(g: GameState, id: string): EditResult {
  if (g.runtime.incidents.some((i) => i.keywordId === id)) return 'Das Stichwort wird von einem laufenden Einsatz verwendet.';
  g.center.keywords = g.center.keywords.filter((k) => k.id !== id);
  g.center.aao = g.center.aao.filter((a) => a.keywordId !== id);
  return null;
}

export function saveAao(g: GameState, a: AaoRule, isNew: boolean): EditResult {
  if (!g.center.keywords.some((k) => k.id === a.keywordId)) return 'Bitte ein Stichwort wählen.';
  if (g.center.aao.some((x) => x.id !== a.id && x.keywordId === a.keywordId)) return 'Für dieses Stichwort existiert bereits eine AAO-Regel.';
  for (const r of a.requirements) if (!r.capability || !(r.count >= 1)) return 'Ungültige Anforderung in der AAO.';
  return upsert(g.center.aao, a, isNew);
}

export function deleteAao(g: GameState, id: string): EditResult {
  g.center.aao = g.center.aao.filter((a) => a.id !== id);
  return null;
}

// ------------------------------------------------------------------ Personal

export function savePerson(g: GameState, p: Person, isNew: boolean): EditResult {
  if (!g.center.stations.some((s) => s.id === p.stationId)) return 'Bitte eine Wache wählen.';
  for (const a of p.absences) if (a.from >= a.to) return 'Abwesenheit: Beginn muss vor dem Ende liegen.';
  const bound = g.center.vehicles.find((v) => v.rt.crewIds.includes(p.id));
  const old = g.center.personnel.find((x) => x.id === p.id);
  if (bound && old && old.stationId !== p.stationId) return `${p.name} ist derzeit auf ${bound.callsign} im Einsatz und kann nicht versetzt werden.`;
  return upsert(g.center.personnel, p, isNew);
}

export function deletePerson(g: GameState, id: string): EditResult {
  const bound = g.center.vehicles.find((v) => v.rt.crewIds.includes(id));
  if (bound) return `Die Person ist derzeit auf ${bound.callsign} im Einsatz.`;
  g.center.personnel = g.center.personnel.filter((p) => p.id !== id);
  return null;
}

// ------------------------------------------------------------------ Kliniken, Nachbarn, Gebiete, Status

export function saveHospital(g: GameState, h: Hospital, isNew: boolean): EditResult {
  const old = g.center.hospitals.find((x) => x.id === h.id);
  return upsert(g.center.hospitals, { ...h, capacity: Number(h.capacity), occupied: old?.occupied ?? 0 }, isNew);
}

export function deleteHospital(g: GameState, id: string): EditResult {
  if (g.center.vehicles.some((v) => v.rt.targetHospitalId === id)) return 'Ein Fahrzeug transportiert gerade einen Patienten dorthin.';
  g.center.hospitals = g.center.hospitals.filter((h) => h.id !== id);
  g.runtime.hospitalBeds = g.runtime.hospitalBeds.filter((b) => b.hospitalId !== id);
  return null;
}

export function saveNeighbor(g: GameState, n: NeighborCenter, isNew: boolean): EditResult {
  return upsert(g.center.neighbors, n, isNew);
}

export function deleteNeighbor(g: GameState, id: string): EditResult {
  const n = g.center.vehicles.filter((v) => v.external?.neighborId === id).length;
  if (n) return `${n} externe(s) Fahrzeug(e) verweisen auf diese Nachbarleitstelle.`;
  g.center.neighbors = g.center.neighbors.filter((x) => x.id !== id);
  return null;
}

export function saveArea(g: GameState, a: Area, isNew: boolean): EditResult {
  if (a.polygon.length < 3) return 'Ein Gebiet braucht mindestens 3 Eckpunkte.';
  return upsert(g.center.areas, a, isNew);
}

export function deleteArea(g: GameState, id: string): EditResult {
  g.center.areas = g.center.areas.filter((a) => a.id !== id);
  return null;
}

export function saveStatusDef(g: GameState, s: StatusDef): EditResult {
  const c = g.center;
  if (!s.code.trim() || !s.label.trim()) return 'Code und Bezeichnung sind Pflicht.';
  if (c.statusDefs.some((x) => x.meaning !== s.meaning && x.code === s.code)) return `Code "${s.code}" ist bereits vergeben.`;
  const i = c.statusDefs.findIndex((x) => x.meaning === s.meaning);
  if (i < 0) return 'Unbekannter Status.';
  c.statusDefs[i] = s;
  return null;
}
