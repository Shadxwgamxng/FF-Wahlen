import { useSyncExternalStore } from 'react';

/** Persönliche Bedienvorlieben (pro Browser, nicht Teil des Spielstands) */
export interface Prefs {
  sound: boolean;
  volume: number;
  tts: boolean;
  ttsRate: number;
  mapDark: boolean;
  /** Adresse des lokalen OSRM-Routing-Servers */
  routingUrl: string;
  routingEnabled: boolean;
}

const KEY = 'leitwarte.prefs';
const DEFAULTS: Prefs = { sound: true, volume: 0.4, tts: true, ttsRate: 1.1, mapDark: true, routingUrl: 'http://localhost:5000', routingEnabled: true };

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

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => prefs,
  );
}
