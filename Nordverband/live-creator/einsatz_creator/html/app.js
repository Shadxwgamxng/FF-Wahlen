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
function fireFields(p, pre, withRoom) {
    const C = S.catalog;
    if (isZFire()) {
        const zf = S.config.zfire || {};
        return `${zf.running ? '' : `<div class="alert alert--warn">${icon('triangle-exclamation')}<div>z_fire ist nicht gestartet.</div></div>`}
            <div class="grid-2">${fSel('Partikeltyp', pre + 'zfEffect', p.zfEffect, arr(zf.fireEffects).map(x => [x, x]))}
            ${fSel('Brandverhalten', pre + 'zfBehaviour', p.zfBehaviour, [['auto', 'Automatisch'], ['grass', 'Fläche'], ['interior', 'Innenraum'], ['prop', 'Objekt'], ['vehicle', 'Fahrzeug']])}</div>
            <div class="grid-2">${fNum('Größe', pre + 'size', p.size, { step: 0.1, min: 0.2, max: 5 })}
            ${fNum('Brenndauer (s)', pre + 'burnTime', p.burnTime, { int: true, min: 0, max: 7200, hint: '0 = bis gelöscht' })}</div>
            ${fSwitch('Ausbreitung', pre + 'canSpread', p.canSpread)}
            ${p.canSpread ? fNum('Ausbreitungsradius (m)', pre + 'spreadRadius', p.spreadRadius, { step: 1, min: 1, max: 40 }) : ''}
            ${withRoom ? `<div class="field"><span class="field__label">Room-Key für Innenraumbrand</span><div class="input-group input-group--btn">
                <input class="input" type="number" data-path="${pre}roomHash" data-type="int" value="${p.roomHash || 0}"><button class="btn btn--sm" data-act="roomHash">${icon('crosshairs')} Ermitteln</button></div></div>` : ''}
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
    if (t.closest('[data-scope^="tpl:"]') && ['props.canSpread', 'props.patient.profile'].includes(t.dataset.path)) renderPanel(true);
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
const pushEdit = debounce(async () => { if (!S.edit) return; const r = await post('updateElement', { element: S.edit }); if (!r.ok) renderInspector(true); }, 250);
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
    if (['props.pose', 'props.isPatient', 'props.canSpread', 'props.patient.profile', 'props.patient.destination'].includes(path)) {
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
