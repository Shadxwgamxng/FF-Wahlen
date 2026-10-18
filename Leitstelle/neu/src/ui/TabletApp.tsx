import { useEffect, useMemo, useState } from 'react';
import type { GameState, RadioGroup, Vehicle } from '../model/types';
import { radioGroupOf } from '../model/radio';
import { useStore } from '../store/gameStore';
import { ConfirmHost, fmtClock, StatusBadge, Toasts } from './components/common';
import { DiasPanel } from './views/desk/DiasPanel';
import { RadioActions } from './views/desk/RadioPanel';

/**
 * Tablet-Ansicht (über den LAN-Server: http://<server>:<port>/tablet).
 * Läuft ein Notruf in Abfrage, zeigt das Tablet die Notrufabfrage (DIAS) zum Durchtippen – synchron mit
 * der Einsatzmaske am PC. Sonst ist es ein Funkbedienplatz mit Rufgruppenauswahl.
 */

const GROUP_KEY = 'leitwarte.tablet.rufgruppe';

function loadGroup(): string {
  try {
    return localStorage.getItem(GROUP_KEY) ?? '';
  } catch {
    return '';
  }
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

  if (!game) {
    return (
      <div className="start tablet">
        <h2>LEITWARTE – Tablet</h2>
        <div className="infobox" data-testid="tablet-waiting">
          {!lan.enabled
            ? 'Diese Ansicht funktioniert nur über den LAN-Server (npm run lan).'
            : !lan.connected
              ? 'Verbinde mit dem LAN-Server …'
              : alive
                ? 'Verbunden. Warte auf den Leitstand am PC … (dort eine Leitstelle öffnen)'
                : 'Der Leitstand am PC antwortet nicht. Bitte LEITWARTE am PC öffnen.'}
        </div>
      </div>
    );
  }
  const calls = game.runtime.calls.filter((c) => c.state === 'in_abfrage').sort((a, b) => (b.acceptedAt ?? 0) - (a.acceptedAt ?? 0));
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
  const active = groups.find((g) => g.group.code === code) ?? groups[0];
  const select = (c: string) => {
    setCode(c);
    try {
      localStorage.setItem(GROUP_KEY, c);
    } catch {
      /* ohne Speicher nur für diese Sitzung */
    }
  };
  if (!active) return <div className="infobox">Keine Funkrufgruppen konfiguriert.</div>;
  const ids = new Set(active.vehicles.map((v) => v.id));
  const messages = game.runtime.radio.filter((r) => !r.handled && ids.has(r.vehicleId)).sort((a, b) => a.at - b.at);
  const others = groups.filter((g) => g !== active && g.pending > 0);
  const busy = active.vehicles.filter((v) => v.rt.status !== 'frei_wache').sort((a, b) => a.callsign.localeCompare(b.callsign));
  const vehicles = showAll ? [...active.vehicles].sort((a, b) => Number(b.rt.status !== 'frei_wache') - Number(a.rt.status !== 'frei_wache') || a.callsign.localeCompare(b.callsign)) : busy;
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
        <div className="tablet-title">
          Geschaltet: <b>{active.group.code}</b> – {active.group.name}
        </div>
        {others.length > 0 && (
          <div className="warnbox">
            Meldungen in anderen Gruppen:{' '}
            {others.map((g) => (
              <button key={g.group.code} className="btn small" onClick={() => select(g.group.code)}>
                {g.group.code} ({g.pending})
              </button>
            ))}
          </div>
        )}
        <div className="col" data-testid="funk-meldungen">
          {messages.length === 0 && <div className="dim">Keine offenen Meldungen in dieser Rufgruppe.</div>}
          {messages.map((r) => {
            const v = game.center.vehicles.find((x) => x.id === r.vehicleId);
            return (
              <div key={r.id} className="warnbox col funk-msg" data-testid="funk-meldung">
                <div>
                  <span className="mono small">{fmtClock(r.at)}</span> <b>{v?.callsign}</b>: {r.text}
                </div>
                <RadioActions game={game} msg={r} />
              </div>
            );
          })}
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          <div className="tablet-title grow">
            {showAll ? `Alle Fahrzeuge der Rufgruppe (${active.vehicles.length})` : `Fahrzeuge im Einsatz (${busy.length} von ${active.vehicles.length})`}
          </div>
          <button className="btn" onClick={() => setShowAll((x) => !x)}>
            {showAll ? 'Nur im Einsatz' : 'Alle anzeigen'}
          </button>
        </div>
        {vehicles.length === 0 && <div className="dim">Alle Fahrzeuge dieser Rufgruppe sind frei auf Wache.</div>}
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

