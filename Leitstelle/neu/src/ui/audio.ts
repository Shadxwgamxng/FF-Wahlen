import { store } from '../store/gameStore';
import { getPrefs } from './prefs';
import { hearsVehicle } from '../model/radio';
import { heardNow } from './funk';
import { speakAs } from '../voice/speech';

/**
 * Akustik ohne externe Dienste: Töne werden per Web-Audio-API synthetisiert,
 * Sprachausgabe nutzt die im Browser eingebaute Web-Speech-API (falls vorhanden).
 * Liegen echte Aufnahmen in public/sounds (nicht im Repo, siehe LIESMICH.txt),
 * werden diese statt der synthetischen Töne abgespielt.
 */

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freqs: number[], dur: number, gap = 0.05, type: OscillatorType = 'sine') {
  const c = ac();
  if (!c) return;
  const vol = getPrefs().volume;
  let t = c.currentTime;
  for (const f of freqs) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * 0.3, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
    t += dur + gap;
  }
}

/** Funkrauschen: kurzer, gefilterter Rauschstoß (Taste auf/ab) */
export function squelch(dur = 0.16) {
  const c = ac();
  if (!c) return;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  bp.Q.value = 0.8;
  const g = c.createGain();
  g.gain.value = getPrefs().volume * 0.5;
  src.connect(bp).connect(g).connect(c.destination);
  src.start();
}

// ---------- Aufnahmen aus public/sounds ----------

const samples = new Map<string, Promise<AudioBuffer | null>>();
/** Lädt eine Aufnahme einmalig; fehlt die Datei, bleibt es beim synthetischen Ton */
function sample(name: string): Promise<AudioBuffer | null> {
  let p = samples.get(name);
  if (!p) {
    const c = ac();
    p = !c || typeof fetch === 'undefined'
      ? Promise.resolve(null)
      : fetch(`./sounds/${name}`)
          .then((r) => (r.ok && !(r.headers.get('content-type') ?? '').includes('text/html') ? r.arrayBuffer() : null))
          .then((b) => (b ? c.decodeAudioData(b) : null))
          .catch(() => null);
    samples.set(name, p);
  }
  return p;
}

interface Playing {
  stop: (fade?: number) => void;
}

/** Aufnahme abspielen; liefert null, wenn sie nicht vorhanden ist */
async function playSample(name: string, opts: { gain?: number; loop?: boolean; offset?: number; filter?: (c: AudioContext, input: AudioNode) => AudioNode } = {}): Promise<Playing | null> {
  const c = ac();
  const buf = await sample(name);
  if (!c || !buf) return null;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = !!opts.loop;
  const g = c.createGain();
  g.gain.value = getPrefs().volume * (opts.gain ?? 1);
  (opts.filter ? opts.filter(c, src) : src).connect(g).connect(c.destination);
  src.start(0, (opts.offset ?? 0) % buf.duration);
  return {
    stop: (fade = 0) => {
      const t = c.currentTime;
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + fade);
      src.stop(t + fade + 0.02);
    },
  };
}

/**
 * Status-Telegramm wie im BOS-Funk (FMS: FSK mit 1200 Bd, 1200/1800 Hz):
 * Rauschen beim Öffnen, Telegramm des Fahrzeugs, kurze Quittung, Rauschen beim Schließen.
 */
function statusBurst() {
  const c = ac();
  if (!c) return;
  const sr = c.sampleRate;
  const vol = getPrefs().volume;
  const bitsOf = (seed: number, n: number) => {
    const out: number[] = [];
    let x = seed;
    for (let i = 0; i < n; i++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      out.push(i < 12 ? 1 : (x >> 16) & 1); // Vorlauf: Einsen, dann Nutzdaten
    }
    return out;
  };
  const parts: { kind: 'noise' | 'fsk' | 'pause'; dur: number; bits?: number[] }[] = [
    { kind: 'noise', dur: 0.06 },
    { kind: 'fsk', dur: 0, bits: bitsOf(5 + Math.floor(Math.random() * 999), 60) },
    { kind: 'noise', dur: 0.09 },
    { kind: 'pause', dur: 0.12 },
    { kind: 'noise', dur: 0.04 },
    { kind: 'fsk', dur: 0, bits: bitsOf(77, 48) },
    { kind: 'noise', dur: 0.12 },
  ];
  const baud = 1200;
  const total = parts.reduce((s, p) => s + (p.bits ? p.bits.length / baud : p.dur), 0);
  const buf = c.createBuffer(1, Math.ceil(total * sr), sr);
  const d = buf.getChannelData(0);
  let i = 0;
  let phase = 0;
  for (const p of parts) {
    if (p.bits) {
      const per = sr / baud;
      for (let b = 0; b < p.bits.length; b++) {
        const f = p.bits[b] ? 1200 : 1800;
        const end = Math.round((b + 1) * per);
        for (let k = Math.round(b * per); k < end && i < d.length; k++, i++) {
          phase += (2 * Math.PI * f) / sr;
          d[i] = Math.sin(phase) * 0.55 + (Math.random() * 2 - 1) * 0.04;
        }
      }
    } else {
      const n = Math.round(p.dur * sr);
      for (let k = 0; k < n && i < d.length; k++, i++) d[i] = p.kind === 'noise' ? (Math.random() * 2 - 1) * 0.35 * (1 - k / n) : 0;
    }
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1500;
  bp.Q.value = 0.6;
  const g = c.createGain();
  g.gain.value = vol * 0.6;
  src.connect(bp).connect(g).connect(c.destination);
  src.start();
}

/** Sprechwunsch: eigene Aufnahme (sprechwunsch.mp3) oder Status-Telegramm */
function sprechwunsch() {
  void playSample('sprechwunsch.mp3').then((p) => p ?? statusBurst());
}

// ---------- Telefon: klingelt, solange ein Anruf wartet ----------

let ringing: Playing | null = null;
let ringTimer: ReturnType<typeof setInterval> | null = null;
let ringWanted = false;

function synthRing() {
  // elektronischer Telefonwecker: zwei kurze Triller
  const trill = Array.from({ length: 12 }, (_, i) => (i % 2 ? 1300 : 1050));
  tone(trill, 0.045, 0, 'square');
  setTimeout(() => ringWanted && tone(trill, 0.045, 0, 'square'), 650);
}

function setRinging(on: boolean) {
  if (on === ringWanted) return;
  ringWanted = on;
  if (!on) {
    ringing?.stop(0.05);
    ringing = null;
    if (ringTimer) clearInterval(ringTimer);
    ringTimer = null;
    return;
  }
  void playSample('anruf.mp3', { loop: true }).then((p) => {
    if (!ringWanted) return p?.stop();
    if (p) ringing = p;
    else {
      synthRing();
      ringTimer = setInterval(synthRing, 3200);
    }
  });
}

// ---------- Martinshorn im Hintergrund eines Funkspruchs ----------

const HORNS = ['martinshorn-1.mp3', 'martinshorn-2.mp3'];

/**
 * Leises Martinshorn unter dem Funkspruch eines Fahrzeugs auf Einsatzfahrt.
 * Klingt gedämpft wie durchs Fahrzeugmikrofon; ohne Aufnahme bleibt es still.
 */
export async function startHorn(vehicleId: string): Promise<Playing | null> {
  if (!getPrefs().sound || !getPrefs().funkHorn) return null;
  let h = 0;
  for (const ch of vehicleId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return playSample(HORNS[h % HORNS.length], {
    loop: true,
    gain: 0.16,
    offset: Math.random() * 30,
    filter: (c, input) => {
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 350;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      input.connect(hp).connect(lp);
      return lp;
    },
  });
}

export const sounds = {
  /** einmal klingeln (Test in den Einstellungen) */
  ring: () => {
    void playSample('anruf.mp3').then((p) => {
      if (!p) synthRing();
      else setTimeout(() => p.stop(0.05), 3100);
    });
  },
  alarm: () => tone([523, 659, 784], 0.25, 0.02, 'triangle'),
  radio: sprechwunsch,
  warn: () => tone([300, 220], 0.2, 0.05, 'sawtooth'),
  /** Mehrspieler: jemand möchte übernehmen */
  request: () => tone([660, 880, 660], 0.1, 0.06, 'triangle'),
};

export function speak(text: string) {
  const p = getPrefs();
  if (!p.tts) return;
  // über die gemeinsame Warteschlange – nie gleichzeitig mit Funk oder Anrufer
  void speakAs(text, { rate: p.ttsRate, pitch: 1 }, undefined, 'ansage');
}

export const ttsAvailable = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Funkton (z. B. Sprechwunsch) nur für Fahrzeuge in einer gehörten Rufgruppe */
function radioHeard(s: NonNullable<typeof store.state>, fresh: { kind: string; vehicleId?: string }[]) {
  const radio = fresh.filter((e) => e.kind === 'nachforderung' || e.kind === 'funk');
  if (!radio.length) return false;
  const heard = heardNow();
  return radio.some((e) => hearsVehicle(s.center, e.vehicleId, heard));
}

/** Reagiert auf neue Ereignisse im Protokoll */
export function installAudio() {
  // Aufnahmen beim ersten Klick vorladen (Audio ist erst nach einer Bedienung erlaubt)
  if (typeof window !== 'undefined')
    window.addEventListener('pointerdown', () => ['anruf.mp3', 'sprechwunsch.mp3', ...HORNS].forEach((n) => void sample(n)), { once: true });
  let lastId = store.state?.runtime.events.at(-1)?.id ?? 0;
  let lastProject = store.project?.id;
  return store.subscribe(() => {
    const s = store.state;
    setRinging(!!s && getPrefs().sound && s.runtime.calls.some((c) => c.state === 'klingelt'));
    if (!s) return;
    if (store.project?.id !== lastProject) {
      lastProject = store.project?.id;
      lastId = s.runtime.events.at(-1)?.id ?? 0;
      return;
    }
    const evs = s.runtime.events;
    if (!evs.length || evs[evs.length - 1].id <= lastId) return;
    const fresh = evs.filter((e) => e.id > lastId);
    lastId = evs[evs.length - 1].id;
    const p = getPrefs();
    const kinds = new Set(fresh.map((e) => e.kind));
    if (p.sound) {
      // das Klingeln selbst läuft über setRinging, solange ein Anruf wartet
      if (kinds.has('notruf') && fresh.some((e) => e.text.startsWith('Notruf geht ein'))) return;
      if (kinds.has('alarm')) sounds.alarm();
      else if (kinds.has('warnung')) sounds.warn();
      else if (radioHeard(s, fresh)) sounds.radio();
    }
    // Funksprüche der Fahrzeuge spricht der Funk selbst (ui/funk.tsx, Einstellung "Funksprüche vorlesen")
  });
}
