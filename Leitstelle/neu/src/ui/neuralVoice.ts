import type { SpeechChannel } from '../voice/speech';
import type { Emotion, Personality, VoicePersona } from '../voice/style';
import { hashSeed } from '../voice/details/types';
import type { SynthRequest, SynthResponse } from '../voice/neural/piperWorker';
import { ac } from './audio';
import { getPrefs } from './prefs';

/**
 * Natürliche Stimmen (Piper, läuft offline im Browser) für Anrufer, Funk und Ansagen.
 * Jeder Anrufer und jedes Fahrzeug bekommt eine feste Stimme; Gefühlslage und Persönlichkeit steuern
 * Tempo, Ausdruck und Pausen. Telefon und Funk klingen wie über die Leitung bzw. das Funkgerät.
 * Fehlen die Stimmdateien (public/voices), übernimmt die Stimme des Browsers.
 */

interface Cast {
  model: string;
  speaker: number;
  /** Tonhöhe beim Abspielen (leicht verstellt für mehr Vielfalt) */
  pitch: number;
  female: boolean;
}

const EMO = 'de_DE-thorsten_emotional-medium';
/** Frauen- und Männerstimmen; durch leicht verstellte Tonhöhe klingt jede Stimme nach mehreren Menschen */
const FEMALE = ['de_DE-eva_k-x_low', 'de_DE-kerstin-low', 'de_DE-ramona-low'];
const MALE = ['de_DE-pavoque-low', 'de_DE-karlsson-low', EMO];
/** Sprecher des Gefühlsmodells */
const EMO_SID = { amused: 0, angry: 1, neutral: 4, surprised: 6 };

/** Stimme für einen Sprecher – gleicher Seed, gleiche Stimme */
export function castFor(channel: SpeechChannel, seed: string, personality?: Personality): Cast {
  const h = hashSeed(`${seed}|stimme`) >>> 0;
  if (channel === 'ansage') return { model: EMO, speaker: EMO_SID.neutral, pitch: 1, female: false };
  // Funk: überwiegend Männerstimmen, Telefon: gemischt
  const female = channel === 'funk' ? h % 7 === 0 : h % 2 === 0;
  const models = female ? FEMALE : MALE;
  // Tonhöhe 0,92 … 1,08; ältere Menschen etwas tiefer
  const pitch = 0.92 + ((h >>> 4) % 17) * 0.01 - (personality === 'aelter' ? 0.04 : 0);
  return { model: models[(h >>> 8) % models.length], speaker: EMO_SID.neutral, pitch, female };
}

/** Tempo und Ausdruck je Gefühlslage: aufgeregt = schneller und unruhiger, älter = langsamer */
export function prosody(persona: VoicePersona, cast: Cast) {
  const e: Emotion = persona.emotion ?? 0;
  const p = persona.personality;
  let length = [1.02, 0.92, 0.84][e];
  if (p === 'aelter') length += 0.12;
  if (p === 'knapp') length -= 0.04;
  if (p === 'redselig') length -= 0.02;
  // Abspielen mit veränderter Tonhöhe ändert auch das Tempo – hier ausgleichen
  length *= cast.pitch;
  const noise = [0.55, 0.7, 0.82][e];
  const noiseW = [0.7, 0.85, 1.0][e];
  const single = cast.model !== EMO;
  // Pause an „…“ und Gedankenstrichen: ruhig länger, panisch kurz
  const pause = [420, 300, 170][e] + (p === 'aelter' ? 180 : 0);
  // Gefühlsmodell: überrascht/aufgeregt oder genervt statt neutral
  let speaker = single ? 0 : cast.speaker;
  if (!single && persona.emotion !== undefined) speaker = e === 2 ? EMO_SID.surprised : e === 1 && p === 'knapp' ? EMO_SID.angry : e === 1 ? EMO_SID.surprised : EMO_SID.neutral;
  return { length, noise, noiseW, pause, speaker };
}

/**
 * Nur beim Sprechen: Wer aufgeregt ist, stockt auch mitten im Satz („liegt … äh … im Flur“).
 * Der angezeigte Text bleibt unverändert; Sätze mit Zahlen (Adressen, Alter) werden nicht unterbrochen.
 */
export function hesitate(text: string, persona: VoicePersona): string {
  const e = persona.emotion ?? 0;
  if (e === 0 || persona.personality === 'knapp' || /\d/.test(text)) return text;
  const h = hashSeed(`${persona.voiceSeed ?? ''}|${text}`) >>> 0;
  if (h % 100 >= 22 * e) return text;
  const words = text.split(' ');
  if (words.length < 6) return text;
  const at = 2 + ((h >>> 8) % Math.min(3, words.length - 4));
  if (!/^[a-zäöüß]/.test(words[at]) || /[,.!?…–]$/.test(words[at - 1])) return text;
  words.splice(at, 0, e === 2 ? '… ' + words[at] + ' –' : '… äh …');
  return words.join(' ');
}

/** Text an Denkpausen teilen („…“, „–“), damit dazwischen echte Pausen entstehen */
export function phrases(text: string): string[] {
  return text
    .split(/\s*(?:…|\.\.\.|\s–\s)\s*/)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\d]/u.test(s));
}

// ------------------------------------------------------------ Synthese im Worker

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: { pcm: Float32Array; sampleRate: number }) => void; reject: (e: Error) => void }>();
const base = () => new URL('./', location.href).href;

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  worker = new Worker(new URL('../voice/neural/piperWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<SynthResponse>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if ('error' in e.data) p.reject(new Error(e.data.error));
    else p.resolve(e.data);
  };
  return worker;
}

function synth(req: Omit<SynthRequest, 'id' | 'base'>): Promise<{ pcm: Float32Array; sampleRate: number }> {
  const w = getWorker();
  if (!w) return Promise.reject(new Error('kein Worker'));
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ ...req, id, base: base() } satisfies SynthRequest);
  });
}

// ------------------------------------------------------------ Verfügbarkeit

let available: Promise<boolean> | null = null;
/** Stimmdateien vorhanden? (Der Entwicklungsserver liefert für fehlende Dateien die Startseite – daher Typ prüfen) */
export function neuralAvailable(): Promise<boolean> {
  available ??= fetch(`${base()}voices/${EMO}.onnx.json`)
    .then((r) => r.ok && (r.headers.get('content-type') ?? '').includes('json'))
    .catch(() => false);
  return available;
}

/** Modelle schon vor dem ersten Satz laden (beim ersten Klick) */
export function preloadNeural() {
  void neuralAvailable().then((ok) => {
    if (!ok || !getPrefs().neuralVoices) return;
    for (const m of [EMO, ...FEMALE, ...MALE.slice(0, 2)]) getWorker()?.postMessage({ preload: m, base: base() });
  });
}

// ------------------------------------------------------------ Vorbereiten und Abspielen

export interface Prepared {
  buffer: AudioBuffer;
  cast: Cast;
}

/** Satz vorab berechnen (läuft, während noch jemand anderes spricht) */
export async function prepare(text: string, persona: VoicePersona, channel: SpeechChannel): Promise<Prepared | null> {
  const c = ac();
  if (!c || !getPrefs().neuralVoices || !(await neuralAvailable())) return null;
  const cast = castFor(channel, persona.voiceSeed ?? channel, persona.personality);
  const pr = prosody(persona, cast);
  const parts = phrases(hesitate(text, persona));
  if (!parts.length) return null;
  try {
    const pcms: Float32Array[] = [];
    let sampleRate = 22050;
    for (const part of parts) {
      const r = await synth({ model: cast.model, speaker: pr.speaker, text: part, lengthScale: pr.length, noiseScale: pr.noise, noiseW: pr.noiseW });
      sampleRate = r.sampleRate;
      pcms.push(r.pcm);
    }
    const gap = Math.round((pr.pause / 1000) * sampleRate);
    const total = pcms.reduce((s, p) => s + p.length, 0) + gap * (pcms.length - 1);
    const buffer = c.createBuffer(1, total, sampleRate);
    const out = buffer.getChannelData(0);
    let o = 0;
    for (const p of pcms) {
      out.set(p, o);
      o += p.length + gap;
    }
    return { buffer, cast };
  } catch (e) {
    console.warn('Natürliche Stimme nicht verfügbar:', (e as Error).message);
    return null;
  }
}

/** Telefonleitung (auch für die Geräusche beim Anrufer) */
export const telephoneLine = (c: BaseAudioContext, out: AudioNode) => lineChain(c, 'telefon', out);

/** Klang der Leitung: Telefon (schmalbandig, leicht verzerrt) oder Funk (noch enger, rauschig) */
function lineChain(c: BaseAudioContext, channel: SpeechChannel, out: AudioNode): AudioNode {
  if (channel === 'ansage') return out;
  const tel = channel === 'telefon';
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = tel ? 300 : 420;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = tel ? 3400 : 2700;
  const peak = c.createBiquadFilter();
  peak.type = 'peaking';
  peak.frequency.value = tel ? 1700 : 1400;
  peak.gain.value = tel ? 3 : 6;
  const shaper = c.createWaveShaper();
  const k = tel ? 2.5 : 7;
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  shaper.curve = curve;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -24;
  comp.ratio.value = 4;
  hp.connect(lp).connect(peak).connect(shaper).connect(comp).connect(out);
  return hp;
}

/** leises Leitungs- bzw. Funkrauschen unter der Stimme */
function noiseBed(c: BaseAudioContext, channel: SpeechChannel, input: AudioNode, level: number) {
  if (channel === 'ansage') return null;
  const len = c.sampleRate * 2;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    // rosa-ähnliches Rauschen: weißes Rauschen leicht geglättet
    last = 0.97 * last + 0.03 * (Math.random() * 2 - 1);
    d[i] = channel === 'funk' ? Math.random() * 2 - 1 : last * 6;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = c.createGain();
  g.gain.value = level;
  src.connect(g).connect(input);
  src.start();
  return src;
}

export interface PlayHandle {
  done: Promise<void>;
  stop: () => void;
}

export function play(p: Prepared, channel: SpeechChannel): PlayHandle | null {
  const c = ac();
  if (!c) return null;
  const vol = getPrefs().volume;
  const master = c.createGain();
  master.gain.value = (channel === 'ansage' ? 0.9 : 1.15) * Math.max(0.05, vol) * 2;
  master.connect(c.destination);
  const line = lineChain(c, channel, master);
  const src = c.createBufferSource();
  src.buffer = p.buffer;
  src.playbackRate.value = p.cast.pitch;
  src.connect(line);
  const bed = noiseBed(c, channel, line, channel === 'funk' ? 0.018 : 0.006);
  let finish!: () => void;
  const done = new Promise<void>((r) => (finish = r));
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    try {
      bed?.stop();
    } catch {
      /* schon gestoppt */
    }
    setTimeout(() => master.disconnect(), 200);
    finish();
  };
  src.onended = end;
  src.start();
  return {
    done,
    stop: () => {
      try {
        src.stop();
      } catch {
        /* schon gestoppt */
      }
      end();
    },
  };
}

/** Für Hörproben und Tests: Satz mit Leitungsklang offline berechnen (ohne Lautsprecher) */
export async function renderOffline(p: Prepared, channel: SpeechChannel): Promise<Float32Array> {
  const sr = 44100;
  const len = Math.ceil((p.buffer.duration / p.cast.pitch + 0.3) * sr);
  const c = new OfflineAudioContext(1, len, sr);
  const master = c.createGain();
  master.gain.value = 0.9;
  master.connect(c.destination);
  const line = lineChain(c, channel, master);
  const src = c.createBufferSource();
  src.buffer = p.buffer;
  src.playbackRate.value = p.cast.pitch;
  src.connect(line);
  noiseBed(c, channel, line, channel === 'funk' ? 0.018 : 0.006);
  src.start();
  return (await c.startRendering()).getChannelData(0);
}
