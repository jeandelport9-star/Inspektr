// Inspektr – app shell, routing and screens.

import { loadState, saveState, clearState, clearMedia, putMedia, mediaUrl, uid } from './store.js';
import { demoState, demoArt, TEMPLATES, TEMPLATE_LABELS } from './demo.js';
import {
  planSVG, roomsFor, matchRoom, unplacedItems, eventToPlan, roomAt, toRoomXY, autoSpot, normRoom,
} from './floorplan.js';
import { parsePhrase, createRecognizer, speechSupported } from './voice.js';
import { openCamera, stopStream, startRecording, captureStill, steady, artFor } from './recorder.js';
import {
  $, $$, esc, fmtDate, fmtClock, fmtDuration, dueText, daysFrom, todayIso, toast, sound, buzz, icon, brandMark,
  openSheet, closeSheet, badge, TYPE_LABEL, TYPE_SHORT, COND_LABEL,
} from './ui.js';

// ============================================================ state
let state = loadState() || demoState();
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
      <a href="#/repairs" ${active === 'repairs' ? 'aria-current="page"' : ''}>Repairs</a>
    </nav>
    <div class="spacer"></div>
    <a class="btn btn--primary btn--sm" href="#/new">${icon.rec}Start inspection</a>
  </header>
  <main class="view" id="view"></main>
  <nav class="tabbar" aria-label="Main">
    <a href="#/" ${active === 'home' ? 'aria-current="page"' : ''}>${icon.map}<span>Portfolio</span></a>
    <a href="#/new" class="tab-record"><span class="dot">${icon.rec}</span><span class="label">Inspect</span></a>
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
  const active = name === 'repairs' ? 'repairs' : name === '' ? 'home' : '';
  app.innerHTML = shell(active);
  const view = $('#view');
  window.scrollTo(0, 0);

  const routes = {
    '': () => viewHome(view),
    property: () => viewProperty(view, id, params),
    new: () => viewNew(view, id),
    record: () => viewRecord(view, id),
    process: () => viewProcess(view, id),
    review: () => viewReview(view, id),
    sign: () => viewSign(view, id),
    report: () => viewReport(view, id),
    repairs: () => viewRepairs(view),
    add: () => viewAdd(view),
  };
  (routes[name] || routes[''])();
}
window.addEventListener('hashchange', route);

const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

// ============================================================ map helpers
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

function makeMap(el, opts = {}) {
  if (!window.L) {
    el.innerHTML = '<div class="empty">The map needs an internet connection. Your properties are listed below.</div>';
    return null;
  }
  const map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: opts.scroll ?? false, ...opts });
  L.tileLayer(TILE_URL, { attribution: TILE_ATTR, subdomains: 'abcd', maxZoom: 20 }).addTo(map);
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
    <div class="mini">${planSVG(p, latest?.items || [], { mini: true })}</div>
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
    const items = current?.items || [];
    $('#plan').innerHTML = planSVG(p, items, { draw: first, selectedId: selected, filter, id: 'prop' });
    first = false;
    const counts = {};
    items.forEach((it) => { const k = filterKey(it); counts[k] = (counts[k] || 0) + 1; });
    $('#legend').innerHTML = FILTERS.filter((k) => counts[k]).map((k) => `<button type="button" data-k="${k}" aria-pressed="${filter.has(k)}"><i style="background:${FILTER_COLOR[k]}"></i>${FILTER_LABEL[k]} <b>${counts[k]}</b></button>`).join('');
    $('#plancount').textContent = current ? `${items.length} findings, ${fmtDuration(current.durationSec)} walk` : '';
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

const JOB_STEPS = ['open', 'sent', 'quoted', 'booked', 'done'];
const JOB_LABEL = { open: 'Not sent', sent: 'Waiting for quotes', quoted: 'Quotes in', booked: 'Contractor booked', done: 'Repaired' };
function jobBadge(it) {
  const s = it.job?.status;
  if (!s) return '<span class="badge badge--unrated">No repair job</span>';
  const cls = s === 'done' ? 'badge--good' : s === 'open' ? 'badge--defect' : 'badge--unrated';
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
        <dt>Inspection</dt><dd>${TYPE_LABEL[ins.type]}, ${fmtDate(ins.date)}</dd>
        <dt>Inspector</dt><dd>${esc(ins.inspector || '')}</dd>
        ${it.condition === 'defect' ? `<dt>Repair</dt><dd>${jobBadge(it)}</dd>` : ''}
        ${it.payer ? `<dt>Paid by</dt><dd>${it.payer === 'tenant' ? 'Tenant (from deposit)' : 'Owner'}${it.cost ? `, R${esc(it.cost)}` : ''}</dd>` : ''}
      </dl>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${hasVideo ? `<button class="btn" id="play">${icon.play}Play this moment</button>` : ''}
        ${it.condition === 'defect' && !it.job ? `<button class="btn btn--primary" id="mkjob">${icon.wrench}Create repair job</button>` : ''}
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
    it.job = { status: 'open', created: todayIso() }; save(); closeSheet(); toast('Repair job created'); route();
  });
}

// ============================================================ NEW INSPECTION
const TYPE_DESC = {
  ingoing: 'Tenant moving in. Records the starting condition.',
  outgoing: 'Tenant moving out. Compared with the ingoing report.',
  routine: 'Check-up during the lease. Defects go to repairs.',
  inventory: 'Furniture and contents only, with counts.',
};

function viewNew(view, pid) {
  const props = state.properties;
  let p = prop(pid) || null;
  let type = 'ingoing';
  if (p) {
    const hasIn = inspectionsFor(p.id).some((i) => i.type === 'ingoing');
    type = hasIn ? 'routine' : 'ingoing';
  }

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
      state.inspections.push(ins); save();
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
    const it = {
      id: uid('f'), room: S.room, name, text, condition, kind, qty, t: +elapsed().toFixed(1),
      x: spot.x, y: spot.y, confidence, decision: 'pending', art: artFor(`${name} ${text}`),
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
    it.condition = cond; it.confidence = Math.max(it.confidence, 0.92);
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
    ins.status = 'review'; save();
    $('#next').disabled = false;
    t = setTimeout(() => go(`#/review/${ins.id}`), reduce ? 0 : 900);
  };
  let t = setTimeout(run, 200);
  onCleanup(() => clearTimeout(t));
  $('#next').addEventListener('click', () => go(`#/review/${ins.id}`));
}

// ============================================================ REVIEW
function flagReason(it) {
  if (it.kind === 'note') return '';
  if (it.condition === 'unrated') return 'No condition heard';
  if (/^(photo|defect|item)$/i.test(it.name)) return 'Give this a name';
  if (it.condition === 'defect') return 'Confirm the defect';
  if ((it.confidence ?? 1) < 0.8) return 'Check this was heard right';
  return '';
}
const isFlagged = (it) => Boolean(flagReason(it)) && it.decision !== 'accepted';

function viewReview(view, id) {
  const ins = insp(id);
  const p = ins && prop(ins.propertyId);
  if (!ins || !p) { go('#/'); return; }
  let show = ins.items.some(isFlagged) ? 'flagged' : 'all';
  let selected = null;
  const outgoing = ins.type === 'outgoing';

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
      <div class="filterbar">
        <div class="seg" role="group" aria-label="Show">
          <button type="button" data-show="flagged">Needs review <span class="data" id="nf"></span></button>
          <button type="button" data-show="all">All <span class="data">${ins.items.length}</span></button>
        </div>
        <button class="btn btn--sm" id="acceptall">${icon.check}Accept all shown</button>
      </div>
      <div class="ritems" id="ritems"></div>
    </section>
  </div>`;

  function renderPlan() {
    $('#plan').innerHTML = planSVG(p, ins.items, { selectedId: selected, id: 'rev' });
  }
  function renderList() {
    const flagged = ins.items.filter(isFlagged);
    $('#nf').textContent = flagged.length;
    $('#lede').textContent = flagged.length
      ? `${flagged.length} of ${ins.items.length} findings need a decision. The rest are ready.`
      : `All ${ins.items.length} findings are ready to sign.`;
    $$('[data-show]', view).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.show === show)));
    const list = show === 'flagged' ? flagged : ins.items;
    $('#ritems').innerHTML = list.length ? list.map((it) => {
      const why = flagReason(it);
      return `<article class="ritem ${isFlagged(it) ? 'is-flagged' : ''} ${it.decision === 'accepted' ? 'is-accepted' : ''} ${selected === it.id ? 'is-selected' : ''}" data-id="${it.id}">
        ${it.photoId || it.art ? imgTag(it, 'thumb') : '<div class="thumb thumb--none">No photo</div>'}
        <div class="body">
          <div class="top"><input class="name" value="${esc(it.name)}" aria-label="Item name" data-f="name"><span class="faint tiny data">${fmtClock(it.t)}</span></div>
          <div class="muted small">${esc(it.room)}${it.text ? `: “${esc(it.text)}”` : ''}</div>
          ${it.kind === 'note' ? '' : `<div class="row"><div class="seg" role="group" aria-label="Condition">${['good', 'fair', 'defect', 'missing'].map((c) => `<button type="button" data-c="${c}" aria-pressed="${it.condition === c}">${COND_LABEL[c]}</button>`).join('')}</div>
            ${it.kind === 'inventory' ? `<label class="small muted">Qty <input class="input cost" type="number" min="0" value="${it.qty}" data-f="qty" style="width:70px"></label>` : ''}</div>`}
          ${outgoing && it.condition === 'defect' ? `<div class="row"><div class="seg" role="group" aria-label="Paid by">${['tenant', 'owner'].map((x) => `<button type="button" data-pay="${x}" aria-pressed="${(it.payer || 'tenant') === x}">${x === 'tenant' ? 'Tenant pays' : 'Owner pays'}</button>`).join('')}</div><label class="small muted">R <input class="input cost" type="number" min="0" step="10" value="${esc(it.cost || '')}" placeholder="Cost" data-f="cost"></label></div>` : ''}
          <div class="row" style="justify-content:space-between">${why && it.decision !== 'accepted' ? `<span class="why">${why}</span>` : '<span></span>'}
            ${it.decision === 'accepted' ? '<span class="badge badge--good">Accepted</span>' : `<button class="btn btn--sm" data-accept>${icon.check}Accept</button>`}</div>
        </div>
      </article>`;
    }).join('') : '<div class="empty">Nothing needs a decision.<a class="btn btn--primary" href="#/sign/' + ins.id + '">Continue to sign-off</a></div>';
    hydrateImages($('#ritems'));
  }
  renderPlan(); renderList();

  view.addEventListener('click', (e) => {
    const show2 = e.target.closest('[data-show]');
    if (show2) { show = show2.dataset.show; renderList(); return; }
    if (e.target.closest('#acceptall')) {
      const list = show === 'flagged' ? ins.items.filter(isFlagged) : ins.items;
      list.forEach((it) => { it.decision = 'accepted'; if (it.condition === 'unrated') it.condition = 'good'; });
      save(); renderList(); toast(`${list.length} findings accepted`); return;
    }
    const row = e.target.closest('.ritem');
    if (!row) return;
    const it = ins.items.find((x) => x.id === row.dataset.id);
    const c = e.target.closest('[data-c]');
    const pay = e.target.closest('[data-pay]');
    if (c) { it.condition = c.dataset.c; it.confidence = 1; if (outgoing && it.condition === 'defect' && !it.payer) it.payer = 'tenant'; save(); renderPlan(); renderList(); return; }
    if (pay) { it.payer = pay.dataset.pay; save(); renderList(); return; }
    if (e.target.closest('[data-accept]')) { if (it.condition === 'unrated') { toast('Choose a condition first'); return; } it.decision = 'accepted'; save(); renderList(); return; }
    if (!e.target.closest('input')) { selected = selected === it.id ? null : it.id; renderPlan(); $$('.ritem', view).forEach((r) => r.classList.toggle('is-selected', r.dataset.id === selected)); }
  });
  view.addEventListener('change', (e) => {
    const f = e.target.dataset.f;
    const row = e.target.closest('.ritem');
    if (!f || !row) return;
    const it = ins.items.find((x) => x.id === row.dataset.id);
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
    const start = eventToPlan(svg, e);
    drag = { id: pin.dataset.id, pin, svg, start, moved: false };
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
      const row = $(`.ritem[data-id="${it.id}"]`, view);
      if (!row && selected) { show = 'all'; renderList(); }
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
  const defects = ins.items.filter((i) => i.condition === 'defect');
  const pending = ins.items.filter(isFlagged).length;
  view.innerHTML = `
  <div class="sign">
    <div>
      <div class="crumbs"><a href="#/review/${ins.id}">Review</a><span>/</span><span>Sign-off</span></div>
      <h1 class="display h1" style="margin-top:8px">Sign-off</h1>
      <p class="muted" style="margin-top:8px">${TYPE_LABEL[ins.type]} inspection of ${esc(p.name)}: ${ins.items.length} findings, ${defects.length} defects.${pending ? ` ${pending} still marked for review will be included as recorded.` : ''}</p>
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
    ${defects.length ? `<label class="toggle"><input type="checkbox" id="jobs" checked><span>Create ${defects.length} repair job${defects.length > 1 ? 's' : ''} from the defects</span></label>` : ''}
    <button class="btn btn--primary btn--block" id="done">${icon.check}Sign and finish report</button>
  </div>`;

  const pads = $$('.pad', view).map((el) => {
    const canvas = $('canvas', el);
    const ratio = window.devicePixelRatio || 1;
    const size = () => { const r = canvas.getBoundingClientRect(); canvas.width = r.width * ratio; canvas.height = r.height * ratio; const c = canvas.getContext('2d'); c.scale(ratio, ratio); c.lineWidth = 2.4; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#15212c'; };
    size();
    const c = canvas.getContext('2d');
    let drawing = false; let inked = false;
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    canvas.addEventListener('pointerdown', (e) => { drawing = true; canvas.setPointerCapture(e.pointerId); c.beginPath(); c.moveTo(...pos(e)); });
    canvas.addEventListener('pointermove', (e) => { if (!drawing) return; c.lineTo(...pos(e)); c.stroke(); inked = true; });
    canvas.addEventListener('pointerup', () => { drawing = false; });
    $('[data-clear]', el).addEventListener('click', () => { c.clearRect(0, 0, canvas.width, canvas.height); inked = false; });
    return { who: el.dataset.who, canvas, name: () => $('input', el).value.trim(), inked: () => inked };
  });

  $('#done').addEventListener('click', () => {
    const absent = $('#absent').checked;
    const t = pads[0]; const o = pads[1];
    if (!o.inked()) { toast('The agent or owner needs to sign'); return; }
    if (!absent && !t.inked()) { toast('The tenant needs to sign, or mark them as not present'); return; }
    ins.signatures = {
      tenant: !absent && t.inked(), tenantName: t.name(), tenantImg: !absent && t.inked() ? t.canvas.toDataURL('image/png') : null,
      owner: true, ownerName: o.name(), ownerImg: o.canvas.toDataURL('image/png'),
    };
    ins.tenantPresent = !absent;
    ins.status = 'signed';
    ins.signedAt = new Date().toISOString();
    ins.items.forEach((it) => { if (it.condition === 'unrated') it.condition = 'good'; });
    let made = 0;
    if ($('#jobs')?.checked) defects.forEach((it) => { if (!it.job) { it.job = { status: 'open', created: todayIso() }; made += 1; } });
    if (ins.type === 'ingoing' || ins.type === 'routine' || ins.type === 'outgoing') {
      const pp = prop(ins.propertyId); const d = new Date(); d.setMonth(d.getMonth() + (ins.type === 'outgoing' ? 0 : 6));
      if (ins.type !== 'outgoing') pp.nextDue = d.toISOString().slice(0, 10);
    }
    save();
    toast(made ? `Report signed. ${made} repair job${made > 1 ? 's' : ''} created.` : 'Report signed');
    go(`#/report/${ins.id}`);
  });
}

// ============================================================ REPORT
function viewReport(view, id) {
  const ins = insp(id);
  const p = ins && prop(ins.propertyId);
  if (!ins || !p) { go('#/'); return; }
  const items = ins.items || [];
  const defects = items.filter((i) => i.condition === 'defect');
  const inventory = items.filter((i) => i.kind === 'inventory');
  const notes = items.filter((i) => i.kind === 'note');
  const linked = ins.linkedId ? insp(ins.linkedId) : null;
  const rooms = roomsFor(p).map((r) => r.name);
  const byRoom = new Map();
  items.filter((i) => i.kind !== 'note').forEach((it) => {
    const m = matchRoom(p, it.room); const key = m ? m.name : it.room;
    if (!byRoom.has(key)) byRoom.set(key, []);
    byRoom.get(key).push(it);
  });
  const order = [...rooms.filter((r) => byRoom.has(r)), ...[...byRoom.keys()].filter((k) => !rooms.includes(k))];

  // Changes vs ingoing
  let changes = [];
  if (linked) {
    const key = (it) => `${normRoom(it.room)}|${it.name.toLowerCase()}`;
    const before = new Map(linked.items.map((it) => [key(it), it]));
    const rank = { good: 0, fair: 1, defect: 2, missing: 3, unrated: 0 };
    changes = items.filter((it) => it.kind !== 'note').map((it) => ({ it, prev: before.get(key(it)) }))
      .filter(({ it, prev }) => !prev || rank[it.condition] > rank[prev.condition] || (it.kind === 'inventory' && prev.qty !== it.qty));
    linked.items.filter((it) => it.kind === 'inventory' && !items.some((x) => key(x) === key(it)))
      .forEach((prev) => changes.push({ it: { ...prev, condition: 'missing', qty: 0, text: 'Not found at outgoing inspection' }, prev }));
  }
  const deductions = ins.type === 'outgoing' ? items.filter((i) => i.condition === 'defect' && (i.payer || 'tenant') === 'tenant') : [];
  const total = deductions.reduce((s, i) => s + (Number(i.cost) || 0), 0);
  const sig = ins.signatures || {};
  const ref = `INS-${ins.id.slice(-6).toUpperCase()}`;

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
    <article class="paper">
      <header class="rp-head">
        <div class="rp-brand"><img src="assets/icon.svg" alt="">Inspektr</div>
        <div class="muted small" style="text-align:right">Report ${ref}<br>${ins.status === 'signed' ? `Signed ${fmtDate((ins.signedAt || ins.date).slice(0, 10))}` : 'Draft, not yet signed'}</div>
      </header>
      <h1 class="display rp-title">${TYPE_LABEL[ins.type]} inspection</h1>
      <div class="muted">${esc(p.name)}, ${esc(p.suburb)}</div>
      <dl class="rp-meta">
        <div><dt>Date</dt><dd>${fmtDate(ins.date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</dd></div>
        <div><dt>Inspector</dt><dd>${esc(ins.inspector || '')}</dd></div>
        <div><dt>Tenant</dt><dd>${esc(sig.tenantName || p.tenant || '')}${ins.tenantPresent === false ? ' (not present)' : ''}</dd></div>
        <div><dt>Owner</dt><dd>${esc(p.owner || '')}</dd></div>
        <div><dt>Walk-through</dt><dd>${fmtDuration(ins.durationSec)}${ins.videoId ? ', video on file' : ''}</dd></div>
        ${linked ? `<div><dt>Compared with</dt><dd>Ingoing, ${fmtDate(linked.date)}</dd></div>` : ''}
      </dl>
      <div class="rp-sum">
        <div class="figure"><b>${items.length}</b><span>findings</span></div>
        <div class="figure figure--alert"><b>${defects.length}</b><span>defects</span></div>
        <div class="figure"><b>${order.length}</b><span>rooms</span></div>
        ${inventory.length ? `<div class="figure"><b>${inventory.reduce((s, i) => s + (i.qty || 0), 0)}</b><span>inventory items</span></div>` : ''}
        ${ins.type === 'outgoing' ? `<div class="figure"><b>R${total.toLocaleString('en-ZA')}</b><span>deductions</span></div>` : ''}
      </div>
      <div class="rp-plan">${planSVG(p, items, { id: 'rp' })}</div>
      <p class="tiny muted">Pins show where each finding was recorded. Red marks a defect.</p>

      ${linked ? `<section class="rp-section"><h2>Changes since the ingoing inspection</h2>
        ${changes.length ? `<table class="rp-table"><thead><tr><th></th><th>Item</th><th>Ingoing</th><th>Now</th></tr></thead><tbody>
        ${changes.map(({ it, prev }) => `<tr><td class="ph">${imgTag(it)}</td><td><b>${esc(it.name)}</b><div class="said">${esc(it.room)}${it.text ? `: “${esc(it.text)}”` : ''}</div></td><td>${prev ? `<span class="rp-c rp-c--${prev.condition}">${COND_LABEL[prev.condition]}</span>${prev.kind === 'inventory' ? ` ×${prev.qty}` : ''}` : '<span class="muted">Not recorded</span>'}</td><td><span class="rp-c rp-c--${it.condition}">${COND_LABEL[it.condition]}</span>${it.kind === 'inventory' ? ` ×${it.qty}` : ''} ${prev ? '<span class="rp-change">Changed</span>' : '<span class="rp-change">New</span>'}</td></tr>`).join('')}
        </tbody></table>` : '<p class="muted">No changes found. Everything matches the ingoing report.</p>'}</section>` : ''}

      ${deductions.length ? `<section class="rp-section"><h2>Deposit deductions</h2><p class="muted small">Damage beyond fair wear and tear, charged to the tenant.</p>
        <table class="rp-table"><thead><tr><th>Item</th><th>Room</th><th class="num">Cost</th></tr></thead><tbody>
        ${deductions.map((i) => `<tr><td><b>${esc(i.name)}</b><div class="said">${esc(i.text || '')}</div></td><td>${esc(i.room)}</td><td class="num">${i.cost ? `R${Number(i.cost).toLocaleString('en-ZA')}` : '<span class="muted">To be quoted</span>'}</td></tr>`).join('')}
        <tr><td colspan="2"><b>Total</b></td><td class="num"><b>R${total.toLocaleString('en-ZA')}</b></td></tr></tbody></table></section>` : ''}

      <section class="rp-section"><h2>Room by room</h2>
      ${order.map((room) => `<div class="rp-room"><h3><span>${esc(room)}</span><span class="muted small">${byRoom.get(room).length} findings</span></h3>
        <table class="rp-table"><tbody>
        ${byRoom.get(room).map((it) => `<tr><td class="ph">${it.photoId || it.art ? imgTag(it) : ''}</td><td><b>${esc(it.name)}</b>${it.kind === 'inventory' ? ` <span class="muted">×${it.qty}</span>` : ''}<div class="said">${it.text ? `“${esc(it.text)}”` : ''} <span class="data">${fmtClock(it.t)}</span></div></td><td class="num"><span class="rp-c rp-c--${it.condition}">${COND_LABEL[it.condition]}</span></td></tr>`).join('')}
        </tbody></table></div>`).join('')}
      </section>

      ${inventory.length ? `<section class="rp-section"><h2>Inventory</h2><table class="rp-table"><thead><tr><th>Item</th><th>Room</th><th class="num">Qty</th><th class="num">Condition</th></tr></thead><tbody>
        ${inventory.map((i) => `<tr><td><b>${esc(i.name)}</b><div class="said">${esc(i.text || '')}</div></td><td>${esc(i.room)}</td><td class="num">${i.qty}</td><td class="num"><span class="rp-c rp-c--${i.condition}">${COND_LABEL[i.condition]}</span></td></tr>`).join('')}
      </tbody></table></section>` : ''}

      ${notes.length ? `<section class="rp-section"><h2>Notes</h2>${notes.map((n) => `<p>${esc(n.text || n.name)} <span class="muted small">(${esc(n.room)}, ${fmtClock(n.t)})</span></p>`).join('')}</section>` : ''}

      <section class="rp-section"><h2>Signatures</h2>
        <div class="rp-sigs">
          <div class="rp-sig">${sig.tenantImg ? `<img src="${sig.tenantImg}" alt="Tenant signature">` : '<div style="height:70px"></div>'}<b>${esc(sig.tenantName || p.tenant || 'Tenant')}</b><br><span class="muted">Tenant${sig.tenant ? '' : ', signature outstanding'}</span></div>
          <div class="rp-sig">${sig.ownerImg ? `<img src="${sig.ownerImg}" alt="Agent or owner signature">` : '<div style="height:70px"></div>'}<b>${esc(sig.ownerName || ins.inspector || 'Agent')}</b><br><span class="muted">Agent or owner</span></div>
        </div>
      </section>
      <footer class="rp-foot">Recorded with Inspektr from a narrated video walk-through. Each finding is linked to its photo and to the moment it was spoken in the walk video. Report ${ref}.</footer>
    </article>
  </div>`;
  hydrateImages(view);

  $('#print').addEventListener('click', () => window.print());
  $('#copy').addEventListener('click', async () => {
    const lines = [
      `${TYPE_LABEL[ins.type]} inspection: ${p.name}, ${p.suburb}`,
      `${fmtDate(ins.date)}, inspector ${ins.inspector}`,
      `${items.length} findings, ${defects.length} defects`,
      ...defects.map((d) => `- ${d.room}: ${d.name}${d.text ? ` (${d.text})` : ''}`),
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

function viewRepairs(view) {
  let tab = 'open';
  function jobs() {
    const out = [];
    state.inspections.forEach((ins) => (ins.items || []).forEach((it) => { if (it.job) out.push({ it, ins, p: prop(ins.propertyId) }); }));
    return out.filter((j) => j.p);
  }
  function render() {
    const all = jobs();
    const list = all.filter((j) => (tab === 'done' ? j.it.job.status === 'done' : j.it.job.status !== 'done'));
    view.innerHTML = `
    <div class="portfolio">
      <div class="portfolio-head">
        <div><h1 class="display h1">Repairs</h1><p class="lede">Defects from inspections become repair jobs. Each job carries its photo and the moment in the walk video, so contractors can quote without a site visit.</p></div>
        <div class="seg" role="group" aria-label="Show">
          <button type="button" data-tab="open" aria-pressed="${tab === 'open'}">Open <span class="data">${all.filter((j) => j.it.job.status !== 'done').length}</span></button>
          <button type="button" data-tab="done" aria-pressed="${tab === 'done'}">Repaired <span class="data">${all.filter((j) => j.it.job.status === 'done').length}</span></button>
        </div>
      </div>
      <div class="jobcols">
        ${list.length ? list.map(({ it, ins, p }) => {
          const s = it.job.status;
          const step = JOB_STEPS.indexOf(s);
          const quotes = s === 'quoted' ? (it.job.quotesList || (it.job.quotesList = sampleQuotes(it))) : null;
          return `<article class="job" data-id="${it.id}">
            ${imgTag(it)}
            <div class="body">
              <div style="display:flex;justify-content:space-between;gap:8px;align-items:start"><b>${esc(it.name)}</b>${jobBadge(it)}</div>
              <div class="muted small">${esc(p.name)}, ${esc(it.room)}</div>
            </div>
            <div class="foot">
              <div class="track" data-s="${s}" aria-label="${JOB_LABEL[s]}">${JOB_STEPS.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
              ${it.text ? `<div class="small muted">“${esc(it.text)}”</div>` : ''}
              ${s === 'open' ? `<div class="acts"><button class="btn btn--primary btn--sm" data-act="send">Send to 3 contractors</button><button class="btn btn--sm" data-act="view">View on plan</button></div><span class="demo-note">${it.job.trade || tradeFor(it)}, contractors within 10 km</span>` : ''}
              ${s === 'sent' ? '<span class="small muted">Waiting for quotes…</span>' : ''}
              ${quotes ? `<div class="quotes">${quotes.map((q, i) => `<div class="quote-row"><span><b>${esc(q.name)}</b><br><span class="stars">★ ${q.rating}</span> <span class="muted tiny">${q.km} km away</span></span><b class="data">R${q.price.toLocaleString('en-ZA')}</b><button class="btn btn--sm" data-act="choose" data-q="${i}">Choose</button></div>`).join('')}</div><span class="demo-note">Sample quotes in this prototype</span>` : ''}
              ${s === 'booked' ? `<div class="small">${esc(it.job.chosen?.name || 'Contractor')} booked for R${(it.job.chosen?.price || 0).toLocaleString('en-ZA')}</div><div class="acts"><label class="btn btn--primary btn--sm">${icon.camera}Add completion photo<input type="file" accept="image/*" capture="environment" data-act="photo" hidden></label><button class="btn btn--ghost btn--sm" data-act="done">Mark repaired without a photo</button></div>` : ''}
              ${s === 'done' ? `<div class="small muted">Repaired ${fmtDate(it.job.doneAt || todayIso())}${it.job.chosen ? ` by ${esc(it.job.chosen.name)}` : ''}</div>${it.job.afterId ? `<img data-photo="${it.job.afterId}" data-item="${it.id}" alt="Completion photo" style="width:100%;height:140px;object-fit:cover;border-radius:6px">` : ''}` : ''}
            </div>
          </article>`;
        }).join('') : `<div class="empty">${tab === 'open' ? 'No open repairs. Defects found in inspections will appear here.' : 'No repairs completed yet.'}</div>`}
      </div>
    </div>`;
    hydrateImages(view);
  }
  render();

  view.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; render(); return; }
    const a = e.target.closest('[data-act]');
    if (!a || a.dataset.act === 'photo') return;
    const it = findItem(a.closest('.job').dataset.id);
    const ins = inspOfItem(it.id);
    if (a.dataset.act === 'view') { go(`#/property/${ins.propertyId}?i=${ins.id}&f=${it.id}`); return; }
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
