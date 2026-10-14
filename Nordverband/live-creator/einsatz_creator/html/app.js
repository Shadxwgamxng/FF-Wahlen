/* Einsatz-Creator - NUI (Stil: ignis)
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
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const arr = v => Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []);
const obj = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : (Array.isArray(v) && v.length === 0 ? {} : (v && typeof v === 'object' ? Object.assign({}, v) : {}));
const clone = v => JSON.parse(JSON.stringify(v ?? null));
const icon = (name, extra = '') => `<i class="fa-solid fa-${name} ${extra}"></i>`;

function debounce(fn, ms) {
    let t = null;
    const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    d.flush = (...a) => { clearTimeout(t); fn(...a); };
    return d;
}
function fmtTime(ts) {
    if (!ts) return '–';
    const d = new Date(ts * 1000);
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}. ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function getPath(o, path) { return path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o); }
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
            method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(data),
        });
        const json = await res.json();
        if (!json.ok && !silent && json.error) toast('error', json.error);
        return json;
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

const TOAST_ICON = { success: 'circle-check', error: 'circle-exclamation', warn: 'triangle-exclamation', info: 'circle-info' };
function toast(kind, text) {
    if (!text) return;
    kind = TOAST_ICON[kind] ? kind : 'info';
    const el = document.createElement('div');
    el.className = `toast toast--${kind}`;
    el.innerHTML = `${icon(TOAST_ICON[kind])}<div>${esc(text)}</div>`;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), kind === 'error' ? 6500 : 4200);
    while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
}

const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* */ } },
};

/* ------------------------------------------------------------------ */
/* Zustand                                                             */
/* ------------------------------------------------------------------ */
const S = {
    open: false, catalog: null, config: null, perms: {}, user: '',
    draft: null, meta: null, selected: null, dirty: false, tool: { name: 'select' }, previewHidden: false,
    mode: 'hub', hubPage: 'scenarios', wiz: null,
    page: 'tools', sub: null, tpl: {}, search: {}, scenarioSearch: '',
    scenarios: [], incidents: { active: [], history: [] }, random: null, randomForm: null,
    status: {}, edit: null, snapshot: null, editId: null,
    favs: store.get('ec_favs', { vehicle: [], object: [], ped: [] }),
    pending: {},
};

const KIND = {
    vehicle: { label: 'Fahrzeug', icon: 'car-side' },
    object: { label: 'Objekt', icon: 'cube' },
    ped: { label: 'NPC / Patient', icon: 'user-injured' },
    fire: { label: 'Feuer', icon: 'fire' },
    smoke: { label: 'Rauch', icon: 'smog' },
    marker: { label: 'Position', icon: 'location-dot' },
    area: { label: 'Gebiet', icon: 'circle-dot' },
    door: { label: 'Tür', icon: 'door-closed' },
    spill: { label: 'Betriebsstoff', icon: 'droplet' },
};
const TOOLS = [
    { id: 'select', label: 'Auswahl', icon: 'arrow-pointer' },
    { id: 'center', label: 'Einsatzort', icon: 'crosshairs' },
    { id: 'variant', label: 'Ortsvariante', icon: 'map-location-dot' },
    { id: 'vehicle', label: 'Fahrzeug', icon: 'car-side' },
    { id: 'object', label: 'Objekt', icon: 'cube' },
    { id: 'line', label: 'Absperrlinie', icon: 'road-barrier' },
    { id: 'ped', label: 'Patient', icon: 'user-injured' },
    { id: 'fire', label: 'Feuer', icon: 'fire' },
    { id: 'smoke', label: 'Rauch', icon: 'smog' },
    { id: 'marker', label: 'Position', icon: 'location-dot' },
    { id: 'area', label: 'Gebiet', icon: 'circle-dot' },
    { id: 'door', label: 'Tür', icon: 'door-closed' },
    { id: 'spill', label: 'Betriebsstoff', icon: 'droplet' },
];
const TOOL_NAMES = {
    select: 'Auswahl', place: 'Setzen', move: 'Verschieben', center: 'Einsatzort', line: 'Absperrlinie',
    door: 'Tür wählen', pickTarget: 'Koppeln', pickVehicle: 'Fahrzeug wählen', variant: 'Ortsvariante',
};
// Seiten beim Bauen der Szene (mit Kamera)
const PAGES = [
    { id: 'place', label: 'Einsatzort', icon: 'crosshairs', eyebrow: 'Szene', desc: 'Hauptposition festlegen und optionale Ortsvarianten setzen.' },
    { id: 'tools', label: 'Werkzeuge', icon: 'shapes', eyebrow: 'Szene', desc: 'Elemente in die Welt setzen. Rechte Maustaste dreht die Kamera.' },
    { id: 'elements', label: 'Elemente', icon: 'layer-group', eyebrow: 'Szene', desc: 'Alle gesetzten Elemente dieses Szenarios.' },
];
// Seiten der Übersicht (ohne Kamera)
const HUB_PAGES = [
    { id: 'scenarios', label: 'Einsätze', icon: 'folder-open', desc: 'Gespeicherte Einsätze bearbeiten, testen oder an die Leitstelle übergeben.' },
    { id: 'active', label: 'Laufende Einsätze', icon: 'tower-broadcast', desc: 'Aktive Einsätze in der Welt steuern und beenden.' },
    { id: 'random', label: 'Zufallseinsätze', icon: 'shuffle', desc: 'Einsätze automatisch aus dem Pool erzeugen und an EmergencyDispatch übergeben.' },
];
const VEH_TYPES = ['automobile', 'bike', 'boat', 'heli', 'plane', 'trailer', 'train', 'submarine'];
const SEATS = [[-1, 'Fahrer'], [0, 'Beifahrer'], [1, 'Hinten links'], [2, 'Hinten rechts'], [3, 'Sitz 4'], [4, 'Sitz 5']];

/* ------------------------------------------------------------------ */
/* Formularbausteine                                                   */
/* ------------------------------------------------------------------ */
const field = (label, control, hint) => `<label class="field"><span class="field__label">${esc(label)}</span>${control}${hint ? `<span class="field__hint">${hint}</span>` : ''}</label>`;
function fText(label, path, value, o = {}) {
    return field(label, `<input class="input" type="text" data-path="${path}" data-type="text" value="${esc(value ?? '')}" maxlength="${o.max || 200}" ${o.list ? `list="${o.list}"` : ''} placeholder="${esc(o.ph || '')}">`, o.hint);
}
function fArea(label, path, value, o = {}) {
    return field(label, `<textarea class="textarea" data-path="${path}" data-type="text" rows="${o.rows || 3}" maxlength="${o.max || 1500}" placeholder="${esc(o.ph || '')}">${esc(value ?? '')}</textarea>`, o.hint);
}
function fNum(label, path, value, o = {}) {
    return field(label, `<input class="input" type="number" data-path="${path}" data-type="${o.int ? 'int' : 'num'}" value="${value ?? 0}" step="${o.step || 1}" ${o.min !== undefined ? `min="${o.min}"` : ''} ${o.max !== undefined ? `max="${o.max}"` : ''}>`, o.hint);
}
function fSel(label, path, value, options, o = {}) {
    const opts = options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('');
    return field(label, `<select class="select" data-path="${path}" data-type="${o.type || 'text'}">${opts}</select>`, o.hint);
}
const fSwitch = (label, path, value) => `<label class="switch"><input type="checkbox" data-path="${path}" data-type="bool" ${value ? 'checked' : ''}><span>${esc(label)}</span></label>`;
const section = (title, body, extra = '') => `<div class="stack"><div class="section-title">${title}${extra}</div>${body}</div>`;

function readInput(el) {
    const t = el.dataset.type;
    if (t === 'bool') return el.checked;
    if (t === 'num') { const v = parseFloat(String(el.value).replace(',', '.')); return isNaN(v) ? undefined : v; }
    if (t === 'int') { const v = parseInt(el.value, 10); return isNaN(v) ? undefined : v; }
    if (t === 'nullable') return el.value === '' ? null : el.value;
    return el.value;
}
function panelBusy(sel) {
    const a = document.activeElement;
    return a && a.closest && a.closest(sel) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName);
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
        case 'incidents': S.incidents = normIncidents(data); if (S.mode === 'hub') renderHub(); break;
        case 'toast': toast(data.kind, data.text); break;
        case 'prompt': showPrompt(data); break;
        case 'progress': showProgress(data); break;
        case 'actionMenu': showActionMenu(data); break;
        case 'patientCard': showPatientCard(data); break;
        case 'infoPanel': showInfoPanel(data); break;
        case 'subtitles': showSubtitles(data); break;
        case 'minigame': Game.open(data); break;
        case 'minigameValue': Game.value(data); break;
        case 'monitor': Monitor.show(data); break;
    }
});

const normIncidents = d => ({ active: arr(d && d.active), history: arr(d && d.history) });

function onEditorOpen(d) {
    S.open = true;
    S.catalog = d.catalog;
    S.config = d.config;
    S.perms = d.perms || {};
    S.user = d.user || '';
    S.scenarios = arr(d.scenarios);
    S.incidents = normIncidents(d.incidents);
    S.sub = null;
    S.wiz = null;
    initTemplates();
    $('#editor').classList.remove('hidden');
    $('#wizard').classList.add('hidden');
    showMode('hub');
}

function onEditorClose() {
    S.open = false;
    closeDialog();
    S.wiz = null;
    $('#wizard').classList.add('hidden');
    $('#editor').classList.add('hidden');
}

/* Übersicht <-> Szene */
function showMode(mode) {
    S.mode = mode;
    $('#hub').classList.toggle('hidden', mode !== 'hub');
    $('#scene').classList.toggle('hidden', mode !== 'scene');
    if (mode === 'hub') { refreshHubData(); renderHub(); } else { renderTop(); renderRail(); renderPanel(true); renderInspector(true); }
}
async function setMode(mode) {
    await post('setMode', { mode }, true);
    showMode(mode);
}
async function goHub() {
    flushEdits();
    if (S.dirty) {
        const choice = await buttonsBox('Zurück zur Übersicht', 'Es gibt ungespeicherte Änderungen an diesem Einsatz.',
            [['cancel', 'Abbrechen', 'ghost'], ['discard', 'Verwerfen', 'ghost-danger'], ['save', 'Speichern', 'primary']]);
        if (!choice || choice === 'cancel') return;
        if (choice === 'save') { const ok = await saveScenario(); if (!ok) return; }
    }
    await post('newScenario', {}, true);
    S.hubPage = 'scenarios';
    await setMode('hub');
}
async function openScenario(id, copy) {
    const r = await post('loadScenario', { id, copy });
    if (!r.ok) return;
    S.page = 'tools';
    S.sub = null;
    await setMode('scene');
}

function onState(d) {
    const prev = S.selected;
    S.draft = d.draft;
    S.draft.info = S.draft.info || {};
    S.draft.info.custom = obj(S.draft.info.custom);
    S.draft.elements = arr(S.draft.elements);
    S.draft.variants = arr(S.draft.variants);
    S.meta = d.meta || null;
    S.selected = d.selected || null;
    S.dirty = !!d.dirty;
    S.tool = d.tool || { name: 'select' };
    S.previewHidden = !!d.previewHidden;
    const el = S.selected ? S.draft.elements.find(x => x.id === S.selected) : null;
    if (S.selected !== prev) S.snapshot = el ? clone(el) : null;
    if (!el) { S.edit = null; S.editId = null; }
    else if (!panelBusy('#inspector') || S.editId !== el.id) { S.edit = clone(el); S.editId = el.id; }
    if (S.mode !== 'scene') return;
    renderTop();
    renderRail();
    renderPanel();
    renderInspector();
}

function onStatus(d) {
    S.status = d || {};
    const s = S.status;
    const c = s.cursor ? `${s.cursor.x.toFixed(1)}  ${s.cursor.y.toFixed(1)}  ${s.cursor.z.toFixed(1)}` : '–';
    const far = s.centerDist != null && s.maxDist && s.centerDist > s.maxDist * 0.9;
    const hint = String(s.hint || '').split('|').map(part => {
        const [k, ...rest] = part.split(':');
        return rest.length ? `<span class="kbd">${esc(k.trim())}</span><span>${esc(rest.join(':').trim())}</span>` : `<span>${esc(part.trim())}</span>`;
    }).join('<span class="dim">·</span>');
    $('#statusbar').innerHTML = `
        <span>${icon('arrow-pointer')} <b>${esc(TOOL_NAMES[s.tool] || s.tool || '–')}</b></span>
        <span class="hint">${hint}</span>
        <span class="mono">${esc(c)}</span>
        <span class="${far ? 'warn' : ''}">${s.centerDist != null ? `${icon('crosshairs')} ${s.centerDist} m` : 'kein Einsatzort'}</span>`;
}

/* ------------------------------------------------------------------ */
/* Vorlagen der Werkzeuge                                              */
/* ------------------------------------------------------------------ */
function initTemplates() {
    const d = S.catalog.defaults;
    S.tpl = {
        vehicle: { model: null, label: '', props: Object.assign(clone(d.vehicle), { damage: 2, hazard: true }) },
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
}
function activateTemplate(kind) {
    const t = S.tpl[kind];
    if (kind === 'line') {
        if (!t.model) return toast('error', 'Bitte ein Objekt für die Linie wählen');
        return post('setTool', { name: 'line', template: { model: t.model, label: t.label, spacing: t.spacing, props: t.props, rot: { x: 0, y: 0, z: 0 } } });
    }
    if (kind === 'door') return post('setTool', { name: 'door', template: { label: t.label, props: t.props } });
    if (['vehicle', 'object', 'ped'].includes(kind) && !t.model) return toast('error', 'Bitte zuerst ein Modell wählen');
    return post('setTool', { name: 'place', kind, template: { model: t.model, label: t.label, props: t.props, rot: { x: 0, y: 0, z: 0 } } });
}
const refreshPlaceTool = debounce(kind => { if (S.tool.name === 'place' && S.tool.kind === kind) activateTemplate(kind); }, 350);

/* ------------------------------------------------------------------ */
/* Topbar                                                              */
/* ------------------------------------------------------------------ */
function renderTop() {
    if (!S.draft || panelBusy('#topbar')) return;
    const cat = arr(S.catalog.categories).find(c => c.id === S.draft.category);
    const initials = (S.user || '?').split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
    $('#topbar').innerHTML = `
        <button class="btn btn--ghost btn--sm" data-act="hub">${icon('arrow-left')} Übersicht</button>
        <span class="topbar__sep"></span>
        <div class="crumbs">
            <span class="crumbs__title">${esc(S.draft.name || 'Unbenannter Einsatz')}</span>
            ${cat ? `<span class="chip chip--outline">${esc(cat.label)}</span>` : ''}
            ${S.draft.keyword ? `<span class="chip">${esc(S.draft.keyword)}</span>` : ''}
            ${S.draft.id ? `<span class="chip mono">${esc(S.draft.id)}</span>` : '<span class="chip">Neu</span>'}
            ${S.dirty ? '<span class="chip chip--warn chip--dot">Ungespeichert</span>' : (S.draft.id ? '<span class="chip chip--ok chip--dot">Gespeichert</span>' : '')}
        </div>
        <div class="topbar__spacer"></div>
        <button class="btn btn--ghost btn--sm" data-act="info">${icon('file-pen')} Einsatzdaten</button>
        <button class="btn btn--ghost btn--sm ${S.previewHidden ? '' : 'is-on'}" data-act="preview">${icon(S.previewHidden ? 'eye-slash' : 'eye')} Vorschau</button>
        <span class="topbar__sep"></span>
        <button class="btn btn--sm" data-act="save">${icon('floppy-disk')} Speichern</button>
        <button class="btn btn--sm" data-act="test" ${S.perms.test ? '' : 'disabled'}>${icon('flask')} Testen</button>
        <button class="btn btn--primary btn--sm" data-act="live" ${S.perms.live ? '' : 'disabled'}>${icon('paper-plane')} An Leitstelle übergeben</button>
        <span class="topbar__sep"></span>
        <span class="user"><span class="avatar">${esc(initials)}</span>${esc(S.user)}</span>`;
}

$('#topbar').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'hub') goHub();
    else if (act === 'info') openWizard('edit');
    else if (act === 'save') saveScenario();
    else if (act === 'preview') post('togglePreview');
    else if (act === 'test') triggerIncident('test');
    else if (act === 'live') triggerIncident('live');
});
$('#topbar').addEventListener('input', e => handleBound(e.target, 'input'));
$('#topbar').addEventListener('change', e => handleBound(e.target, 'change'));

async function saveScenario() {
    flushEdits();
    const missing = missingInfo(S.draft);
    if (missing.length) { toast('error', `Bitte zuerst ausfüllen: ${missing.map(m => m.label).join(', ')}`); openWizard('edit', missing[0].step); return false; }
    if (!S.draft.center) { toast('error', 'Bitte zuerst den Einsatzort festlegen'); S.page = 'place'; renderRail(); renderPanel(true); return false; }
    const r = await post('saveScenario');
    if (r.ok) {
        toast('success', `Einsatz gespeichert (${r.data.id})`);
        if (r.data.scenarios) S.scenarios = arr(r.data.scenarios);
    }
    return r.ok;
}

async function triggerIncident(mode) {
    flushEdits();
    const missing = missingInfo(S.draft);
    if (missing.length) { toast('error', `Bitte zuerst ausfüllen: ${missing.map(m => m.label).join(', ')}`); return openWizard('edit', missing[0].step); }
    if (!S.draft.center) { toast('error', 'Bitte zuerst den Einsatzort festlegen'); S.page = 'place'; renderRail(); return renderPanel(true); }
    const variant = await chooseVariant(arr(S.draft.variants));
    if (variant === null) return;
    if (mode === 'live') {
        const ok = await confirmBox('An Leitstelle übergeben',
            `„${S.draft.name || 'Unbenannt'}“ wird in der Welt aufgebaut und als Notruf an ${dispatchLabel(S.draft.info.dispatchJob)} übergeben. Die Alarmierung der Fahrzeuge erfolgt in EmergencyDispatch.` +
            (S.dirty ? ' Es wird der aktuelle, ungespeicherte Stand verwendet.' : ''), 'Übergeben', 'primary');
        if (!ok) return;
    }
    toast('info', mode === 'live' ? 'Einsatz wird aufgebaut …' : 'Testaufbau läuft …');
    const r = await post('trigger', { mode, variant });
    if (r.ok) {
        toast('success', mode === 'live' ? `Einsatz ${r.data.id} an EmergencyDispatch übergeben` : `Testeinsatz ${r.data.id} aufgebaut (keine Alarmierung)`);
        if (r.data.warnings > 0) toast('warn', `${r.data.warnings} Element(e) konnten nicht erzeugt werden`);
        if (r.data.incidents) S.incidents = normIncidents(r.data.incidents);
    }
}

// Ortsvariante wählen (0 = Original). Rückgabe null = abgebrochen
async function chooseVariant(vars) {
    if (!vars.length) return 0;
    const v = await chooseBox('Einsatzort wählen', 'Für diesen Einsatz gibt es Ortsvarianten.',
        [['0', 'Originalort'], ['random', 'Zufällig'], ...vars.map((x, i) => [String(i + 1), `Variante ${i + 1} – ${x.label || ''}`])]);
    if (v === null) return null;
    return v === 'random' ? 'random' : parseInt(v, 10);
}

const dispatchLabel = job => ((arr(S.config && S.config.dispatchJobs).find(j => j.job === job)) || {}).label || job || 'EmergencyDispatch';

async function triggerSaved(id, mode) {
    const sc = S.scenarios.find(x => x.id === id);
    const variant = await chooseVariant(arr(sc && sc.variants));
    if (variant === null) return;
    if (mode === 'live') {
        const ok = await confirmBox('An Leitstelle übergeben',
            `„${sc ? sc.name : id}“ wird in der Welt aufgebaut und als Notruf an ${dispatchLabel(sc && sc.dispatchJob)} übergeben.`, 'Übergeben', 'primary');
        if (!ok) return;
    }
    toast('info', mode === 'live' ? 'Einsatz wird aufgebaut …' : 'Testaufbau läuft …');
    const r = await post('triggerScenario', { id, mode, variant });
    if (r.ok) {
        toast('success', mode === 'live' ? `Einsatz ${r.data.id} an EmergencyDispatch übergeben` : `Testeinsatz ${r.data.id} aufgebaut (keine Alarmierung)`);
        if (r.data.warnings > 0) toast('warn', `${r.data.warnings} Element(e) konnten nicht erzeugt werden`);
        if (r.data.incidents) S.incidents = normIncidents(r.data.incidents);
        S.hubPage = 'active';
        renderHub();
    }
}

async function requestClose() {
    post('close');
}

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */
function renderRail() {
    if (!S.open) return;
    $('#rail').innerHTML = PAGES.map(p => `<button class="rail__item ${S.page === p.id ? 'is-active' : ''}" data-page="${p.id}">
            ${icon(p.icon)}${p.id === 'place' && !(S.draft && S.draft.center) ? '<span class="rail__count">!</span>' : ''}
            <span class="rail__tip">${esc(p.label)}</span></button>`).join('') +
        `<button class="rail__item" data-page="info">${icon('file-pen')}<span class="rail__tip">Einsatzdaten</span></button>
         <div class="rail__spacer"></div>
         <button class="rail__item" data-page="help">${icon('keyboard')}<span class="rail__tip">Tastenbelegung</span></button>`;
}

$('#rail').addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]');
    if (!b) return;
    if (b.dataset.page === 'help') return showHelp();
    if (b.dataset.page === 'info') return openWizard('edit');
    S.page = b.dataset.page;
    renderRail();
    renderPanel(true);
});

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */
function renderPanel(force) {
    if (S.mode === 'hub') return renderHub();
    if (!S.open || !S.draft) return;
    if (!force && panelBusy('#panel')) { S.pending.panel = true; return; }
    S.pending.panel = false;
    const p = PAGES.find(x => x.id === S.page) || PAGES[0];
    $('#panelHead').innerHTML = `<div class="eyebrow">${esc(p.eyebrow)}</div><div class="page-title">${esc(p.label)}</div><div class="page-desc">${esc(p.desc)}</div>`;
    const body = $('#panelBody');
    const scroll = body.scrollTop;
    body.innerHTML = ({ tools: pageTools, place: pagePlace, elements: pageElements })[S.page]();
    body.scrollTop = scroll;
}

/* ----- Werkzeuge ----- */
function pageTools() {
    const active = S.tool.name === 'place' ? S.tool.kind : S.tool.name;
    const tiles = TOOLS.map(t => {
        const on = S.sub ? S.sub === t.id : t.id === active;
        return `<div class="tool ${on ? 'is-active' : ''}" data-tool="${t.id}">${icon(t.icon)}${esc(t.label)}</div>`;
    }).join('');
    let html = `<div class="tools">${tiles}</div>`;
    if (S.sub) html += `<div class="card"><div class="card__header">${icon(KIND[S.sub] ? KIND[S.sub].icon : 'road-barrier')}<span class="card__title">${esc(toolTitle(S.sub))}</span></div>
        <div class="card__body" data-scope="tpl:${S.sub}">${toolPanel(S.sub)}</div></div>`;
    else html += `<div class="alert alert--info">${icon('circle-info')}<div>Werkzeug wählen und in die Welt klicken. <b>W A S D</b> bewegt die Kamera, <b>Q / E</b> Höhe, <b>Shift / Strg</b> Tempo, rechte Maustaste dreht.</div></div>`;
    return html;
}
const toolTitle = id => (TOOLS.find(t => t.id === id) || {}).label || id;

function modelList(kind, cats) {
    const q = (S.search[kind] || '').trim().toLowerCase();
    const t = S.tpl[kind];
    const favs = S.favs[kind === 'line' ? 'object' : kind] || [];
    const row = (m, ok) => `<div class="model ${ok ? '' : 'is-na'} ${t.model === m ? 'is-active' : ''}" data-model="${esc(m)}" data-ok="${ok ? 1 : 0}">
        <span>${esc(m)}</span><span class="model__fav ${favs.includes(m) ? 'is-on' : ''}" data-fav="${esc(m)}">${icon('star')}</span></div>`;
    let html = '';
    const favRows = favs.filter(m => !q || m.includes(q)).map(m => row(m, true)).join('');
    if (favRows) html += `<div class="list__group">${icon('star')} Favoriten</div>${favRows}`;
    for (const c of arr(cats)) {
        const ms = arr(c.models).filter(x => !q || x.model.toLowerCase().includes(q) || c.label.toLowerCase().includes(q));
        if (ms.length) html += `<div class="list__group">${esc(c.label)}<span class="count">${ms.length}</span></div>` + ms.map(x => row(x.model, x.ok)).join('');
    }
    return `<div class="input-group">${icon('magnifying-glass')}<input class="input" type="text" data-search="${kind}" placeholder="Spawnname suchen" value="${esc(S.search[kind] || '')}"></div>
        <div class="list list--scroll scroll">${html || '<div class="empty">Keine Treffer</div>'}</div>
        <div class="input-group input-group--btn"><input class="input" type="text" data-custom="${kind}" placeholder="Eigener Spawnname"><button class="btn btn--sm" data-act="custom" data-kind="${kind}">Prüfen</button></div>`;
}

function toolPanel(kind) {
    const C = S.catalog;
    const t = S.tpl[kind];
    const p = t.props;
    const place = (label, ic = 'plus') => `<button class="btn btn--primary btn--block" data-act="place" data-kind="${kind}">${icon(ic)} ${esc(label)}</button>`;
    switch (kind) {
        case 'vehicle':
            return `${modelList('vehicle', C.vehicles)}
                ${fSel('Schaden', 'props.damage', p.damage, arr(C.damageLevels).map(d => [d.id, d.label]), { type: 'int' })}
                <div class="switches">${fSwitch('Warnblinker', 'props.hazard', p.hazard)}${fSwitch('Licht an', 'props.lights', p.lights)}
                ${fSwitch('Verschlossen', 'props.locked', p.locked)}${fSwitch('Fixiert', 'props.frozen', p.frozen)}
                ${fSwitch('Türen offen', 'props.doorsOpen', p.doorsOpen)}${fSwitch('Scheiben kaputt', 'props.windowsBroken', p.windowsBroken)}
                ${fSwitch('Reifen platt', 'props.tyresBurst', p.tyresBurst)}${fSwitch('Motor aus', 'props.engineOff', p.engineOff)}</div>
                ${place(t.model ? `${t.model} setzen` : 'Modell wählen')}`;
        case 'object':
            return `${modelList('object', C.props)}<div class="switches">${fSwitch('Fixiert', 'props.frozen', p.frozen)}${fSwitch('Kollision', 'props.collision', p.collision)}</div>
                ${place(t.model ? `${t.model} setzen` : 'Modell wählen')}`;
        case 'line':
            return `${modelList('line', C.props)}${fNum('Abstand in Metern', 'spacing', t.spacing, { step: 0.25, min: 0.5, max: 10, hint: 'Start- und Endpunkt in der Welt anklicken, Mausrad ändert den Abstand.' })}
                ${place('Linie ziehen', 'road-barrier')}`;
        case 'ped':
            return `${modelList('ped', C.peds)}
                ${fSel('Haltung', 'props.pose', p.pose, arr(C.poses).filter(x => !x.vehicle).map(x => [x.id, x.label]))}
                ${C.medical && C.medical.enabled ? fSel('Meldebild', 'props.patient.profile', p.patient.profile, arr(C.medical.profiles).map(x => [x.id, x.label])) : ''}
                <div class="grid-2">${fSel('Schweregrad', 'props.patient.severity', p.patient.severity, arr(C.severities).map(s => [s.id, s.label]))}
                ${fSel('Mobilität', 'props.patient.mobility', p.patient.mobility, arr(C.mobility).map(x => [x, x]))}</div>
                <div class="switches">${fSwitch('Ist Patient', 'props.isPatient', p.isPatient)}${fSwitch('Zufälliges Modell', 'props.randomModel', p.randomModel)}</div>
                ${place(t.model ? `${t.model} setzen` : 'Modell wählen')}`;
        case 'fire': return `${fireFields(p, 'props.')}${place('Brandherd setzen', 'fire')}`;
        case 'smoke': return `${smokeFields(p, 'props.')}${place('Rauchquelle setzen', 'smog')}`;
        case 'marker': return `${fText('Bezeichnung', 'label', t.label, { max: 48 })}${markerFields(p, 'props.')}${place('Position setzen', 'location-dot')}`;
        case 'area': return `${fText('Bezeichnung', 'label', t.label, { max: 48 })}${areaFields(p, 'props.')}${place('Gebiet setzen', 'circle-dot')}`;
        case 'door': return `${doorFields(p, 'props.')}<div class="field__hint">Eine echte Tür in der Welt anklicken. Sie bleibt verriegelt, bis sie geöffnet wird.</div>${place('Tür anklicken', 'door-closed')}`;
        case 'spill': return `${spillFields(p, 'props.')}${place('Betriebsstoff setzen', 'droplet')}`;
    }
    return '';
}

const isZFire = () => S.config && S.config.fireBackend === 'z_fire';
const ZF_NAME = { vehicle: 'Fahrzeugbrand', prop: 'Objektbrand', interior: 'Innenraumbrand', grass: 'Flächenbrand' };
const ZF_HINT = {
    auto: 'Das Brandverhalten wird automatisch bestimmt: auf ein Fahrzeug/Objekt klicken = Fahrzeug-/Objektbrand, in einem Gebäude = Innenraumbrand, draußen = Flächenbrand. Objektbrände nur an Brandobjekten (Müllcontainer, Tonnen, Reifen, Grill).',
    vehicle: 'Direkt auf ein gesetztes Fahrzeug klicken.',
    prop: 'Direkt auf ein gesetztes Objekt klicken.',
    interior: 'Nur innerhalb eines Gebäudes (Raum wird automatisch erkannt).',
    grass: 'Nur im Freien.',
};
function zfResolved(p) {
    const t = p.attachTo && S.draft ? S.draft.elements.find(x => x.id === p.attachTo) : null;
    if (t && t.kind === 'vehicle') return 'vehicle';
    if (t && t.kind === 'object') return 'prop';
    if (p.roomHash) return 'interior';
    return 'grass';
}
function fireFields(p, pre, withRoom) {
    const C = S.catalog;
    if (isZFire()) {
        const zf = S.config.zfire || {};
        return `${zf.running ? '' : `<div class="alert alert--warn">${icon('triangle-exclamation')}<div>z_fire ist nicht gestartet.</div></div>`}
            ${fSel('Partikeltyp', pre + 'zfEffect', p.zfEffect, arr(zf.fireEffects).map(x => [x, x]))}
            <div class="field__hint">${withRoom ? `Brandverhalten: <b>${esc(ZF_NAME[zfResolved(p)])}</b> (wird automatisch bestimmt)` : ZF_HINT.auto}</div>
            <div class="grid-2">${fNum('Größe', pre + 'size', p.size, { step: 0.1, min: 0.2, max: 5 })}
            ${fNum('Brenndauer (s)', pre + 'burnTime', p.burnTime, { int: true, min: 0, max: 7200, hint: '0 = bis gelöscht' })}</div>
            ${fSwitch('Ausbreitung', pre + 'canSpread', p.canSpread)}
            ${p.canSpread ? fNum('Ausbreitungsradius (m)', pre + 'spreadRadius', p.spreadRadius, { step: 1, min: 1, max: 40 }) : ''}

            ${fSel('Darstellung in der Vorschau', pre + 'fireType', p.fireType, arr(C.fireTypes).map(f => [f.id, f.label]))}`;
    }
    const smoke = [['auto', 'Automatisch'], ['none', 'Kein Rauch'], ...arr(C.smokeTypes).map(s => [s.id, s.label])];
    return `${fSel('Feuerart', pre + 'fireType', p.fireType, arr(C.fireTypes).map(f => [f.id, f.label]))}
        <div class="grid-2">${fNum('Größe', pre + 'size', p.size, { step: 0.1, min: 0.2, max: 5 })}
        ${fNum('Brenndauer (s)', pre + 'burnTime', p.burnTime, { int: true, min: 0, max: 7200, hint: '0 = bis gelöscht' })}</div>
        ${fSel('Rauch', pre + 'smoke', p.smoke, smoke)}
        <div class="switches">${fSwitch('Glutnester', pre + 'smoulder', p.smoulder)}${fSwitch('Ausbreitung', pre + 'canSpread', p.canSpread)}</div>
        ${p.canSpread ? `<div class="grid-3">${fNum('Radius (m)', pre + 'spreadRadius', p.spreadRadius, { min: 1, max: 40 })}
        ${fNum('Max. Herde', pre + 'maxSpread', p.maxSpread, { int: true, min: 0, max: 20 })}
        ${fNum('Takt (s)', pre + 'spreadInterval', p.spreadInterval, { int: true, min: 10, max: 600 })}</div>` : ''}`;
}
function smokeFields(p, pre) {
    const C = S.catalog;
    if (isZFire()) {
        const zf = S.config.zfire || {};
        return `<div class="grid-2">${fSel('Partikeltyp', pre + 'zfEffect', p.zfEffect, arr(zf.smokeEffects).map(x => [x, x]))}
            ${fNum('Größe', pre + 'size', p.size, { step: 0.1, min: 0.2, max: 5 })}</div>
            ${fSwitch('Verzieht sich mit der Zeit', pre + 'zfDisperse', p.zfDisperse)}
            ${fSel('Darstellung in der Vorschau', pre + 'smokeType', p.smokeType, arr(C.smokeTypes).map(s => [s.id, s.label]))}`;
    }
    return `${fSel('Rauchart', pre + 'smokeType', p.smokeType, arr(C.smokeTypes).map(s => [s.id, s.label]))}
        <div class="grid-2">${fNum('Größe', pre + 'size', p.size, { step: 0.1, min: 0.2, max: 5 })}
        ${fSel('Intensität', pre + 'density', p.density, [[1, 'Leicht'], [2, 'Mittel'], [3, 'Stark']], { type: 'int' })}</div>
        ${fSwitch('Verschwindet, wenn alle Feuer gelöscht sind', pre + 'untilFiresOut', p.untilFiresOut)}`;
}
const markerFields = (p, pre) => `${fSel('Art', pre + 'markerKind', p.markerKind, arr(S.catalog.markerKinds).map(k => [k.id, k.label]))}
    ${fArea('Beschreibung', pre + 'description', p.description, { max: 400, rows: 2 })}
    <div class="switches">${fSwitch('Auf Karte zeigen', pre + 'blip', p.blip)}${fSwitch('Fundstelle sichern', pre + 'interactive', p.interactive)}</div>`;
const areaFields = (p, pre) => `<div class="grid-2">${fSel('Art', pre + 'areaKind', p.areaKind, arr(S.catalog.areaKinds).map(k => [k.id, k.label]))}
    ${fNum('Radius (m)', pre + 'radius', p.radius, { step: 5, min: 5, max: 500 })}</div>${fSwitch('Auf Karte zeigen', pre + 'blip', p.blip)}`;
const doorFields = (p, pre) => `${fSel('Dringlichkeit', pre + 'urgency', p.urgency, [['dringend', 'Dringend'], ['nicht dringend', 'Nicht dringend']])}
    ${fArea('Beschreibung', pre + 'description', p.description, { max: 300, rows: 2 })}${fSwitch('Echte Tür verriegeln', pre + 'lockRealDoor', p.lockRealDoor)}`;
const spillFields = (p, pre) => `<div class="grid-2">${fSel('Stoff', pre + 'spillKind', p.spillKind, arr(S.catalog.spillKinds).map(k => [k.id, k.label]))}
    ${fNum('Breite (m)', pre + 'width', p.width, { step: 0.25, min: 0.5, max: 8 })}</div>`;

/* ----- Einsatzort (Szene) ----- */
function pagePlace() {
    const d = S.draft;
    const info = d.info;
    const center = d.center ? `${d.center.x.toFixed(1)}  ${d.center.y.toFixed(1)}  ${d.center.z.toFixed(1)}` : null;
    return `${center ? '' : `<div class="alert alert--warn">${icon('crosshairs')}<div><b>Einsatzort fehlt.</b> „Festlegen“ wählen und in die Welt klicken. Erst danach kann der Einsatz gespeichert werden.</div></div>`}
        <div class="card"><div class="card__header">${icon('crosshairs')}<span class="card__title">Einsatzort</span>
            ${center ? `<span class="chip mono" style="margin-left:auto">${esc(center)}</span>` : ''}</div>
        <div class="card__body" data-scope="info">
            <div class="row"><button class="btn btn--sm ${center ? '' : 'btn--primary'}" data-act="setCenter">${icon('crosshairs')} Festlegen</button>
                <button class="btn btn--sm btn--ghost" data-act="camCenter" ${center ? '' : 'disabled'}>${icon('video')} Kamera hin</button></div>
            ${fText('Adresse / Ortsbeschreibung', 'info.address', info.address, { max: 120, hint: 'Wird beim Festlegen automatisch aus der Karte ergänzt.' })}
        </div></div>

        <div class="card"><div class="card__header">${icon('map-location-dot')}<span class="card__title">Ortsvarianten</span><span class="chip" style="margin-left:auto">${d.variants.length}</span></div>
        <div class="card__body">
            <div class="field__hint">Optional. Beim Auslösen kann die ganze Szene an einen dieser Orte verschoben werden. Zufallseinsätze wählen zufällig.</div>
            ${d.variants.length ? `<div class="list">${d.variants.map((v, i) => `<div class="list__item list__item--tight" data-variant="${i}">
                <span class="list__icon mono">${i + 1}</span>
                <div class="grow"><input class="input" type="text" data-vfield="label" value="${esc(v.label || '')}" maxlength="48"></div>
                <input class="input" type="number" data-vfield="h" value="${Math.round(v.h || 0)}" style="width:56px;flex:none" title="Drehung in Grad">
                <button class="btn btn--ghost btn--icon btn--sm" data-act="varCam" data-i="${i}" title="Kamera">${icon('video')}</button>
                <button class="btn btn--ghost-danger btn--icon btn--sm" data-act="varDel" data-i="${i}" title="Entfernen">${icon('trash')}</button></div>`).join('')}</div>` : ''}
            <div class="row"><button class="btn btn--sm" data-act="varAdd" ${center ? '' : 'disabled'}>${icon('plus')} Ortsvariante setzen</button>
                <button class="btn btn--sm btn--ghost" data-act="varBack">${icon('rotate-left')} Zum Original</button></div>
        </div></div>`;
}

/* ------------------------------------------------------------------ */
/* Assistent: neuer Einsatz / Einsatzdaten bearbeiten                  */
/* ------------------------------------------------------------------ */
const WIZ_STEPS = [
    { id: 'basis', label: 'Einsatz', title: 'Einsatz', desc: 'Art, Name und Stichwort des Einsatzes.' },
    { id: 'dispatch', label: 'Leitstelle', title: 'Übergabe an EmergencyDispatch', desc: 'Welche Leitstelle den Notruf bekommt und was der Anrufer meldet.' },
    { id: 'lage', label: 'Lage', title: 'Lage', desc: 'Was die Einsatzkräfte vor Ort erwartet.' },
    { id: 'check', label: 'Prüfen', title: 'Zusammenfassung', desc: 'Alles prüfen. Danach wird die Szene in der Welt gebaut.' },
];

// Pflichtangaben. Rückgabe: Liste { key, label, step }
function missingInfo(d) {
    if (!d) return [];
    const info = d.info || {};
    const out = [];
    const need = (ok, key, label, step) => { if (!ok) out.push({ key, label, step }); };
    need(String(d.name || '').trim(), 'name', 'Einsatzname', 'basis');
    need(String(d.keyword || '').trim(), 'keyword', 'Stichwort', 'basis');
    need(String(info.dispatchJob || '').trim(), 'info.dispatchJob', 'Leitstelle', 'dispatch');
    need(String(info.alarmText || '').trim(), 'info.alarmText', 'Notrufmeldung', 'dispatch');
    need(String(info.description || '').trim(), 'info.description', 'Einsatzbeschreibung', 'lage');
    return out;
}

function openWizard(mode, step) {
    const d = mode === 'edit' && S.draft ? S.draft : null;
    const jobs = arr(S.config.dispatchJobs);
    const cats = arr(S.catalog.categories);
    const base = d ? { category: d.category, name: d.name, keyword: d.keyword, priority: d.priority, info: clone(d.info) } : {
        category: (cats[0] || {}).id, name: '', keyword: '', priority: 2,
        info: { alarmText: '', description: '', address: '', hazards: '', persons: '', units: [], unitsText: '', notes: '', sop: '', custom: {},
            dispatchJob: S.config.defaultDispatchJob || (jobs[0] || {}).job || '' },
    };
    base.info = Object.assign({ units: [], custom: {} }, base.info);
    base.info.units = arr(base.info.units);
    base.info.custom = obj(base.info.custom);
    if (!base.info.dispatchJob) base.info.dispatchJob = S.config.defaultDispatchJob || (jobs[0] || {}).job || '';
    S.wiz = { mode, step: step || 'basis', data: base, shown: new Set(mode === 'edit' ? WIZ_STEPS.map(x => x.id) : []) };
    $('#wizard').classList.remove('hidden');
    renderWizard();
}
function closeWizard() {
    S.wiz = null;
    $('#wizard').classList.add('hidden');
    $('#wizard').innerHTML = '';
}

function wizField(label, key, control, missing, hint, required) {
    const err = missing.find(m => m.key === key);
    return `<label class="field ${err ? 'has-error' : ''}"><span class="field__label">${esc(label)}${required ? '<span class="req">*</span>' : ''}</span>${control}
        ${err ? `<span class="field__error">Pflichtfeld</span>` : (hint ? `<span class="field__hint">${hint}</span>` : '')}</label>`;
}
const wInput = (path, value, o = {}) => `<input class="input" type="text" data-wpath="${path}" value="${esc(value ?? '')}" maxlength="${o.max || 200}" ${o.list ? `list="${o.list}"` : ''} placeholder="${esc(o.ph || '')}">`;
const wArea = (path, value, o = {}) => `<textarea class="textarea" data-wpath="${path}" rows="${o.rows || 3}" maxlength="${o.max || 1500}" placeholder="${esc(o.ph || '')}">${esc(value ?? '')}</textarea>`;
const wSelect = (path, value, options, type) => `<select class="select" data-wpath="${path}" data-wtype="${type || 'text'}">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

function wizStepBody(step, d, missing) {
    const info = d.info;
    const cats = arr(S.catalog.categories);
    const cat = cats.find(c => c.id === d.category) || {};
    const show = m => S.wiz.shown.has(step) ? m : [];
    const ms = show(missing);
    if (step === 'basis') {
        return `${wizField('Einsatzart', 'category', wSelect('category', d.category, cats.map(c => [c.id, c.label])), ms, null, true)}
            ${wizField('Einsatzname', 'name', wInput('name', d.name, { max: 64, ph: 'z. B. VU B2 Kreuzung Alta Street' }), ms, 'Interner Name, unter dem der Einsatz gespeichert wird.', true)}
            <datalist id="wkw">${arr(cat.keywords).map(k => `<option value="${esc(k)}">`).join('')}</datalist>
            <div class="grid-2">${wizField('Stichwort', 'keyword', wInput('keyword', d.keyword, { max: 64, list: 'wkw', ph: 'z. B. VU - Person eingeklemmt' }), ms, null, true)}
            ${wizField('Priorität', 'priority', wSelect('priority', d.priority, arr(S.catalog.priorities).map(p => [p.value, p.label]), 'int'), ms, null, true)}</div>`;
    }
    if (step === 'dispatch') {
        const jobs = arr(S.config.dispatchJobs);
        return `<div class="alert alert--info">${icon('circle-info')}<div>Der Einsatz wird als <b>ein Notruf</b> an die gewählte Leitstelle in EmergencyDispatch übergeben, mit der Koordinate des Einsatzorts. Alarmiert wird dort.</div></div>
            ${wizField('Leitstelle (EmergencyDispatch-Job)', 'info.dispatchJob', wSelect('info.dispatchJob', info.dispatchJob, jobs.map(j => [j.job, j.label])), ms, null, true)}
            ${wizField('Notrufmeldung', 'info.alarmText', wArea('info.alarmText', info.alarmText, { max: 300, rows: 3, ph: 'Was meldet der Anrufer?' }), ms,
                'Platzhalter: <span class="mono">{anruf}</span> zufälliger Notruftext des Meldebilds · <span class="mono">{patient}</span> · <span class="mono">{ziel}</span>', true)}
            ${wizField('Adresse / Ortsbeschreibung', 'info.address', wInput('info.address', info.address, { max: 120, ph: 'optional' }), ms, 'Optional. Wird beim Festlegen des Einsatzorts automatisch aus der Karte ergänzt.')}`;
    }
    if (step === 'lage') {
        const custom = arr(cat.fields).map(f => {
            const path = `info.custom.${f.key}`;
            const v = info.custom[f.key];
            if (f.type === 'checkbox') return `<label class="switch"><input type="checkbox" data-wpath="${path}" data-wtype="bool" ${v ? 'checked' : ''}><span>${esc(f.label)}</span></label>`;
            if (f.type === 'number') return wizField(f.label, path, `<input class="input" type="number" data-wpath="${path}" data-wtype="int" value="${v ?? 0}" min="0">`, []);
            if (f.type === 'select') return wizField(f.label, path, wSelect(path, v ?? arr(f.options)[0], arr(f.options).map(o => [o, o])), []);
            if (f.type === 'textarea') return wizField(f.label, path, wArea(path, v), []);
            return wizField(f.label, path, wInput(path, v, { max: 160 }), []);
        }).join('');
        const units = arr(info.units);
        return `${wizField('Einsatzbeschreibung', 'info.description', wArea('info.description', info.description, { max: 1500, rows: 4, ph: 'Was ist passiert, was finden die Kräfte vor?' }), ms, null, true)}
            <div class="grid-2">${wizField('Gefahren', 'info.hazards', wArea('info.hazards', info.hazards, { max: 600, rows: 2, ph: 'optional' }), ms)}
            ${wizField('Betroffene Personen', 'info.persons', wArea('info.persons', info.persons, { max: 300, rows: 2, ph: 'optional' }), ms)}</div>
            ${custom ? `<div class="section-title">${esc(cat.label || 'Einsatzart')}</div><div class="grid-2">${custom}</div>` : ''}
            <div class="field"><span class="field__label">Erwartete Einsatzmittel</span><div class="chips">
                ${arr(S.catalog.units).map(u => `<span class="chip chip--toggle ${units.includes(u) ? 'is-on' : ''}" data-wtoggle="info.units" data-value="${esc(u)}">${esc(u)}</span>`).join('')}</div></div>
            ${wizField('Weitere Einsatzmittel', 'info.unitsText', wInput('info.unitsText', info.unitsText, { max: 200, ph: 'optional' }), ms)}
            ${wizField('SOP / Ablaufhinweise', 'info.sop', wArea('info.sop', info.sop, { max: 3000, rows: 3, ph: 'optional' }), ms, 'Für Einsatzkräfte über /einsatzinfo sichtbar.')}
            ${wizField('Interne Notizen', 'info.notes', wArea('info.notes', info.notes, { max: 1500, rows: 2, ph: 'optional' }), ms, 'Nur im Creator sichtbar.')}`;
    }
    // Zusammenfassung
    const cat2 = cats.find(c => c.id === d.category) || {};
    const prio = (arr(S.catalog.priorities).find(p => String(p.value) === String(d.priority)) || {}).label || d.priority;
    const row = (k, v, req) => `<dt>${esc(k)}</dt><dd>${v ? esc(v) : (req ? '<span class="field__error">fehlt</span>' : '<span class="dim">–</span>')}</dd>`;
    return `${missing.length ? `<div class="alert alert--warn">${icon('triangle-exclamation')}<div>Es fehlen noch Pflichtangaben: ${missing.map(m => esc(m.label)).join(', ')}.</div></div>` : ''}
        <dl class="summary">
            ${row('Einsatzart', cat2.label, true)}${row('Einsatzname', d.name, true)}${row('Stichwort', d.keyword, true)}${row('Priorität', prio, true)}
            ${row('Leitstelle', dispatchLabel(info.dispatchJob), true)}${row('Notrufmeldung', info.alarmText, true)}${row('Adresse', info.address)}
            ${row('Einsatzbeschreibung', info.description, true)}${row('Gefahren', info.hazards)}${row('Betroffene Personen', info.persons)}
            ${row('Einsatzmittel', [...arr(info.units), info.unitsText].filter(Boolean).join(', '))}
        </dl>
        ${S.wiz.mode === 'new' ? `<div class="alert alert--info">${icon('crosshairs')}<div>Im nächsten Schritt wird die Szene gebaut: zuerst den <b>Einsatzort</b> in der Welt anklicken, danach Fahrzeuge, Patienten, Feuer usw. setzen.</div></div>` : ''}`;
}

function renderWizard() {
    const W = S.wiz;
    if (!W) return;
    const d = W.data;
    const missing = missingInfo(d);
    const idx = WIZ_STEPS.findIndex(x => x.id === W.step);
    const st = WIZ_STEPS[idx];
    const stepState = x => {
        if (x.id === W.step) return 'is-active';
        if (!W.shown.has(x.id) || x.id === 'check') return '';
        return missing.some(m => m.step === x.id) ? 'is-error' : 'is-done';
    };
    const last = idx === WIZ_STEPS.length - 1;
    const scroll = $('.wizard__body', $('#wizard')) ? $('.wizard__body', $('#wizard')).scrollTop : 0;
    $('#wizard').innerHTML = `<div class="wizard">
        <aside class="wizard__side">
            <div class="eyebrow">${W.mode === 'new' ? 'Neuer Einsatz' : 'Einsatzdaten'}</div>
            <div class="wizard__name">${esc(d.name || 'Unbenannter Einsatz')}</div>
            ${WIZ_STEPS.map((x, i) => `<div class="step ${stepState(x)}" data-step="${x.id}"><span class="step__num">${stepState(x) === 'is-done' ? icon('check') : stepState(x) === 'is-error' ? '!' : i + 1}</span>${esc(x.label)}</div>`).join('')}
        </aside>
        <section class="wizard__main">
            <div class="wizard__head"><div class="page-title">${esc(st.title)}</div><div class="page-desc">${esc(st.desc)}</div></div>
            <div class="wizard__body scroll">${wizStepBody(W.step, d, missing)}</div>
            <div class="wizard__foot">
                <button class="btn btn--ghost" data-w="cancel">Abbrechen</button>
                <span class="grow"></span>
                ${idx > 0 ? `<button class="btn" data-w="back">${icon('arrow-left')} Zurück</button>` : ''}
                ${last ? `<button class="btn btn--primary" data-w="finish" ${missing.length ? 'disabled' : ''}>${W.mode === 'new' ? `${icon('cube')} Szene bauen` : `${icon('check')} Übernehmen`}</button>`
                    : `<button class="btn ${W.mode === 'edit' ? '' : 'btn--primary'}" data-w="next">Weiter ${icon('arrow-right')}</button>
                       ${W.mode === 'edit' ? `<button class="btn btn--primary" data-w="finish">${icon('check')} Übernehmen</button>` : ''}`}
            </div>
        </section></div>`;
    $('.wizard__body', $('#wizard')).scrollTop = scroll;
}

function wizGo(step) {
    const W = S.wiz;
    W.shown.add(W.step);
    W.step = step;
    if (step === 'check') WIZ_STEPS.forEach(x => W.shown.add(x.id));
    renderWizard();
    $('.wizard__body', $('#wizard')).scrollTop = 0;
}

$('#wizard').addEventListener('click', async (e) => {
    const W = S.wiz;
    if (!W) return;
    const stepEl = e.target.closest('[data-step]');
    if (stepEl) return wizGo(stepEl.dataset.step);
    const chip = e.target.closest('[data-wtoggle]');
    if (chip) {
        const list = arr(getPath(W.data, chip.dataset.wtoggle)).slice();
        const i = list.indexOf(chip.dataset.value);
        if (i >= 0) list.splice(i, 1); else list.push(chip.dataset.value);
        setPath(W.data, chip.dataset.wtoggle, list);
        chip.classList.toggle('is-on');
        return;
    }
    const b = e.target.closest('[data-w]');
    if (!b) return;
    const idx = WIZ_STEPS.findIndex(x => x.id === W.step);
    const act = b.dataset.w;
    if (act === 'cancel') return closeWizard();
    if (act === 'back') return wizGo(WIZ_STEPS[idx - 1].id);
    if (act === 'next') {
        W.shown.add(W.step);
        if (missingInfo(W.data).some(m => m.step === W.step)) { renderWizard(); return toast('error', 'Bitte die markierten Pflichtfelder ausfüllen'); }
        return wizGo(WIZ_STEPS[idx + 1].id);
    }
    if (act === 'finish') {
        const missing = missingInfo(W.data);
        if (missing.length) return wizGo(missing[0].step);
        const data = clone(W.data);
        if (W.mode === 'new') {
            const r = await post('newScenario', { init: data });
            if (!r.ok) return;
            closeWizard();
            S.page = 'place';
            S.sub = null;
            showMode('scene');
            toast('info', 'Jetzt den Einsatzort in der Welt anklicken');
        } else {
            const r = await post('updateInfo', { patch: data });
            if (!r.ok) return;
            Object.assign(S.draft, { category: data.category, name: data.name, keyword: data.keyword, priority: data.priority });
            S.draft.info = Object.assign(S.draft.info, data.info);
            closeWizard();
            renderTop();
            toast('success', 'Einsatzdaten übernommen');
        }
    }
});
function wizInput(t) {
    const W = S.wiz;
    if (!W || !t.dataset.wpath) return;
    const path = t.dataset.wpath;
    const type = t.dataset.wtype;
    let v = t.type === 'checkbox' ? t.checked : t.value;
    if (type === 'int') v = parseInt(v, 10) || 0;
    if (path === 'category' && v !== W.data.category) {
        W.data.category = v;
        W.data.info.custom = {};
        return renderWizard();
    }
    setPath(W.data, path, v);
    if (path === 'name') { const n = $('.wizard__name', $('#wizard')); if (n) n.textContent = v || 'Unbenannter Einsatz'; }
    // Fehlermarkierung live entfernen
    const f = t.closest('.field');
    if (f && f.classList.contains('has-error') && String(v).trim()) { f.classList.remove('has-error'); const er = $('.field__error', f); if (er) er.remove(); }
}
$('#wizard').addEventListener('input', e => wizInput(e.target));
$('#wizard').addEventListener('change', e => wizInput(e.target));

/* ----- Elemente ----- */
function elLabel(e) {
    if (e.label) return e.label;
    const p = e.props || {};
    if (e.kind === 'ped' && p.isPatient && p.patient && p.patient.name) return p.patient.name;
    if (e.model) return e.model;
    const C = S.catalog;
    const find = (list, key, val) => (arr(list).find(x => x.id === val) || {}).label;
    if (e.kind === 'fire') return find(C.fireTypes, 'id', p.fireType) || 'Feuer';
    if (e.kind === 'smoke') return find(C.smokeTypes, 'id', p.smokeType) || 'Rauch';
    if (e.kind === 'marker') return find(C.markerKinds, 'id', p.markerKind) || 'Position';
    if (e.kind === 'area') return find(C.areaKinds, 'id', p.areaKind) || 'Gebiet';
    if (e.kind === 'spill') return find(C.spillKinds, 'id', p.spillKind) || 'Betriebsstoff';
    return KIND[e.kind].label;
}
function elMeta(e) {
    const p = e.props || {};
    const out = [];
    if (e.kind === 'ped' && p.isPatient && p.patient) {
        const prof = arr(S.catalog.medical && S.catalog.medical.profiles).find(x => x.id === p.patient.profile);
        out.push(prof && prof.id !== 'none' ? prof.label : p.patient.severity);
        if (p.vehicleId) out.push('im Fahrzeug');
    }
    if ((e.kind === 'fire' || e.kind === 'smoke') && p.attachTo) out.push('gekoppelt');
    if (e.kind === 'fire') out.push(`Größe ${p.size}`);
    if (e.kind === 'area') out.push(`${p.radius} m`);
    if (e.kind === 'door') out.push(p.doorModel ? 'Kartentür' : 'logisch');
    if (e.kind === 'vehicle') out.push((arr(S.catalog.damageLevels).find(d => d.id === p.damage) || {}).label || '');
    return out.filter(Boolean).join(' · ') || KIND[e.kind].label;
}
function pageElements() {
    const els = S.draft.elements;
    if (!els.length) return `<div class="empty">${icon('layer-group')}Noch keine Elemente.<br>Werkzeug wählen und in die Welt klicken.</div>`;
    const q = (S.search.elements || '').toLowerCase();
    const limits = S.config.limits;
    let html = `<div class="input-group">${icon('magnifying-glass')}<input class="input" type="text" data-search="elements" placeholder="Elemente filtern" value="${esc(S.search.elements || '')}"></div>
        <div class="field__hint">${els.length} von ${limits.total} Elementen</div><div class="list">`;
    for (const kind of Object.keys(KIND)) {
        const all = els.filter(e => e.kind === kind);
        const list = all.filter(e => !q || elLabel(e).toLowerCase().includes(q));
        if (!list.length) continue;
        html += `<div class="list__group">${icon(KIND[kind].icon)} ${esc(KIND[kind].label)}<span class="count">${all.length}/${limits[kind] ?? '–'}</span></div>`;
        html += list.map(e => `<div class="list__item ${e.id === S.selected ? 'is-active' : ''}" data-el="${esc(e.id)}">
            <span class="list__icon">${icon(KIND[kind].icon)}</span>
            <div class="grow"><div class="list__title">${esc(elLabel(e))}</div><div class="list__meta">${esc(elMeta(e))}</div></div>
            <div class="list__actions"><button class="btn btn--ghost btn--icon btn--sm" data-act="focusEl" data-id="${esc(e.id)}" title="Kamera">${icon('video')}</button>
            <button class="btn btn--ghost-danger btn--icon btn--sm" data-act="delEl" data-id="${esc(e.id)}" title="Löschen">${icon('trash')}</button></div></div>`).join('');
    }
    return html + '</div>';
}

/* ------------------------------------------------------------------ */
/* Übersicht                                                           */
/* ------------------------------------------------------------------ */
function refreshHubData() {
    post('listScenarios', {}, true).then(r => { if (r.ok) { S.scenarios = arr(r.data); if (S.mode === 'hub') renderHub(); } });
    post('listIncidents', {}, true).then(r => { if (r.ok) { S.incidents = normIncidents(r.data); if (S.mode === 'hub') renderHub(); } });
    if (S.hubPage === 'random') loadRandom();
}
function renderHub(force) {
    if (!S.open || S.mode !== 'hub') return;
    const activeCount = S.incidents.active.filter(i => i.status === 'aktiv').length;
    const initials = (S.user || '?').split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
    if (!panelBusy('#hubTop')) $('#hubTop').innerHTML = `
        <div class="wordmark"><span class="wordmark__sign">${icon('tower-broadcast')}</span><span class="wordmark__word">einsatz<span>creator</span></span></div>
        <nav class="tabs">${HUB_PAGES.map(p => `<button class="tab ${S.hubPage === p.id ? 'is-active' : ''}" data-hub="${p.id}">${icon(p.icon)} ${esc(p.label)}
            ${p.id === 'active' && activeCount ? `<span class="rail__count">${activeCount}</span>` : ''}</button>`).join('')}</nav>
        <div class="topbar__spacer"></div>
        <button class="btn btn--primary btn--sm" data-hubact="new">${icon('plus')} Neuer Einsatz</button>
        <span class="topbar__sep"></span>
        <span class="user"><span class="avatar">${esc(initials)}</span>${esc(S.user)}</span>
        <button class="btn btn--ghost btn--icon" data-hubact="close" title="Schließen (Esc)">${icon('xmark')}</button>`;
    if (!force && panelBusy('#hubBody')) { S.pending.hub = true; return; }
    S.pending.hub = false;
    const p = HUB_PAGES.find(x => x.id === S.hubPage) || HUB_PAGES[0];
    const body = $('#hubBody');
    const scroll = body.scrollTop;
    body.innerHTML = `<div class="hub__inner">
        <div class="hub__head"><div class="grow"><div class="hub__title">${esc(p.label)}</div><div class="hub__desc">${esc(p.desc)}</div></div>${hubToolbar()}</div>
        ${({ scenarios: pageScenarios, active: pageActive, random: pageRandom })[S.hubPage]()}</div>`;
    body.scrollTop = scroll;
}
function hubToolbar() {
    if (S.hubPage === 'scenarios') return `<div class="toolbar"><div class="input-group">${icon('magnifying-glass')}<input class="input" type="text" data-search="scenarios" placeholder="Einsätze durchsuchen" value="${esc(S.scenarioSearch)}"></div></div>`;
    if (S.hubPage === 'active') return `<div class="toolbar"><button class="btn btn--ghost btn--sm" data-act="refreshInc">${icon('rotate')} Aktualisieren</button></div>`;
    return '';
}
$('#hubTop').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-hub]');
    if (tab) {
        S.hubPage = tab.dataset.hub;
        if (S.hubPage === 'random') loadRandom();
        if (S.hubPage === 'active') post('listIncidents', {}, true).then(r => { if (r.ok) { S.incidents = normIncidents(r.data); renderHub(true); } });
        return renderHub(true);
    }
    const b = e.target.closest('[data-hubact]');
    if (!b) return;
    if (b.dataset.hubact === 'new') openWizard('new');
    if (b.dataset.hubact === 'close') requestClose();
});

/* ----- Einsätze (gespeichert) ----- */
function pageScenarios() {
    const q = S.scenarioSearch.toLowerCase();
    const list = S.scenarios.filter(s => !q || `${s.name} ${s.keyword} ${s.categoryLabel} ${s.id}`.toLowerCase().includes(q));
    if (!S.scenarios.length) return `<div class="empty">${icon('folder-open')}Noch keine Einsätze angelegt.<br><br><button class="btn btn--primary" data-act="newSc">${icon('plus')} Ersten Einsatz anlegen</button></div>`;
    if (!list.length) return `<div class="empty">${icon('magnifying-glass')}Keine Treffer</div>`;
    return `<div class="grid-cards">` + list.map(s => `<div class="card">
        <div class="card__header"><div class="grow"><div class="card__title">${esc(s.name)}</div><span class="card__subtitle">${esc(s.keyword || '–')}</span></div>
            <span class="chip chip--outline">${esc(s.categoryLabel)}</span></div>
        <div class="card__body"><dl class="dl">
            <dt>Leitstelle</dt><dd>${esc(dispatchLabel(s.dispatchJob))}</dd>
            ${s.address ? `<dt>Ort</dt><dd>${esc(s.address)}</dd>` : ''}
            <dt>Szene</dt><dd>${s.elements} Elemente${arr(s.variants).length ? ` · ${arr(s.variants).length} Ortsvarianten` : ''}</dd>
            <dt>Geändert</dt><dd>${fmtTime(s.updatedAt || s.createdAt)} · ${esc(s.updatedBy || s.createdBy)}</dd>
            <dt>Kennung</dt><dd class="mono">${esc(s.id)}</dd></dl></div>
        <div class="card__footer">
            <button class="btn btn--ghost-danger btn--icon btn--sm" data-act="delSc" data-id="${esc(s.id)}" title="Löschen">${icon('trash')}</button>
            <button class="btn btn--ghost btn--icon btn--sm" data-act="dupSc" data-id="${esc(s.id)}" title="Duplizieren">${icon('clone')}</button>
            <span class="grow"></span>
            <button class="btn btn--sm" data-act="openSc" data-id="${esc(s.id)}">${icon('pen')} Bearbeiten</button>
            <button class="btn btn--sm" data-act="testSc" data-id="${esc(s.id)}" ${S.perms.test ? '' : 'disabled'}>${icon('flask')} Testen</button>
            <button class="btn btn--primary btn--sm" data-act="liveSc" data-id="${esc(s.id)}" ${S.perms.live ? '' : 'disabled'}>${icon('paper-plane')} Übergeben</button></div></div>`).join('') + `</div>`;
}

/* ----- Aktive Einsaetze ----- */
const PHASE_LABEL = { alarmiert: 'Alarmiert', anfahrt: 'Anfahrt', vor_ort: 'Vor Ort', lage_unter_kontrolle: 'Lage unter Kontrolle', nachalarmierung: 'Nachalarmierung', abschluss: 'Abschluss' };
function pageActive() {
    const act = S.incidents.active;
    let html = '';
    if (!act.length) html += `<div class="empty">${icon('tower-broadcast')}Keine laufenden Einsätze</div>`;
    html += '<div class="grid-cards">' + act.map(i => {
        const fire = i.fire || {};
        const r = i.rescue || {};
        const pat = Object.entries(obj(r.byStatus)).map(([k, v]) => `${v}× ${S.config.patientStatus[k] || k}`).join(', ');
        const running = i.status === 'aktiv';
        const errors = arr(i.errors);
        return `<div class="card">
            <div class="card__header"><div class="grow"><div class="card__title">${esc(i.keyword || i.name)}</div><span class="card__subtitle">${esc(i.name)} · <span class="mono">${esc(i.id)}</span></span></div></div>
            <div class="card__body">
                <div class="chips">
                    <span class="chip ${i.mode === 'live' ? 'chip--primary' : 'chip--warn'}">${i.mode === 'live' ? `${icon('paper-plane')} An Leitstelle` : `${icon('flask')} Test`}</span>
                    <span class="chip chip--dot ${running ? 'chip--ok' : i.status === 'fehlerhaft' ? 'chip--danger' : ''}">${esc(i.statusLabel)}</span>
                    ${i.random ? `<span class="chip">${icon('shuffle')} Zufall</span>` : ''}
                    <span class="chip chip--outline">${esc(i.categoryLabel)}</span>
                </div>
                <dl class="dl">
                    ${i.address ? `<dt>Ort</dt><dd>${esc(i.address)}</dd>` : ''}
                    <dt>Erstellt</dt><dd>${fmtTime(i.createdAt)} · ${esc(i.createdBy)}</dd>
                    <dt>Szene</dt><dd>${i.elements} Elemente, ${i.entities} in der Welt</dd>
                    <dt>Feuer</dt><dd>${fire.burning || 0} brennend · ${fire.smoke || 0} Rauch</dd>
                    <dt>Patienten</dt><dd>${r.patients ? esc(pat) : 'keine'}</dd>
                </dl>
                ${running ? fSel('Phase', '', i.phase, arr(S.config.phases).map(p => [p, PHASE_LABEL[p] || p])).replace('data-path=""', `data-phase="${esc(i.id)}"`) : ''}
                ${errors.length ? `<div class="alert alert--warn">${icon('triangle-exclamation')}<div>${errors.map(esc).join('<br>')}</div></div>` : ''}
            </div>
            <div class="card__footer">
                <button class="btn btn--ghost btn--icon btn--sm" data-act="incWp" data-id="${esc(i.id)}" title="Wegpunkt setzen">${icon('route')}</button>
                <button class="btn btn--ghost btn--sm" data-act="incDetails" data-id="${esc(i.id)}">Details</button>
                <span class="grow"></span>
                ${running ? `${i.mode === 'live' ? `<button class="btn btn--ghost btn--icon btn--sm" data-act="incRealarm" data-id="${esc(i.id)}" title="Erneut an EmergencyDispatch melden">${icon('repeat')}</button>` : ''}
                <button class="btn btn--ghost-danger btn--sm" data-act="incCancel" data-id="${esc(i.id)}">Abbrechen</button>
                <button class="btn btn--sm" data-act="incEnd" data-id="${esc(i.id)}">${icon('flag-checkered')} Beenden</button>` : ''}
            </div></div>`;
    }).join('') + '</div>';
    const hist = S.incidents.history;
    if (hist.length) {
        html += `<div class="section-title">Verlauf</div><div class="list">` + hist.map(h => `<div class="list__item" style="cursor:default">
            <span class="list__icon">${icon(h.status === 'beendet' ? 'flag-checkered' : 'ban')}</span>
            <div class="grow"><div class="list__title">${esc(h.keyword || h.name || h.id)}</div>
            <div class="list__meta">${esc(h.statusLabel || h.status)} · ${h.mode === 'live' ? 'Leitstelle' : 'Test'} · ${fmtTime(h.endedAt)}${h.note ? ' · ' + esc(h.note) : ''}</div></div></div>`).join('') + '</div>';
    }
    return html;
}

/* ----- Zufall ----- */
async function loadRandom() {
    const r = await post('randomStatus', {}, true);
    if (r.ok) { S.random = r.data; S.randomForm = clone(r.data.settings); renderPanel(true); }
}
function pageRandom() {
    const R = S.random;
    if (!R) return `<div class="empty">${icon('spinner')}Wird geladen …</div>`;
    const f = S.randomForm || R.settings;
    const can = !!S.perms.live;
    const next = R.nextAt ? `in ${Math.max(0, Math.round((R.nextAt - R.now) / 60))} min · ${fmtTime(R.nextAt)}` : '–';
    const duty = Object.entries(obj(R.onDuty)).map(([k, v]) => `${esc((S.config.roles[k] || {}).label || k)} ${v}`).join(' · ');
    let html = `<div class="card" style="max-width:720px"><div class="card__header">${icon('shuffle')}<span class="card__title">Generator</span>
            <span class="chip chip--dot ${R.settings.enabled ? 'chip--ok' : ''}" style="margin-left:auto">${R.settings.enabled ? 'Aktiv' : 'Aus'}</span></div>
        <div class="card__body" data-scope="random">
            ${fSwitch('Zufallseinsätze aktiv', 'enabled', f.enabled)}
            <div class="grid-2">${fNum('Abstand min. (Min.)', 'intervalMin', f.intervalMin, { int: true, min: 1, max: 600 })}${fNum('Abstand max. (Min.)', 'intervalMax', f.intervalMax, { int: true, min: 1, max: 600 })}</div>
            <div class="grid-3">${fNum('Gleichzeitig', 'maxActive', f.maxActive, { int: true, min: 1, max: S.config.limits.activeIncidents })}${fNum('Tag ab', 'dayStart', f.dayStart, { int: true, min: 0, max: 23 })}${fNum('Tag bis', 'dayEnd', f.dayEnd, { int: true, min: 0, max: 24 })}</div>
            <dl class="dl"><dt>Nächster Einsatz</dt><dd>${esc(next)}</dd><dt>Laufend</dt><dd>${R.activeRandom} von ${R.settings.maxActive}</dd>
                <dt>Im Dienst</dt><dd>${duty || '–'}</dd><dt>Zuletzt</dt><dd>${R.lastInfo ? `${fmtTime(R.lastInfo.at)} · ${esc(R.lastInfo.text)}` : '–'}</dd></dl>
        </div>
        <div class="card__footer"><button class="btn btn--ghost btn--sm" data-act="rndNow" ${can ? '' : 'disabled'}>${icon('bolt')} Jetzt auslösen</button>
            <button class="btn btn--primary btn--sm" data-act="rndSave" ${can ? '' : 'disabled'}>Speichern</button></div></div>
        <div class="section-title">Pool</div><div class="grid-cards">`;
    html += S.scenarios.map(sc => {
        const c = arr(R.candidates).find(x => x.id === sc.id);
        const pool = c ? c.pool : { enabled: false, weight: 1, time: 'immer', cooldown: 30, minOnDuty: {} };
        const mod = obj(pool.minOnDuty);
        return `<div class="card" data-scope="pool" data-id="${esc(sc.id)}">
            <div class="card__header"><label class="switch grow"><input type="checkbox" data-pool="enabled" ${pool.enabled ? 'checked' : ''} ${can ? '' : 'disabled'}><span class="card__title">${esc(sc.name)}</span></label>
                ${c ? (c.eligible ? '<span class="chip chip--ok chip--dot">bereit</span>' : `<span class="chip chip--warn">${esc(c.reason)}</span>`) : `<span class="chip chip--outline">${esc(sc.categoryLabel)}</span>`}</div>
            ${pool.enabled ? `<div class="card__body"><div class="grid-3">
                ${field('Gewichtung', `<input class="input" type="number" data-pool="weight" value="${pool.weight}" min="1" max="10">`)}
                ${field('Tageszeit', `<select class="select" data-pool="time">${[['immer', 'Immer'], ['tag', 'Tag'], ['nacht', 'Nacht']].map(([v, l]) => `<option value="${v}" ${pool.time === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
                ${field('Sperrzeit (Min.)', `<input class="input" type="number" data-pool="cooldown" value="${pool.cooldown}" min="0" max="1440">`)}</div>
                <div class="grid-3">${Object.entries(S.config.roles).map(([role, r]) => field(`Min. ${r.label}`, `<input class="input" type="number" data-pool="minOnDuty.${role}" value="${mod[role] || 0}" min="0" max="20">`)).join('')}</div></div>` : ''}
        </div>`;
    }).join('') || `<div class="empty">${icon('folder-open')}Noch keine gespeicherten Einsätze</div>`;
    return html + '</div>';
}
async function saveRandomPool(card) {
    const id = card.dataset.id;
    const c = arr(S.random.candidates).find(x => x.id === id);
    const pool = c ? clone(c.pool) : { enabled: false, weight: 1, time: 'immer', cooldown: 30, minOnDuty: {} };
    pool.minOnDuty = obj(pool.minOnDuty);
    $$('[data-pool]', card).forEach(inp => setPath(pool, inp.dataset.pool, inp.type === 'checkbox' ? inp.checked : (inp.tagName === 'SELECT' ? inp.value : parseInt(inp.value, 10) || 0)));
    const r = await post('randomSetPool', { id, pool });
    if (r.ok) { S.random = r.data; renderPanel(true); }
}

/* ----- Ereignisse im Panel und in der Übersicht ----- */
async function onPanelClick(e) {
    const tool = e.target.closest('.tool');
    if (tool) {
        const id = tool.dataset.tool;
        if (id === 'select' || id === 'center' || id === 'variant') { S.sub = null; post('setTool', { name: id }); }
        else S.sub = S.sub === id ? null : id;
        return renderPanel(true);
    }
    const fav = e.target.closest('[data-fav]');
    if (fav) {
        e.stopPropagation();
        const kind = S.sub === 'line' ? 'object' : S.sub;
        const list = S.favs[kind] || (S.favs[kind] = []);
        const i = list.indexOf(fav.dataset.fav);
        if (i >= 0) list.splice(i, 1); else list.unshift(fav.dataset.fav);
        store.set('ec_favs', S.favs);
        return renderPanel(true);
    }
    const model = e.target.closest('.model[data-model]');
    if (model) {
        if (model.dataset.ok !== '1') return toast('error', 'Dieses Modell ist auf dem Server nicht verfügbar');
        S.tpl[S.sub].model = model.dataset.model;
        renderPanel(true);
        if (S.sub !== 'line') activateTemplate(S.sub);
        return;
    }
    const chip = e.target.closest('[data-toggle]');
    if (chip) {
        const list = arr(getPath(S.draft, chip.dataset.toggle)).slice();
        const i = list.indexOf(chip.dataset.value);
        if (i >= 0) list.splice(i, 1); else list.push(chip.dataset.value);
        setPath(S.draft, chip.dataset.toggle, list);
        chip.classList.toggle('is-on');
        return pushInfo();
    }
    const b = e.target.closest('button[data-act]');
    const item = e.target.closest('.list__item[data-el]');
    if (!b) { if (item) post('selectElement', { id: item.dataset.el, focus: true }); return; }
    const act = b.dataset.act, id = b.dataset.id;
    const reloadIncidents = async () => { const l = await post('listIncidents', {}, true); if (l.ok) { S.incidents = normIncidents(l.data); renderRail(); renderPanel(true); } };
    switch (act) {
        case 'place': return activateTemplate(b.dataset.kind);
        case 'custom': {
            const kind = b.dataset.kind;
            const m = ($(`[data-custom="${kind}"]`).value || '').trim().toLowerCase();
            if (!m) return;
            const r = await post('checkModel', { model: m, kind: kind === 'line' ? 'object' : kind });
            if (r.ok) { S.tpl[kind].model = m; toast('success', `Modell „${m}“ ist verfügbar`); renderPanel(true); if (kind !== 'line') activateTemplate(kind); }
            return;
        }
        case 'setCenter': return post('setTool', { name: 'center' });
        case 'camCenter': return post('cameraToCenter');
        case 'varAdd': return post('setTool', { name: 'variant' });
        case 'varBack': return post('cameraToCenterReset');
        case 'varCam': return post('focusVariant', { index: parseInt(b.dataset.i, 10) + 1 });
        case 'varDel': { const list = arr(S.draft.variants).slice(); list.splice(parseInt(b.dataset.i, 10), 1); return post('updateVariants', { variants: list }); }
        case 'focusEl': return post('selectElement', { id, focus: true });
        case 'delEl': return post('deleteElement', { id });
        case 'openSc': case 'copySc': return openScenario(id, act === 'copySc');
        case 'newSc': return openWizard('new');
        case 'testSc': return triggerSaved(id, 'test');
        case 'liveSc': return triggerSaved(id, 'live');
        case 'dupSc': { const r = await post('duplicateScenario', { id }); if (r.ok) { S.scenarios = arr(r.data.scenarios); toast('success', `Kopie gespeichert (${r.data.id})`); renderPanel(true); } return; }
        case 'delSc': {
            const sc = S.scenarios.find(s => s.id === id);
            if (!(await confirmBox('Einsatz löschen', `„${sc ? sc.name : id}“ wird endgültig gelöscht.`, 'Löschen', 'danger'))) return;
            const r = await post('deleteScenario', { id });
            if (r.ok) { S.scenarios = arr(r.data.scenarios); toast('success', 'Einsatz gelöscht'); renderPanel(true); }
            return;
        }
        case 'refreshInc': return reloadIncidents();
        case 'rndSave': { const r = await post('randomSaveSettings', { settings: S.randomForm }); if (r.ok) { S.random = r.data; S.randomForm = clone(r.data.settings); toast('success', 'Einstellungen gespeichert'); renderPanel(true); } return; }
        case 'rndNow': { const r = await post('randomRunNow'); if (r.ok) { S.random = r.data.status; toast('success', `Zufallseinsatz ${r.data.id} an EmergencyDispatch übergeben`); renderPanel(true); } return; }
    }
    const inc = S.incidents.active.find(x => x.id === id);
    if (act === 'incCam' && inc) return post('focusPosition', { pos: inc.center, distance: 35 });
    if (act === 'incWp' && inc) { post('setWaypoint', { pos: inc.center }); return toast('success', 'Wegpunkt gesetzt'); }
    if (act === 'incDetails') { const r = await post('incidentDetails', { id }); if (r.ok) showDetails(r.data); return; }
    if (act === 'incRealarm') { const r = await post('incidentAction', { id, action: 'realarm' }); if (r.ok) toast('success', r.data); return; }
    if (act === 'incEnd' || act === 'incCancel') {
        const cancel = act === 'incCancel';
        const ok = await confirmBox(cancel ? 'Einsatz abbrechen' : 'Einsatz beenden',
            cancel ? 'Der Einsatz wird abgebrochen, alle zugehörigen Elemente werden sofort entfernt.' : 'Der Einsatz wird regulär beendet und die Szene geräumt. Der Einsatz in EmergencyDispatch bleibt davon unberührt.',
            cancel ? 'Abbrechen' : 'Beenden', cancel ? 'danger' : 'primary');
        if (!ok) return;
        const r = await post('incidentAction', { id, action: cancel ? 'cancel' : 'end' });
        if (r.ok) toast('success', r.data || 'Erledigt');
        return reloadIncidents();
    }
}
$('#panelBody').addEventListener('click', onPanelClick);
$('#hubBody').addEventListener('click', onPanelClick);

function onPanelInput(e) {
    const t = e.target;
    if (t.dataset.search) {
        const k = t.dataset.search;
        if (k === 'scenarios') S.scenarioSearch = t.value; else S.search[k] = t.value;
        const pos = t.selectionStart;
        renderPanel(true);
        const n = $(`[data-search="${k}"]`);
        if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* */ } }
        return;
    }
    handleBound(t, 'input');
}
function onPanelChange(e) {
    const t = e.target;
    if (t.dataset.pool) return saveRandomPool(t.closest('[data-scope="pool"]'));
    if (t.dataset.phase) { post('incidentAction', { id: t.dataset.phase, action: 'phase', phase: t.value }).then(r => { if (r.ok) toast('success', 'Phase gesetzt'); }); return; }
    if (t.dataset.vfield) {
        const list = clone(arr(S.draft.variants));
        const v = list[parseInt(t.closest('[data-variant]').dataset.variant, 10)];
        if (v) { v[t.dataset.vfield] = t.dataset.vfield === 'h' ? (parseFloat(t.value) || 0) : t.value; post('updateVariants', { variants: list }); }
        return;
    }
    handleBound(t, 'change');
    if (t.closest('[data-scope^="tpl:"]') && ['props.canSpread', 'props.patient.profile', 'props.zfBehaviour'].includes(t.dataset.path)) renderPanel(true);
}
$('#panelBody').addEventListener('input', onPanelInput);
$('#panelBody').addEventListener('change', onPanelChange);
$('#hubBody').addEventListener('input', onPanelInput);
$('#hubBody').addEventListener('change', onPanelChange);

/* Gebundene Eingaben (Vorlagen, Einsatzdaten, Element) */
function handleBound(t, type) {
    if (!t.dataset || !t.dataset.path) return;
    const scope = t.dataset.scope || (t.closest('[data-scope]') || {}).dataset?.scope;
    const val = readInput(t);
    if (val === undefined) return;
    if (type === 'input' && (t.tagName === 'SELECT' || t.type === 'checkbox')) return;
    if (type === 'input' && t.dataset.path === 'model') return;
    if (scope === 'random') { S.randomForm = S.randomForm || {}; setPath(S.randomForm, t.dataset.path, val); return; }
    if (scope && scope.startsWith('tpl:')) { const kind = scope.slice(4); setPath(S.tpl[kind], t.dataset.path, val); refreshPlaceTool(kind); return; }
    if (scope === 'info') {
        if (t.dataset.path === 'category') { pushInfo.flush(); S.draft.category = val; post('updateInfo', { patch: { category: val } }); return; }
        setPath(S.draft, t.dataset.path, val);
        return pushInfo();
    }
    if (scope === 'el' && S.edit) { setPath(S.edit, t.dataset.path, val); pushEdit(); }
}
const pushInfo = debounce(() => {
    const d = S.draft;
    post('updateInfo', { patch: { name: d.name, keyword: d.keyword, priority: d.priority, info: d.info } });
}, 300);
const pushEdit = debounce(async () => {
    if (!S.edit) return;
    const r = await post('updateElement', { element: S.edit });
    if (!r.ok) {
        // abgelehnte Änderung zurücknehmen (z. B. Feuer passt nicht an diese Stelle)
        const cur = S.draft && S.draft.elements.find(x => x.id === S.edit.id);
        if (cur) S.edit = clone(cur);
        renderInspector(true);
    }
}, 250);
function flushEdits() { pushInfo.flush(); if (S.edit) pushEdit.flush(); }

document.addEventListener('focusout', () => setTimeout(() => {
    if (S.pending.panel && !panelBusy('#panel')) renderPanel();
    if (S.pending.hub && !panelBusy('#hubBody')) renderHub();
    if (S.pending.insp && !panelBusy('#inspector')) renderInspector();
}, 0));

/* ------------------------------------------------------------------ */
/* Inspector (Eigenschaften des ausgewaehlten Elements)                */
/* ------------------------------------------------------------------ */
function renderInspector(force) {
    const box = $('#inspector');
    if (!S.open || !S.draft || !S.edit) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    if (!force && panelBusy('#inspector')) { S.pending.insp = true; return; }
    S.pending.insp = false;
    box.classList.remove('hidden');
    const e = S.edit;
    const p = e.props;
    const entity = ['vehicle', 'object', 'ped'].includes(e.kind);
    const locked = p.attachTo || (e.kind === 'ped' && p.vehicleId);
    let pos = `<div class="grid-3">${fNum('X', 'pos.x', e.pos.x, { step: 0.05 })}${fNum('Y', 'pos.y', e.pos.y, { step: 0.05 })}${fNum('Z', 'pos.z', e.pos.z, { step: 0.05 })}</div>`;
    if (e.kind === 'vehicle' || e.kind === 'object') pos += `<div class="grid-3">${fNum('Neigung', 'rot.x', e.rot.x)}${fNum('Rollen', 'rot.y', e.rot.y)}${fNum('Richtung', 'rot.z', e.rot.z)}</div>`;
    else if (e.kind === 'ped' || e.kind === 'spill') pos += fNum('Richtung', 'rot.z', e.rot.z);
    const scroll = box.querySelector('.drawer__body') ? box.querySelector('.drawer__body').scrollTop : 0;
    box.innerHTML = `
        <div class="drawer__header"><span class="drawer__icon">${icon(KIND[e.kind].icon)}</span>
            <div class="grow"><div class="eyebrow">${esc(KIND[e.kind].label)}</div><div class="drawer__title">${esc(elLabel(e))}</div></div>
            <button class="btn btn--ghost btn--icon btn--sm" data-act="deselect" title="Auswahl aufheben">${icon('xmark')}</button></div>
        <div class="drawer__body scroll" data-scope="el">
            ${fText('Bezeichnung', 'label', e.label, { max: 48 })}
            ${entity ? fText('Modell (Spawnname)', 'model', e.model, { max: 64 }) : ''}
            ${section('Position', pos)}
            ${section(esc(KIND[e.kind].label), kindFields(e))}
        </div>
        <div class="drawer__footer">
            <button class="btn" data-act="move" ${locked ? 'disabled' : ''}>${icon('up-down-left-right')} Verschieben</button>
            <button class="btn" data-act="dup">${icon('clone')} Duplizieren</button>
            <button class="btn" data-act="ground">${icon('arrows-down-to-line')} Boden</button>
            <button class="btn btn--ghost" data-act="focus">${icon('video')} Kamera</button>
            <button class="btn btn--ghost" data-act="reset">${icon('rotate-left')} Zurück</button>
            <button class="btn btn--ghost-danger" data-act="del">${icon('trash')} Löschen</button>
        </div>`;
    box.querySelector('.drawer__body').scrollTop = scroll;
}

function kindFields(e) {
    const p = e.props;
    const C = S.catalog;
    const els = S.draft.elements;
    switch (e.kind) {
        case 'vehicle':
            return `${fSel('Schaden', 'props.damage', p.damage, arr(C.damageLevels).map(d => [d.id, d.label]), { type: 'int' })}
                <div class="switches">${fSwitch('Warnblinker', 'props.hazard', p.hazard)}${fSwitch('Licht an', 'props.lights', p.lights)}
                ${fSwitch('Verschlossen', 'props.locked', p.locked)}${fSwitch('Fixiert', 'props.frozen', p.frozen)}
                ${fSwitch('Türen offen', 'props.doorsOpen', p.doorsOpen)}${fSwitch('Scheiben kaputt', 'props.windowsBroken', p.windowsBroken)}
                ${fSwitch('Reifen platt', 'props.tyresBurst', p.tyresBurst)}${fSwitch('Motor aus', 'props.engineOff', p.engineOff)}</div>
                <div class="grid-2">${fText('Kennzeichen', 'props.plate', p.plate, { max: 8 })}${fNum('Farbe', 'props.colour', p.colour, { int: true, min: -1, max: 160, hint: '-1 = Standard' })}</div>
                ${fSel('Fahrzeugtyp', 'props.vehType', p.vehType, VEH_TYPES.map(v => [v, v]))}`;
        case 'object':
            return `<div class="switches">${fSwitch('Fixiert', 'props.frozen', p.frozen)}${fSwitch('Kollision', 'props.collision', p.collision)}</div>`;
        case 'ped': {
            const vehicles = els.filter(x => x.kind === 'vehicle');
            let h = fSel('Haltung', 'props.pose', p.pose, arr(C.poses).map(x => [x.id, x.label]));
            if (p.pose === 'fahrzeug') h += `<div class="grid-2">${fSel('Fahrzeug', 'props.vehicleId', p.vehicleId || '', [['', 'wählen …'], ...vehicles.map(v => [v.id, elLabel(v)])], { type: 'nullable' })}${fSel('Sitz', 'props.seat', p.seat, SEATS, { type: 'int' })}</div>`;
            h += `<button class="btn btn--sm" data-act="pickVehicle">${icon('car-side')} In Fahrzeug setzen</button>`;
            h += `<div class="switches">${fSwitch('Ist Patient', 'props.isPatient', p.isPatient)}${fSwitch('Zufälliges Modell', 'props.randomModel', p.randomModel)}</div>`;
            if (p.isPatient) h += section('Medizin', medicalFields(e)) + section('Patient', patientFields(e));
            return h;
        }
        case 'fire': {
            const target = p.attachTo ? els.find(x => x.id === p.attachTo) : null;
            return fireFields(p, 'props.', true) + attachBlock(target) +
                (!isZFire() && p.canSpread && !p.attachTo ? `<div class="row"><span class="dim grow">${arr(p.spreadPoints).length} Ausbreitungspunkte</span><button class="btn btn--sm btn--ghost" data-act="spread">${icon('rotate')} Neu berechnen</button></div>` : '');
        }
        case 'smoke': return smokeFields(p, 'props.') + attachBlock(p.attachTo ? els.find(x => x.id === p.attachTo) : null);
        case 'marker': return markerFields(p, 'props.');
        case 'area': return areaFields(p, 'props.');
        case 'door': {
            const patients = els.filter(x => x.kind === 'ped' && x.props.isPatient);
            const linked = arr(p.linked);
            return doorFields(p, 'props.') + `<div class="field__hint">${p.doorModel ? 'Echte Kartentür erkannt.' : 'Logische Tür ohne Kartentür.'}</div>
                <div class="field"><span class="field__label">Patienten hinter dieser Tür</span><div class="chips">
                ${patients.length ? patients.map(x => `<span class="chip chip--toggle ${linked.includes(x.id) ? 'is-on' : ''}" data-eltoggle="props.linked" data-value="${esc(x.id)}">${esc(elLabel(x))}</span>`).join('') : '<span class="dim">Keine Patienten gesetzt</span>'}</div></div>`;
        }
        case 'spill': return spillFields(p, 'props.');
    }
    return '';
}

function medicalFields(e) {
    const C = S.catalog;
    if (!C.medical || !C.medical.enabled) return '';
    const pt = e.props.patient;
    const profiles = arr(C.medical.profiles);
    const prof = profiles.find(x => x.id === pt.profile) || profiles[0];
    const markers = S.draft.elements.filter(x => x.kind === 'marker');
    const body = obj(pt.body);
    const lvl = ['–', 'Kleine Wunde', 'Große Wunde', 'Schwer'];
    return `${fSel('Meldebild', 'props.patient.profile', pt.profile, profiles.map(x => [x.id, x.label]))}
        ${pt.profile !== 'none' ? fSel('Variante', 'props.patient.variant', pt.variant, [[0, 'Zufällig'], ...arr(prof.variants).map((v, i) => [i + 1, v])], { type: 'int' }) : '<div class="field__hint">Ohne Meldebild gelten die Vitalwerte unten.</div>'}
        <div class="grid-2">${fSel('Geschlecht', 'props.patient.gender', pt.gender, [['auto', 'Zufällig'], ['m', 'Männlich'], ['w', 'Weiblich']])}
        ${fSel('Transportziel', 'props.patient.destination', pt.destination, [['hospital', 'Beliebige Klinik'], ['other_hospital', 'Andere Klinik'], ['marker', 'Zielort']])}</div>
        ${pt.destination === 'marker' ? fSel('Zielort', 'props.patient.destMarker', pt.destMarker || '', [['', 'Position wählen …'], ...markers.map(m => [m.id, elLabel(m)])], { type: 'nullable' }) : ''}
        <div class="field"><span class="field__label">Verletzungen</span><span class="field__hint">Leer = laut Meldebild (Sturz würfelt selbst)</span></div>
        <div class="grid-2">${arr(C.medical.bodyParts).map(bp => fSel(bp.label, 'props.patient.body.' + bp.id, body[bp.id] || 0,
            [0, 1, 2, 3].filter(l => l <= bp.maxLevel).map(l => [l, l === 3 ? (bp.severeText || 'Schwer') : lvl[l]]), { type: 'int' })).join('')}</div>`;
}

function patientFields(e) {
    const C = S.catalog;
    const pt = e.props.patient;
    const inj = arr(pt.injuries);
    return `${fText('Name', 'props.patient.name', pt.name, { max: 48, ph: 'leer = zufälliger Name' })}
        ${fSel('Schweregrad', 'props.patient.severity', pt.severity, arr(C.severities).map(s => [s.id, s.label]))}
        <div class="grid-2">${fSel('Bewusstsein', 'props.patient.consciousness', pt.consciousness, arr(C.consciousness).map(x => [x, x]))}
        ${fSel('Mobilität', 'props.patient.mobility', pt.mobility, arr(C.mobility).map(x => [x, x]))}</div>
        <div class="field"><span class="field__label">Diagnosen</span><div class="chips">
            ${arr(C.injuries).map(i => `<span class="chip chip--toggle ${inj.includes(i) ? 'is-on' : ''}" data-eltoggle="props.patient.injuries" data-value="${esc(i)}">${esc(i)}</span>`).join('')}</div></div>
        ${fArea('Befund', 'props.patient.description', pt.description, { max: 400, rows: 2 })}
        ${fArea('Erforderliche Maßnahmen', 'props.patient.measures', pt.measures, { max: 400, rows: 2 })}
        <div class="grid-3">${fNum('Puls', 'props.patient.vitals.puls', pt.vitals.puls, { int: true, min: 0, max: 250 })}
        ${fText('RR', 'props.patient.vitals.rr', pt.vitals.rr, { max: 16 })}
        ${fNum('SpO₂', 'props.patient.vitals.spo2', pt.vitals.spo2, { int: true, min: 0, max: 100 })}
        ${fNum('AF', 'props.patient.vitals.af', pt.vitals.af, { int: true, min: 0, max: 60 })}
        ${fNum('GCS', 'props.patient.vitals.gcs', pt.vitals.gcs, { int: true, min: 3, max: 15 })}</div>
        ${fSwitch('Transport erforderlich', 'props.patient.transport', pt.transport)}`;
}

const attachBlock = target => section('Kopplung', target
    ? `<div class="row"><span class="chip chip--primary">${icon('link')} ${esc(elLabel(target))}</span><span class="grow"></span><button class="btn btn--sm btn--ghost" data-act="detach">${icon('link-slash')} Lösen</button></div>`
    : `<button class="btn btn--sm" data-act="attach">${icon('link')} An Fahrzeug oder Objekt koppeln</button>`);

$('#inspector').addEventListener('click', async (e) => {
    const chip = e.target.closest('[data-eltoggle]');
    if (chip && S.edit) {
        const path = chip.dataset.eltoggle;
        const list = arr(getPath(S.edit, path)).slice();
        const i = list.indexOf(chip.dataset.value);
        if (i >= 0) list.splice(i, 1);
        else { if (path.endsWith('injuries') && list.length >= 8) return toast('error', 'Maximal 8 Einträge'); list.push(chip.dataset.value); }
        setPath(S.edit, path, list);
        chip.classList.toggle('is-on');
        return pushEdit();
    }
    const b = e.target.closest('button[data-act]');
    if (!b || !S.edit) return;
    const id = S.edit.id;
    switch (b.dataset.act) {
        case 'deselect': post('selectElement', { id: null }); break;
        case 'move': post('setTool', { name: 'move', id }); break;
        case 'dup': post('duplicateElement', { id }); break;
        case 'ground': post('snapToGround', { id }); break;
        case 'focus': post('focusElement', { id }); break;
        case 'del': post('deleteElement', { id }); break;
        case 'reset':
            if (S.snapshot && S.snapshot.id === id) { S.edit = clone(S.snapshot); await post('updateElement', { element: S.edit }); renderInspector(true); toast('info', 'Element zurückgesetzt'); }
            break;
        case 'attach': post('setTool', { name: 'pickTarget', forId: id }); break;
        case 'detach': S.edit.props.attachTo = null; pushEdit.flush(); break;
        case 'pickVehicle': post('setTool', { name: 'pickVehicle', forId: id }); break;
        case 'spread': { const r = await post('recomputeSpread', { id }); if (r.ok) toast('success', `${r.data.count} Ausbreitungspunkte berechnet`); break; }
        case 'roomHash': { const r = await post('roomHashAt', { id }); if (r.ok) { toast('success', `Raum ermittelt: ${r.data.roomHash}`); setTimeout(() => renderInspector(true), 50); } break; }
    }
});
$('#inspector').addEventListener('input', e => handleBound(e.target, 'input'));
$('#inspector').addEventListener('change', (e) => {
    handleBound(e.target, 'change');
    const path = e.target.dataset && e.target.dataset.path;
    if (['props.pose', 'props.isPatient', 'props.canSpread', 'props.patient.profile', 'props.patient.destination', 'props.zfBehaviour'].includes(path)) {
        pushEdit.flush();
        setTimeout(() => renderInspector(true), 0);
    }
});

/* ------------------------------------------------------------------ */
/* Viewport: Maus und Tastatur                                         */
/* ------------------------------------------------------------------ */
const vp = $('#viewport');
let down = null;
const look = { active: false, dx: 0, dy: 0 };
vp.addEventListener('contextmenu', e => e.preventDefault());
vp.addEventListener('mousedown', (e) => {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    if (e.button === 0) down = { x: e.clientX, y: e.clientY };
    if (e.button === 2) { look.active = true; try { const r = vp.requestPointerLock && vp.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (x) { /* */ } }
});
window.addEventListener('mouseup', (e) => {
    if (e.button === 0 && down) {
        if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) < 6 && e.target === vp) {
            post('viewportClick', { button: 0, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey }, true).then(r => { if (!r.ok && r.error) toast('error', r.error); });
        }
        down = null;
    }
    if (e.button === 2 && look.active) { look.active = false; try { document.exitPointerLock && document.exitPointerLock(); } catch (x) { /* */ } }
});
window.addEventListener('mousemove', (e) => { if (look.active) { look.dx += e.movementX; look.dy += e.movementY; } });
setInterval(() => {
    if (look.dx || look.dy) { const dx = look.dx, dy = look.dy; look.dx = 0; look.dy = 0; post('look', { dx, dy }, true); }
}, 25);
let lastWheel = 0;
vp.addEventListener('wheel', (e) => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastWheel < 40) return;
    lastWheel = now;
    post('wheel', { delta: e.deltaY < 0 ? 1 : -1, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey }, true);
}, { passive: false });

const isField = el => el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
document.addEventListener('focusin', e => { if (isField(e.target)) post('inputFocus', { focused: true }, true); });
document.addEventListener('focusout', e => { if (isField(e.target)) post('inputFocus', { focused: false }, true); });

document.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') {
        if (!$('#actionMenu').classList.contains('hidden')) return closeActionMenu();
        if (!$('#infoPanel').classList.contains('hidden')) return closeInfoPanel();
    }
    if (!S.open) return;
    const typing = isField(document.activeElement);
    const dialogOpen = !$('#dialog').classList.contains('hidden');
    const wizOpen = !!S.wiz;
    if (e.key === 'Escape') {
        e.preventDefault();
        if (dialogOpen) return closeDialog(false);
        if (typing) return document.activeElement.blur();
        if (wizOpen) return closeWizard();
        if (S.mode === 'hub') return requestClose();
        const r = await post('key', { key: 'Escape' }, true);
        if (r.ok && r.data && r.data.result === 'close') goHub();
        return;
    }
    if (S.mode !== 'scene' || wizOpen) return;
    if (e.ctrlKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); return saveScenario(); }
    if (typing || dialogOpen) return;
    const keys = ['Delete', 'g', 'G', 'f', 'F', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'];
    if (keys.includes(e.key) || (e.ctrlKey && (e.key === 'd' || e.key === 'D'))) {
        e.preventDefault();
        post('key', { key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey });
    }
});

/* ------------------------------------------------------------------ */
/* Dialoge                                                             */
/* ------------------------------------------------------------------ */
let dialogResolve = null;
function openDialog(html, size = '') {
    $('#dialog').innerHTML = `<div class="dialog ${size}">${html}</div>`;
    $('#dialog').classList.remove('hidden');
}
function closeDialog(result) {
    $('#dialog').classList.add('hidden');
    $('#dialog').innerHTML = '';
    if (dialogResolve) { const r = dialogResolve; dialogResolve = null; r(result ?? null); }
}
$('#dialog').addEventListener('click', (e) => {
    const bv = e.target.closest('[data-dv]');
    if (bv) return closeDialog(bv.dataset.dv);
    const b = e.target.closest('[data-d]');
    if (b) return closeDialog(b.dataset.d === 'yes' ? ($('#dlgChoice') ? $('#dlgChoice').value : true) : null);
    if (e.target.id === 'dialog') closeDialog(null);
});
const dialogHead = title => `<div class="dialog__header"><div class="dialog__title">${esc(title)}</div><button class="btn btn--ghost btn--icon btn--sm" data-d="no">${icon('xmark')}</button></div>`;
function confirmBox(title, text, okLabel = 'OK', variant = 'primary') {
    return new Promise((resolve) => {
        dialogResolve = v => resolve(v === true);
        openDialog(`${dialogHead(title)}<div class="dialog__body"><p>${esc(text)}</p></div>
            <div class="dialog__footer"><button class="btn btn--ghost" data-d="no">Abbrechen</button><button class="btn btn--${variant}" data-d="yes">${esc(okLabel)}</button></div>`, 'dialog--sm');
    });
}
function buttonsBox(title, text, buttons) {
    return new Promise((resolve) => {
        dialogResolve = v => resolve(v || null);
        openDialog(`${dialogHead(title)}<div class="dialog__body"><p>${esc(text)}</p></div>
            <div class="dialog__footer">${buttons.map(([v, l, variant]) => `<button class="btn btn--${variant || 'ghost'}" data-dv="${esc(v)}">${esc(l)}</button>`).join('')}</div>`, 'dialog--sm');
    });
}
function chooseBox(title, text, options) {
    return new Promise((resolve) => {
        dialogResolve = v => resolve(v === null ? null : v);
        openDialog(`${dialogHead(title)}<div class="dialog__body"><p>${esc(text)}</p>
            <select class="select" id="dlgChoice">${options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></div>
            <div class="dialog__footer"><button class="btn btn--ghost" data-d="no">Abbrechen</button><button class="btn btn--primary" data-d="yes">Weiter</button></div>`, 'dialog--sm');
    });
}
function showHelp() {
    const rows = [['W A S D', 'Kamera bewegen'], ['Q / E', 'Kamera runter / hoch'], ['Shift / Strg', 'Schneller / langsamer'], ['Rechte Maustaste', 'Kamera drehen'],
        ['Linksklick', 'Setzen / auswählen'], ['Mausrad', 'Drehen (Alt: fein)'], ['Shift + Mausrad', 'Größe / Radius'], ['Strg + Mausrad', 'Höhe'],
        ['G', 'Verschieben'], ['Pfeiltasten', 'Fein verschieben'], ['Bild ↑ / ↓', 'Höhe fein'], ['Strg + D', 'Duplizieren'], ['Entf', 'Löschen'],
        ['F', 'Kamera zum Element'], ['Strg + S', 'Speichern'], ['Esc', 'Abbrechen / schließen']];
    dialogResolve = null;
    openDialog(`${dialogHead('Tastenbelegung')}<div class="dialog__body"><dl class="dl" style="grid-template-columns: 9rem 1fr">
        ${rows.map(([k, v]) => `<dt>${k.split(' ').map(x => ['/', '+'].includes(x) ? `<span class="dim">${x}</span>` : `<span class="kbd">${esc(x)}</span>`).join(' ')}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>`, 'dialog--sm');
}

function detailsHtml(d) {
    const custom = arr(d.custom).map(c => `<dt>${esc(c.label)}</dt><dd>${esc(c.value)}</dd>`).join('');
    const patients = arr(d.patients);
    const fire = d.fire || {};
    return `<dl class="dl">
            <dt>Einsatz</dt><dd class="mono">${esc(d.id)}</dd>
            <dt>Art</dt><dd>${esc(d.categoryLabel)} · P${esc(d.priority)}</dd>
            <dt>Status</dt><dd>${esc(d.status)} · ${esc(PHASE_LABEL[d.phase] || d.phase || '–')}</dd>
            <dt>Ort</dt><dd>${esc(d.address || '–')}</dd>
            <dt>Meldung</dt><dd>${esc(d.alarmText || '–')}</dd>
            <dt>Gefahren</dt><dd>${esc(d.hazards || '–')}</dd>
            <dt>Personen</dt><dd>${esc(d.persons || '–')}</dd>
            <dt>Einsatzmittel</dt><dd>${esc([...arr(d.units), d.unitsText].filter(Boolean).join(', ') || '–')}</dd>
            <dt>Feuer</dt><dd>${fire.burning || 0} brennend · ${d.fireExtinguished || 0} gelöscht</dd>${custom}</dl>
        ${d.description ? `<div class="stack"><div class="section-title">Lage</div><div style="white-space:pre-wrap">${esc(d.description)}</div></div>` : ''}
        ${patients.length ? `<div class="stack"><div class="section-title">Patienten</div><div class="list">${patients.map(p => `<div class="list__item" style="cursor:default">
            <span class="list__icon">${icon('user-injured')}</span><div class="grow"><div class="list__title">${esc(p.name)}</div>
            <div class="list__meta">${esc(p.severity)}${p.dest ? ` · Ziel: ${esc(p.dest)}` : ''}</div></div><span class="chip">${esc(p.statusLabel || p.status)}</span></div>`).join('')}</div></div>` : ''}
        ${d.sop ? `<div class="stack"><div class="section-title">SOP / Ablauf</div><div style="white-space:pre-wrap">${esc(d.sop)}</div></div>` : ''}
        ${arr(d.log).length ? `<div class="stack"><div class="section-title">Protokoll</div>${arr(d.log).map(l => `<div class="field__hint"><span class="mono">${fmtTime(l.at)}</span> · ${esc(l.by)} · ${esc(l.text)}</div>`).join('')}</div>` : ''}`;
}
function showDetails(d) {
    dialogResolve = null;
    openDialog(`${dialogHead(d.keyword || d.name)}<div class="dialog__body scroll">${detailsHtml(d)}</div>`, 'dialog--lg');
}

/* ------------------------------------------------------------------ */
/* Einsatzkraefte vor Ort                                              */
/* ------------------------------------------------------------------ */
function showPrompt(d) {
    const box = $('#prompt');
    if (!d || !d.text) return box.classList.add('hidden');
    const m = String(d.text).match(/^\[(.+?)\]\s*(.*)$/);
    box.innerHTML = m ? `<span class="kbd">${esc(m[1])}</span><span>${esc(m[2])}</span>` : esc(d.text);
    box.classList.remove('hidden');
}

function showProgress(d) {
    const box = $('#progress');
    const fill = $('.fill', box);
    if (!d) { box.classList.add('hidden'); fill.style.transition = 'none'; fill.style.width = '0'; return; }
    $('.label span', box).textContent = d.label || '';
    $('.hint', box).innerHTML = `<span class="kbd">${esc(d.cancelKey || 'X')}</span> abbrechen · nicht wegbewegen`;
    fill.style.transition = 'none';
    fill.style.width = '0';
    box.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.transition = `width ${d.duration}ms linear`; fill.style.width = '100%'; }));
}

function showActionMenu(d) {
    const box = $('#actionMenu');
    box.innerHTML = `<div class="dialog dialog--sm">${`<div class="dialog__header"><div class="dialog__title">${esc(d.title)}</div><button class="btn btn--ghost btn--icon btn--sm" data-a="__close">${icon('xmark')}</button></div>`}
        <div class="dialog__body"><div class="list">${arr(d.actions).map(a => `<div class="list__item ${a.enabled ? '' : 'is-disabled'}" data-a="${a.enabled ? esc(a.id) : ''}">
            <span class="list__icon">${icon('hand-holding-medical')}</span><div class="grow"><div class="list__title">${esc(a.label)}</div>${a.reason ? `<div class="list__meta">${esc(a.reason)}</div>` : ''}</div>
            ${icon('chevron-right', 'dim')}</div>`).join('')}</div></div></div>`;
    box.classList.remove('hidden');
}
function closeActionMenu() { $('#actionMenu').classList.add('hidden'); post('actionClose', {}, true); }
$('#actionMenu').addEventListener('click', (e) => {
    if (e.target.id === 'actionMenu') return closeActionMenu();
    const b = e.target.closest('[data-a]');
    if (!b || !b.dataset.a) return;
    if (b.dataset.a === '__close') return closeActionMenu();
    $('#actionMenu').classList.add('hidden');
    post('actionChoose', { action: b.dataset.a });
});

let cardTimer = null;
function showPatientCard(d) {
    const box = $('#patientCard');
    if (!d) return box.classList.add('hidden');
    const p = d.patient || {};
    const v = p.vitals || {};
    const sevChip = { leicht: 'chip--ok', mittel: 'chip--warn', schwer: 'chip--danger', kritisch: 'chip--danger' }[p.severity] || '';
    const sev = arr(d.severities).find(s => s.id === p.severity) || {};
    box.innerHTML = `<div class="card__header"><span class="list__icon">${icon('user-injured')}</span>
            <div class="grow"><div class="card__title">${esc(d.name || 'Patient')}</div><span class="card__subtitle">Sichtung</span></div>
            <span class="chip ${sevChip}">${esc((sev.label || p.severity || '').split(' (')[0])}</span></div>
        <div class="card__body">
            <div class="vitals">${[['puls', 'Puls'], ['rr', 'RR'], ['spo2', 'SpO₂'], ['af', 'AF'], ['gcs', 'GCS']].map(([k, l]) => `<div class="vital"><b>${esc(v[k] ?? '–')}</b><span>${l}</span></div>`).join('')}</div>
            <dl class="dl"><dt>Bewusstsein</dt><dd>${esc(p.consciousness)}</dd><dt>Mobilität</dt><dd>${esc(p.mobility)}</dd>
                <dt>Diagnosen</dt><dd>${esc(arr(p.injuries).join(', ') || '–')}</dd><dt>Transport</dt><dd>${p.transport ? 'erforderlich' : 'nicht erforderlich'}</dd></dl>
            ${p.description ? `<div class="field__hint">${esc(p.description)}</div>` : ''}
            ${p.measures ? `<div class="alert alert--info">${icon('kit-medical')}<div>${esc(p.measures)}</div></div>` : ''}
        </div>`;
    box.classList.remove('hidden');
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => box.classList.add('hidden'), 30000);
}

function showInfoPanel(d) {
    const list = arr(d.incidents);
    $('#infoPanel').innerHTML = `<div class="dialog dialog--lg"><div class="dialog__header"><div class="dialog__title">Einsatzinformationen</div>
        <button class="btn btn--ghost btn--icon btn--sm" data-i="close">${icon('xmark')}</button></div>
        <div class="dialog__body scroll">${list.map(i => `<div class="card"><div class="card__header">
            <div class="grow"><div class="card__title">${esc(i.keyword || i.name)}</div><span class="card__subtitle">${esc(i.name)}</span></div>
            <button class="btn btn--sm" data-i="route" data-x="${i.center ? i.center.x : 0}" data-y="${i.center ? i.center.y : 0}">${icon('route')} Route</button></div>
            <div class="card__body">${detailsHtml(i)}</div></div>`).join('')}</div></div>`;
    $('#infoPanel').classList.remove('hidden');
}
function closeInfoPanel() { $('#infoPanel').classList.add('hidden'); post('infoClose', {}, true); }
$('#infoPanel').addEventListener('click', (e) => {
    if (e.target.id === 'infoPanel') return closeInfoPanel();
    const b = e.target.closest('[data-i]');
    if (!b) return;
    if (b.dataset.i === 'close') return closeInfoPanel();
    post('infoRoute', { pos: { x: parseFloat(b.dataset.x), y: parseFloat(b.dataset.y) } });
});

/* Untertitel der Behandlung */
const subQueue = [];
let subTimer = null;
const WHO = { rd: 'Rettungsdienst', pt: 'Patient', info: 'Befund' };
function showSubtitles(d) {
    const ms = (d && d.ms) || 3500;
    arr(d && d.lines).forEach(l => subQueue.push({ who: l.who, text: l.text, ms }));
    if (!subTimer) nextSubtitle();
}
function nextSubtitle() {
    const box = $('#subtitles');
    const item = subQueue.shift();
    if (!item) { subTimer = null; setTimeout(() => { if (!subTimer) box.innerHTML = ''; }, 400); return; }
    const who = ['rd', 'pt', 'info'].includes(item.who) ? item.who : 'info';
    // Sprecher steht bei Server-Zeilen vor dem Doppelpunkt ("Patient (undeutlich): ...")
    const m = String(item.text).match(/^([^:]{2,40}):\s(.+)$/);
    const el = document.createElement('div');
    el.className = `sub sub--${who}`;
    el.innerHTML = `<span class="sub__who">${esc(m && who !== 'info' ? m[1] : WHO[who])}</span><span>${esc(m && who !== 'info' ? m[2] : item.text)}</span>`;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    subTimer = setTimeout(nextSubtitle, item.ms);
}

/* ------------------------------------------------------------------ */
/* Minispiele der medizinischen Versorgung                             */
/* ------------------------------------------------------------------ */
const Game = {
    def: null, raf: null, keyHandler: null, cleanups: [],
    listen(target, type, fn) { target.addEventListener(type, fn); this.cleanups.push(() => target.removeEventListener(type, fn)); },
    open(def) {
        this.close(true);
        this.waiting = false;
        this.onValue = null;
        this.showMs = 3200;
        this.def = def || {};
        const box = $('#minigame');
        box.classList.remove('hidden');
        const size = { ekg: 'game--xl', iv: 'game--wide', io: 'game--wide', bz: 'game--wide', landmark: 'game--wide' }[def.type] || '';
        box.innerHTML = `<div class="game card ${size}">
            <div class="card__header">${icon('kit-medical')}<span class="card__title">${esc(def.title || 'Massnahme')}</span>
                <span class="grow"></span><button class="btn btn--ghost btn--icon btn--sm" data-g="cancel" title="Abbrechen (Esc)">${icon('xmark')}</button></div>
            <div class="card__body game__body"></div></div>`;
        $('[data-g="cancel"]', box).onclick = () => this.finish(null, true);
        const body = $('.game__body', box);
        ({ timing: gameTiming, ekg: gameEkg, bz: gameBz, iv: gameIv, io: gameIo, landmark: gameLandmark })[def.type]?.(body, def);
    },
    onKey(fn) {
        this.keyHandler = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); return this.finish(null, true); }
            fn(e);
        };
        window.addEventListener('keydown', this.keyHandler);
    },
    close(silent) {
        if (!silent) this.onValue = null;
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = null;
        if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
        this.keyHandler = null;
        this.cleanups.forEach(fn => fn());
        this.cleanups = [];
        clearInterval(this.timer);
        $('#minigame').classList.add('hidden');
        $('#minigame').innerHTML = '';
        if (!silent) this.def = null;
    },
    finish(result, cancel) {
        if (!this.def) return;
        const def = this.def;
        this.def = null;
        // Messgeraete zeigen den Wert an: Fenster bleibt offen, bis der Server den Wert schickt
        if (def.awaitValue && result === true && !cancel && this.onValue) {
            this.waiting = true;
            clearTimeout(this.waitTimer);
            this.waitTimer = setTimeout(() => this.value(null), 8000);
        } else {
            this.close(true);
        }
        post('minigameDone', { result, cancel: !!cancel }, true);
    },
    // Messwert vom Server (BZ-Geraet, EKG-Streifen) anzeigen und danach schliessen
    value(d) {
        if (!this.waiting) return;
        this.waiting = false;
        clearTimeout(this.waitTimer);
        if (d && this.onValue) this.onValue(d);
        this.onValue = null;
        setTimeout(() => { if (!this.def) this.close(true); }, d ? this.showMs : 0);
    },
    // Ergebnis kurz anzeigen, dann schliessen
    done(body, ok, text, result) {
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = null;
        const res = document.createElement('div');
        res.className = `alert ${ok ? 'alert--ok' : 'alert--danger'}`;
        res.innerHTML = `${icon(ok ? 'circle-check' : 'circle-xmark')}<div>${esc(text)}</div>`;
        body.appendChild(res);
        setTimeout(() => this.finish(result === undefined ? ok : result), 1100);
    },
};

/* Timing: Zeiger im gruenen Bereich stoppen */
function gameTiming(body, def) {
    const need = def.hits || 1;
    let hits = 0, tries = 0;
    const maxTries = need + 2;
    body.innerHTML = `<p class="dim">${esc(def.hint || 'Im gruenen Bereich stoppen - Leertaste oder Klick')}</p>
        <div class="tbar"><div class="tbar__zone"></div><div class="tbar__cursor"></div></div>
        <div class="row"><span class="grow dim" id="gStat"></span><button class="btn btn--primary" id="gHit">${icon('hand-pointer')} Jetzt</button></div>`;
    const zone = $('.tbar__zone', body), cur = $('.tbar__cursor', body), stat = $('#gStat', body);
    let zoneAt = 0, zoneW = 0;
    const newZone = () => { zoneW = Math.max(8, 16 - tries * 1.5); zoneAt = 10 + Math.random() * (80 - zoneW); zone.style.left = zoneAt + '%'; zone.style.width = zoneW + '%'; };
    newZone();
    let x = 0, dir = 1, last = performance.now(), active = true;
    const speed = 70 * (def.speed || 1);   // Prozent pro Sekunde
    const loop = (t) => {
        const dt = (t - last) / 1000; last = t;
        x += dir * speed * dt;
        if (x >= 100) { x = 100; dir = -1; } if (x <= 0) { x = 0; dir = 1; }
        cur.style.left = x + '%';
        Game.raf = requestAnimationFrame(loop);
    };
    Game.raf = requestAnimationFrame(loop);
    const upd = () => { stat.textContent = `Treffer ${hits}/${need} · Versuch ${Math.min(tries + 1, maxTries)}/${maxTries}`; };
    upd();
    const hit = () => {
        if (!active) return;
        tries++;
        const ok = x >= zoneAt && x <= zoneAt + zoneW;
        if (ok) hits++;
        zone.classList.toggle('is-hit', ok); zone.classList.toggle('is-miss', !ok);
        setTimeout(() => zone.classList.remove('is-hit', 'is-miss'), 300);
        if (hits >= need) { active = false; return Game.done(body, true, 'Erfolgreich!'); }
        if (tries >= maxTries) { active = false; return Game.done(body, false, 'Fehlversuch.'); }
        newZone(); upd();
    };
    $('#gHit', body).onclick = hit;
    Game.onKey(e => { if (e.code === 'Space') { e.preventDefault(); hit(); } });
}

/* Ziehen und Ablegen (Werkzeuge, Elektroden). onMove/onDrop bekommen Koordinaten im SVG der Figur */
function svgPoint(svg, cx, cy) {
    const pt = svg.createSVGPoint();
    pt.x = cx; pt.y = cy;
    const m = svg.getScreenCTM();
    return m ? pt.matrixTransform(m.inverse()) : { x: -999, y: -999 };
}
function draggable(el, svg, { onDrop, onMove, ghostHtml }) {
    el.addEventListener('pointerdown', (e) => {
        if (el.classList.contains('is-used') || el.classList.contains('is-disabled')) return;
        e.preventDefault();
        const ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.innerHTML = ghostHtml ? ghostHtml() : el.innerHTML;
        document.body.appendChild(ghost);
        const place = (ev) => { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; };
        place(e);
        el.classList.add('is-dragging');
        const move = (ev) => { place(ev); if (onMove) { const p = svgPoint(svg, ev.clientX, ev.clientY); onMove(p.x, p.y); } };
        const up = (ev) => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            ghost.remove();
            el.classList.remove('is-dragging');
            const r = svg.getBoundingClientRect();
            const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
            const p = svgPoint(svg, ev.clientX, ev.clientY);
            if (onDrop) onDrop(inside ? p.x : null, inside ? p.y : null);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        Game.cleanups.push(() => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); ghost.remove(); });
    });
}
const dist2 = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);

/* Fotos der Minispiele (Quellen und Lizenzen: html/img/QUELLEN.md). Koordinaten in Bildpixeln */
const PHOTO = {
    torso: { src: 'img/torso.webp', w: 840, h: 1066 },
    hand: { src: 'img/hand.webp', w: 640, h: 750 },
};
// Foto als Hintergrund eines SVG, damit Klick-/Ablagepunkte in Bildkoordinaten gerechnet werden
const photoSvg = (p, inner, viewBox) => `<svg viewBox="${viewBox || `0 0 ${p.w} ${p.h}`}" class="fig fig--photo" id="gFig" preserveAspectRatio="xMidYMid meet">
    <image href="${p.src}" x="0" y="0" width="${p.w}" height="${p.h}"/>${inner}</svg>`;

// Klebeelektrode mit farbigem Clip (Farbe nach IEC)
const electrodeSvg = (x, y, r, color, label) => `<g class="pad-placed">
    <image href="img/electrode.webp" x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}"/>
    <circle cx="${x}" cy="${y}" r="${r * 0.3}" fill="${color}" stroke="rgba(0,0,0,.55)" stroke-width="1.5"/>
    <text x="${x}" y="${y - r - 4}" class="pad__txt">${label}</text></g>`;

/* EKG: echte Klebeelektroden auf den Oberkoerper ziehen (Farben nach IEC) */
function gameEkg(body, def) {
    // gueltige Positionen in Bildpixeln (torso.webp); Extremitaetenableitungen am Rumpf oder an den Extremitaeten
    const LIMB = [
        { id: 'R', color: '#e5534b', where: 'rechts: unter dem Schluesselbein, Oberarm oder Handgelenk', spots: [[250, 198], [122, 457], [61, 977]], tol: 55 },
        { id: 'L', color: '#e3b341', where: 'links: unter dem Schluesselbein, Oberarm oder Handgelenk', spots: [[636, 198], [764, 457], [780, 977]], tol: 55 },
        { id: 'F', color: '#3fb950', where: 'linker Unterbauch (Rippenbogen/Huefte) oder linkes Bein', spots: [[592, 668]], tol: 60 },
        { id: 'N', color: '#1c1c1c', where: 'rechter Unterbauch (Rippenbogen/Huefte) oder rechtes Bein', spots: [[294, 668]], tol: 60 },
    ];
    const CHEST = [
        { id: 'V1', color: '#e5534b', where: '4. ICR rechts direkt neben dem Brustbein', spots: [[420, 420]], tol: 17 },
        { id: 'V2', color: '#e3b341', where: '4. ICR links direkt neben dem Brustbein', spots: [[466, 420]], tol: 17 },
        { id: 'V3', color: '#3fb950', where: 'zwischen V2 und V4', spots: [[510, 445]], tol: 17 },
        { id: 'V4', color: '#8b5a2b', where: '5. ICR links in der Medioklavikularlinie', spots: [[557, 470]], tol: 17 },
        { id: 'V5', color: '#1c1c1c', where: 'linke vordere Axillarlinie auf Hoehe von V4', spots: [[605, 470]], tol: 17 },
        { id: 'V6', color: '#a371f7', where: 'linke mittlere Axillarlinie auf Hoehe von V4', spots: [[642, 470]], tol: 17 },
    ];
    const items = LIMB.concat(def.twelve ? CHEST : []);
    let errors = 0, placed = 0, finished = false;
    const guides = `<g class="anat__guides">
        <line x1="443" y1="150" x2="443" y2="560" class="anat__guide anat__guide--st"/>
        <line x1="340" y1="150" x2="340" y2="620" class="anat__guide"/><line x1="546" y1="150" x2="546" y2="620" class="anat__guide"/>
        <line x1="605" y1="300" x2="605" y2="620" class="anat__guide anat__guide--ax"/><line x1="642" y1="300" x2="642" y2="620" class="anat__guide anat__guide--ax2"/>
        <line x1="380" y1="420" x2="500" y2="420" class="anat__guide anat__guide--icr"/><line x1="520" y1="470" x2="680" y2="470" class="anat__guide anat__guide--icr"/>
        <text x="350" y="165" class="anat__gtxt">MCL</text><text x="610" y="315" class="anat__gtxt">vAL</text><text x="648" y="300" class="anat__gtxt">mAL</text>
        <text x="372" y="414" class="anat__gtxt">4. ICR</text><text x="660" y="465" class="anat__gtxt">5. ICR</text></g>`;
    body.innerHTML = `<div class="ekgwrap">
        <div class="figwrap figwrap--photo">${photoSvg(PHOTO.torso, `${guides}<g id="gPlaced"></g>`)}
            <span class="fig__side" style="left:10px">rechts</span><span class="fig__side" style="right:10px">links</span></div>
        <div class="ekgside">
            <p class="dim">Elektroden vom Traeger abziehen und auf die Haut kleben. Es gibt keine Markierungen - orientiere dich an Schluesselbein, Brustbein, Rippen und Achsellinien.
            ${def.twelve ? '<br><br>Zuerst die vier Extremitaetenelektroden, dann V1 bis V6.' : ''}</p>
            <div class="tray tray--electrodes" id="gTray">${items.map((t, i) => `<div class="electrode-pad ${i >= LIMB.length ? 'is-disabled' : ''}" data-e="${t.id}" style="--c:${t.color}" title="${t.id}">
                <img src="img/electrode.webp" alt=""><i class="electrode-pad__clip"></i><b>${t.id}</b></div>`).join('')}</div>
            <div class="dim" id="gStat"></div>
            <label class="switch"><input type="checkbox" id="gGuides"><span>Hilfslinien einblenden</span></label>
        </div></div>`;
    const svg = $('#gFig', body), group = $('#gPlaced', body), stat = $('#gStat', body);
    const upd = (msg, bad) => { stat.innerHTML = `${msg ? `<span class="${bad ? 'warn' : ''}">${esc(msg)}</span><br>` : ''}Fehler ${errors}/1`; };
    upd();
    $('#gGuides', body).onchange = (e) => svg.classList.toggle('show-guides', e.target.checked);
    const unlockChest = () => { if (placed >= LIMB.length) $$('.electrode-pad.is-disabled', body).forEach(x => x.classList.remove('is-disabled')); };
    items.forEach(t => {
        const el = $(`[data-e="${t.id}"]`, body);
        draggable(el, svg, {
            ghostHtml: () => el.outerHTML,
            onDrop: (x, y) => {
                if (finished || x === null) return;
                const ok = t.spots.some(([sx, sy]) => dist2(x, y, sx, sy) <= t.tol);
                if (!ok) {
                    errors++;
                    upd(`${t.id} sitzt falsch - gehoert ${t.where}`, true);
                    if (errors > 1) { finished = true; return Game.done(body, false, 'Zu viele falsch geklebte Elektroden - Ableitung nicht verwertbar.'); }
                    return;
                }
                group.insertAdjacentHTML('beforeend', electrodeSvg(x, y, t.id.startsWith('V') ? 17 : 24, t.color, t.id));
                el.classList.add('is-used');
                placed++;
                upd(`${t.id} klebt`);
                unlockChest();
                if (placed === items.length) {
                    finished = true;
                    $('#gTray', body).classList.add('is-empty');
                    Game.onValue = (d) => showEkgResult(body, d, def.twelve);
                    Game.showMs = def.twelve ? 9000 : 6500;
                    Game.done(body, true, 'Alle Elektroden kleben korrekt - Monitor schreibt ...');
                }
            },
        });
    });
    Game.onKey(() => {});
}

/* Ableitungen fuer den Ausdruck: Amplitudenfaktor und ST-Strecke (STEMI Vorderwand: Hebung V1-V4, I, aVL; Senkung II, III, aVF) */
const LEADS = {
    I: { a: 0.6, st: 0.12 }, II: { a: 1.0, st: -0.1 }, III: { a: 0.45, st: -0.12 }, aVR: { a: -0.75, st: 0 },
    aVL: { a: 0.35, st: 0.1 }, aVF: { a: 0.7, st: -0.12 }, V1: { a: -0.55, st: 0.22 }, V2: { a: -0.35, st: 0.32 },
    V3: { a: 0.45, st: 0.3 }, V4: { a: 0.9, st: 0.22 }, V5: { a: 1.0, st: 0.04 }, V6: { a: 0.8, st: 0 },
};
function leadWave(kind, ph, lead) {
    const L = LEADS[lead] || LEADS.II;
    const base = kind === 'stemi' ? 'sinus' : kind;
    let y = Monitor.wave(base, ph) * (base === 'vf' || base === 'flat' ? Math.sign(L.a) || 1 : L.a);
    if (kind === 'stemi' && ph > 0.355 && ph < 0.66) y += L.st * 1.6 * Math.pow(Math.sin((ph - 0.355) / 0.305 * Math.PI), 0.45);
    return y;
}
// Kurve eines Herzschlags-Ablaufs in ein Canvas zeichnen
function traceLead(ctx, kind, hf, lead, x0, y0, w, amp, color, seed) {
    const beatPx = kind === 'vf' || kind === 'flat' ? 120 : Math.max(45, 60 / Math.max(30, hf || 60) * 125);
    let ph = seed || 0;
    ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.beginPath();
    for (let x = 0; x <= w; x++) {
        ph += 1 / beatPx * (kind === 'afib' ? (0.7 + Math.random() * 0.6) : 1);
        if (ph >= 1) ph -= 1;
        const y = y0 - leadWave(kind, ph, lead) * amp;
        if (x === 0) ctx.moveTo(x0 + x, y); else ctx.lineTo(x0 + x, y);
    }
    ctx.stroke();
}

/* Bildschirm des Monitor/Defibrillators: Canvas liegt exakt auf der Displayflaeche des Fotos.
   4-Kanal: EKG II + Pleth mit Messwertfeldern. 12-Kanal: alle 12 Ableitungen auf dem Bildschirm + Rhythmus II.
   Unten die Softkey-Beschriftung ueber den sieben Geraetetasten. */
function drawDefiScreen(c, d, hf, twelve) {
    const ctx = c.getContext('2d'), W = c.width, H = c.height;
    const ekg = d.ekg, m = d.monitor || {}, kind = ekg.wave || 'sinus';
    const noPulse = kind === 'vf' || kind === 'flat';
    const font = (w, px) => `${w} ${px}px Consolas, "DejaVu Sans Mono", monospace`;
    const HEAD = 34, FOOT = 34, MSG = 30;
    const VALW = twelve ? 150 : 205, CW = W - VALW - 6;   // Kurvenbereich
    const top = HEAD + 4, bottom = H - FOOT - MSG - 4;
    const box = (x, y, w, h, label, unit, value, color, size) => {
        ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.fillStyle = color; ctx.font = font(700, 17); ctx.textAlign = 'left'; ctx.fillText(label, x + 7, y + 19);
        ctx.font = font(400, 13); ctx.textAlign = 'right'; ctx.fillText(unit, x + w - 6, y + 19);
        ctx.font = font(700, size); ctx.fillText(value, x + w - 7, y + h - 9);
    };
    // Kopfzeile, Werte, Meldung, Softkeys
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#22272e'; ctx.fillRect(0, 0, W, HEAD);
    ctx.font = font(700, 19); ctx.textAlign = 'left'; ctx.fillStyle = '#eee'; ctx.fillText(d.name || 'Patient', 10, 23);
    ctx.textAlign = 'right'; ctx.fillText(new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }), W - 50, 23);
    ctx.fillStyle = '#7ee787'; ctx.fillRect(W - 42, 11, 26, 13); ctx.fillRect(W - 16, 14, 3, 7);
    ctx.textAlign = 'center'; ctx.fillStyle = '#9aa4ad'; ctx.font = font(400, 16); ctx.fillText(twelve ? '12-Kanal-EKG' : 'Monitor', W / 2, 23);
    const vx = W - VALW, vh = (bottom - top) / 4;
    box(vx, top, VALW - 4, vh * 1.3, 'HF', '/min', noPulse ? '---' : String(hf || '---'), '#46e06a', twelve ? 52 : 70);
    box(vx, top + vh * 1.3 + 3, VALW - 4, vh * 0.9 - 3, 'SpO2', '%', m.spo2 != null && !noPulse ? String(m.spo2) : '--', '#4fc3f7', twelve ? 36 : 46);
    box(vx, top + vh * 2.2 + 3, VALW - 4, vh * 0.9 - 3, 'NIBP', 'mmHg', m.rr != null ? String(m.rr) : '---/--', '#f0f0f0', twelve ? 26 : 34);
    box(vx, top + vh * 3.1 + 3, VALW - 4, vh * 0.9 - 3, 'AF', '/min', m.af != null ? String(m.af) : '--', '#ffd54f', twelve ? 32 : 40);
    const my = H - FOOT - MSG;
    ctx.fillStyle = noPulse ? '#c62828' : '#2a2f36'; ctx.fillRect(0, my, W, MSG);
    ctx.fillStyle = noPulse ? '#fff' : '#ffd54f'; ctx.font = font(700, 18); ctx.textAlign = 'left';
    let msg = ekg.label; while (ctx.measureText(msg).width > W - 20 && msg.length > 4) msg = msg.slice(0, -1);
    ctx.fillText(msg === ekg.label ? msg : msg.slice(0, -1) + '…', 10, my + 21);
    const keys = ['Menue', 'Ableit.', '12-Kanal', 'NIBP', 'Alarme', 'Ereignis', 'Drucken'], kx = [0.057, 0.199, 0.341, 0.483, 0.638, 0.78, 0.935];
    ctx.fillStyle = '#22272e'; ctx.fillRect(0, H - FOOT, W, FOOT);
    ctx.font = font(700, 16); ctx.textAlign = 'center';
    keys.forEach((k, i) => {
        ctx.fillStyle = twelve && k === '12-Kanal' ? '#46e06a' : '#d6dade'; ctx.fillText(k, kx[i] * W, H - 11);
        if (i) { ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(((kx[i - 1] + kx[i]) / 2) * W, H - FOOT + 5, 1, FOOT - 10); }
    });
    // Kurvenspuren (Sweep)
    const tracks = [];
    if (twelve) {
        // 3 x 4 Ableitungen statisch, darunter Rhythmusstreifen II live
        const grid = [['I', 'aVR', 'V1', 'V4'], ['II', 'aVL', 'V2', 'V5'], ['III', 'aVF', 'V3', 'V6']];
        const rhH = 70, rowH = (bottom - top - rhH) / 3, colW = CW / 4;
        ctx.font = font(700, 15); ctx.textAlign = 'left';
        grid.forEach((row, r) => row.forEach((lead, col) => {
            const x0 = col * colW, y0 = top + r * rowH + rowH * 0.6;
            traceLead(ctx, kind, hf, lead, x0 + 4, y0, colW - 8, rowH * 0.42, '#46e06a', 0.15 + col * 0.25);
            ctx.fillStyle = '#9be7a8'; ctx.fillText(lead, x0 + 5, top + r * rowH + 15);
        }));
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.moveTo(0, bottom - rhH); ctx.lineTo(CW, bottom - rhH); ctx.stroke();
        ctx.fillStyle = '#46e06a'; ctx.fillText('II', 5, bottom - rhH + 16);
        tracks.push({ y0: bottom - rhH + 4, h: rhH - 4, color: '#46e06a', fn: (ph) => leadWave(kind, ph, 'II'), base: 0.68, amp: 0.5 });
    } else {
        const eh = (bottom - top) * 0.6, ph0 = top + eh;
        ctx.font = font(700, 17); ctx.textAlign = 'left';
        ctx.fillStyle = '#46e06a'; ctx.fillText('II  x1', 6, top + 17);
        ctx.fillStyle = '#4fc3f7'; ctx.fillText('Pleth', 6, ph0 + 17);
        const pleth = (p) => { const q = (p + 0.75) % 1; return Math.exp(-Math.pow((q - 0.18) / 0.09, 2)) + 0.35 * Math.exp(-Math.pow((q - 0.42) / 0.07, 2)); };
        tracks.push({ y0: top, h: eh, color: '#46e06a', fn: (ph) => leadWave(kind, ph, 'II'), base: 0.66, amp: 0.55 });
        tracks.push({ y0: ph0, h: bottom - ph0, color: '#4fc3f7', fn: (ph) => noPulse ? (Math.random() - 0.5) * 0.02 : pleth(ph), base: 0.88, amp: 0.6 });
    }
    const X0 = twelve ? 24 : 70;
    let x = X0, ph = 0, prev = tracks.map(() => null), last = performance.now();
    const SPEED = 150;
    const loop = (t) => {
        const dt = Math.min(0.1, (t - last) / 1000); last = t;
        const steps = Math.max(1, Math.round(dt * SPEED));
        for (let i = 0; i < steps; i++) {
            const beat = noPulse ? 1.2 : 60 / Math.max(25, hf || 60) * (kind === 'afib' ? (0.7 + Math.random() * 0.6) : 1);
            ph += (1 / SPEED) / beat; if (ph >= 1) ph -= 1;
            tracks.forEach((tr, k) => {
                const y = tr.y0 + tr.h * tr.base - tr.fn(ph) * tr.h * tr.amp;
                ctx.fillStyle = '#000'; ctx.fillRect(x, tr.y0 + 20, 12, tr.h - 20);
                if (prev[k] !== null) { ctx.strokeStyle = tr.color; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x - 1, prev[k]); ctx.lineTo(x, y); ctx.stroke(); }
                prev[k] = y;
            });
            x++;
            if (x >= CW - 4) { x = X0; prev = tracks.map(() => null); }
        }
        Game.raf = requestAnimationFrame(loop);
    };
    Game.raf = requestAnimationFrame(loop);
}

/* Ergebnis: Rhythmus auf dem Bildschirm des Monitor/Defibrillators (12-Kanal: alle Ableitungen auf dem Geraet) */
function showEkgResult(body, d, twelve) {
    if (!d || !d.ekg) return;
    const hf = d.ekg.hf || (d.monitor && d.monitor.hf) || 0;
    body.innerHTML = `<div class="ekgresult"><div class="defimon"><img src="img/defi.webp" alt="Monitor/Defibrillator">
        <canvas class="defimon__screen" width="640" height="470"></canvas></div></div>`;
    drawDefiScreen($('.defimon__screen', body), d, hf, twelve);
}

/* BZ: Stichstelle waehlen, desinfizieren, trocknen lassen, stechen, ersten Tropfen abwischen, Teststreifen */
function gameBz(body) {
    // Fingerkuppen auf hand.webp (rechte Hand, Handflaeche): Mitte der Fingerbeere, seitliche Kuppe = +/- 10..32 px
    const fingers = [
        { id: 'zeige', name: 'Zeigefinger', x: 402, y: 168 },
        { id: 'mittel', name: 'Mittelfinger', x: 306, y: 94 },
        { id: 'ring', name: 'Ringfinger', x: 223, y: 144 },
        { id: 'klein', name: 'kleiner Finger', x: 138, y: 289 },
        { id: 'daumen', name: 'Daumen', x: 548, y: 483, thumb: true },
    ];
    let step = 0, errors = 0, site = null, rub = 0, dry = false, wiped = false, finished = false;
    const STEPS = ['Stichstelle waehlen: seitlich an eine Fingerkuppe klicken', 'Mit dem Alkoholtupfer die Fingerkuppe abreiben',
        'Desinfektionsmittel trocknen lassen ...', 'Stechhilfe seitlich an die Fingerkuppe setzen und ausloesen', 'Den ersten Blutstropfen mit dem trockenen Tupfer abwischen',
        'Teststreifen des Messgeraets an den Blutstropfen halten', 'Messung laeuft ...'];
    const defs = `<defs>
        <radialGradient id="gDropGrad" cx="40%" cy="35%" r="65%"><stop offset="0" stop-color="#ff6b6b"/><stop offset="0.35" stop-color="#b3121f"/><stop offset="1" stop-color="#5c0008"/></radialGradient>
        <radialGradient id="gWetGrad"><stop offset="0" stop-color="rgba(255,255,255,0.55)"/><stop offset="1" stop-color="rgba(255,255,255,0)"/></radialGradient></defs>`;
    body.innerHTML = `<p class="dim" id="gStep"></p>
        <div class="bzwrap">
            <div class="figwrap figwrap--photo figwrap--hand">${photoSvg(PHOTO.hand, `${defs}<g id="gMarks"></g>`, '40 0 600 640')}</div>
            <div class="bzmeter"><img src="img/bzmeter.webp" alt="Blutzuckermessgeraet">
                <div class="bzmeter__lcd"><div class="bzmeter__val" id="gScreen"></div><div class="bzmeter__unit" id="gUnit"></div>
                    <div class="bzmeter__time"><span>${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span><span>${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }).replace(/\.$/, '')}</span></div></div></div>
        </div>
        <div class="tray tray--tools" id="gTray">
            <div class="tool-item" data-t="alk"><img src="img/alcpad.webp" alt=""><span>Alkoholtupfer</span></div>
            <div class="tool-item" data-t="lanz"><img src="img/lancet.webp" alt="" class="wide"><span>Stechhilfe</span></div>
            <div class="tool-item" data-t="tupfer"><i class="gauze"></i><span>Tupfer (trocken)</span></div>
            <div class="tool-item" data-t="geraet"><img src="img/bzmeter.webp" alt="" class="tall"><span>Messgeraet</span></div>
        </div>
        <div class="dim" id="gStat"></div>
        <div class="progress-mini hidden" id="gProg"><div></div></div>`;
    const svg = $('#gFig', body), marks = $('#gMarks', body), stepEl = $('#gStep', body), stat = $('#gStat', body);
    const prog = $('#gProg', body), progFill = $('#gProg div', body), screen = $('#gScreen', body);
    const setStep = (n) => { step = n; stepEl.innerHTML = `<b>Schritt ${Math.min(n + 1, 6)}/6:</b> ${esc(STEPS[n])}`; };
    const err = (msg) => { errors++; stat.innerHTML = `<span class="warn">${esc(msg)}</span> · Fehler ${errors}/1`; if (errors > 1 && !finished) { finished = true; Game.done(body, false, 'Zu viele Fehler - der Wert waere nicht verwertbar.'); } };
    const info = (msg) => { stat.innerHTML = `${esc(msg)} · Fehler ${errors}/1`; };
    setStep(0); info('');
    const near = (x, y, r) => site && dist2(x, y, site.x, site.y) <= (r || 30);
    // 1. Stelle waehlen: Klick auf die Hand
    Game.listen(svg, 'click', (e) => {
        if (step !== 0 || finished) return;
        const p = svgPoint(svg, e.clientX, e.clientY);
        const f = fingers.map(x => Object.assign({ d: dist2(p.x, p.y, x.x, x.y) }, x)).sort((a, b) => a.d - b.d)[0];
        if (!f || f.d > 48 || Math.abs(p.y - f.y) > 40) return info('Auf eine Fingerkuppe klicken');
        const dx = p.x - f.x;
        if (f.thumb) return err('Den Daumen nicht verwenden - besser Mittel- oder Ringfinger.');
        if (Math.abs(dx) < 10) return err('Nicht in die Mitte der Fingerbeere stechen (schmerzhaft) - seitlich an der Kuppe.');
        site = { x: f.x + Math.sign(dx) * 22, y: f.y, name: f.name };
        marks.innerHTML = `<circle cx="${site.x}" cy="${site.y}" r="13" class="mark-site"/>`;
        info(`Stichstelle: ${f.name}, seitlich`);
        setStep(1);
    });
    const startDry = () => {
        setStep(2); prog.classList.remove('hidden');
        let t = 0;
        Game.timer = setInterval(() => {
            t += 100; progFill.style.width = Math.min(100, t / 30) + '%';
            const wet = $('#gWet', body); if (wet) wet.setAttribute('opacity', String(Math.max(0, 1 - t / 3000)));
            if (t >= 3000) { clearInterval(Game.timer); dry = true; prog.classList.add('hidden'); setStep(3); info('Haut ist trocken'); }
        }, 100);
    };
    const drop = (r) => {
        let d = $('#gDrop', body);
        if (!d) { marks.insertAdjacentHTML('beforeend', `<circle cx="${site.x}" cy="${site.y - 4}" r="0" fill="url(#gDropGrad)" class="mark-drop" id="gDrop"/>`); d = $('#gDrop', body); }
        requestAnimationFrame(() => d.setAttribute('r', String(r)));
    };
    const tools = {
        alk: { onMove: (x, y) => {
            if (step !== 1 || !near(x, y, 34)) return;
            rub = Math.min(100, rub + 4); prog.classList.remove('hidden'); progFill.style.width = rub + '%';
            if (rub >= 100) {
                $('[data-t="alk"]', body).classList.add('is-used');
                marks.insertAdjacentHTML('afterbegin', `<ellipse cx="${site.x}" cy="${site.y}" rx="30" ry="40" fill="url(#gWetGrad)" id="gWet"/>`);
                startDry();
            }
        }, onDrop: () => { if (step === 1 && rub < 100) info('Weiter reiben - den Tupfer ueber der Stelle hin und her bewegen'); } },
        lanz: { onDrop: (x, y) => {
            if (x === null || finished) return;
            if (step < 1) return info('Zuerst eine Stichstelle waehlen');
            if (!near(x, y)) return err('Daneben - die Stechhilfe an die gewaehlte Stelle setzen.');
            if (step === 1) err('Nicht desinfiziert!');
            if (step === 2 && !dry) { clearInterval(Game.timer); prog.classList.add('hidden'); err('Desinfektionsmittel war noch feucht - der Wert wird verfaelscht.'); }
            $('[data-t="lanz"]', body).classList.add('is-used');
            $('.mark-site', body)?.remove();
            drop(10);
            setStep(4); info('Klick - gestochen, ein Blutstropfen tritt aus');
        } },
        tupfer: { onDrop: (x, y) => {
            if (x === null || finished || step !== 4) return;
            if (!near(x, y)) return info('Den Tupfer an den Tropfen halten');
            wiped = true; $('[data-t="tupfer"]', body).classList.add('is-used');
            drop(2);
            marks.insertAdjacentHTML('afterbegin', `<ellipse cx="${site.x + 6}" cy="${site.y + 6}" rx="9" ry="5" fill="rgba(150,20,30,.25)"/>`);
            info('Erster Tropfen abgewischt - neuer Tropfen bildet sich ...');
            setTimeout(() => { if (!finished) { drop(12); setStep(5); } }, 1300);
        } },
        geraet: { onDrop: (x, y) => {
            if (x === null || finished) return;
            if (step < 4) return info('Zuerst einen Blutstropfen gewinnen');
            if (!near(x, y)) return info('Den Teststreifen genau an den Blutstropfen halten');
            if (!wiped) err('Den ersten Tropfen nicht verwenden (Gewebefluessigkeit) - Wert ungenau.');
            if (finished) return;
            finished = true;
            $('[data-t="geraet"]', body).classList.add('is-used');
            drop(2.5);
            setStep(6);
            let n = 5; screen.textContent = n; $('#gUnit', body).textContent = '';
            Game.timer = setInterval(() => { n--; screen.textContent = n > 0 ? n : '- - -'; if (n <= 0) clearInterval(Game.timer); }, 600);
            Game.onValue = (v) => {
                clearInterval(Game.timer);
                const ok = v && v.bz != null;
                screen.textContent = ok ? Math.round(v.bz * 18.02) : 'E-3';
                $('#gUnit', body).innerHTML = ok ? `mg/dL<br><small>${Number(v.bz).toFixed(1).replace('.', ',')} mmol/L</small>` : '';
            };
            Game.showMs = 4500;
            setTimeout(() => Game.done(body, true, 'Blut aufgesogen - Messung laeuft.'), 3000);
        } },
    };
    Object.entries(tools).forEach(([id, t]) => draggable($(`[data-t="${id}"]`, body), svg, Object.assign({ ghostHtml: () => $(`[data-t="${id}"]`, body).innerHTML }, t)));
    Game.onKey(() => {});
}

/* Venenzugang am Handruecken (Bilder aus medic_equip): Stauband anlegen, spruehen - wischen - spruehen und einwirken lassen,
   Venenverweilkanuele ansetzen und bis zum Blutrueckfluss vorschieben, Stauung loesen, Mandrin ziehen, Pflaster.
   Koordinaten im Armbild 394 x 700 (Hand unten). */
function gameIv(body) {
    const SITE = { x: 225, y: 433, r: 60 };          // Punktionsbereich Handruecken
    const NEEDLE = { x: 230, y: 513, w: 44, h: 56 };  // Mandrin-Griff im Bild iv_arm_3
    let step = 0, errors = 0, finished = false, stau = false, sprays = 0, wiped = false, dry = false;
    const STEPS = ['Stauband oberhalb des Handgelenks am Unterarm anlegen', 'Handruecken mit Hautdesinfektion einspruehen',
        'Mit der Kompresse wischen', 'Erneut einspruehen und Einwirkzeit abwarten', 'Venenverweilkanuele am Handruecken ansetzen',
        'Flach vorschieben - beim Blutrueckfluss loslassen', 'Stauung loesen, dann den Mandrin ziehen', 'Kanuele mit dem Pflaster fixieren'];
    body.innerHTML = `<p class="dim" id="gStep"></p>
        <div class="ivwrap">
            <div class="figwrap figwrap--ivarm"><svg viewBox="-120 0 520 700" class="fig" id="gFig" preserveAspectRatio="xMidYMid meet">
                <image href="img/iv_arm_1.png" x="0" y="0" width="394" height="700" id="gArm"/>
                <circle cx="${SITE.x + 8}" cy="${SITE.y + 58}" r="5" fill="#a0101c" opacity="0" id="gFlash"/>
                <image href="img/iv_stauband_arm.png" x="-110" y="103" width="389" height="88" id="gStau" class="iv-stau"/>
                <rect x="${NEEDLE.x - 6}" y="${NEEDLE.y - 4}" width="${NEEDLE.w + 12}" height="${NEEDLE.h + 8}" class="iv-hit hidden" id="gNeedleHit"/>
            </svg></div>
            <div class="ivtools">
                <div class="tray tray--tools tray--col" id="gTray">
                    <div class="tool-item" data-t="stau"><img src="img/iv_stauband.png" alt=""><span>Stauband</span></div>
                    <div class="tool-item" data-t="spray"><img src="img/iv_desinfektion.png" alt="" class="tall"><span>Hautdesinfektion</span></div>
                    <div class="tool-item" data-t="komp"><img src="img/iv_kompresse.png" alt=""><span>Kompresse</span></div>
                    <div class="tool-item" data-t="kan"><img src="img/iv_kanuele.png" alt=""><span>Venenverweilkanuele</span></div>
                    <div class="tool-item" data-t="pfl"><img src="img/iv_pflaster.png" alt=""><span>Pflaster</span></div>
                </div>
                <div class="ivside hidden" id="gPush">
                    <div class="drill drill--iv"><div class="drill__zone"></div><div class="drill__fill"></div></div>
                    <div class="ivside__txt"><b>Kanuele vorschieben</b><span class="dim">"Vorschieben" oder Leertaste <b>halten</b>. Loslassen, sobald Blut in der Kammer erscheint.</span>
                        <button class="btn btn--primary" id="gPushBtn">${icon('syringe')} Vorschieben (halten)</button></div>
                </div>
                <div class="dim" id="gHint"></div>
            </div>
        </div>
        <div class="dim" id="gStat"></div>
        <div class="progress-mini hidden" id="gProg"><div></div></div>`;
    const svg = $('#gFig', body), arm = $('#gArm', body), stepEl = $('#gStep', body), stat = $('#gStat', body), hint = $('#gHint', body);
    const prog = $('#gProg', body), progFill = $('#gProg div', body);
    const setArm = (n) => arm.setAttribute('href', `img/iv_arm_${n}.png`);
    const setStep = (n) => { step = n; stepEl.innerHTML = `<b>Schritt ${n + 1}/${STEPS.length}:</b> ${esc(STEPS[n])}`; };
    const err = (msg) => { errors++; stat.innerHTML = `<span class="warn">${esc(msg)}</span> · Fehler ${errors}/1`;
        if (errors > 1 && !finished) { finished = true; Game.done(body, false, 'Zu viele Fehler - Punktion abgebrochen, neuer Versuch noetig.'); } };
    const info = (msg) => { stat.innerHTML = `${esc(msg)} · Fehler ${errors}/1`; };
    const onSite = (x, y) => x !== null && dist2(x, y, SITE.x, SITE.y) <= SITE.r;
    const used = (t) => $(`[data-t="${t}"]`, body).classList.add('is-used');
    setStep(0); info('');

    // Vorschieben bis zum Blutrueckfluss
    const startPush = () => {
        setStep(5);
        $('#gTray', body).classList.add('hidden');
        $('#gPush', body).classList.remove('hidden');
        const fill = $('#gPush .drill__fill', body), zone = $('#gPush .drill__zone', body), flash = $('#gFlash', body);
        const zoneAt = 40 + Math.random() * 25, zoneW = 14;
        zone.style.bottom = zoneAt + '%'; zone.style.height = zoneW + '%';
        let depth = 0, holding = false, last = performance.now(), done = false;
        const loop = (t) => {
            const dt = (t - last) / 1000; last = t;
            if (holding && !done) depth += dt * 22;
            fill.style.height = Math.min(100, depth) + '%';
            flash.setAttribute('opacity', depth >= zoneAt ? '1' : '0');
            zone.classList.toggle('is-hit', depth >= zoneAt && depth <= zoneAt + zoneW);
            if (depth > zoneAt + zoneW && !done) {
                done = true; holding = false;
                err('Vene durchstochen - Haematom. Kanuele zurueckziehen und neu punktieren.');
                if (!finished) setTimeout(() => { depth = 0; done = false; info('Neuer Versuch'); }, 900);
            }
            Game.raf = requestAnimationFrame(loop);
        };
        Game.raf = requestAnimationFrame(loop);
        const release = () => {
            if (!holding || done || finished) return;
            holding = false;
            if (depth < zoneAt) return info('Noch kein Blutrueckfluss - weiter vorschieben');
            done = true;
            cancelAnimationFrame(Game.raf); Game.raf = null;
            $('#gPush', body).classList.add('hidden');
            $('#gNeedleHit', body).classList.remove('hidden');
            hint.innerHTML = `Stauband anklicken = Stauung loesen<br>Weissen Mandrin-Griff anklicken = Mandrin ziehen`;
            info('Blutrueckfluss in der Kammer - Kanuele liegt in der Vene');
            setStep(6);
        };
        $('#gPushBtn', body).addEventListener('pointerdown', () => { holding = true; });
        Game.listen(window, 'pointerup', release);
        Game.listen(window, 'keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); holding = true; } });
        Game.listen(window, 'keyup', (e) => { if (e.code === 'Space') release(); });
    };

    // Stauung loesen (Klick auf das Stauband) und Mandrin ziehen (Klick auf den Griff)
    $('#gStau', body).addEventListener('click', () => {
        if (finished || !stau) return;
        if (step < 6) return err('Zu frueh geloest - die Vene faellt zusammen. Erst punktieren, dann die Stauung loesen.');
        stau = false; $('#gStau', body).classList.remove('is-on'); info('Stauung geloest');
    });
    $('#gNeedleHit', body).addEventListener('click', () => {
        if (finished || step !== 6) return;
        if (stau) { err('Blut laeuft aus der Kanuele - zuerst die Stauung loesen, dann den Mandrin ziehen.'); if (finished) return; stau = false; $('#gStau', body).classList.remove('is-on'); }
        $('#gNeedleHit', body).classList.add('hidden');
        $('#gFlash', body).setAttribute('opacity', '0');
        setArm(4); hint.textContent = '';
        $('#gTray', body).classList.remove('hidden');
        info('Mandrin gezogen, Kanuele verschlossen');
        setStep(7);
    });

    const tools = {
        stau: { onDrop: (x, y) => {
            if (x === null || finished || step !== 0) return;
            if (y > 330) return err('Zu weit distal - das Stauband gehoert oberhalb der Punktionsstelle an den Unterarm.');
            stau = true; used('stau'); $('#gStau', body).classList.add('is-on');
            info('Gestaut - die Venen am Handruecken fuellen sich'); setStep(1);
        } },
        spray: { onDrop: (x, y) => {
            if (finished || !onSite(x, y)) return;
            if (step === 0) return err('Zuerst stauen - sonst sind die Venen nicht zu sehen.');
            if (step === 1) { sprays = 1; setArm(2); info('Eingesprueht'); return setStep(2); }
            if (step === 2) return err('Erst mit der Kompresse wischen, dann erneut spruehen.');
            if (step === 3 && wiped && sprays === 1) {
                sprays = 2; setArm(2); prog.classList.remove('hidden'); used('spray'); used('komp');
                let t = 0;
                Game.timer = setInterval(() => {
                    t += 100; progFill.style.width = Math.min(100, t / 30) + '%';
                    if (t >= 3000) { clearInterval(Game.timer); dry = true; prog.classList.add('hidden'); setArm(1); setStep(4); info('Einwirkzeit abgelaufen'); }
                }, 100);
                info('Einwirkzeit laeuft ...');
            }
        } },
        komp: { onDrop: (x, y) => {
            if (finished || !onSite(x, y)) return;
            if (step !== 2) return info(step < 2 ? 'Zuerst einspruehen' : 'Nicht mehr wischen - sonst ist die Stelle nicht mehr steril');
            wiped = true; setArm(1); info('Gewischt'); setStep(3);
        } },
        kan: { onDrop: (x, y) => {
            if (x === null || finished) return;
            if (!onSite(x, y)) return err('Daneben - die Kanuele auf der gestauten Vene am Handruecken ansetzen.');
            if (!stau) return err('Ohne Stauung ist die Vene nicht gefuellt.');
            if (step < 3) err('Nicht ausreichend desinfiziert (spruehen - wischen - spruehen)!');
            else if (step === 3 && !dry) { clearInterval(Game.timer); prog.classList.add('hidden'); err('Einwirkzeit nicht abgewartet.'); }
            if (finished) return;
            used('kan'); used('spray'); used('komp'); setArm(3);
            startPush();
        } },
        pfl: { onDrop: (x, y) => {
            if (x === null || finished || step !== 7) return;
            if (!onSite(x, y) && dist2(x, y, 230, 510) > 80) return info('Das Pflaster ueber die Kanuele kleben');
            used('pfl'); finished = true; setArm(5);
            Game.done(body, true, 'Zugang liegt sicher und ist fixiert.');
        } },
    };
    Object.entries(tools).forEach(([id, t]) => draggable($(`[data-t="${id}"]`, body), svg, Object.assign({ ghostHtml: () => $(`[data-t="${id}"] img`, body).outerHTML }, t)));
    Game.onKey(() => {});
}

/* Intraossaerer Zugang am Unterschenkel (Bein 704 x 1066, Knie oben, Sprunggelenk unten; medial = links im Bild):
   Punktionsstelle ertasten, spruehen - wischen - spruehen, Bohrer senkrecht ansetzen, bohren bis der Widerstand nachlaesst,
   Mandrin entfernen, mit NaCl spuelen, fixieren. */
function gameIo(body) {
    const SITES = [
        { id: 'prox', x: 300, y: 110, r: 42, name: 'proximale Tibia (unterhalb der Tuberositas, medial)' },
        { id: 'dist', x: 300, y: 765, r: 42, name: 'distale Tibia (oberhalb des Innenknoechels)' },
    ];
    const WRONG = [
        { x: 350, y: 15, r: 30, msg: 'Das ist die Kniescheibe bzw. das Kniegelenk - nie ins Gelenk bohren.' },
        { x: 365, y: 330, r: 26, msg: 'Direkt auf der Schienbeinkante rutscht der Bohrer ab - etwas medial auf die flache Flaeche.' },
        { x: 445, y: 220, r: 45, msg: 'Lateral liegt die Fibula unter Muskulatur - nicht geeignet.' },
        { x: 215, y: 300, r: 55, msg: 'Wadenmuskulatur - dort ist kein Knochen tastbar.' },
    ];
    let step = 0, errors = 0, finished = false, site = null, sprays = 0, dry = false;
    const STEPS = ['Punktionsstelle ertasten und anklicken', 'Punktionsstelle einspruehen', 'Mit der Kompresse wischen',
        'Erneut einspruehen und Einwirkzeit abwarten', 'Bohrer mit Nadel senkrecht (90 Grad) auf den Knochen setzen',
        'Bohren - loslassen, sobald der Widerstand nachlaesst', 'Mandrin entfernen und mit 10 ml NaCl spuelen', 'Nadel fixieren'];
    body.innerHTML = `<p class="dim" id="gStep"></p>
        <div class="ivwrap">
            <div class="figwrap figwrap--ivarm figwrap--leg"><svg viewBox="0 0 704 1066" class="fig" id="gFig" preserveAspectRatio="xMidYMid meet">
                <image href="img/io_bein.webp" x="0" y="0" width="704" height="1066"/>
                <g id="gMarks"></g><g id="gTools"></g>
            </svg></div>
            <div class="ivtools">
                <div class="tray tray--tools tray--col" id="gTray">
                    <div class="tool-item" data-t="spray"><img src="img/iv_desinfektion.png" alt="" class="tall"><span>Hautdesinfektion</span></div>
                    <div class="tool-item" data-t="komp"><img src="img/iv_kompresse.png" alt=""><span>Kompresse</span></div>
                    <div class="tool-item" data-t="drill"><img src="img/io_bohrer.png" alt=""><span>i.o.-Bohrer mit Nadel</span></div>
                    <div class="tool-item" data-t="pfl"><img src="img/iv_pflaster.png" alt=""><span>Fixierung</span></div>
                </div>
                <div class="ivside hidden" id="gPush">
                    <div class="drill drill--iv"><div class="drill__zone"></div><div class="drill__fill"></div></div>
                    <div class="ivside__txt"><b>Bohren</b><span class="dim">"Bohren" oder Leertaste <b>halten</b>. Loslassen, sobald der Widerstand nachlaesst (Markraum erreicht).</span>
                        <button class="btn btn--primary" id="gPushBtn">${icon('screwdriver')} Bohren (halten)</button></div>
                </div>
                <div class="ivside ivside--col hidden" id="gFinish">
                    <button class="btn" id="gMandrin">${icon('syringe')} Mandrin entfernen</button>
                    <button class="btn" id="gFlush" disabled>${icon('droplet')} Mit 10 ml NaCl spuelen</button>
                </div>
            </div>
        </div>
        <div class="dim" id="gStat"></div>
        <div class="progress-mini hidden" id="gProg"><div></div></div>`;
    const svg = $('#gFig', body), marks = $('#gMarks', body), toolsG = $('#gTools', body), stepEl = $('#gStep', body), stat = $('#gStat', body);
    const prog = $('#gProg', body), progFill = $('#gProg div', body);
    const setStep = (n) => { step = n; stepEl.innerHTML = `<b>Schritt ${n + 1}/${STEPS.length}:</b> ${esc(STEPS[n])}`; };
    const err = (msg) => { errors++; stat.innerHTML = `<span class="warn">${esc(msg)}</span> · Fehler ${errors}/1`;
        if (errors > 1 && !finished) { finished = true; Game.done(body, false, 'Zu viele Fehler - Punktion abgebrochen.'); } };
    const info = (msg) => { stat.innerHTML = `${esc(msg)} · Fehler ${errors}/1`; };
    const onSite = (x, y) => site && x !== null && dist2(x, y, site.x, site.y) <= 60;
    const used = (t) => $(`[data-t="${t}"]`, body).classList.add('is-used');
    setStep(0); info('');

    // 1. Punktionsstelle ertasten
    Game.listen(svg, 'click', (e) => {
        if (finished || step !== 0) return;
        const p = svgPoint(svg, e.clientX, e.clientY);
        const ok = SITES.find(s => dist2(p.x, p.y, s.x, s.y) <= s.r);
        if (!ok) {
            const w = WRONG.find(s => dist2(p.x, p.y, s.x, s.y) <= s.r);
            return err(w ? w.msg : 'Ungeeignete Stelle - proximale Tibia unterhalb der Tuberositas (medial) oder distale Tibia oberhalb des Innenknoechels.');
        }
        site = { x: p.x, y: p.y, name: ok.name };
        marks.innerHTML = `<circle cx="${site.x}" cy="${site.y}" r="22" class="mark-site"/>`;
        info(`Punktionsstelle: ${site.name}`);
        setStep(1);
    });

    // Bohren bis Widerstandsverlust
    const startDrill = () => {
        setStep(5);
        $('#gTray', body).classList.add('hidden');
        $('#gPush', body).classList.remove('hidden');
        const fill = $('#gPush .drill__fill', body), zone = $('#gPush .drill__zone', body);
        const zoneAt = 45 + Math.random() * 25, zoneW = 12;
        zone.style.bottom = zoneAt + '%'; zone.style.height = zoneW + '%';
        let depth = 0, holding = false, last = performance.now(), done = false;
        const loop = (t) => {
            const dt = (t - last) / 1000; last = t;
            if (holding && !done) depth += dt * (depth > zoneAt ? 40 : 20);
            fill.style.height = Math.min(100, depth) + '%';
            zone.classList.toggle('is-hit', depth >= zoneAt && depth <= zoneAt + zoneW);
            stat.innerHTML = `${depth >= zoneAt ? 'Widerstand laesst nach ...' : holding ? 'Bohrer laeuft - harter Widerstand (Kortikalis)' : 'Bereit'} · Fehler ${errors}/1`;
            if (depth > zoneAt + zoneW && !done) {
                done = true; holding = false;
                err('Zu tief - Gegenkortikalis durchbohrt. Nadel entfernen, neue Punktion.');
                if (!finished) setTimeout(() => { depth = 0; done = false; }, 900);
            }
            Game.raf = requestAnimationFrame(loop);
        };
        Game.raf = requestAnimationFrame(loop);
        const release = () => {
            if (!holding || done || finished) return;
            holding = false;
            if (depth < zoneAt) return info('Noch im Knochen (Kortikalis) - weiterbohren');
            done = true;
            cancelAnimationFrame(Game.raf); Game.raf = null;
            $('#gDrillImg', body)?.remove();
            toolsG.insertAdjacentHTML('beforeend', `<g id="gHub"><circle cx="${site.x}" cy="${site.y}" r="15" fill="#1f6fd1" stroke="#0b3a75" stroke-width="3"/>
                <circle cx="${site.x}" cy="${site.y}" r="6" fill="#e8e8e8" stroke="#555" stroke-width="2" id="gStylet"/></g>`);
            $('#gPush', body).classList.add('hidden');
            $('#gFinish', body).classList.remove('hidden');
            info('Nadel sitzt fest im Markraum');
            setStep(6);
        };
        $('#gPushBtn', body).addEventListener('pointerdown', () => { holding = true; });
        Game.listen(window, 'pointerup', release);
        Game.listen(window, 'keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); holding = true; } });
        Game.listen(window, 'keyup', (e) => { if (e.code === 'Space') release(); });
    };
    $('#gMandrin', body).onclick = () => {
        if (finished || step !== 6) return;
        $('#gStylet', body)?.setAttribute('fill', '#2a2a2a');
        $('#gMandrin', body).disabled = true; $('#gFlush', body).disabled = false;
        info('Mandrin entfernt');
    };
    $('#gFlush', body).onclick = () => {
        if (finished || step !== 6) return;
        $('#gFinish', body).classList.add('hidden');
        $('#gTray', body).classList.remove('hidden');
        info('Mit 10 ml NaCl gespuelt - laeuft frei, keine Schwellung');
        setStep(7);
    };

    const tools = {
        spray: { onDrop: (x, y) => {
            if (finished || !onSite(x, y)) return step === 0 && x !== null ? info('Zuerst die Punktionsstelle ertasten') : undefined;
            if (step === 1) { sprays = 1; marks.insertAdjacentHTML('afterbegin', `<ellipse cx="${site.x}" cy="${site.y}" rx="55" ry="45" fill="rgba(255,255,255,0.22)" id="gWet"/>`); info('Eingesprueht'); return setStep(2); }
            if (step === 2) return err('Erst mit der Kompresse wischen, dann erneut spruehen.');
            if (step === 3 && sprays === 1) {
                sprays = 2; used('spray'); used('komp'); prog.classList.remove('hidden');
                marks.insertAdjacentHTML('afterbegin', `<ellipse cx="${site.x}" cy="${site.y}" rx="55" ry="45" fill="rgba(255,255,255,0.22)" id="gWet"/>`);
                let t = 0;
                Game.timer = setInterval(() => {
                    t += 100; progFill.style.width = Math.min(100, t / 30) + '%';
                    $('#gWet', body)?.setAttribute('opacity', String(Math.max(0, 1 - t / 3000)));
                    if (t >= 3000) { clearInterval(Game.timer); dry = true; prog.classList.add('hidden'); $('#gWet', body)?.remove(); setStep(4); info('Einwirkzeit abgelaufen'); }
                }, 100);
                info('Einwirkzeit laeuft ...');
            }
        } },
        komp: { onDrop: (x, y) => {
            if (finished || !onSite(x, y)) return;
            if (step !== 2) return info(step < 2 ? 'Zuerst einspruehen' : 'Nicht mehr wischen - die Stelle ist desinfiziert');
            $('#gWet', body)?.remove(); info('Gewischt'); setStep(3);
        } },
        drill: { onDrop: (x, y) => {
            if (x === null || finished) return;
            if (!site) return info('Zuerst die Punktionsstelle ertasten');
            if (!onSite(x, y)) return err('Daneben - den Bohrer genau an der ertasteten Stelle ansetzen.');
            if (step < 3) err('Nicht ausreichend desinfiziert (spruehen - wischen - spruehen)!');
            else if (step === 3 && !dry) { clearInterval(Game.timer); prog.classList.add('hidden'); err('Einwirkzeit nicht abgewartet.'); }
            if (finished) return;
            used('drill'); used('spray'); used('komp'); $('.mark-site', body)?.remove(); $('#gWet', body)?.remove();
            // Nadelspitze des Bohrers (oben links im Bild) auf der Punktionsstelle
            toolsG.insertAdjacentHTML('beforeend', `<image id="gDrillImg" href="img/io_bohrer.png" x="${site.x - 23}" y="${site.y - 51}" width="230" height="230"/>`);
            startDrill();
        } },
        pfl: { onDrop: (x, y) => {
            if (x === null || finished || step !== 7) return;
            if (!onSite(x, y)) return info('Die Fixierung ueber die Nadel kleben');
            used('pfl'); finished = true;
            toolsG.insertAdjacentHTML('beforeend', `<image href="img/iv_pflaster.png" x="${site.x - 68}" y="${site.y - 61}" width="136" height="122"/>`);
            toolsG.appendChild($('#gHub', body));   // Nadelansatz bleibt sichtbar (Pflaster hat ein Fenster)
            Game.done(body, true, 'i.o.-Zugang liegt sicher und ist fixiert.');
        } },
    };
    Object.entries(tools).forEach(([id, t]) => draggable($(`[data-t="${id}"]`, body), svg, Object.assign({ ghostHtml: () => $(`[data-t="${id}"] img`, body).outerHTML }, t)));
    Game.onKey(() => {});
}

/* Thoraxentlastung: richtige Landmarke am echten Oberkoerper waehlen (Monaldi 2. ICR MCL / Buelau 4.-5. ICR vordere Axillarlinie) */
function gameLandmark(body) {
    // Bildpixel auf torso.webp (rechte Patientenseite = links im Bild)
    const pts = [
        { id: 'r_monaldi', x: 340, y: 240, side: 'rechts', ok: true }, { id: 'l_monaldi', x: 546, y: 240, side: 'links', ok: true },
        { id: 'r_buelau', x: 282, y: 445, side: 'rechts', ok: true }, { id: 'l_buelau', x: 604, y: 445, side: 'links', ok: true },
        { id: 'r_para', x: 412, y: 240, ok: false }, { id: 'l_para', x: 474, y: 240, ok: false },
        { id: 'r_low', x: 340, y: 590, ok: false }, { id: 'l_low', x: 546, y: 590, ok: false },
        { id: 'r_clav', x: 340, y: 172, ok: false }, { id: 'l_clav', x: 546, y: 172, ok: false },
        { id: 'herz', x: 520, y: 470, ok: false },
    ];
    const guides = `<line x1="340" y1="140" x2="340" y2="640" class="anat__guide"/><line x1="546" y1="140" x2="546" y2="640" class="anat__guide"/>
        <line x1="282" y1="300" x2="282" y2="640" class="anat__guide anat__guide--ax"/><line x1="604" y1="300" x2="604" y2="640" class="anat__guide anat__guide--ax"/>`;
    body.innerHTML = `<p class="dim">Punktionsstelle an der betroffenen Seite waehlen. Tipp: vorher die Lunge abhoeren.</p>
        <div class="figwrap figwrap--photo figwrap--thorax">${photoSvg(PHOTO.torso, `<g class="show-guides">${guides}</g>
            ${pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="15" class="lm-pt" data-pt="${p.id}"/>`).join('')}`, '120 100 640 600')}
            <span class="fig__side" style="left:10px">rechts</span><span class="fig__side" style="right:10px">links</span></div>
        <div class="dim">Blau gestrichelt: Medioklavikularlinie · Lila: vordere Axillarlinie</div>`;
    $$('[data-pt]', body).forEach(el => el.addEventListener('click', () => {
        const p = pts.find(x => x.id === el.dataset.pt);
        el.classList.add(p.ok ? 'is-set' : 'is-wrong');
        if (!p.ok) return Game.done(body, false, 'Falsche Landmarke - keine Entlastung moeglich.', 'fail');
        Game.done(body, true, `Punktion ${p.side} gesetzt.`, p.side);
    }));
    Game.onKey(() => {});
}

/* ------------------------------------------------------------------ */
/* Patientenmonitor mit EKG-Kurve                                      */
/* ------------------------------------------------------------------ */
const Monitor = {
    data: null, raf: null, x: 0, last: 0, phase: 0,
    show(d) {
        const box = $('#monitor');
        if (!d) { box.classList.add('hidden'); this.data = null; if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; return; }
        const first = !this.data;
        this.data = d;
        const m = d.monitor || {};
        const ekg = d.ekg;
        const val = (v, unit) => v === undefined || v === null ? '<span class="dim">--</span>' : `${esc(v)}<small>${unit}</small>`;
        box.innerHTML = `<div class="monitor__head"><span>${icon('desktop')} ${esc(d.name || 'Patient')}</span>
                ${d.arrest ? '<span class="chip chip--danger">Kreislaufstillstand</span>' : d.rosc ? '<span class="chip chip--ok">ROSC</span>' : ''}</div>
            <canvas class="monitor__ekg" width="320" height="70"></canvas>
            <div class="monitor__rhythm">${ekg ? esc(ekg.label) + (ekg.leads === 12 ? ' · 12 Kanal' : '') : 'kein EKG angelegt'}</div>
            <div class="monitor__vals">
                <div class="mv mv--hf"><span>HF</span><b>${val(ekg ? m.hf : null, '/min')}</b></div>
                <div class="mv mv--spo2"><span>SpO₂</span><b>${val(m.spo2, '%')}</b></div>
                <div class="mv mv--rr"><span>NIBP</span><b>${val(m.rr, '')}</b></div>
                <div class="mv mv--af"><span>AF</span><b>${val(m.af, '/min')}</b></div>
            </div>`;
        box.classList.remove('hidden');
        this.canvas = $('canvas', box);
        this.ctx = this.canvas.getContext('2d');
        this.x = 0;
        if (first || !this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(t => this.tick(t)); }
    },
    // Kurvenwert fuer Phase 0..1 eines Herzschlags
    wave(kind, ph) {
        if (kind === 'flat') return (Math.random() - 0.5) * 0.02;
        if (kind === 'vf') return Math.sin(ph * 38) * 0.35 + Math.sin(ph * 23 + 1) * 0.25 + (Math.random() - 0.5) * 0.15;
        const g = (c, w, a) => a * Math.exp(-Math.pow((ph - c) / w, 2));
        let y = g(0.18, 0.035, 0.12) - g(0.3, 0.012, 0.12) + g(0.33, 0.014, 1.0) - g(0.36, 0.014, 0.25) + g(0.6, 0.06, 0.22);
        if (kind === 'stemi') y += ph > 0.37 && ph < 0.58 ? 0.25 : 0;
        if (kind === 'afib') y = y - g(0.18, 0.035, 0.12) + Math.sin(ph * 60) * 0.03;
        return y;
    },
    tick(t) {
        if (!this.data) return;
        const dt = (t - this.last) / 1000; this.last = t;
        const ekg = this.data.ekg;
        const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
        const hf = ekg ? (this.data.monitor && this.data.monitor.hf) || 0 : 0;
        const kind = !ekg ? 'flat' : (ekg.wave || 'sinus');
        const speed = 90; // Pixel pro Sekunde
        const steps = Math.max(1, Math.round(dt * speed));
        for (let i = 0; i < steps; i++) {
            const beat = kind === 'vf' || kind === 'flat' ? 1.2 : 60 / Math.max(20, hf || 60) * (kind === 'afib' ? (0.7 + Math.random() * 0.6) : 1);
            this.phase += (1 / speed) / beat;
            if (this.phase >= 1) this.phase -= 1;
            const y = H * 0.62 - this.wave(kind, this.phase) * H * 0.5;
            ctx.fillStyle = '#0b0b0b';
            ctx.fillRect(this.x, 0, 8, H);
            ctx.strokeStyle = '#3fb950'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(this.x - 1, this.prevY ?? y); ctx.lineTo(this.x, y); ctx.stroke();
            this.prevY = y;
            this.x = (this.x + 1) % W;
            if (this.x === 0) this.prevY = undefined;
        }
        this.raf = requestAnimationFrame(tt => this.tick(tt));
    },
};
