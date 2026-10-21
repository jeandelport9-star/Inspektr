// Inspektr – room setup: say what the property has (2 bed, 2 bath, garage…) before the first inspection.
import { esc } from './ui.js';

const COUNTS = [
  { k: 'bed', label: 'Bedrooms', max: 8 },
  { k: 'bath', label: 'Bathrooms', hint: 'Not counting en-suites', max: 6 },
  { k: 'ensuite', label: 'En-suites', max: 6 },
  { k: 'wc', label: 'Guest toilets', max: 3 },
];

// Walking order: in the front door, living areas, kitchen, bedrooms, outside.
const SPACES = [
  { k: 'entrance', name: 'Entrance hall' },
  { k: 'lounge', name: 'Lounge' },
  { k: 'family', name: 'Family room' },
  { k: 'dining', name: 'Dining room' },
  { k: 'open', name: 'Open-plan living' },
  { k: 'kitchen', name: 'Kitchen' },
  { k: 'scullery', name: 'Scullery' },
  { k: 'laundry', name: 'Laundry' },
  { k: 'study', name: 'Study' },
  { k: 'passage', name: 'Passage' },
  { k: '__rooms' },
  { k: 'balcony', name: 'Balcony' },
  { k: 'patio', name: 'Patio and braai area' },
  { k: 'garage', name: 'Garage' },
  { k: 'carport', name: 'Carport' },
  { k: 'front', name: 'Front garden' },
  { k: 'back', name: 'Back garden' },
  { k: 'pool', name: 'Pool' },
  { k: 'staff', name: 'Staff quarters' },
  { k: 'flatlet', name: 'Flatlet' },
];

export const PRESETS = {
  house: { bed: 3, bath: 1, ensuite: 1, wc: 0, spaces: ['entrance', 'lounge', 'dining', 'kitchen', 'scullery', 'passage', 'patio', 'garage', 'front', 'back'], extra: [] },
  townhouse: { bed: 2, bath: 1, ensuite: 1, wc: 1, spaces: ['lounge', 'dining', 'kitchen', 'passage', 'patio', 'garage', 'back'], extra: [] },
  flat: { bed: 2, bath: 2, ensuite: 0, wc: 0, spaces: ['open', 'kitchen', 'balcony'], extra: [] },
  studio: { bed: 0, bath: 1, ensuite: 0, wc: 0, spaces: ['open', 'kitchen'], extra: [] },
};
const PRESET_LABEL = { house: 'House', townhouse: 'Townhouse', flat: 'Flat or apartment', studio: 'Studio' };

/** Room names, in walking order, for a setup. */
export function namesFromSetup(cfg) {
  const out = [];
  SPACES.forEach((s) => {
    if (s.k === '__rooms') {
      for (let i = 1; i <= cfg.bed; i += 1) {
        out.push(i === 1 && cfg.bed > 1 ? 'Main bedroom' : cfg.bed === 1 ? 'Bedroom' : `Bedroom ${i}`);
        if (i <= cfg.ensuite) out.push(cfg.ensuite === 1 ? 'En-suite' : `En-suite ${i}`);
      }
      for (let i = 1; i <= cfg.bath; i += 1) out.push(cfg.bath === 1 ? 'Bathroom' : `Bathroom ${i}`);
      for (let i = 1; i <= cfg.wc; i += 1) out.push(cfg.wc === 1 ? 'Guest toilet' : `Guest toilet ${i}`);
      return;
    }
    if (cfg.spaces.includes(s.k)) out.push(s.name);
  });
  return [...out, ...cfg.extra];
}

/** Best guess at a setup from an existing room list (for editing older properties). */
export function setupFromNames(names) {
  const cfg = { bed: 0, bath: 0, ensuite: 0, wc: 0, spaces: [], extra: [] };
  names.forEach((raw) => {
    const n = raw.toLowerCase();
    const space = SPACES.find((s) => s.name && s.name.toLowerCase() === n);
    if (space) { cfg.spaces.push(space.k); return; }
    if (/en.?suite/.test(n)) cfg.ensuite += 1;
    else if (/guest toilet|^toilet|\bwc\b/.test(n)) cfg.wc += 1;
    else if (/bath/.test(n)) cfg.bath += 1;
    else if (/bed/.test(n)) cfg.bed += 1;
    else if (/^(lounge|living)/.test(n)) cfg.spaces.push('lounge');
    else if (/dining/.test(n)) cfg.spaces.push('dining');
    else if (/kitchen/.test(n)) cfg.spaces.push('kitchen');
    else if (/garage/.test(n)) cfg.spaces.push('garage');
    else if (/entrance/.test(n)) cfg.spaces.push('entrance');
    else cfg.extra.push(raw);
  });
  cfg.ensuite = Math.min(cfg.ensuite, cfg.bed);
  return cfg;
}

export function roomBuilderHTML(cfg) {
  return `<div class="rb" data-rb>
    <div class="rb-presets"><span class="label">Start from</span>${Object.keys(PRESETS).map((k) => `<button type="button" class="chip-btn" data-preset="${k}">${PRESET_LABEL[k]}</button>`).join('')}</div>
    <div class="rb-counts">${COUNTS.map((c) => `<div class="rb-count">
      <span><b>${c.label}</b>${c.hint ? `<small>${c.hint}</small>` : ''}</span>
      <div class="stepper"><button type="button" data-dec="${c.k}" aria-label="Fewer ${c.label.toLowerCase()}">−</button><output data-n="${c.k}">${cfg[c.k]}</output><button type="button" data-inc="${c.k}" aria-label="More ${c.label.toLowerCase()}">+</button></div>
    </div>`).join('')}</div>
    <div class="rb-spaces">${SPACES.filter((s) => s.name).map((s) => `<button type="button" class="chip-btn" data-space="${s.k}" aria-pressed="${cfg.spaces.includes(s.k)}">${esc(s.name)}</button>`).join('')}</div>
    <div class="rb-add"><input class="input" data-extra-in placeholder="Another room, e.g. Pantry or Cottage"><button type="button" class="btn btn--sm" data-extra-add>Add</button></div>
    <div class="rb-list"><span class="label" data-rb-sum></span><div class="rooms-check" data-rb-chips></div></div>
  </div>`;
}

/**
 * Makes a room builder interactive. Returns { names(), config() }.
 * onChange(names) runs after every change (for a live plan preview).
 */
export function mountRoomBuilder(root, cfg0, onChange = () => {}) {
  const cfg = JSON.parse(JSON.stringify(cfg0));
  const max = Object.fromEntries(COUNTS.map((c) => [c.k, c.max]));
  const paint = () => {
    COUNTS.forEach((c) => { root.querySelector(`[data-n="${c.k}"]`).textContent = cfg[c.k]; });
    root.querySelectorAll('[data-space]').forEach((b) => b.setAttribute('aria-pressed', String(cfg.spaces.includes(b.dataset.space))));
    const names = namesFromSetup(cfg);
    root.querySelector('[data-rb-sum]').textContent = `${names.length} room${names.length === 1 ? '' : 's'}, in walking order`;
    root.querySelector('[data-rb-chips]').innerHTML = names.map((n) => `<span class="room-chip">${esc(n)}${cfg.extra.includes(n) ? ` <button type="button" class="x" data-extra-rm="${esc(n)}" aria-label="Remove ${esc(n)}">×</button>` : ''}</span>`).join('');
    onChange(names);
  };
  const addExtra = () => {
    const inp = root.querySelector('[data-extra-in]');
    const v = inp.value.trim().replace(/^\w/, (c) => c.toUpperCase());
    if (v && !namesFromSetup(cfg).some((n) => n.toLowerCase() === v.toLowerCase())) cfg.extra.push(v);
    inp.value = '';
    paint();
  };
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.preset) Object.assign(cfg, JSON.parse(JSON.stringify(PRESETS[t.dataset.preset])), { extra: cfg.extra });
    else if (t.dataset.inc) {
      cfg[t.dataset.inc] = Math.min(max[t.dataset.inc], cfg[t.dataset.inc] + 1);
      if (t.dataset.inc === 'ensuite') cfg.ensuite = Math.min(cfg.ensuite, cfg.bed);
    } else if (t.dataset.dec) {
      cfg[t.dataset.dec] = Math.max(0, cfg[t.dataset.dec] - 1);
      cfg.ensuite = Math.min(cfg.ensuite, cfg.bed);
    } else if (t.dataset.space) {
      const k = t.dataset.space;
      cfg.spaces = cfg.spaces.includes(k) ? cfg.spaces.filter((x) => x !== k) : [...cfg.spaces, k];
    } else if (t.dataset.extraRm) cfg.extra = cfg.extra.filter((x) => x !== t.dataset.extraRm);
    else if (t.hasAttribute('data-extra-add')) { addExtra(); return; }
    else return;
    paint();
  });
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-extra-in]')) { e.preventDefault(); addExtra(); } });
  paint();
  return { names: () => namesFromSetup(cfg), config: () => JSON.parse(JSON.stringify(cfg)) };
}
