import { produce, setAutoFreeze } from 'immer';
import { useSyncExternalStore } from 'react';
import type { CenterConfig, GameState } from '../model/types';
import { createGame, ensureVehicleRuntime, tick, type CommandResult } from '../sim/engine';
import { projects, snapshots, type ProjectRecord } from '../persistence/db';
import { COMMANDS, execCommand, type CommandArgs, type CommandName } from './commands';
import { repairReferences } from '../persistence/schema';
import { newId } from '../model/ids';
import { SyncBus } from './syncBus';
import type { DiasTree } from '../dias/model';
import { getActor, withActor } from '../sim/actor';

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

const PLAYER_KEY = 'leitwarte.spieler';
function loadPlayer(): { id: string; name: string } | null {
  try {
    const p = JSON.parse(localStorage.getItem(PLAYER_KEY) ?? 'null');
    return p && typeof p.id === 'string' && typeof p.name === 'string' ? p : null;
  } catch {
    return null;
  }
}

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
    this.scheduleBroadcast();
  }

  // -------------------------------------------------------------- Mehrere Fenster (Bildschirme)

  /** 'main' simuliert und speichert; 'remote' (weiteres Fenster) zeigt nur an und sendet Befehle */
  role: 'main' | 'remote' = 'main';
  windowId = Math.random().toString(36).slice(2);
  private channel: SyncBus<SyncMsg> | null = null;
  private bcTimer: ReturnType<typeof setTimeout> | null = null;
  private lanTimer: ReturnType<typeof setTimeout> | null = null;
  /** Wird über den LAN-Server ausgeliefert (andere Geräte können sich verbinden) */
  readonly lan = typeof window !== 'undefined' && Boolean((window as unknown as { __LEITWARTE_LAN__?: boolean }).__LEITWARTE_LAN__);
  /** Liefert die Notrufabfrage für andere Geräte (setzt dias/store, um Importzyklen zu vermeiden) */
  diasProvider: (() => Promise<DiasTree | null>) | null = null;
  /** Empfängt die Notrufabfrage vom Hauptgerät (Tablet) */
  diasReceiver: ((t: DiasTree | null) => void) | null = null;

  get lanStatus() {
    return { enabled: this.lan, connected: Boolean(this.channel?.lanConnected), peers: this.channel?.peers ?? 0 };
  }

  /** Hauptgerät: neue bzw. gelöschte Notrufabfrage an andere Geräte verteilen */
  broadcastDias(tree: DiasTree | null) {
    if (this.role === 'main') this.channel?.postLan({ t: 'dias', tree } satisfies SyncMsg);
  }

  /** Tablet/Zweitgerät: Notrufabfrage beim Hauptgerät anfordern */
  requestDias() {
    this.channel?.post({ t: 'diasReq' } satisfies SyncMsg);
  }
  private placesCache: { version: string; places: CenterConfig['places'] } | null = null;
  private placesRequested: string | null = null;
  mainAlive = true;
  private uiListeners = new Set<(a: UiAction) => void>();

  private placesVersion(c: CenterConfig | undefined) {
    return c?.places ? `${c.places.fetchedAt}:${c.places.places.length}` : 'none';
  }

  /** Hauptfenster: Synchronisation mit weiteren Fenstern starten */
  startSyncMain() {
    if (this.channel) return;
    this.channel = new SyncBus<SyncMsg>('leitwarte-sync', this.lan);
    this.channel.onStatus = () => this.emitLocal();
    this.channel.on((m) => {
      if (m.t === 'diasReq') {
        void (this.diasProvider?.() ?? Promise.resolve(null)).then((tree) => this.channel?.post({ t: 'dias', tree } satisfies SyncMsg));
        return;
      }
      if (m.t === 'hello') {
        this.broadcastNow();
        this.sendPlaces();
        this.channel?.post({ t: 'funkStatus', status: this.funkStatus } satisfies SyncMsg);
      } else if (m.t === 'needPlaces') this.sendPlaces();
      else if (m.t === 'cmd') {
        // Befehl eines Mitspielers: mit dessen Namen ausführen (Zuständigkeit), ohne Gastgeberrechte
        const actor = m.player ? { ...m.player, host: false } : this.hostActor();
        const r = withActor(actor, () => this.cmdLocal(m.name as CommandName, m.args, false));
        this.channel?.post({ t: 'result', to: m.from, result: r, req: m.req } satisfies SyncMsg);
      } else if (m.t === 'ui') this.uiListeners.forEach((l) => l(m.action));
      // Sendetaste eines Tablets, das zu einem Mitspieler gehört, ist nicht für den Gastgeber
      else if (m.t === 'ptt' && (!m.to || m.to === this.hostActor().id)) this.pttListeners.forEach((l) => l(m.on, m.group));
    });
    window.addEventListener('beforeunload', () => this.channel?.post({ t: 'bye' } satisfies SyncMsg));
  }

  /** Nur lokal neu zeichnen (ohne erneutes Senden) */
  private emitLocal() {
    this.version++;
    for (const l of this.listeners) l();
  }

  private sendPlaces() {
    if (!this.channel) return;
    const c = this.state?.center;
    this.channel.post({ t: 'places', version: this.placesVersion(c), places: c?.places ?? null } satisfies SyncMsg);
  }

  private scheduleBroadcast() {
    if (this.role !== 'main' || !this.channel) return;
    if (!this.bcTimer)
      this.bcTimer = setTimeout(() => {
        this.bcTimer = null;
        this.channel?.postLocal(this.stateMsg());
      }, 300);
    // Andere Geräte (LAN) etwas seltener – nur wenn welche verbunden sind
    if (!this.lanTimer && this.channel.peers > 0)
      this.lanTimer = setTimeout(() => {
        this.lanTimer = null;
        this.channel?.postLan(this.lanStateMsg());
      }, 500);
  }

  private stateMsg(): SyncMsg {
    const s = this.state;
    const center = s ? { ...s.center, places: null } : null;
    return { t: 'state', mode: this.mode, project: this.project, placesVersion: this.placesVersion(s?.center), state: s ? { ...s, center: center! } : null };
  }

  /** Zuletzt an LAN-Geräte gesendete, selten geänderte Teile der Leitstelle (Vergleich per Referenz) */
  private lanStatic: unknown[] | null = null;

  private staticParts(c: CenterConfig): unknown[] {
    return Object.entries(c)
      .filter(([k]) => k !== 'vehicles' && k !== 'hospitals' && k !== 'places')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }

  /**
   * Zustand für andere Geräte (Internet/VPN): die Leitstellenkonfiguration nur, wenn sie sich geändert hat,
   * sonst nur Fahrzeuge, Kliniken und Laufzeit (spart über 80 % Daten).
   */
  private lanStateMsg(): SyncMsg {
    const s = this.state;
    if (!s) return this.stateMsg();
    const parts = this.staticParts(s.center);
    const same = this.lanStatic && this.lanStatic.length === parts.length && parts.every((p, i) => p === this.lanStatic![i]);
    if (!same) {
      this.lanStatic = parts;
      return this.stateMsg();
    }
    return { t: 'delta', mode: this.mode, project: this.project, vehicles: s.center.vehicles, hospitals: s.center.hospitals, runtime: s.runtime };
  }

  private broadcastNow() {
    this.lanStatic = null;
    this.channel?.post(this.stateMsg());
  }

  /** Weiteres Fenster: verbindet sich mit dem Hauptfenster */
  startSyncRemote() {
    this.role = 'remote';
    this.channel = new SyncBus<SyncMsg>('leitwarte-sync', this.lan);
    let lastSeen = Date.now();
    this.channel.onStatus = () => {
      // nach (Wieder-)Verbindung mit dem LAN-Server sofort den Zustand anfordern
      if (this.channel?.lanConnected) this.channel.post({ t: 'hello' } satisfies SyncMsg);
      this.emitLocal();
    };
    this.channel.on((m) => {
      if (m.t === 'dias') {
        this.diasReceiver?.(m.tree);
        return;
      }
      if (m.t === 'delta') {
        // Teilzustand: nur mit bekannter Leitstelle anwendbar, sonst vollen Zustand anfordern
        if (!this.state || this.project?.id !== m.project?.id) {
          this.channel?.post({ t: 'hello' } satisfies SyncMsg);
          return;
        }
        lastSeen = Date.now();
        this.mainAlive = true;
        this.mode = m.mode;
        this.state = { ...this.state, center: { ...this.state.center, vehicles: m.vehicles, hospitals: m.hospitals }, runtime: m.runtime };
        this.version++;
        for (const l of this.listeners) l();
        this.stateWaiters.splice(0).forEach((w) => w());
        return;
      }
      if (m.t === 'state') {
        lastSeen = Date.now();
        this.mainAlive = true;
        this.project = m.project;
        if (m.mode) this.mode = m.mode;
        if (!m.state) this.state = null;
        else {
          if (this.placesCache?.version !== m.placesVersion && this.placesRequested !== m.placesVersion) {
            this.placesRequested = m.placesVersion;
            this.channel?.post({ t: 'needPlaces' } satisfies SyncMsg);
          }
          this.state = { ...m.state, center: { ...m.state.center, places: this.placesCache?.version === m.placesVersion ? this.placesCache.places : null } };
        }
        this.version++;
        for (const l of this.listeners) l();
        this.stateWaiters.splice(0).forEach((w) => w());
      } else if (m.t === 'places') {
        this.placesCache = { version: m.version, places: m.places };
        this.placesRequested = null;
        if (this.state) this.state = { ...this.state, center: { ...this.state.center, places: m.places } };
      } else if (m.t === 'result' && m.to === this.windowId) {
        const r = m.result;
        if (m.req !== undefined) {
          const p = this.pending.get(m.req);
          this.pending.delete(m.req);
          p?.(r);
        }
        if (!r.ok) this.toast('fehler', r.error);
        else if (r.message) this.toast('ok', r.message);
        this.emit();
      } else if (m.t === 'ptt') {
        // Tablet eines Mitspielers: Sendetaste löst das Mikrofon an dessen PC aus
        if (this.isPlayerClient && this.player && m.to === this.player.id) this.pttListeners.forEach((l) => l(m.on, m.group));
      } else if (m.t === 'funkStatus') {
        // Mitspieler haben ihren eigenen Funkzustand; ein Tablet zeigt den seines PCs
        if (this.isPlayerClient) return;
        if ((m.owner ?? null) !== (this.tabletOwner?.id ?? null)) return;
        this.funkStatus = m.status;
        this.emitLocal();
      } else if (m.t === 'bye') {
        this.mainAlive = false;
        this.emit();
      }
    });
    this.channel.post({ t: 'hello' } satisfies SyncMsg);
    // Lebenszeichen: läuft die Simulation nicht, schickt das Hauptfenster keine Zustände – daher nachfragen
    setInterval(() => {
      if (Date.now() - lastSeen > 4000) {
        this.channel?.post({ t: 'hello' } satisfies SyncMsg);
        if (Date.now() - lastSeen > 8000 && this.mainAlive) {
          this.mainAlive = false;
          this.emit();
        }
      }
    }, 2000);
  }

  /** UI-Aktion (z. B. "Einsatz in der Maske öffnen") an das Hauptfenster bzw. lokal */
  uiAction(a: UiAction) {
    if (this.role === 'remote') this.channel?.post({ t: 'ui', action: a } satisfies SyncMsg);
    else this.uiListeners.forEach((l) => l(a));
  }

  onUiAction(l: (a: UiAction) => void): () => void {
    this.uiListeners.add(l);
    return () => {
      this.uiListeners.delete(l);
    };
  }

  // -------------------------------------------------------------- Funk (Sendetaste)

  funkStatus: FunkStatus = { sending: false, group: null, interim: '', error: '', receiving: false };
  private pttListeners = new Set<(on: boolean, group: string | null) => void>();

  /** Sendetaste gedrückt/losgelassen – Mikrofon und Erkennung laufen immer am Hauptfenster (Leitstand-PC) */
  sendPtt(on: boolean, group: string | null) {
    // Mitspieler sprechen am eigenen PC; Tablet und Zweitfenster senden an den Leitstand-PC
    if (this.role === 'remote' && !this.isPlayerClient) this.channel?.post({ t: 'ptt', on, group, to: this.tabletOwner?.id } satisfies SyncMsg);
    else this.pttListeners.forEach((l) => l(on, group));
  }

  /** Hauptfenster: auf die Sendetaste reagieren */
  onPtt(l: (on: boolean, group: string | null) => void): () => void {
    this.pttListeners.add(l);
    return () => {
      this.pttListeners.delete(l);
    };
  }

  /** Hauptfenster: Funkzustand setzen und an Tablet/Zweitfenster melden */
  setFunkStatus(patch: Partial<FunkStatus>) {
    this.funkStatus = { ...this.funkStatus, ...patch };
    this.emitLocal();
    if (this.role === 'main') this.channel?.post({ t: 'funkStatus', status: this.funkStatus } satisfies SyncMsg);
    else if (this.isPlayerClient && this.player) this.channel?.postLan({ t: 'funkStatus', status: this.funkStatus, owner: this.player.id } satisfies SyncMsg);
  }

  // -------------------------------------------------------------- Benannte Befehle

  cmd<K extends CommandName>(name: K, ...args: CommandArgs<K>): CommandResult {
    return this.dispatch(name, args as unknown[], true);
  }

  cmdQuiet<K extends CommandName>(name: K, ...args: CommandArgs<K>): CommandResult {
    return this.dispatch(name, args as unknown[], false);
  }

  /** Dieser Spieler (Mehrspieler); auf dem Gastgeber der Gastgeber selbst */
  player: { id: string; name: string } | null = loadPlayer();
  /** Tablet: gehört zu diesem Mitspieler (null = Gastgeber-PC) */
  tabletOwner: { id: string; name: string } | null = null;
  /** Mitspieler-Ansicht (volle Oberfläche, Simulation läuft beim Gastgeber) */
  isPlayerClient = false;
  private reqSeq = 0;
  private pending = new Map<number, (r: CommandResult) => void>();
  private stateWaiters: (() => void)[] = [];

  hostActor() {
    return this.player ? { ...this.player, host: true } : { id: 'host', name: 'Gastgeber', host: true };
  }

  setPlayerName(name: string) {
    this.player = { id: this.player?.id ?? newId('sp'), name: name.trim() || 'Spieler' };
    try {
      localStorage.setItem(PLAYER_KEY, JSON.stringify(this.player));
    } catch {
      /* nur für diese Sitzung */
    }
    this.emitLocal();
  }

  /** Befehl mit Ergebnis – auch von Mitspielern (Ergebnis kommt vom Gastgeber zurück) */
  cmdAsync<K extends CommandName>(name: K, ...args: CommandArgs<K>): Promise<CommandResult> {
    if (this.role !== 'remote') return Promise.resolve(this.dispatch(name, args as unknown[], true));
    const req = ++this.reqSeq;
    return new Promise((resolve) => {
      this.pending.set(req, (r) => {
        if (!r.ok) this.toast('fehler', r.error);
        else if (r.message) this.toast('ok', r.message);
        resolve(r);
      });
      this.channel?.post({ t: 'cmd', from: this.windowId, name, args: args as unknown[], quiet: true, req, player: this.isPlayerClient ? (this.player ?? undefined) : (this.tabletOwner ?? undefined) } satisfies SyncMsg);
      setTimeout(() => {
        if (this.pending.delete(req)) resolve({ ok: false, error: 'Keine Antwort vom Gastgeber.' });
      }, 8000);
    });
  }

  /** wartet auf den nächsten Zustand vom Gastgeber (Mitspieler); auf dem Gastgeber sofort */
  nextState(): Promise<void> {
    if (this.role !== 'remote') return Promise.resolve();
    return new Promise((r) => {
      this.stateWaiters.push(r);
      setTimeout(r, 2000);
    });
  }

  private dispatch(name: CommandName, args: unknown[], toast: boolean): CommandResult {
    if (this.role === 'remote') {
      if (!(name in COMMANDS)) return { ok: false, error: 'Unbekannter Befehl.' };
      if (this.isPlayerClient && toast) {
        // Mitspieler: Fehlermeldungen des Gastgebers anzeigen
        void this.cmdAsync(name as never, ...(args as never[]));
        return { ok: true };
      }
      this.channel?.post({ t: 'cmd', from: this.windowId, name, args, quiet: !toast, player: this.isPlayerClient ? (this.player ?? undefined) : (this.tabletOwner ?? undefined) } satisfies SyncMsg);
      // Ergebnis kommt asynchron vom Hauptfenster; IDs neu angelegter Objekte sind hier nicht bekannt
      return { ok: true };
    }
    return this.cmdLocal(name, args, toast);
  }

  private cmdLocal(name: CommandName, args: unknown[], toast: boolean): CommandResult {
    // eigener Befehl am Gastgeber: als Gastgeber (bei Mitspielerbefehlen ist der Spieler schon gesetzt)
    if (!getActor()) return withActor(this.hostActor(), () => this.run((s) => execCommand(s, name, args), { toast }));
    return this.run((s) => execCommand(s, name, args), { toast });
  }

  // -------------------------------------------------------------- Laden / Neu

  /**
   * spielen: nur Leitstand und Spielfunktionen; bearbeiten: Wachen, Fahrzeuge, AAO, Editor …
   * Bearbeitet wird nur beim Erstellen, Starten (Auswahl "Bearbeiten") oder Bearbeiten einer Leitstelle.
   */
  mode: 'spielen' | 'bearbeiten' = 'spielen';

  setMode(mode: 'spielen' | 'bearbeiten') {
    if (mode === 'bearbeiten' && this.state?.runtime.clock.running) this.cmdQuiet('setRunning', false);
    this.mode = mode;
    this.emit();
    this.broadcastNow();
  }

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
    this.mode = 'spielen';
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
    if (this.timer || typeof window === 'undefined' || this.role === 'remote') return;
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
    if (!this.state || !this.project || this.role === 'remote') return false;
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

export type UiAction = { kind: 'openIncident' | 'openCall' | 'focus'; id?: string; pos?: [number, number] };

type SyncMsg =
  | { t: 'hello' }
  | { t: 'needPlaces' }
  | { t: 'bye' }
  | { t: 'state'; mode?: GameStore['mode']; project: GameStore['project']; placesVersion: string; state: GameState | null }
  | { t: 'places'; version: string; places: CenterConfig['places'] }
  | { t: 'cmd'; from: string; name: string; args: unknown[]; quiet: boolean; req?: number; player?: { id: string; name: string } }
  | { t: 'result'; to: string; result: CommandResult; req?: number }
  | { t: 'ui'; action: UiAction }
  | { t: 'diasReq' }
  | { t: 'dias'; tree: DiasTree | null }
  | { t: 'delta'; mode: GameStore['mode']; project: GameStore['project']; vehicles: CenterConfig['vehicles']; hospitals: CenterConfig['hospitals']; runtime: GameState['runtime'] }
  | { t: 'ptt'; on: boolean; group: string | null; to?: string }
  | { t: 'funkStatus'; status: FunkStatus; owner?: string };

/** Zustand des Funks am Leitstand-PC (Mikrofon, Erkennung) – wird an Tablet und Zweitfenster gemeldet */
export interface FunkStatus {
  /** Sendetaste gedrückt, Mikrofon offen */
  sending: boolean;
  /** geschaltete Rufgruppe beim Senden */
  group: string | null;
  /** bisher erkannter Text */
  interim: string;
  /** Fehler oder Hinweis */
  error: string;
  /** Fahrzeug spricht gerade (Sprachausgabe) */
  receiving: boolean;
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
