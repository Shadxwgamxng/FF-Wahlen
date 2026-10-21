import { useEffect, useMemo, useRef, useState } from 'react';
import type { Call, EinsatzMask, GameState, Incident, LatLng } from '../../../model/types';
import { CATEGORY_LABELS } from '../../../data/keywords';
import {
  keywordHint,
  resolveMaskLocation,
} from '../../../sim/engine';
import { distanceMeters, formatKm } from '../../../sim/geo';
import { searchStreets } from '../../../geo/places';
import { emptyMask } from '../../../model/mask';
import { store } from '../../../store/gameStore';
import { confirmDialog, fmtAgo, fmtClock } from '../../components/common';
import { KeywordSelect } from './KeywordSelect';
import { DispoListe, Gespraech, Massnahmen, PolizeiTelefon, Rueckmeldungen } from './MaskPanels';
import { DiasPanel } from './DiasPanel';

/**
 * Einsatzmaske (Einsatzbearbeitung). Öffnet sich beim Annehmen eines Notrufs und bleibt für den
 * daraus entstehenden Einsatz offen: links die Einsatzdaten, rechts Gespräch bzw. Dispoliste,
 * Maßnahmen und Rückmeldungen.
 */

interface Props {
  game: GameState;
  call?: Call;
  incident?: Incident;
  onClose: () => void;
  onIncidentCreated: (id: string) => void;
  onShowOnMap: (pos: LatLng) => void;
  onSelectVehicle: (id: string) => void;
  alarmRequest: number;
}

const STATE_LABEL: Record<Incident['state'], string> = {
  neu: 'UNERLEDIGT',
  disponiert: 'DISPONIERT',
  vor_ort: 'VOR ORT',
  abarbeitung_beendet: 'MASSNAHMEN BEENDET',
  abgeschlossen: 'ABGESCHLOSSEN',
};

export function Maske(p: Props) {
  const { game, call, incident: inc } = p;
  const now = game.runtime.clock.now;
  const kwId = inc?.keywordId ?? call?.keywordId ?? null;
  const kw = game.center.keywords.find((k) => k.id === kwId);

  // Maskenwerte: beim Notruf direkt im Spielzustand, beim Einsatz lokal (Korrektur mit Bestätigung)
  const [incMask, setIncMask] = useState<EinsatzMask>(() => inc?.mask ?? { ...emptyMask(), street: inc?.address ?? '' });
  useEffect(() => {
    if (inc) setIncMask(inc.mask ?? { ...emptyMask(), street: inc.address });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inc?.id]);
  const mask = call && !inc ? call.mask : incMask;
  const setMask = (patch: Partial<EinsatzMask>) => {
    if (call && !inc) store.cmdQuiet('updateCallMask', call.id, patch);
    else setIncMask((m) => ({ ...m, ...patch, ...('street' in patch || 'houseNumber' in patch || 'city' in patch ? { position: null } : {}) }));
  };
  const resolved = useMemo(() => (mask.street ? resolveMaskLocation(game, mask, call ? { street: call.location.street, position: call.location.position } : undefined) : null), [game, mask, call]);
  const addrChanged = inc && JSON.stringify([mask.street, mask.houseNumber, mask.postcode, mask.city, mask.position]) !== JSON.stringify([inc.mask?.street ?? inc.address, inc.mask?.houseNumber ?? '', inc.mask?.postcode ?? '', inc.mask?.city ?? '', inc.mask?.position ?? null]);

  const mode: 'notruf' | 'einsatz' = inc ? 'einsatz' : 'notruf';
  const hint = call && call.state === 'in_abfrage' ? keywordHint(game, call.id) : null;
  const [reason, setReason] = useState('');

  const create = () => {
    if (!call) return;
    const r = store.cmd('createIncidentFromCall', call.id, call.mask);
    if (r.ok && r.id) p.onIncidentCreated(r.id);
  };
  // Strg+Enter in der Maske
  const createRef = useRef(create);
  createRef.current = create;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && mode === 'notruf') {
        e.preventDefault();
        createRef.current();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [mode]);

  const nearby = useMemo(() => {
    if (!call || inc || !resolved || 'error' in resolved) return [];
    return game.runtime.incidents.map((i) => ({ i, d: distanceMeters(i.position, resolved.position) })).filter((x) => x.d < 1500).sort((a, b) => a.d - b.d);
  }, [call, inc, resolved, game.runtime.incidents]);

  const closeInc = async () => {
    if (!inc) return;
    if (inc.vehicleIds.length === 0 && !(await confirmDialog('Einsatz ohne alarmierte Kräfte abschließen (abbrechen)?', { confirmLabel: 'Abschließen' }))) return;
    if (store.cmd('closeIncident', inc.id).ok) p.onClose();
  };

  return (
    <div className="mask" data-testid={mode === 'notruf' ? 'call-window' : 'incident-window'}>
      <div className="mask-head">
        <span className={`chip ${mode === 'notruf' ? 'alarm' : ''}`}>{mode === 'notruf' ? '☎ Notruf' : `Einsatz ${inc!.number}`}</span>
        <b className="mono">{inc ? STATE_LABEL[inc.state] : call!.state === 'klingelt' ? 'KLINGELT' : 'IN ABFRAGE'}</b>
        {kw && <span className="chip">{kw.code} · P{kw.priority} · {CATEGORY_LABELS[kw.category]}</span>}
        <span className="grow" />
        {call && <span className="mono small muted">Eingang {fmtClock(call.receivedAt, true)} ({fmtAgo(now, call.receivedAt)})</span>}
        {inc && <span className="mono small muted">angelegt {fmtClock(inc.createdAt)} · Alarm {inc.firstAlarmAt ? fmtClock(inc.firstAlarmAt) : '–'} · Eintreffen {inc.firstArrivalAt ? fmtClock(inc.firstArrivalAt) : '–'}</span>}
        <button className="btn small" onClick={p.onClose} title="Maske schließen (Esc) – Karte anzeigen">Zur Karte ✕</button>
      </div>

      {call && call.state === 'klingelt' ? (
        <div className="col" style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <div className="muted">Eingehender Notruf – Anrufer wartet seit {fmtAgo(now, call.receivedAt)}</div>
          <button className="btn alarm" style={{ fontSize: 16, padding: '10px 24px' }} onClick={() => store.cmd('acceptCall', call.id)} autoFocus>
            Notruf annehmen <kbd>N</kbd>
          </button>
        </div>
      ) : (
        <div className="mask-body">
          {/* ------------------------------------------------ linke Spalte: Einsatzdaten */}
          <div className="mask-left">
            <fieldset className="mask-box">
              <legend>Mitteiler</legend>
              <div className="mask-grid">
                <label>Name<input type="text" value={mask.callerName} onChange={(e) => setMask({ callerName: e.target.value })} disabled={mode === 'einsatz'} /></label>
                <label>Telefon<input type="text" value={mask.callerPhone} onChange={(e) => setMask({ callerPhone: e.target.value })} disabled={mode === 'einsatz'} /></label>
              </div>
            </fieldset>

            <fieldset className="mask-box">
              <legend>Einsatzort</legend>
              <div className="mask-grid" style={{ gridTemplateColumns: '3fr 1fr' }}>
                <label className="req">Straße<StreetInput game={game} value={mask.street} onChange={(street, extra) => setMask({ street, ...extra })} /></label>
                <label>Nr.<input type="text" value={mask.houseNumber} onChange={(e) => setMask({ houseNumber: e.target.value })} aria-label="Hausnummer" /></label>
                <label>Ort<input type="text" value={mask.city} onChange={(e) => setMask({ city: e.target.value })} aria-label="Ort" /></label>
                <label>PLZ<input type="text" value={mask.postcode} onChange={(e) => setMask({ postcode: e.target.value })} aria-label="Postleitzahl" /></label>
              </div>
              <label className="mask-grid1">Objekt / Zusatz<input type="text" value={mask.object} onChange={(e) => setMask({ object: e.target.value })} placeholder="z. B. 2. OG links, Hinterhaus" /></label>
              <div className="row wrap" style={{ marginTop: 4 }}>
                {resolved && ('error' in resolved ? <span className="field-error small">✗ {resolved.error}</span> : <span className="small" style={{ color: resolved.exact ? 'var(--ok)' : 'var(--warn)' }}>{resolved.exact ? '✓ Adresse gefunden' : '~ Straße gefunden, Hausnummer unbekannt (Straßenmitte)'}</span>)}
                <span className="spacer" />
                {call && mode === 'notruf' && (
                  <>
                    <button className="btn small" onClick={() => store.cmd('startLocating', call.id)} disabled={call.locate?.status === 'laeuft'} data-testid="locate">
                      {call.locate?.status === 'laeuft' ? 'Ortung läuft …' : 'Orten'}
                    </button>
                    {call.locate?.status === 'ok' && <button className="btn small primary" onClick={() => store.cmd('applyLocate', call.id)}>Ortung übernehmen</button>}
                  </>
                )}
                {resolved && !('error' in resolved) && <button className="btn small" onClick={() => p.onShowOnMap(resolved.position)}>Karte</button>}
                {addrChanged && inc && (
                  <button className="btn small warn" onClick={() => store.cmd('correctIncidentLocation', inc.id, mask)}>Adresse korrigieren</button>
                )}
              </div>
              {call?.locate && call.locate.status !== 'laeuft' && <div className={`small ${call.locate.status === 'ok' ? 'muted' : 'field-error'}`}>Ortung ({call.phoneType}): {call.locate.message}</div>}
              {call && <div className="dim small">Anschluss: {call.phoneType === 'festnetz' ? 'Festnetz' : 'Mobilfunk'}</div>}
            </fieldset>

            <fieldset className="mask-box">
              <legend>Ereignis</legend>
              {game.center.meldebilder.length > 0 && (
                <label className="mask-grid1">
                  Meldebild (Verdachtsdiagnose)
                  <MeldebildSelect
                    game={game}
                    value={inc ? (inc.meldebildId ?? null) : (call?.meldebildId ?? null)}
                    disabled={mode === 'einsatz'}
                    onChange={(id) => call && store.cmd('setCallMeldebild', call.id, id)}
                  />
                </label>
              )}
              <label className="mask-grid1 req">
                Stichwort
                <KeywordSelect
                  game={game}
                  value={kwId}
                  onChange={(id) => {
                    if (inc && id) store.cmd('changeIncidentKeyword', inc.id, id);
                    else if (call) store.cmd('setCallKeyword', call.id, id);
                  }}
                />
              </label>
              {hint && (
                <div className="hint small">
                  Abfragehilfe:{' '}
                  {hint.noIncident ? (
                    <b>Kein Einsatz erforderlich.</b>
                  ) : hint.keywordId ? (
                    <>
                      passt zu <b>{game.center.keywords.find((k) => k.id === hint.keywordId)?.code}</b>
                      {hint.meldebildId && <> (Meldebild „{game.center.meldebilder.find((m) => m.id === hint.meldebildId)?.label}“)</>}{' '}
                      <button
                        className="btn small"
                        onClick={() => {
                          if (hint.meldebildId) store.cmd('setCallMeldebild', call!.id, hint.meldebildId);
                          store.cmd('setCallKeyword', call!.id, hint.keywordId);
                        }}
                      >
                        übernehmen
                      </button>
                    </>
                  ) : (
                    'kein passendes Stichwort konfiguriert'
                  )}
                </div>
              )}
              <label className="mask-grid1">Alarmierungstext / Info<input type="text" value={mask.info} onChange={(e) => setMask({ info: e.target.value })} disabled={mode === 'einsatz'} placeholder="Kurzinfo für die Kräfte" /></label>
              {kw && (
                <div className="small muted">
                  Sondersignal: {kw.emergency === false ? 'nein' : 'ja'}
                  {kw.forward && ' · Weiterleitung – es entsteht kein Einsatz'}
                  {kw.exercise && ' · Übungseinsatz'}
                  {kw.infection && ` · Infektionsschutz (${kw.infection === 'hoch' ? 'hochinfektiös' : 'COVID'})`}
                  {kw.note && ` · ${kw.note}`}
                </div>
              )}
            </fieldset>

            <fieldset className="mask-box">
              <legend>Patient / Zielort</legend>
              <div className="mask-grid">
                <label>Patient<input type="text" value={mask.patientName} onChange={(e) => setMask({ patientName: e.target.value })} disabled={mode === 'einsatz'} /></label>
                <label>
                  Zielort (KTP)
                  <select value={mask.targetHospitalId} onChange={(e) => setMask({ targetHospitalId: e.target.value })} disabled={mode === 'einsatz'}>
                    <option value="">–</option>
                    {game.center.hospitals.map((h) => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="mask-box">
              <legend>Hinweise</legend>
              <textarea rows={2} value={mask.remarks} onChange={(e) => setMask({ remarks: e.target.value })} disabled={mode === 'einsatz'} style={{ width: '100%' }} />
            </fieldset>

            {mode === 'notruf' && call && call.state === 'in_abfrage' && (
              <div className="col" style={{ gap: 6 }}>
                {nearby.length > 0 && (
                  <div className="warnbox col small">
                    <b>Mögliche Doppelmeldung:</b>
                    {nearby.map(({ i, d }) => (
                      <div key={i.id} className="row">
                        <span className="grow">{game.center.keywords.find((k) => k.id === i.keywordId)?.code} · {i.address} ({formatKm(d)})</span>
                        <button className="btn small" onClick={() => store.cmd('linkCallToIncident', call.id, i.id)}>Verknüpfen</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="row wrap">
                  {kw?.forward ? (
                    <button className="btn primary" onClick={create} data-testid="create-incident">
                      Weiterleiten <kbd>Strg+Enter</kbd>
                    </button>
                  ) : (
                    <button className="btn alarm" onClick={create} disabled={!call.keywordId || !resolved || 'error' in resolved} data-testid="create-incident">
                      Einsatz anlegen <kbd>Strg+Enter</kbd>
                    </button>
                  )}
                  <span className="spacer" />
                  <input type="text" placeholder="Grund" value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: 140 }} aria-label="Grund für Beenden ohne Einsatz" />
                  <button className="btn" onClick={() => store.cmd('closeCallWithoutIncident', call.id, reason)}>Ohne Einsatz beenden</button>
                </div>
              </div>
            )}
            {mode === 'einsatz' && inc && (
              <div className="row wrap">
                <button className="btn" disabled={inc.activeVehicleIds.length === 0} onClick={() => store.cmd('releaseAllOnScene', inc.id)}>Alle entlassen</button>
                <span className="spacer" />
                <button className="btn primary" onClick={closeInc} disabled={inc.activeVehicleIds.length > 0} data-testid="close-incident">Einsatz abschließen</button>
              </div>
            )}
          </div>

          {/* ------------------------------------------------ rechte Spalte */}
          <div className="mask-right">
            {mode === 'notruf' && call && call.state === 'in_abfrage' && <DiasPanel game={game} call={call} />}
            {mode === 'notruf' && call && <Gespraech game={game} call={call} />}
            {mode === 'einsatz' && inc && (
              <>
                <DispoListe game={game} inc={inc} onSelectVehicle={p.onSelectVehicle} />
                <Massnahmen game={game} inc={inc} alarmRequest={p.alarmRequest} />
                <PolizeiTelefon game={game} inc={inc} />
                <Rueckmeldungen game={game} inc={inc} />
                {call && (
                  <details>
                    <summary className="small muted">Notrufgespräch ({call.dialog.length} Fragen)</summary>
                    <Gespraech game={game} call={call} />
                  </details>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Meldebild-Auswahl mit Suche (CEDUS-Code oder Bezeichnung) */
export function MeldebildSelect({ game, value, onChange, disabled }: { game: GameState; value: string | null; onChange: (id: string | null) => void; disabled?: boolean }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const current = game.center.meldebilder.find((m) => m.id === value);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return game.center.meldebilder.filter((m) => !s || m.label.toLowerCase().includes(s) || m.cedus?.startsWith(s)).slice(0, 40);
  }, [game.center.meldebilder, q]);
  if (disabled) return <input type="text" value={current ? `${current.cedus ? `${current.cedus} · ` : ''}${current.label}` : '–'} disabled />;
  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={open ? q : current ? `${current.cedus ? `${current.cedus} · ` : ''}${current.label}` : q}
        placeholder="Meldebild suchen (Text oder CEDUS) …"
        onFocus={() => {
          setOpen(true);
          setQ('');
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Meldebild"
        data-testid="meldebild-input"
        autoComplete="off"
        style={{ width: '100%' }}
      />
      {open && (
        <div className="suggest" role="listbox">
          {list.map((m) => (
            <div
              key={m.id}
              role="option"
              aria-selected={m.id === value}
              className="suggest-item"
              onMouseDown={(ev) => {
                ev.preventDefault();
                onChange(m.id);
                setOpen(false);
              }}
            >
              {m.cedus && <span className="mono dim">{m.cedus} </span>}
              {m.label} <span className="dim">→ {m.keywordCode || 'kein Vorschlag'}</span>
            </div>
          ))}
          {list.length === 0 && <div className="suggest-item dim">Kein Meldebild gefunden.</div>}
        </div>
      )}
    </div>
  );
}

/** Straßeneingabe mit Vorschlägen aus den echten OSM-Straßen */
export function StreetInput({ game, value, onChange }: { game: GameState; value: string; onChange: (street: string, extra?: Partial<EinsatzMask>) => void }) {
  const [open, setOpen] = useState(false);
  const ix = game.center.places;
  const list = useMemo(() => (ix && open ? searchStreets(ix, value, 12) : []), [ix, value, open]);
  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label="Straße"
        data-testid="street-input"
        autoComplete="off"
        style={{ width: '100%' }}
      />
      {open && list.length > 0 && (
        <div className="suggest" role="listbox">
          {list.map((e) => (
            <div
              key={`${e.street}|${e.city}`}
              role="option"
              aria-selected={false}
              className="suggest-item"
              onMouseDown={(ev) => {
                ev.preventDefault();
                onChange(e.street, { city: e.city, postcode: e.postcode });
                setOpen(false);
              }}
            >
              {e.street} <span className="dim">· {e.postcode} {e.city}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
