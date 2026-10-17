import { useMemo, useState } from 'react';
import type { Call, GameState } from '../../../model/types';
import { questionsFor } from '../../../data/questions';
import { CATEGORY_LABELS } from '../../../data/keywords';
import {
  acceptCall,
  askQuestion,
  closeCallWithoutIncident,
  createIncidentFromCall,
  keywordHint,
  linkCallToIncident,
  setCallKeyword,
  updateCallNotes,
} from '../../../sim/engine';
import { distanceMeters, formatKm } from '../../../sim/geo';
import { store } from '../../../store/gameStore';
import { fmtAgo, fmtClock } from '../../components/common';
import { KeywordSelect } from './KeywordSelect';

interface Props {
  game: GameState;
  call: Call;
  onClose: () => void;
  onIncidentCreated: (id: string) => void;
  onShowOnMap: (pos: [number, number]) => void;
}

export function CallTaking({ game, call, onClose, onIncidentCreated, onShowOnMap }: Props) {
  const now = game.runtime.clock.now;
  const [reason, setReason] = useState('');
  const asked = new Set(call.dialog.map((d) => d.questionId));
  const questions = questionsFor(call.category);
  const hint = call.state === 'in_abfrage' ? keywordHint(game, call.id) : null;
  const locationKnown = asked.has('ort');
  const nearby = useMemo(
    () =>
      locationKnown
        ? game.runtime.incidents
            .map((i) => ({ i, d: distanceMeters(i.position, call.location.position) }))
            .filter((x) => x.d < 1500)
            .sort((a, b) => a.d - b.d)
        : [],
    [locationKnown, game.runtime.incidents, call.location.position],
  );

  const run = (fn: (s: GameState) => ReturnType<typeof acceptCall>) => store.run(fn);

  const create = () => {
    const r = run((s) => createIncidentFromCall(s, call.id));
    if (r.ok && r.id) onIncidentCreated(r.id);
  };

  return (
    <div className="window" data-testid="call-window">
      <div className="window-head">
        <span className="chip" style={{ background: '#5a2c14', borderColor: 'var(--call)' }}>☎ Notruf</span>
        <h3 className="grow ellipsis">
          {call.caller.name} <span className="muted small">({call.caller.relation})</span>
        </h3>
        <span className="mono small muted">Eingang {fmtClock(call.receivedAt, true)} · {fmtAgo(now, call.receivedAt)}</span>
        <button className="btn ghost small" onClick={onClose} aria-label="Fenster schließen" title="Schließen (Esc)">✕</button>
      </div>
      <div className="window-body">
        {call.state === 'klingelt' && (
          <div className="col" style={{ alignItems: 'center', padding: 20 }}>
            <div className="muted">Eingehender Notruf – Anrufer wartet seit {fmtAgo(now, call.receivedAt)}</div>
            <button className="btn alarm" style={{ fontSize: 16, padding: '10px 24px' }} onClick={() => run((s) => acceptCall(s, call.id))} autoFocus>
              Notruf annehmen <kbd>N</kbd>
            </button>
          </div>
        )}
        {call.state === 'aufgelegt' && <div className="errbox">Der Anrufer hat aufgelegt, bevor der Notruf angenommen wurde.</div>}
        {call.state !== 'klingelt' && call.state !== 'aufgelegt' && (
          <>
            {call.duplicateOfIncidentId === null && call.redialOf && <div className="warnbox">Anrufer ruft erneut an – der erste Anruf wurde nicht angenommen.</div>}
            <div className="dialog" aria-label="Gesprächsverlauf">
              <div className="bubble dispatcher small">Notruf Feuerwehr und Rettungsdienst. Wo genau ist der Notfallort?</div>
              <div className="bubble caller">{call.opening}</div>
              {call.dialog.map((d) => (
                <div key={d.questionId} className="col" style={{ gap: 4 }}>
                  <div className="bubble dispatcher">{d.question}</div>
                  <div className="bubble caller">{d.answer}</div>
                </div>
              ))}
            </div>

            {call.state === 'in_abfrage' && (
              <>
                <div>
                  <h4 style={{ marginBottom: 6 }}>Abfrage <span className="dim">({CATEGORY_LABELS[call.category]})</span></h4>
                  <div className="question-grid">
                    {questions.map((q) => (
                      <button key={q.id} className={`btn small ${q.id === 'ort' && !locationKnown ? 'primary' : ''}`} disabled={asked.has(q.id)} onClick={() => run((s) => askQuestion(s, call.id, q.id))}>
                        {q.text}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="row wrap" style={{ alignItems: 'flex-start' }}>
                  <div className="col grow" style={{ minWidth: 240 }}>
                    <h4>Einsatzort</h4>
                    {locationKnown ? (
                      <div className="row">
                        <span>
                          <b>{call.location.address}</b>
                          <br />
                          <span className="muted small">{call.location.detail}</span>
                        </span>
                        <button className="btn small" onClick={() => onShowOnMap(call.location.position)}>Karte</button>
                      </div>
                    ) : (
                      <span className="dim">Noch nicht abgefragt.</span>
                    )}
                  </div>
                  <label className="field grow" style={{ minWidth: 240 }}>
                    <span>Notizen (werden in den Einsatz übernommen)</span>
                    <textarea rows={2} value={call.notes} onChange={(e) => store.run((s) => updateCallNotes(s, call.id, e.target.value), { toast: false })} />
                  </label>
                </div>

                <div className="col">
                  <h4>Einsatzstichwort</h4>
                  <KeywordSelect game={game} value={call.keywordId} onChange={(id) => run((s) => setCallKeyword(s, call.id, id))} />
                  {hint && (
                    <div className="hint small">
                      Abfragehilfe:{' '}
                      {hint.noIncident ? (
                        <b>Kein Einsatz erforderlich.</b>
                      ) : hint.keywordId ? (
                        <>
                          Die Angaben passen zu <b>{game.center.keywords.find((k) => k.id === hint.keywordId)?.code}</b> –{' '}
                          {game.center.keywords.find((k) => k.id === hint.keywordId)?.label}{' '}
                          <button className="btn small" onClick={() => run((s) => setCallKeyword(s, call.id, hint.keywordId))}>übernehmen</button>
                        </>
                      ) : (
                        'Kein passendes Stichwort in dieser Leitstelle konfiguriert.'
                      )}
                    </div>
                  )}
                </div>

                {nearby.length > 0 && (
                  <div className="warnbox col">
                    <b>Mögliche Doppelmeldung – laufende Einsätze in der Nähe:</b>
                    {nearby.map(({ i, d }) => {
                      const kw = game.center.keywords.find((k) => k.id === i.keywordId);
                      return (
                        <div key={i.id} className="row">
                          <span className="grow">
                            {kw?.code} · {i.address} <span className="dim">({formatKm(d)})</span>
                          </span>
                          <button className="btn small" onClick={() => run((s) => linkCallToIncident(s, call.id, i.id))}>Mit Einsatz verknüpfen</button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="row wrap" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <button className="btn alarm" onClick={create} disabled={!locationKnown || !call.keywordId} title={!locationKnown ? 'Erst den Einsatzort abfragen' : !call.keywordId ? 'Erst ein Stichwort wählen' : ''}>
                    Einsatz anlegen <kbd>Strg+Enter</kbd>
                  </button>
                  <span className="spacer" />
                  <input type="text" placeholder="Grund (z. B. Fehlanruf)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: 200 }} aria-label="Grund für Beenden ohne Einsatz" />
                  <button className="btn" onClick={() => run((s) => closeCallWithoutIncident(s, call.id, reason))}>Ohne Einsatz beenden</button>
                </div>
              </>
            )}
            {call.state === 'abgeschlossen' && <div className="infobox">Notruf abgeschlossen{call.incidentId ? ' – Einsatz angelegt bzw. verknüpft.' : '.'}</div>}
          </>
        )}
      </div>
    </div>
  );
}
