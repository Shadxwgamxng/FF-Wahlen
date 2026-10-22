import { useEffect, useRef, useSyncExternalStore } from 'react';
import { kvStore } from '../persistence/db';
import { store, useStore } from '../store/gameStore';
import type { GameState, Vehicle } from '../model/types';

/**
 * Fahrzeugbilder für die Karte: je Fahrzeug ein Bild ohne und eines mit Blaulicht.
 * Bei Fahrt mit Sondersignal wechseln beide (Blinken).
 *
 * Gespeichert lokal im Browser (IndexedDB, je Leitstelle ein Eintrag) – nicht im Spielstand, damit der
 * laufende Abgleich klein bleibt. Bilder werden beim Hochladen verkleinert. Mitspieler bekommen die Bilder
 * vom Gastgeber einmal beim Verbinden und nach jeder Änderung und legen sie in ihrem Browser ab.
 */

export type ImageKind = 'normal' | 'blaulicht';
type Stored = Record<string, Partial<Record<ImageKind, string>>>;

const MAX_W = 160;
const MAX_H = 100;
const key = (projectId: string) => `fahrzeugbilder:${projectId}`;

let projectId: string | null = null;
let data: Stored = {};
/** Objekt-URLs (kurz, für das HTML der Kartenmarker) */
let urls: Record<string, Partial<Record<ImageKind, string>>> = {};
let version = 0;
const listeners = new Set<() => void>();
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('leitwarte-fahrzeugbilder') : null;

function dataUrlToObjectUrl(d: string): string {
  const [head, b64] = d.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'image/png';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

function rebuild() {
  for (const u of Object.values(urls)) for (const x of Object.values(u)) if (x) URL.revokeObjectURL(x);
  urls = {};
  for (const [vid, imgs] of Object.entries(data)) {
    urls[vid] = {};
    for (const k of ['normal', 'blaulicht'] as ImageKind[]) if (imgs[k]) urls[vid][k] = dataUrlToObjectUrl(imgs[k]!);
  }
  version++;
  listeners.forEach((l) => l());
}

function load(pid: string | null) {
  projectId = pid;
  return serial(() => loadNow(pid));
}

async function loadNow(pid: string | null) {
  if (projectId !== pid) return;
  data = {};
  if (pid) {
    try {
      data = (await kvStore.get<Stored>(key(pid))) ?? {};
    } catch {
      data = {};
    }
  }
  if (projectId === pid) {
    rebuild();
    store.broadcastImages();
  }
}

store.imagesProvider = () => (projectId ? { projectId, images: data } : null);
// Mitspieler: Bilder des Gastgebers übernehmen und speichern (auch für eigene Zweitfenster)
store.imagesReceiver = (m) =>
  void serial(async () => {
    try {
      await kvStore.put(key(m.projectId), m.images);
    } catch {
      /* nur im Speicher */
    }
    if (m.projectId !== (projectId ?? store.project?.id)) return;
    projectId = m.projectId;
    data = m.images;
    rebuild();
    channel?.postMessage({ projectId: m.projectId });
  });

channel?.addEventListener('message', (e) => {
  if (e.data?.projectId && e.data.projectId === projectId) void load(projectId);
});

/** Bilder der aktuell geladenen Leitstelle laden (beim Wechsel automatisch) */
export function useVehicleImagesLoader() {
  const pid = useStore((s) => s.project?.id ?? null);
  useEffect(() => {
    void load(pid);
  }, [pid]);
}

/** Objekt-URLs der Bilder je Fahrzeug; ändert sich mit jedem Hochladen/Löschen */
export function useVehicleImages(): { version: number; urls: typeof urls } {
  const v = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  return { version: v, urls };
}

/** Bild verkleinern (Seitenverhältnis bleibt, Transparenz bleibt) */
async function shrink(file: File): Promise<string> {
  const src = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('Datei konnte nicht gelesen werden.'));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Kein gültiges Bild.'));
    i.src = src;
  });
  const scale = Math.min(1, MAX_W / img.width, MAX_H / img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
  const webp = canvas.toDataURL('image/webp', 0.85);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
}

/** Bildquelle verkleinern; in Tests austauschbar (dort gibt es kein Canvas) */
let shrinkImpl: (file: File) => Promise<string> = shrink;
export function __setShrinkForTests(f: ((file: File) => Promise<string>) | null) {
  shrinkImpl = f ?? shrink;
}

/** Schreibvorgänge nacheinander ausführen, sonst überschreibt der letzte die anderen */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const p = queue.then(job, job);
  queue = p.catch(() => undefined);
  return p;
}

/** Mehrere Bilder eines Fahrzeugs in einem Schreibvorgang setzen (null = entfernen, fehlend = unverändert) */
export async function setVehicleImages(vehicleId: string, files: Partial<Record<ImageKind, File | null>>): Promise<void> {
  const pid = projectId ?? store.project?.id;
  if (!pid) throw new Error('Keine Leitstelle geladen.');
  // Verkleinern vor dem Einreihen (darf parallel laufen)
  const shrunk: Partial<Record<ImageKind, string | null>> = {};
  for (const k of ['normal', 'blaulicht'] as ImageKind[]) {
    const f = files[k];
    if (f !== undefined) shrunk[k] = f ? await shrinkImpl(f) : null;
  }
  await serial(async () => {
    if (projectId && projectId !== pid) return; // Leitstelle inzwischen gewechselt
    // erst jetzt aus dem aktuellen Stand bauen
    const next: Stored = { ...data, [vehicleId]: { ...(data[vehicleId] ?? {}) } };
    for (const [k, v] of Object.entries(shrunk) as [ImageKind, string | null][]) {
      if (v) next[vehicleId][k] = v;
      else delete next[vehicleId][k];
    }
    if (!next[vehicleId].normal && !next[vehicleId].blaulicht) delete next[vehicleId];
    await kvStore.put(key(pid), next);
    data = next;
    rebuild();
    channel?.postMessage({ projectId: pid });
    store.broadcastImages();
  });
}

export function setVehicleImage(vehicleId: string, kind: ImageKind, file: File | null): Promise<void> {
  return setVehicleImages(vehicleId, { [kind]: file });
}

/** Nur für Tests: Leitstelle laden */
export const __loadForTests = load;

/** Nur für Tests: gespeicherte Bilder (data-URLs) der geladenen Leitstelle */
export function __storedForTests(): Stored {
  return data;
}

/**
 * Mit Sondersignal? Dann blinkt das Bild: Anfahrt oder Transport mit Sondersignal, und schon beim
 * Ausrücken (alarmiert, auch während eines Sprechwunschs) zu einem Einsatz mit Sondersignal.
 */
export function blinksNow(v: Vehicle, state: GameState | null = store.state): boolean {
  if (v.rt.move) return v.rt.move.emergency && v.rt.move.purpose !== 'rueckfahrt';
  const st = v.rt.status === 'sprechwunsch' ? v.rt.statusBeforeSpeak : v.rt.status;
  if (st !== 'alarmiert' || !v.rt.incidentId || !state) return false;
  const inc = state.runtime.incidents.find((i) => i.id === v.rt.incidentId);
  return !!inc && state.center.keywords.find((k) => k.id === inc.keywordId)?.emergency !== false;
}

/**
 * Kleines Fahrzeugbild (Fahrzeugliste/-detail) mit derselben Blink-Logik wie auf der Karte.
 * Nur ein Bild vorhanden: bei Sondersignal blauer Schein als Ersatz.
 */
export function VehicleImage({ vehicle, height = 18 }: { vehicle: Vehicle; height?: number }) {
  const { urls: u } = useVehicleImages();
  const img = u[vehicle.id];
  const base = img?.normal ?? img?.blaulicht;
  if (!base) return null;
  const sig = blinksNow(vehicle);
  const both = !!(img?.normal && img?.blaulicht);
  return (
    <span className={`veh-img-inline ${sig && both ? 'blink' : ''} ${sig && !both ? 'glow' : ''}`} data-testid="veh-img-inline">
      <img src={base} alt="" style={{ height }} />
      {sig && both && <img className="bl" src={img!.blaulicht} alt="" style={{ height }} />}
    </span>
  );
}

/** Spalte in der Fahrzeugliste: Vorschau und Hochladen */
export function VehicleImageCell({ vehicleId }: { vehicleId: string }) {
  const { urls: u } = useVehicleImages();
  const imgs = u[vehicleId] ?? {};
  const input = useRef<HTMLInputElement>(null);
  const kindRef = useRef<ImageKind>('normal');
  const pick = (k: ImageKind) => {
    kindRef.current = k;
    input.current?.click();
  };
  const slot = (k: ImageKind, label: string) => (
    <span className="veh-img-slot" title={`${label}: klicken zum Hochladen, Rechtsklick zum Entfernen`}>
      <button
        type="button"
        className="btn small ghost"
        data-testid={`veh-img-${k}`}
        onClick={(e) => {
          e.stopPropagation();
          pick(k);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (imgs[k]) void setVehicleImage(vehicleId, k, null).catch((err) => store.toast('fehler', (err as Error).message));
        }}
      >
        {imgs[k] ? <img src={imgs[k]} alt={label} className="veh-img-thumb" /> : <span className="dim small">{k === 'normal' ? '+ Bild' : '+ Blaulicht'}</span>}
      </button>
    </span>
  );
  return (
    <span className="row" style={{ gap: 2 }} onClick={(e) => e.stopPropagation()}>
      {slot('normal', 'ohne Blaulicht')}
      {slot('blaulicht', 'mit Blaulicht')}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        data-testid="veh-img-file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void setVehicleImage(vehicleId, kindRef.current, f).catch((err) => store.toast('fehler', (err as Error).message));
        }}
      />
    </span>
  );
}
