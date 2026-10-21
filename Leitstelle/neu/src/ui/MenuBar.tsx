import { useEffect, useRef, useState } from 'react';
import { store, useStore } from '../store/gameStore';
import { WEATHER_LABEL } from '../sim/engine';
import { DIFFICULTY } from '../sim/difficulty';
import { openPopout, POPOUTS } from './PopoutApp';
import { getPrefs, setPrefs } from './prefs';
import { useRoutingState } from './routingService';
import { fmtClock, fmtDate } from './components/common';

/**
 * Menüleiste, Werkzeugleiste und Statuszeile wie in einem Einsatzleitsystem.
 */

export interface MenuItem {
  label: string;
  key?: string;
  onClick?: () => void;
  disabled?: boolean;
  checked?: boolean;
  sep?: boolean;
}

function Menu({ title, items, testId }: { title: string; items: MenuItem[]; testId?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="mb-menu" ref={ref}>
      <button className={`mb-title ${open ? 'open' : ''}`} onClick={() => setOpen(!open)} data-testid={testId}>
        {title}
      </button>
      {open && (
        <div className="mb-list" role="menu">
          {items.map((it, i) =>
            it.sep ? (
              <div key={i} className="mb-sep" />
            ) : (
              <button
                key={i}
                role="menuitem"
                className="mb-item"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onClick?.();
                }}
              >
                <span className="mb-check">{it.checked ? '✓' : ''}</span>
                <span className="grow">{it.label}</span>
                {it.key && <span className="mb-key">{it.key}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function MenuBar({ nav, view, setView, onHelp }: { nav: [string, string][]; view: string; setView: (v: never) => void; onHelp: () => void }) {
  const mode = useStore((s) => s.mode);
  const popouts = useStore((s) => s.popouts);
  const player = store.isPlayerClient;
  const style = getPrefs().uiStyle;
  const ansicht: MenuItem[] = [
    ...nav.map(([id, label]) => ({ label, checked: view === id, onClick: () => setView(id as never) })),
    { label: '', sep: true },
    ...(mode === 'spielen' && !player
      ? POPOUTS.map(([k, l]) =>
          popouts.includes(k) ? { label: `${l} zurückholen`, onClick: () => store.closePopout(k) } : { label: `${l} in eigenem Fenster`, onClick: () => openPopout(k) },
        )
      : []),
    { label: '', sep: true },
    { label: 'Stil Behörde', checked: style === 'behoerde', onClick: () => setPrefs({ uiStyle: 'behoerde' }) },
    { label: 'Stil Modern', checked: style === 'modern', onClick: () => setPrefs({ uiStyle: 'modern' }) },
  ];
  return (
    <div className="menubar" role="menubar">
      <span className="mb-brand">LEITWARTE</span>
      <Menu
        title="Datei"
        items={[
          { label: 'Speichern', key: 'Strg+S', disabled: player, onClick: () => void store.save().then((ok) => ok && store.toast('ok', 'Gespeichert.')) },
          { label: '', sep: true },
          { label: mode === 'bearbeiten' ? 'Bearbeitung beenden und starten' : 'Leitstelle bearbeiten', disabled: player, onClick: () => store.setMode(mode === 'bearbeiten' ? 'spielen' : 'bearbeiten') },
          { label: 'Beenden', disabled: player, onClick: () => void store.close() },
        ]}
      />
      <Menu title="Ansicht" items={ansicht} testId="menu-ansicht" />
      {mode === 'spielen' && (
        <Menu
          title="Simulation"
          items={[
            { label: 'Start / Pause', key: 'Leertaste', disabled: player, onClick: () => store.cmdQuiet('toggleRunning') },
            ...[1, 2, 5, 10, 30, 60].map((sp, i) => ({ label: `Geschwindigkeit ${sp}×`, key: String(i + 1), disabled: player, checked: store.state?.runtime.clock.speed === sp, onClick: () => store.cmdQuiet('setSpeed', sp) })),
          ]}
        />
      )}
      <Menu
        title="Hilfe"
        items={[
          { label: 'Tastaturbelegung', key: 'F1', onClick: onHelp },
          { label: 'Über LEITWARTE', onClick: () => store.toast('info', 'LEITWARTE – Leitstellensimulation. Kartendaten © OpenStreetMap-Mitwirkende.') },
        ]}
      />
      <span className="spacer" />
      <span className="mb-project">{store.project?.name}</span>
    </div>
  );
}

/** Statuszeile unten: Benutzer, Lage, Speicherstand, Funktionstasten */
export function StatusBar() {
  const game = useStore((s) => s.state);
  const saveStatus = useStore((s) => s.saveStatus);
  const player = useStore((s) => s.player);
  const routing = useRoutingState();
  if (!game) return null;
  const rt = game.runtime;
  return (
    <footer className="statusbar">
      <span className="sb-field">{player?.name ?? 'Disponent'}</span>
      <span className="sb-field">{game.center.name}</span>
      <span className="sb-field">{fmtDate(rt.clock.now)} {fmtClock(rt.clock.now, true)}</span>
      <span className="sb-field">{WEATHER_LABEL[rt.weather]}</span>
      <span className="sb-field">{DIFFICULTY[game.center.settings.difficulty].label}</span>
      <span className={`sb-field ${routing.state === 'fehler' ? 'warn' : ''}`}>{routing.state === 'ok' ? 'Straßenrouting' : routing.state === 'fehler' ? 'Luftlinie' : 'Routing aus'}</span>
      <span className="spacer" />
      <span className="sb-keys">
        <kbd>F1</kbd> Hilfe <kbd>F2</kbd> Notruf annehmen <kbd>F3</kbd> Einsatz <kbd>F8</kbd> Funk <kbd>Leer</kbd> Start/Pause
      </span>
      <span className={`sb-field ${saveStatus === 'fehler' ? 'warn' : ''}`}>{saveStatus === 'gespeichert' ? 'gespeichert' : saveStatus === 'speichert' ? 'speichert …' : saveStatus === 'fehler' ? 'Speicherfehler' : 'ungespeichert'}</span>
    </footer>
  );
}
