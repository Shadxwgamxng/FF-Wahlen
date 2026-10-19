import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameState } from '../../model/types';
import { CallerSim, personaFor, type VoiceCall } from '../../voice/caller';
import { buildVoiceTestCall, emptyVoiceEntry, evaluateVoiceTest, type VoiceEntry, type VoiceEvaluation } from '../../voice/testCall';
import { checkOnDevice, createRecognizer, detectSupport, germanVoices, installOnDevice, speakAs, stopSpeaking, type Recognizer, type SpeechSupport } from '../../voice/speech';
import {
  deleteAllTranscripts,
  deleteTranscript,
  getConsent,
  giveConsent,
  listTranscripts,
  saveTranscript,
  transcriptToText,
  withdrawConsent,
  type RecognitionMode,
  type TranscriptLine,
  type TranscriptSession,
  type VoiceConsent,
} from '../../voice/transcripts';
import { confirmDialog, downloadFile } from '../components/common';
import { KeywordSelect } from './desk/KeywordSelect';
import { MeldebildSelect, StreetInput } from './desk/Maske';

/**
 * Sprachtest: eigener Übungsbereich, getrennt von der laufenden Simulation.
 * Der Disponent spricht (oder tippt), ein regelbasierter Anrufer antwortet per Sprachausgabe.
 * Es gibt nur ein Live-Transkript – alle Angaben trägt der Disponent selbst in die Maske ein.
 */

const MODE_LABEL: Record<RecognitionMode, string> = {
  geraet: 'Spracherkennung nur auf diesem Gerät',
  browserdienst: 'Spracherkennung über den Dienst des Browsers',
  text: 'Nur Texteingabe (kein Mikrofon)',
};

const ON_DEVICE_LABEL: Record<SpeechSupport['onDevice'], string> = {
  verfuegbar: 'auf dem Gerät verfügbar',
  herunterladbar: 'auf dem Gerät möglich – Sprachpaket muss geladen werden',
  'wird-geladen': 'Sprachpaket wird geladen …',
  'nicht-verfuegbar': 'auf dem Gerät nicht verfügbar',
  unbekannt: 'auf dem Gerät: unbekannt (Prüfung ohne Ergebnis)',
  ungeprueft: 'auf dem Gerät: noch nicht geprüft',
};

export function VoiceTestView({ game }: { game: GameState }) {
  const [consent, setConsent] = useState<VoiceConsent | null>(() => getConsent());
  const [support, setSupport] = useState<SpeechSupport>(() => detectSupport());
  const [checking, setChecking] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Nur auf Klick: die Abfrage kann in manchen Browsern hängen (siehe voice/speech.ts)
  const check = async () => {
    setChecking(true);
    const onDevice = await checkOnDevice();
    if (!mounted.current) return;
    setChecking(false);
    setSupport((s) => ({ ...s, onDevice }));
  };

  return (
    <div className="page voice-page" data-testid="voice-test">
      <div className="card col">
        <div className="row wrap" style={{ alignItems: 'center' }}>
          <h3 className="grow">Sprachtest – Notrufabfrage per Sprache</h3>
          <span className="badge sim-badge" title="Der Anrufer ist eine regelbasierte Simulation. Keine KI, kein echter Notruf.">SIMULATION</span>
        </div>
        <p className="dim small">
          Übungsbereich mit einem festen Testfall. Der Anrufer ist <b>simuliert und regelbasiert</b> (keine KI): Er antwortet nur mit den Fakten des Szenarios und erfindet nichts.
          Es wird nichts automatisch übernommen – du trägst alle Angaben selbst in die Maske ein. Kosten entstehen keine.
        </p>
        <SupportInfo support={support} consent={consent} checking={checking} onCheck={check} onWithdraw={async () => {
          if (!(await confirmDialog('Einwilligung widerrufen? Alle gespeicherten Transkripte werden gelöscht.', { confirmLabel: 'Widerrufen', danger: true }))) return;
          withdrawConsent();
          setConsent(null);
        }} />
      </div>
      {consent ? <VoiceSession game={game} consent={consent} support={support} /> : <ConsentCard support={support} onConsent={(m) => setConsent(giveConsent(m))} />}
    </div>
  );
}

function SupportInfo({ support, consent, checking, onCheck, onWithdraw }: { support: SpeechSupport; consent: VoiceConsent | null; checking: boolean; onCheck: () => void; onWithdraw: () => void }) {
  return (
    <div className="row wrap small" data-testid="voice-support">
      <span className={`chip ${support.recognition ? 'ok' : 'warn'}`}>Spracherkennung: {support.recognition ? ON_DEVICE_LABEL[support.onDevice] : 'nicht verfügbar (Texteingabe nutzen)'}</span>
      {support.recognition && support.onDevice !== 'nicht-verfuegbar' && (
        <button className="btn small" disabled={checking} onClick={onCheck} title="Fragt den Browser, ob Deutsch ohne Online-Dienst erkannt werden kann. In seltenen Fällen kann das den Tab zum Absturz bringen.">
          {checking ? 'Prüfe …' : 'Erkennung auf dem Gerät prüfen'}
        </button>
      )}
      <span className={`chip ${support.synthesis ? 'ok' : 'warn'}`}>Sprachausgabe: {support.synthesis ? 'verfügbar' : 'nicht verfügbar (Antworten nur als Text)'}</span>
      {consent && (
        <>
          <span className="chip">Einwilligung: {MODE_LABEL[consent.mode]}</span>
          <button className="btn small ghost" onClick={onWithdraw} data-testid="voice-withdraw">
            Einwilligung widerrufen
          </button>
        </>
      )}
    </div>
  );
}

function ConsentCard({ support, onConsent }: { support: SpeechSupport; onConsent: (m: RecognitionMode) => void }) {
  const onDevice = support.onDevice === 'verfuegbar' || support.onDevice === 'herunterladbar' || support.onDevice === 'wird-geladen';
  const [mode, setMode] = useState<RecognitionMode>('text');
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (onDevice) setMode('geraet');
  }, [onDevice]);
  const option = (m: RecognitionMode, disabled: boolean, text: string) => (
    <label className="check" style={{ opacity: disabled ? 0.5 : 1 }}>
      <input type="radio" name="voice-mode" checked={mode === m} disabled={disabled} onChange={() => setMode(m)} /> <b>{MODE_LABEL[m]}</b>
      <span className="dim small">– {text}</span>
    </label>
  );
  return (
    <div className="card col" style={{ maxWidth: 900 }} data-testid="voice-consent">
      <h3>Einwilligung</h3>
      <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
        <li>Der Sprachtest nutzt die <b>eingebaute Sprachfunktion deines Browsers</b>. LEITWARTE hat keinen eigenen Server und sendet keine Daten.</li>
        <li>
          <b>Spracherkennung:</b> Chrome und Edge schicken deine Sprache normalerweise an den Spracherkennungsdienst des Herstellers (z. B. Google), um sie in Text umzuwandeln. Nur wenn der
          Browser Deutsch <b>auf dem Gerät</b> erkennen kann, bleibt das Audio auf deinem Rechner. Diese Wahl triffst du unten.
        </li>
        <li>
          Das Mikrofon wird erst durch einen Klick auf „Sprechen" (oder Taste M) eingeschaltet und schaltet sich nach deiner Sprechpause, nach einigen Sekunden Stille oder mit „Fertig" wieder
          aus. Im Freisprechmodus schaltet es sich nach jeder Antwort des Anrufers wieder ein, bis das Gespräch endet. Audio wird nicht gespeichert.
        </li>
        <li>
          <b>Sprachausgabe:</b> Der Anrufer spricht über die Stimmen deines Browsers. Manche Stimmen (in Chrome z. B. „Google Deutsch") sind Online-Stimmen; dabei wird nur der Antworttext des
          simulierten Anrufers übertragen. Lokale Stimmen kannst du in der Stimmauswahl wählen.
        </li>
        <li>
          <b>Transkripte</b> (nur Text) werden ausschließlich in diesem Browser gespeichert (localStorage), maximal 30 Gespräche. Du kannst sie einzeln oder alle löschen; der Widerruf der
          Einwilligung löscht sie ebenfalls.
        </li>
      </ul>
      <div className="col" style={{ gap: 6 }}>
        {option('geraet', !onDevice, support.recognition ? `${ON_DEVICE_LABEL[support.onDevice]}${support.onDevice === 'ungeprueft' ? ' – oben „Erkennung auf dem Gerät prüfen“' : ''}` : 'Browser hat keine Spracherkennung')}
        {option('browserdienst', !support.recognition, 'Audio wird vom Browser an seinen Erkennungsdienst gesendet')}
        {option('text', false, 'Du tippst deine Fragen, der Anrufer antwortet trotzdem per Sprachausgabe')}
      </div>
      <label className="check">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} data-testid="voice-consent-check" /> Ich habe die Hinweise gelesen und bin einverstanden.
      </label>
      <div className="row">
        <button className="btn primary" disabled={!ok} onClick={() => onConsent(mode)} data-testid="voice-consent-ok">
          Einverstanden – Sprachtest öffnen
        </button>
      </div>
    </div>
  );
}

interface LiveState {
  call: VoiceCall;
  sim: CallerSim;
  startedAt: number;
  sessionId: string;
}

function VoiceSession({ game, consent, support }: { game: GameState; consent: VoiceConsent; support: SpeechSupport }) {
  const [seed, setSeed] = useState(1);
  const call = useMemo(() => buildVoiceTestCall(game, seed), [game.center, seed]);
  const live = useRef<LiveState | null>(null);
  const [active, setActive] = useState(false);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState('');
  const [typed, setTyped] = useState('');
  const [entry, setEntry] = useState<VoiceEntry>(emptyVoiceEntry);
  const [evaluation, setEvaluation] = useState<VoiceEvaluation | null>(null);
  const [handsFree, setHandsFree] = useState(false);
  const [ttsOn, setTtsOn] = useState(true);
  const [voiceURI, setVoiceURI] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [history, setHistory] = useState<TranscriptSession[]>(() => listTranscripts());
  const [shown, setShown] = useState<TranscriptSession | null>(null);
  const [installing, setInstalling] = useState(false);
  const recognizer = useRef<Recognizer | null>(null);
  const mounted = useRef(true);
  const handsFreeRef = useRef(handsFree);
  handsFreeRef.current = handsFree;
  const logRef = useRef<HTMLDivElement>(null);
  // Aktuelle Werte für Rückrufe der Spracherkennung (die länger leben als ein Render)
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const handleRef = useRef<(t: string) => void>(() => undefined);
  /** Zähler der Gesprächsrunden – veraltete Rückrufe der Sprachausgabe erkennen sich daran */
  const turnSeq = useRef(0);

  const micAllowed = consent.mode !== 'text' && Boolean(support.recognition);
  const onDeviceOnly = consent.mode === 'geraet';

  useEffect(() => {
    mounted.current = true;
    const load = () => setVoices(germanVoices());
    load();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => {
      mounted.current = false;
      recognizer.current?.abort();
      stopSpeaking();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.removeEventListener('voiceschanged', load);
    };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines, interim]);

  const push = (who: TranscriptLine['who'], text: string) => {
    linesRef.current = [...linesRef.current, { who, text, at: Date.now() }];
    setLines(linesRef.current);
  };

  const finish = useCallback(
    (reason: string) => {
      const l = live.current;
      if (!l) return;
      live.current = null;
      turnSeq.current++; // ausstehende Rückrufe der Sprachausgabe ungültig machen
      stopSpeaking();
      setSpeaking(false);
      const rec = recognizer.current;
      recognizer.current = null;
      rec?.abort();
      setListening(false);
      setInterim('');
      setActive(false);
      const endedAt = Date.now();
      const ev = evaluateVoiceTest(game, l.call, entryRef.current, l.sim.asked, (endedAt - l.startedAt) / 1000);
      setEvaluation(ev);
      push('system', reason);
      saveTranscript({ id: l.sessionId, startedAt: l.startedAt, endedAt, scenario: l.call.scenarioName, lines: linesRef.current, score: { score: ev.score, total: ev.total } });
      setHistory(listTranscripts());
    },
    [game],
  );

  const listen = useCallback(() => {
    if (!micAllowed || !live.current) return;
    turnSeq.current++; // eine laufende Antwort gilt als unterbrochen
    stopSpeaking();
    setSpeaking(false);
    setError('');
    // nie zwei Erkenner gleichzeitig
    const old = recognizer.current;
    recognizer.current = null;
    old?.abort();
    // true, solange dieser Erkenner der aktuelle ist (bleibt nach dem regulären Ende für die Textlieferung gesetzt)
    let mine = true;
    const r: Recognizer | null = createRecognizer({
      onDeviceOnly,
      onInterim: (t) => mounted.current && recognizer.current === r && setInterim(t),
      onFinal: (t) => mounted.current && mine && live.current && handleRef.current(t),
      onError: (code, msg) => {
        if (!mounted.current || recognizer.current !== r || code === 'aborted') return;
        if (code === 'no-speech' && handsFreeRef.current) return;
        setError(msg);
        if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture' || code === 'language-not-supported') setHandsFree(false);
      },
      onEnd: () => {
        // spätes Ende eines alten Erkenners ignorieren
        if (!mounted.current || recognizer.current !== r) {
          mine = false;
          return;
        }
        recognizer.current = null;
        setListening(false);
        setInterim('');
      },
    });
    if (!r) {
      setError(onDeviceOnly ? 'Dein Browser kann die Erkennung auf dem Gerät nicht zusichern. Es wird nichts gesendet – nutze die Texteingabe oder ändere die Einwilligung.' : 'Spracherkennung nicht verfügbar.');
      return;
    }
    recognizer.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setError('Spracherkennung konnte nicht gestartet werden.');
    }
  }, [micAllowed, onDeviceOnly]);

  const handleUtterance = (text: string) => {
    const l = live.current;
    if (!l) return;
    // Eine (getippte) Äußerung beendet das Zuhören und unterbricht den Anrufer
    const rec = recognizer.current;
    recognizer.current = null;
    rec?.abort();
    setListening(false);
    setInterim('');
    stopSpeaking();
    const my = ++turnSeq.current;
    push('disponent', text);
    const turn = l.sim.respond(text);
    if (!turn.text) return;
    push('anrufer', turn.text);
    const after = () => {
      if (!mounted.current || live.current !== l) return;
      if (turn.ended) {
        finish('Anrufer hat aufgelegt.');
        return;
      }
      if (turnSeq.current !== my) return; // unterbrochen oder durch eine neuere Antwort ersetzt
      setSpeaking(false);
      if (handsFreeRef.current) listen();
    };
    if (ttsOn && support.synthesis) {
      setSpeaking(true);
      void speakAs(turn.text, personaFor(turn.emotion, l.sim.personality), voiceURI || undefined).then(after);
    } else after();
  };
  handleRef.current = handleUtterance;

  const start = () => {
    stopSpeaking();
    live.current = { call, sim: new CallerSim(call), startedAt: Date.now(), sessionId: `st_${Date.now().toString(36)}` };
    linesRef.current = [{ who: 'system', text: `Notruf angenommen – ${call.caller.phone} (${call.caller.relation}). Melde dich wie am Notrufplatz.`, at: Date.now() }];
    setLines(linesRef.current);
    setEntry(emptyVoiceEntry());
    setEvaluation(null);
    setError('');
    setActive(true);
    if (handsFree) listen();
  };

  const sendTyped = () => {
    const t = typed.trim();
    if (!t || !live.current) return;
    setTyped('');
    handleUtterance(t);
  };

  // Taste M: Sprechen (außerhalb von Eingabefeldern)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'm' && active && !listening) {
        e.preventDefault();
        listen();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [active, listening, listen]);

  const set = (patch: Partial<VoiceEntry>) => setEntry((e) => ({ ...e, ...patch }));

  return (
    <div className="voice-grid">
      <div className="card col voice-talk">
        <div className="row wrap" style={{ alignItems: 'center' }}>
          <h3 className="grow">Gespräch</h3>
          <span className="dim small">Testfall: {call.scenarioName} · Fall Nr. {seed}</span>
        </div>
        <div className="row wrap">
          {!active ? (
            <button className="btn primary" onClick={start} data-testid="voice-start">
              ☎ Anruf annehmen
            </button>
          ) : (
            <>
              <button className={`btn ${listening ? 'alarm' : 'primary'}`} disabled={!micAllowed || listening} onClick={listen} title={micAllowed ? 'Taste M' : 'Mikrofon laut Einwilligung nicht genutzt'} data-testid="voice-mic">
                {listening ? '🎙 Hört zu …' : '🎙 Sprechen (M)'}
              </button>
              {listening && (
                <button className="btn" onClick={() => recognizer.current?.stop()}>
                  Fertig
                </button>
              )}
              <button className="btn danger" onClick={() => finish('Gespräch vom Disponenten beendet.')} data-testid="voice-end">
                Anruf beenden
              </button>
            </>
          )}
          <label className="check small" title="Nach jeder Antwort des Anrufers automatisch wieder zuhören">
            <input type="checkbox" checked={handsFree} disabled={!micAllowed} onChange={(e) => setHandsFree(e.target.checked)} /> Freisprechen
          </label>
          <label className="check small">
            <input type="checkbox" checked={ttsOn} disabled={!support.synthesis} onChange={(e) => setTtsOn(e.target.checked)} /> Anrufer vorlesen
          </label>
          {voices.length > 0 && (
            <select value={voiceURI} onChange={(e) => setVoiceURI(e.target.value)} aria-label="Stimme des Anrufers" className="small">
              <option value="">Standardstimme</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} {v.localService ? '(lokal)' : '(online)'}
                </option>
              ))}
            </select>
          )}
        </div>
        {consent.mode === 'geraet' && support.onDevice !== 'verfuegbar' && support.onDevice !== 'nicht-verfuegbar' && (
          <div className="row small">
            <span className="dim grow">Für die Erkennung auf dem Gerät muss der Browser einmalig das deutsche Sprachpaket laden (falls noch nicht geschehen).</span>
            <button
              className="btn small"
              disabled={installing}
              onClick={async () => {
                setInstalling(true);
                const ok = await installOnDevice();
                setInstalling(false);
                setError(ok ? '' : 'Sprachpaket konnte nicht geladen werden.');
              }}
            >
              {installing ? 'Lädt …' : 'Sprachpaket laden'}
            </button>
          </div>
        )}
        {error && <div className="voice-error small" role="alert">{error}</div>}
        <div className="voice-log" ref={logRef} data-testid="voice-transcript" aria-live="polite">
          {lines.length === 0 && <div className="dim small">Noch kein Gespräch. Mit „Anruf annehmen" beginnt der Testanruf.</div>}
          {lines.map((l, i) => (
            <div key={i} className={`voice-line ${l.who}`}>
              <span className="who">{l.who === 'disponent' ? 'Du' : l.who === 'anrufer' ? 'Anrufer' : '•'}</span>
              <span>{l.text}</span>
            </div>
          ))}
          {interim && (
            <div className="voice-line disponent interim">
              <span className="who">Du</span>
              <span>{interim} …</span>
            </div>
          )}
          {speaking && <div className="dim small">Anrufer spricht …</div>}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            sendTyped();
          }}
        >
          <input
            type="text"
            className="grow"
            placeholder={active ? 'Frage tippen, z. B. „Wo genau ist der Notfallort?"' : 'Erst den Anruf annehmen'}
            value={typed}
            disabled={!active}
            onChange={(e) => setTyped(e.target.value)}
            aria-label="Frage an den Anrufer"
            data-testid="voice-input"
          />
          <button className="btn" disabled={!active || !typed.trim()} data-testid="voice-send">
            Senden
          </button>
        </form>
      </div>

      <div className="card col voice-mask">
        <h3>Einsatzmaske (selbst ausfüllen)</h3>
        <p className="dim small">Nichts wird automatisch übernommen. Die Auswertung vergleicht deine Eingaben nach dem Gespräch mit dem Testfall.</p>
        <div className="form-grid">
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>Straße</span>
            <StreetInput game={game} value={entry.street} onChange={(street, extra) => set({ street, ...(extra?.city ? { city: extra.city } : {}) })} />
          </label>
          <label className="field">
            <span>Hausnummer</span>
            <input type="text" value={entry.houseNumber} onChange={(e) => set({ houseNumber: e.target.value })} aria-label="Hausnummer" />
          </label>
          <label className="field">
            <span>Ort</span>
            <input type="text" value={entry.city} onChange={(e) => set({ city: e.target.value })} aria-label="Ort" />
          </label>
          <label className="field">
            <span>Personen in Gefahr</span>
            <select value={entry.trapped} onChange={(e) => set({ trapped: e.target.value as VoiceEntry['trapped'] })} aria-label="Personen in Gefahr">
              <option value="unbekannt">– unbekannt –</option>
              <option value="ja">ja</option>
              <option value="nein">nein</option>
            </select>
          </label>
          <label className="field">
            <span>Verletzte (Anzahl)</span>
            <input type="number" min={0} value={entry.injured} onChange={(e) => set({ injured: e.target.value })} aria-label="Verletzte" />
          </label>
          {game.center.meldebilder.length > 0 && (
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span>Meldebild</span>
              <MeldebildSelect
                game={game}
                value={entry.meldebildId || null}
                onChange={(id) => {
                  const mb = game.center.meldebilder.find((m) => m.id === id);
                  const kw = mb?.keywordCode ? game.center.keywords.find((k) => k.code === mb.keywordCode) : undefined;
                  set({ meldebildId: id ?? '', ...(kw ? { keywordId: kw.id } : {}) });
                }}
              />
            </label>
          )}
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>Stichwort</span>
            <KeywordSelect game={game} value={entry.keywordId || null} onChange={(id) => set({ keywordId: id ?? '' })} />
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>Notizen</span>
            <textarea rows={3} value={entry.notes} onChange={(e) => set({ notes: e.target.value })} aria-label="Notizen" />
          </label>
        </div>
        {evaluation && (
          <div className="col" data-testid="voice-evaluation">
            <h3>
              Auswertung: {evaluation.score} von {evaluation.total} · Gesprächsdauer {evaluation.durationSeconds} s
            </h3>
            <table className="grid small">
              <thead>
                <tr><th></th><th>Prüfpunkt</th><th>Richtig</th><th>Deine Angabe</th></tr>
              </thead>
              <tbody>
                {evaluation.items.map((it) => (
                  <tr key={it.label}>
                    <td>{it.ok ? '✅' : '❌'}</td>
                    <td>{it.label}</td>
                    <td>{it.expected}</td>
                    <td>{it.given}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row">
              <button className="btn" onClick={() => setEvaluation(null)}>
                Gleichen Anruf wiederholen
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  setSeed((s) => s + 1);
                  setEvaluation(null);
                  setLines([]);
                }}
                data-testid="voice-next"
              >
                Nächster Testanruf
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card col voice-history">
        <div className="row" style={{ alignItems: 'center' }}>
          <h3 className="grow">Gespeicherte Transkripte (nur in diesem Browser)</h3>
          <button
            className="btn small danger"
            disabled={!history.length}
            onClick={async () => {
              if (!(await confirmDialog('Alle Transkripte löschen?', { confirmLabel: 'Alle löschen', danger: true }))) return;
              deleteAllTranscripts();
              setHistory([]);
              setShown(null);
            }}
            data-testid="voice-delete-all"
          >
            Alle löschen
          </button>
        </div>
        {history.length === 0 ? (
          <div className="dim small">Keine Transkripte gespeichert.</div>
        ) : (
          <table className="grid small" data-testid="voice-history">
            <tbody>
              {history.map((s) => (
                <tr key={s.id}>
                  <td>{new Date(s.startedAt).toLocaleString('de-DE')}</td>
                  <td>{s.scenario}</td>
                  <td>{s.score ? `${s.score.score}/${s.score.total}` : ''}</td>
                  <td className="row" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn small" onClick={() => setShown(shown?.id === s.id ? null : s)}>
                      {shown?.id === s.id ? 'Ausblenden' : 'Anzeigen'}
                    </button>
                    <button className="btn small" onClick={() => downloadFile(`sprachtest-${s.id}.txt`, transcriptToText(s), 'text/plain')}>
                      Als Text
                    </button>
                    <button
                      className="btn small danger"
                      onClick={() => {
                        deleteTranscript(s.id);
                        setHistory(listTranscripts());
                        if (shown?.id === s.id) setShown(null);
                      }}
                      data-testid="voice-delete"
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {shown && <pre className="voice-pre small">{transcriptToText(shown)}</pre>}
      </div>
    </div>
  );
}
