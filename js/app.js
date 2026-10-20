// Inspektr – app shell, routing and screens.

import { loadState, saveState, clearState, clearMedia, putMedia, mediaUrl, uid } from './store.js';
import { demoState, demoArt, TEMPLATES, TEMPLATE_LABELS } from './demo.js';
import {
  planSVG, roomsFor, matchRoom, unplacedItems, eventToPlan, roomAt, toRoomXY, autoSpot, normRoom,
} from './floorplan.js';
import { parsePhrase, createRecognizer, speechSupported } from './voice.js';
import {
  analyse, conditionFrom, ratingsFor, standardItems, isTestable, KEYS_AND_METERS, CLEAN, DAMAGE, FUNC, ACTIONS,
} from './vocab.js';
import { AGENCY, DISCLAIMER } from './config.js';
import { openCamera, stopStream, startRecording, captureStill, steady, artFor } from './recorder.js';
import {
  $, $$, esc, fmtDate, fmtClock, fmtDuration, dueText, daysFrom, todayIso, toast, sound, buzz, icon, brandMark,
  openSheet, closeSheet, badge, TYPE_LABEL, TYPE_SHORT, COND_LABEL,
} from './ui.js';

// ============================================================ state
let state = loadState();
if (!state || (state.version || 1) < 2) {
  // New demo data with full SA checklists; keep anything the user recorded themselves.
  const fresh = demoState();
  if (state) {
    const demoProps = new Set(fresh.properties.map((p) => p.id));
    const oldDemo = new Set(['i_lyn_in', 'i_lyn_routine', 'i_hat_in', 'i_bro_routine', 'i_gar_routine', 'i_cen_inv']);
    fresh.properties.push(...(state.properties || []).filter((p) => !demoProps.has(p.id)));
    fresh.inspections.push(...(state.inspections || []).filter((i) => !oldDemo.has(i.id)));
    fresh.inspector = state.inspector || fresh.inspector;
  }
  state = fresh;
}
if ((state.version || 1) < 3) {
  const fresh = demoState();
  state.history = state.history || fresh.history;
  state.plans = state.plans || fresh.plans;
  state.version = 3;
}
state.history = state.history || [];
state.plans = state.plans || [];
const save = () => saveState(state);
save();

const prop = (id) => state.properties.find((p) => p.id === id);
const insp = (id) => state.inspections.find((i) => i.id === id);
const inspectionsFor = (pid) => state.inspections
  .filter((i) => i.propertyId === pid && i.status !== 'recording')
  .sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || '')));
const latestFor = (pid) => inspectionsFor(pid).find((i) => i.items?.length) || null;
const openDefects = (pid) => (latestFor(pid)?.items || []).filter((it) => it.condition === 'defect' && it.job?.status !== 'done');

function seedOf(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
async function itemImage(item) {
  if (item.photoId) { const u = await mediaUrl(item.photoId); if (u) return u; }
  return demoArt(item.art || artFor(`${item.name} ${item.text}`), seedOf(item.id));
}
function itemImageSync(item) {
  return item.photoId ? '' : demoArt(item.art || artFor(`${item.name} ${item.text}`), seedOf(item.id));
}
/** Fills <img data-photo="id"> elements that need IndexedDB lookups. */
async function hydrateImages(root) {
  for (const img of $$('img[data-photo]', root)) {
    const url = await mediaUrl(img.dataset.photo);
    if (url) img.src = url;
    else {
      const owner = findItem(img.dataset.item);
      if (owner) img.src = demoArt(owner.art || 'item', seedOf(owner.id));
    }
  }
}
function imgTag(item, cls = '') {
  if (item.photoId) return `<img class="${cls}" data-photo="${esc(item.photoId)}" data-item="${esc(item.id)}" alt="Photo of ${esc(item.name)}" loading="lazy">`;
  return `<img class="${cls}" src="${itemImageSync(item)}" alt="Photo of ${esc(item.name)}" loading="lazy">`;
}
function findItem(id) {
  for (const i of state.inspections) { const it = (i.items || []).find((x) => x.id === id); if (it) return it; }
  return null;
}
function inspOfItem(id) { return state.inspections.find((i) => (i.items || []).some((x) => x.id === id)) || null; }

// ============================================================ shell
const app = document.getElementById('app');
let cleanup = [];
const onCleanup = (fn) => cleanup.push(fn);

function shell(active) {
  return `
  <header class="topbar">
    <a class="brand" href="#/">${brandMark}<span class="brand-word">Inspekt<b>r</b></span></a>
    <nav class="topnav" aria-label="Main">
      <a href="#/" ${active === 'home' ? 'aria-current="page"' : ''}>Portfolio</a>
      <a href="#/planner" ${active === 'planner' ? 'aria-current="page"' : ''}>Planner<span class="nbadge" data-plan-badge hidden></span></a>
      <a href="#/dashboard" ${active === 'dashboard' ? 'aria-current="page"' : ''}>Dashboard</a>
      <a href="#/repairs" ${active === 'repairs' ? 'aria-current="page"' : ''}>Repairs</a>
    </nav>
    <div class="spacer"></div>
    <a class="btn btn--primary btn--sm" href="#/new">${icon.rec}Start inspection</a>
  </header>
  <main class="view" id="view"></main>
  <nav class="tabbar" aria-label="Main">
    <a href="#/" ${active === 'home' ? 'aria-current="page"' : ''}>${icon.map}<span>Portfolio</span></a>
    <a href="#/planner" ${active === 'planner' ? 'aria-current="page"' : ''}>${icon.calendar}<span>Planner</span><span class="nbadge" data-plan-badge hidden></span></a>
    <a href="#/new" class="tab-record"><span class="dot">${icon.rec}</span><span class="label">Inspect</span></a>
    <a href="#/dashboard" ${active === 'dashboard' ? 'aria-current="page"' : ''}>${icon.chart}<span>Dashboard</span></a>
    <a href="#/repairs" ${active === 'repairs' ? 'aria-current="page"' : ''}>${icon.wrench}<span>Repairs</span></a>
  </nav>`;
}

function route() {
  cleanup.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
  cleanup = [];
  closeSheet(true);
  document.body.classList.remove('is-recording');
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query);
  const [name, id] = path.split('/');
  const active = ['repairs', 'dashboard', 'planner'].includes(name) ? name : name === '' ? 'home' : '';
  app.innerHTML = shell(active);
  const view = $('#view');
  window.scrollTo(0, 0);

  const routes = {
    '': () => viewHome(view),
    property: () => viewProperty(view, id, params),
    new: () => viewNew(view, id, params),
    dashboard: () => viewDashboard(view),
    planner: () => viewPlanner(view, params),
    record: () => viewRecord(view, id),
    process: () => viewProcess(view, id),
    review: () => viewReview(view, id),
    sign: () => viewSign(view, id),
    report: () => viewReport(view, id),
    repairs: () => viewRepairs(view),
    add: () => viewAdd(view),
  };
  (routes[name] || routes[''])();
  checkReminders();
}
window.addEventListener('hashchange', route);

const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

// ============================================================ map helpers
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const BASEMAPS = {
  'Street map': ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: OSM_ATTR, maxZoom: 19 }],
  Satellite: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics', maxZoom: 19 }],
  Dark: ['https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: `${OSM_ATTR} &copy; <a href="https://carto.com/attributions">CARTO</a>`, subdomains: 'abcd', maxZoom: 20 }],
};
const BASEMAP_KEY = 'inspektr.basemap';

function makeMap(el, opts = {}) {
  if (!window.L) {
    el.innerHTML = '<div class="empty">The map needs an internet connection. Your properties are listed below.</div>';
    return null;
  }
  const map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: opts.scroll ?? false, ...opts });
  const layers = Object.fromEntries(Object.entries(BASEMAPS).map(([name, [url, o]]) => [name, L.tileLayer(url, o)]));
  let pick = 'Street map';
  try { pick = localStorage.getItem(BASEMAP_KEY) || pick; } catch { /* ignore */ }
  (layers[pick] || layers['Street map']).addTo(map);
  L.control.layers(layers, null, { position: 'topright' }).addTo(map);
  map.on('baselayerchange', (e) => { try { localStorage.setItem(BASEMAP_KEY, e.name); } catch { /* ignore */ } });
  onCleanup(() => map.remove());
  return map;
}

function houseIcon(p) {
  const defects = openDefects(p.id).length;
  const due = daysFrom(p.nextDue);
  const cls = defects ? 'mk--alert' : due !== null && due <= 14 ? 'mk--due' : '';
  return L.divIcon({
    className: '',
    iconSize: [44, 52],
    iconAnchor: [22, 46],
    html: `<div class="mk ${cls}"><div class="mk-house"></div>${icon.house}${defects ? `<span class="mk-count">${defects}</span>` : ''}</div>`,
  });
}

// ============================================================ HOME
function viewHome(view) {
  const props = state.properties;
  const allDefects = props.reduce((n, p) => n + openDefects(p.id).length, 0);
  const due = props.filter((p) => { const d = daysFrom(p.nextDue); return d !== null && d <= 14; }).length;
  const month = todayIso().slice(0, 7);
  const thisMonth = state.inspections.filter((i) => i.date?.startsWith(month) && i.status === 'signed').length;

  view.innerHTML = `
  <div class="portfolio">
    <div class="portfolio-head">
      <div>
        <h1 class="display h1">Portfolio</h1>
        <p class="lede">${props.length} properties. Tap a house to see its defects on the floor plan.</p>
      </div>
      <a class="btn" href="#/add">${icon.plus}Add property</a>
    </div>
    <div class="figures">
      <div class="figure figure--alert"><b>${allDefects}</b><span>open defects</span></div>
      <div class="figure figure--due"><b>${due}</b><span>inspections due in 14 days</span></div>
      <div class="figure"><b>${thisMonth}</b><span>signed this month</span></div>
    </div>
    <div class="mapwrap vf"><span class="vf-b"></span><div class="map" id="map"></div><div class="map-hint">Tap a house to go inside</div></div>
    <section>
      <div class="section-head"><h2 class="h3">Properties</h2><span class="muted small">Most urgent first</span></div>
      <div class="plist">${sortedProps().map(propertyCard).join('')}</div>
    </section>
    <p class="tiny faint">Data is stored on this device only. <button class="btn btn--ghost btn--sm" id="reset">${icon.reset}Reset demo data</button></p>
  </div>`;

  const map = makeMap($('#map'), { scroll: false });
  if (map) {
    const bounds = [];
    props.forEach((p) => {
      const m = L.marker([p.lat, p.lng], { icon: houseIcon(p), title: p.name, keyboard: true }).addTo(map);
      m.bindTooltip(`<b>${esc(p.name)}</b><br>${openDefects(p.id).length} open defects`, { direction: 'top', offset: [0, -44] });
      m.on('click', () => enterHouse(map, p));
      bounds.push([p.lat, p.lng]);
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }
  $('#reset').addEventListener('click', async () => {
    clearState(); await clearMedia(); state = demoState(); save(); toast('Demo data restored'); route();
  });
}

function enterHouse(map, p) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { go(`#/property/${p.id}?from=map`); return; }
  map.once('moveend', () => setTimeout(() => go(`#/property/${p.id}?from=map`), 120));
  map.flyTo([p.lat, p.lng], 19, { duration: 1.3 });
}

function sortedProps() {
  return [...state.properties].sort((a, b) => {
    const da = openDefects(a.id).length; const db = openDefects(b.id).length;
    if (da !== db) return db - da;
    return (daysFrom(a.nextDue) ?? 999) - (daysFrom(b.nextDue) ?? 999);
  });
}

function propertyCard(p) {
  const latest = latestFor(p.id);
  const defects = openDefects(p.id).length;
  const due = daysFrom(p.nextDue);
  return `<a class="pcard" href="#/property/${p.id}">
    <div class="mini">${planSVG(p, (latest?.items || []).filter((i) => !i.std), { mini: true })}</div>
    <div>
      <h3>${esc(p.name)}</h3>
      <div class="muted small">${esc(p.suburb)}</div>
      <div class="meta">
        ${defects ? `<span class="badge badge--defect">${defects} open defect${defects > 1 ? 's' : ''}</span>` : '<span class="badge badge--good">No open defects</span>'}
        <span class="badge ${due !== null && due <= 14 ? 'badge--unrated' : ''}">${esc(dueText(p.nextDue))}</span>
      </div>
    </div>
  </a>`;
}

// ============================================================ PROPERTY
const FILTERS = ['defect', 'fair', 'good', 'missing', 'unrated', 'inventory', 'note'];
const FILTER_LABEL = { defect: 'Defects', fair: 'Fair', good: 'Good', missing: 'Missing', unrated: 'Unrated', inventory: 'Inventory', note: 'Notes' };
const FILTER_COLOR = { defect: 'var(--defect)', fair: 'var(--fair)', good: 'var(--good)', missing: 'var(--missing)', unrated: 'var(--amber)', inventory: 'var(--note)', note: 'var(--note)' };
const filterKey = (it) => (it.kind === 'note' ? 'note' : it.kind === 'inventory' && it.condition === 'good' ? 'inventory' : it.condition);

function viewProperty(view, id, params) {
  const p = prop(id);
  if (!p) { go('#/'); return; }
  const list = inspectionsFor(p.id);
  let current = insp(params.get('i')) || latestFor(p.id) || list[0] || null;
  const filter = new Set(FILTERS);
  let selected = params.get('f') || null;
  let first = true;

  view.innerHTML = `
  <div class="prop-head">
    <div class="crumbs"><a href="#/">Portfolio</a><span>/</span><span>${esc(p.suburb)}</span></div>
    <div class="portfolio-head">
      <h1 class="display h1">${esc(p.name)}</h1>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${current ? `<a class="btn" href="#/report/${current.id}">Open report</a>` : ''}
        <a class="btn btn--primary" href="#/new/${p.id}">${icon.rec}Start inspection</a>
      </div>
    </div>
    <div class="prop-facts">
      <span>${esc(p.suburb)}</span>
      <span>Tenant <b>${esc(p.tenant || 'None')}</b></span>
      <span>Owner <b>${esc(p.owner || '')}</b></span>
      <span>${esc(TEMPLATE_LABELS[p.template] || 'Custom layout')}${p.furnished ? ', furnished' : ''}</span>
      <span>${esc(dueText(p.nextDue))}</span>
    </div>
  </div>
  <div class="prop-grid">
    <section class="plan-panel vf" aria-label="Floor plan"><span class="vf-b"></span>
      <div class="plan-bar">
        <label class="sr-only" for="pick">Inspection shown</label>
        ${list.length ? `<select class="select" id="pick" style="width:auto;min-height:38px">${list.map((i) => `<option value="${i.id}" ${i.id === current?.id ? 'selected' : ''}>${TYPE_LABEL[i.type]} inspection, ${fmtDate(i.date)}</option>`).join('')}</select>` : '<span class="muted small">No inspections yet</span>'}
        <span class="muted small" id="plancount"></span>
      </div>
      <div class="plan-scroll" id="plan"></div>
      <span class="plan-scroll-hint">Swipe sideways to see the whole plan</span>
      <div class="legend" id="legend"></div>
      <div id="unplaced"></div>
    </section>
    <aside class="side">
      <section>
        <div class="section-head"><h2 class="h3">Inspection history</h2></div>
        <div class="history" id="history"></div>
      </section>
      <section class="panel">
        <h2 class="h3">Open repairs</h2>
        <div id="repairs-mini" class="stack"></div>
        <a class="btn btn--sm" href="#/repairs">All repairs</a>
      </section>
    </aside>
  </div>`;

  function renderPlan() {
    const items = (current?.items || []).filter((i) => !i.std);
    $('#plan').innerHTML = planSVG(p, items, { draw: first, selectedId: selected, filter, id: 'prop' });
    first = false;
    const counts = {};
    items.forEach((it) => { const k = filterKey(it); counts[k] = (counts[k] || 0) + 1; });
    $('#legend').innerHTML = FILTERS.filter((k) => counts[k]).map((k) => `<button type="button" data-k="${k}" aria-pressed="${filter.has(k)}"><i style="background:${FILTER_COLOR[k]}"></i>${FILTER_LABEL[k]} <b>${counts[k]}</b></button>`).join('');
    $('#plancount').textContent = current ? `${(current.items || []).length} items, ${fmtDuration(current.durationSec)} walk` : '';
    const loose = unplacedItems(p, items);
    $('#unplaced').innerHTML = loose.length ? `<div class="unplaced"><span class="muted small">Not on the plan:</span>${loose.map((it) => `<button class="btn btn--sm" data-open="${it.id}">${esc(it.name)}</button>`).join('')}</div>` : '';
    $('#history').innerHTML = list.length ? list.map((i) => `
      <a class="hrow ${i.id === current?.id ? 'is-current' : ''}" href="#/property/${p.id}?i=${i.id}">
        <span class="type-chip" data-t="${i.type}">${TYPE_SHORT[i.type]}</span>
        <span><b>${TYPE_LABEL[i.type]}</b><br><span class="muted small">${fmtDate(i.date)}, ${(i.items || []).length} findings</span></span>
        ${statusBadge(i)}
      </a>`).join('') : `<div class="empty">No inspections yet.<a class="btn btn--primary" href="#/new/${p.id}">Start the first one</a></div>`;
    const reps = openDefects(p.id);
    $('#repairs-mini').innerHTML = reps.length ? reps.map((it) => `<button class="hrow" data-open="${it.id}" style="text-align:left;width:100%;color:inherit"><span class="type-chip" style="color:var(--defect)">!</span><span><b>${esc(it.name)}</b><br><span class="muted small">${esc(it.room)}</span></span>${jobBadge(it)}</button>`).join('') : '<span class="muted small">Nothing waiting.</span>';
  }
  renderPlan();
  if (selected) setTimeout(() => openFinding(selected), 400);

  view.addEventListener('click', (e) => {
    const pin = e.target.closest('.pin');
    const open = e.target.closest('[data-open]');
    const leg = e.target.closest('#legend button');
    if (pin) { selected = pin.dataset.id; renderPlan(); openFinding(selected, () => { selected = null; renderPlan(); }); }
    else if (open) { e.preventDefault(); openFinding(open.dataset.open); }
    else if (leg) { const k = leg.dataset.k; filter.has(k) ? filter.delete(k) : filter.add(k); renderPlan(); }
  });
  view.addEventListener('keydown', (e) => {
    const pin = e.target.closest?.('.pin');
    if (pin && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pin.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  });
  $('#pick')?.addEventListener('change', (e) => { current = insp(e.target.value); selected = null; first = true; renderPlan(); });
}

function statusBadge(i) {
  if (i.status === 'signed') return '<span class="badge badge--good">Signed</span>';
  if (i.status === 'review' || i.status === 'processing') return '<span class="badge badge--unrated">In review</span>';
  return `<span class="badge">${esc(i.status)}</span>`;
}

const JOB_STEPS = ['approval', 'open', 'sent', 'quoted', 'booked', 'done'];
const JOB_LABEL = { approval: 'Waiting for owner', open: 'Approved, not sent', sent: 'Waiting for quotes', quoted: 'Quotes in', booked: 'Contractor booked', done: 'Repaired', declined: 'Owner declined' };
function jobBadge(it) {
  const s = it.job?.status;
  if (!s) return '<span class="badge badge--unrated">No repair job</span>';
  const cls = s === 'done' ? 'badge--good' : s === 'declined' ? '' : s === 'approval' ? 'badge--missing' : s === 'open' ? 'badge--defect' : 'badge--unrated';
  return `<span class="badge ${cls}">${JOB_LABEL[s]}</span>`;
}

// ---------- Finding sheet ----------
async function openFinding(itemId, onClose) {
  const it = findItem(itemId);
  const ins = inspOfItem(itemId);
  if (!it || !ins) return;
  const hasVideo = Boolean(ins.videoId);
  const sheet = openSheet(`
    <article class="finding">
      <div class="finding-media" id="fm">
        ${imgTag(it)}
        <span class="stamp">${fmtClock(it.t)} into the walk</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:start;gap:12px">
        <div><h2 class="h3" style="font-size:21px">${esc(it.name)}${it.qty > 1 ? ` <span class="muted">×${it.qty}</span>` : ''}</h2><div class="muted small">${esc(it.room)}</div></div>
        ${badge(it.condition, it.kind)}
      </div>
      ${it.text ? `<blockquote class="quote">“${esc(it.text)}”</blockquote>` : ''}
      <dl class="kv">
        <dt>Rating</dt><dd>${[R_OF(it, ins).clean, R_OF(it, ins).damage, R_OF(it, ins).func].filter(Boolean).join(', ') || 'Not rated'}</dd>
        ${R_OF(it, ins).action ? `<dt>Recommendation</dt><dd>${esc(R_OF(it, ins).action)}</dd>` : ''}
        <dt>Inspection</dt><dd>${TYPE_LABEL[ins.type]}, ${fmtDate(ins.date)}</dd>
        <dt>Inspector</dt><dd>${esc(ins.inspector || '')}</dd>
        ${it.condition === 'defect' ? `<dt>Repair</dt><dd>${jobBadge(it)}</dd>` : ''}
        ${it.cost ? `<dt>Deduction</dt><dd>R${esc(it.cost)}</dd>` : ''}
      </dl>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${hasVideo ? `<button class="btn" id="play">${icon.play}Play this moment</button>` : ''}
        ${(it.condition === 'defect' || it.condition === 'missing') && !it.job ? `<button class="btn btn--primary" id="mkjob">${icon.wrench}Send to owner for approval</button>` : ''}
        <a class="btn" href="#/report/${ins.id}">Open report</a>
        <button class="btn btn--ghost" data-close>Close</button>
      </div>
    </article>`, { onClose });
  hydrateImages(sheet);
  $('#play', sheet)?.addEventListener('click', async () => {
    const url = await mediaUrl(ins.videoId);
    if (!url) { toast('The walk video is not on this device'); return; }
    const box = $('#fm', sheet);
    box.innerHTML = `<video src="${url}" controls playsinline autoplay></video><span class="stamp">${fmtClock(it.t)} into the walk</span>`;
    const v = $('video', box);
    v.addEventListener('loadedmetadata', () => { v.currentTime = Math.max(0, (it.t || 0) - 2); });
  });
  $('#mkjob', sheet)?.addEventListener('click', () => {
    it.job = { status: 'approval', created: todayIso() }; save(); closeSheet(); toast('Sent to the owner for approval'); route();
  });
}

// ============================================================ NEW INSPECTION
const TYPE_DESC = {
  ingoing: 'Tenant moving in. Records the starting condition.',
  outgoing: 'Tenant moving out. Compared with the ingoing report.',
  routine: 'Check-up during the lease. Defects go to repairs.',
  inventory: 'Furniture and contents only, with counts.',
};

function viewNew(view, pid, params = new URLSearchParams()) {
  const props = state.properties;
  let p = prop(pid) || null;
  let type = 'ingoing';
  if (p) {
    const hasIn = inspectionsFor(p.id).some((i) => i.type === 'ingoing');
    type = hasIn ? 'routine' : 'ingoing';
  }
  if (TYPE_LABEL[params.get('type')]) type = params.get('type');
  const plan = state.plans.find((x) => x.id === params.get('plan')) || null;

  function render() {
    const ingoing = p ? inspectionsFor(p.id).find((i) => i.type === 'ingoing') : null;
    view.innerHTML = `
    <div class="setup">
      <div>
        <div class="crumbs"><a href="#/">Portfolio</a><span>/</span><span>New inspection</span></div>
        <h1 class="display h1" style="margin-top:8px">New inspection</h1>
      </div>
      <div class="field">
        <label for="np">Property</label>
        <select class="select" id="np">
          <option value="">Choose a property</option>
          ${props.map((x) => `<option value="${x.id}" ${x.id === p?.id ? 'selected' : ''}>${esc(x.name)}, ${esc(x.suburb)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <span class="label">Type</span>
        <div class="types">${Object.keys(TYPE_LABEL).map((t) => `<button type="button" class="type-opt" data-t="${t}" aria-pressed="${t === type}"><span class="type-chip" data-t="${t}">${TYPE_SHORT[t]}</span><span class="t">${TYPE_LABEL[t]}</span><span class="d">${TYPE_DESC[t]}</span></button>`).join('')}</div>
        ${type === 'outgoing' && p ? `<span class="small ${ingoing ? 'muted' : ''}" style="color:${ingoing ? '' : 'var(--amber)'}">${ingoing ? `Will compare against the ingoing inspection of ${fmtDate(ingoing.date)}.` : 'No ingoing inspection on record, so there is nothing to compare against.'}</span>` : ''}
      </div>
      <div class="row2">
        <div class="field"><label for="ni">Inspector</label><input class="input" id="ni" value="${esc(state.inspector || '')}" autocomplete="name"></div>
        <div class="field"><span class="label">Tenant</span><label class="toggle"><input type="checkbox" id="nt" checked><span>Tenant is present</span></label></div>
      </div>
      ${p ? `<div class="field"><span class="label">Rooms on the plan, in walking order</span><div class="rooms-check">${roomsFor(p).map((r) => `<span class="room-chip">${esc(r.name)}</span>`).join('')}</div></div>` : ''}
      <section class="panel">
        <h2 class="h3">How to inspect</h2>
        <p class="small muted" style="margin:0">Press record once and walk. Say the room, the item and its condition. Or tap instead of talking.</p>
        <div class="cheat">
          <div class="cheat-row"><span class="say">“New room kitchen”</span><span>Starts the next room</span></div>
          <div class="cheat-row"><span class="say">“Stove, four plates, good”</span><span>Adds an item rated good</span></div>
          <div class="cheat-row"><span class="say">“Tap is dripping, defect”</span><span>Adds a defect and takes a photo</span></div>
          <div class="cheat-row"><span class="say">“Take photo”</span><span>Photo of the last item. Or tap the shutter</span></div>
          <div class="cheat-row"><span class="say">Hold the shutter</span><span>Photo marked as a defect</span></div>
          <div class="cheat-row"><span class="say">“Inventory four dining chairs”</span><span>Adds an inventory line with a count</span></div>
          <div class="cheat-row"><span class="say">“Note …” / “Undo”</span><span>General remark / remove the last action</span></div>
          <div class="cheat-row"><span class="say">“Finish inspection”</span><span>Stops recording and drafts the report</span></div>
          <div class="cheat-row"><span>Keyboard</span><span><kbd>Space</kbd> photo, <kbd>D</kbd> defect, <kbd>G</kbd> good, <kbd>R</kbd> next room</span></div>
        </div>
      </section>
      <button class="btn btn--primary btn--block" id="go" ${p ? '' : 'disabled'}>${icon.rec}Start recording</button>
    </div>`;
  }
  render();

  view.addEventListener('change', (e) => {
    if (e.target.id === 'np') {
      p = prop(e.target.value) || null;
      if (p) type = inspectionsFor(p.id).some((i) => i.type === 'ingoing') ? 'routine' : 'ingoing';
      render();
    }
  });
  view.addEventListener('click', (e) => {
    const t = e.target.closest('.type-opt');
    if (t) { type = t.dataset.t; const keep = $('#ni').value; render(); $('#ni').value = keep; return; }
    if (e.target.closest('#go') && p) {
      state.inspector = $('#ni').value.trim() || state.inspector;
      const ingoing = inspectionsFor(p.id).find((i) => i.type === 'ingoing');
      const ins = {
        id: uid('i'), propertyId: p.id, type, date: todayIso(), createdAt: new Date().toISOString(),
        inspector: state.inspector, status: 'recording', items: [], tenantPresent: $('#nt').checked,
        linkedId: type === 'outgoing' && ingoing ? ingoing.id : null, signatures: {},
      };
      state.inspections.push(ins);
      if (plan && plan.propertyId === p.id) plan.inspectionId = ins.id;
      save();
      go(`#/record/${ins.id}`);
    }
  });
}

// ============================================================ RECORD
function viewRecord(view, id) {
  const ins = insp(id);
  const p = ins && prop(ins.propertyId);
  if (!ins || !p) { go('#/'); return; }
  if (ins.status !== 'recording') { go(`#/review/${ins.id}`); return; }

  document.body.classList.add('is-recording');
  view.classList.add('view--flush');
  if (!ins.startedAt) { ins.startedAt = new Date().toISOString(); save(); }
  const rooms = roomsFor(p);
  const S = {
    room: rooms[0].name, done: new Set(), last: null, lastAt: 0, actions: [],
    started: performance.now(), pausedFor: 0, pausedAt: 0, paused: false,
    stream: null, recorder: null, rec: null, mic: false, finishing: false,
  };
  const elapsed = () => ((S.paused ? S.pausedAt : performance.now()) - S.started - S.pausedFor) / 1000;

  view.innerHTML = `
  <div class="rec" id="rec">
    <video class="rec-video" id="cam" playsinline muted></video>
    <div class="rec-sim" id="sim" hidden></div>
    <div class="rec-shade"></div>
    <div class="rec-frame"><span></span><span></span><span></span><span></span></div>
    <div class="rec-flash" id="flash"></div>

    <div class="rec-top">
      <span class="rec-live"><i></i><span id="clock">0:00</span></span>
      <button class="rec-room" id="roombtn" aria-haspopup="true"><span id="roomname"></span>${icon.chevron}</button>
      <span class="spacer"></span>
      <button class="rec-icon" id="mic" title="Voice commands">${icon.mic}</button>
      <button class="rec-icon" id="quit" title="Discard inspection">${icon.close}</button>
    </div>
    <div class="room-menu" id="roommenu" role="menu"></div>

    <div class="rec-mid">
      <div class="rec-check" id="check" aria-label="Room checklist"></div>
      <div class="rec-log" id="log" aria-live="polite"></div>
      <div class="caption is-empty" id="caption">Say the room, the item and its condition</div>
      <form class="typebar" id="typebar"><input id="typed" placeholder="Type what you would say, e.g. tap is dripping defect" autocomplete="off" aria-label="Type a command"><button class="btn btn--sm">Add</button></form>
    </div>

    <div class="rec-bottom">
      <div class="rec-controls">
        <div class="rec-side"><button class="cond-btn cond-btn--good" id="good">Good</button></div>
        <button class="shutter" id="shutter" aria-label="Take photo. Hold to mark as defect"><svg class="ring" viewBox="0 0 96 96"><circle cx="48" cy="48" r="46"/></svg></button>
        <div class="rec-side rec-side--r"><button class="cond-btn cond-btn--defect" id="defect">Defect</button></div>
      </div>
      <div class="rec-hint">Tap for a photo. Hold for a defect photo.</div>
      <div class="rec-actions">
        <button class="btn" id="pause">${icon.pause}<span>Pause</span></button>
        <button class="btn btn--primary" id="finish">${icon.check}Finish inspection</button>
      </div>
    </div>
  </div>`;

  const rec = $('#rec');
  const cam = $('#cam');

  // ----- camera
  (async () => {
    const { stream, reason } = await openCamera(cam);
    S.stream = stream;
    if (stream) {
      S.recorder = startRecording(stream);
    } else {
      $('#sim').hidden = false;
      $('#sim').style.backgroundImage = `url("${demoArt('item', 3)}")`;
      cam.hidden = true;
      logLine(reason === 'blocked' ? 'Camera blocked. Using demo mode.' : 'No camera found. Using demo mode.', 'note');
    }
  })();
  onCleanup(() => { stopStream(S.stream); S.rec?.stop(); });

  // ----- voice
  if (speechSupported()) {
    S.rec = createRecognizer({
      onPhrase: (text) => { setCaption(text, false); handle(text); },
      onInterim: (text) => { if (text) setCaption(text, false); },
      onState: (st) => {
        if (st === 'blocked') { S.mic = false; paintMic(); toast('Microphone blocked. Tap and type still work.'); }
      },
    });
    S.mic = true;
    S.rec.start();
  } else {
    rec.classList.add('no-speech');
    setCaption('Voice commands need Chrome, Edge or Safari. Tap or type instead.', true);
  }
  paintMic();
  function paintMic() {
    const b = $('#mic');
    b.innerHTML = S.mic ? icon.mic : icon.micOff;
    b.classList.toggle('is-on', S.mic);
    b.classList.toggle('is-off', !S.mic);
    b.title = S.mic ? 'Voice commands on' : 'Voice commands off';
  }

  // ----- clock
  const tick = setInterval(() => { $('#clock').textContent = fmtClock(elapsed()); }, 250);
  onCleanup(() => clearInterval(tick));

  function setCaption(text, empty) {
    const c = $('#caption');
    c.textContent = text;
    c.classList.toggle('is-empty', empty);
  }
  function logLine(text, c = 'note') {
    const log = $('#log');
    const el = document.createElement('div');
    el.className = 'log-line';
    el.dataset.c = c;
    el.innerHTML = `<span class="dot"></span><span class="t">${fmtClock(elapsed())}</span><span>${esc(text)}</span>`;
    log.append(el);
    while (log.children.length > 7) log.firstElementChild.remove();
  }
  function paintRoom() {
    $('#roomname').textContent = S.room;
    const counts = {};
    ins.items.forEach((it) => { const k = normRoom(it.room); counts[k] = (counts[k] || 0) + 1; });
    $('#check').innerHTML = rooms.map((r) => {
      const k = normRoom(r.name);
      const active = normRoom(S.room) === k;
      return `<div class="row ${active ? 'is-active' : S.done.has(k) ? 'is-done' : ''}"><span>${S.done.has(k) && !active ? '✓ ' : ''}${esc(r.name)}</span><b>${counts[k] || ''}</b></div>`;
    }).join('');
    $('#roommenu').innerHTML = rooms.map((r) => `<button role="menuitem" data-room="${esc(r.name)}" class="${normRoom(r.name) === normRoom(S.room) ? 'is-active' : ''}"><span>${esc(r.name)}</span><span class="muted">${counts[normRoom(r.name)] || ''}</span></button>`).join('');
  }
  paintRoom();
  logLine(`Recording started in ${S.room}`, 'room');
  sound.long();

  const persist = () => save();

  // ----- actions
  function setRoom(name, spoken = true) {
    const match = matchRoom(p, name);
    const next = match ? match.name : name;
    if (normRoom(next) === normRoom(S.room)) return;
    S.actions.push({ type: 'room', prev: S.room });
    S.done.add(normRoom(S.room));
    S.room = next;
    S.last = null;
    paintRoom();
    logLine(next + (match ? '' : ' (not on plan)'), 'room');
    if (spoken) sound.beep();
  }
  function nextRoom() {
    const idx = rooms.findIndex((r) => normRoom(r.name) === normRoom(S.room));
    const nxt = rooms[(idx + 1) % rooms.length];
    setRoom(nxt.name, false);
    sound.beep();
  }
  function addItem({ name, text = '', condition = 'unrated', kind = 'item', qty = 1, confidence = 0.9 }) {
    const rn = S.room.toLowerCase();
    if (name.toLowerCase().startsWith(`${rn} `)) { const rest = name.slice(rn.length + 1); name = rest.charAt(0).toUpperCase() + rest.slice(1); }
    const inRoom = ins.items.filter((i) => normRoom(i.room) === normRoom(S.room)).length;
    const spot = autoSpot(inRoom);
    const meter = KEYS_AND_METERS.has(name);
    const said = kind === 'item' || kind === 'inventory' ? analyse(text, name) : {};
    const it = {
      id: uid('f'), room: S.room, name, text, condition: meter && condition === 'unrated' ? 'good' : condition,
      kind: meter ? 'meter' : kind, qty, t: +elapsed().toFixed(1),
      x: spot.x, y: spot.y, confidence, decision: 'pending', art: artFor(`${name} ${text}`),
      clean: said.clean || null, damage: said.damage || null, func: said.func || null, action: said.action || null,
    };
    ins.items.push(it);
    S.last = it; S.lastAt = performance.now();
    S.actions.push({ type: 'add', id: it.id });
    const label = kind === 'inventory' ? `${qty} × ${name}` : name;
    logLine(`${label}, ${COND_LABEL[kind === 'note' ? 'note' : condition].toLowerCase()}`, kind === 'note' ? 'note' : condition);
    paintRoom();
    persist();
    return it;
  }
  const recent = () => (S.last && performance.now() - S.lastAt < 12000 ? S.last : null);
  function rate(cond) {
    const it = recent() || S.last;
    if (!it) { addItem({ name: 'Item', condition: cond, confidence: 0.7 }); return; }
    S.actions.push({ type: 'cond', id: it.id, prev: it.condition });
    setCondition(it, cond); it.confidence = Math.max(it.confidence, 0.92);
    logLine(`${it.name}, ${COND_LABEL[cond].toLowerCase()}`, cond);
    persist();
  }
  async function photo({ defect = false, closeup = false } = {}) {
    let target = recent();
    if (!target || target.photoId || target.shot) {
      target = addItem({ name: closeup ? 'Close-up' : defect ? 'Defect' : 'Photo', condition: defect ? 'defect' : closeup ? 'good' : 'unrated', kind: closeup ? 'note' : 'item', confidence: 0.5 });
    } else if (defect && target.condition !== 'defect') {
      S.actions.push({ type: 'cond', id: target.id, prev: target.condition });
      target.condition = 'defect';
    }
    target.shot = true;
    const flash = $('#flash');
    flash.className = 'rec-flash';
    void flash.offsetWidth;
    flash.classList.add(defect ? 'go-defect' : 'go');
    sound.shutter();
    buzz(defect ? [30, 60, 30] : 20);
    rec.classList.add('is-hold');
    await steady(350);
    rec.classList.remove('is-hold');
    if (S.stream) {
      const blob = await captureStill(cam);
      if (blob) { const mid = uid('m'); await putMedia(mid, blob); target.photoId = mid; }
    }
    logLine(`Photo: ${target.name}`, target.condition);
    persist();
  }
  function undo() {
    const a = S.actions.pop();
    if (!a) { toast('Nothing to undo'); return; }
    if (a.type === 'add') { ins.items = ins.items.filter((i) => i.id !== a.id); S.last = null; }
    if (a.type === 'cond') { const it = ins.items.find((i) => i.id === a.id); if (it) it.condition = a.prev; }
    if (a.type === 'room') { S.room = a.prev; }
    paintRoom(); persist(); sound.low(); logLine('Undone', 'note');
  }
  function togglePause() {
    if (S.paused) { S.pausedFor += performance.now() - S.pausedAt; S.paused = false; S.recorder?.resume(); }
    else { S.pausedAt = performance.now(); S.paused = true; S.recorder?.pause(); }
    rec.classList.toggle('is-paused', S.paused);
    $('#pause').innerHTML = S.paused ? `${icon.play}<span>Resume</span>` : `${icon.pause}<span>Pause</span>`;
    sound.long();
  }
  async function finish() {
    if (S.finishing) return;
    S.finishing = true;
    $('#finish').disabled = true;
    S.rec?.stop();
    const dur = elapsed();
    const blob = S.recorder ? await S.recorder.stop() : null;
    if (blob) { const vid = uid('v'); try { await putMedia(vid, blob); ins.videoId = vid; } catch { toast('The walk video was too large to keep'); } }
    ins.items.forEach((it) => { delete it.shot; });
    ins.durationSec = Math.round(dur);
    ins.status = 'processing';
    persist();
    sound.long();
    go(`#/process/${ins.id}`);
  }

  function handle(text) {
    for (const ev of parsePhrase(text)) {
      if (S.paused && ev.cmd !== 'resume') continue;
      switch (ev.cmd) {
        case 'room': setRoom(ev.room); break;
        case 'item': addItem(ev); sound.beep(); break;
        case 'mark': rate(ev.condition); ev.condition === 'defect' ? sound.double() : sound.beep(); break;
        case 'inventory': addItem({ ...ev, kind: 'inventory' }); sound.beep(); break;
        case 'note': addItem({ name: 'Note', text: ev.text, kind: 'note', condition: 'good', confidence: 1 }); sound.beep(); break;
        case 'photo': photo({ defect: S.last?.condition === 'defect' && ev.auto }); break;
        case 'closeup': photo({ closeup: true }); break;
        case 'undo': undo(); break;
        case 'pause': if (!S.paused) togglePause(); break;
        case 'resume': if (S.paused) togglePause(); break;
        case 'finish': finish(); break;
        default: break;
      }
    }
  }

  // ----- controls
  const shutter = $('#shutter');
  let holdTimer = null; let held = false;
  shutter.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    held = false;
    shutter.classList.add('is-holding');
    holdTimer = setTimeout(() => { held = true; shutter.classList.remove('is-holding'); photo({ defect: true }); }, 450);
  });
  const release = () => {
    if (!holdTimer) return;
    clearTimeout(holdTimer); holdTimer = null;
    shutter.classList.remove('is-holding');
    if (!held) photo();
  };
  shutter.addEventListener('pointerup', release);
  shutter.addEventListener('pointerleave', () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; shutter.classList.remove('is-holding'); } });
  shutter.addEventListener('contextmenu', (e) => e.preventDefault());

  $('#good').addEventListener('click', () => { rate('good'); sound.beep(); });
  $('#defect').addEventListener('click', () => { rate('defect'); sound.double(); photo({ defect: true }); });
  $('#pause').addEventListener('click', togglePause);
  $('#finish').addEventListener('click', finish);
  $('#mic').addEventListener('click', () => {
    if (!S.rec) { toast('Voice commands are not supported in this browser'); return; }
    S.mic = !S.mic; S.mic ? S.rec.start() : S.rec.stop(); paintMic();
  });
  $('#roombtn').addEventListener('click', (e) => { e.stopPropagation(); $('#roommenu').classList.toggle('is-open'); });
  $('#roommenu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-room]');
    if (b) { setRoom(b.dataset.room, false); sound.beep(); $('#roommenu').classList.remove('is-open'); }
  });
  rec.addEventListener('click', (e) => { if (!e.target.closest('#roommenu, #roombtn')) $('#roommenu').classList.remove('is-open'); });
  $('#typebar').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#typed').value.trim();
    if (!v) return;
    setCaption(v, false); handle(v); $('#typed').value = '';
  });
  $('#quit').addEventListener('click', () => {
    openSheet(`<div class="stack"><h2 class="h3">Discard this inspection?</h2><p class="muted">The recording and ${ins.items.length} findings will be deleted.</p><div style="display:flex;gap:10px"><button class="btn btn--danger" id="discard">Discard</button><button class="btn" data-close>Keep recording</button></div></div>`, {
      onOpen: (sh) => $('#discard', sh).addEventListener('click', () => {
        state.inspections = state.inspections.filter((i) => i.id !== ins.id); save(); closeSheet(true); go(`#/property/${p.id}`);
      }),
    });
  });
  const onKey = (e) => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.code === 'Space') { e.preventDefault(); photo(); }
    else if (e.key === 'd' || e.key === 'D') { rate('defect'); sound.double(); photo({ defect: true }); }
    else if (e.key === 'g' || e.key === 'G') { rate('good'); sound.beep(); }
    else if (e.key === 'r' || e.key === 'R') nextRoom();
    else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) undo();
  };
  document.addEventListener('keydown', onKey);
  onCleanup(() => document.removeEventListener('keydown', onKey));
}

// ============================================================ PROCESS
function viewProcess(view, id) {
  const ins = insp(id);
  if (!ins) { go('#/'); return; }
  const p = prop(ins.propertyId);
  const items = ins.items || [];
  const photos = items.filter((i) => i.photoId || i.art).length;
  const roomsUsed = new Set(items.map((i) => normRoom(i.room))).size;
  const flagged = items.filter(isFlagged).length;
  view.innerHTML = `
  <div class="proc"><div class="proc-inner">
    <div>
      <h1 class="display h2">Drafting the report</h1>
      <p class="muted" style="margin-top:8px">${esc(p.name)}, ${fmtDuration(ins.durationSec)} walk</p>
    </div>
    <div class="steps">
      ${[
        ['Reading what you said', `${items.length} findings`],
        ['Sorting findings into rooms', `${roomsUsed} rooms`],
        ['Matching photos to findings', `${photos} photos`],
        ['Writing the draft report', `${flagged} to review`],
      ].map(([t, r], i) => `<div class="step" data-i="${i}"><span class="n">${i + 1}</span><span>${t}</span><span class="r"></span><template>${r}</template></div>`).join('')}
    </div>
    <button class="btn btn--primary" id="next" disabled>Review findings</button>
  </div></div>`;
  const steps = $$('.step', view);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const delay = reduce ? 60 : 650;
  let i = 0;
  const run = () => {
    if (i > 0) { const prev = steps[i - 1]; prev.classList.remove('is-run'); prev.classList.add('is-done'); $('.n', prev).textContent = '✓'; $('.r', prev).textContent = $('template', prev).innerHTML; }
    if (i < steps.length) { steps[i].classList.add('is-run'); i += 1; t = setTimeout(run, delay); return; }
    finalize(ins);
    ins.status = 'review'; save();
    $('#next').disabled = false;
    t = setTimeout(() => go(`#/review/${ins.id}`), reduce ? 0 : 900);
  };
  let t = setTimeout(run, 200);
  onCleanup(() => clearTimeout(t));
  $('#next').addEventListener('click', () => go(`#/review/${ins.id}`));
}

// ============================================================ RATINGS (SA three-part ratings)
const R_OF = (it, ins) => ratingsFor(it, ins?.type);
const payerOf = (it, ins) => ((R_OF(it, ins).action || '').startsWith('Tenant') ? 'tenant' : 'owner');
const RANK = { unrated: 0, good: 1, fair: 2, defect: 3, missing: 4 };
const BAD = new Set(['Dirty', 'Stained', 'Rusted', 'Damaged', 'Cracked', 'Faulty', 'Missing']);
const MEH = new Set(['Dusty', 'Wear & Tear', 'Unable to test']);
const ratingClass = (v) => (BAD.has(v) ? 'bad' : MEH.has(v) ? 'meh' : 'ok');

function setCondition(it, c) {
  const testable = isTestable(`${it.name} ${it.text || ''}`);
  it.condition = c;
  if (c === 'good') { it.clean = 'Clean'; it.damage = 'Undamaged'; it.func = testable ? 'Working' : null; }
  if (c === 'fair') { it.damage = 'Wear & Tear'; if (testable && (!it.func || it.func === 'Faulty')) it.func = 'Working'; }
  if (c === 'defect' && !['Damaged', 'Cracked'].includes(it.damage)) it.damage = it.func === 'Faulty' ? 'Undamaged' : 'Damaged';
  if (c === 'missing') { it.damage = 'Missing'; it.func = null; }
  it.confidence = 1;
}
function setRating(it, ins, key, value) {
  it[key] = value || null;
  if (key !== 'action') it.condition = conditionFrom({ ...R_OF(it, ins), [key]: value || null });
  it.confidence = 1;
}

/** Merges repeated mentions of one item and adds the standard checklist for each room visited. */
function finalize(ins) {
  if (ins.finalized) return;
  const byKey = new Map();
  const merged = [];
  for (const it of ins.items) {
    if (it.kind === 'item' && !it.std && !/^(photo|defect|item|close-up)$/i.test(it.name)) {
      const key = `${normRoom(it.room)}|${it.name.toLowerCase()}`;
      const first = byKey.get(key);
      if (first) {
        if (RANK[it.condition] > RANK[first.condition]) first.condition = it.condition;
        if (it.text && !(first.text || '').includes(it.text)) first.text = first.text ? `${first.text}. ${it.text}` : it.text;
        ['clean', 'damage', 'func', 'action'].forEach((k) => { if (it[k] && !first[k]) first[k] = it[k]; });
        first.photos = [...(first.photos || []), ...(it.photoId ? [it.photoId] : []), ...(it.photos || [])];
        if (!first.photoId && first.photos.length) first.photoId = first.photos.shift();
        first.confidence = Math.min(first.confidence ?? 1, it.confidence ?? 1);
        continue;
      }
      byKey.set(key, it);
    }
    merged.push(it);
  }
  const rooms = [];
  merged.forEach((it) => { if (it.kind !== 'meter' && !rooms.some((r) => normRoom(r) === normRoom(it.room))) rooms.push(it.room); });
  rooms.forEach((room) => {
    standardItems(room).forEach((name) => {
      if (KEYS_AND_METERS.has(name)) return;
      if (merged.some((i) => normRoom(i.room) === normRoom(room) && i.name.toLowerCase() === name.toLowerCase())) return;
      merged.push({ id: uid('f'), room, name, kind: 'item', qty: 1, condition: 'unrated', text: '', t: null, x: null, y: null, confidence: 1, decision: 'pending', std: true });
    });
  });
  ins.items = merged;
  ins.finalized = true;
}

/** Sorts a room's items in checklist order, with extra items after. */
function checklistOrder(room) {
  const order = standardItems(room);
  return (a, b) => {
    const ia = order.indexOf(a.name); const ib = order.indexOf(b.name);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || (a.t ?? 9999) - (b.t ?? 9999);
  };
}
const photosOf = (it) => [it.photoId, ...(it.photos || [])].filter(Boolean);

/** "07-09-2026 09:12:44" from the inspection start time plus seconds into the walk. */
function stampOf(ins, t) {
  if (t == null) return '';
  const base = ins.startedAt ? new Date(ins.startedAt) : new Date(`${ins.date}T09:00:00`);
  const d = new Date(base.getTime() + t * 1000);
  const p2 = (n) => String(n).padStart(2, '0');
  return `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}
function timeOf(ins) {
  const d = ins.startedAt ? new Date(ins.startedAt) : new Date(`${ins.date}T09:00:00`);
  return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ============================================================ REVIEW
function flagReason(it) {
  if (it.kind === 'note' || it.kind === 'meter' || it.std) return '';
  if (it.condition === 'unrated') return 'No condition heard';
  if (/^(photo|defect|item)$/i.test(it.name)) return 'Give this a name';
  if (it.condition === 'defect' || it.condition === 'missing') return 'Confirm the defect and who is responsible';
  if ((it.confidence ?? 1) < 0.8) return 'Check this was heard right';
  return '';
}
const isFlagged = (it) => Boolean(flagReason(it)) && it.decision !== 'accepted';

function ratingSelects(it, ins) {
  const r = R_OF(it, ins);
  const sel = (key, label, opts, val) => `<label class="rsel"><span>${label}</span><select class="select" data-r="${key}"><option value="">—</option>${opts.map((o) => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;
  return `<div class="rsels">
    ${sel('clean', 'Cleanliness', CLEAN, r.clean)}
    ${sel('damage', 'Damage', DAMAGE, r.damage)}
    ${sel('func', 'Function', FUNC, r.func)}
    ${sel('action', 'Recommendation', ACTIONS, r.action)}
  </div>`;
}

function viewReview(view, id) {
  const ins = insp(id);
  const p = ins && prop(ins.propertyId);
  if (!ins || !p) { go('#/'); return; }
  finalize(ins); save();
  let show = ins.items.some(isFlagged) ? 'flagged' : 'all';
  let selected = null;
  const outgoing = ins.type === 'outgoing';
  const spoken = () => ins.items.filter((i) => !i.std);

  view.innerHTML = `
  <div class="prop-head">
    <div class="crumbs"><a href="#/property/${p.id}">${esc(p.name)}</a><span>/</span><span>Review</span></div>
    <div class="portfolio-head">
      <div><h1 class="display h1">Review findings</h1><p class="lede" id="lede"></p></div>
      <a class="btn btn--primary" href="#/sign/${ins.id}" id="tosign">Continue to sign-off</a>
    </div>
  </div>
  <div class="review-grid">
    <section class="plan-panel vf"><span class="vf-b"></span>
      <div class="plan-bar"><span class="h3">${esc(p.name)}</span><span class="muted small">Drag a pin to move it</span></div>
      <div class="plan-scroll" id="plan"></div>
    </section>
    <section class="stack">
      <div id="checklist"></div>
      <div class="filterbar">
        <div class="seg" role="group" aria-label="Show">
          <button type="button" data-show="flagged">Needs review <span class="data" id="nf"></span></button>
          <button type="button" data-show="all">All recorded <span class="data" id="na"></span></button>
        </div>
        <button class="btn btn--sm" id="acceptall">${icon.check}Accept all shown</button>
      </div>
      <div class="ritems" id="ritems"></div>
    </section>
  </div>`;

  function renderPlan() {
    $('#plan').innerHTML = planSVG(p, spoken(), { selectedId: selected, id: 'rev' });
  }
  function renderChecklist() {
    const groups = new Map();
    ins.items.filter((i) => i.std && i.condition === 'unrated').forEach((i) => {
      if (!groups.has(i.room)) groups.set(i.room, []);
      groups.get(i.room).push(i);
    });
    $('#checklist').innerHTML = groups.size ? `<div class="panel checklist">
      <div><h2 class="h3">Checklist items you did not mention</h2><p class="small muted" style="margin:4px 0 0">South African reports list every standard item per room. Confirm the ones you saw were in order, or leave them out of the report.</p></div>
      ${[...groups.entries()].map(([room, list]) => `<div class="cl-room" data-room="${esc(room)}">
        <div class="cl-head"><b>${esc(room)}</b><span class="muted small">${list.length} items</span></div>
        <div class="cl-names small muted">${list.map((i) => esc(i.name)).join(', ')}</div>
        <div class="acts"><button class="btn btn--sm btn--primary" data-cl="ok">${icon.check}All in order</button><button class="btn btn--sm" data-cl="drop">Leave out</button></div>
      </div>`).join('')}
    </div>` : '';
  }
  function renderList() {
    const flagged = ins.items.filter(isFlagged);
    const all = spoken();
    $('#nf').textContent = flagged.length;
    $('#na').textContent = all.length;
    const pendingStd = ins.items.filter((i) => i.std && i.condition === 'unrated').length;
    $('#lede').textContent = flagged.length
      ? `${flagged.length} of ${all.length} recorded findings need a decision${pendingStd ? `, plus ${pendingStd} checklist items` : ''}.`
      : pendingStd ? `Recorded findings are ready. ${pendingStd} checklist items are still open.` : `All ${ins.items.length} items are ready to sign.`;
    $$('[data-show]', view).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.show === show)));
    const list = show === 'flagged' ? flagged : all;
    $('#ritems').innerHTML = list.length ? list.map((it) => {
      const why = flagReason(it);
      const n = photosOf(it).length;
      return `<article class="ritem ${isFlagged(it) ? 'is-flagged' : ''} ${it.decision === 'accepted' ? 'is-accepted' : ''} ${selected === it.id ? 'is-selected' : ''}" data-id="${it.id}">
        <div>${n || it.art ? imgTag(it, 'thumb') : '<div class="thumb thumb--none">No photo</div>'}${n > 1 ? `<div class="tiny muted" style="margin-top:4px">${n} photos</div>` : ''}</div>
        <div class="body">
          <div class="top"><input class="name" value="${esc(it.name)}" aria-label="Item name" data-f="name"><span class="faint tiny data">${fmtClock(it.t)}</span></div>
          <div class="muted small">${esc(it.room)}${it.text ? `: “${esc(it.text)}”` : ''}</div>
          ${it.kind === 'note' || it.kind === 'meter' ? '' : `<div class="row"><div class="seg" role="group" aria-label="Condition">${['good', 'fair', 'defect', 'missing'].map((c) => `<button type="button" data-c="${c}" aria-pressed="${it.condition === c}">${COND_LABEL[c]}</button>`).join('')}</div>
            ${it.kind === 'inventory' ? `<label class="small muted">Qty <input class="input cost" type="number" min="0" value="${it.qty}" data-f="qty" style="width:70px"></label>` : ''}</div>
          ${ratingSelects(it, ins)}`}
          ${outgoing && payerOf(it, ins) === 'tenant' && (it.condition === 'defect' || it.condition === 'missing' || it.condition === 'fair') ? `<div class="row"><label class="small muted">Deposit deduction R <input class="input cost" type="number" min="0" step="10" value="${esc(it.cost || '')}" placeholder="Amount" data-f="cost"></label></div>` : ''}
          <div class="row" style="justify-content:space-between">${why && it.decision !== 'accepted' ? `<span class="why">${why}</span>` : '<span></span>'}
            ${it.decision === 'accepted' ? '<span class="badge badge--good">Accepted</span>' : `<button class="btn btn--sm" data-accept>${icon.check}Accept</button>`}</div>
        </div>
      </article>`;
    }).join('') : `<div class="empty">Nothing needs a decision.<a class="btn btn--primary" href="#/sign/${ins.id}">Continue to sign-off</a></div>`;
    hydrateImages($('#ritems'));
  }
  const renderAll = () => { renderPlan(); renderChecklist(); renderList(); };
  renderAll();

  view.addEventListener('click', (e) => {
    const cl = e.target.closest('[data-cl]');
    if (cl) {
      const room = cl.closest('[data-room]').dataset.room;
      const list = ins.items.filter((i) => i.std && i.condition === 'unrated' && i.room === room);
      if (cl.dataset.cl === 'ok') list.forEach((i) => { setCondition(i, 'good'); i.decision = 'accepted'; });
      else ins.items = ins.items.filter((i) => !list.includes(i));
      save(); renderChecklist(); renderList();
      toast(cl.dataset.cl === 'ok' ? `${room}: ${list.length} items marked in order` : `${room}: ${list.length} items left out`);
      return;
    }
    const show2 = e.target.closest('[data-show]');
    if (show2) { show = show2.dataset.show; renderList(); return; }
    if (e.target.closest('#acceptall')) {
      const list = show === 'flagged' ? ins.items.filter(isFlagged) : spoken();
      list.forEach((it) => { it.decision = 'accepted'; if (it.condition === 'unrated') setCondition(it, 'good'); });
      save(); renderList(); toast(`${list.length} findings accepted`); return;
    }
    const row = e.target.closest('.ritem');
    if (!row) return;
    const it = ins.items.find((x) => x.id === row.dataset.id);
    const c = e.target.closest('[data-c]');
    if (c) { setCondition(it, c.dataset.c); save(); renderPlan(); renderList(); return; }
    if (e.target.closest('[data-accept]')) { if (it.condition === 'unrated') { toast('Choose a condition first'); return; } it.decision = 'accepted'; save(); renderList(); return; }
    if (!e.target.closest('input, select')) { selected = selected === it.id ? null : it.id; renderPlan(); $$('.ritem', view).forEach((r) => r.classList.toggle('is-selected', r.dataset.id === selected)); }
  });
  view.addEventListener('change', (e) => {
    const row = e.target.closest('.ritem');
    if (!row) return;
    const it = ins.items.find((x) => x.id === row.dataset.id);
    const f = e.target.dataset.f;
    const r = e.target.dataset.r;
    if (r) { setRating(it, ins, r, e.target.value); save(); renderPlan(); renderList(); return; }
    if (f === 'name') it.name = e.target.value.trim() || it.name;
    if (f === 'qty') it.qty = Math.max(0, Number(e.target.value) || 0);
    if (f === 'cost') it.cost = e.target.value;
    save();
    if (f === 'name') renderList();
  });

  // ----- drag pins
  let drag = null;
  $('#plan').addEventListener('pointerdown', (e) => {
    const pin = e.target.closest('.pin');
    if (!pin) return;
    const svg = $('#plan svg');
    drag = { id: pin.dataset.id, pin, svg, start: eventToPlan(svg, e), moved: false };
    pin.setPointerCapture(e.pointerId);
    svg.classList.add('is-dragging');
  });
  $('#plan').addEventListener('pointermove', (e) => {
    if (!drag) return;
    const pt = eventToPlan(drag.svg, e);
    const dx = pt.x - drag.start.x; const dy = pt.y - drag.start.y;
    if (Math.hypot(dx, dy) > 0.8) drag.moved = true;
    drag.pin.setAttribute('transform', `translate(${dx} ${dy})`);
    drag.last = pt;
  });
  $('#plan').addEventListener('pointerup', () => {
    if (!drag) return;
    const it = ins.items.find((x) => x.id === drag.id);
    if (drag.moved && drag.last) {
      const room = roomAt(p, drag.last.x, drag.last.y);
      if (room) { Object.assign(it, toRoomXY(room, drag.last.x, drag.last.y)); if (normRoom(room.name) !== normRoom(it.room)) { it.room = room.name; toast(`Moved to ${room.name}`); } save(); }
      selected = it.id;
    } else {
      selected = selected === it.id ? null : it.id;
      if (!$(`.ritem[data-id="${it.id}"]`, view) && selected) { show = 'all'; renderList(); }
      setTimeout(() => $(`.ritem[data-id="${it.id}"]`, view)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30);
    }
    drag = null;
    renderPlan(); renderList();
  });
}

// ============================================================ SIGN
function viewSign(view, id) {
  const ins = insp(id);
  const p = ins && prop(ins.propertyId);
  if (!ins || !p) { go('#/'); return; }
  finalize(ins);
  const defects = ins.items.filter((i) => i.condition === 'defect' || i.condition === 'missing');
  const pending = ins.items.filter(isFlagged).length;
  const open = ins.items.filter((i) => i.std && i.condition === 'unrated').length;
  view.innerHTML = `
  <div class="sign">
    <div>
      <div class="crumbs"><a href="#/review/${ins.id}">Review</a><span>/</span><span>Sign-off</span></div>
      <h1 class="display h1" style="margin-top:8px">Sign-off</h1>
      <p class="muted" style="margin-top:8px">${TYPE_LABEL[ins.type]} inspection of ${esc(p.name)}: ${ins.items.length} items, ${defects.length} needing repair or replacement.${pending ? ` ${pending} still marked for review will be included as recorded.` : ''}${open ? ` ${open} checklist items will show as “Not inspected”.` : ''}</p>
    </div>
    <div class="row2">
      <div class="field"><label for="ct">Tenant comments</label><textarea class="input" id="ct" rows="3" placeholder="Anything the tenant wants on record">${esc(ins.comments?.tenant || '')}</textarea></div>
      <div class="field"><label for="ca">Agent or owner comments</label><textarea class="input" id="ca" rows="3" placeholder="General remarks about the property">${esc(ins.comments?.agent || '')}</textarea></div>
    </div>
    <div class="pads">
      <div class="pad" data-who="tenant">
        <div class="padbar"><input class="input" value="${esc(p.tenant || '')}" aria-label="Tenant name" style="min-height:38px;max-width:70%"><button class="btn btn--ghost btn--sm" data-clear>Clear</button></div>
        <canvas aria-label="Tenant signature"></canvas>
        <span class="tiny muted">Tenant signs here</span>
      </div>
      <div class="pad" data-who="owner">
        <div class="padbar"><input class="input" value="${esc(ins.inspector || '')}" aria-label="Agent or owner name" style="min-height:38px;max-width:70%"><button class="btn btn--ghost btn--sm" data-clear>Clear</button></div>
        <canvas aria-label="Agent or owner signature"></canvas>
        <span class="tiny muted">Agent or owner signs here</span>
      </div>
    </div>
    <label class="toggle"><input type="checkbox" id="absent" ${ins.tenantPresent === false ? 'checked' : ''}><span>Tenant not present. Send the report for them to sign.</span></label>
    ${defects.length ? `<label class="toggle"><input type="checkbox" id="jobs" checked><span>Send ${defects.length} repair${defects.length > 1 ? 's' : ''} to the owner for approval</span></label>` : ''}
    <button class="btn btn--primary btn--block" id="done">${icon.check}Sign and finish report</button>
  </div>`;

  const pads = $$('.pad', view).map((el) => {
    const canvas = $('canvas', el);
    const ratio = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width * ratio; canvas.height = r.height * ratio;
    const c = canvas.getContext('2d');
    c.scale(ratio, ratio); c.lineWidth = 2.4; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#15212c';
    let drawing = false; let inked = false;
    const pos = (e) => { const b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    canvas.addEventListener('pointerdown', (e) => { drawing = true; canvas.setPointerCapture(e.pointerId); c.beginPath(); c.moveTo(...pos(e)); });
    canvas.addEventListener('pointermove', (e) => { if (!drawing) return; c.lineTo(...pos(e)); c.stroke(); inked = true; });
    canvas.addEventListener('pointerup', () => { drawing = false; });
    $('[data-clear]', el).addEventListener('click', () => { c.clearRect(0, 0, canvas.width, canvas.height); inked = false; });
    return { canvas, name: () => $('input', el).value.trim(), inked: () => inked };
  });

  $('#done').addEventListener('click', () => {
    const absent = $('#absent').checked;
    const [t, o] = pads;
    if (!o.inked()) { toast('The agent or owner needs to sign'); return; }
    if (!absent && !t.inked()) { toast('The tenant needs to sign, or mark them as not present'); return; }
    const now = new Date().toISOString();
    ins.comments = { tenant: $('#ct').value.trim(), agent: $('#ca').value.trim() };
    ins.signatures = {
      tenant: !absent && t.inked(), tenantName: t.name(), tenantImg: !absent && t.inked() ? t.canvas.toDataURL('image/png') : null, tenantAt: !absent ? now : null,
      owner: true, ownerName: o.name(), ownerImg: o.canvas.toDataURL('image/png'), ownerAt: now,
    };
    ins.tenantPresent = !absent;
    ins.status = 'signed';
    ins.signedAt = now;
    let made = 0;
    if ($('#jobs')?.checked) defects.forEach((it) => { if (!it.job) { it.job = { status: 'approval', created: todayIso() }; made += 1; } });
    if (ins.type !== 'outgoing') { const d = new Date(); d.setMonth(d.getMonth() + 6); p.nextDue = d.toISOString().slice(0, 10); }
    save();
    toast(made ? `Report signed. ${made} repair${made > 1 ? 's' : ''} sent to the owner.` : 'Report signed');
    go(`#/report/${ins.id}`);
  });
}

// ============================================================ REPORT
const REPORT_TITLE = { ingoing: 'Ingoing Inspection Report', outgoing: 'Outgoing Inspection Report', routine: 'Interim Inspection Report', inventory: 'Inventory Report' };

function viewReport(view, id) {
  const ins = insp(id);
  const p = ins && prop(ins.propertyId);
  if (!ins || !p) { go('#/'); return; }
  const items = ins.items || [];
  const R = (it) => R_OF(it, ins);
  const linked = ins.linkedId ? insp(ins.linkedId) : null;
  const planRooms = roomsFor(p).map((r) => r.name);
  const roomOf = (it) => { const m = matchRoom(p, it.room); return m ? m.name : it.room; };
  const inRooms = items.filter((i) => i.kind === 'item');
  const meters = items.filter((i) => i.kind === 'meter');
  const inventory = items.filter((i) => i.kind === 'inventory');
  const notes = items.filter((i) => i.kind === 'note');
  const byRoom = new Map();
  inRooms.forEach((it) => { const k = roomOf(it); if (!byRoom.has(k)) byRoom.set(k, []); byRoom.get(k).push(it); });
  const order = [...planRooms.filter((r) => byRoom.has(r)), ...[...byRoom.keys()].filter((k) => !planRooms.includes(k))];
  order.forEach((room) => byRoom.get(room).sort(checklistOrder(room)));
  const notInspected = planRooms.filter((r) => !byRoom.has(r));
  const actions = [
    ...order.flatMap((room) => byRoom.get(room).filter((it) => R(it).action).map((it) => ({ it, room }))),
    ...inventory.filter((it) => R(it).action).map((it) => ({ it, room: roomOf(it) })),
  ];
  const defects = items.filter((i) => i.condition === 'defect' || i.condition === 'missing');
  const photoCount = items.reduce((n, i) => n + photosOf(i).length + (i.art && !i.photoId && !i.std ? 1 : 0), 0);
  const deductions = ins.type === 'outgoing' ? items.filter((i) => payerOf(i, ins) === 'tenant' && R(i).action) : [];
  const costOf = (i) => Number(i.cost) || i.job?.chosen?.price || 0;
  const total = deductions.reduce((s, i) => s + costOf(i), 0);
  const sig = ins.signatures || {};
  const ref = `INS-${ins.id.replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase()}`;
  const prevOf = (it) => linked?.items.find((x) => normRoom(x.room) === normRoom(it.room) && x.name.toLowerCase() === it.name.toLowerCase());
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const chips = (r) => [r.clean, r.damage, r.func].filter(Boolean).map((v) => `<span class="rp-chip rp-chip--${ratingClass(v)}">${esc(v)}</span>`).join('');
  const actPill = (a) => (a ? `<span class="rp-act rp-act--${a.startsWith('Tenant') ? 'tenant' : 'landlord'}">${esc(a)}</span>` : '');
  const dt = (iso) => (iso ? new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '');

  const photoGrid = (it) => {
    const ids = photosOf(it);
    const cells = ids.length
      ? ids.map((pid, i) => `<figure class="rp-ph"><img data-photo="${esc(pid)}" data-item="${esc(it.id)}" alt="${esc(it.name)} photo ${i + 1}"><figcaption>${stampOf(ins, it.t)}</figcaption></figure>`)
      : it.art && !it.std ? [`<figure class="rp-ph"><img src="${itemImageSync(it)}" alt="${esc(it.name)}"><figcaption>${stampOf(ins, it.t)}</figcaption></figure>`] : [];
    return cells.length ? `<div class="rp-photos">${cells.join('')}</div>` : '';
  };

  const itemRow = (it, n) => {
    const r = R(it);
    const prev = prevOf(it);
    const pr = prev ? ratingsFor(prev, linked.type) : null;
    const changed = prev && RANK[it.condition] > RANK[prev.condition];
    const notDone = it.condition === 'unrated';
    return `<tbody class="rp-item${notDone ? ' is-na' : ''}">
      <tr>
        <td class="n">${n}</td>
        <td class="nm"><b>${esc(it.name)}</b>${it.t != null ? `<div class="tc data">${fmtClock(it.t)} in walk</div>` : ''}</td>
        <td class="cd">${notDone ? '<span class="muted">Not inspected</span>' : chips(r)}${it.text ? `<div class="said">${esc(it.text)}</div>` : ''}
          ${prev ? (chips(pr) === chips(r) && !prev.text && !changed ? '<div class="prev"><span class="prev-l">Ingoing</span><span class="muted">Same</span></div>' : `<div class="prev"><span class="prev-l">Ingoing</span>${chips(pr)}${prev.text ? ` <span class="said">${esc(prev.text)}</span>` : ''}${changed ? ' <span class="rp-change">Changed</span>' : ''}</div>`) : linked && !it.std ? '<div class="prev"><span class="prev-l">Ingoing</span><span class="muted">Not recorded</span></div>' : ''}</td>
        <td class="rc">${actPill(r.action)}${it.job ? `<div class="tiny muted" style="margin-top:4px">${esc(JOB_LABEL[it.job.status] || '')}</div>` : ''}</td>
      </tr>
      ${photosOf(it).length || (it.art && !it.std) ? `<tr class="phr"><td></td><td colspan="3">${photoGrid(it)}</td></tr>` : ''}
    </tbody>`;
  };

  view.innerHTML = `
  <div class="report-wrap">
    <div class="report-actions">
      <div class="crumbs"><a href="#/property/${p.id}?i=${ins.id}">${esc(p.name)}</a><span>/</span><span>Report</span></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${ins.status !== 'signed' ? `<a class="btn" href="#/review/${ins.id}">Back to review</a>` : ''}
        <button class="btn" id="copy">${icon.share}Copy summary</button>
        <button class="btn btn--primary" id="print">${icon.print}Print or save PDF</button>
      </div>
    </div>
    <article class="paper rp">
      <section class="rp-cover">
        <div class="rp-head">
          <div class="rp-brand"><img src="assets/icon.svg" alt="">${esc(AGENCY.name || 'Inspektr')}</div>
          <div class="muted small" style="text-align:right">Report ${ref}${AGENCY.registration ? `<br>Reg. ${esc(AGENCY.registration)}` : ''}</div>
        </div>
        <h1 class="display rp-title">${REPORT_TITLE[ins.type]}</h1>
        <div class="rp-addr">${esc(p.name)}<br><span class="muted">${esc(p.suburb)}</span></div>
        <div class="rp-when">${fmtDate(ins.date, { day: 'numeric', month: 'long', year: 'numeric' })} ${timeOf(ins)}</div>
        <dl class="rp-parties">
          <div><dt>Landlord</dt><dd>${esc(p.owner || '')}</dd></div>
          <div><dt>Tenant</dt><dd>${esc(sig.tenantName || p.tenant || '')}${ins.tenantPresent === false ? ' (not present)' : ''}</dd></div>
          <div><dt>Inspector</dt><dd>${esc(ins.inspector || '')}</dd></div>
          ${linked ? `<div><dt>Compared with</dt><dd>Ingoing inspection, ${fmtDate(linked.date)}</dd></div>` : ''}
          <div><dt>Walk-through</dt><dd>${fmtDuration(ins.durationSec)}${ins.videoId ? ', video on file' : ''}</dd></div>
          <div><dt>Status</dt><dd>${ins.status === 'signed' ? `Signed ${dt(ins.signedAt)}` : 'Draft, not yet signed'}</dd></div>
        </dl>
        <div class="rp-sum">
          <div class="figure"><b>${order.length}</b><span>areas</span></div>
          <div class="figure"><b>${inRooms.length}</b><span>items inspected</span></div>
          <div class="figure figure--alert"><b>${actions.length}</b><span>recommended actions</span></div>
          <div class="figure"><b>${photoCount}</b><span>photos</span></div>
          ${ins.type === 'outgoing' ? `<div class="figure"><b>R${total.toLocaleString('en-ZA')}</b><span>deductions</span></div>` : ''}
        </div>
        <div class="rp-plan">${planSVG(p, items.filter((i) => !i.std), { id: 'rp' })}</div>
        <p class="tiny muted">Pins show where findings were recorded during the walk-through. Red marks a defect.</p>
      </section>

      <section class="rp-section rp-toc">
        <h2>Contents</h2>
        <ol class="toc">
          <li><button data-jump="disclaimer">Disclaimer & terms</button></li>
          <li><button data-jump="actions">Recommended actions</button><span>${actions.length}</span></li>
          ${linked ? '<li><button data-jump="changes">Changes since ingoing</button></li>' : ''}
          ${deductions.length ? '<li><button data-jump="deductions">Deposit deductions</button></li>' : ''}
          ${order.map((room) => { const d = byRoom.get(room).filter((i) => R(i).action).length; return `<li><button data-jump="room-${slug(room)}">${esc(room)}</button><span>${byRoom.get(room).length} items${d ? `, <b class="bad">${d} action${d > 1 ? 's' : ''}</b>` : ''}</span></li>`; }).join('')}
          <li><button data-jump="keys">Keys and meters</button></li>
          ${inventory.length ? '<li><button data-jump="inventory">Inventory</button></li>' : ''}
          <li><button data-jump="comments">Comments and signatures</button></li>
        </ol>
        ${notInspected.length ? `<p class="small muted">Not inspected: ${notInspected.map(esc).join(', ')}.</p>` : ''}
      </section>

      <section class="rp-section" id="disclaimer">
        <h2 class="rp-bar">Disclaimer & terms</h2>
        <ol class="rp-terms">${DISCLAIMER.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
      </section>

      <section class="rp-section" id="actions">
        <h2 class="rp-bar">Recommended actions summary</h2>
        ${actions.length ? `<table class="rp-table rp-acts"><thead><tr><th>#</th><th>Item</th><th class="num">Recommendation</th></tr></thead><tbody>
          ${actions.map(({ it, room }, i) => `<tr><td class="n">${i + 1}</td><td><b>${esc(room)}</b> <span class="muted">·</span> ${esc(it.name)}<div class="said">${[R(it).clean, R(it).damage, R(it).func].filter(Boolean).join(', ')}${it.text ? `, ${esc(it.text)}` : ''}</div></td><td class="num">${actPill(R(it).action)}${ins.type === 'outgoing' && costOf(it) ? `<div class="tiny muted">R${costOf(it).toLocaleString('en-ZA')}</div>` : ''}</td></tr>`).join('')}
        </tbody></table>` : '<p class="muted">No actions recommended.</p>'}
      </section>

      ${linked ? (() => {
        const changes = [...inRooms, ...inventory].filter((it) => { const pv = prevOf(it); return !it.std && (!pv || RANK[it.condition] > RANK[pv.condition] || (it.kind === 'inventory' && pv.qty !== it.qty)); });
        return `<section class="rp-section" id="changes"><h2 class="rp-bar">Changes since the ingoing inspection of ${fmtDate(linked.date)}</h2>
        ${changes.length ? `<table class="rp-table"><thead><tr><th>Item</th><th>Ingoing</th><th>Outgoing</th></tr></thead><tbody>
          ${changes.map((it) => { const pv = prevOf(it); return `<tr><td><b>${esc(roomOf(it))}</b> <span class="muted">·</span> ${esc(it.name)}${it.text ? `<div class="said">${esc(it.text)}</div>` : ''}</td><td>${pv ? chips(ratingsFor(pv, linked.type)) : '<span class="muted">Not recorded</span>'}</td><td>${chips(R(it))}${it.kind === 'inventory' && pv && pv.qty !== it.qty ? ` <span class="rp-change">${pv.qty} → ${it.qty}</span>` : ''}</td></tr>`; }).join('')}
        </tbody></table>` : '<p class="muted">No changes found. Everything matches the ingoing report.</p>'}</section>`;
      })() : ''}

      ${deductions.length ? `<section class="rp-section" id="deductions"><h2 class="rp-bar">Deposit deductions</h2>
        <p class="small muted">Items the tenant is responsible for, beyond fair wear and tear.</p>
        <table class="rp-table"><thead><tr><th>Item</th><th>Recommendation</th><th class="num">Cost</th></tr></thead><tbody>
        ${deductions.map((i) => `<tr><td><b>${esc(roomOf(i))}</b> <span class="muted">·</span> ${esc(i.name)}${i.text ? `<div class="said">${esc(i.text)}</div>` : ''}</td><td>${actPill(R(i).action)}</td><td class="num">${costOf(i) ? `R${costOf(i).toLocaleString('en-ZA')}` : '<span class="muted">To be quoted</span>'}</td></tr>`).join('')}
        <tr class="tot"><td colspan="2"><b>Total</b></td><td class="num"><b>R${total.toLocaleString('en-ZA')}</b></td></tr></tbody></table></section>` : ''}

      ${order.map((room) => `<section class="rp-section rp-room" id="room-${slug(room)}">
        <h2 class="rp-bar">${esc(room)}</h2>
        <table class="rp-items"><thead><tr><th>#</th><th>Item</th><th>Condition</th><th class="num">Recommendation</th></tr></thead>
        ${byRoom.get(room).map((it, i) => itemRow(it, i + 1)).join('')}
        </table>
      </section>`).join('')}

      <section class="rp-section" id="keys">
        <h2 class="rp-bar">Keys and meters</h2>
        <table class="rp-items"><thead><tr><th>#</th><th>Item</th><th>Details</th><th></th></tr></thead>
          ${(meters.length ? meters : [{ id: 'k1', name: 'Keys', text: '' }, { id: 'k2', name: 'Prepaid Electricity Meter', text: '' }, { id: 'k3', name: 'Water Meter', text: '' }]).map((m, i) => `<tbody class="rp-item"><tr><td class="n">${i + 1}</td><td class="nm"><b>${esc(m.name)}</b></td><td class="cd">${m.text ? esc(m.text) : '<span class="muted">Not recorded</span>'}</td><td></td></tr>${photosOf(m).length ? `<tr class="phr"><td></td><td colspan="3">${photoGrid(m)}</td></tr>` : ''}</tbody>`).join('')}
        </table>
      </section>

      ${inventory.length ? `<section class="rp-section" id="inventory"><h2 class="rp-bar">Inventory</h2>
        <table class="rp-table"><thead><tr><th>Item</th><th>Area</th><th class="num">Qty</th><th>Condition</th></tr></thead><tbody>
        ${inventory.map((i) => { const pv = prevOf(i); return `<tr><td><b>${esc(i.name)}</b>${i.text ? `<div class="said">${esc(i.text)}</div>` : ''}</td><td>${esc(roomOf(i))}</td><td class="num">${i.qty}${pv && pv.qty !== i.qty ? ` <span class="rp-change">was ${pv.qty}</span>` : ''}</td><td>${chips(R(i))}</td></tr>`; }).join('')}
        </tbody></table></section>` : ''}

      <section class="rp-section" id="comments">
        <h2 class="rp-bar">Comments</h2>
        ${notes.length || ins.comments?.tenant || ins.comments?.agent ? `<dl class="rp-comments">
          ${ins.comments?.agent ? `<div><dt>Agent or owner</dt><dd>${esc(ins.comments.agent)}</dd></div>` : ''}
          ${ins.comments?.tenant ? `<div><dt>Tenant</dt><dd>${esc(ins.comments.tenant)}</dd></div>` : ''}
          ${notes.map((n) => `<div><dt>${esc(roomOf(n))}, ${fmtClock(n.t)}</dt><dd>${esc(n.text || n.name)}</dd></div>`).join('')}
        </dl>` : '<p class="muted">No comments.</p>'}
        <h2 class="rp-bar" style="margin-top:28px">Signatures</h2>
        <p class="small muted">By signing, both parties confirm that this report is a true record of the condition of the property at the date and time shown.</p>
        <div class="rp-sigs">
          <div class="rp-sig">${sig.tenantImg ? `<img src="${sig.tenantImg}" alt="Tenant signature">` : '<div class="sig-empty"></div>'}<b>${esc(sig.tenantName || p.tenant || 'Tenant')}</b><br><span class="muted">Tenant${sig.tenant ? `, signed ${dt(sig.tenantAt || ins.signedAt)}` : ins.tenantPresent === false ? ', not present at inspection' : ', signature outstanding'}</span></div>
          <div class="rp-sig">${sig.ownerImg ? `<img src="${sig.ownerImg}" alt="Agent or owner signature">` : '<div class="sig-empty"></div>'}<b>${esc(sig.ownerName || ins.inspector || 'Agent')}</b><br><span class="muted">Agent or owner${sig.ownerImg ? `, signed ${dt(sig.ownerAt || ins.signedAt)}` : ''}</span></div>
        </div>
      </section>
      <footer class="rp-foot">${esc(AGENCY.name || '')}${AGENCY.name ? ', ' : ''}recorded with Inspektr from a narrated video walk-through. Report ${ref}.</footer>
    </article>
  </div>`;
  hydrateImages(view);

  // Running footer with page numbers when printed.
  const st = document.createElement('style');
  const footer = `${REPORT_TITLE[ins.type]}, ${fmtDate(ins.date)}, ${p.name}`.replace(/["\\]/g, '');
  st.textContent = `@page { margin: 14mm 12mm 16mm; @bottom-left { content: "${footer}"; font: 8pt Archivo, sans-serif; color: #6b7a88; } @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt Archivo, sans-serif; color: #6b7a88; } }`;
  document.head.append(st);
  onCleanup(() => st.remove());

  view.addEventListener('click', (e) => {
    const j = e.target.closest('[data-jump]');
    if (j) document.getElementById(j.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#print').addEventListener('click', () => window.print());
  $('#copy').addEventListener('click', async () => {
    const lines = [
      `${REPORT_TITLE[ins.type]}: ${p.name}, ${p.suburb}`,
      `${fmtDate(ins.date)} ${timeOf(ins)}, inspector ${ins.inspector}`,
      `${inRooms.length} items in ${order.length} areas, ${actions.length} recommended actions`,
      ...actions.map(({ it, room }) => `- ${room} · ${it.name}: ${R(it).action}${it.text ? ` (${it.text})` : ''}`),
      ins.type === 'outgoing' ? `Deposit deductions: R${total.toLocaleString('en-ZA')}` : '',
    ].filter(Boolean).join('\n');
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: `Inspection report ${ref}`, text: lines });
      else { await navigator.clipboard.writeText(lines); toast('Summary copied'); }
    } catch { /* cancelled */ }
  });
}

// ============================================================ REPAIRS
const CONTRACTORS = {
  Plumbing: ['Eastside Plumbing & Drains', 'Jacaranda Plumbers', 'FlowRight Plumbing'],
  Waterproofing: ['DryShield Waterproofing', 'Roof & Seal Services', 'Capital Waterproofing'],
  Building: ['Menlyn Building Repairs', 'SolidWall Builders', 'HandyPro Home Services'],
  Tiling: ['TileCraft Pretoria', 'Grout & Go', 'HandyPro Home Services'],
  Glazing: ['ClearView Glass', 'Pane Perfect', 'City Glass & Aluminium'],
  General: ['HandyPro Home Services', 'QuickFix Maintenance', 'Jacaranda Maintenance'],
};
function tradeOf(t) {
  if (/tap|leak|drip|pipe|geyser|toilet|basin|drain|shower/.test(t)) return 'Plumbing';
  if (/damp|stain|ceiling|roof|waterproof/.test(t)) return 'Waterproofing';
  if (/tile|grout/.test(t)) return 'Tiling';
  if (/window|glass|pane/.test(t)) return 'Glazing';
  if (/crack|wall|plaster/.test(t)) return 'Building';
  return null;
}
function tradeFor(it) {
  return it.job?.trade || tradeOf(String(it.name).toLowerCase()) || tradeOf(String(it.text).toLowerCase()) || 'General';
}
function sampleQuotes(it) {
  const trade = it.job?.trade || tradeFor(it);
  const s = seedOf(it.id);
  const base = { Plumbing: 450, Waterproofing: 2200, Building: 1400, Tiling: 650, Glazing: 900, General: 600 }[trade];
  return CONTRACTORS[trade].map((name, i) => ({
    name, price: Math.round((base * (0.85 + ((s >> (i * 3)) % 7) * 0.07)) / 10) * 10,
    rating: (4 + (((s >> (i * 2)) % 9) / 10)).toFixed(1), km: 2 + ((s >> i) % 8),
  })).sort((a, b) => a.price - b.price);
}

const IN_PROGRESS = new Set(['open', 'sent', 'quoted', 'booked']);
const TAB_OF = (st) => (st === 'approval' ? 'approval' : IN_PROGRESS.has(st) ? 'progress' : 'closed');

function viewRepairs(view) {
  function jobs() {
    const out = [];
    state.inspections.forEach((ins) => (ins.items || []).forEach((it) => { if (it.job) out.push({ it, ins, p: prop(ins.propertyId) }); }));
    return out.filter((j) => j.p);
  }
  let tab = jobs().some((j) => j.it.job.status === 'approval') ? 'approval' : 'progress';

  function costRange(it) {
    const q = sampleQuotes(it);
    return `R${q[0].price.toLocaleString('en-ZA')} to R${q[q.length - 1].price.toLocaleString('en-ZA')}`;
  }
  function ownerSummary(list) {
    const byProp = new Map();
    list.forEach(({ it, p }) => { if (!byProp.has(p.id)) byProp.set(p.id, { p, items: [] }); byProp.get(p.id).items.push(it); });
    const lines = ['Repairs found during inspection, waiting for your approval:', ''];
    byProp.forEach(({ p, items }) => {
      lines.push(`${p.name}, ${p.suburb}`);
      items.forEach((it) => lines.push(`- ${it.room}: ${it.name}${it.text ? ` (${it.text.replace(/[.\s]+$/, '')})` : ''}. Expected cost ${costRange(it)}.`));
      lines.push('');
    });
    lines.push('Reply with the repairs you approve, or open Inspektr to approve them.');
    return lines.join('\n');
  }

  function card({ it, ins, p }) {
    const s = it.job.status;
    const step = JOB_STEPS.indexOf(s);
    const quotes = s === 'quoted' ? (it.job.quotesList || (it.job.quotesList = sampleQuotes(it))) : null;
    const payer = payerOf(it, ins) === 'tenant' ? (ins.type === 'outgoing' ? 'Tenant pays from the deposit' : 'Tenant') : 'Owner pays';
    return `<article class="job" data-id="${it.id}">
      ${imgTag(it)}
      <div class="body">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:start"><b>${esc(it.name)}</b>${jobBadge(it)}</div>
        <div class="muted small">${esc(p.name)}, ${esc(it.room)}</div>
        <div class="faint tiny">Found in ${TYPE_LABEL[ins.type].toLowerCase()} inspection, ${fmtDate(ins.date)}</div>
      </div>
      <div class="foot">
        ${s !== 'declined' ? `<div class="track" data-s="${s}" aria-label="${JOB_LABEL[s]}">${JOB_STEPS.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>` : ''}
        ${it.text ? `<div class="small muted">“${esc(it.text)}”</div>` : ''}
        ${s === 'approval' ? `<div class="decision">
            <dl class="kv"><dt>Trade</dt><dd>${tradeFor(it)}</dd><dt>Expected cost</dt><dd>${costRange(it)}</dd><dt>Who pays</dt><dd>${payer}</dd></dl>
            <div class="acts"><button class="btn btn--primary btn--sm" data-act="approve">${icon.check}Approve repair</button><button class="btn btn--sm" data-act="decline">Decline</button><button class="btn btn--ghost btn--sm" data-act="view">View on plan</button></div>
          </div>` : ''}
        ${s === 'open' ? `<div class="acts"><button class="btn btn--primary btn--sm" data-act="send">Send to 3 contractors</button><button class="btn btn--sm" data-act="view">View on plan</button></div><span class="demo-note">Approved by the owner ${fmtDate(it.job.approvedAt || todayIso())}. ${tradeFor(it)}, contractors within 10 km.</span>` : ''}
        ${s === 'sent' ? '<span class="small muted">Waiting for quotes…</span>' : ''}
        ${quotes ? `<div class="quotes">${quotes.map((q, i) => `<div class="quote-row"><span><b>${esc(q.name)}</b><br><span class="stars">★ ${q.rating}</span> <span class="muted tiny">${q.km} km away</span></span><b class="data">R${q.price.toLocaleString('en-ZA')}</b><button class="btn btn--sm" data-act="choose" data-q="${i}">Choose</button></div>`).join('')}</div><span class="demo-note">Sample quotes in this prototype</span>` : ''}
        ${s === 'booked' ? `<div class="small">${esc(it.job.chosen?.name || 'Contractor')} booked for R${(it.job.chosen?.price || 0).toLocaleString('en-ZA')}</div><div class="acts"><label class="btn btn--primary btn--sm">${icon.camera}Add completion photo<input type="file" accept="image/*" capture="environment" data-act="photo" hidden></label><button class="btn btn--ghost btn--sm" data-act="done">Mark repaired without a photo</button></div>` : ''}
        ${s === 'done' ? `<div class="small muted">Repaired ${fmtDate(it.job.doneAt || todayIso())}${it.job.chosen ? ` by ${esc(it.job.chosen.name)}` : ''}</div>${it.job.afterId ? `<img data-photo="${it.job.afterId}" data-item="${it.id}" alt="Completion photo" style="width:100%;height:140px;object-fit:cover;border-radius:6px">` : ''}` : ''}
        ${s === 'declined' ? `<div class="small muted">Owner declined this repair on ${fmtDate(it.job.declinedAt || todayIso())}. It stays on record in the inspection report.</div><div class="acts"><button class="btn btn--sm" data-act="reopen">Ask the owner again</button></div>` : ''}
      </div>
    </article>`;
  }

  function render() {
    const all = jobs();
    const count = (t) => all.filter((j) => TAB_OF(j.it.job.status) === t).length;
    const list = all.filter((j) => TAB_OF(j.it.job.status) === tab);
    const empty = {
      approval: 'Nothing waiting for the owner. Defects from signed inspections arrive here first.',
      progress: 'No repairs in progress. Approved repairs appear here.',
      closed: 'No repaired or declined jobs yet.',
    }[tab];
    view.innerHTML = `
    <div class="portfolio">
      <div class="portfolio-head">
        <div><h1 class="display h1">Repairs</h1><p class="lede">Defects found in an inspection go to the owner first. Only repairs the owner approves are sent to contractors, with the photo and video moment so they can quote without a site visit.</p></div>
      </div>
      <div class="filterbar">
        <div class="seg" role="group" aria-label="Show">
          <button type="button" data-tab="approval" aria-pressed="${tab === 'approval'}">Waiting for owner <span class="data">${count('approval')}</span></button>
          <button type="button" data-tab="progress" aria-pressed="${tab === 'progress'}">In progress <span class="data">${count('progress')}</span></button>
          <button type="button" data-tab="closed" aria-pressed="${tab === 'closed'}">Closed <span class="data">${count('closed')}</span></button>
        </div>
        ${tab === 'approval' && list.length ? `<div class="acts" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn--sm" data-act="share">${icon.share}Send list to owner</button><button class="btn btn--sm" data-act="approveall">${icon.check}Approve all</button></div>` : ''}
      </div>
      ${tab === 'approval' && list.length ? '<p class="demo-note" style="margin:0">In AVA the owner gets this list on WhatsApp or email and approves each repair from their phone. In this prototype you approve on the owner’s behalf.</p>' : ''}
      <div class="jobcols">${list.length ? list.map(card).join('') : `<div class="empty">${empty}</div>`}</div>
    </div>`;
    hydrateImages(view);
  }
  render();

  view.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; render(); return; }
    const a = e.target.closest('[data-act]');
    if (!a || a.dataset.act === 'photo') return;
    if (a.dataset.act === 'share') {
      const text = ownerSummary(jobs().filter((j) => j.it.job.status === 'approval'));
      try {
        if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'Repairs to approve', text });
        else { await navigator.clipboard.writeText(text); toast('List copied. Paste it into WhatsApp or email.'); }
      } catch { /* cancelled */ }
      return;
    }
    if (a.dataset.act === 'approveall') {
      const pending = jobs().filter((j) => j.it.job.status === 'approval');
      pending.forEach(({ it }) => { it.job.status = 'open'; it.job.approvedAt = todayIso(); });
      save(); tab = 'progress'; render(); toast(`${pending.length} repair${pending.length > 1 ? 's' : ''} approved`); return;
    }
    const it = findItem(a.closest('.job').dataset.id);
    const ins = inspOfItem(it.id);
    if (a.dataset.act === 'view') { go(`#/property/${ins.propertyId}?i=${ins.id}&f=${it.id}`); return; }
    if (a.dataset.act === 'approve') { it.job.status = 'open'; it.job.approvedAt = todayIso(); save(); render(); toast('Approved. Now in progress.'); }
    if (a.dataset.act === 'decline') { it.job.status = 'declined'; it.job.declinedAt = todayIso(); save(); render(); toast('Declined. Moved to closed.'); }
    if (a.dataset.act === 'reopen') { it.job.status = 'approval'; delete it.job.declinedAt; save(); render(); toast('Sent back to the owner'); }
    if (a.dataset.act === 'send') {
      it.job.status = 'sent'; it.job.trade = tradeFor(it); save(); render(); toast('Sent to 3 contractors');
      const tmr = setTimeout(() => { it.job.status = 'quoted'; it.job.quotesList = sampleQuotes(it); save(); if (location.hash.startsWith('#/repairs')) { render(); toast('Quotes are in'); } }, 1800);
      onCleanup(() => clearTimeout(tmr));
    }
    if (a.dataset.act === 'choose') { const q = it.job.quotesList[Number(a.dataset.q)]; it.job.chosen = q; it.job.status = 'booked'; if (ins.type === 'outgoing' && !it.cost) it.cost = String(q.price); save(); render(); toast(`${q.name} booked`); }
    if (a.dataset.act === 'done') { it.job.status = 'done'; it.job.doneAt = todayIso(); save(); render(); toast('Marked as repaired'); }
  });
  view.addEventListener('change', async (e) => {
    if (e.target.dataset.act !== 'photo' || !e.target.files?.[0]) return;
    const it = findItem(e.target.closest('.job').dataset.id);
    const mid = uid('m'); await putMedia(mid, e.target.files[0]);
    it.job.afterId = mid; it.job.status = 'done'; it.job.doneAt = todayIso(); save(); render(); toast('Repair completed with photo');
  });
}

// ============================================================ DASHBOARD
const TYPE_ORDER = ['ingoing', 'outgoing', 'routine', 'inventory'];
// Categorical slots 1–4 (validated for CVD separation on the app's dark surface).
const TYPE_COLOR = { ingoing: '#3987e5', outgoing: '#d95926', routine: '#199e70', inventory: '#c98500' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Every completed inspection as a summary: signed inspections plus imported history. */
function allSummaries() {
  const live = state.inspections.filter((i) => i.status === 'signed').map((i) => ({
    date: i.date, type: i.type, propertyId: i.propertyId, durationSec: i.durationSec || 0,
    findings: (i.items || []).length,
    defects: (i.items || []).filter((x) => x.condition === 'defect' || x.condition === 'missing').map((x) => x.name),
  }));
  return [...state.history, ...live];
}

function viewDashboard(view) {
  const all = allSummaries();
  const now = new Date();
  const monthKey = (d) => d.slice(0, 7);
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const last12 = all.filter((s) => months.includes(monthKey(s.date)));
  const thisMonth = all.filter((s) => monthKey(s.date) === months[11]).length;
  const prevMonth = all.filter((s) => monthKey(s.date) === months[10]).length;
  const avgWalk = last12.length ? Math.round(last12.reduce((a, s) => a + s.durationSec, 0) / last12.length / 60) : 0;
  const avgFind = last12.length ? Math.round(last12.reduce((a, s) => a + s.findings, 0) / last12.length) : 0;
  const defectsFound = last12.reduce((a, s) => a + s.defects.length, 0);
  const jobs = state.inspections.flatMap((i) => (i.items || []).filter((x) => x.job).map((x) => x.job.status));
  const waiting = jobs.filter((s) => s === 'approval').length;
  const inProg = jobs.filter((s) => ['open', 'sent', 'quoted', 'booked'].includes(s)).length;
  const done = jobs.filter((s) => s === 'done').length;
  const declined = jobs.filter((s) => s === 'declined').length;

  const byMonth = months.map((m) => {
    const row = { month: m };
    TYPE_ORDER.forEach((t) => { row[t] = last12.filter((s) => monthKey(s.date) === m && s.type === t).length; });
    row.total = TYPE_ORDER.reduce((a, t) => a + row[t], 0);
    return row;
  });
  const defectCounts = {};
  last12.forEach((s) => s.defects.forEach((d) => { defectCounts[d] = (defectCounts[d] || 0) + 1; }));
  const topDefects = Object.entries(defectCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const byType = TYPE_ORDER.map((t) => [t, last12.filter((s) => s.type === t).length]);

  const upcoming = [...state.plans].filter((pl) => !pl.done && `${pl.date}T${pl.time}` >= new Date(Date.now() - 3600e3).toISOString().slice(0, 16))
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).slice(0, 5);
  const overdue = state.properties.filter((p) => { const d = daysFrom(p.nextDue); return d !== null && d < 0; });
  const change = thisMonth - prevMonth;

  view.innerHTML = `
  <div class="portfolio dash">
    <div class="portfolio-head">
      <div><h1 class="display h1">Dashboard</h1><p class="lede">The last 12 months of inspections across your portfolio.</p></div>
      <a class="btn" href="#/planner">${icon.calendar}Open planner</a>
    </div>
    <div class="tiles">
      <div class="tile tile--hero"><b>${last12.length}</b><span>inspections in 12 months</span></div>
      <div class="tile"><b>${thisMonth}</b><span>this month${change ? `, ${change > 0 ? 'up' : 'down'} ${Math.abs(change)} on last month` : ''}</span></div>
      <div class="tile"><b>${avgWalk} min</b><span>average walk-through</span></div>
      <div class="tile"><b>${avgFind}</b><span>items per report</span></div>
      <div class="tile"><b>${defectsFound}</b><span>defects found</span></div>
      <div class="tile"><b>${state.properties.length}</b><span>properties</span></div>
    </div>

    <section class="panel chart-panel">
      <div class="chart-head">
        <div><h2 class="h3">Inspections per month</h2><p class="small muted" style="margin:2px 0 0">By type, last 12 months</p></div>
        <div class="chart-legend">${TYPE_ORDER.map((t) => `<span><i style="background:${TYPE_COLOR[t]}"></i>${TYPE_LABEL[t]} <b>${byType.find((x) => x[0] === t)[1]}</b></span>`).join('')}</div>
      </div>
      <div class="chart" id="chart-month"></div>
      <details class="chart-table"><summary>Show as table</summary>
        <table class="dtable"><thead><tr><th>Month</th>${TYPE_ORDER.map((t) => `<th class="num">${TYPE_LABEL[t]}</th>`).join('')}<th class="num">Total</th></tr></thead>
        <tbody>${byMonth.map((r) => `<tr><td>${MONTHS[Number(r.month.slice(5)) - 1]} ${r.month.slice(0, 4)}</td>${TYPE_ORDER.map((t) => `<td class="num">${r[t]}</td>`).join('')}<td class="num"><b>${r.total}</b></td></tr>`).join('')}</tbody></table>
      </details>
    </section>

    <div class="dash-grid">
      <section class="panel chart-panel">
        <div class="chart-head"><div><h2 class="h3">Most common defects</h2><p class="small muted" style="margin:2px 0 0">Items reported as damaged, faulty or missing</p></div></div>
        <div class="hbars">${topDefects.length ? topDefects.map(([name, n]) => `<div class="hbar" title="${esc(name)}: ${n}"><span class="hbar-l">${esc(name)}</span><span class="hbar-t"><i style="width:${(n / topDefects[0][1]) * 100}%"></i></span><b class="data">${n}</b></div>`).join('') : '<p class="muted small">No defects recorded yet.</p>'}</div>
      </section>
      <section class="panel">
        <h2 class="h3">Repairs</h2>
        <div class="pipe">
          <a href="#/repairs" class="pipe-s"><b>${waiting}</b><span>Waiting for owner</span></a>
          <a href="#/repairs" class="pipe-s"><b>${inProg}</b><span>In progress</span></a>
          <a href="#/repairs" class="pipe-s"><b>${done}</b><span>Repaired</span></a>
          <a href="#/repairs" class="pipe-s"><b>${declined}</b><span>Declined</span></a>
        </div>
        <h2 class="h3" style="margin-top:8px">Coming up</h2>
        <div class="agenda-mini">
          ${upcoming.length ? upcoming.map((pl) => { const p = prop(pl.propertyId); return `<a class="hrow" href="#/planner"><span class="type-chip" data-t="${pl.type}">${TYPE_SHORT[pl.type]}</span><span><b>${esc(p?.name || '')}</b><br><span class="muted small">${fmtDate(pl.date, { weekday: 'short', day: 'numeric', month: 'short' })} at ${esc(pl.time)}</span></span><span class="badge">${relDay(pl.date)}</span></a>`; }).join('') : '<span class="muted small">Nothing planned. Add inspections in the planner.</span>'}
          ${overdue.map((p) => `<a class="hrow" href="#/planner?add=${p.id}"><span class="type-chip" style="color:var(--defect)">!</span><span><b>${esc(p.name)}</b><br><span class="muted small">${esc(dueText(p.nextDue))}</span></span><span class="badge badge--defect">Plan it</span></a>`).join('')}
        </div>
      </section>
    </div>
    <p class="tiny faint">Includes demo history so the charts have something to show.</p>
  </div>`;

  drawMonthChart($('#chart-month'), byMonth);
  const onResize = () => drawMonthChart($('#chart-month'), byMonth);
  window.addEventListener('resize', onResize);
  onCleanup(() => window.removeEventListener('resize', onResize));
}

function relDay(iso) {
  const d = daysFrom(iso);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d < 0) return `${-d} days ago`;
  return `In ${d} days`;
}

/** Stacked monthly bars: 2px surface gaps between segments, rounded top, hover tooltip per month. */
function drawMonthChart(el, rows) {
  if (!el) return;
  const W = Math.max(320, el.clientWidth || 640);
  const H = 240; const padL = 30; const padB = 26; const padT = 12;
  const max = Math.max(4, ...rows.map((r) => r.total));
  const step = max <= 8 ? 2 : max <= 20 ? 5 : 10;
  const top = Math.ceil(max / step) * step;
  const y = (v) => padT + (H - padT - padB) * (1 - v / top);
  const bw = (W - padL - 8) / rows.length;
  const barW = Math.min(34, bw * 0.62);
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  let bars = '';
  rows.forEach((r, i) => {
    const x = padL + i * bw + (bw - barW) / 2;
    let acc = 0;
    const segs = TYPE_ORDER.filter((t) => r[t]);
    segs.forEach((t, si) => {
      const y1 = y(acc + r[t]); const y0 = y(acc);
      const h = Math.max(0, y0 - y1 - (si < segs.length - 1 ? 2 : 0));
      const isTop = si === segs.length - 1;
      bars += isTop
        ? `<path d="M${x} ${y1 + h}V${y1 + 4}a4 4 0 0 1 4 -4H${x + barW - 4}a4 4 0 0 1 4 4V${y1 + h}Z" fill="${TYPE_COLOR[t]}"/>`
        : `<rect x="${x}" y="${y1 + 2}" width="${barW}" height="${Math.max(0, h)}" fill="${TYPE_COLOR[t]}"/>`;
      acc += r[t];
    });
    const label = MONTHS[Number(r.month.slice(5)) - 1];
    bars += `<text x="${x + barW / 2}" y="${H - 8}" text-anchor="middle" class="ax">${label}</text>`;
    bars += `<rect class="hit" x="${padL + i * bw}" y="${padT}" width="${bw}" height="${H - padT - padB}" data-i="${i}"/>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Inspections per month by type">
    ${ticks.map((t) => `<line x1="${padL}" x2="${W - 4}" y1="${y(t)}" y2="${y(t)}" class="${t === 0 ? 'base' : 'grid'}"/><text x="${padL - 8}" y="${y(t) + 4}" text-anchor="end" class="ax">${t}</text>`).join('')}
    ${bars}
  </svg><div class="tip" hidden></div>`;
  const tip = $('.tip', el);
  const svg = $('svg', el);
  svg.addEventListener('pointermove', (e) => {
    const h = e.target.closest('.hit');
    if (!h) { tip.hidden = true; return; }
    const r = rows[Number(h.dataset.i)];
    tip.innerHTML = `<b>${MONTHS[Number(r.month.slice(5)) - 1]} ${r.month.slice(0, 4)}</b>${TYPE_ORDER.filter((t) => r[t]).map((t) => `<div><i style="background:${TYPE_COLOR[t]}"></i>${TYPE_LABEL[t]}<span>${r[t]}</span></div>`).join('')}<div class="tot">Total<span>${r.total}</span></div>`;
    tip.hidden = false;
    const box = el.getBoundingClientRect();
    const px = e.clientX - box.left;
    tip.style.left = `${Math.min(box.width - 170, Math.max(0, px + 12))}px`;
    tip.style.top = `${Math.max(0, e.clientY - box.top - 40)}px`;
  });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; });
}

// ============================================================ PLANNER
const REMIND_OPTS = [[0, 'No reminder'], [15, '15 minutes before'], [60, '1 hour before'], [180, '3 hours before'], [1440, '1 day before']];

function planStart(pl) { return new Date(`${pl.date}T${pl.time || '09:00'}:00`); }
function planDone(pl) { return pl.done || (pl.inspectionId && insp(pl.inspectionId)?.status === 'signed'); }

function viewPlanner(view, params) {
  const today = todayIso();
  let cursor = new Date(); cursor.setDate(1);
  let selectedDay = null;

  function render() {
    const y = cursor.getFullYear(); const m = cursor.getMonth();
    const first = new Date(y, m, 1);
    const startOffset = (first.getDay() + 6) % 7; // Monday first
    const days = new Date(y, m + 1, 0).getDate();
    const iso = (d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const plansOn = (d) => state.plans.filter((pl) => pl.date === d);
    const dueOn = (d) => state.properties.filter((p) => p.nextDue === d);
    const cells = [];
    for (let i = 0; i < startOffset; i += 1) cells.push('<div class="cal-c is-out"></div>');
    for (let d = 1; d <= days; d += 1) {
      const key = iso(d);
      const pls = plansOn(key);
      const due = dueOn(key);
      cells.push(`<button type="button" class="cal-c${key === today ? ' is-today' : ''}${key === selectedDay ? ' is-sel' : ''}" data-day="${key}" aria-label="${fmtDate(key)}: ${pls.length} planned">
        <span class="cal-n">${d}</span>
        <span class="cal-dots">${pls.map((pl) => `<i class="dot dot--${planDone(pl) ? 'done' : pl.type}"></i>`).join('')}${due.map(() => '<i class="dot dot--due"></i>').join('')}</span>
      </button>`);
    }
    const list = state.plans
      .filter((pl) => (selectedDay ? pl.date === selectedDay : pl.date >= today || !planDone(pl)))
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    const groups = new Map();
    list.forEach((pl) => { if (!groups.has(pl.date)) groups.set(pl.date, []); groups.get(pl.date).push(pl); });
    const unplanned = state.properties.filter((p) => { const d = daysFrom(p.nextDue); return d !== null && d <= 30 && !state.plans.some((pl) => pl.propertyId === p.id && !planDone(pl)); });
    const notif = 'Notification' in window ? Notification.permission : 'unsupported';

    view.innerHTML = `
    <div class="portfolio">
      <div class="portfolio-head">
        <div><h1 class="display h1">Planner</h1><p class="lede">Schedule inspections and get reminded before each one.</p></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn" id="ics-all">${icon.calendar}Add all to my calendar</button>
          <button class="btn btn--primary" id="add">${icon.plus}Plan inspection</button>
        </div>
      </div>
      ${notif !== 'granted' ? `<div class="notice"><span>${notif === 'unsupported' ? 'This browser cannot show reminders. Use “Add to my calendar” so your phone reminds you.' : notif === 'denied' ? 'Reminders are blocked in this browser. Use “Add to my calendar” so your phone reminds you.' : 'Turn on reminders to get a notification before each inspection while Inspektr is open. For reminders when the app is closed, add inspections to your phone calendar.'}</span>${notif === 'default' ? '<button class="btn btn--sm" id="notify">Turn on reminders</button>' : ''}</div>` : ''}
      <div class="plan-grid">
        <section class="panel cal">
          <div class="cal-head">
            <button class="icon-btn" id="prev" aria-label="Previous month">${icon.back}</button>
            <h2 class="h3">${first.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}</h2>
            <button class="icon-btn" id="next" aria-label="Next month" style="transform:scaleX(-1)">${icon.back}</button>
          </div>
          <div class="cal-w">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<span>${d}</span>`).join('')}</div>
          <div class="cal-g">${cells.join('')}</div>
          <div class="cal-key">${TYPE_ORDER.map((t) => `<span><i class="dot dot--${t}"></i>${TYPE_LABEL[t]}</span>`).join('')}<span><i class="dot dot--due"></i>Due, not planned</span></div>
        </section>
        <section class="stack">
          <div class="section-head"><h2 class="h3">${selectedDay ? fmtDate(selectedDay, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Upcoming'}</h2>${selectedDay ? '<button class="btn btn--ghost btn--sm" id="clear">Show all upcoming</button>' : ''}</div>
          ${list.length ? [...groups.entries()].map(([d, pls]) => `<div class="day">
            <div class="day-h"><b>${fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' })}</b><span class="muted small">${relDay(d)}</span></div>
            ${pls.map((pl) => { const p = prop(pl.propertyId); const isDone = planDone(pl); return `<article class="plan-item${isDone ? ' is-done' : ''}" data-id="${pl.id}">
              <div class="pi-time data">${esc(pl.time)}</div>
              <div class="pi-body">
                <div class="pi-top"><span class="type-chip" data-t="${pl.type}">${TYPE_SHORT[pl.type]}</span><div><b>${esc(p?.name || 'Property removed')}</b><div class="muted small">${TYPE_LABEL[pl.type]} inspection, ${esc(p?.suburb || '')}</div></div></div>
                ${pl.notes ? `<p class="small" style="margin:0">${esc(pl.notes)}</p>` : ''}
                <div class="muted tiny">${pl.remind ? `Reminder ${REMIND_OPTS.find((o) => o[0] === pl.remind)?.[1].toLowerCase()}` : 'No reminder'}${p?.tenant ? `. Tenant: ${esc(p.tenant)}` : ''}</div>
                <div class="acts">
                  ${isDone ? `<span class="badge badge--good">Done</span>${pl.inspectionId ? `<a class="btn btn--sm" href="#/report/${pl.inspectionId}">Open report</a>` : ''}` : `<a class="btn btn--primary btn--sm" href="#/new/${pl.propertyId}?type=${pl.type}&plan=${pl.id}">${icon.rec}Start</a>`}
                  <button class="btn btn--sm" data-act="ics">${icon.calendar}Add to calendar</button>
                  <button class="btn btn--ghost btn--sm" data-act="edit">Edit</button>
                </div>
              </div>
            </article>`; }).join('')}
          </div>`).join('') : `<div class="empty">${selectedDay ? 'Nothing planned on this day.' : 'No inspections planned.'}<button class="btn btn--primary" id="add2">${icon.plus}Plan inspection</button></div>`}
          ${unplanned.length && !selectedDay ? `<section class="panel"><h2 class="h3">Due soon, not planned</h2>${unplanned.map((p) => `<div class="hrow" style="grid-template-columns:1fr auto"><span><b>${esc(p.name)}</b><br><span class="muted small">${esc(dueText(p.nextDue))}</span></span><button class="btn btn--sm" data-plan="${p.id}">Plan it</button></div>`).join('')}</section>` : ''}
        </section>
      </div>
    </div>`;
  }
  render();
  if (params.get('add')) setTimeout(() => planSheet(null, params.get('add')), 50);

  view.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('#prev')) { cursor.setMonth(cursor.getMonth() - 1); render(); return; }
    if (t.closest('#next')) { cursor.setMonth(cursor.getMonth() + 1); render(); return; }
    if (t.closest('#clear')) { selectedDay = null; render(); return; }
    const day = t.closest('[data-day]');
    if (day) { selectedDay = selectedDay === day.dataset.day ? null : day.dataset.day; render(); return; }
    if (t.closest('#add') || t.closest('#add2')) { planSheet(null, null, selectedDay); return; }
    const pp = t.closest('[data-plan]');
    if (pp) { planSheet(null, pp.dataset.plan); return; }
    if (t.closest('#notify')) { await Notification.requestPermission(); render(); if (Notification.permission === 'granted') toast('Reminders are on'); return; }
    if (t.closest('#ics-all')) { const open = state.plans.filter((pl) => !planDone(pl)); if (!open.length) { toast('Nothing planned yet'); return; } downloadIcs(open, 'inspektr-inspections.ics'); return; }
    const card = t.closest('.plan-item');
    if (!card) return;
    const pl = state.plans.find((x) => x.id === card.dataset.id);
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'ics') downloadIcs([pl], `inspection-${pl.date}.ics`);
    if (act === 'edit') planSheet(pl);
  });

  function planSheet(pl, propertyId = null, day = null) {
    const isNew = !pl;
    const p0 = prop(pl?.propertyId || propertyId);
    const suggestType = p0 ? (inspectionsFor(p0.id).some((i) => i.type === 'ingoing') ? 'routine' : 'ingoing') : 'routine';
    const v = pl || { propertyId: p0?.id || '', type: suggestType, date: day || p0?.nextDue || todayIso(), time: '09:00', remind: 60, notes: '' };
    openSheet(`<form class="stack" id="pform">
      <h2 class="h3" style="font-size:20px">${isNew ? 'Plan an inspection' : 'Edit inspection'}</h2>
      <div class="field"><label for="pp">Property</label><select class="select" id="pp" required><option value="">Choose a property</option>${state.properties.map((x) => `<option value="${x.id}" ${x.id === v.propertyId ? 'selected' : ''}>${esc(x.name)}, ${esc(x.suburb)}</option>`).join('')}</select></div>
      <div class="field"><label for="pt">Type</label><select class="select" id="pt">${TYPE_ORDER.map((t) => `<option value="${t}" ${t === v.type ? 'selected' : ''}>${TYPE_LABEL[t]}</option>`).join('')}</select></div>
      <div class="row2"><div class="field"><label for="pd">Date</label><input class="input" type="date" id="pd" value="${esc(v.date)}" required></div><div class="field"><label for="ptm">Time</label><input class="input" type="time" id="ptm" value="${esc(v.time)}" required></div></div>
      <div class="field"><label for="pr">Reminder</label><select class="select" id="pr">${REMIND_OPTS.map(([n, l]) => `<option value="${n}" ${n === v.remind ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label for="pn">Notes</label><textarea class="input" id="pn" rows="3" placeholder="Access, keys, who to meet">${esc(v.notes || '')}</textarea></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:space-between">
        <div style="display:flex;gap:10px"><button class="btn btn--primary">${isNew ? 'Add to planner' : 'Save changes'}</button><button type="button" class="btn" data-close>Cancel</button></div>
        ${isNew ? '' : '<button type="button" class="btn btn--danger" id="pdel">Delete</button>'}
      </div>
    </form>`, {
      onOpen: (sh) => {
        $('#pform', sh).addEventListener('submit', (e) => {
          e.preventDefault();
          const data = { propertyId: $('#pp', sh).value, type: $('#pt', sh).value, date: $('#pd', sh).value, time: $('#ptm', sh).value, remind: Number($('#pr', sh).value), notes: $('#pn', sh).value.trim() };
          if (!data.propertyId) { toast('Choose a property'); return; }
          if (isNew) state.plans.push({ id: uid('pl'), ...data });
          else { Object.assign(pl, data); delete pl.notified; }
          save(); closeSheet(); toast(isNew ? 'Inspection planned' : 'Changes saved');
          cursor = new Date(`${data.date}T12:00:00`); cursor.setDate(1); selectedDay = null; render();
        });
        $('#pdel', sh)?.addEventListener('click', () => { state.plans = state.plans.filter((x) => x !== pl); save(); closeSheet(); toast('Removed from planner'); render(); });
      },
    });
  }
}

// ---------- Calendar export (.ics) so the phone's own calendar reminds you ----------
function icsDate(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
function icsText(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`); }
function downloadIcs(plans, filename) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Inspektr//Planner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  plans.forEach((pl) => {
    const p = prop(pl.propertyId);
    const start = planStart(pl);
    const end = new Date(start.getTime() + 60 * 60000);
    lines.push('BEGIN:VEVENT', `UID:${pl.id}@inspektr`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsText(`${TYPE_LABEL[pl.type]} inspection: ${p?.name || ''}`)}`,
      `LOCATION:${icsText(`${p?.name || ''}, ${p?.suburb || ''}`)}`,
      `DESCRIPTION:${icsText([pl.notes, p?.tenant ? `Tenant: ${p.tenant}` : ''].filter(Boolean).join('\n'))}`);
    if (pl.remind) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(`Inspection at ${p?.name || ''}`)}`, `TRIGGER:-PT${pl.remind}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Calendar file downloaded. Open it to add to your calendar.');
}

// ---------- In-app reminders (while Inspektr is open) ----------
function checkReminders() {
  const now = Date.now();
  let changed = false;
  state.plans.forEach((pl) => {
    if (!pl.remind || pl.notified || planDone(pl)) return;
    const start = planStart(pl).getTime();
    if (now >= start - pl.remind * 60000 && now < start + 3600e3) {
      pl.notified = true; changed = true;
      const p = prop(pl.propertyId);
      const msg = `${TYPE_LABEL[pl.type]} inspection at ${p?.name || ''}, ${fmtDate(pl.date, { day: 'numeric', month: 'short' })} at ${pl.time}`;
      try {
        if ('Notification' in window && Notification.permission === 'granted') new Notification('Inspektr reminder', { body: msg, icon: 'assets/icon.svg', tag: pl.id });
      } catch { /* some mobile browsers need a service worker */ }
      toast(`Reminder: ${msg}`, 6000);
    }
  });
  if (changed) save();
  const badge = $$('[data-plan-badge]');
  const soon = state.plans.filter((pl) => !planDone(pl) && daysFrom(pl.date) !== null && daysFrom(pl.date) >= 0 && daysFrom(pl.date) <= 1).length;
  badge.forEach((b) => { b.textContent = soon || ''; b.hidden = !soon; });
}
setInterval(checkReminders, 30000);

// ============================================================ ADD PROPERTY
function viewAdd(view) {
  let pos = null;
  view.innerHTML = `
  <form class="form" id="addform">
    <div><div class="crumbs"><a href="#/">Portfolio</a><span>/</span><span>Add property</span></div><h1 class="display h1" style="margin-top:8px">Add property</h1></div>
    <div class="field"><label for="an">Address or unit</label><input class="input" id="an" required placeholder="e.g. 18 Protea Street"></div>
    <div class="row2">
      <div class="field"><label for="as">Suburb and city</label><input class="input" id="as" required placeholder="e.g. Waterkloof, Pretoria"></div>
      <div class="field"><label for="al">Layout</label><select class="select" id="al">${Object.entries(TEMPLATE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    </div>
    <div class="row2">
      <div class="field"><label for="at">Tenant</label><input class="input" id="at" placeholder="Name"></div>
      <div class="field"><label for="ao">Owner</label><input class="input" id="ao" placeholder="Name"></div>
    </div>
    <div class="row2">
      <div class="field"><label for="ad">Next inspection</label><input class="input" id="ad" type="date"></div>
      <div class="field"><span class="label">Contents</span><label class="toggle"><input type="checkbox" id="af"><span>Furnished</span></label></div>
    </div>
    <div class="field"><span class="label">Location: tap the map where the house is</span><div class="map" id="amap"></div>
      <div style="display:flex;gap:10px;align-items:center"><button type="button" class="btn btn--sm" id="here">${icon.locate}Use my location</button><span class="small muted" id="apos">No location set</span></div></div>
    <button class="btn btn--primary btn--block">Save property</button>
  </form>`;
  const map = makeMap($('#amap'), { scroll: true });
  let marker = null;
  const setPos = (lat, lng) => {
    pos = { lat, lng };
    $('#apos').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    if (!map) return;
    if (marker) marker.setLatLng([lat, lng]);
    else marker = L.marker([lat, lng], { icon: houseIcon({ id: 'new', nextDue: null }) }).addTo(map);
  };
  if (map) {
    map.setView([-25.7563, 28.2593], 12);
    map.on('click', (e) => setPos(e.latlng.lat, e.latlng.lng));
  }
  $('#here').addEventListener('click', () => {
    if (!navigator.geolocation) { toast('Location is not available'); return; }
    navigator.geolocation.getCurrentPosition((g) => { setPos(g.coords.latitude, g.coords.longitude); map?.setView([g.coords.latitude, g.coords.longitude], 18); }, () => toast('Could not get your location'), { enableHighAccuracy: true, timeout: 10000 });
  });
  $('#addform').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!pos) { toast('Set the location on the map'); return; }
    const pnew = {
      id: uid('p'), name: $('#an').value.trim(), suburb: $('#as').value.trim(), lat: pos.lat, lng: pos.lng,
      template: $('#al').value, furnished: $('#af').checked, tenant: $('#at').value.trim(), owner: $('#ao').value.trim(), nextDue: $('#ad').value || null,
    };
    state.properties.push(pnew); save(); toast('Property added');
    go(`#/property/${pnew.id}`);
  });
}

// ============================================================ boot
route();
