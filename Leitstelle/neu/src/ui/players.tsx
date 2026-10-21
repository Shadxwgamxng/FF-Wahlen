import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../model/types';
import { store, useStore } from '../store/gameStore';
import { playerOnline } from '../sim/engine';
import { sounds } from './audio';
import { getPrefs } from './prefs';

/**
 * Mehrspieler: Spielername, Lebenszeichen, Spielerliste und Zuständigkeit.
 */

type Owner = { id: string; name: string } | undefined;

/** Ist der Notruf/Einsatz meiner? Ohne Zuständigkeit: nur der Gastgeber (Einzelspiel) */
export function isMine(owner: Owner): boolean {
  if (!owner) return !store.isPlayerClient;
  return owner.id === (store.player?.id ?? 'host');
}

/** Kleines Namensschild "bearbeitet von …" (nur im Mehrspieler sinnvoll) */
export function OwnerTag({ owner }: { owner: Owner }) {
  const players = useStore((s) => s.state?.runtime.players?.length ?? 0);
  if (!owner || players < 2) return null;
  return <span className={`chip small ${isMine(owner) ? 'ok' : ''}`} title="zuständig">{isMine(owner) ? 'ich' : owner.name}</span>;
}

type Kind = 'call' | 'incident';

const myId = () => store.player?.id ?? 'host';

/** Notruf bzw. Einsatz aus dem aktuellen Zustand (stabile Referenz für useStore) */
function useTarget(kind: Kind, id: string) {
  return useStore((s) => (kind === 'call' ? s.state?.runtime.calls.find((c) => c.id === id) : s.state?.runtime.incidents.find((i) => i.id === id)));
}

/** Hinweis in der Maske: jemand anderes ist zuständig – Übernahme anfragen (bzw. sofort, wenn offline) */
export function OwnerBanner({ kind, id, owner }: { kind: Kind; id: string; owner: Owner }) {
  const target = useTarget(kind, id);
  const game = useStore((s) => s.state);
  if (!owner || isMine(owner)) return null;
  const req = target?.takeOverRequest;
  const declined = target?.takeOverDeclined;
  const offline = game ? !playerOnline(game, owner.id) : false;
  return (
    <div className="warnbox row" data-testid="owner-banner">
      <span className="grow">
        Bearbeiter: <b>{owner.name}</b>
        {offline && <span className="muted"> (offline)</span>}
        {req && (req.from.id === myId() ? ' – Anfrage läuft …' : ` – ${req.from.name} fragt an`)}
        {!req && declined?.id === myId() && <span data-testid="take-over-declined"> – Anfrage abgelehnt</span>}
      </span>
      {req?.from.id === myId() ? (
        <button className="btn small" onClick={() => store.cmd('cancelTakeOver', kind, id)} data-testid="take-over-cancel">
          Zurückziehen
        </button>
      ) : (
        !req && (
          <button className="btn small primary" onClick={() => store.cmd('takeOver', kind, id)} data-testid="take-over">
            {offline ? 'Sofort übernehmen' : 'Übernahme anfragen'}
          </button>
        )
      )}
    </div>
  );
}

/** Beim Zuständigen: nicht-modaler Hinweis auf Übernahme-Anfragen (mit Ton) */
export function TakeOverNotice() {
  const calls = useStore((s) => s.state?.runtime.calls);
  const incidents = useStore((s) => s.state?.runtime.incidents);
  const list = [
    ...(calls ?? []).filter((c) => c.takeOverRequest && c.owner && isMine(c.owner) && (c.state === 'klingelt' || c.state === 'in_abfrage')).map((c) => ({ kind: 'call' as const, id: c.id, req: c.takeOverRequest! })),
    ...(incidents ?? []).filter((i) => i.takeOverRequest && i.owner && isMine(i.owner)).map((i) => ({ kind: 'incident' as const, id: i.id, req: i.takeOverRequest! })),
  ];
  const key = list.map((x) => `${x.id}:${x.req.from.id}`).join('|');
  const heard = useRef(new Set<string>());
  useEffect(() => {
    const fresh = list.filter((x) => !heard.current.has(`${x.id}:${x.req.from.id}`));
    heard.current = new Set(list.map((x) => `${x.id}:${x.req.from.id}`));
    if (fresh.length && getPrefs().sound) sounds.request();
  }, [key]);
  if (!list.length) return null;
  return (
    <div className="takeover-notice col" role="status">
      {list.map((x) => (
        <div key={x.id} className="warnbox row" data-testid="take-over-request">
          <span className="grow">
            <b>{x.req.from.name}</b> möchte {x.kind === 'call' ? 'den Notruf' : 'den Einsatz'} übernehmen
          </span>
          <button className="btn small primary" onClick={() => store.cmd('answerTakeOver', x.kind, x.id, true)} data-testid="take-over-accept">
            Genehmigen
          </button>
          <button className="btn small" onClick={() => store.cmd('answerTakeOver', x.kind, x.id, false)} data-testid="take-over-decline">
            Ablehnen
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Takt aus einem Worker: Browser drosseln Timer in Hintergrund-Tabs (Chrome nach 5 min auf etwa 1/min),
 * Worker-Timer nicht. Ohne Worker: normales setInterval.
 */
function steadyInterval(fn: () => void, ms: number): () => void {
  try {
    const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms});`], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = fn;
    return () => {
      w.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    const t = setInterval(fn, ms);
    return () => clearInterval(t);
  }
}

/** Lebenszeichen alle 5 s, damit alle sehen, wer mitspielt (der Gastgeber stempelt mit seiner Uhr) */
export function usePlayerHeartbeat() {
  const hasGame = useStore((s) => Boolean(s.state));
  useEffect(() => {
    if (!hasGame) return;
    const beat = () => store.cmdQuiet('playerSeen', Date.now());
    beat();
    return steadyInterval(beat, 5000);
  }, [hasGame]);
}

export function PlayerChips({ game }: { game: GameState }) {
  const list = game.runtime.players ?? [];
  if (list.length < 2) return null;
  return (
    <span className="row small" title="Mitspieler" data-testid="players">
      {list.map((p) => (
        <span key={p.id} className="chip small">
          {p.name}
          {p.host ? ' (Gastgeber)' : ''}
        </span>
      ))}
    </span>
  );
}

/** Name eingeben (Mitspieler beim Beitreten, Gastgeber auf dem Startbildschirm) */
export function PlayerNameField({ autoFocus = false }: { autoFocus?: boolean }) {
  const player = useStore((s) => s.player);
  const [name, setName] = useState(player?.name ?? '');
  return (
    <label className="row small">
      Name:
      <input value={name} autoFocus={autoFocus} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && store.setPlayerName(name)} placeholder="z. B. Lukas" style={{ width: 140 }} data-testid="player-name" />
    </label>
  );
}

/** Beitrittsbildschirm für Mitspieler (…/mitspielen) */
export function JoinScreen() {
  const player = useStore((s) => s.player);
  const lan = { enabled: useStore((s) => s.lanStatus.enabled), connected: useStore((s) => s.lanStatus.connected) };
  const alive = useStore((s) => s.mainAlive);
  const mode = useStore((s) => s.mode);
  const [name, setName] = useState(player?.name ?? '');
  return (
    <div className="start" data-testid="join-screen">
      <div className="hero">
        <h1>LEITWARTE</h1>
        <div className="muted">Mitspielen</div>
      </div>
      <div className="card col" style={{ maxWidth: 520 }}>
        <label className="col">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Lukas" data-testid="join-name" />
        </label>
        <button className="btn primary" disabled={!name.trim()} onClick={() => store.setPlayerName(name)} data-testid="join-ok">
          {player ? 'Name ändern' : 'Beitreten'}
        </button>
        <div className="infobox small">
          {!lan.enabled
            ? 'Nur über LAN-Server (npm run lan)'
            : !lan.connected
              ? 'Verbindungsaufbau …'
              : mode === 'bearbeiten'
                ? 'Leitstelle wird bearbeitet'
                : alive
                  ? 'Warte auf Start …'
                  : 'Gastgeber antwortet nicht'}
        </div>
      </div>
    </div>
  );
}
