/// <reference lib="webworker" />
/**
 * Sprachsynthese mit Piper-Stimmen (VITS, ONNX) in einem eigenen Thread – kostenlos, offline, im Browser.
 * Texte werden mit espeak-ng (WebAssembly) in Laute zerlegt und vom Stimmmodell in Audio umgewandelt.
 * Modelle und Laufzeitdateien kommen vom eigenen Server (public/voices, public/piper).
 */
import * as ort from 'onnxruntime-web/wasm';

export interface SynthRequest {
  id: number;
  base: string;
  model: string;
  speaker: number;
  text: string;
  lengthScale: number;
  noiseScale: number;
  noiseW: number;
}
export type SynthResponse = { id: number; pcm: Float32Array; sampleRate: number } | { id: number; error: string };

interface ModelConfig {
  audio: { sample_rate: number };
  espeak: { voice: string };
  num_speakers: number;
  phoneme_id_map: Record<string, number[]>;
}

/** Ersatz für Laute, die eine Stimme nicht kennt (espeak-Versionen schreiben das R unterschiedlich) */
const SUBST: Record<string, string> = { 'ɾ': 'r', 'ʁ': 'r', 'r': 'ʁ' };

/** Laute → IDs der jeweiligen Stimme, wie in Piper: Anfang, je Laut + Pause, Ende */
function toIds(phonemes: string[], map: Record<string, number[]>): number[] {
  const ids = [...(map['^'] ?? [1])];
  const pad = map._ ?? [0];
  for (const ph of phonemes) {
    const id = map[ph] ?? (SUBST[ph] ? map[SUBST[ph]] : undefined);
    if (!id) continue;
    ids.push(...id, ...pad);
  }
  ids.push(...(map.$ ?? [2]));
  return ids;
}

type PhonemizeFactory = (opts: Record<string, unknown>) => Promise<{ callMain(args: string[]): void }>;

const sessions = new Map<string, Promise<{ session: ort.InferenceSession; config: ModelConfig }>>();
let phonemizeFactory: Promise<PhonemizeFactory> | null = null;
let wasmBinary: Promise<ArrayBuffer> | null = null;
let dataPackage: Promise<ArrayBuffer> | null = null;

function factory(base: string): Promise<PhonemizeFactory> {
  // Emscripten-Ausgabe ohne Modul-Export: Quelltext laden und die Fabrikfunktion herausholen
  phonemizeFactory ??= fetch(`${base}piper/piper_phonemize.js`)
    .then((r) => {
      if (!r.ok) throw new Error('piper_phonemize.js fehlt');
      return r.text();
    })
    .then((src) => new Function(`${src}\nreturn createPiperPhonemize;`)() as PhonemizeFactory);
  wasmBinary ??= fetch(`${base}piper/piper_phonemize.wasm`).then((r) => r.arrayBuffer());
  dataPackage ??= fetch(`${base}piper/piper_phonemize.data`).then((r) => r.arrayBuffer());
  return phonemizeFactory;
}

async function phonemize(base: string, voice: string, text: string): Promise<string[]> {
  const create = await factory(base);
  const [wasm, data] = await Promise.all([wasmBinary!, dataPackage!]);
  return new Promise((resolve, reject) => {
    void create({
      wasmBinary: wasm,
      // espeak-Daten aus dem Speicher statt erneut vom Server
      getPreloadedPackage: () => data.slice(0),
      print: (out: string) => resolve(JSON.parse(out).phonemes),
      printErr: (msg: string) => reject(new Error(msg)),
      locateFile: (url: string) => `${base}piper/${url.split('/').pop()}`,
    }).then((m) => m.callMain(['-l', voice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']), reject);
  });
}

function load(base: string, model: string) {
  let s = sessions.get(model);
  if (!s) {
    s = (async () => {
      ort.env.wasm.wasmPaths = `${base}piper/`;
      ort.env.wasm.numThreads = 1;
      const config = (await (await fetch(`${base}voices/${model}.onnx.json`)).json()) as ModelConfig;
      const res = await fetch(`${base}voices/${model}.onnx`);
      if (!res.ok) throw new Error(`Stimme ${model} fehlt`);
      const session = await ort.InferenceSession.create(await res.arrayBuffer(), { executionProviders: ['wasm'] });
      return { session, config };
    })();
    sessions.set(model, s);
    s.catch(() => sessions.delete(model));
  }
  return s;
}

self.onmessage = async (e: MessageEvent<SynthRequest | { preload: string; base: string }>) => {
  const msg = e.data;
  if ('preload' in msg) {
    void load(msg.base, msg.preload).catch(() => undefined);
    void factory(msg.base).catch(() => undefined);
    return;
  }
  try {
    const { session, config } = await load(msg.base, msg.model);
    const ids = toIds(await phonemize(msg.base, config.espeak.voice, msg.text), config.phoneme_id_map);
    const feeds: Record<string, ort.Tensor> = {
      input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)])),
      scales: new ort.Tensor('float32', Float32Array.from([msg.noiseScale, msg.lengthScale, msg.noiseW])),
    };
    if (config.num_speakers > 1) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([BigInt(msg.speaker)]));
    const out = await session.run(feeds);
    const pcm = new Float32Array(out.output.data as Float32Array);
    (self as unknown as Worker).postMessage({ id: msg.id, pcm, sampleRate: config.audio.sample_rate } satisfies SynthResponse, [pcm.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: msg.id, error: (err as Error).message } satisfies SynthResponse);
  }
};
