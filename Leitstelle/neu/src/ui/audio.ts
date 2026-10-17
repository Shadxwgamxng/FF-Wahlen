import { store } from '../store/gameStore';
import { getPrefs } from './prefs';

/**
 * Akustik ohne externe Dienste: Töne werden per Web-Audio-API synthetisiert,
 * Sprachausgabe nutzt die im Browser eingebaute Web-Speech-API (falls vorhanden).
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

export const sounds = {
  ring: () => tone([880, 660, 880, 660], 0.12, 0.03, 'square'),
  alarm: () => tone([523, 659, 784], 0.25, 0.02, 'triangle'),
  radio: () => tone([1200], 0.08, 0, 'square'),
  warn: () => tone([300, 220], 0.2, 0.05, 'sawtooth'),
};

export function speak(text: string) {
  const p = getPrefs();
  if (!p.tts || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  u.rate = p.ttsRate;
  window.speechSynthesis.speak(u);
}

export const ttsAvailable = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Reagiert auf neue Ereignisse im Protokoll */
export function installAudio() {
  let lastId = store.state?.runtime.events.at(-1)?.id ?? 0;
  let lastProject = store.project?.id;
  return store.subscribe(() => {
    const s = store.state;
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
      if (kinds.has('notruf') && fresh.some((e) => e.text.startsWith('Notruf geht ein'))) sounds.ring();
      else if (kinds.has('alarm')) sounds.alarm();
      else if (kinds.has('warnung')) sounds.warn();
      else if (kinds.has('nachforderung') || kinds.has('funk')) sounds.radio();
    }
    for (const e of fresh) if ((e.kind === 'funk' || e.kind === 'nachforderung') && !e.text.startsWith('Meldung quittiert')) speak(e.text.replace(/\//g, ' '));
  });
}
