import { useEffect, useMemo, useRef, useState } from 'react';
import type { Call, GameState } from '../../../model/types';
import { useDias } from '../../../dias/store';
import { pathMismatch, type DiasNode, type DiasTree } from '../../../dias/model';
import { mapDiasKeyword } from '../../../dias/keywordMap';
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

/** Abfrageverlauf je Notruf (bleibt erhalten, solange die Seite offen ist) */
const progress = new Map<string, Step[]>();

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

export function DiasPanel({ game, call }: { game: GameState; call: Call }) {
  const { tree, ready } = useDias();
  const [steps, setSteps] = useState<Step[]>(() => progress.get(call.id) ?? []);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    setSteps(progress.get(call.id) ?? []);
  }, [call.id]);
  useEffect(() => {
    progress.set(call.id, steps);
  }, [call.id, steps]);

  if (!ready) return <div className="dias small muted">Notrufabfrage wird geladen …</div>;
  if (!tree)
    return (
      <div className="dias small muted" data-testid="dias-missing">
        Keine standardisierte Notrufabfrage importiert – unter <b>Daten &amp; Einstellungen › Notrufabfrage (DIAS)</b> kannst du deinen DIAS-Export laden.
      </div>
    );
  return (
    <div className="dias" data-testid="dias">
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
      {open && <DiasBody game={game} call={call} tree={tree} steps={steps} setSteps={setSteps} />}
    </div>
  );
}

function DiasBody({ game, call, tree, steps, setSteps }: { game: GameState; call: Call; tree: DiasTree; steps: Step[]; setSteps: (s: Step[]) => void }) {
  const currentId = steps.length ? tree.nodes[steps[steps.length - 1].nodeId]?.options[steps[steps.length - 1].option]?.to : tree.root;
  const node: DiasNode | undefined = currentId ? tree.nodes[currentId] : undefined;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('.dias-current')?.scrollIntoView({ block: 'nearest' });
  }, [currentId]);

  const choose = (opt: number) => {
    if (!node || !node.options[opt]?.to) return;
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
    <div className="dias-body" ref={ref} tabIndex={0} onKeyDown={onKey} aria-label="Notrufabfrage – Antwortcode drücken, Rücktaste = zurück">
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
        </ol>
      )}
      {!node ? (
        <div className="field-error small">Folgeschritt fehlt im Mitschnitt – bitte Stichwort selbst wählen.</div>
      ) : node.kind === 'ergebnis' ? (
        <DiasResultView game={game} call={call} node={node} pathText={pathText(tree, steps)} mismatch={pathMismatch(node, steps.map((x) => tree.nodes[x.nodeId]?.options[x.option]?.answerId ?? ''), steps.map((x) => tree.nodes[x.nodeId]?.options[x.option]?.label ?? ''))} />
      ) : node.kind === 'frage' ? (
        <div className="dias-current" data-testid="dias-question">
          <div className="dias-q" dangerouslySetInnerHTML={{ __html: node.html }} />
          <div className="dias-options">
            {node.options.map((o, i) => (
              <button key={i} className="btn dias-opt" disabled={!o.to} onClick={() => choose(i)} title={o.to ? undefined : 'Im Mitschnitt nicht enthalten'} data-testid="dias-option">
                <span className="mono dias-code">{o.code}</span>
                <span className="dias-label">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="dias-current warnbox small">
          <b>{node.question || INCOMPLETE_TEXT[node.kind]}</b>
          <div>
            Dieser Schritt ({INCOMPLETE_TEXT[node.kind]}) ist im importierten Mitschnitt nicht enthalten. Trage die Angabe bei Bedarf unter Hinweise ein und wähle das Stichwort selbst.
          </div>
        </div>
      )}
    </div>
  );
}

function DiasResultView({ game, call, node, pathText, mismatch }: { game: GameState; call: Call; node: DiasNode; pathText: string; mismatch: ReturnType<typeof pathMismatch> }) {
  const res = node.result!;
  const [infos, setInfos] = useState<Set<string>>(new Set());
  const codes = useMemo(() => game.center.keywords.map((k) => k.code), [game.center.keywords]);
  const mapped = res.sections.map((s) => (s.stichwort ? { s, m: mapDiasKeyword(s.stichwort, codes) } : { s, m: null }));
  const target = mapped.find((x) => x.m?.code) ?? null;
  const targetKw = target?.m?.code ? game.center.keywords.find((k) => k.code === target.m!.code) : undefined;
  const notes = mapped.map((x) => x.m?.note).filter((n): n is string => Boolean(n));

  const apply = () => {
    if (targetKw) store.cmd('setCallKeyword', call.id, targetKw.id);
    const meldebild = res.sections.map((s) => s.meldebild).join(' / ');
    const summary = pathText;
    const extra = [...infos].join(', ');
    const remarks = [call.mask.remarks.trim(), `Notrufabfrage: ${summary}`, extra && `Info: ${extra}`].filter(Boolean).join('\n');
    store.cmdQuiet('updateCallMask', call.id, { info: meldebild, remarks });
    store.toast('ok', targetKw ? `Abfrageergebnis übernommen: ${targetKw.code}` : 'Abfrageergebnis übernommen – Stichwort bitte selbst wählen.');
  };

  return (
    <div className="dias-current dias-result" data-testid="dias-result">
      <div className="dias-summary">
        <b>Notrufabfrageergebnis</b>
        <div className="small" data-testid="dias-summary">{pathText}</div>
      </div>
      {mismatch && (
        <div className="warnbox small" data-testid="dias-mismatch">
          <b>Achtung, Ergebnis ungesichert:</b> Diese Ergebnisseite wurde im Mitschnitt über einen anderen Abfrageweg aufgezeichnet (Schritt {mismatch.step}: aufgezeichnet „{mismatch.recorded}“, gewählt „{mismatch.chosen}“).
          Meldebild und Stichwort können deshalb von deinem Fall abweichen – bitte prüfen und ggf. selbst wählen.
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
        {mismatch ? 'Trotzdem übernehmen' : 'In Einsatzmaske übernehmen'}{targetKw ? ` (${targetKw.code})` : ''}
      </button>
    </div>
  );
}
