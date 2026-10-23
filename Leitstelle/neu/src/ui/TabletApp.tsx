import { useEffect, useMemo, useState } from 'react';
import type { GameState, RadioGroup, Vehicle } from '../model/types';
import { compareCallsigns, heardGroups, radioGroupOf } from '../model/radio';
import { store, useStore } from '../store/gameStore';
import { ConfirmHost, fmtClock, StatusBadge, Toasts } from './components/common';
import { DiasPanel } from './views/desk/DiasPanel';
import { RadioActions, radioText } from './views/desk/RadioPanel';
import { FunkLog, FunkStatusLine, PttButton } from './funk';

/**
 * Tablet-Ansicht (über den LAN-Server: http://<server>:<port>/tablet).
 * Läuft ein Notruf in Abfrage, zeigt das Tablet die Notrufabfrage (DIAS) zum Durchtippen – synchron mit
 * der Einsatzmaske am PC. Sonst ist es ein Funkbedienplatz mit Rufgruppenauswahl.
 */

const GROUP_KEY = 'leitwarte.tablet.rufgruppe';
const OWNER_KEY = 'leitwarte.tablet.gehoertzu';

// Mehrspieler: zu welchem Spieler gehört dieses Tablet? (gemerkt je Gerät)
try {
  const o = JSON.parse(localStorage.getItem(OWNER_KEY) ?? 'null');
  if (o && typeof o.id === 'string') store.tabletOwner = o;
} catch {
  /* Gastgeber-PC */
}

function setOwner(o: { id: string; name: string } | null) {
  // bisheriger PC hört die Gruppe dieses Tablets nicht mehr, der neue ab sofort
  store.sendRufgruppe(null);
  store.tabletOwner = o;
  store.sendRufgruppe(currentGroup());
  try {
    if (o) localStorage.setItem(OWNER_KEY, JSON.stringify(o));
    else localStorage.removeItem(OWNER_KEY);
  } catch {
    /* nur für diese Sitzung */
  }
  store.funkStatus = { sending: false, group: null, interim: '', error: '', receiving: false };
}

/** Auswahl: Tablet gehört zum Gastgeber-PC oder zu einem Mitspieler */
function OwnerSelect({ game }: { game: GameState }) {
  const [, force] = useState(0);
  const players = (game.runtime.players ?? []).filter((p) => !p.host);
  if (players.length === 0 && !store.tabletOwner) return null;
  return (
    <label className="row small">
      Platz:
      <select
        value={store.tabletOwner?.id ?? ''}
        onChange={(e) => {
          const p = players.find((x) => x.id === e.target.value);
          setOwner(p ? { id: p.id, name: p.name } : null);
          force((x) => x + 1);
        }}
        data-testid="tablet-owner"
      >
        <option value="">Gastgeber-PC</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        {store.tabletOwner && !players.some((p) => p.id === store.tabletOwner!.id) && <option value={store.tabletOwner.id}>{store.tabletOwner.name} (nicht verbunden)</option>}
      </select>
    </label>
  );
}

/** Notrufe, die zu diesem Tablet gehören (Zuständigkeit) */
function mineForTablet(game: GameState, owner?: { id: string }) {
  const t = store.tabletOwner;
  if (t) return owner?.id === t.id;
  // Gastgeber-Tablet: ohne Zuständigkeit oder vom Gastgeber
  return !owner || owner.id === 'host' || (game.runtime.players ?? []).some((p) => p.host && p.id === owner.id);
}

function loadGroup(): string {
  try {
    return localStorage.getItem(GROUP_KEY) ?? '';
  } catch {
    return '';
  }
}

/** geschaltete Gruppe, sofern es sie in dieser Leitstelle gibt */
function currentGroup(): string | null {
  const code = loadGroup();
  const c = store.state?.center;
  return code && c?.vehicles.some((v) => radioGroupOf(c, v)?.code === code) ? code : null;
}

export function TabletApp() {
  const game = useStore((s) => s.state);
  const alive = useStore((s) => s.mainAlive);
  // einzelne Werte auswählen (ein neues Objekt je Abfrage würde endlos neu zeichnen)
  const lan = { enabled: useStore((s) => s.lanStatus.enabled), connected: useStore((s) => s.lanStatus.connected) };
  const [mode, setMode] = useState<'auto' | 'funk'>('auto');
  useEffect(() => {
    document.title = 'LEITWARTE – Tablet';
  }, []);
  // geschaltete Rufgruppe regelmäßig dem zugehörigen PC melden, damit er mithört (auch während der Notrufabfrage)
  useEffect(() => {
    const send = () => store.sendRufgruppe(currentGroup());
    send();
    const t = setInterval(send, 5000);
    return () => clearInterval(t);
  }, []);

  if (!game) {
    return (
      <div className="start tablet">
        <h2>LEITWARTE – Tablet</h2>
        <div className="infobox" data-testid="tablet-waiting">
          {!lan.enabled
            ? 'Nur über LAN-Server (npm run lan)'
            : !lan.connected
              ? 'Verbindungsaufbau …'
              : alive
                ? 'Warte auf Leitstand …'
                : 'Leitstand antwortet nicht'}
        </div>
      </div>
    );
  }
  const calls = game.runtime.calls.filter((c) => c.state === 'in_abfrage' && mineForTablet(game, c.owner)).sort((a, b) => (b.acceptedAt ?? 0) - (a.acceptedAt ?? 0));
  const showDias = mode === 'auto' && calls.length > 0;
  return (
    <div className="tablet-shell" data-testid="tablet">
      <header className="tablet-top">
        <span className="brand">LEITWARTE</span>
        <span className="clock">{fmtClock(game.runtime.clock.now, true)}</span>
        <span className="spacer" />
        {calls.length > 0 && (
          <div className="seg">
            <button className={`btn ${mode === 'auto' ? 'active' : ''}`} onClick={() => setMode('auto')} data-testid="tablet-tab-sna">
              Notrufabfrage{calls.length > 1 ? ` (${calls.length})` : ''}
            </button>
            <button className={`btn ${mode === 'funk' ? 'active' : ''}`} onClick={() => setMode('funk')} data-testid="tablet-tab-funk">
              Funk
            </button>
          </div>
        )}
        <OwnerSelect game={game} />
        <span className={`chip ${lan.connected && alive ? 'ok' : 'alarm'}`}>{lan.connected ? (alive ? 'verbunden' : 'PC antwortet nicht') : 'getrennt'}</span>
      </header>
      <main className="tablet-main">{showDias ? <TabletSna game={game} calls={calls} /> : <Funkbedienplatz game={game} />}</main>
      <Toasts />
      <ConfirmHost />
    </div>
  );
}

function TabletSna({ game, calls }: { game: GameState; calls: GameState['runtime']['calls'] }) {
  const [sel, setSel] = useState(calls[0].id);
  const call = calls.find((c) => c.id === sel) ?? calls[0];
  const kw = game.center.keywords.find((k) => k.id === call.keywordId);
  return (
    <div className="col tablet-sna">
      {calls.length > 1 && (
        <div className="row wrap">
          {calls.map((c) => (
            <button key={c.id} className={`btn ${c.id === call.id ? 'active' : ''}`} onClick={() => setSel(c.id)}>
              ☎ {c.mask.callerName || c.caller.phone}
            </button>
          ))}
        </div>
      )}
      <div className="tablet-callhead" data-testid="tablet-call">
        <b>☎ Notruf in Abfrage</b>
        <span>{call.mask.callerPhone || call.caller.phone}</span>
        {(call.mask.street || call.mask.city) && (
          <span>
            · {call.mask.street} {call.mask.houseNumber} {call.mask.city}
          </span>
        )}
        <span className="spacer" />
        {kw && <span className="chip">{kw.code}</span>}
      </div>
      <DiasPanel game={game} call={call} tablet />
    </div>
  );
}

interface GroupInfo {
  group: RadioGroup;
  vehicles: Vehicle[];
  pending: number;
}

function Funkbedienplatz({ game }: { game: GameState }) {
  const groups = useMemo(() => {
    const m = new Map<string, GroupInfo>();
    for (const v of game.center.vehicles) {
      const g = radioGroupOf(game.center, v);
      if (!g?.code) continue;
      if (!m.has(g.code)) m.set(g.code, { group: g, vehicles: [], pending: 0 });
      m.get(g.code)!.vehicles.push(v);
    }
    const open = game.runtime.radio.filter((r) => !r.handled);
    for (const info of m.values()) {
      const ids = new Set(info.vehicles.map((v) => v.id));
      info.pending = open.filter((r) => ids.has(r.vehicleId)).length;
    }
    return [...m.values()].sort((a, b) => a.group.code.localeCompare(b.group.code));
  }, [game]);
  const [code, setCode] = useState(loadGroup);
  const [showAll, setShowAll] = useState(false);
  // genau eine Gruppe oder keine – kein Rückfall auf die erste
  const active = groups.find((g) => g.group.code === code) ?? null;
  const activeCode = active?.group.code ?? null;
  /** Gruppe schalten; die geschaltete erneut antippen bzw. '' = Gruppe verlassen */
  const select = (c: string) => {
    const next = c === code ? '' : c;
    setCode(next);
    try {
      localStorage.setItem(GROUP_KEY, next);
    } catch {
      /* ohne Speicher nur für diese Sitzung */
    }
    store.sendRufgruppe(next || null);
  };
  if (!groups.length) return <div className="infobox">Keine Funkrufgruppen</div>;
  const ids = new Set(active?.vehicles.map((v) => v.id));
  const messages = game.runtime.radio.filter((r) => !r.handled && ids.has(r.vehicleId)).sort((a, b) => a.at - b.at);
  const others = groups.filter((g) => g !== active && g.pending > 0);
  const groupVehicles = active?.vehicles ?? [];
  const busy = groupVehicles.filter((v) => v.rt.status !== 'frei_wache').sort((a, b) => compareCallsigns(a.callsign, b.callsign));
  const vehicles = showAll ? [...groupVehicles].sort((a, b) => Number(b.rt.status !== 'frei_wache') - Number(a.rt.status !== 'frei_wache') || compareCallsigns(a.callsign, b.callsign)) : busy;
  return (
    <div className="funk-tablet" data-testid="funkbedienplatz">
      <section className="col">
        <div className="tablet-title">Rufgruppe</div>
        <div className="group-grid">
          {groups.map((g) => (
            <button key={g.group.code} className={`btn group-btn ${g === active ? 'active' : ''}`} onClick={() => select(g.group.code)} data-testid="rufgruppe">
              <b>{g.group.code}</b>
              <span className="small">{g.group.name}</span>
              {g.pending > 0 && <span className="badge-count">{g.pending}</span>}
            </button>
          ))}
        </div>
      </section>
      <section className="col" style={{ minHeight: 0 }}>
        <div className="row" style={{ alignItems: 'center' }}>
          <div className="tablet-title grow">
            {active ? (
              <>
                Geschaltet: <b>{active.group.code}</b> – {active.group.name}
              </>
            ) : (
              'Keine Rufgruppe geschaltet'
            )}
          </div>
          {active && (
            <button className="btn" onClick={() => select('')} data-testid="rufgruppe-verlassen">
              Rufgruppe verlassen
            </button>
          )}
        </div>
        <div className="col tablet-ptt" style={{ gap: 6 }}>
          <PttButton group={activeCode} big />
          <FunkStatusLine />
        </div>
        <FunkLog game={game} groups={heardGroups(null, activeCode)} max={8} />
        {others.length > 0 && (
          <div className="warnbox">
            Andere Gruppen:{' '}
            {others.map((g) => (
              <button key={g.group.code} className="btn small" onClick={() => select(g.group.code)}>
                {g.group.code} ({g.pending})
              </button>
            ))}
          </div>
        )}
        <div className="col" data-testid="funk-meldungen">
          {messages.length === 0 && <div className="dim">Keine offenen Meldungen</div>}
          {messages.map((r) => {
            const v = game.center.vehicles.find((x) => x.id === r.vehicleId);
            return (
              <div key={r.id} className="warnbox col funk-msg" data-testid="funk-meldung">
                <div>
                  <span className="mono small">{fmtClock(r.at)}</span> <b>{v?.callsign}</b>: {radioText(r)}
                </div>
                <RadioActions game={game} msg={r} />
              </div>
            );
          })}
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          <div className="tablet-title grow">
            {showAll ? `Fahrzeuge (${groupVehicles.length})` : `Im Einsatz (${busy.length}/${groupVehicles.length})`}
          </div>
          <button className="btn" onClick={() => setShowAll((x) => !x)}>
            {showAll ? 'Nur im Einsatz' : 'Alle anzeigen'}
          </button>
        </div>
        {vehicles.length === 0 && <div className="dim">Keine Fahrzeuge im Einsatz</div>}
        <div className="funk-vehicles">
          {vehicles.map((v) => (
            <div key={v.id} className="funk-vehicle">
              <StatusBadge game={game} meaning={v.rt.status} />
              <span>{v.callsign}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

