import type { GameState } from '../model/types';

/**
 * Lokale Persistenz in IndexedDB.
 *  - "projects":  eine Leitstelle mit aktuellem Spielzustand (Autosave überschreibt diesen Eintrag)
 *  - "snapshots": manuelle und automatische Spielstände je Leitstelle
 *  - "kv":        sonstige lokale Daten (z. B. importierte Notrufabfrage), Schlüssel → Wert
 */

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  state: GameState;
}

export interface SnapshotRecord {
  id: string;
  projectId: string;
  name: string;
  kind: 'manuell' | 'auto';
  createdAt: number;
  simTime: number;
  state: GameState;
}

const DB_NAME = 'leitwarte';
const DB_VERSION = 2;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(factory: IDBFactory = globalThis.indexedDB): Promise<IDBDatabase> {
  if (!factory) return Promise.reject(new Error('IndexedDB ist in diesem Browser nicht verfügbar.'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('snapshots')) {
        const s = db.createObjectStore('snapshots', { keyPath: 'id' });
        s.createIndex('projectId', 'projectId');
      }
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('Datenbank konnte nicht geöffnet werden.'));
    };
  });
  return dbPromise;
}

/** Nur für Tests: Verbindung zurücksetzen */
export function resetDbConnection() {
  dbPromise = null;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        let result: T;
        if (req) req.onsuccess = () => (result = req.result);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error ?? new Error('Transaktion abgebrochen (Speicher voll?)'));
      }),
  );
}

/** Entfernt immer-Freeze und Funktionen; garantiert eine reine Datenkopie */
const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export const projects = {
  list: () => tx<ProjectRecord[]>('projects', 'readonly', (s) => s.getAll()).then((l) => l.sort((a, b) => b.updatedAt - a.updatedAt)),
  get: (id: string) => tx<ProjectRecord | undefined>('projects', 'readonly', (s) => s.get(id)),
  put: (p: ProjectRecord) => tx<IDBValidKey>('projects', 'readwrite', (s) => s.put(plain(p))),
  async delete(id: string) {
    const snaps = await snapshots.listFor(id);
    for (const sn of snaps) await snapshots.delete(sn.id);
    await tx('projects', 'readwrite', (s) => s.delete(id));
  },
};

export const snapshots = {
  listFor: (projectId: string) =>
    tx<SnapshotRecord[]>('snapshots', 'readonly', (s) => s.index('projectId').getAll(projectId)).then((l) => l.sort((a, b) => b.createdAt - a.createdAt)),
  get: (id: string) => tx<SnapshotRecord | undefined>('snapshots', 'readonly', (s) => s.get(id)),
  put: (sn: SnapshotRecord) => tx<IDBValidKey>('snapshots', 'readwrite', (s) => s.put(plain(sn))),
  delete: (id: string) => tx<undefined>('snapshots', 'readwrite', (s) => s.delete(id)),
  /** Hält nur die neuesten n automatischen Spielstände */
  async pruneAuto(projectId: string, keep: number) {
    const autos = (await snapshots.listFor(projectId)).filter((s) => s.kind === 'auto');
    for (const s of autos.slice(keep)) await snapshots.delete(s.id);
  },
};

export const kvStore = {
  get: <T>(key: string) => tx<T | undefined>('kv', 'readonly', (s) => s.get(key)),
  put: (key: string, value: unknown) => tx<IDBValidKey>('kv', 'readwrite', (s) => s.put(plain(value), key)),
  delete: (key: string) => tx<undefined>('kv', 'readwrite', (s) => s.delete(key)),
};
