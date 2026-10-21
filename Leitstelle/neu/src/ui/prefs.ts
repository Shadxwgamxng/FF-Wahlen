import { useSyncExternalStore } from 'react';

/** Persönliche Bedienvorlieben (pro Browser, nicht Teil des Spielstands) */
export interface Prefs {
  sound: boolean;
  volume: number;
  tts: boolean;
  ttsRate: number;
  mapDark: boolean;
  /** Oberfläche: "behoerde" (hell, nüchtern) oder "modern" (dunkel) */
  uiStyle: 'behoerde' | 'modern';
  /** Adresse des lokalen OSRM-Routing-Servers */
  routingUrl: string;
  routingEnabled: boolean;
}

const KEY = 'leitwarte.prefs';
const DEFAULTS: Prefs = { sound: true, volume: 0.4, tts: true, ttsRate: 1.1, mapDark: true, uiStyle: 'behoerde', routingUrl: 'http://localhost:5000', routingEnabled: true };

let prefs: Prefs = load();
const listeners = new Set<() => void>();

function load(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
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

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => prefs,
  );
}
