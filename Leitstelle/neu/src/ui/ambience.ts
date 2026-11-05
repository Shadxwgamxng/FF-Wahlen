import type { Call } from '../model/types';
import { findScenario, type LocationKind } from '../data/scenarios';
import { ac } from './audio';
import { telephoneLine } from './neuralVoice';
import { getPrefs } from './prefs';

/**
 * Hintergrund beim Anrufer, leise durch die Telefonleitung: Rauchmelder und Knistern beim Brand,
 * Verkehr an der Straße, Wind im Freien, Wasser am See, Raumklang in der Wohnung. Alles wird im
 * Browser erzeugt – keine Aufnahmen nötig.
 */

export type Scene = 'brand' | 'strasse' | 'draussen' | 'wasser' | 'drinnen' | 'menge';

export function sceneFor(call: Pick<Call, 'scenarioId' | 'category' | 'facts'>): Scene {
  const loc: LocationKind | undefined = findScenario(call.scenarioId)?.location;
  if (call.category === 'brand' && loc !== 'strasse' && loc !== 'land') return 'brand';
  if (call.category === 'wasser' || loc === 'wasser') return 'wasser';
  if (call.category === 'vu' || loc === 'strasse') return 'strasse';
  if (loc === 'land') return 'draussen';
  if (call.category === 'pol' || loc === 'oeffentlich') return 'menge';
  return 'drinnen';
}

function noiseBuffer(c: AudioContext, seconds: number, color: 'white' | 'pink' | 'brown'): AudioBuffer {
  const n = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'white') d[i] = w;
    else if (color === 'pink') {
      b0 = 0.99 * b0 + 0.1 * w;
      b1 = 0.96 * b1 + 0.2 * w;
      d[i] = (b0 + b1 + w * 0.2) * 0.4;
    } else {
      b0 = (b0 + 0.02 * w) / 1.02;
      d[i] = b0 * 3.5;
    }
  }
  return buf;
}

function loopNoise(c: AudioContext, out: AudioNode, color: 'white' | 'pink' | 'brown', gain: number, filter?: { type: BiquadFilterType; freq: number; q?: number }) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 4, color);
  src.loop = true;
  const g = c.createGain();
  g.gain.value = gain;
  let node: AudioNode = src;
  if (filter) {
    const f = c.createBiquadFilter();
    f.type = filter.type;
    f.frequency.value = filter.freq;
    if (filter.q) f.Q.value = filter.q;
    node.connect(f);
    node = f;
  }
  node.connect(g).connect(out);
  src.start();
  return { src, gain: g };
}

/** Startet die Geräuschkulisse; liefert eine Stopp-Funktion */
export function startAmbience(scene: Scene): () => void {
  const c = ac();
  if (!c || !getPrefs().ambience || !getPrefs().sound) return () => undefined;
  const master = c.createGain();
  master.gain.value = 0;
  master.gain.linearRampToValueAtTime(Math.max(0.05, getPrefs().volume) * 0.9, c.currentTime + 0.8);
  master.connect(c.destination);
  const line = telephoneLine(c, master);
  const sources: AudioScheduledSourceNode[] = [];
  const timers: ReturnType<typeof setInterval>[] = [];

  // Raumklang (immer, sehr leise)
  sources.push(loopNoise(c, line, 'brown', 0.05, { type: 'lowpass', freq: 400 }).src);

  if (scene === 'brand') {
    // Rauchmelder: drei kurze Pieptöne, Pause (Temporal-3), wie aus dem Nebenraum
    const beep = c.createGain();
    beep.gain.value = 0;
    const osc = c.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 3150;
    const far = c.createBiquadFilter();
    far.type = 'lowpass';
    far.frequency.value = 2400;
    osc.connect(far).connect(beep).connect(line);
    osc.start();
    sources.push(osc);
    const pattern = () => {
      const t = c.currentTime + 0.05;
      for (let i = 0; i < 3; i++) {
        beep.gain.setValueAtTime(0.035, t + i * 1.0);
        beep.gain.setValueAtTime(0, t + i * 1.0 + 0.5);
      }
    };
    pattern();
    timers.push(setInterval(pattern, 4500));
    // Knistern: einzelne Knackser
    const crackle = () => {
      const n = 1 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const src = c.createBufferSource();
        src.buffer = noiseBuffer(c, 0.03, 'white');
        const g = c.createGain();
        const t = c.currentTime + Math.random() * 0.25;
        g.gain.setValueAtTime(0.05 + Math.random() * 0.08, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 900 + Math.random() * 1800;
        src.connect(bp).connect(g).connect(line);
        src.start(t);
      }
    };
    timers.push(setInterval(crackle, 260));
  } else if (scene === 'strasse') {
    // Verkehr: Grundrauschen und vorbeifahrende Autos
    sources.push(loopNoise(c, line, 'brown', 0.12, { type: 'lowpass', freq: 700 }).src);
    const car = () => {
      const src = c.createBufferSource();
      src.buffer = noiseBuffer(c, 4, 'pink');
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 0.7;
      const g = c.createGain();
      const t = c.currentTime;
      const dur = 2.5 + Math.random() * 1.5;
      f.frequency.setValueAtTime(350, t);
      f.frequency.linearRampToValueAtTime(900, t + dur / 2);
      f.frequency.linearRampToValueAtTime(300, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18 + Math.random() * 0.12, t + dur / 2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(line);
      src.start(t);
      src.stop(t + dur);
    };
    timers.push(setInterval(() => Math.random() < 0.6 && car(), 2500));
  } else if (scene === 'draussen' || scene === 'wasser') {
    // Wind (langsam schwankend), am Wasser zusätzlich Wellen
    const wind = loopNoise(c, line, 'pink', 0.06, { type: 'lowpass', freq: 900 });
    sources.push(wind.src);
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.13;
    const depth = c.createGain();
    depth.gain.value = 0.04;
    lfo.connect(depth).connect(wind.gain.gain);
    lfo.start();
    sources.push(lfo);
    if (scene === 'wasser') {
      const waves = loopNoise(c, line, 'pink', 0.05, { type: 'bandpass', freq: 600, q: 0.5 });
      sources.push(waves.src);
      const wl = c.createOscillator();
      wl.frequency.value = 0.18;
      const wd = c.createGain();
      wd.gain.value = 0.05;
      wl.connect(wd).connect(waves.gain.gain);
      wl.start();
      sources.push(wl);
    }
  } else if (scene === 'menge') {
    // Stimmengewirr: Rauschen im Sprachbereich, unruhig
    const crowd = loopNoise(c, line, 'pink', 0.07, { type: 'bandpass', freq: 500, q: 1.2 });
    sources.push(crowd.src);
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.9;
    const depth = c.createGain();
    depth.gain.value = 0.03;
    lfo.connect(depth).connect(crowd.gain.gain);
    lfo.start();
    sources.push(lfo);
  }

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    timers.forEach(clearInterval);
    const t = c.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0, t + 0.4);
    setTimeout(() => {
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          /* schon gestoppt */
        }
      }
      master.disconnect();
    }, 500);
  };
}
