import { useEffect, useState } from 'react';
import type { GameState } from '../model/types';
import { store, useStore } from '../store/gameStore';

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

/** Hinweis in der Maske: jemand anderes ist zuständig – mit "Übernehmen" */
export function OwnerBanner({ kind, id, owner }: { kind: 'call' | 'incident'; id: string; owner: Owner }) {
  if (!owner || isMine(owner)) return null;
  return (
    <div className="warnbox row" data-testid="owner-banner">
      <span className="grow">
        Wird von <b>{owner.name}</b> bearbeitet. Du kannst zusehen oder übernehmen.
      </span>
      <button className="btn small primary" onClick={() => store.cmd('takeOver', kind, id)} data-testid="take-over">
        Übernehmen
      </button>
    </div>
  );
}

/** Lebenszeichen alle 5 s, damit alle sehen, wer mitspielt */
export function usePlayerHeartbeat() {
  const hasGame = useStore((s) => Boolean(s.state));
  useEffect(() => {
    if (!hasGame) return;
    const beat = () => store.cmdQuiet('playerSeen', Date.now());
    beat();
    const t = setInterval(beat, 5000);
    return () => clearInterval(t);
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
      Dein Name:
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
        <div className="muted">Mitspielen – die Simulation läuft beim Gastgeber.</div>
      </div>
      <div className="card col" style={{ maxWidth: 520 }}>
        <label className="col">
          Dein Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Lukas" data-testid="join-name" />
        </label>
        <button className="btn primary" disabled={!name.trim()} onClick={() => store.setPlayerName(name)} data-testid="join-ok">
          {player ? 'Name ändern' : 'Beitreten'}
        </button>
        <div className="infobox small">
          {!lan.enabled
            ? 'Mitspielen geht nur über den LAN-Server des Gastgebers (npm run lan).'
            : !lan.connected
              ? 'Verbinde mit dem Gastgeber …'
              : mode === 'bearbeiten'
                ? 'Der Gastgeber bearbeitet gerade die Leitstelle. Es geht los, sobald er startet.'
                : alive
                  ? 'Verbunden. Warte, bis der Gastgeber eine Leitstelle startet …'
                  : 'Der Gastgeber antwortet nicht.'}
        </div>
      </div>
    </div>
  );
}
