import { useSyncExternalStore } from 'react';

/** Persönliche Bedienvorlieben (pro Browser, nicht Teil des Spielstands) */
export interface Prefs {
  sound: boolean;
  volume: number;
  tts: boolean;
  ttsRate: number;
  mapDark: boolean;
  /** Oberfläche: "klassisch" (hell, wie ein klassisches Einsatzleitsystem) oder "modern" (dunkel) */
  uiStyle: 'klassisch' | 'modern';
  /** Adresse des lokalen OSRM-Routing-Servers */
  routingUrl: string;
  routingEnabled: boolean;
  /** Martinshorn leise im Hintergrund, wenn Fahrzeuge auf Einsatzfahrt funken */
  funkHorn: boolean;
  /** natürliche Stimmen (Piper, offline) statt der Browserstimme */
  neuralVoices: boolean;
  /** Anrufer antworten hörbar, auch beim Abfragen per Klick */
  callerVoice: boolean;
  /** leise Hintergrundgeräusche beim Anrufer (Rauchmelder, Straße, Wind …) */
  ambience: boolean;
  /** optionale lokale KI (Ollama) formuliert die Antworten der Anrufer frei */
  llmEnabled: boolean;
  llmUrl: string;
  llmModel: string;
  /** optional: eigener ElevenLabs-Schlüssel (bleibt in diesem Browser) und Modell */
  elevenKey: string;
  elevenModel: string;
}

const KEY = 'leitwarte.prefs';
const DEFAULTS: Prefs = { sound: true, volume: 0.4, tts: true, ttsRate: 1.1, mapDark: true, uiStyle: 'klassisch', routingUrl: 'http://localhost:5000', routingEnabled: true, funkHorn: true, neuralVoices: true, callerVoice: true, ambience: true, llmEnabled: false, llmUrl: 'http://localhost:11434', llmModel: 'qwen2.5:7b', elevenKey: '', elevenModel: 'eleven_v4_turbo' };

let prefs: Prefs = load();
const listeners = new Set<() => void>();

function load(): Prefs {
  try {
    const p: Prefs = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    // früherer Name des klassischen Stils
    if ((p.uiStyle as string) === 'behoerde') p.uiStyle = 'klassisch';
    return p;
  } catch {
    return { ...DEFAULTS };
  }
}

export function getPrefs() {
  return prefs;
}

export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* Speicher nicht verfügbar – Einstellungen gelten nur für diese Sitzung */
  }
  listeners.forEach((l) => l());
}

/** Stil auf die Seite anwenden (html[data-style]) */
export function applyStyle(p: Prefs = prefs) {
  if (typeof document !== 'undefined') document.documentElement.dataset.style = p.uiStyle;
}
listeners.add(() => applyStyle());
// Änderungen aus anderen Fenstern (Zweitfenster, Tablet im selben Browser) übernehmen
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      prefs = load();
      listeners.forEach((l) => l());
    }
  });

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => prefs,
  );
}
