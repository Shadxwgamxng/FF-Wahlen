import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { GameState, StatusMeaning } from '../../model/types';
import { statusDef } from '../../sim/engine';
import { store, useStore } from '../../store/gameStore';

export function StatusBadge({ game, meaning, title }: { game: GameState; meaning: StatusMeaning; title?: string }) {
  const d = statusDef(game, meaning);
  return (
    <span className="status-badge" style={{ background: d.color }} title={title ?? `${d.code} – ${d.label}`}>
      {d.code}
    </span>
  );
}

export function Modal({ title, children, footer, onClose, wide }: { title: ReactNode; children: ReactNode; footer?: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} style={wide ? { width: 'min(1100px, 100%)' } : undefined}>
        <div className="window-head">
          <h3 className="grow">{title}</h3>
          <button className="btn ghost small" onClick={onClose} aria-label="Schließen">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Bestätigungsdialog

type ConfirmReq = { text: string; confirmLabel: string; danger: boolean; resolve: (ok: boolean) => void };
let confirmReq: ConfirmReq | null = null;
const confirmListeners = new Set<() => void>();
const setConfirm = (r: ConfirmReq | null) => {
  confirmReq = r;
  confirmListeners.forEach((l) => l());
};

/** Asynchroner Bestätigungsdialog für kritische Aktionen */
export function confirmDialog(text: string, opts: { confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => setConfirm({ text, confirmLabel: opts.confirmLabel ?? 'Bestätigen', danger: opts.danger ?? true, resolve }));
}

export function ConfirmHost() {
  const req = useSyncExternalStore(
    (l) => {
      confirmListeners.add(l);
      return () => confirmListeners.delete(l);
    },
    () => confirmReq,
  );
  if (!req) return null;
  const done = (v: boolean) => {
    setConfirm(null);
    req.resolve(v);
  };
  return (
    <Modal
      title="Bitte bestätigen"
      onClose={() => done(false)}
      footer={
        <>
          <button className="btn" onClick={() => done(false)}>Abbrechen</button>
          <button className={`btn ${req.danger ? 'danger' : 'primary'}`} onClick={() => done(true)} autoFocus>
            {req.confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{req.text}</p>
    </Modal>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'fehler' ? 'alert' : 'status'}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'active' : ''} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Layout: verschiebbare Trenner

const LAYOUT_KEY = 'leitwarte.layout';
export function loadLayout(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}');
  } catch {
    return {};
  }
}
function saveLayout(l: Record<string, number>) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(l));
  } catch {
    /* ohne Speicher weiter */
  }
}

/** Trenner, der eine CSS-Variable (Breite/Höhe in px) am Container verstellt */
export function Splitter({ cssVar, dir, invert, className, min = 160, max = 900 }: { cssVar: string; dir: 'x' | 'y'; invert?: boolean; className: string; min?: number; max?: number }) {
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const l = loadLayout();
    const host = ref.current?.parentElement;
    if (host && l[cssVar]) host.style.setProperty(cssVar, `${l[cssVar]}px`);
  }, [cssVar]);
  const onDown = (e: React.PointerEvent) => {
    const host = ref.current?.parentElement;
    if (!host) return;
    e.preventDefault();
    setDrag(true);
    const start = dir === 'x' ? e.clientX : e.clientY;
    const cur = parseFloat(getComputedStyle(host).getPropertyValue(cssVar)) || 300;
    const move = (ev: PointerEvent) => {
      const d = (dir === 'x' ? ev.clientX : ev.clientY) - start;
      const v = Math.max(min, Math.min(max, cur + (invert ? -d : d)));
      host.style.setProperty(cssVar, `${v}px`);
    };
    const up = () => {
      setDrag(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const v = parseFloat(host.style.getPropertyValue(cssVar));
      if (v) saveLayout({ ...loadLayout(), [cssVar]: v });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return <div ref={ref} className={`splitter ${className} ${drag ? 'dragging' : ''}`} onPointerDown={onDown} role="separator" aria-orientation={dir === 'x' ? 'vertical' : 'horizontal'} title="Ziehen zum Anpassen" />;
}

export function useNow(): number {
  return useStore((s) => s.state?.runtime.clock.now ?? 0);
}

export const fmtClock = (t: number, withSeconds = false) =>
  new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: withSeconds ? '2-digit' : undefined, timeZone: 'UTC' });
export const fmtDate = (t: number) => new Date(t).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
export const fmtDateTime = (t: number) => `${fmtDate(t)} ${fmtClock(t)}`;
export const fmtAgo = (now: number, t: number) => {
  const s = Math.max(0, Math.round((now - t) / 1000));
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
};

export function downloadFile(name: string, content: string, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => {
        store.toast('fehler', 'Datei konnte nicht gelesen werden.');
        resolve(null);
      };
      r.readAsText(f);
    };
    input.click();
  });
}
