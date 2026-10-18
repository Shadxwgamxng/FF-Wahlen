import { useEffect, useState } from 'react';
import { kvStore } from '../persistence/db';
import { parseDiasExport, type DiasTree } from './model';

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

export function loadDias(): Promise<DiasTree | null> {
  if (loaded) return Promise.resolve(tree);
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
  return t;
}

export async function removeDias() {
  await kvStore.delete(KEY);
  tree = null;
  loaded = true;
  emit();
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
