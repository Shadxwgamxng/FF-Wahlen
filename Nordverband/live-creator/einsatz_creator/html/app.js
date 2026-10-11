/* Einsatz-Creator - NUI
 *
 * Lua -> NUI: window.postMessage({ action, data })
 * NUI -> Lua: post(callback, data) -> { ok, data, error }
 */
'use strict';

const RES = typeof GetParentResourceName === 'function' ? GetParentResourceName() : 'einsatz_creator';

/* ------------------------------------------------------------------ */
/* Helfer                                                              */
/* ------------------------------------------------------------------ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Lua-Tabellen kommen als Array oder Objekt an - hier vereinheitlichen
function arr(v) {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return Object.values(v);
    return [];
}
function obj(v) {
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    if (Array.isArray(v) && v.length === 0) return {};
    return v && typeof v === 'object' ? Object.assign({}, v) : {};
}
const clone = v => JSON.parse(JSON.stringify(v ?? null));
function debounce(fn, ms) {
    let t = null;
    const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    d.flush = (...a) => { clearTimeout(t); fn(...a); };
    return d;
}
function fmtTime(ts) {
    if (!ts) return '-';
    const d = new Date(ts * 1000);
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}. ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function getPath(o, path) {
    return path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
}
function setPath(o, path, val) {
    const keys = path.split('.');
    let cur = o;
    for (let i = 0; i < keys.length - 1; i++) {
        if (cur[keys[i]] == null || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
        if (Array.isArray(cur[keys[i]]) && cur[keys[i]].length === 0 && isNaN(+keys[i + 1])) cur[keys[i]] = {};
        cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = val;
}

async function post(name, data = {}, silent = false) {
    try {
        const res = await fetch(`https://${RES}/${name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify(data),
        });
        const json = await res.json();
        if (!json.ok && !silent && json.error) toast('error', json.error);
        return json;
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

function toast(kind, text) {
    if (!text) return;
    const el = document.createElement('div');
    el.className = `toast ${kind || 'info'}`;
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), kind === 'error' ? 6000 : 4000);
    while ($('#toasts').children.length > 5) $('#toasts').firstChild.remove();
}

const store = {
    get(key, def) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignorieren */ } },
};

/* ------------------------------------------------------------------ */
/* Zustand                                                             */
/* ------------------------------------------------------------------ */
const S = {
    open: false,
    catalog: null,
    config: null,
    perms: {},
    user: '',
    draft: null,
    meta: null,
    selected: null,
    dirty: false,
    tool: { name: 'select' },
    previewHidden: false,
    tab: 'tools',
    sub: null,            // geoeffnetes Werkzeug-Unterpanel
    tpl: {},              // Vorlagen je Werkzeug
    search: {},           // Suchtexte
    scenarios: [],
    scenarioSearch: '',
    random: null,
    incidents: { active: [], history: [] },
    status: {},
    edit: null,           // Bearbeitungskopie des ausgewaehlten Elements
    snapshot: null,       // Stand bei Auswahl (fuer "Zuruecksetzen")
    editId: null,
    favs: store.get('ec_favs', { vehicle: [], object: [], ped: [] }),
    pending: {},          // Panels mit aufgeschobenem Neuzeichnen
};

const KIND_LABEL = {
    vehicle: 'Fahrzeug', object: 'Objekt', ped: 'NPC / Patient', fire: 'Feuer', smoke: 'Rauch',
    marker: 'Position', area: 'Gebiet', door: 'Tuer', spill: 'Betriebsstoff',
};
const KIND_ICON = {
    vehicle: '🚗', object: '▣', ped: '✚', fire: '🔥', smoke: '☁', marker: '⚑', area: '◯', door: '🚪', spill: '💧',
};
const TOOLS = [
    { id: 'select', label: 'Auswahl', ico: '⌖' },
    { id: 'center', label: 'Einsatzort', ico: '◎' },
    { id: 'vehicle', label: 'Fahrzeug', ico: '🚗' },
    { id: 'object', label: 'Objekt', ico: '▣' },
    { id: 'line', label: 'Absperrlinie', ico: '⋯' },
    { id: 'fire', label: 'Feuer', ico: '🔥' },
    { id: 'smoke', label: 'Rauch', ico: '☁' },
    { id: 'ped', label: 'NPC / Patient', ico: '✚' },
    { id: 'marker', label: 'Position', ico: '⚑' },
    { id: 'area', label: 'Gebiet', ico: '◯' },
    { id: 'door', label: 'Tuer', ico: '🚪' },
    { id: 'spill', label: 'Betriebsstoff', ico: '💧' },
    { id: 'variant', label: 'Ortsvariante', ico: '⇄' },
];
const TOOL_NAMES = {
    select: 'Auswahl', place: 'Setzen', move: 'Verschieben', center: 'Einsatzort', line: 'Absperrlinie',
    door: 'Tuer waehlen', pickTarget: 'Koppeln', pickVehicle: 'Fahrzeug waehlen', variant: 'Ortsvariante',
};
const VEH_TYPES = ['automobile', 'bike', 'boat', 'heli', 'plane', 'trailer', 'train', 'submarine'];
const SEATS = [[-1, 'Fahrer'], [0, 'Beifahrer'], [1, 'Hinten links'], [2, 'Hinten rechts'], [3, 'Sitz 4'], [4, 'Sitz 5']];

/* ------------------------------------------------------------------ */
/* Formular-Bausteine                                                  */
/* ------------------------------------------------------------------ */
function fText(label, path, value, opts = {}) {
    return `<label class="field"><span>${esc(label)}</span><input type="text" data-path="${path}" data-type="text"
        value="${esc(value ?? '')}" maxlength="${opts.max || 200}" ${opts.list ? `list="${opts.list}"` : ''} placeholder="${esc(opts.ph || '')}"></label>`;
}
function fArea(label, path, value, opts = {}) {
    return `<label class="field"><span>${esc(label)}</span><textarea data-path="${path}" data-type="text" rows="${opts.rows || 3}"
        maxlength="${opts.max || 1500}" placeholder="${esc(opts.ph || '')}">${esc(value ?? '')}</textarea></label>`;
}
function fNum(label, path, value, opts = {}) {
    return `<label class="field"><span>${esc(label)}</span><input type="number" data-path="${path}" data-type="${opts.int ? 'int' : 'num'}"
        value="${value ?? 0}" step="${opts.step || 1}" ${opts.min !== undefined ? `min="${opts.min}"` : ''} ${opts.max !== undefined ? `max="${opts.max}"` : ''}></label>`;
}
function fSel(label, path, value, options, opts = {}) {
    const o = options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('');
    return `<label class="field"><span>${esc(label)}</span><select data-path="${path}" data-type="${opts.type || 'text'}">${o}</select></label>`;
}
function fChk(label, path, value) {
    return `<label class="check"><input type="checkbox" data-path="${path}" data-type="bool" ${value ? 'checked' : ''}> ${esc(label)}</label>`;
}
function readInput(el) {
    const t = el.dataset.type;
    if (t === 'bool') return el.checked;
    if (t === 'num') { const v = parseFloat(String(el.value).replace(',', '.')); return isNaN(v) ? undefined : v; }
    if (t === 'int') { const v = parseInt(el.value, 10); return isNaN(v) ? undefined : v; }
    if (t === 'nullable') return el.value === '' ? null : el.value;
    return el.value;
}

/* ------------------------------------------------------------------ */
/* Nachrichten aus Lua                                                 */
/* ------------------------------------------------------------------ */
window.addEventListener('message', (e) => {
    const { action, data } = e.data || {};
    switch (action) {
        case 'editorOpen': onEditorOpen(data); break;
        case 'editorClose': onEditorClose(); break;
        case 'state': onState(data); break;
        case 'status': onStatus(data); break;
        case 'incidents': S.incidents = normIncidents(data); if (S.tab === 'active') renderLeft(); break;
        case 'toast': toast(data.kind, data.text); break;
        case 'alarm': showAlarm(data); break;
        case 'prompt': showPrompt(data); break;
        case 'progress': showProgress(data); break;
        case 'actionMenu': showActionMenu(data); break;
        case 'patientCard': showPatientCard(data); break;
        case 'infoPanel': showInfoPanel(data); break;
        case 'subtitles': showSubtitles(data); break;
    }
});

function normIncidents(d) {
    d = d || {};
    return { active: arr(d.active), history: arr(d.history) };
}

function onEditorOpen(d) {
    S.open = true;
    S.catalog = d.catalog;
    S.config = d.config;
    S.perms = d.perms || {};
    S.user = d.user || '';
    S.scenarios = arr(d.scenarios);
    S.incidents = normIncidents(d.incidents);
    S.sub = null;
    initTemplates();
    $('#editor').classList.remove('hidden');
    renderAll();
}

function onEditorClose() {
    S.open = false;
    closeModal();
    $('#editor').classList.add('hidden');
}

function onState(d) {
    const prevSel = S.selected;
    S.draft = d.draft;
    S.draft.info = S.draft.info || {};
    S.draft.info.custom = obj(S.draft.info.custom);
    S.draft.elements = arr(S.draft.elements);
    S.meta = d.meta || null;
    S.selected = d.selected || null;
    S.dirty = !!d.dirty;
    S.tool = d.tool || { name: 'select' };
    S.previewHidden = !!d.previewHidden;

    const el = S.selected ? S.draft.elements.find(x => x.id === S.selected) : null;
    if (S.selected !== prevSel) {
        S.snapshot = el ? clone(el) : null;
    }
    if (!el) { S.edit = null; S.editId = null; }
    else if (!panelBusy('#right') || S.editId !== el.id) { S.edit = clone(el); S.editId = el.id; }

    renderTop();
    renderLeft();
    renderRight();
}

function onStatus(d) {
    S.status = d || {};
    const s = S.status;
    const c = s.cursor ? `${s.cursor.x.toFixed(1)}, ${s.cursor.y.toFixed(1)}, ${s.cursor.z.toFixed(1)}` : '-';
    const far = s.centerDist != null && s.maxDist && s.centerDist > s.maxDist * 0.9;
    $('#bottombar').innerHTML = `
        <span>Werkzeug: <b>${esc(TOOL_NAMES[s.tool] || s.tool || '-')}</b></span>
        <span class="hint">${esc(s.hint || '')}</span>
        <span class="mono">Cursor: ${esc(c)}</span>
        <span class="${far ? 'warn' : ''}">${s.centerDist != null ? `Abstand Einsatzort: ${s.centerDist} m` : 'Kein Einsatzort'}</span>`;
}

/* Ein Panel nicht neu zeichnen, solange darin getippt wird */
function panelBusy(sel) {
    const a = document.activeElement;
    return a && a.closest && a.closest(sel) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName);
}

/* ------------------------------------------------------------------ */
/* Vorlagen fuer Werkzeuge                                             */
/* ------------------------------------------------------------------ */
function initTemplates() {
    const d = S.catalog.defaults;
    S.tpl = {
        vehicle: { model: null, label: '', props: clone(d.vehicle) },
        object: { model: null, label: '', props: clone(d.object) },
        line: { model: 'prop_roadcone02a', label: '', spacing: 1.5, props: clone(d.object) },
        ped: { model: null, label: '', props: clone(d.ped) },
        fire: { label: '', props: clone(d.fire) },
        smoke: { label: '', props: clone(d.smoke) },
        marker: { label: '', props: clone(d.marker) },
        area: { label: '', props: clone(d.area) },
        door: { label: '', props: clone(d.door) },
        spill: { label: '', props: clone(d.spill) },
    };
    S.tpl.vehicle.props.damage = 2;
    S.tpl.vehicle.props.hazard = true;
}

function activateTemplate(kind) {
    const t = S.tpl[kind];
    if (kind === 'line') {
        if (!t.model) return toast('error', 'Bitte ein Objekt fuer die Linie waehlen');
        return post('setTool', { name: 'line', template: { model: t.model, label: t.label, spacing: t.spacing, props: t.props, rot: { x: 0, y: 0, z: 0 } } });
    }
    if (kind === 'door') {
        return post('setTool', { name: 'door', template: { label: t.label, props: t.props } });
    }
    if (['vehicle', 'object', 'ped'].includes(kind) && !t.model) return toast('error', 'Bitte zuerst ein Modell waehlen');
    return post('setTool', { name: 'place', kind, template: { model: t.model, label: t.label, props: t.props, rot: { x: 0, y: 0, z: 0 } } });
}
const refreshPlaceTool = debounce((kind) => {
    if (S.tool.name === 'place' && S.tool.kind === kind) activateTemplate(kind);
}, 350);

/* ------------------------------------------------------------------ */
/* Obere Leiste                                                        */
/* ------------------------------------------------------------------ */
function renderTop() {
    if (!S.draft) return;
    if (panelBusy('#topbar')) return;
    const cats = arr(S.catalog.categories).map(c => [c.id, c.label]);
    const saved = S.draft.id
        ? `<span class="badge ok">Gespeichert · ${esc(S.draft.id)}</span>`
        : `<span class="badge">Neuer Entwurf</span>`;
    const dirty = S.dirty ? `<span class="badge warn">ungespeicherte Aenderungen</span>` : '';
    $('#topbar').innerHTML = `
        <div class="brand">EINSATZ-CREATOR<small>${esc(S.user)}</small></div>
        <select data-scope="info" data-path="category" data-type="text" title="Einsatzart">
            ${cats.map(([v, l]) => `<option value="${esc(v)}" ${v === S.draft.category ? 'selected' : ''}>${esc(l)}</option>`).join('')}
        </select>
        <input class="name" data-scope="info" data-path="name" data-type="text" maxlength="64" placeholder="Einsatzname" value="${esc(S.draft.name)}">
        <span class="state">${saved} ${dirty}</span>
        <div class="grow"></div>
        <button data-act="new" title="Neuer Entwurf">Neu</button>
        <button data-act="save" class="primary" title="Speichern (Strg+S)">Speichern</button>
        <button data-act="preview" class="${S.previewHidden ? '' : 'active'}" title="Vorschau ein-/ausblenden">Vorschau</button>
        <div class="sep"></div>
        <button data-act="test" ${S.perms.test ? '' : 'disabled'} title="In der Welt aufbauen, nur du (und Testempfaenger) werden alarmiert">Test</button>
        <button data-act="live" class="live" ${S.perms.live ? '' : 'disabled'} title="Einsatz live ausloesen">LIVE</button>
        <div class="sep"></div>
        <button data-act="close" class="ghost" title="Schliessen">✕</button>`;
}

$('#topbar').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'new') {
        if (S.dirty && !(await confirmBox('Neuer Entwurf', 'Ungespeicherte Aenderungen gehen verloren. Fortfahren?', 'Verwerfen', true))) return;
        post('newScenario');
    } else if (act === 'save') {
        saveScenario();
    } else if (act === 'preview') {
        post('togglePreview');
    } else if (act === 'test') {
        triggerIncident('test');
    } else if (act === 'live') {
        triggerIncident('live');
    } else if (act === 'close') {
        requestClose();
    }
});

async function saveScenario() {
    flushEdits();
    const r = await post('saveScenario');
    if (r.ok) {
        toast('success', `Szenario gespeichert (${r.data.id})`);
        if (r.data.scenarios) S.scenarios = arr(r.data.scenarios);
        if (S.tab === 'scenarios') renderLeft();
    }
}

function chooseBox(title, text, options) {
    return new Promise((resolve) => {
        modalResolve = null;
        $('#modal').innerHTML = `<div class="box"><h2>${esc(title)}</h2><p>${esc(text)}</p>
            <select id="chooseSel" class="mt">${options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>
            <div class="buttons"><button data-c="no">Abbrechen</button><button data-c="yes" class="primary">Weiter</button></div></div>`;
        $('#modal').classList.remove('hidden');
        $('#modal').onclick = (e) => {
            const b = e.target.closest('[data-c]');
            if (!b) return;
            const val = $('#chooseSel').value;
            $('#modal').onclick = null;
            closeModal(false);
            resolve(b.dataset.c === 'yes' ? val : null);
        };
    });
}

async function triggerIncident(mode) {
    flushEdits();
    let variant = 0;
    const vars = arr(S.draft.variants);
    if (vars.length) {
        const v = await chooseBox('Einsatzort waehlen', 'Fuer dieses Szenario gibt es Ortsvarianten.',
            [['0', 'Originalort'], ['random', 'Zufaellig'], ...vars.map((x, i) => [String(i + 1), `Variante ${i + 1}: ${x.label || ''}`])]);
        if (v === null) return;
        variant = v === 'random' ? 'random' : parseInt(v, 10);
    }
    const roles = arr(S.draft.info.alarmRoles).map(r => (S.config.roles[r] || {}).label || r).join(', ');
    if (mode === 'live') {
        const ok = await confirmBox('Einsatz LIVE ausloesen',
            `„${S.draft.name || 'Unbenannt'}“ wird in der Welt aufgebaut. Alarmiert werden alle Kraefte mit folgenden Rollen: ${roles || '-'}.` +
            (S.dirty ? ' Hinweis: Der aktuelle (ungespeicherte) Stand wird verwendet.' : ''), 'LIVE ausloesen', true);
        if (!ok) return;
    }
    toast('info', mode === 'live' ? 'Einsatz wird aufgebaut ...' : 'Testeinsatz wird aufgebaut ...');
    const r = await post('trigger', { mode, variant });
    if (r.ok) {
        toast('success', `${mode === 'live' ? 'Live-Einsatz' : 'Testeinsatz'} ${r.data.id} ist aktiv`);
        if (r.data.warnings > 0) toast('warn', `${r.data.warnings} Element(e) konnten nicht erzeugt werden (Details unter "Aktiv")`);
        if (r.data.incidents) S.incidents = normIncidents(r.data.incidents);
        S.tab = 'active';
        renderLeft();
    }
}

async function requestClose() {
    if (S.dirty && !(await confirmBox('Creator schliessen', 'Es gibt ungespeicherte Aenderungen. Trotzdem schliessen?', 'Schliessen', true))) return;
    post('close');
}

/* ------------------------------------------------------------------ */
/* Linke Seite                                                         */
/* ------------------------------------------------------------------ */
$('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (!b) return;
    S.tab = b.dataset.tab;
    if (S.tab === 'active') post('listIncidents', {}, true).then(r => { if (r.ok) { S.incidents = normIncidents(r.data); renderLeft(); } });
    if (S.tab === 'scenarios') post('listScenarios', {}, true).then(r => { if (r.ok) { S.scenarios = arr(r.data); renderLeft(); } });
    if (S.tab === 'random') loadRandom();
    renderLeft();
});

function renderLeft(force) {
    if (!S.open || !S.draft) return;
    $$('#tabs .tab').forEach(t => t.classList.toggle('on', t.dataset.tab === S.tab));
    if (!force && panelBusy('#leftContent')) { S.pending.left = true; return; }
    S.pending.left = false;
    const box = $('#leftContent');
    const scroll = box.scrollTop;
    if (S.tab === 'tools') box.innerHTML = renderTools();
    else if (S.tab === 'incident') box.innerHTML = renderIncidentTab();
    else if (S.tab === 'elements') box.innerHTML = renderElementsTab();
    else if (S.tab === 'scenarios') box.innerHTML = renderScenariosTab();
    else if (S.tab === 'active') box.innerHTML = renderActiveTab();
    else if (S.tab === 'random') box.innerHTML = renderRandomTab();
    box.scrollTop = scroll;
}

/* ----- Werkzeuge ----- */
function renderTools() {
    const activeTool = S.tool.name === 'place' ? S.tool.kind : S.tool.name;
    let html = `<div class="section"><div class="toolgrid">` + TOOLS.map(t => {
        const on = (S.sub === t.id) || (t.id === activeTool && !S.sub) || (t.id === 'select' && activeTool === 'select' && !S.sub);
        return `<div class="tool ${on ? 'on' : ''}" data-tool="${t.id}"><span class="ico">${t.ico}</span>${esc(t.label)}</div>`;
    }).join('') + `</div></div>`;
    if (S.sub) html += `<div class="section" data-scope="tpl:${S.sub}">${renderToolPanel(S.sub)}</div>`;
    else html += `<div class="section dim">Werkzeug waehlen. Mit der rechten Maustaste die Kamera drehen, mit W/A/S/D bewegen, Q/E fuer Hoehe, Shift/Strg fuer Tempo.</div>`;
    return html;
}

function modelList(kind, cats) {
    const q = (S.search[kind] || '').trim().toLowerCase();
    const t = S.tpl[kind];
    const favs = S.favs[kind === 'line' ? 'object' : kind] || [];
    let html = '';
    const row = (m, ok) => `<div class="m ${ok ? '' : 'na'} ${t.model === m ? 'on' : ''}" data-model="${esc(m)}" data-ok="${ok ? 1 : 0}">
        <span class="mono">${esc(m)}</span><span class="fav ${favs.includes(m) ? 'on' : ''}" data-fav="${esc(m)}">★</span></div>`;
    const favRows = favs.filter(m => !q || m.includes(q)).map(m => row(m, true)).join('');
    if (favRows) html += `<div class="cat">Favoriten</div>${favRows}`;
    for (const c of arr(cats)) {
        const ms = arr(c.models).filter(x => !q || x.model.toLowerCase().includes(q) || c.label.toLowerCase().includes(q));
        if (!ms.length) continue;
        html += `<div class="cat">${esc(c.label)}</div>` + ms.map(x => row(x.model, x.ok)).join('');
    }
    return `<input type="text" data-search="${kind}" placeholder="Suche nach Spawnname ..." value="${esc(S.search[kind] || '')}">
        <div class="modellist">${html || '<div class="empty">Keine Treffer</div>'}</div>
        <div class="row mt-s"><input type="text" data-custom="${kind}" placeholder="Eigener Spawnname"><button class="small" data-act="custom" data-kind="${kind}">Pruefen</button></div>`;
}

function renderToolPanel(kind) {
    const C = S.catalog;
    const t = S.tpl[kind];
    const p = t.props;
    const placeBtn = (label) => `<button class="primary mt" style="width:100%" data-act="place" data-kind="${kind}">${label}</button>`;
    switch (kind) {
        case 'vehicle':
            return `<h3>Fahrzeug</h3>${modelList('vehicle', C.vehicles)}
                ${fSel('Schaden', 'props.damage', p.damage, arr(C.damageLevels).map(d => [d.id, d.label]), { type: 'int' })}
                <div class="grid2">${fChk('Warnblinker', 'props.hazard', p.hazard)}${fChk('Licht an', 'props.lights', p.lights)}
                ${fChk('Verschlossen', 'props.locked', p.locked)}${fChk('Fixiert', 'props.frozen', p.frozen)}
                ${fChk('Tueren offen', 'props.doorsOpen', p.doorsOpen)}${fChk('Scheiben kaputt', 'props.windowsBroken', p.windowsBroken)}
                ${fChk('Reifen platt', 'props.tyresBurst', p.tyresBurst)}${fChk('Motor aus', 'props.engineOff', p.engineOff)}</div>
                ${placeBtn(t.model ? `Setzen: ${esc(t.model)}` : 'Modell waehlen')}`;
        case 'object':
            return `<h3>Objekt</h3>${modelList('object', C.props)}
                <div class="grid2">${fChk('Fixiert', 'props.frozen', p.frozen)}${fChk('Kollision', 'props.collision', p.collision)}</div>
                ${placeBtn(t.model ? `Setzen: ${esc(t.model)}` : 'Modell waehlen')}`;
        case 'line':
            return `<h3>Absperrlinie</h3>${modelList('line', C.props)}
                ${fNum('Abstand (m)', 'spacing', t.spacing, { step: 0.25, min: 0.5, max: 10 })}
                <p class="dim mt-s">Startpunkt und Endpunkt in der Welt anklicken. Mausrad aendert den Abstand.</p>
                <button class="primary mt" style="width:100%" data-act="place" data-kind="line">Linie ziehen</button>`;
        case 'ped':
            return `<h3>NPC / Patient</h3>${modelList('ped', C.peds)}
                ${fSel('Haltung', 'props.pose', p.pose, arr(C.poses).filter(x => !x.vehicle).map(x => [x.id, x.label]))}
                ${fChk('Ist Patient', 'props.isPatient', p.isPatient)}
                ${fChk('Zufaelliges Modell (passend zum Geschlecht)', 'props.randomModel', p.randomModel)}
                ${C.medical && C.medical.enabled ? fSel('Meldebild', 'props.patient.profile', p.patient.profile, arr(C.medical.profiles).map(x => [x.id, x.label])) : ''}
                ${fSel('Schweregrad', 'props.patient.severity', p.patient.severity, arr(C.severities).map(s => [s.id, s.label]))}
                <div class="grid2">${fSel('Bewusstsein', 'props.patient.consciousness', p.patient.consciousness, arr(C.consciousness).map(x => [x, x]))}
                ${fSel('Mobilitaet', 'props.patient.mobility', p.patient.mobility, arr(C.mobility).map(x => [x, x]))}</div>
                <p class="dim mt-s">Verletzungen, Vitalwerte und Massnahmen nach dem Setzen rechts bearbeiten. In ein Fahrzeug setzen: NPC auswaehlen und „In Fahrzeug setzen“.</p>
                ${placeBtn(t.model ? `Setzen: ${esc(t.model)}` : 'Modell waehlen')}`;
        case 'fire':
            return `<h3>Feuer</h3>${fireFields(p, 'props.')}${placeBtn('Brandherd setzen')}
                <p class="dim mt-s">Mehrere Brandherde: einfach mehrfach klicken. Shift+Mausrad aendert die Groesse.${isZFire() ? ' Fahrzeug-/Objektbrand: Feuer setzen und rechts „An Fahrzeug / Objekt koppeln“. Innenraum: rechts „Raum ermitteln“.' : ''}</p>`;
        case 'smoke':
            return `<h3>Rauch</h3>${smokeFields(p, 'props.')}${placeBtn('Rauchquelle setzen')}`;
        case 'marker':
            return `<h3>Position / Fundstelle</h3>${fText('Bezeichnung', 'label', t.label, { max: 48 })}${markerFields(p, 'props.')}${placeBtn('Position setzen')}`;
        case 'area':
            return `<h3>Einsatzgebiet</h3>${fText('Bezeichnung', 'label', t.label, { max: 48 })}${areaFields(p, 'props.')}${placeBtn('Gebiet setzen')}`;
        case 'door':
            return `<h3>Tueroeffnung</h3>${doorFields(p, 'props.')}
                <p class="dim mt-s">Eine echte Tuer in der Welt anklicken. Sie wird waehrend des Einsatzes verriegelt und erst durch die Einsatzkraefte geoeffnet.</p>
                <button class="primary mt" style="width:100%" data-act="place" data-kind="door">Tuer anklicken</button>`;
        case 'spill':
            return `<h3>Betriebsstoff / Oelspur</h3>${spillFields(p, 'props.')}${placeBtn('Betriebsstoff setzen')}
                <p class="dim mt-s">Fuer eine laengere Spur mehrere Flecken hintereinander setzen.</p>`;
    }
    return '';
}

function isZFire() { return S.config && S.config.fireBackend === 'z_fire'; }

function fireFields(p, pre, withRoomButton) {
    const C = S.catalog;
    if (isZFire()) {
        const zf = S.config.zfire || {};
        return `${zf.running ? '' : '<p class="mt-s" style="color:var(--yellow)">⚠ z_fire ist nicht gestartet - Feuer koennen nicht ausgeloest werden.</p>'}
            ${fSel('z_fire Partikeltyp', pre + 'zfEffect', p.zfEffect, arr(zf.fireEffects).map(x => [x, x]))}
            ${fSel('Brandverhalten (z_fire)', pre + 'zfBehaviour', p.zfBehaviour, [['auto', 'Automatisch (Kopplung/Raum)'], ['grass', 'Flaeche / Vegetation (grass)'], ['interior', 'Innenraum (interior)'], ['prop', 'Objekt (prop)'], ['vehicle', 'Fahrzeug (vehicle)']])}
            <div class="grid2">${fNum('Groesse (scale)', pre + 'size', p.size, { step: 0.1, min: 0.2, max: 5 })}
            ${fNum('Brenndauer (s, 0 = bis geloescht)', pre + 'burnTime', p.burnTime, { int: true, min: 0, max: 7200 })}</div>
            ${fChk('Ausbreitung aktiv', pre + 'canSpread', p.canSpread)}
            ${fNum('Ausbreitungsradius (m)', pre + 'spreadRadius', p.spreadRadius, { step: 1, min: 1, max: 40 })}
            ${withRoomButton ? `<div class="grid2">${fNum('Room-Key (Innenraum)', pre + 'roomHash', p.roomHash, { int: true })}
                <label class="field"><span>&nbsp;</span><button style="width:100%" data-act="roomHash">Raum ermitteln</button></label></div>` : ''}
            ${fSel('Darstellung in der Vorschau', pre + 'fireType', p.fireType, arr(C.fireTypes).map(f => [f.id, f.label]))}`;
    }
    const smokeOpts = [['auto', 'Automatisch (passend zum Feuer)'], ['none', 'Kein Rauch'], ...arr(C.smokeTypes).map(s => [s.id, s.label])];
    return `${fSel('Feuerart', pre + 'fireType', p.fireType, arr(C.fireTypes).map(f => [f.id, f.label]))}
        <div class="grid2">${fNum('Groesse', pre + 'size', p.size, { step: 0.1, min: 0.2, max: 5 })}
        ${fNum('Brenndauer (s, 0 = bis geloescht)', pre + 'burnTime', p.burnTime, { int: true, min: 0, max: 7200 })}</div>
        ${fSel('Rauch', pre + 'smoke', p.smoke, smokeOpts)}
        ${fChk('Glutnester / Wiederaufflammen', pre + 'smoulder', p.smoulder)}
        ${fChk('Ausbreitung aktiv', pre + 'canSpread', p.canSpread)}
        <div class="grid3">${fNum('Radius (m)', pre + 'spreadRadius', p.spreadRadius, { step: 1, min: 1, max: 40 })}
        ${fNum('Max. Herde', pre + 'maxSpread', p.maxSpread, { int: true, min: 0, max: 20 })}
        ${fNum('Takt (s)', pre + 'spreadInterval', p.spreadInterval, { int: true, min: 10, max: 600 })}</div>`;
}
function smokeFields(p, pre) {
    const C = S.catalog;
    if (isZFire()) {
        const zf = S.config.zfire || {};
        return `${fSel('z_fire Partikeltyp', pre + 'zfEffect', p.zfEffect, arr(zf.smokeEffects).map(x => [x, x]))}
            ${fNum('Groesse (scale)', pre + 'size', p.size, { step: 0.1, min: 0.2, max: 5 })}
            ${fChk('Rauch verzieht sich mit der Zeit (canDisperse)', pre + 'zfDisperse', p.zfDisperse)}
            ${fSel('Darstellung in der Vorschau', pre + 'smokeType', p.smokeType, arr(C.smokeTypes).map(s => [s.id, s.label]))}`;
    }
    return `${fSel('Rauchart', pre + 'smokeType', p.smokeType, arr(C.smokeTypes).map(s => [s.id, s.label]))}
        <div class="grid2">${fNum('Groesse', pre + 'size', p.size, { step: 0.1, min: 0.2, max: 5 })}
        ${fSel('Intensitaet', pre + 'density', p.density, [[1, 'Leicht'], [2, 'Mittel'], [3, 'Stark']], { type: 'int' })}</div>
        ${fChk('Verschwindet, wenn alle Feuer geloescht sind', pre + 'untilFiresOut', p.untilFiresOut)}`;
}
function markerFields(p, pre) {
    return `${fSel('Art', pre + 'markerKind', p.markerKind, arr(S.catalog.markerKinds).map(k => [k.id, k.label]))}
        ${fArea('Beschreibung', pre + 'description', p.description, { max: 400, rows: 2 })}
        ${fChk('Auf Karte anzeigen (Blip)', pre + 'blip', p.blip)}
        ${fChk('Interaktion „Fundstelle sichern“', pre + 'interactive', p.interactive)}`;
}
function areaFields(p, pre) {
    return `${fSel('Art', pre + 'areaKind', p.areaKind, arr(S.catalog.areaKinds).map(k => [k.id, k.label]))}
        ${fNum('Radius (m)', pre + 'radius', p.radius, { step: 5, min: 5, max: 500 })}
        ${fChk('Auf Karte anzeigen', pre + 'blip', p.blip)}`;
}
function doorFields(p, pre) {
    return `${fSel('Dringlichkeit', pre + 'urgency', p.urgency, [['dringend', 'dringend'], ['nicht dringend', 'nicht dringend']])}
        ${fArea('Beschreibung', pre + 'description', p.description, { max: 300, rows: 2 })}
        ${fChk('Echte Tuer verriegeln', pre + 'lockRealDoor', p.lockRealDoor)}`;
}
function spillFields(p, pre) {
    return `${fSel('Stoff', pre + 'spillKind', p.spillKind, arr(S.catalog.spillKinds).map(k => [k.id, k.label]))}
        ${fNum('Breite (m)', pre + 'width', p.width, { step: 0.25, min: 0.5, max: 8 })}`;
}

/* ----- Einsatz-Tab ----- */
function renderIncidentTab() {
    const d = S.draft;
    const info = d.info;
    const cat = arr(S.catalog.categories).find(c => c.id === d.category) || {};
    const kwList = `<datalist id="kwlist">${arr(cat.keywords).map(k => `<option value="${esc(k)}">`).join('')}</datalist>`;
    const custom = arr(cat.fields).map(f => {
        const path = `info.custom.${f.key}`;
        const v = info.custom[f.key];
        if (f.type === 'checkbox') return fChk(f.label, path, v);
        if (f.type === 'number') return fNum(f.label, path, v ?? 0, { int: true, min: 0 });
        if (f.type === 'select') return fSel(f.label, path, v ?? arr(f.options)[0], arr(f.options).map(o => [o, o]));
        if (f.type === 'textarea') return fArea(f.label, path, v);
        return fText(f.label, path, v, { max: 160 });
    }).join('');
    const units = arr(info.units);
    const roles = arr(info.alarmRoles);
    const center = d.center ? `${d.center.x.toFixed(1)}, ${d.center.y.toFixed(1)}, ${d.center.z.toFixed(1)}` : 'nicht festgelegt';
    return `<div class="section" data-scope="info">
        <h3>Allgemein</h3>
        ${fText('Einsatzname', 'name', d.name, { max: 64 })}
        ${kwList}${fText('Einsatzstichwort', 'keyword', d.keyword, { max: 64, list: 'kwlist', ph: 'z. B. ' + (arr(cat.keywords)[0] || '') })}
        ${fSel('Prioritaet', 'priority', d.priority, arr(S.catalog.priorities).map(p => [p.value, p.label]), { type: 'int' })}
        <h3>Einsatzort</h3>
        <div class="row"><span class="mono grow">${esc(center)}</span>
            <button class="small" data-act="setCenter">Festlegen</button>
            <button class="small" data-act="camCenter" ${d.center ? '' : 'disabled'}>Kamera</button></div>
        ${fText('Adresse / Ortsbeschreibung', 'info.address', info.address, { max: 120 })}
        <h3>Ortsvarianten (${arr(d.variants).length})</h3>
        <p class="dim">Beim Ausloesen kann die ganze Szene an einen dieser Orte verschoben werden (Zufallseinsaetze waehlen zufaellig).</p>
        ${arr(d.variants).map((v, i) => `<div class="row mt-s" data-variant="${i}">
            <span class="badge">${i + 1}</span>
            <input type="text" data-vfield="label" value="${esc(v.label || '')}" maxlength="48" class="grow">
            <input type="number" data-vfield="h" value="${Math.round(v.h || 0)}" style="width:62px" title="Drehung (Grad)">
            <button class="small" data-act="varCam" data-i="${i}">◎</button>
            <button class="small danger" data-act="varDel" data-i="${i}">✕</button></div>`).join('')}
        <div class="row mt-s"><button class="small" data-act="varAdd">Ortsvariante setzen</button>
            <button class="small" data-act="varBack">Kamera zum Original</button></div>
        <h3>Alarmierung</h3>
        ${fArea('Alarmtext', 'info.alarmText', info.alarmText, { max: 300, rows: 2, ph: 'Kurzer Text fuer die Alarmierung' })}
        <p class="dim">Platzhalter: <span class="mono">{anruf}</span> = zufaelliger Notruftext des Meldebilds, <span class="mono">{patient}</span> = Patientenname, <span class="mono">{ziel}</span> = Transportziel</p>
        <label class="field"><span>Alarmierte Rollen</span><div class="chips">
            ${Object.entries(S.config.roles).map(([id, r]) => `<span class="chip ${roles.includes(id) ? 'on' : ''}" data-toggle="info.alarmRoles" data-value="${esc(id)}">${esc(r.label)}</span>`).join('')}
        </div></label>
        <h3>Lage</h3>
        ${fArea('Einsatzbeschreibung', 'info.description', info.description, { max: 1500, rows: 4 })}
        ${fArea('Gefahrenhinweise', 'info.hazards', info.hazards, { max: 600, rows: 2 })}
        ${fArea('Betroffene Personen', 'info.persons', info.persons, { max: 300, rows: 2 })}
        <h3>${esc(cat.label || 'Einsatzart')} - Details</h3>
        ${custom || '<p class="dim">Keine weiteren Felder</p>'}
        <h3>Erwartete Einsatzmittel</h3>
        <div class="chips">${arr(S.catalog.units).map(u => `<span class="chip ${units.includes(u) ? 'on' : ''}" data-toggle="info.units" data-value="${esc(u)}">${esc(u)}</span>`).join('')}</div>
        ${fText('Weitere Einsatzmittel', 'info.unitsText', info.unitsText, { max: 200 })}
        <h3>Intern</h3>
        ${fArea('Interne Notizen (nicht fuer Einsatzkraefte)', 'info.notes', info.notes, { max: 1500, rows: 3 })}
        ${fArea('SOP / Ablaufhinweise (fuer Einsatzkraefte sichtbar)', 'info.sop', info.sop, { max: 3000, rows: 5 })}
        ${S.meta ? `<p class="dim mt">Erstellt ${fmtTime(S.meta.createdAt)} von ${esc((S.meta.createdBy || {}).name || '?')}${S.meta.updatedAt ? ` · geaendert ${fmtTime(S.meta.updatedAt)} von ${esc((S.meta.updatedBy || {}).name || '?')}` : ''}</p>` : ''}
    </div>`;
}

/* ----- Elemente-Tab ----- */
function renderElementsTab() {
    const els = S.draft.elements;
    if (!els.length) return `<div class="empty">Noch keine Elemente gesetzt.<br>Werkzeug waehlen und in die Welt klicken.</div>`;
    const q = (S.search.elements || '').toLowerCase();
    const limits = S.config.limits;
    let html = `<div class="section"><input type="text" data-search="elements" placeholder="Elemente filtern ..." value="${esc(S.search.elements || '')}">
        <p class="dim mt-s">${els.length} / ${limits.total} Elemente</p></div><div class="list">`;
    for (const kind of Object.keys(KIND_LABEL)) {
        const list = els.filter(e => e.kind === kind && (!q || elLabel(e).toLowerCase().includes(q)));
        if (!list.length) continue;
        const total = els.filter(e => e.kind === kind).length;
        html += `<div class="group">${KIND_ICON[kind]} ${esc(KIND_LABEL[kind])}<span class="right">${total} / ${limits[kind] ?? '-'}</span></div>`;
        html += list.map(e => `<div class="item ${e.id === S.selected ? 'on' : ''}" data-el="${esc(e.id)}">
            <div class="grow"><div class="t">${esc(elLabel(e))}</div><div class="s">${esc(elSub(e))}</div></div>
            <button class="icon small ghost" data-act="focusEl" data-id="${esc(e.id)}" title="Kamera hierhin">◎</button>
            <button class="icon small danger" data-act="delEl" data-id="${esc(e.id)}" title="Loeschen">✕</button></div>`).join('');
    }
    return html + `</div>`;
}

function elLabel(e) {
    if (e.label) return e.label;
    const p = e.props || {};
    if (e.kind === 'ped' && p.isPatient && p.patient && p.patient.name) return p.patient.name;
    if (e.model) return e.model;
    const C = S.catalog;
    if (e.kind === 'fire') return (arr(C.fireTypes).find(f => f.id === p.fireType) || {}).label || 'Feuer';
    if (e.kind === 'smoke') return (arr(C.smokeTypes).find(f => f.id === p.smokeType) || {}).label || 'Rauch';
    if (e.kind === 'marker') return (arr(C.markerKinds).find(f => f.id === p.markerKind) || {}).label || 'Position';
    if (e.kind === 'area') return (arr(C.areaKinds).find(f => f.id === p.areaKind) || {}).label || 'Gebiet';
    if (e.kind === 'spill') return (arr(C.spillKinds).find(f => f.id === p.spillKind) || {}).label || 'Betriebsstoff';
    return KIND_LABEL[e.kind] || e.kind;
}
function elSub(e) {
    const p = e.props || {};
    const parts = [];
    if (e.kind === 'ped' && p.isPatient && p.patient) parts.push(`${p.patient.severity}, ${p.patient.mobility}`);
    if (e.kind === 'ped' && p.vehicleId) parts.push('im Fahrzeug');
    if ((e.kind === 'fire' || e.kind === 'smoke') && p.attachTo) parts.push('gekoppelt');
    if (e.kind === 'fire') parts.push(`Groesse ${p.size}${p.canSpread ? ', breitet sich aus' : ''}`);
    if (e.kind === 'area') parts.push(`r = ${p.radius} m`);
    if (e.kind === 'door') parts.push(p.doorModel ? 'Kartentuer' : 'logisch');
    if (e.kind === 'vehicle') parts.push(`Schaden ${p.damage}`);
    return parts.join(' · ') || KIND_LABEL[e.kind];
}

/* ----- Szenarien-Tab ----- */
function renderScenariosTab() {
    const q = S.scenarioSearch.toLowerCase();
    const list = S.scenarios.filter(s => !q || `${s.name} ${s.keyword} ${s.categoryLabel} ${s.id}`.toLowerCase().includes(q));
    let html = `<div class="section"><input type="text" data-search="scenarios" placeholder="Szenarien durchsuchen ..." value="${esc(S.scenarioSearch)}"></div>`;
    if (!list.length) return html + `<div class="empty">Keine gespeicherten Szenarien</div>`;
    html += list.map(s => `<div class="card ${S.draft.id === s.id ? 'on' : ''}">
        <div class="row"><div class="title grow">${esc(s.name)}</div><span class="badge">${esc(s.categoryLabel)}</span></div>
        <div class="meta">${esc(s.keyword || '-')} · ${s.elements} Elemente · <span class="mono">${esc(s.id)}</span></div>
        <div class="meta">${esc(s.address || '')}</div>
        <div class="meta">Erstellt ${fmtTime(s.createdAt)} von ${esc(s.createdBy)}${s.updatedAt ? ` · geaendert ${fmtTime(s.updatedAt)}` : ''}</div>
        <div class="actions">
            <button class="small primary" data-act="openSc" data-id="${esc(s.id)}">Oeffnen</button>
            <button class="small" data-act="copySc" data-id="${esc(s.id)}" title="Als neuen Entwurf oeffnen">Als Kopie</button>
            <button class="small" data-act="dupSc" data-id="${esc(s.id)}" title="Kopie direkt speichern">Duplizieren</button>
            <button class="small danger" data-act="delSc" data-id="${esc(s.id)}">Loeschen</button>
        </div></div>`).join('');
    return html;
}

/* ----- Aktiv-Tab ----- */
function renderActiveTab() {
    const act = S.incidents.active;
    const phases = arr(S.config.phases);
    let html = `<div class="section row"><b class="grow">Aktive Einsaetze (${act.length})</b><button class="small" data-act="refreshInc">Aktualisieren</button></div>`;
    if (!act.length) html += `<div class="empty">Keine aktiven Einsaetze</div>`;
    html += act.map(i => {
        const fire = i.fire || {};
        const r = i.rescue || {};
        const byStatus = obj(r.byStatus);
        const pat = Object.entries(byStatus).map(([k, v]) => `${v}× ${S.config.patientStatus[k] || k}`).join(', ');
        const errors = arr(i.errors);
        const running = i.status === 'aktiv';
        return `<div class="card">
            <div class="row"><span class="badge ${i.mode === 'live' ? 'live' : 'test'}">${i.mode === 'live' ? 'LIVE' : 'TEST'}</span>
                <span class="badge ${running ? 'ok' : i.status === 'fehlerhaft' ? 'err' : ''}">${esc(i.statusLabel)}</span>
                ${i.random ? '<span class="badge">Zufall</span>' : ''}
                <span class="mono dim right">${esc(i.id)}</span></div>
            <div class="title mt-s">${esc(i.keyword || i.name)}</div>
            <div class="meta">${esc(i.name)} · ${esc(i.categoryLabel)}</div>
            <div class="meta">${esc(i.address || '')}</div>
            <div class="kv">
                <span class="k">Erstellt</span><span>${fmtTime(i.createdAt)} · ${esc(i.createdBy)}</span>
                <span class="k">Elemente</span><span>${i.elements} (davon ${i.entities} in der Welt)</span>
                <span class="k">Feuer</span><span>${fire.burning || 0} brennend, ${fire.smouldering || 0} glimmend, ${fire.smoke || 0} Rauch</span>
                <span class="k">Patienten</span><span>${r.patients ? esc(pat) : 'keine'}</span>
            </div>
            ${running ? `<label class="field"><span>Phase (fuer Leitstelle)</span><select data-phase="${esc(i.id)}">
                ${phases.map(p => `<option value="${esc(p)}" ${p === i.phase ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>` : ''}
            ${errors.length ? `<div class="mt-s" style="color:var(--yellow)">⚠ ${errors.map(esc).join('<br>⚠ ')}</div>` : ''}
            <div class="actions">
                <button class="small" data-act="incCam" data-id="${esc(i.id)}">Kamera</button>
                <button class="small" data-act="incWp" data-id="${esc(i.id)}">Wegpunkt</button>
                <button class="small" data-act="incDetails" data-id="${esc(i.id)}">Details</button>
                ${running ? `<button class="small" data-act="incRealarm" data-id="${esc(i.id)}">Nachalarmieren</button>
                <button class="small primary" data-act="incEnd" data-id="${esc(i.id)}">Beenden</button>
                <button class="small danger" data-act="incCancel" data-id="${esc(i.id)}">Abbrechen</button>` : ''}
            </div></div>`;
    }).join('');
    const hist = S.incidents.history;
    if (hist.length) {
        html += `<div class="section"><h3>Verlauf</h3></div><div class="list">` + hist.map(h => `<div class="item">
            <div class="grow"><div class="t">${esc(h.keyword || h.name || h.id)}</div>
            <div class="s"><span class="mono">${esc(h.id)}</span> · ${esc(h.statusLabel || h.status)} · ${h.mode === 'live' ? 'Live' : 'Test'} · ${fmtTime(h.endedAt)}${h.note ? ' · ' + esc(h.note) : ''}</div></div></div>`).join('') + `</div>`;
    }
    return html;
}

/* ----- Zufall-Tab ----- */
async function loadRandom() {
    const r = await post('randomStatus', {}, true);
    if (r.ok) { S.random = r.data; S.randomForm = clone(r.data.settings); renderLeft(true); }
}

function renderRandomTab() {
    const R = S.random;
    if (!R) return `<div class="empty">Wird geladen ...</div>`;
    const f = S.randomForm || R.settings;
    const can = !!S.perms.live;
    const next = R.nextAt ? `in ${Math.max(0, Math.round((R.nextAt - R.now) / 60))} min (${fmtTime(R.nextAt)})` : '-';
    const duty = Object.entries(obj(R.onDuty)).map(([k, v]) => `${esc((S.config.roles[k] || {}).label || k)}: ${v}`).join(' · ');
    let html = `<div class="section" data-scope="random">
        <h3>Zufallsgenerator</h3>
        ${fChk('Zufallseinsaetze aktiv', 'enabled', f.enabled)}
        <div class="grid2">${fNum('Abstand min. (Minuten)', 'intervalMin', f.intervalMin, { int: true, min: 1, max: 600 })}
        ${fNum('Abstand max. (Minuten)', 'intervalMax', f.intervalMax, { int: true, min: 1, max: 600 })}</div>
        ${fNum('Max. gleichzeitige Zufallseinsaetze', 'maxActive', f.maxActive, { int: true, min: 1, max: S.config.limits.activeIncidents })}
        <div class="grid2">${fNum('Tag beginnt (Std.)', 'dayStart', f.dayStart, { int: true, min: 0, max: 23 })}
        ${fNum('Tag endet (Std.)', 'dayEnd', f.dayEnd, { int: true, min: 0, max: 24 })}</div>
        <div class="row mt"><button class="primary grow" data-act="rndSave" ${can ? '' : 'disabled'}>Einstellungen speichern</button>
        <button data-act="rndNow" ${can ? '' : 'disabled'} title="Sofort einen passenden Einsatz aus dem Pool starten">Jetzt ausloesen</button></div>
        <div class="kv mt"><span class="k">Naechster Einsatz</span><span>${esc(next)}</span>
            <span class="k">Aktiv (Zufall)</span><span>${R.activeRandom} / ${R.settings.maxActive}</span>
            <span class="k">Im Dienst</span><span>${duty || '-'}</span>
            <span class="k">Letzter Versuch</span><span>${R.lastInfo ? `${fmtTime(R.lastInfo.at)} · ${esc(R.lastInfo.text)}` : '-'}</span></div>
        </div>`;
    const inPool = new Set(arr(R.candidates).map(c => c.id));
    html += `<div class="section"><h3>Zufallspool</h3><p class="dim">Gespeicherte Szenarien, die zufaellig ausgeloest werden duerfen.</p></div>`;
    html += S.scenarios.map(sc => {
        const c = arr(R.candidates).find(x => x.id === sc.id);
        const pool = c ? c.pool : { enabled: false, weight: 1, time: 'immer', cooldown: 30, minOnDuty: {} };
        const mod = obj(pool.minOnDuty);
        return `<div class="card" data-scope="pool" data-id="${esc(sc.id)}">
            <div class="row"><label class="check grow" style="margin:0"><input type="checkbox" data-pool="enabled" ${pool.enabled ? 'checked' : ''} ${can ? '' : 'disabled'}>
                <b>${esc(sc.name)}</b></label><span class="badge">${esc(sc.categoryLabel)}</span></div>
            ${inPool.has(sc.id) ? `<div class="meta">${c.eligible ? '<span style="color:var(--green)">bereit</span>' : esc(c.reason)}${c.lastRun ? ' · zuletzt ' + fmtTime(c.lastRun) : ''}</div>` : ''}
            ${pool.enabled ? `<div class="grid3">
                <label class="field"><span>Gewichtung</span><input type="number" data-pool="weight" value="${pool.weight}" min="1" max="10"></label>
                <label class="field"><span>Tageszeit</span><select data-pool="time">${[['immer', 'immer'], ['tag', 'Tag'], ['nacht', 'Nacht']].map(([v, l]) => `<option value="${v}" ${pool.time === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label class="field"><span>Sperrzeit (min)</span><input type="number" data-pool="cooldown" value="${pool.cooldown}" min="0" max="1440"></label></div>
                <div class="grid3">${Object.entries(S.config.roles).map(([role, r]) =>
                    `<label class="field"><span>Min. ${esc(r.label)}</span><input type="number" data-pool="minOnDuty.${role}" value="${mod[role] || 0}" min="0" max="20"></label>`).join('')}</div>` : ''}
        </div>`;
    }).join('') || '<div class="empty">Noch keine gespeicherten Szenarien</div>';
    return html;
}

async function saveRandomPool(card) {
    const id = card.dataset.id;
    const c = arr(S.random.candidates).find(x => x.id === id);
    const pool = c ? clone(c.pool) : { enabled: false, weight: 1, time: 'immer', cooldown: 30, minOnDuty: {} };
    pool.minOnDuty = obj(pool.minOnDuty);
    $$('[data-pool]', card).forEach(inp => {
        const key = inp.dataset.pool;
        const val = inp.type === 'checkbox' ? inp.checked : (inp.tagName === 'SELECT' ? inp.value : parseInt(inp.value, 10) || 0);
        setPath(pool, key, val);
    });
    const r = await post('randomSetPool', { id, pool });
    if (r.ok) { S.random = r.data; renderLeft(true); }
}

/* ----- Ereignisse linke Seite ----- */
$('#leftContent').addEventListener('click', async (e) => {
    const toolEl = e.target.closest('.tool');
    if (toolEl) {
        const id = toolEl.dataset.tool;
        if (id === 'select') { S.sub = null; post('setTool', { name: 'select' }); }
        else if (id === 'center') { S.sub = null; post('setTool', { name: 'center' }); }
        else if (id === 'variant') { S.sub = null; post('setTool', { name: 'variant' }); toast('info', 'Alternative Einsatzorte anklicken. Mausrad dreht die Szene. Verwaltung im Tab "Einsatz".'); }
        else { S.sub = S.sub === id ? null : id; }
        renderLeft(true);
        return;
    }
    const fav = e.target.closest('[data-fav]');
    if (fav) {
        e.stopPropagation();
        const kind = S.sub === 'line' ? 'object' : S.sub;
        const list = S.favs[kind] || (S.favs[kind] = []);
        const m = fav.dataset.fav;
        const i = list.indexOf(m);
        if (i >= 0) list.splice(i, 1); else list.unshift(m);
        store.set('ec_favs', S.favs);
        renderLeft(true);
        return;
    }
    const model = e.target.closest('.m[data-model]');
    if (model) {
        if (model.dataset.ok !== '1') return toast('error', 'Dieses Modell ist auf dem Server nicht verfuegbar');
        S.tpl[S.sub].model = model.dataset.model;
        renderLeft(true);
        if (S.sub !== 'line') activateTemplate(S.sub);
        return;
    }
    const chip = e.target.closest('[data-toggle]');
    if (chip) {
        const path = chip.dataset.toggle;
        const list = arr(getPath(S.draft, path)).slice();
        const v = chip.dataset.value;
        const i = list.indexOf(v);
        if (i >= 0) list.splice(i, 1); else list.push(v);
        setPath(S.draft, path, list);
        chip.classList.toggle('on');
        pushInfo();
        return;
    }
    const item = e.target.closest('.item[data-el]');
    const b = e.target.closest('button[data-act]');
    if (b) {
        const act = b.dataset.act, id = b.dataset.id;
        if (act === 'place') return activateTemplate(b.dataset.kind);
        if (act === 'custom') {
            const kind = b.dataset.kind;
            const input = $(`[data-custom="${kind}"]`);
            const m = (input.value || '').trim().toLowerCase();
            if (!m) return;
            const r = await post('checkModel', { model: m, kind: kind === 'line' ? 'object' : kind });
            if (r.ok) {
                S.tpl[kind].model = m;
                toast('success', `Modell "${m}" ist verfuegbar`);
                renderLeft(true);
                if (kind !== 'line') activateTemplate(kind);
            }
            return;
        }
        if (act === 'setCenter') return post('setTool', { name: 'center' });
        if (act === 'varAdd') return post('setTool', { name: 'variant' });
        if (act === 'varBack') return post('cameraToCenterReset');
        if (act === 'varCam') return post('focusVariant', { index: parseInt(b.dataset.i, 10) + 1 });
        if (act === 'varDel') {
            const list = arr(S.draft.variants).slice();
            list.splice(parseInt(b.dataset.i, 10), 1);
            return post('updateVariants', { variants: list });
        }
        if (act === 'camCenter') return post('cameraToCenter');
        if (act === 'focusEl') return post('selectElement', { id, focus: true });
        if (act === 'delEl') return post('deleteElement', { id });
        if (act === 'openSc' || act === 'copySc') {
            if (S.dirty && !(await confirmBox('Szenario oeffnen', 'Ungespeicherte Aenderungen gehen verloren. Fortfahren?', 'Oeffnen', true))) return;
            toast('info', 'Szenario wird geladen ...');
            const r = await post('loadScenario', { id, copy: act === 'copySc' });
            if (r.ok) { S.tab = 'elements'; renderLeft(true); }
            return;
        }
        if (act === 'dupSc') {
            const r = await post('duplicateScenario', { id });
            if (r.ok) { S.scenarios = arr(r.data.scenarios); toast('success', `Kopie gespeichert (${r.data.id})`); renderLeft(true); }
            return;
        }
        if (act === 'delSc') {
            const sc = S.scenarios.find(s => s.id === id);
            if (!(await confirmBox('Szenario loeschen', `„${sc ? sc.name : id}“ endgueltig loeschen?`, 'Loeschen', true))) return;
            const r = await post('deleteScenario', { id });
            if (r.ok) { S.scenarios = arr(r.data.scenarios); toast('success', 'Szenario geloescht'); renderLeft(true); }
            return;
        }
        if (act === 'rndSave') {
            const r = await post('randomSaveSettings', { settings: S.randomForm });
            if (r.ok) { S.random = r.data; S.randomForm = clone(r.data.settings); toast('success', 'Zufallseinstellungen gespeichert'); renderLeft(true); }
            return;
        }
        if (act === 'rndNow') {
            const r = await post('randomRunNow');
            if (r.ok) { S.random = r.data.status; toast('success', `Zufallseinsatz ${r.data.id} gestartet`); renderLeft(true); }
            return;
        }
        if (act === 'refreshInc') {
            const r = await post('listIncidents');
            if (r.ok) { S.incidents = normIncidents(r.data); renderLeft(true); }
            return;
        }
        const inc = S.incidents.active.find(x => x.id === id);
        if (act === 'incCam' && inc) return post('focusPosition', { pos: inc.center, distance: 35 });
        if (act === 'incWp' && inc) { post('setWaypoint', { pos: inc.center }); return toast('success', 'Wegpunkt gesetzt'); }
        if (act === 'incDetails') {
            const r = await post('incidentDetails', { id });
            if (r.ok) showDetailsModal(r.data);
            return;
        }
        if (act === 'incRealarm') {
            const r = await post('incidentAction', { id, action: 'realarm' });
            if (r.ok) toast('success', r.data || 'Nachalarmiert');
            return;
        }
        if (act === 'incEnd' || act === 'incCancel') {
            const cancel = act === 'incCancel';
            const ok = await confirmBox(cancel ? 'Einsatz abbrechen' : 'Einsatz beenden',
                cancel ? 'Der Einsatz wird abgebrochen und alle zugehoerigen Elemente werden sofort entfernt.'
                       : 'Der Einsatz wird regulaer beendet. Die Szene wird gemaess Konfiguration geraeumt.',
                cancel ? 'Abbrechen' : 'Beenden', cancel);
            if (!ok) return;
            const r = await post('incidentAction', { id, action: cancel ? 'cancel' : 'end' });
            if (r.ok) toast('success', r.data || 'Erledigt');
            const l = await post('listIncidents', {}, true);
            if (l.ok) { S.incidents = normIncidents(l.data); renderLeft(true); }
            return;
        }
        return;
    }
    if (item) post('selectElement', { id: item.dataset.el, focus: true });
});

$('#leftContent').addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.search) {
        const k = t.dataset.search;
        if (k === 'scenarios') S.scenarioSearch = t.value; else S.search[k] = t.value;
        const pos = t.selectionStart;
        renderLeft(true);
        const n = $(`[data-search="${k}"]`);
        if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* */ } }
        return;
    }
    handleBound(t, e.type);
});
$('#leftContent').addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.vfield) {
        const row = t.closest('[data-variant]');
        const list = clone(arr(S.draft.variants));
        const v = list[parseInt(row.dataset.variant, 10)];
        if (v) {
            v[t.dataset.vfield] = t.dataset.vfield === 'h' ? (parseFloat(t.value) || 0) : t.value;
            post('updateVariants', { variants: list });
        }
        return;
    }
    if (t.dataset.pool) { saveRandomPool(t.closest('[data-scope="pool"]')); return; }
    if (t.dataset.phase) {
        post('incidentAction', { id: t.dataset.phase, action: 'phase', phase: t.value }).then(r => { if (r.ok) toast('success', 'Phase gesetzt'); });
        return;
    }
    handleBound(t, e.type);
});
$('#topbar').addEventListener('input', (e) => handleBound(e.target, e.type));
$('#topbar').addEventListener('change', (e) => handleBound(e.target, e.type));

/* Gebundene Eingaben (Vorlagen, Einsatzinfos, Element) */
function handleBound(t, type) {
    if (!t.dataset || !t.dataset.path) return;
    const scopeEl = t.closest('[data-scope]') || t;
    const scope = t.dataset.scope || scopeEl.dataset.scope;
    const val = readInput(t);
    if (val === undefined) return;
    // Text: bei jedem Tastendruck; Auswahl/Checkbox: bei change
    if (type === 'input' && (t.tagName === 'SELECT' || t.type === 'checkbox')) return;
    // Modellname erst beim Verlassen des Feldes pruefen (nicht bei jedem Tastendruck)
    if (type === 'input' && t.dataset.path === 'model') return;
    if (scope === 'random') {
        S.randomForm = S.randomForm || {};
        setPath(S.randomForm, t.dataset.path, val);
        return;
    }
    if (scope && scope.startsWith('tpl:')) {
        const kind = scope.slice(4);
        setPath(S.tpl[kind], t.dataset.path, val);
        refreshPlaceTool(kind);
    } else if (scope === 'info') {
        if (t.dataset.path === 'category') {
            // ausstehende Aenderungen zuerst senden, dann nur die Einsatzart (setzt art-spezifische Felder zurueck)
            pushInfo.flush();
            S.draft.category = val;
            post('updateInfo', { patch: { category: val } });
            return;
        }
        setPath(S.draft, t.dataset.path, val);
        pushInfo();
    } else if (scope === 'el') {
        if (!S.edit) return;
        setPath(S.edit, t.dataset.path, val);
        pushEdit();
    }
}

const pushInfo = debounce(() => {
    const d = S.draft;
    post('updateInfo', { patch: { name: d.name, category: d.category, keyword: d.keyword, priority: d.priority, info: d.info } });
}, 300);

const pushEdit = debounce(async () => {
    if (!S.edit) return;
    const r = await post('updateElement', { element: S.edit });
    if (!r.ok) renderRight(true);
}, 250);

function flushEdits() {
    pushInfo.flush();
    if (S.edit) pushEdit.flush();
}

document.addEventListener('focusout', () => {
    setTimeout(() => {
        if (S.pending.left && !panelBusy('#leftContent')) renderLeft();
        if (S.pending.right && !panelBusy('#right')) renderRight();
    }, 0);
});

/* ------------------------------------------------------------------ */
/* Rechte Seite: Eigenschaften                                          */
/* ------------------------------------------------------------------ */
function renderRight(force) {
    if (!S.open || !S.draft) return;
    if (!force && panelBusy('#right')) { S.pending.right = true; return; }
    S.pending.right = false;
    const box = $('#right');
    const e = S.edit;
    if (!e) {
        const counts = {};
        for (const x of S.draft.elements) counts[x.kind] = (counts[x.kind] || 0) + 1;
        box.innerHTML = `<div class="section"><h3>Eigenschaften</h3><p class="dim">Kein Element ausgewaehlt. Element in der Welt oder in der Liste anklicken.</p></div>
            <div class="section"><h3>Szene</h3><div class="kv">${Object.keys(KIND_LABEL).map(k =>
                `<span class="k">${esc(KIND_LABEL[k])}</span><span>${counts[k] || 0} / ${S.config.limits[k] ?? '-'}</span>`).join('')}</div></div>
            <div class="section"><h3>Tastatur</h3><div class="kv">
                <span class="k">W A S D</span><span>Kamera bewegen</span><span class="k">Q / E</span><span>runter / hoch</span>
                <span class="k">Shift / Strg</span><span>schneller / langsamer</span><span class="k">Rechte Maus</span><span>Kamera drehen</span>
                <span class="k">Linksklick</span><span>setzen / auswaehlen</span><span class="k">Mausrad</span><span>drehen (Alt: fein)</span>
                <span class="k">Shift+Rad</span><span>Groesse / Radius</span><span class="k">Strg+Rad</span><span>Hoehe</span>
                <span class="k">G</span><span>verschieben</span><span class="k">Pfeile / Bild↑↓</span><span>fein verschieben</span>
                <span class="k">Strg+D</span><span>duplizieren</span><span class="k">Entf</span><span>loeschen</span>
                <span class="k">F</span><span>Kamera zum Element</span><span class="k">Esc</span><span>abbrechen / schliessen</span>
            </div></div>`;
        return;
    }
    const p = e.props;
    let body = '';
    const entity = ['vehicle', 'object', 'ped'].includes(e.kind);
    body += fText('Bezeichnung', 'label', e.label, { max: 48 });
    if (entity) body += fText('Modell (Spawnname)', 'model', e.model, { max: 64 });
    body += `<h3>Position</h3><div class="grid3">${fNum('X', 'pos.x', e.pos.x, { step: 0.05 })}${fNum('Y', 'pos.y', e.pos.y, { step: 0.05 })}${fNum('Z', 'pos.z', e.pos.z, { step: 0.05 })}</div>`;
    if (e.kind === 'vehicle' || e.kind === 'object') {
        body += `<h3>Rotation</h3><div class="grid3">${fNum('Neigung X', 'rot.x', e.rot.x, { step: 1 })}${fNum('Rollen Y', 'rot.y', e.rot.y, { step: 1 })}${fNum('Richtung Z', 'rot.z', e.rot.z, { step: 1 })}</div>`;
    } else if (e.kind === 'ped' || e.kind === 'spill') {
        body += fNum('Richtung', 'rot.z', e.rot.z, { step: 1 });
    }
    body += `<h3>${esc(KIND_LABEL[e.kind])}</h3>` + kindFields(e);
    $('#right').innerHTML = `
        <div class="props-head"><span style="font-size:20px">${KIND_ICON[e.kind]}</span><div class="grow">
            <div class="kind">${esc(KIND_LABEL[e.kind])}</div><div class="title">${esc(elLabel(e))}</div></div></div>
        <div class="props-actions">
            <button data-act="move" ${p.attachTo || (e.kind === 'ped' && p.vehicleId) ? 'disabled' : ''}>Verschieben (G)</button>
            <button data-act="dup">Duplizieren</button>
            <button data-act="ground">Auf Boden</button>
            <button data-act="focus">Kamera hierhin</button>
            <button data-act="reset">Zuruecksetzen</button>
            <button data-act="del" class="danger">Loeschen</button>
        </div>
        <div class="section" data-scope="el">${body}</div>`;
}

function kindFields(e) {
    const p = e.props;
    const C = S.catalog;
    const els = S.draft.elements;
    switch (e.kind) {
        case 'vehicle':
            return `${fSel('Schaden', 'props.damage', p.damage, arr(C.damageLevels).map(d => [d.id, d.label]), { type: 'int' })}
                <div class="grid2">${fChk('Warnblinker', 'props.hazard', p.hazard)}${fChk('Licht an', 'props.lights', p.lights)}
                ${fChk('Verschlossen', 'props.locked', p.locked)}${fChk('Fixiert', 'props.frozen', p.frozen)}
                ${fChk('Tueren offen', 'props.doorsOpen', p.doorsOpen)}${fChk('Scheiben kaputt', 'props.windowsBroken', p.windowsBroken)}
                ${fChk('Reifen platt', 'props.tyresBurst', p.tyresBurst)}${fChk('Motor aus', 'props.engineOff', p.engineOff)}</div>
                <div class="grid2">${fText('Kennzeichen', 'props.plate', p.plate, { max: 8 })}${fNum('Farbe (-1 = Standard)', 'props.colour', p.colour, { int: true, min: -1, max: 160 })}</div>
                ${fSel('Fahrzeugtyp (Server)', 'props.vehType', p.vehType, VEH_TYPES.map(v => [v, v]))}`;
        case 'object':
            return `<div class="grid2">${fChk('Fixiert', 'props.frozen', p.frozen)}${fChk('Kollision', 'props.collision', p.collision)}</div>`;
        case 'ped': {
            const vehicles = els.filter(x => x.kind === 'vehicle');
            const pt = p.patient;
            const inj = arr(pt.injuries);
            let h = fSel('Haltung', 'props.pose', p.pose, arr(C.poses).map(x => [x.id, x.label]));
            if (p.pose === 'fahrzeug') {
                h += `<div class="grid2">${fSel('Fahrzeug', 'props.vehicleId', p.vehicleId || '', [['', '- waehlen -'], ...vehicles.map(v => [v.id, elLabel(v)])], { type: 'nullable' })}
                    ${fSel('Sitz', 'props.seat', p.seat, SEATS, { type: 'int' })}</div>`;
            }
            h += `<button class="mt-s" style="width:100%" data-act="pickVehicle">In Fahrzeug setzen (Fahrzeug anklicken)</button>`;
            h += fChk('Ist Patient', 'props.isPatient', p.isPatient);
            h += fChk('Zufaelliges Modell beim Ausloesen', 'props.randomModel', p.randomModel);
            if (p.isPatient && C.medical && C.medical.enabled) h += medicalFields(e);
            if (p.isPatient) {
                h += `<h3>Patient</h3>${fText('Name / Kennung', 'props.patient.name', pt.name, { max: 48 })}
                    ${fSel('Schweregrad', 'props.patient.severity', pt.severity, arr(C.severities).map(s => [s.id, s.label]))}
                    <div class="grid2">${fSel('Bewusstsein', 'props.patient.consciousness', pt.consciousness, arr(C.consciousness).map(x => [x, x]))}
                    ${fSel('Mobilitaet', 'props.patient.mobility', pt.mobility, arr(C.mobility).map(x => [x, x]))}</div>
                    <label class="field"><span>Verletzungen / Erkrankungen (max. 8)</span><div class="chips">
                        ${arr(C.injuries).map(i => `<span class="chip ${inj.includes(i) ? 'on' : ''}" data-eltoggle="props.patient.injuries" data-value="${esc(i)}">${esc(i)}</span>`).join('')}
                    </div></label>
                    ${fArea('Befund / Beschreibung', 'props.patient.description', pt.description, { max: 400, rows: 2 })}
                    ${fArea('Erforderliche Massnahmen', 'props.patient.measures', pt.measures, { max: 400, rows: 2 })}
                    <h3>Vitalwerte</h3><div class="grid3">
                    ${fNum('Puls', 'props.patient.vitals.puls', pt.vitals.puls, { int: true, min: 0, max: 250 })}
                    ${fText('RR', 'props.patient.vitals.rr', pt.vitals.rr, { max: 16 })}
                    ${fNum('SpO2 %', 'props.patient.vitals.spo2', pt.vitals.spo2, { int: true, min: 0, max: 100 })}
                    ${fNum('AF', 'props.patient.vitals.af', pt.vitals.af, { int: true, min: 0, max: 60 })}
                    ${fNum('GCS', 'props.patient.vitals.gcs', pt.vitals.gcs, { int: true, min: 3, max: 15 })}</div>
                    ${fChk('Transport erforderlich', 'props.patient.transport', pt.transport)}`;
            }
            return h;
        }
        case 'fire': {
            const target = p.attachTo ? els.find(x => x.id === p.attachTo) : null;
            return fireFields(p, 'props.', true) + attachBlock(target) +
                (!isZFire() && p.canSpread && !p.attachTo ? `<div class="row mt-s"><span class="dim grow">${arr(p.spreadPoints).length} Ausbreitungspunkte</span>
                <button class="small" data-act="spread">Neu berechnen</button></div>` : '');
        }
        case 'smoke': {
            const target = p.attachTo ? els.find(x => x.id === p.attachTo) : null;
            return smokeFields(p, 'props.') + attachBlock(target);
        }
        case 'marker': return markerFields(p, 'props.');
        case 'area': return areaFields(p, 'props.');
        case 'door': {
            const patients = els.filter(x => x.kind === 'ped' && x.props.isPatient);
            const linked = arr(p.linked);
            return doorFields(p, 'props.') +
                `<p class="dim mt-s">${p.doorModel ? 'Echte Kartentuer erkannt (wird verriegelt).' : 'Logische Tuer (keine Kartentuer erkannt).'}</p>
                <label class="field"><span>Patienten hinter dieser Tuer</span><div class="chips">
                ${patients.length ? patients.map(x => `<span class="chip ${linked.includes(x.id) ? 'on' : ''}" data-eltoggle="props.linked" data-value="${esc(x.id)}">${esc(elLabel(x))}</span>`).join('') : '<span class="dim">Keine Patienten gesetzt</span>'}
                </div></label>`;
        }
        case 'spill': return spillFields(p, 'props.');
    }
    return '';
}

function medicalFields(e) {
    const C = S.catalog;
    const pt = e.props.patient;
    const profiles = arr(C.medical.profiles);
    const prof = profiles.find(x => x.id === pt.profile) || profiles[0];
    const variants = [[0, 'Zufaellig'], ...arr(prof.variants).map((v, i) => [i + 1, v])];
    const markers = S.draft.elements.filter(x => x.kind === 'marker');
    const body = obj(pt.body);
    const parts = arr(C.medical.bodyParts);
    const lvlLabel = ['-', 'kleine Wunde', 'grosse Wunde', 'schwer'];
    return `<h3>Medizin</h3>
        ${fSel('Meldebild', 'props.patient.profile', pt.profile, profiles.map(x => [x.id, x.label]))}
        ${pt.profile !== 'none' ? fSel('Variante', 'props.patient.variant', pt.variant, variants, { type: 'int' }) : '<p class="dim">Ohne Meldebild gelten die Vitalwerte unten.</p>'}
        <div class="grid2">${fSel('Geschlecht', 'props.patient.gender', pt.gender, [['auto', 'Zufaellig'], ['m', 'maennlich'], ['w', 'weiblich']])}
        ${fSel('Transportziel', 'props.patient.destination', pt.destination, [['hospital', 'Klinik (beliebig)'], ['other_hospital', 'Andere Klinik (Verlegung)'], ['marker', 'Zielort im Szenario']])}</div>
        ${pt.destination === 'marker' ? fSel('Zielort', 'props.patient.destMarker', pt.destMarker || '', [['', '- Position waehlen -'], ...markers.map(m => [m.id, elLabel(m)])], { type: 'nullable' }) : ''}
        <label class="field"><span>Verletzungen (Bodycheck) - leer = laut Meldebild</span></label>
        <div class="bodygrid">${parts.map(bp => fSel(bp.label, 'props.patient.body.' + bp.id, body[bp.id] || 0,
            [0, 1, 2, 3].filter(l => l <= bp.maxLevel).map(l => [l, l === 3 ? (bp.severeText || 'schwer') : lvlLabel[l]]), { type: 'int' })).join('')}</div>`;
}

function attachBlock(target) {
    return `<h3>Kopplung</h3>${target
        ? `<div class="row"><span class="grow">An: <b>${esc(elLabel(target))}</b></span><button class="small" data-act="detach">Loesen</button></div>`
        : `<button style="width:100%" data-act="attach">An Fahrzeug / Objekt koppeln</button>`}`;
}

$('#right').addEventListener('click', async (e) => {
    const chip = e.target.closest('[data-eltoggle]');
    if (chip && S.edit) {
        const path = chip.dataset.eltoggle;
        const list = arr(getPath(S.edit, path)).slice();
        const v = chip.dataset.value;
        const i = list.indexOf(v);
        if (i >= 0) list.splice(i, 1);
        else {
            if (path.endsWith('injuries') && list.length >= 8) return toast('error', 'Maximal 8 Eintraege');
            list.push(v);
        }
        setPath(S.edit, path, list);
        chip.classList.toggle('on');
        pushEdit();
        return;
    }
    const b = e.target.closest('button[data-act]');
    if (!b || !S.edit) return;
    const id = S.edit.id;
    switch (b.dataset.act) {
        case 'move': post('setTool', { name: 'move', id }); break;
        case 'dup': post('duplicateElement', { id }); break;
        case 'ground': post('snapToGround', { id }); break;
        case 'focus': post('focusElement', { id }); break;
        case 'del': post('deleteElement', { id }); break;
        case 'reset':
            if (S.snapshot && S.snapshot.id === id) {
                S.edit = clone(S.snapshot);
                await post('updateElement', { element: S.edit });
                renderRight(true);
                toast('info', 'Element zurueckgesetzt');
            }
            break;
        case 'attach': post('setTool', { name: 'pickTarget', forId: id }); break;
        case 'detach':
            S.edit.props.attachTo = null;
            pushEdit.flush();
            break;
        case 'pickVehicle': post('setTool', { name: 'pickVehicle', forId: id }); break;
        case 'roomHash': {
            const r = await post('roomHashAt', { id });
            if (r.ok) { toast('success', `Raum ermittelt: ${r.data.roomHash}`); setTimeout(() => renderRight(true), 50); }
            break;
        }
        case 'spread': {
            const r = await post('recomputeSpread', { id });
            if (r.ok) toast('success', `${r.data.count} Ausbreitungspunkte berechnet`);
            break;
        }
    }
});
$('#right').addEventListener('input', (e) => handleBound(e.target, 'input'));
$('#right').addEventListener('change', (e) => {
    handleBound(e.target, 'change');
    // Felder, die andere Felder ein-/ausblenden, sofort neu zeichnen
    const path = e.target.dataset && e.target.dataset.path;
    if (['props.pose', 'props.isPatient', 'props.canSpread', 'props.attachTo', 'props.patient.profile', 'props.patient.destination'].includes(path)) {
        pushEdit.flush();
        setTimeout(() => renderRight(true), 0);
    }
});

/* ------------------------------------------------------------------ */
/* Viewport: Maus                                                      */
/* ------------------------------------------------------------------ */
const vp = $('#viewport');
let down = null;
let look = { active: false, dx: 0, dy: 0 };
vp.addEventListener('contextmenu', e => e.preventDefault());
vp.addEventListener('mousedown', (e) => {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    if (e.button === 0) down = { x: e.clientX, y: e.clientY };
    if (e.button === 2) {
        look.active = true;
        try { vp.requestPointerLock && vp.requestPointerLock(); } catch (x) { /* */ }
    }
});
window.addEventListener('mouseup', (e) => {
    if (e.button === 0 && down) {
        const moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y);
        if (moved < 6 && e.target === vp) post('viewportClick', { button: 0, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey }, true)
            .then(r => { if (!r.ok && r.error) toast('error', r.error); });
        down = null;
    }
    if (e.button === 2 && look.active) {
        look.active = false;
        try { document.exitPointerLock && document.exitPointerLock(); } catch (x) { /* */ }
    }
});
window.addEventListener('mousemove', (e) => {
    if (look.active) { look.dx += e.movementX; look.dy += e.movementY; }
});
setInterval(() => {
    if (look.dx || look.dy) {
        const dx = look.dx, dy = look.dy;
        look.dx = 0; look.dy = 0;
        post('look', { dx, dy }, true);
    }
}, 25);
let lastWheel = 0;
vp.addEventListener('wheel', (e) => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastWheel < 40) return;
    lastWheel = now;
    post('wheel', { delta: e.deltaY < 0 ? 1 : -1, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey }, true);
}, { passive: false });

/* ------------------------------------------------------------------ */
/* Tastatur                                                            */
/* ------------------------------------------------------------------ */
document.addEventListener('focusin', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) post('inputFocus', { focused: true }, true);
});
document.addEventListener('focusout', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) post('inputFocus', { focused: false }, true);
});

document.addEventListener('keydown', async (e) => {
    // Overlays der Einsatzkraefte
    if (e.key === 'Escape') {
        if (!$('#actionMenu').classList.contains('hidden')) { closeActionMenu(); return; }
        if (!$('#infoPanel').classList.contains('hidden')) { closeInfoPanel(); return; }
    }
    if (!S.open) return;
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement && document.activeElement.tagName);
    if (e.key === 'Escape') {
        e.preventDefault();
        if (!$('#modal').classList.contains('hidden')) { closeModal(false); return; }
        if (typing) { document.activeElement.blur(); return; }
        const r = await post('key', { key: 'Escape' }, true);
        if (r.ok && r.data && r.data.result === 'close') requestClose();
        return;
    }
    if (e.ctrlKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); saveScenario(); return; }
    if (typing || !$('#modal').classList.contains('hidden')) return;
    const keys = ['Delete', 'g', 'G', 'f', 'F', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'];
    if (keys.includes(e.key) || (e.ctrlKey && (e.key === 'd' || e.key === 'D'))) {
        e.preventDefault();
        post('key', { key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey });
    }
});

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */
let modalResolve = null;
function confirmBox(title, text, okLabel = 'OK', danger = false) {
    return new Promise((resolve) => {
        modalResolve = resolve;
        $('#modal').innerHTML = `<div class="box"><h2>${esc(title)}</h2><p>${esc(text)}</p>
            <div class="buttons"><button data-m="no">Abbrechen</button><button data-m="yes" class="${danger ? 'live' : 'primary'}">${esc(okLabel)}</button></div></div>`;
        $('#modal').classList.remove('hidden');
    });
}
function closeModal(result) {
    $('#modal').classList.add('hidden');
    $('#modal').innerHTML = '';
    if (modalResolve) { const r = modalResolve; modalResolve = null; r(!!result); }
}
$('#modal').addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (b) closeModal(b.dataset.m === 'yes');
    else if (e.target.id === 'modal') closeModal(false);
});

function detailsHtml(d) {
    const custom = arr(d.custom).map(c => `<span class="k">${esc(c.label)}</span><span>${esc(c.value)}</span>`).join('');
    const patients = arr(d.patients);
    const fire = d.fire || {};
    return `<div class="kv">
            <span class="k">Einsatz-ID</span><span class="mono">${esc(d.id)}</span>
            <span class="k">Art</span><span>${esc(d.categoryLabel)} · P${esc(d.priority)}</span>
            <span class="k">Status</span><span>${esc(d.status)} · ${esc(d.phase || '-')}</span>
            <span class="k">Adresse</span><span>${esc(d.address || '-')}</span>
            <span class="k">Alarmtext</span><span>${esc(d.alarmText || '-')}</span>
            <span class="k">Gefahren</span><span>${esc(d.hazards || '-')}</span>
            <span class="k">Personen</span><span>${esc(d.persons || '-')}</span>
            <span class="k">Einsatzmittel</span><span>${esc([...arr(d.units), d.unitsText].filter(Boolean).join(', ') || '-')}</span>
            <span class="k">Feuer</span><span>${fire.burning || 0} brennend, ${fire.smouldering || 0} glimmend, ${d.fireExtinguished || 0} geloescht</span>
            ${custom}
        </div>
        ${d.description ? `<h3>Lage</h3><pre>${esc(d.description)}</pre>` : ''}
        ${patients.length ? `<h3>Patienten</h3>${patients.map(p => `<div>• ${esc(p.name)} - ${esc(p.severity)} - <b>${esc(p.statusLabel || p.status)}</b>${p.dest ? ` · Ziel: ${esc(p.dest)}` : ''}</div>`).join('')}` : ''}
        ${d.sop ? `<h3>SOP / Ablauf</h3><pre>${esc(d.sop)}</pre>` : ''}
        ${arr(d.log).length ? `<h3>Protokoll</h3>${arr(d.log).map(l => `<div class="dim">${fmtTime(l.at)} · ${esc(l.by)}: ${esc(l.text)}</div>`).join('')}` : ''}`;
}

function showDetailsModal(d) {
    modalResolve = null;
    $('#modal').innerHTML = `<div class="box"><h2>${esc(d.keyword || d.name)}</h2><p>${esc(d.name)}</p>${detailsHtml(d)}
        <div class="buttons"><button data-m="no">Schliessen</button></div></div>`;
    $('#modal').classList.remove('hidden');
}

function renderAll() {
    renderTop();
    renderLeft(true);
    renderRight(true);
}

/* ------------------------------------------------------------------ */
/* Einsatzkraefte: Alarm, Hinweis, Fortschritt, Menues                 */
/* ------------------------------------------------------------------ */
let alarmTimer = null;
function showAlarm(d) {
    const a = d.alarm || {};
    const box = $('#alarm');
    box.className = a.mode === 'test' ? 'test' : '';
    box.innerHTML = `<div class="head"><span class="pulse"></span>
            <b>${a.reAlarm ? 'NACHALARMIERUNG' : 'ALARM'}</b>
            ${a.mode === 'test' ? '<span class="badge test">TEST</span>' : ''}
            <span class="badge right">P${esc(a.priority)}</span></div>
        <div class="kw mt-s">${esc(a.keyword || a.categoryLabel)}</div>
        <div class="name">${esc(a.name)} · ${esc(a.categoryLabel)}</div>
        ${a.alarmText ? `<div class="text">${esc(a.alarmText)}</div>` : ''}
        <div class="addr">📍 ${esc(a.address || a.street || '')}</div>
        ${a.patients ? `<div class="mt-s">Patienten: ${esc(a.patients)}</div>` : ''}
        ${arr(a.units).length ? `<div class="mt-s dim">Einsatzmittel: ${esc(arr(a.units).join(', '))}</div>` : ''}
        <div class="foot">${esc(d.routeKey)} = Route · ${esc(d.infoKey)} = Einsatzinfos · ${esc(a.id)}</div>`;
    box.classList.remove('hidden');
    clearTimeout(alarmTimer);
    alarmTimer = setTimeout(() => box.classList.add('hidden'), (d.seconds || 25) * 1000);
}

function showPrompt(d) {
    const box = $('#prompt');
    if (!d || !d.text) { box.classList.add('hidden'); return; }
    box.textContent = d.text;
    box.classList.remove('hidden');
}

function showProgress(d) {
    const box = $('#progress');
    const fill = $('.fill', box);
    if (!d) { box.classList.add('hidden'); fill.style.transition = 'none'; fill.style.width = '0'; return; }
    $('.label', box).textContent = d.label || '';
    $('.hint', box).textContent = `[${d.cancelKey || 'X'}] abbrechen · nicht wegbewegen`;
    fill.style.transition = 'none';
    fill.style.width = '0';
    box.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => {
        fill.style.transition = `width ${d.duration}ms linear`;
        fill.style.width = '100%';
    }));
}

function showActionMenu(d) {
    const box = $('#actionMenu');
    box.innerHTML = `<h2>${esc(d.title)}</h2>${arr(d.actions).map(a =>
        `<button class="act" data-a="${esc(a.id)}" ${a.enabled ? '' : 'disabled'}>${esc(a.label)}${a.reason ? `<small>${esc(a.reason)}</small>` : ''}</button>`).join('')}
        <button class="act ghost" data-a="__close">Schliessen (Esc)</button>`;
    box.classList.remove('hidden');
}
function closeActionMenu() {
    $('#actionMenu').classList.add('hidden');
    post('actionClose', {}, true);
}
$('#actionMenu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    if (b.dataset.a === '__close') return closeActionMenu();
    $('#actionMenu').classList.add('hidden');
    post('actionChoose', { action: b.dataset.a });
});

let cardTimer = null;
function showPatientCard(d) {
    const p = d.patient || {};
    const sev = arr(d.severities).find(s => s.id === p.severity) || {};
    const v = p.vitals || {};
    const box = $('#patientCard');
    box.innerHTML = `<div class="row"><b class="grow" style="font-size:15px">${esc(d.name || 'Patient')}</b><span class="dim">Sichtung</span></div>
        <div class="mt-s"><span class="sev" style="background:${esc(sev.color || '#888')}"></span>${esc(sev.label || p.severity)}</div>
        <div class="kv"><span class="k">Bewusstsein</span><span>${esc(p.consciousness)}</span>
            <span class="k">Mobilitaet</span><span>${esc(p.mobility)}</span>
            <span class="k">Verletzungen</span><span>${esc(arr(p.injuries).join(', ') || '-')}</span>
            <span class="k">Transport</span><span>${p.transport ? 'erforderlich' : 'nicht erforderlich'}</span></div>
        <div class="vitals"><div><b>${esc(v.puls)}</b><span>Puls</span></div><div><b>${esc(v.rr)}</b><span>RR</span></div>
            <div><b>${esc(v.spo2)}</b><span>SpO2</span></div><div><b>${esc(v.af)}</b><span>AF</span></div><div><b>${esc(v.gcs)}</b><span>GCS</span></div></div>
        ${p.description ? `<div class="mt">${esc(p.description)}</div>` : ''}
        ${p.measures ? `<div class="mt" style="color:var(--accent-2)">Massnahmen: ${esc(p.measures)}</div>` : ''}`;
    box.classList.remove('hidden');
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => box.classList.add('hidden'), 30000);
}

function showInfoPanel(d) {
    const list = arr(d.incidents);
    const box = $('#infoPanel');
    box.innerHTML = `<div class="row"><h2 class="grow">Einsatzinformationen</h2><button data-i="close">Schliessen (Esc)</button></div>
        <div class="body">${list.map(i => `<div class="inc">
            <div class="row"><span class="badge ${i.mode === 'live' ? 'live' : 'test'}">${i.mode === 'live' ? 'LIVE' : 'TEST'}</span>
                <b style="font-size:15px">${esc(i.keyword || i.name)}</b>
                <button class="small right" data-i="route" data-x="${i.center ? i.center.x : 0}" data-y="${i.center ? i.center.y : 0}">Route</button></div>
            ${detailsHtml(i)}</div>`).join('')}</div>`;
    box.classList.remove('hidden');
}
function closeInfoPanel() {
    $('#infoPanel').classList.add('hidden');
    post('infoClose', {}, true);
}
$('#infoPanel').addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    if (b.dataset.i === 'close') return closeInfoPanel();
    if (b.dataset.i === 'route') post('infoRoute', { pos: { x: parseFloat(b.dataset.x), y: parseFloat(b.dataset.y) } });
});

/* ------------------------------------------------------------------ */
/* Untertitel (Gespraeche und Befunde der Behandlung)                  */
/* ------------------------------------------------------------------ */
let subQueue = [], subTimer = null;
function showSubtitles(d) {
    const ms = (d && d.ms) || 3500;
    arr(d && d.lines).forEach(l => subQueue.push({ who: l.who, text: l.text, ms }));
    if (!subTimer) nextSubtitle();
}
function nextSubtitle() {
    const box = $('#subtitles');
    const item = subQueue.shift();
    if (!item) { subTimer = null; setTimeout(() => { if (!subTimer) box.innerHTML = ''; }, 400); return; }
    const el = document.createElement('div');
    el.className = `line ${['rd', 'pt', 'info'].includes(item.who) ? item.who : 'info'}`;
    el.textContent = item.text;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    subTimer = setTimeout(nextSubtitle, item.ms);
}
