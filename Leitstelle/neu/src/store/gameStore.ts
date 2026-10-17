import { produce, setAutoFreeze } from 'immer';
import { useSyncExternalStore } from 'react';
import type { CenterConfig, GameState } from '../model/types';
import { createGame, ensureVehicleRuntime, tick, type CommandResult } from '../sim/engine';
import { projects, snapshots, type ProjectRecord } from '../persistence/db';
import { repairReferences } from '../persistence/schema';
import { newId } from '../model/ids';

/**
 * Zentraler Spielzustand. Einzige Stelle, an der der Zustand ersetzt wird.
 *  - run(cmd):   führt einen Engine-Befehl aus (immer.produce)
 *  - edit(fn):   Änderung der Leitstellenkonfiguration aus dem Editor
 *  - Spielschleife: tickt die Engine in Echtzeit × Geschwindigkeit
 *  - Autosave:   speichert alle 20 s (Echtzeit) bei Änderungen in IndexedDB
 */

// Zustand wird nur über produce() verändert; Einfrieren kostet bei großen Arrays Zeit.
setAutoFreeze(false);

type Listener = () => void;

export interface Toast {
  id: number;
  kind: 'ok' | 'fehler' | 'info';
  text: string;
}

const TICK_MS = 250;
const AUTOSAVE_MS = 20_000;
const AUTOSNAPSHOT_MS = 10 * 60_000;

export class GameStore {
  state: GameState | null = null;
  project: { id: string; name: string; createdAt: number } | null = null;
  toasts: Toast[] = [];
  saveStatus: 'gespeichert' | 'ungespeichert' | 'speichert' | 'fehler' = 'gespeichert';
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastFrame = 0;
  private dirty = false;
  private lastSave = 0;
  private lastSnapshot = 0;
  private toastId = 0;
  version = 0;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private emit() {
    this.version++;
    for (const l of this.listeners) l();
  }

  // -------------------------------------------------------------- Laden / Neu

  async newProject(center: CenterConfig, name?: string) {
    const game = createGame(center);
    const now = Date.now();
    this.project = { id: newId('proj'), name: name ?? center.name, createdAt: now };
    this.state = game;
    this.dirty = true;
    await this.save();
    this.startLoop();
    this.emit();
  }

  load(rec: ProjectRecord) {
    this.stopLoop();
    this.project = { id: rec.id, name: rec.name, createdAt: rec.createdAt };
    this.state = { ...rec.state, runtime: { ...rec.state.runtime, clock: { ...rec.state.runtime.clock, running: false } } };
    this.dirty = false;
    this.saveStatus = 'gespeichert';
    this.startLoop();
    this.emit();
  }

  /** Spielstand übernehmen (z. B. aus einem Snapshot) – innerhalb des aktuellen Projekts */
  replaceState(state: GameState) {
    this.state = { ...state, runtime: { ...state.runtime, clock: { ...state.runtime.clock, running: false } } };
    this.dirty = true;
    this.emit();
  }

  async close() {
    await this.save();
    this.stopLoop();
    this.state = null;
    this.project = null;
    this.emit();
  }

  rename(name: string) {
    if (!this.project || !name.trim()) return;
    this.project = { ...this.project, name: name.trim() };
    this.dirty = true;
    this.emit();
  }

  // -------------------------------------------------------------- Befehle

  run(cmd: (s: GameState) => CommandResult, opts: { toast?: boolean } = { toast: true }): CommandResult {
    if (!this.state) return { ok: false, error: 'Kein Spiel geladen.' };
    const box: { r: CommandResult } = { r: { ok: false, error: 'Unbekannter Fehler' } };
    try {
      this.state = produce(this.state, (d) => {
        box.r = cmd(d as GameState);
      });
    } catch (e) {
      console.error(e);
      box.r = { ok: false, error: `Interner Fehler: ${(e as Error).message}` };
    }
    const result = box.r;
    if (result.ok) this.dirty = true;
    if (opts.toast) {
      if (!result.ok) this.toast('fehler', result.error);
      else if (result.message) this.toast('ok', result.message);
    }
    this.emit();
    return result;
  }

  /** Editor-Änderung an der Leitstellenkonfiguration. Wirft nicht; liefert Fehlertext oder null. */
  edit(fn: (c: CenterConfig, s: GameState) => string | void, successText?: string): string | null {
    if (!this.state) return 'Kein Spiel geladen.';
    const box: { err: string | null } = { err: null };
    try {
      this.state = produce(this.state, (d) => {
        const r = fn(d.center as CenterConfig, d as GameState);
        if (typeof r === 'string') {
          box.err = r;
          return;
        }
        repairReferences(d.center as CenterConfig);
        for (const v of d.center.vehicles) ensureVehicleRuntime(d as GameState, v);
      });
    } catch (e) {
      box.err = `Interner Fehler: ${(e as Error).message}`;
    }
    const err = box.err;
    if (err) this.toast('fehler', err);
    else {
      this.dirty = true;
      if (successText) this.toast('ok', successText);
    }
    this.emit();
    return err;
  }

  // -------------------------------------------------------------- Uhr

  private startLoop() {
    if (this.timer || typeof window === 'undefined') return;
    this.lastFrame = performance.now();
    this.timer = setInterval(() => this.frame(), TICK_MS);
  }

  private stopLoop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private frame() {
    const nowReal = performance.now();
    const elapsed = Math.min(1000, nowReal - this.lastFrame);
    this.lastFrame = nowReal;
    const s = this.state;
    if (s && s.runtime.clock.running) {
      const dt = elapsed * s.runtime.clock.speed;
      this.state = produce(s, (d) => tick(d as GameState, dt));
      this.dirty = true;
      this.emit();
    }
    const t = Date.now();
    if (this.dirty && t - this.lastSave > AUTOSAVE_MS) void this.save();
    if (this.state && this.project && t - this.lastSnapshot > AUTOSNAPSHOT_MS && this.state.runtime.clock.running) {
      this.lastSnapshot = t;
      void this.snapshot('Automatisch', 'auto');
    }
  }

  // -------------------------------------------------------------- Speichern

  async save(): Promise<boolean> {
    if (!this.state || !this.project) return false;
    this.saveStatus = 'speichert';
    this.lastSave = Date.now();
    try {
      await projects.put({ ...this.project, updatedAt: Date.now(), state: this.state });
      this.dirty = false;
      this.saveStatus = 'gespeichert';
      this.emit();
      return true;
    } catch (e) {
      this.saveStatus = 'fehler';
      this.toast('fehler', `Speichern fehlgeschlagen: ${(e as Error).message}`);
      this.emit();
      return false;
    }
  }

  async snapshot(name: string, kind: 'manuell' | 'auto' = 'manuell') {
    if (!this.state || !this.project) return;
    try {
      await snapshots.put({
        id: newId('snap'),
        projectId: this.project.id,
        name,
        kind,
        createdAt: Date.now(),
        simTime: this.state.runtime.clock.now,
        state: this.state,
      });
      if (kind === 'auto') await snapshots.pruneAuto(this.project.id, 5);
      else this.toast('ok', `Spielstand "${name}" gespeichert.`);
    } catch (e) {
      this.toast('fehler', `Spielstand konnte nicht gespeichert werden: ${(e as Error).message}`);
    }
    this.emit();
  }

  get isDirty() {
    return this.dirty;
  }

  // -------------------------------------------------------------- Meldungen

  toast(kind: Toast['kind'], text: string) {
    const id = ++this.toastId;
    this.toasts = [...this.toasts.slice(-4), { id, kind, text }];
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
      this.emit();
    }, kind === 'fehler' ? 7000 : 3500);
  }
}

export const store = new GameStore();

/** React-Hook: wählt einen Teil des Zustands aus und rendert bei Änderung neu */
export function useStore<T>(sel: (s: GameStore) => T): T {
  return useSyncExternalStore(store.subscribe, () => sel(store));
}

export function useGame(): GameState {
  const g = useStore((s) => s.state);
  if (!g) throw new Error('Kein Spiel geladen');
  return g;
}
