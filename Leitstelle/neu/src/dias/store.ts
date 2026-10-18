import { useEffect, useState } from 'react';
import { kvStore } from '../persistence/db';
import { parseDiasExport, type DiasTree } from './model';
import { store } from '../store/gameStore';

/**
 * Die importierte Notrufabfrage liegt nur lokal in IndexedDB (Schlüssel "dias").
 * Einmal geladen, wird sie im Speicher gehalten.
 */

const KEY = 'dias';
let tree: DiasTree | null = null;
let loaded = false;
let loading: Promise<DiasTree | null> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function diasTree(): DiasTree | null {
  return tree;
}

// Hauptgerät: liefert die Abfrage an andere Geräte (Tablet). Zweitgerät: empfängt sie vom Hauptgerät.
store.diasProvider = () => loadDias();
store.diasReceiver = (t) => {
  tree = t && t.version === 1 && t.nodes ? t : null;
  loaded = true;
  loading = null;
  emit();
};

export function loadDias(): Promise<DiasTree | null> {
  if (loaded) return Promise.resolve(tree);
  // Andere Geräte haben die Datei nicht selbst – sie kommt vom Hauptgerät
  if (store.role === 'remote' && store.lan) {
    store.requestDias();
    // Anfrage wiederholen, bis das Hauptgerät antwortet (Verbindung kann noch im Aufbau sein)
    const again = setInterval(() => (loaded ? clearInterval(again) : store.requestDias()), 3000);
    return new Promise((resolve) => {
      const l = () => {
        if (!loaded) return;
        listeners.delete(l);
        clearInterval(again);
        resolve(tree);
      };
      listeners.add(l);
    });
  }
  loading ??= kvStore
    .get<DiasTree>(KEY)
    .then((t) => {
      tree = t && t.version === 1 && t.nodes ? t : null;
      return tree;
    })
    .catch(() => null)
    .finally(() => {
      loaded = true;
      loading = null;
      emit();
    });
  return loading;
}

/** Liest eine DIAS-Exportdatei (JSON-Text) ein und speichert sie lokal */
export async function importDias(json: string): Promise<DiasTree> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  const t = parseDiasExport(raw);
  await kvStore.put(KEY, t);
  tree = t;
  loaded = true;
  emit();
  store.broadcastDias(t);
  return t;
}

export async function removeDias() {
  await kvStore.delete(KEY);
  tree = null;
  loaded = true;
  emit();
  store.broadcastDias(null);
}

/** React: aktuelle Notrufabfrage (null = nicht importiert), lädt beim ersten Gebrauch */
export function useDias(): { tree: DiasTree | null; ready: boolean } {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    listeners.add(l);
    if (!loaded) void loadDias();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return { tree, ready: loaded };
}
