import { useEffect, useMemo, useRef, useState } from 'react';
import type { Call, GameState } from '../../../model/types';
import { useDias } from '../../../dias/store';
import { pathMismatch, type DiasNode, type DiasTree } from '../../../dias/model';
import { mapDiasKeyword } from '../../../dias/keywordMap';
import { deriveResult, followUpsFor, gapAt, nextFollowUp, pickKeyword, type Completion, type Gap } from '../../../dias/completion';
import { store } from '../../../store/gameStore';

/**
 * Standardisierte Notrufabfrage (DIAS) in der Einsatzmaske.
 * Zeigt die nächste Frage – der Disponent stellt sie selbst und klickt die Antwort an.
 * Am Ende: Abfrageergebnis mit Meldebild, Alarmstichwort und Infotext zum Übernehmen.
 */

interface Step {
  nodeId: string;
  /** gewählte Antwort (Index in options) */
  option: number;
}

const NO_STEPS: Step[] = [];

/**
 * Infotext aus den tatsächlich gewählten Antworten. (Die im Mitschnitt gespeicherte Zusammenfassung
 * gehört zu dem Weg, auf dem die Ergebnisseite aufgezeichnet wurde – sie kann von diesem Weg abweichen.)
 */
function pathText(tree: DiasTree, steps: Step[]): string {
  return steps
    .map((s) => tree.nodes[s.nodeId]?.options[s.option]?.label ?? '')
    .map((l) => l.replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(', ');
}

const INCOMPLETE_TEXT: Record<string, string> = {
  alter: 'Alterseingabe',
  freitext: 'Freitexteingabe',
  eingabe: 'Sondereingabe',
  koerperschema: 'Körperschema',
  mehrfach: 'Mehrfachauswahl',
  ende: 'Ende des Mitschnitts',
};

export function DiasPanel({ game, call, tablet }: { game: GameState; call: Call; tablet?: boolean }) {
  const { tree, ready } = useDias();
  // Der Abfrageverlauf liegt im Spielzustand (Notruf) und ist so auf PC, Zweitfenstern und Tablet gleich.
  // Lokal wird sofort weitergeschaltet; der geteilte Stand folgt mit kurzer Verzögerung.
  const shared = call.dias?.steps ?? NO_STEPS;
  const sharedComp = call.dias?.completion;
  const sharedKey = JSON.stringify([shared, sharedComp ?? null]);
  const [steps, setLocal] = useState<Step[]>(shared);
  const [completion, setLocalComp] = useState<Completion | undefined>(sharedComp);
  const lastLocal = useRef(0);
  const lastCall = useRef(call.id);
  const latestShared = useRef({ steps: shared, comp: sharedComp });
  latestShared.current = { steps: shared, comp: sharedComp };
  useEffect(() => {
    const switched = lastCall.current !== call.id;
    lastCall.current = call.id;
    const wait = 1500 - (Date.now() - lastLocal.current);
    if (switched || wait <= 0) {
      setLocal(shared);
      setLocalComp(sharedComp);
      return;
    }
    // kurz nach eigener Eingabe: veraltete Zwischenstände nicht übernehmen, danach den neuesten Stand
    const t = setTimeout(() => {
      setLocal(latestShared.current.steps);
      setLocalComp(latestShared.current.comp);
    }, wait);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.id, sharedKey]);
  /** Neuer DIAS-Weg: eine begonnene LEITWARTE-Ergänzung gilt nur für die bisherige Lücke */
  const setSteps = (next: Step[]) => {
    lastLocal.current = Date.now();
    setLocal(next);
    setLocalComp(undefined);
    store.cmdQuiet('setCallDias', call.id, next, null);
  };
  const setCompletion = (c: Completion | undefined) => {
    lastLocal.current = Date.now();
    setLocalComp(c);
    store.cmdQuiet('setCallDias', call.id, steps, c ?? null);
  };
  const [open, setOpen] = useState(true);

  if (!ready) return <div className="dias small muted">Notrufabfrage wird geladen …</div>;
  if (!tree)
    return (
      <div className="dias small muted" data-testid="dias-missing">
        DIAS nicht importiert (Daten &amp; Einstellungen › Notrufabfrage)
      </div>
    );
  return (
    <div className={`dias${tablet ? ' dias-tablet' : ''}`} data-testid="dias">
      <div className="dias-head">
        <b className="grow">DIAS · Standardisierte Notrufabfrage</b>
        {steps.length > 0 && (
          <button className="btn small ghost" onClick={() => setSteps([])} title="Abfrage von vorn beginnen">
            Neu
          </button>
        )}
        <button className="btn small ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? '▾' : '▸'}
        </button>
      </div>
      {open && <DiasBody game={game} call={call} tree={tree} steps={steps} setSteps={setSteps} completion={completion} setCompletion={setCompletion} tablet={tablet} />}
    </div>
  );
}

function DiasBody({
  game,
  call,
  tree,
  steps,
  setSteps,
  completion,
  setCompletion,
  tablet,
}: {
  game: GameState;
  call: Call;
  tree: DiasTree;
  steps: Step[];
  setSteps: (s: Step[]) => void;
  completion: Completion | undefined;
  setCompletion: (c: Completion | undefined) => void;
  tablet?: boolean;
}) {
  const gap = gapAt(tree, steps);
  const currentId = steps.length ? tree.nodes[steps[steps.length - 1].nodeId]?.options[steps[steps.length - 1].option]?.to : tree.root;
  const node: DiasNode | undefined = currentId ? tree.nodes[currentId] : undefined;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('.dias-current')?.scrollIntoView({ block: 'nearest' });
  }, [currentId]);

  const choose = (opt: number) => {
    if (!node || !node.options[opt]) return;
    // auch Antworten ohne aufgezeichnete Folgeseite sind wählbar – danach ergänzt LEITWARTE
    setSteps([...steps, { nodeId: node.id, option: opt }]);
  };

  // Tastatur: Antwortcode drücken (nur wenn die Abfrage den Fokus hat)
  const onKey = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'Backspace' && steps.length) {
      e.preventDefault();
      e.stopPropagation();
      setSteps(steps.slice(0, -1));
      return;
    }
    if (!node || node.kind !== 'frage') return;
    const i = node.options.findIndex((o) => o.code === e.key);
    if (i >= 0) {
      e.preventDefault();
      e.stopPropagation();
      choose(i);
    }
  };

  return (
    <div className="dias-body" ref={ref} tabIndex={0} onKeyDown={onKey} aria-label="Notrufabfrage">
      {steps.length > 0 && (
        <ol className="dias-path">
          {steps.map((s, i) => {
            const n = tree.nodes[s.nodeId];
            return (
              <li key={i}>
                <button className="linklike" onClick={() => setSteps(steps.slice(0, i))} title="Ab hier neu beantworten">
                  <span className="muted">{n?.question}</span> → <b>{n?.options[s.option]?.label}</b>
                </button>
              </li>
            );
          })}
          {completion &&
            followUpsFor(tree, steps)
              .filter((q) => completion.answers[q.id] !== undefined)
              .map((q, i, arr) => (
                <li key={q.id} className="lw-step">
                  <button
                    className="linklike"
                    title="Ab hier neu beantworten"
                    onClick={() => {
                      const keep = Object.fromEntries(arr.slice(0, i).map((x) => [x.id, completion.answers[x.id]]));
                      setCompletion({ ...completion, answers: keep });
                    }}
                  >
                    <span className="lw-badge">LW</span> <span className="muted">{q.text}</span> → <b>{q.options.find((o) => o.v === completion.answers[q.id])?.label}</b>
                  </button>
                </li>
              ))}
        </ol>
      )}
      {gap ? (
        <GapView game={game} call={call} tree={tree} steps={steps} gap={gap} completion={completion} setCompletion={setCompletion} tablet={tablet} />
      ) : !node ? (
        <div className="field-error small">Folgeschritt fehlt im Mitschnitt.</div>
      ) : node.kind === 'ergebnis' ? (
        <DiasResultView game={game} call={call} node={node} tablet={tablet} tree={tree} steps={steps} pathText={pathText(tree, steps)} mismatch={pathMismatch(node, steps.map((x) => tree.nodes[x.nodeId]?.options[x.option]?.answerId ?? ''), steps.map((x) => tree.nodes[x.nodeId]?.options[x.option]?.label ?? ''))} />
      ) : node.kind === 'frage' ? (
        <div className="dias-current" data-testid="dias-question">
          <div className="dias-q" dangerouslySetInnerHTML={{ __html: node.html }} />
          <div className="dias-options">
            {node.options.map((o, i) => (
              <button key={i} className={`btn dias-opt${o.to ? '' : ' lw-gap'}`} onClick={() => choose(i)} title={o.to ? undefined : 'Folgeseite fehlt (LW-Ergänzung)'} data-testid="dias-option">
                <span className="mono dias-code">{o.code}</span>
                <span className="dias-label">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="dias-current warnbox small">
          <b>{node.question || INCOMPLETE_TEXT[node.kind]}</b>
          <div>Nicht im Mitschnitt. Stichwort manuell wählen.</div>
        </div>
      )}
    </div>
  );
}

function DiasResultView({ game, call, node, pathText, mismatch, tablet, tree, steps }: { game: GameState; call: Call; node: DiasNode; pathText: string; mismatch: ReturnType<typeof pathMismatch>; tablet?: boolean; tree: DiasTree; steps: Step[] }) {
  const res = node.result!;
  const [infos, setInfos] = useState<Set<string>>(new Set());
  const codes = useMemo(() => game.center.keywords.map((k) => k.code), [game.center.keywords]);
  const mapped = res.sections.map((s) => (s.stichwort ? { s, m: mapDiasKeyword(s.stichwort, codes) } : { s, m: null }));
  const target = mapped.find((x) => x.m?.code) ?? null;
  const targetKw = target?.m?.code ? game.center.keywords.find((k) => k.code === target.m!.code) : undefined;
  const notes = mapped.map((x) => x.m?.note).filter((n): n is string => Boolean(n));

  const apply = () => {
    const meldebild = res.sections.map((s) => s.meldebild).join(' / ');
    const extra = [...infos].join(', ');
    store.cmdQuiet('applyDiasResult', call.id, { keywordId: targetKw?.id ?? null, info: meldebild, remarks: [`Notrufabfrage: ${pathText}`, extra && `Info: ${extra}`].filter(Boolean) });
    store.toast('ok', targetKw ? `Abfrageergebnis übernommen: ${targetKw.code}` : 'Abfrageergebnis übernommen, ohne Stichwort');
  };

  return (
    <div className="dias-current dias-result" data-testid="dias-result">
      <div className="dias-summary">
        <b>Notrufabfrageergebnis</b>
        <div className="small" data-testid="dias-summary">{pathText}</div>
      </div>
      {mismatch && (
        <div className="warnbox small" data-testid="dias-mismatch">
          <b>Ergebnis ungesichert:</b> Abfrageweg weicht ab (Schritt {mismatch.step}: Mitschnitt „{mismatch.recorded}“, gewählt „{mismatch.chosen}“).
        </div>
      )}
      {res.sections.map((s, i) => (
        <div key={i} className="dias-section">
          <div className="small muted">{s.fach}</div>
          <div>
            Meldebild: <b>{s.meldebild}</b> <span className="mono small muted">({s.code})</span>
          </div>
          <div>
            Alarmstichwort: <b className="mono">{s.stichwort ?? '–'}</b>
            {mapped[i].m?.code && mapped[i].m!.code !== s.stichwort && (
              <span className="small muted">
                {' '}
                → im Katalog: <b className="mono">{mapped[i].m!.code}</b>
              </span>
            )}
          </div>
        </div>
      ))}
      {notes.length > 0 && <div className="small warn-text">{notes.join(' ')}</div>}
      {res.infoIntern.length > 0 && (
        <details>
          <summary className="small">Info intern ({res.infoIntern.length})</summary>
          <div className="dias-infos">
            {res.infoIntern.map((t) => (
              <label key={t} className="check small">
                <input
                  type="checkbox"
                  checked={infos.has(t)}
                  onChange={(e) => {
                    const n = new Set(infos);
                    if (e.target.checked) n.add(t);
                    else n.delete(t);
                    setInfos(n);
                  }}
                />{' '}
                {t}
              </label>
            ))}
          </div>
        </details>
      )}
      {res.infoExtern.length > 0 && <div className="small muted">Info extern: {res.infoExtern.join(', ')}</div>}
      <button className="btn primary" onClick={apply} data-testid="dias-apply">
        {tablet ? (mismatch ? 'Daten trotzdem übernehmen' : 'Daten übernehmen') : mismatch ? 'Trotzdem übernehmen' : 'In Einsatzmaske übernehmen'}
        {targetKw ? ` (${targetKw.code})` : ''}
      </button>
      {mismatch && (
        <div data-testid="lw-alternative">
          <div className="small muted" style={{ margin: '6px 0 2px' }}>
            Alternative (LEITWARTE)
          </div>
          <LwResultView game={game} call={call} tree={tree} steps={steps} completion={{ answers: {} }} tablet={tablet} compact />
        </div>
      )}
    </div>
  );
}

const BODY_PARTS = ['Kopf', 'Gesicht', 'Hals', 'Brust', 'Bauch', 'Rücken', 'Becken', 'Arm links', 'Arm rechts', 'Hand', 'Bein links', 'Bein rechts', 'Fuß', 'ganzer Körper', 'unklar'];

/**
 * Lücke im Mitschnitt: Eingabeschritt, danach LEITWARTE-Folgefragen und LEITWARTE-Ergebnis.
 * Alles hier ist eigene Ergänzung und nicht Teil von DIAS.
 */
function GapView({
  game,
  call,
  tree,
  steps,
  gap,
  completion,
  setCompletion,
  tablet,
}: {
  game: GameState;
  call: Call;
  tree: DiasTree;
  steps: Step[];
  gap: Gap;
  completion: Completion | undefined;
  setCompletion: (c: Completion | undefined) => void;
  tablet?: boolean;
}) {
  const needsInput = gap.kind !== 'fehlt' && gap.kind !== 'ende';
  const header = (
    <div className="lw-note small" data-testid="lw-note">
      <span className="lw-badge">LEITWARTE</span>{' '}
      {gap.kind === 'fehlt' ? 'Folgeseite fehlt im Mitschnitt' : `${INCOMPLETE_TEXT[gap.kind]} fehlt im Mitschnitt`}, Ergänzung ohne DIAS
    </div>
  );
  if (!completion && needsInput) return <GapInput gap={gap} header={header} onDone={(input) => setCompletion({ input, answers: {} })} />;
  const comp = completion ?? { answers: {} };
  const next = nextFollowUp(tree, steps, comp);
  if (next)
    return (
      <div className="dias-current" data-testid="lw-question">
        {header}
        <div className="dias-q">
          <span className="lw-badge">LW</span> {next.text}
        </div>
        <div className="dias-options">
          {next.options.map((o, i) => (
            <button key={o.v} className="btn dias-opt" onClick={() => setCompletion({ ...comp, answers: { ...comp.answers, [next.id]: o.v } })} data-testid="lw-option">
              <span className="mono dias-code">{i}</span>
              <span className="dias-label">{o.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  return (
    <div className="dias-current">
      {header}
      <LwResultView game={game} call={call} tree={tree} steps={steps} completion={comp} tablet={tablet} />
    </div>
  );
}

function GapInput({ gap, header, onDone }: { gap: Gap; header: React.ReactNode; onDone: (input: string) => void }) {
  const [text, setText] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('unbekannt');
  const [parts, setParts] = useState<Set<string>>(new Set());
  const node = gap.node;
  const toggle = (set: Set<string>, v: string, apply: (s: Set<string>) => void) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    apply(n);
  };
  let body: React.ReactNode;
  let value = '';
  if (gap.kind === 'alter') {
    value = `Alter ${age || 'unbekannt'}${age ? ' J.' : ''}, ${sex}`;
    body = (
      <div className="row wrap">
        <label className="field">
          <span>Alter (Jahre)</span>
          <input type="number" min={0} max={120} value={age} onChange={(e) => setAge(e.target.value)} aria-label="Alter" data-testid="lw-age" />
        </label>
        <label className="field">
          <span>Geschlecht</span>
          <select value={sex} onChange={(e) => setSex(e.target.value)} aria-label="Geschlecht">
            <option value="unbekannt">unbekannt</option>
            <option value="männlich">männlich</option>
            <option value="weiblich">weiblich</option>
            <option value="divers">divers</option>
          </select>
        </label>
      </div>
    );
  } else if (gap.kind === 'koerperschema' || (gap.kind === 'mehrfach' && !(node?.options.length ?? 0))) {
    value = parts.size ? `Betroffen: ${[...parts].join(', ')}` : '';
    body = (
      <div className="dias-options">
        {BODY_PARTS.map((p) => (
          <button key={p} className={`btn dias-opt ${parts.has(p) ? 'active' : ''}`} onClick={() => toggle(parts, p, setParts)} aria-pressed={parts.has(p)}>
            <span className="dias-label">{parts.has(p) ? '☑' : '☐'} {p}</span>
          </button>
        ))}
      </div>
    );
  } else if (gap.kind === 'mehrfach') {
    value = parts.size ? [...parts].join(', ') : '';
    body = (
      <div className="dias-options">
        {node!.options.map((o) => (
          <button key={o.label} className={`btn dias-opt ${parts.has(o.label) ? 'active' : ''}`} onClick={() => toggle(parts, o.label, setParts)} aria-pressed={parts.has(o.label)}>
            <span className="dias-label">{parts.has(o.label) ? '☑' : '☐'} {o.label}</span>
          </button>
        ))}
      </div>
    );
  } else {
    value = text;
    body = <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Angabe des Anrufers" aria-label="Angabe" style={{ width: '100%' }} data-testid="lw-text" />;
  }
  return (
    <div className="dias-current" data-testid="lw-input">
      {header}
      <div className="dias-q">{node?.question && node.question !== 'Freitext Eingabe' ? node.question : INCOMPLETE_TEXT[gap.kind]}</div>
      {node?.dialog && gap.kind !== 'freitext' && <div className="small muted">{node.dialog.split('\n').filter(Boolean).slice(0, 6).join(' · ')}</div>}
      {body}
      <div className="row">
        <button className="btn primary" onClick={() => onDone(value)} data-testid="lw-next">
          Weiter
        </button>
        <button className="btn" onClick={() => onDone('')}>
          Überspringen
        </button>
      </div>
    </div>
  );
}

/** LEITWARTE-Ergebnis (aus Weg, Eingabe und Folgefragen abgeleitet) mit Übernahme in die Maske */
function LwResultView({ game, call, tree, steps, completion, tablet, compact }: { game: GameState; call: Call; tree: DiasTree; steps: Step[]; completion: Completion; tablet?: boolean; compact?: boolean }) {
  const res = useMemo(() => deriveResult(tree, steps, completion), [tree, steps, completion]);
  const code = pickKeyword(res.candidates, game.center.keywords.map((k) => k.code));
  const kw = code ? game.center.keywords.find((k) => k.code === code) : undefined;
  const apply = () => {
    store.cmdQuiet('applyDiasResult', call.id, { keywordId: kw?.id ?? null, info: res.meldebild, remarks: [`Notrufabfrage (LEITWARTE-Ergänzung): ${res.info}`] });
    store.toast('ok', kw ? `LEITWARTE-Ergebnis übernommen: ${kw.code}` : 'LEITWARTE-Ergebnis übernommen, ohne Stichwort');
  };
  return (
    <div className="dias-result lw-result" data-testid="lw-result">
      <div className="dias-summary">
        <b>
          <span className="lw-badge">LEITWARTE</span> Ergebnis
        </b>
        {!compact && <div className="small">{res.info}</div>}
      </div>
      <div className="dias-section">
        <div>
          Meldebild: <b>{res.meldebild}</b>
        </div>
        <div>
          Stichwort: <b className="mono">{kw?.code ?? '–'}</b> {kw && <span className="small muted">{kw.label}</span>}
        </div>
        <div className="small muted">Begründung: {res.reasons.join(' · ') || '–'}</div>
      </div>
      <button className="btn primary" onClick={apply} data-testid="lw-apply">
        {tablet ? 'Daten übernehmen' : 'In Einsatzmaske übernehmen'}
        {kw ? ` (${kw.code})` : ''}
      </button>
    </div>
  );
}
