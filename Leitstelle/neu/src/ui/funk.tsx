import { useEffect, useRef, useState } from 'react';
import type { FunkLine, GameState, RadioGroup } from '../model/types';
import { radioGroupOf } from '../model/radio';
import { hashSeed } from '../voice/details/types';
import { createRecognizer, germanVoices, speakAs, type Recognizer } from '../voice/speech';
import { getConsent, giveConsent } from '../voice/transcripts';
import { store, useStore } from '../store/gameStore';
import { squelch } from './audio';
import { getPrefs } from './prefs';
import { fmtClock } from './components/common';

/**
 * Sprechfunk am Leitstand.
 *  - Sendetaste: am Tablet (gedrückt halten), am PC-Funkpanel oder mit F8. Das Mikrofon, die Spracherkennung und
 *    die Antworten der Besatzung (Sprachausgabe mit Rauschen) laufen immer am Leitstand-PC (Hauptfenster).
 *  - Der erkannte Funkspruch geht an den Befehl radioTalk (sim/funk.ts), der die Antwort der Besatzung erzeugt.
 */

export const PTT_KEY = 'F8';
/** längste Sendung – danach schließt das Mikrofon von selbst (z. B. wenn das Tablet die Verbindung verliert) */
const MAX_SEND_MS = 30_000;

/** Rufgruppen der Leitstelle (aus den Fahrzeugen) */
export function radioGroups(game: GameState): RadioGroup[] {
  const m = new Map<string, RadioGroup>();
  for (const v of game.center.vehicles) {
    const g = radioGroupOf(game.center, v);
    if (g?.code && !m.has(g.code)) m.set(g.code, g);
  }
  return [...m.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/** Gemerkte Rufgruppe (je Gerät) */
export function useSavedGroup(key: string): [string, (c: string) => void] {
  const [code, setCode] = useState(() => {
    try {
      return localStorage.getItem(key) ?? '';
    } catch {
      return '';
    }
  });
  const set = (c: string) => {
    setCode(c);
    try {
      localStorage.setItem(key, c);
    } catch {
      /* nur für diese Sitzung */
    }
  };
  return [code, set];
}

/**
 * Läuft nur im Hauptfenster (Leitstand-PC): hört auf die Sendetaste, erkennt den Funkspruch und
 * spricht neue Funksprüche der Fahrzeuge.
 */
export function FunkController() {
  useEffect(() => {
    let rec: Recognizer | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    /** Taste erneut gedrückt, während die vorige Sendung noch ausgewertet wird */
    let pending: { group: string | null } | null = null;

    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const stop = () => {
      pending = null;
      clearTimer();
      rec?.stop();
    };
    const start = (g: string | null) => {
      if (rec) {
        pending = { group: g };
        return;
      }
      const group = g;
      let finalText = '';
      const consent = getConsent();
      if (!consent || consent.mode === 'text') {
        store.setFunkStatus({ error: 'Mikrofon nicht freigegeben (Funkpanel am PC)', sending: false });
        return;
      }
      const r = createRecognizer({
        onDeviceOnly: consent.mode === 'geraet',
        continuous: true,
        onInterim: (t) => store.setFunkStatus({ interim: t }),
        onFinal: (t) => {
          finalText = t;
        },
        onError: (code, message) => {
          if (code !== 'no-speech' && code !== 'aborted') store.setFunkStatus({ error: message });
        },
        onEnd: () => {
          if (rec === r) rec = null;
          clearTimer();
          // onFinal folgt direkt nach onEnd
          queueMicrotask(() => {
            const text = finalText.trim();
            store.setFunkStatus({ sending: false, interim: '' });
            if (text && store.state) store.cmd('radioTalk', text, group);
            // Taste inzwischen wieder gedrückt? Dann gleich weiter senden
            const again = pending;
            pending = null;
            if (again) start(again.group);
          });
        },
      });
      if (!r) {
        store.setFunkStatus({ error: 'Keine Spracherkennung im Browser (Chrome/Edge)' });
        return;
      }
      rec = r;
      squelch(0.08);
      store.setFunkStatus({ sending: true, group: g, interim: '', error: '' });
      try {
        r.start();
      } catch {
        rec = null;
        store.setFunkStatus({ sending: false, error: 'Spracherkennung nicht gestartet' });
        return;
      }
      clearTimer();
      const t = setTimeout(() => {
        if (timer === t) stop();
      }, MAX_SEND_MS);
      timer = t;
    };
    const off = store.onPtt((on, g) => (on ? start(g) : stop()));

    // Funksprüche der Fahrzeuge nacheinander sprechen
    let lastSpoken = store.state?.runtime.funk?.counter ?? 0;
    let lastProject = store.project?.id;
    const queue: FunkLine[] = [];
    let busy = false;
    const next = async () => {
      if (busy) return;
      const line = queue.shift();
      if (!line) return;
      busy = true;
      store.setFunkStatus({ receiving: true });
      squelch();
      await speakAs(line.speech ?? line.text, voiceFor(line.vehicleId), pickVoice(line.vehicleId));
      squelch(0.1);
      store.setFunkStatus({ receiving: false });
      busy = false;
      void next();
    };
    const unsub = store.subscribe(() => {
      const f = store.state?.runtime.funk;
      // anderes Projekt oder zurückgesetzter Spielstand: nichts Altes mehr sprechen
      if (store.project?.id !== lastProject || (f?.counter ?? 0) < lastSpoken) {
        lastProject = store.project?.id;
        lastSpoken = f?.counter ?? 0;
        queue.length = 0;
        return;
      }
      if (!f || f.counter <= lastSpoken) return;
      // Mitspieler hören nur ihre geschaltete Rufgruppe; der Leitstand-PC alles (auch für das Tablet)
      let myGroup = '';
      try {
        myGroup = localStorage.getItem('leitwarte.pc.rufgruppe') ?? '';
      } catch {
        /* ohne Speicher: alles */
      }
      const fresh = f.log.filter((l) => l.id > lastSpoken && l.from === 'fahrzeug' && (!store.isPlayerClient || !myGroup || !l.group || l.group === myGroup));
      lastSpoken = f.counter;
      if (!getPrefs().tts) return;
      queue.push(...fresh);
      void next();
    });
    return () => {
      off();
      unsub();
      stop();
    };
  }, []);
  return null;
}

/** Jede Besatzung klingt etwas anders (Tonhöhe, Stimme) – gleiches Fahrzeug, gleiche Stimme */
function voiceFor(vehicleId?: string) {
  const h = hashSeed(vehicleId ?? 'x');
  return { rate: 1.05 + ((h % 7) - 3) * 0.02, pitch: 0.85 + ((h >> 3) % 9) * 0.04 };
}
function pickVoice(vehicleId?: string) {
  const vs = germanVoices();
  if (!vs.length) return undefined;
  return vs[hashSeed(`${vehicleId}|stimme`) % vs.length].voiceURI;
}

/** Sendetaste (gedrückt halten). Funktioniert mit Maus, Finger und Stift. */
export function PttButton({ group, big = false }: { group: string | null; big?: boolean }) {
  const status = useFunkStatus();
  const [down, setDown] = useState(false);
  const downRef = useRef(false);
  const press = (on: boolean) => {
    if (downRef.current === on) return;
    downRef.current = on;
    setDown(on);
    store.sendPtt(on, group);
  };
  // Taste loslassen, wenn das Fenster den Fokus verliert
  useEffect(() => {
    const up = () => press(false);
    window.addEventListener('blur', up);
    return () => window.removeEventListener('blur', up);
  });
  const active = down || status.sending;
  return (
    <button
      type="button"
      className={`btn ptt ${big ? 'ptt-big' : ''} ${active ? 'ptt-on' : ''} ${status.receiving ? 'ptt-rx' : ''}`}
      data-testid="ptt"
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        press(true);
      }}
      onPointerUp={() => press(false)}
      onPointerCancel={() => press(false)}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && press(true)}
      onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && press(false)}
    >
      {active ? '● Senden …' : status.receiving ? 'Empfang …' : 'Senden'}
    </button>
  );
}

export function useFunkStatus() {
  const sending = useStore((s) => s.funkStatus.sending);
  const interim = useStore((s) => s.funkStatus.interim);
  const error = useStore((s) => s.funkStatus.error);
  const receiving = useStore((s) => s.funkStatus.receiving);
  return { sending, interim, error, receiving };
}

/** Zeile unter der Sendetaste: was der PC gerade hört bzw. Fehler */
export function FunkStatusLine() {
  const s = useFunkStatus();
  if (s.sending) return <div className="small funk-status on">● {s.interim || 'Sprechen …'}</div>;
  if (s.receiving) return <div className="small funk-status rx">Empfang …</div>;
  if (s.error) return <div className="small funk-status err">{s.error}</div>;
  return null;
}

/** Funkverkehr (neueste unten), optional nur eine Rufgruppe */
export function FunkLog({ game, group, max = 12 }: { game: GameState; group?: string | null; max?: number }) {
  const all = game.runtime.funk?.log ?? [];
  const lines = all.filter((l) => !group || !l.group || l.group === group).slice(-max);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [lines.length, lines[lines.length - 1]?.id]);
  return (
    <div className="funk-log" ref={ref} data-testid="funk-log">
      {lines.length === 0 && <div className="dim small">Kein Funkverkehr</div>}
      {lines.map((l) => (
        <div key={l.id} className={`funk-line ${l.from}`} data-testid="funk-line">
          <span className="mono small dim">{fmtClock(l.at)}</span> <b>{l.from === 'leitstelle' ? 'Leitstelle' : l.from === 'system' ? 'ℹ' : ''}</b> {l.text}
        </div>
      ))}
    </div>
  );
}

/** Freigabe des Mikrofons für Funk und Freisprechen (gleiche Einwilligung wie im Sprachtest) */
export function FunkConsent() {
  const [consent, setConsentState] = useState(getConsent);
  const setConsent = (c: ReturnType<typeof getConsent>) => {
    setConsentState(c);
    // Freisprechen beim Notruf sofort mit dem Mikrofon starten
    window.dispatchEvent(new Event('leitwarte-freisprechen'));
  };
  if (consent && consent.mode !== 'text') return null;
  return (
    <div className="infobox small col" style={{ gap: 4 }} data-testid="funk-consent">
      <span>Mikrofon für Funk und Freisprechen (keine Audiospeicherung)</span>
      <div className="row wrap">
        <button className="btn small" onClick={() => setConsent(giveConsent('geraet'))}>
          Freigeben (lokal)
        </button>
        <button className="btn small" onClick={() => setConsent(giveConsent('browserdienst'))}>
          Freigeben (Browserdienst)
        </button>
      </div>
    </div>
  );
}

/** Funkbedienung am PC: Rufgruppe, Sendetaste, getippter Funkspruch, Funkverkehr */
export function FunkBar({ game }: { game: GameState }) {
  const groups = radioGroups(game);
  const [saved, setSaved] = useSavedGroup('leitwarte.pc.rufgruppe');
  const group = groups.find((g) => g.code === saved)?.code ?? groups[0]?.code ?? null;
  const [typed, setTyped] = useState('');
  // F8 gedrückt halten = senden
  const groupRef = useRef(group);
  groupRef.current = group;
  useEffect(() => {
    let held = false;
    const down = (e: KeyboardEvent) => {
      if (e.key !== PTT_KEY || e.repeat) return;
      e.preventDefault();
      held = true;
      store.sendPtt(true, groupRef.current);
    };
    const release = () => {
      if (!held) return;
      held = false;
      store.sendPtt(false, groupRef.current);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key !== PTT_KEY) return;
      e.preventDefault();
      release();
    };
    // Fenster verliert den Fokus (Alt+Tab, anderer Bildschirm): Taste gilt als losgelassen
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
      release();
    };
  }, []);
  const send = () => {
    if (!typed.trim()) return;
    store.cmd('radioTalk', typed.trim(), group);
    setTyped('');
  };
  return (
    <div className="col funk-bar" style={{ gap: 6 }} data-testid="funk-bar">
      <div className="row wrap" style={{ alignItems: 'center' }}>
        <select value={group ?? ''} onChange={(e) => setSaved(e.target.value)} aria-label="Rufgruppe" data-testid="pc-rufgruppe">
          {groups.map((g) => (
            <option key={g.code} value={g.code}>
              {g.code} – {g.name}
            </option>
          ))}
        </select>
        <PttButton group={group} />
        <span className="dim small">{PTT_KEY}</span>
      </div>
      <FunkStatusLine />
      <FunkConsent />
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input className="grow" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Funkspruch" data-testid="funk-input" />
        <button className="btn small" type="submit">
          Senden
        </button>
      </form>
      <FunkLog game={game} group={group} max={8} />
    </div>
  );
}
