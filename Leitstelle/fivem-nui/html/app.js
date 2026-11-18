/* =====================================================================
   LEITWARTE – Leitplatz-Overlay für FiveM (NUI)
   Reines JavaScript ohne Build-Schritt. Zeigt an, was das Lua-Script schickt
   (siehe SCHNITTSTELLE.md), und meldet Bedienungen per NUI-Callback zurück.
   ===================================================================== */
(() => {
  'use strict';

  // ------------------------------------------------------------ Zustand
  /** Daten vom Server (Lua) – Aufbau siehe SCHNITTSTELLE.md */
  let S = {
    center: 'Leitstelle',
    dispatcher: '',
    clock: null,
    calls: [],
    incidents: [],
    units: [],
    stations: [],
    keywords: [],
    hospitals: [],
    radio: { groups: [], requests: [], log: [] },
  };
  /** Nur in der Oberfläche */
  const ui = {
    open: false,
    view: 'leitstand',
    sel: null, // { kind: 'call' | 'incident', id }
    picked: new Set(), // ausgewählte Vorschläge (Alarmierung)
    closedSecs: new Set(),
    filter: 'alle',
    query: '',
    unitId: null,
    ptt: false,
    draft: {}, // Maskenwerte, die noch nicht gespeichert sind
  };

  const RESOURCE = typeof GetParentResourceName === 'function' ? GetParentResourceName() : null;

  /** Bedienung an das Lua-Script melden (RegisterNUICallback) */
  async function post(name, data = {}) {
    if (!RESOURCE) return window.LW_DEMO ? window.LW_DEMO(name, data) : { ok: true };
    try {
      const r = await fetch(`https://${RESOURCE}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(data) });
      return await r.json().catch(() => ({ ok: true }));
    } catch {
      return { ok: false };
    }
  }

  // ------------------------------------------------------------ Hilfen
  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const style = () => document.documentElement.dataset.style || 'klassisch';
  const call = (id) => S.calls.find((c) => c.id === id);
  const incident = (id) => S.incidents.find((i) => i.id === id);
  const unit = (id) => S.units.find((u) => u.id === id);
  const station = (id) => S.stations.find((s) => s.id === id);
  const kw = (id) => S.keywords.find((k) => k.id === id);

  /** Statusfarben je Stil: Klassisch wie auf dem Wachentableau, Modern farbig auf dunkel */
  const STATUS = {
    klassisch: { 1: ['#97ff9b', '#000'], 2: ['#ffffff', '#000'], A: ['#ffb3e6', '#000'], 3: ['#ffff00', '#000'], 4: ['#ff6665', '#fff'], 5: ['#ffa53b', '#000'], 6: ['#000000', '#e8e84a'], 7: ['#989898', '#fff'], 8: ['#9cc8ff', '#000'] },
    modern: { 1: ['#30a46c', '#0b0f14'], 2: ['#46a758', '#0b0f14'], A: ['#ffb224', '#0b0f14'], 3: ['#f76b15', '#0b0f14'], 4: ['#e5484d', '#0b0f14'], 5: ['#f5d90a', '#0b0f14'], 6: ['#6f6f6f', '#0b0f14'], 7: ['#8e4ec6', '#0b0f14'], 8: ['#3e63dd', '#0b0f14'] },
  };
  const STATUS_TEXT = { 1: 'Einsatzbereit über Funk', 2: 'Einsatzbereit auf Wache', A: 'Alarmiert', 3: 'Einsatz übernommen / Anfahrt', 4: 'Am Einsatzort', 5: 'Sprechwunsch', 6: 'Nicht einsatzbereit', 7: 'Patient aufgenommen / Transport', 8: 'Am Transportziel' };
  const sc = (code) => STATUS[style()][code] || ['#888', '#000'];
  const stBadge = (code) => {
    const [bg, fg] = sc(code);
    return `<span class="st" style="background:${bg};color:${fg}" title="${esc(code)} – ${esc(STATUS_TEXT[code] || '')}">${esc(code)}</span>`;
  };
  const STATE = { neu: 'UNERLEDIGT', disponiert: 'DISPONIERT', vor_ort: 'VOR ORT', beendet: 'MASSNAHMEN BEENDET' };
  const clock = () => S.clock || new Date().toLocaleTimeString('de-DE');

  function toast(text, kind = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    $('#toasts').append(el);
    setTimeout(() => el.remove(), 4000);
  }

  // ------------------------------------------------------------ Zeichnen
  function render() {
    const root = $('#lw');
    root.classList.toggle('hidden', !ui.open);
    if (!ui.open) return;
    // Eingaben mit Fokus nicht neu zeichnen (sonst springt der Cursor)
    const focus = document.activeElement && root.contains(document.activeElement) ? document.activeElement.id : null;
    root.innerHTML = titlebar() + topbar() + nav() + `<main class="view">${ui.view === 'leitstand' ? desk() : ui.view === 'tableau' ? tableau() : funk()}</main>` + statusbar();
    if (focus) {
      const el = document.getElementById(focus);
      if (el) {
        el.focus();
        if (el.setSelectionRange && typeof el.value === 'string') el.setSelectionRange(el.value.length, el.value.length);
      }
    }
  }

  const titlebar = () => `
    <div class="titlebar">
      <span class="brand">LEITWARTE</span>
      <span class="muted">${esc(S.center)}</span>
      <span class="spacer"></span>
      <button class="btn small ${style() === 'klassisch' ? 'active' : ''}" data-act="style" data-v="klassisch">Klassisch</button>
      <button class="btn small ${style() === 'modern' ? 'active' : ''}" data-act="style" data-v="modern">Modern</button>
      <button class="x" data-act="close" title="Schließen (Esc)">✕</button>
    </div>`;

  function topbar() {
    const ringing = S.calls.filter((c) => c.state === 'klingelt').length;
    const open = S.incidents.filter((i) => i.state === 'neu').length;
    const req = S.radio.requests.length;
    const free = S.units.filter((u) => u.status === '1' || u.status === '2').length;
    return `
    <div class="topbar">
      <span class="clock" id="lw-clock">${esc(clock())}</span>
      <span class="spacer"></span>
      <span class="tb-field ${ringing ? 'alarm' : ''}">Notrufe <b>${ringing}</b></span>
      <span class="tb-field ${open ? 'warn' : ''}">Offene Einsätze <b>${open}</b></span>
      <span class="tb-field ${req ? 'warn' : ''}">Sprechwünsche <b>${req}</b></span>
      <span class="tb-field">Fahrzeuge frei <b>${free}/${S.units.length}</b></span>
    </div>`;
  }

  const nav = () => `
    <nav class="nav">
      ${[['leitstand', 'Leitstand'], ['tableau', 'Wachentableau'], ['funk', 'Funk']].map(([k, l]) => `<button class="${ui.view === k ? 'active' : ''}" data-act="view" data-v="${k}">${l}${k === 'funk' && S.radio.requests.length ? ` (${S.radio.requests.length})` : ''}</button>`).join('')}
    </nav>`;

  const statusbar = () => `
    <div class="statusbar">
      <span>${esc(S.dispatcher || 'Disponent')}</span>
      <span>${esc(S.center)}</span>
      <span class="spacer" style="border:none"></span>
      <span><kbd>F2</kbd>Notruf annehmen</span>
      <span><kbd>F3</kbd>nächster Einsatz</span>
      <span><kbd>A</kbd>Alarmieren</span>
      <span><kbd>Esc</kbd>Schließen</span>
    </div>`;

  // ---------- Leitstand: links Listen, rechts Maske
  function desk() {
    return `<div class="desk">
      <div class="left">${callList()}${incidentList()}</div>
      ${ui.sel ? maske() : `<div class="mask"><div class="empty" style="margin:auto">Notruf oder Einsatz links auswählen.</div></div>`}
    </div>`;
  }

  function callList() {
    const rows = S.calls
      .map((c) => {
        const sel = ui.sel?.kind === 'call' && ui.sel.id === c.id;
        return `<div class="item ${c.state === 'klingelt' ? 'ringing' : ''} ${sel ? 'sel' : ''}" data-act="selCall" data-id="${esc(c.id)}">
          <span>${c.state === 'klingelt' ? '☎' : '◉'}</span>
          <div class="grow"><b>${c.state === 'klingelt' ? 'Eingehender Notruf' : `In Abfrage – ${esc(c.callerName || 'Anrufer')}`}</b>
          <div class="small muted ellipsis">${esc(c.preview || c.phone || '')}</div></div>
          <span class="mono small">${esc(c.since || '')}</span></div>`;
      })
      .join('');
    return `<section class="panel"><div class="panel-head"><h4>Notrufe</h4><span class="count ${S.calls.some((c) => c.state === 'klingelt') ? 'alarm' : ''}">${S.calls.length}</span></div>
      <div class="panel-body" style="max-height:30vh">${rows || '<div class="empty">Keine Notrufe.</div>'}</div></section>`;
  }

  function incidentList() {
    const list = [...S.incidents].sort((a, b) => (a.priority || 3) - (b.priority || 3));
    const rows = list
      .map((i) => {
        const sel = ui.sel?.kind === 'incident' && ui.sel.id === i.id;
        const k = kw(i.keywordId);
        const bound = (i.units || []).length;
        return `<div class="item ${sel ? 'sel' : ''}" data-act="selIncident" data-id="${esc(i.id)}">
          <span class="prio prio-${i.priority || 3}"></span>
          <div class="grow"><b class="mono">${esc(k?.code || i.keyword || '')}</b> <span class="small">${esc(k?.label || i.keywordText || '')}</span>
          <div class="small ellipsis">${esc(i.address || '')}</div>
          <div class="small ${i.state === 'neu' ? 'err' : 'muted'}">${i.state === 'neu' ? '⚠ nicht disponiert' : esc(STATE[i.state] || i.state)} · ${bound} EM</div></div>
          <span class="mono small">${esc(i.createdAt || '')}</span></div>`;
      })
      .join('');
    return `<section class="panel fill"><div class="panel-head"><h4>Laufende Einsätze</h4><button class="btn small" data-act="newIncident">+ Einsatz</button><span class="count">${S.incidents.length}</span></div>
      <div class="panel-body">${rows || '<div class="empty">Keine laufenden Einsätze.</div>'}</div></section>`;
  }

  // ---------- Einsatzmaske
  function field(id, label, value, opts = {}) {
    const v = ui.draft[id] ?? value ?? '';
    const cls = opts.req && !String(v).trim() ? 'req-empty' : '';
    return `<label for="f-${id}">${esc(label)}</label><input type="text" id="f-${id}" data-field="${id}" value="${esc(v)}" class="${cls}" ${opts.ro ? 'readonly' : ''} placeholder="${esc(opts.ph || '')}">`;
  }
  function pair(idA, la, va, idB, vb, opts = {}) {
    const a = ui.draft[idA] ?? va ?? '';
    const b = ui.draft[idB] ?? vb ?? '';
    return `<label for="f-${idA}">${esc(la)}</label><div class="pair">
      <input type="text" id="f-${idA}" data-field="${idA}" value="${esc(a)}" class="${opts.req && !String(a).trim() ? 'req-empty' : ''}">
      <input type="text" id="f-${idB}" data-field="${idB}" value="${esc(b)}" aria-label="${esc(opts.lb || '')}" placeholder="${esc(opts.lb || '')}"></div>`;
  }
  const sec = (id, title, body) => `<section class="sec ${ui.closedSecs.has(id) ? 'closed' : ''}"><div class="sec-head" data-act="toggleSec" data-id="${id}">${esc(title)}:</div><div class="sec-body">${body}</div></section>`;

  function maske() {
    const isCall = ui.sel.kind === 'call';
    const c = isCall ? call(ui.sel.id) : null;
    const i = isCall ? null : incident(ui.sel.id);
    const d = c || i;
    if (!d) return `<div class="mask"><div class="empty" style="margin:auto">Nicht mehr vorhanden.</div></div>`;
    if (c && c.state === 'klingelt')
      return `<div class="mask"><div class="ringing-card"><div class="muted">Notruf wartet seit ${esc(c.since || '')}</div>
        <button class="btn alarm" data-act="acceptCall" data-id="${esc(c.id)}">Notruf annehmen</button><div class="small dim">${esc(c.phone || '')}</div></div></div>`;
    const k = kw(ui.draft.keywordId ?? d.keywordId);
    const head = `<div class="mask-head">
      ${isCall ? '<span class="chip alarm">☎ Notruf</span><b class="mono">IN ABFRAGE</b>' : `<span class="chip">Einsatz ${esc(i.number || i.id)}</span><b class="mono">${esc(STATE[i.state] || '')}</b>`}
      ${k ? `<span class="chip">${esc(k.code)} · P${esc(k.priority || '')}</span>` : ''}
      <span class="spacer"></span>
      <span class="mono small muted">${isCall ? `Eingang ${esc(c.receivedAt || '')}` : `angelegt ${esc(i.createdAt || '')} · Alarm ${esc(i.alarmAt || '–')} · Eintreffen ${esc(i.arrivalAt || '–')}`}</span>
      <button class="btn small" data-act="deselect">Schließen ✕</button></div>`;
    const tools = `<div class="toolbar">
      ${isCall ? `<button class="ico" title="Einsatz anlegen" data-act="createIncident">⎙</button>` : `<button class="ico" title="Änderungen speichern" data-act="saveIncident">⎙</button>`}
      <button class="ico" title="Einsatzort auf der Karte (Wegpunkt)" data-act="waypoint">⌖</button>
      ${isCall ? '' : `<button class="ico" title="Alle Einsatzmittel entlassen" data-act="releaseAll">⇤</button>`}
      <span class="sep"></span><span class="small muted">${k ? `${esc(k.code)} – ${esc(k.label)}` : 'kein Stichwort'}</span><span class="spacer"></span>
      ${isCall ? `<button class="btn small" data-act="endCall">Ohne Einsatz beenden</button>` : `<button class="ico" title="Einsatz abschließen" data-act="closeIncident">✓</button>`}</div>`;
    const kwOpts = `<option value="">– Stichwort wählen –</option>${S.keywords.map((x) => `<option value="${esc(x.id)}" ${x.id === (ui.draft.keywordId ?? d.keywordId) ? 'selected' : ''}>${esc(x.code)} – ${esc(x.label)}</option>`).join('')}`;
    const kwSet = ui.draft.keywordId ?? d.keywordId;
    const left = `<div class="mask-left">
      ${sec('ort', 'Einsatzort', pair('street', 'Straße/Hausnr.', d.street, 'houseNumber', d.houseNumber, { req: true, lb: 'Nr.' }) + pair('city', 'Ort/PLZ', d.city, 'postcode', d.postcode, { lb: 'PLZ' }) + field('object', 'Objekt/Zusatz', d.object, { ph: 'z. B. 2. OG links' }))}
      ${sec('anrufer', 'Anruferdaten', field('callerName', 'Name', d.callerName) + field('phone', 'Telefon/Rückruf', d.phone, { req: isCall }))}
      ${sec('anlass', 'Einsatzanlass', `${field('meldebild', 'Meldebild', d.meldebild)}<label for="f-keywordId">Stichwort</label><select id="f-keywordId" data-field="keywordId" class="${kwSet ? '' : 'req-empty'}">${kwOpts}</select>${field('info', 'Bemerkung extern', d.info)}${field('notes', 'Bemerkung intern', d.notes)}`)}
      ${S.hospitals.length ? sec('ziel', 'Zielort', `<label for="f-hospital">Klinik</label><select id="f-hospital" data-field="hospitalId"><option value="">–</option>${S.hospitals.map((h) => `<option value="${esc(h.id)}" ${h.id === (ui.draft.hospitalId ?? d.hospitalId) ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select>`) : ''}
      ${isCall ? `<div class="row"><button class="btn alarm" data-act="createIncident" ${kwSet ? '' : 'disabled'}>Einsatz anlegen</button><span class="spacer"></span><button class="btn" data-act="endCall">Ohne Einsatz beenden</button></div>` : `<div class="row"><button class="btn" data-act="releaseAll">Alle entlassen</button><span class="spacer"></span><button class="btn primary" data-act="closeIncident">Einsatz abschließen</button></div>`}
    </div>`;
    const right = isCall ? `<div class="mask-right">${gespraech(c)}</div>` : `<div class="mask-right">${emittel(i, 'R')}${emittel(i, 'F')}${massnahmen(i)}${meldungen(i)}${i.dialog?.length ? gespraech(i) : ''}</div>`;
    return `<div class="mask">${head}${tools}<div class="mask-body">${left}${right}</div></div>`;
  }

  function gespraech(d) {
    const lines = (d.dialog || []).map((m) => `<div class="bubble ${m.from === 'disp' ? 'disp' : 'caller'}"><span class="small dim">${esc(m.time || '')}</span> ${esc(m.text)}</div>`).join('');
    return `<div class="tile span2"><span class="tile-tab">Gesprächsverlauf${d.callerName ? ` · ${esc(d.callerName)}` : ''}</span>
      <div class="tile-body" style="min-height:220px;max-height:46vh">${lines || '<div class="empty">Noch nichts gesagt.</div>'}</div>
      <form class="row" data-act="sendMessage"><input type="text" id="f-msg" class="grow" placeholder="Nachricht an den Anrufer …"><button class="btn small" type="submit">Senden</button></form></div>`;
  }

  /** R = Rettungsdienst, F = Feuerwehr und übrige (wie im klassischen Einsatzleitsystem getrennt) */
  function emittel(i, kind) {
    const ids = (i.units || []).filter((id) => (unit(id)?.group === 'rd') === (kind === 'R'));
    const rows = ids
      .map((id) => {
        const u = unit(id);
        if (!u) return '';
        return `<tr><td>${stBadge(u.status)}</td><td>${esc(u.callsign)}</td><td>${esc(u.type || '')}</td><td class="mono small">${esc(u.alarmAt || '')}</td><td class="mono small">${esc(u.statusTime || '')}</td>
          <td><button class="btn small" data-act="releaseUnit" data-id="${esc(u.id)}">Entlassen</button></td></tr>`;
      })
      .join('');
    const on = ids.filter((id) => ['3', '4', '7', '8'].includes(unit(id)?.status)).length;
    return `<div class="tile"><span class="tile-tab">${kind} E-Mittel</span><div class="info"><b>Stärke: ${on}</b> <span class="dim">(${ids.length} alarmiert)</span></div>
      <div class="tile-body"><table class="grid"><thead><tr><th>St</th><th>Einsatzmittel</th><th>Typ</th><th>Alarm</th><th>Zeit</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="empty">Keine Einsatzmittel.</td></tr>'}</tbody></table></div></div>`;
  }

  /** Vorschlag/Alarmierung: Alarmgruppen (AG), Erkundungsgruppen (EG), Fahrzeuge (FZG) – vom Server berechnet */
  function massnahmen(i) {
    const q = ui.query.trim().toLowerCase();
    const list = (i.suggestion || []).filter((s) => !q || `${s.name} ${s.types || ''}`.toLowerCase().includes(q));
    const groups = [['EG', 'Erkundungsgruppen'], ['AG', 'Alarmgruppen'], ['FZG', 'Fahrzeuge']];
    const rows = groups
      .map(([kind, title]) => {
        const items = list.filter((s) => (s.kind || 'FZG') === kind);
        if (!items.length) return '';
        return `<tr class="group"><td colspan="6">${title}</td></tr>` + items
          .map((s) => `<tr class="${ui.picked.has(s.id) ? 'sel' : ''}"><td><input type="checkbox" data-act="pick" data-id="${esc(s.id)}" ${ui.picked.has(s.id) ? 'checked' : ''} ${s.available === false ? 'disabled' : ''}></td>
            <td><span class="tag">${esc(kind)}</span>${esc(s.name)}</td><td class="small">${esc(s.types || '')}</td><td class="mono small">${esc(s.eta || '')}</td><td class="mono small">${esc(s.dist || '')}</td>
            <td class="small ${s.proposed ? 'ok' : 'dim'}">${s.proposed ? `Vorschlag${s.hint ? `: ${esc(s.hint)}` : ''}` : esc(s.hint || '')}</td></tr>`)
          .join('');
      })
      .join('');
    return `<div class="tile span2"><span class="tile-tab">Maßnahmen</span>
      ${i.open ? `<div class="info">Offen: <b>${esc(i.open)}</b></div>` : '<div class="info dim">AAO gedeckt.</div>'}
      <div class="row wrap"><button class="btn alarm" data-act="alarm" ${ui.picked.size ? '' : 'disabled'}>Alarmieren (${ui.picked.size})</button>
      <button class="btn small" data-act="proposal">Vorschlag</button><button class="btn small" data-act="clearPick">Leeren</button>
      <input type="text" id="f-query" class="grow" data-act="query" placeholder="Fahrzeug, Wehr oder Alarmgruppe suchen …" value="${esc(ui.query)}"></div>
      <div class="tile-body" style="max-height:32vh"><table class="grid"><thead><tr><th></th><th>Alarmgruppe / Fahrzeug</th><th>Typ</th><th>ETA</th><th>Entf.</th><th>Hinweis</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="empty">Kein Vorschlag.</td></tr>'}</tbody></table></div></div>`;
  }

  function meldungen(i) {
    const req = S.radio.requests.filter((r) => r.incidentId === i.id);
    const reqs = req.map((r) => `<div class="request">${stBadge('5')}<b>${esc(unit(r.unitId)?.callsign || '')}:</b><span class="grow">${esc(r.text || 'Sprechwunsch')}</span><button class="btn small primary" data-act="answerRequest" data-id="${esc(r.id)}">Ansprechen</button></div>`).join('');
    const log = [...(i.messages || [])].reverse().map((m) => `<div class="log"><span class="t">${esc(m.time || '')}</span><span>${esc(m.text)}</span></div>`).join('');
    return `<div class="tile"><span class="tile-tab">Meldungen</span><div class="tile-body" style="max-height:28vh">${reqs}${log || '<div class="empty">Keine Meldungen.</div>'}</div></div>`;
  }

  // ---------- Wachentableau
  const FILTER = [['alle', 'Alle Einsatzmittel'], ['fw', 'Feuerwehr'], ['rd', 'Rettungsdienst'], ['kats', 'Katastrophenschutz / THW']];
  function tableau() {
    const units = S.units.filter((u) => ui.filter === 'alle' || u.group === ui.filter);
    const byStation = new Map();
    for (const u of units) byStation.set(u.stationId, [...(byStation.get(u.stationId) || []), u]);
    const blocks = [...byStation.entries()]
      .map(([sid, us]) => `<table class="tb"><thead><tr><th colspan="2" class="ellipsis" title="${esc(station(sid)?.name || sid)}">${esc(station(sid)?.name || sid)}</th><th class="i">I</th><th class="z">Zeit</th></tr></thead><tbody>
        ${us.map((u) => {
          const [bg, fg] = sc(u.status);
          return `<tr data-act="unit" data-id="${esc(u.id)}" title="${esc(u.callsign)} · ${esc(u.type || '')} · ${esc(STATUS_TEXT[u.status] || '')}"><td class="n" style="background:${bg};color:${fg}">${esc(u.short || u.callsign)}</td><td class="s" style="background:${bg};color:${fg}">${esc(u.status)}</td><td class="i">${u.incidentId ? '●' : ''}</td><td class="z">${esc(u.statusTime || '')}</td></tr>`;
        }).join('')}</tbody></table>`)
      .join('');
    const legend = ['1', '2', 'A', '3', '4', '5', '7', '8', '6'].map((c) => {
      const [bg, fg] = sc(c);
      return `<span style="background:${bg};color:${fg}" title="${esc(STATUS_TEXT[c])}">${c}</span>`;
    }).join('');
    const u = ui.unitId ? unit(ui.unitId) : null;
    return `<div class="tableau"><div class="tableau-bar"><label class="row small">ausgewählte Anzeige:
      <select data-act="filter">${FILTER.map(([k, l]) => `<option value="${k}" ${ui.filter === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${u ? `<span class="chip">${stBadge(u.status)} ${esc(u.callsign)} · ${esc(u.type || '')}</span>${u.incidentId ? `<button class="btn small" data-act="selIncident" data-id="${esc(u.incidentId)}">Zum Einsatz</button>` : ''}` : ''}
      <span class="spacer"></span><span class="legend small">${legend}</span></div>
      <div class="tableau-body"><div class="tableau-cols">${blocks || '<div class="empty">Keine Einsatzmittel.</div>'}</div></div></div>`;
  }

  // ---------- Funk
  function funk() {
    const groups = S.radio.groups.map((g) => `<div class="group ${g.active ? 'active' : ''}" data-act="radioGroup" data-id="${esc(g.code)}"><b>${esc(g.code)}</b><span class="small muted">${esc(g.name || '')}</span>${g.waiting ? `<span class="badge">${g.waiting}</span>` : ''}</div>`).join('');
    const active = S.radio.groups.find((g) => g.active);
    const reqs = S.radio.requests.map((r) => `<div class="request">${stBadge('5')}<span class="mono small">${esc(r.time || '')}</span><b>${esc(unit(r.unitId)?.callsign || '')}</b><span class="grow small">${esc(r.text || 'Sprechwunsch')}</span><button class="btn small primary" data-act="answerRequest" data-id="${esc(r.id)}">Ansprechen</button></div>`).join('');
    const log = [...S.radio.log].reverse().map((m) => `<div class="log"><span class="t">${esc(m.time || '')}</span><span><b>${esc(m.from || '')}</b> ${esc(m.text)}</span></div>`).join('');
    return `<div class="funk">
      <section class="panel"><div class="panel-head"><h4>Rufgruppe</h4></div><div class="groups">${groups || '<div class="empty">Keine Rufgruppen.</div>'}</div>
        <button class="ptt ${ui.ptt ? 'down' : ''}" data-act="ptt" ${active ? '' : 'disabled'}>${ui.ptt ? 'Senden …' : active ? `Senden (${esc(active.code)})` : 'Keine Rufgruppe'}</button>
        <form class="row" style="margin:0 8px 8px" data-act="sendRadio"><input type="text" id="f-radio" class="grow" placeholder="Funkspruch schreiben …"><button class="btn small" type="submit">Senden</button></form></section>
      <section class="panel"><div class="panel-head"><h4>Sprechwünsche</h4><span class="count ${S.radio.requests.length ? 'alarm' : ''}">${S.radio.requests.length}</span></div><div class="panel-body">${reqs || '<div class="empty">Keine offenen Sprechwünsche.</div>'}</div></section>
      <section class="panel"><div class="panel-head"><h4>Funkprotokoll</h4></div><div class="panel-body">${log || '<div class="empty">Noch kein Funkverkehr.</div>'}</div></section>
    </div>`;
  }

  // ------------------------------------------------------------ Bedienung
  function selected() {
    if (!ui.sel) return null;
    return ui.sel.kind === 'call' ? call(ui.sel.id) : incident(ui.sel.id);
  }
  function maskData() {
    const d = selected() || {};
    const keys = ['street', 'houseNumber', 'city', 'postcode', 'object', 'callerName', 'phone', 'meldebild', 'keywordId', 'info', 'notes', 'hospitalId'];
    return Object.fromEntries(keys.map((k) => [k, ui.draft[k] ?? d[k] ?? '']));
  }
  function select(kind, id) {
    ui.sel = { kind, id };
    ui.draft = {};
    ui.picked = new Set();
    ui.query = '';
    ui.view = 'leitstand';
    if (kind === 'incident') {
      // Vorschlag des Servers vorauswählen
      for (const s of incident(id)?.suggestion || []) if (s.proposed && s.available !== false) ui.picked.add(s.id);
      post('openIncident', { incidentId: id });
    } else post('openCall', { callId: id });
  }

  const ACTIONS = {
    close: () => post('close'),
    style: (el) => {
      document.documentElement.dataset.style = el.dataset.v;
      post('setStyle', { style: el.dataset.v });
    },
    view: (el) => (ui.view = el.dataset.v),
    selCall: (el) => select('call', el.dataset.id),
    selIncident: (el) => select('incident', el.dataset.id),
    deselect: () => (ui.sel = null),
    toggleSec: (el) => (ui.closedSecs.has(el.dataset.id) ? ui.closedSecs.delete(el.dataset.id) : ui.closedSecs.add(el.dataset.id)),
    acceptCall: async (el) => {
      await post('acceptCall', { callId: el.dataset.id });
      select('call', el.dataset.id);
    },
    createIncident: async () => {
      const m = maskData();
      if (!m.keywordId) return toast('Stichwort fehlt.', 'fehler');
      if (!m.street) return toast('Einsatzort fehlt.', 'fehler');
      const r = await post('createIncident', { callId: ui.sel.kind === 'call' ? ui.sel.id : null, mask: m });
      if (r && r.incidentId) select('incident', r.incidentId);
    },
    newIncident: () => post('newIncident'),
    endCall: () => post('endCall', { callId: ui.sel.id }),
    saveIncident: () => post('saveIncident', { incidentId: ui.sel.id, mask: maskData() }),
    waypoint: () => post('setWaypoint', { kind: ui.sel.kind, id: ui.sel.id }),
    releaseAll: () => post('releaseAll', { incidentId: ui.sel.id }),
    releaseUnit: (el) => post('releaseUnit', { incidentId: ui.sel.id, unitId: el.dataset.id }),
    closeIncident: async () => {
      const r = await post('closeIncident', { incidentId: ui.sel.id });
      if (r?.ok !== false) ui.sel = null;
    },
    pick: (el) => (el.checked ? ui.picked.add(el.dataset.id) : ui.picked.delete(el.dataset.id)),
    clearPick: () => ui.picked.clear(),
    proposal: () => {
      ui.picked = new Set((incident(ui.sel.id)?.suggestion || []).filter((s) => s.proposed && s.available !== false).map((s) => s.id));
    },
    alarm: async () => {
      if (!ui.picked.size) return;
      const items = (incident(ui.sel.id)?.suggestion || []).filter((s) => ui.picked.has(s.id)).map((s) => ({ id: s.id, kind: s.kind || 'FZG' }));
      const r = await post('alarm', { incidentId: ui.sel.id, items });
      if (r?.ok !== false) ui.picked.clear();
    },
    answerRequest: (el) => post('answerRequest', { requestId: el.dataset.id }),
    radioGroup: (el) => post('setRadioGroup', { code: el.dataset.id }),
    unit: (el) => (ui.unitId = el.dataset.id),
  };

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !ACTIONS[el.dataset.act] || el.tagName === 'FORM' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type === 'text')) return;
    if (el.dataset.act === 'ptt') return;
    await ACTIONS[el.dataset.act](el);
    render();
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.field) ui.draft[el.dataset.field] = el.value;
    if (el.dataset.act === 'filter') ui.filter = el.value;
    if (el.dataset.field === 'keywordId' || el.dataset.act === 'filter' || el.dataset.field === 'hospitalId') render();
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.field) {
      ui.draft[el.dataset.field] = el.value;
      el.classList.toggle('req-empty', el.classList.contains('req-empty') && !el.value.trim());
    }
    if (el.dataset.act === 'query') {
      ui.query = el.value;
      render();
    }
  });
  document.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const input = f.querySelector('input');
    const text = input.value.trim();
    if (!text) return;
    if (f.dataset.act === 'sendMessage') await post('sendMessage', { kind: ui.sel.kind, id: ui.sel.id, text });
    if (f.dataset.act === 'sendRadio') await post('sendRadio', { text });
    input.value = '';
  });
  // Sendetaste: gedrückt halten
  const pttDown = (on) => {
    if (ui.ptt === on) return;
    ui.ptt = on;
    post('ptt', { down: on });
    render();
  };
  document.addEventListener('mousedown', (e) => e.target.closest('[data-act="ptt"]') && pttDown(true));
  document.addEventListener('mouseup', () => ui.ptt && pttDown(false));

  // Tastatur: Esc schließen, F2 Notruf annehmen, F3 nächster offener Einsatz, A alarmieren
  document.addEventListener('keydown', (e) => {
    if (!ui.open) return;
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (e.key === 'Escape') return void post('close');
    if (e.key === 'F2') {
      e.preventDefault();
      const c = S.calls.find((x) => x.state === 'klingelt');
      if (c) ACTIONS.acceptCall({ dataset: { id: c.id } }).then(render);
    } else if (e.key === 'F3') {
      e.preventDefault();
      const i = [...S.incidents].sort((a, b) => (a.priority || 3) - (b.priority || 3)).find((x) => x.state === 'neu');
      if (i) select('incident', i.id), render();
    } else if (!typing && (e.key === 'a' || e.key === 'A') && ui.sel?.kind === 'incident') ACTIONS.alarm().then(render);
  });

  // ------------------------------------------------------------ Nachrichten vom Lua-Script
  /*
   * Lua kodiert leere Tabellen teils als {} statt [] und Listen mit Lücken als Objekte –
   * alles, was eine Liste sein soll, wird hier zur Liste gemacht.
   */
  const arr = (x) => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.values(x) : []);
  function normalize(s) {
    for (const k of ['calls', 'incidents', 'units', 'stations', 'keywords', 'hospitals']) s[k] = arr(s[k]);
    s.radio = { groups: arr(s.radio?.groups), requests: arr(s.radio?.requests), log: arr(s.radio?.log) };
    for (const c of s.calls) c.dialog = arr(c.dialog);
    for (const i of s.incidents) for (const k of ['units', 'suggestion', 'messages', 'dialog']) i[k] = arr(i[k]);
    return s;
  }

  window.addEventListener('message', (e) => {
    const m = e.data || {};
    switch (m.type) {
      case 'open':
        ui.open = true;
        if (m.style) document.documentElement.dataset.style = m.style;
        if (m.state) S = normalize({ ...S, ...m.state });
        if (m.view) ui.view = m.view;
        break;
      case 'close':
        ui.open = false;
        ui.ptt = false;
        break;
      case 'state':
        S = normalize({ ...S, ...m.state });
        break;
      case 'patch':
        // einzelne Liste ersetzen, z. B. { type:'patch', key:'units', value:[…] }
        S = normalize({ ...S, [m.key]: m.value });
        break;
      case 'select':
        if (m.incidentId) select('incident', m.incidentId);
        else if (m.callId) select('call', m.callId);
        break;
      case 'style':
        document.documentElement.dataset.style = m.style;
        break;
      case 'toast':
        toast(m.text, m.kind);
        return;
      default:
        return;
    }
    // ausgewählter Notruf/Einsatz verschwunden → Auswahl aufheben
    if (ui.sel && !selected()) ui.sel = null;
    render();
  });

  // Uhr: ohne Uhrzeit vom Server die lokale Zeit
  setInterval(() => {
    const el = document.getElementById('lw-clock');
    if (el && !S.clock) el.textContent = clock();
  }, 1000);

  window.LW = { render, get state() { return S; }, ui };
})();
