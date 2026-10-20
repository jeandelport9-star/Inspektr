// Inspektr – blueprint floor plan with finding pins.
// Plan units: 100 wide × 64 high. One unit ≈ 12 cm, so the plan is a ~12 m × 7.7 m footprint.

import { TEMPLATES } from './demo.js';
import { esc } from './ui.js';

export const PLAN_W = 100;
export const PLAN_H = 64;
const M_PER_UNIT = 0.12;
const PAD = 6; // margin inside the viewBox for dimensions and the north arrow

const NUM = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6' };
export function normRoom(name) {
  return String(name || '').toLowerCase()
    .replace(/\b(one|two|three|four|five|six)\b/g, (w) => NUM[w])
    .replace(/\b(the|room)\b/g, (w) => (w === 'room' ? 'room' : ''))
    .replace(/en suite|en-suite|ensuite/g, 'en-suite')
    .replace(/living room/g, 'lounge')
    .replace(/[^a-z0-9-]+/g, ' ')
    .trim();
}

export function roomsFor(property) {
  return property.rooms || TEMPLATES[property.template] || TEMPLATES.house3;
}

/** Finds the plan room matching a spoken room name, or null. */
export function matchRoom(property, name) {
  const rooms = roomsFor(property);
  const n = normRoom(name);
  if (!n) return null;
  return rooms.find((r) => normRoom(r.name) === n)
    || rooms.find((r) => normRoom(r.name).startsWith(n) || n.startsWith(normRoom(r.name)))
    || rooms.find((r) => n.split(' ').some((w) => w.length > 3 && normRoom(r.name).includes(w)))
    || null;
}

/** Plan coordinates for an item (its x/y are 0–1 inside its room). */
export function pinPos(room, item) {
  const x = room.x + 2.5 + (item.x ?? 0.5) * (room.w - 5);
  const y = room.y + 6 + (item.y ?? 0.5) * (room.h - 9);
  return { x, y };
}

/** Shortens a room label to fit its room width (about 1.3 plan units per character). */
function fitLabel(name, w) {
  const max = Math.max(4, Math.floor((w - 3) / 1.3));
  return name.length <= max ? name : `${name.slice(0, max - 1).trimEnd()}…`;
}

const PIN_GLYPH = { defect: '!', missing: '?', unrated: '?', note: 'i', inventory: '#' };

function pinClass(item) {
  if (item.kind === 'note') return 'note';
  if (item.kind === 'inventory' && item.condition === 'good') return 'inventory';
  return item.condition || 'unrated';
}

/**
 * Returns the plan SVG markup.
 * opts: { mini, draw, selectedId, filter:Set, activeRoom, doneRooms:Set, id }
 */
export function planSVG(property, items = [], opts = {}) {
  const rooms = roomsFor(property);
  const { mini = false, draw = false, selectedId = null, filter = null, activeRoom = null, doneRooms = null } = opts;
  const vb = mini ? `-1 -1 ${PLAN_W + 2} ${PLAN_H + 2}` : `${-PAD} ${-PAD} ${PLAN_W + PAD * 2} ${PLAN_H + PAD * 2}`;
  const uid = opts.id || `p${Math.random().toString(36).slice(2, 7)}`;

  const grid = mini ? '' : `
    <defs>
      <pattern id="${uid}-g" width="2.5" height="2.5" patternUnits="userSpaceOnUse"><path d="M2.5 0H0V2.5" class="grid-minor" fill="none" stroke-width=".1"/></pattern>
      <pattern id="${uid}-G" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="url(#${uid}-g)"/><path d="M10 0H0V10" class="grid-major" fill="none" stroke-width=".15"/></pattern>
    </defs>
    <rect x="${-PAD}" y="${-PAD}" width="${PLAN_W + PAD * 2}" height="${PLAN_H + PAD * 2}" fill="url(#${uid}-G)"/>`;

  const roomEls = rooms.map((r) => {
    const area = (r.w * M_PER_UNIT * r.h * M_PER_UNIT).toFixed(1);
    const active = activeRoom && normRoom(activeRoom) === normRoom(r.name);
    const done = doneRooms && doneRooms.has(normRoom(r.name));
    const label = mini ? '' : `
      <text class="room-name" x="${r.x + 2.2}" y="${r.y + 3.6}">${esc(fitLabel(r.name, r.w))}</text>
      <text class="room-area" x="${r.x + 2.2}" y="${r.y + 5.6}">${area} m²</text>`;
    return `<g class="room${active ? ' is-active' : ''}${done ? ' is-done' : ''}" data-room="${esc(r.name)}">
      <rect class="room-fill" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>
      <rect class="wall" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" pathLength="220"/>
      ${label}
    </g>`;
  }).join('');

  const dims = mini ? '' : `
    <g class="dims">
      <line class="dim" x1="0" y1="-2.6" x2="${PLAN_W}" y2="-2.6"/>
      <line class="dim" x1="0" y1="-3.6" x2="0" y2="-1.6"/><line class="dim" x1="${PLAN_W}" y1="-3.6" x2="${PLAN_W}" y2="-1.6"/>
      <text class="dim-text" x="${PLAN_W / 2}" y="-3.4" text-anchor="middle">${(PLAN_W * M_PER_UNIT).toFixed(1)} m</text>
      <line class="dim" x1="-2.6" y1="0" x2="-2.6" y2="${PLAN_H}"/>
      <line class="dim" x1="-3.6" y1="0" x2="-1.6" y2="0"/><line class="dim" x1="-3.6" y1="${PLAN_H}" x2="-1.6" y2="${PLAN_H}"/>
      <text class="dim-text" transform="translate(-3.4 ${PLAN_H / 2}) rotate(-90)" text-anchor="middle">${(PLAN_H * M_PER_UNIT).toFixed(1)} m</text>
    </g>
    <g class="north" transform="translate(${PLAN_W + 2.6} ${PLAN_H - 6})">
      <path d="M0 -3.4 L1.3 0.6 L0 -0.2 L-1.3 0.6 Z"/>
      <text y="3.4" text-anchor="middle">N</text>
    </g>`;

  let n = 0;
  const pins = items.map((it) => {
    if (it.std || it.x == null) return '';
    const room = matchRoom(property, it.room);
    if (!room) return '';
    const { x, y } = pinPos(room, it);
    const cls = pinClass(it);
    const dim = filter && !filter.has(cls === 'inventory' || cls === 'note' ? cls : it.condition) ? ' is-dim' : '';
    const sel = selectedId === it.id ? ' is-selected' : '';
    const r = mini ? 2.2 : 1.7;
    const glyph = !mini && PIN_GLYPH[cls] ? `<text class="pin-glyph" x="${x}" y="${y + 0.68}" text-anchor="middle">${PIN_GLYPH[cls]}</text>` : '';
    n += 1;
    return `<g class="pin pin--${cls}${dim}${sel}" data-id="${esc(it.id)}" style="--d:${n}" tabindex="${mini ? -1 : 0}" role="button" aria-label="${esc(`${it.name}, ${it.condition}, ${it.room}`)}">
      <circle class="pin-hit" cx="${x}" cy="${y}" r="${mini ? 0 : 3.6}"/>
      <circle class="pin-ring" cx="${x}" cy="${y}" r="1.9"/>
      ${sel ? `<circle class="pin-sel" cx="${x}" cy="${y}" r="3"/>` : ''}
      <circle class="pin-dot" cx="${x}" cy="${y}" r="${r}"/>
      ${glyph}
    </g>`;
  }).join('');

  const outer = `<rect class="outer" x="0" y="0" width="${PLAN_W}" height="${PLAN_H}" pathLength="220"/>`;

  return `<svg class="plan${draw ? ' plan--draw' : ''}" viewBox="${vb}" role="img" aria-label="Floor plan of ${esc(property.name)} with ${items.length} pinned findings" data-plan="${uid}">
    ${grid}${roomEls}${outer}${dims}<g class="pins">${pins}</g>
  </svg>`;
}

/** Items whose room is not on the plan. */
export function unplacedItems(property, items) {
  return items.filter((it) => !it.std && it.x != null && !matchRoom(property, it.room));
}

/** Converts a pointer event to plan coordinates. */
export function eventToPlan(svg, evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX; pt.y = evt.clientY;
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = pt.matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

/** Which room contains a plan point. */
export function roomAt(property, x, y) {
  return roomsFor(property).find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) || null;
}

/** Inverse of pinPos – plan point to 0–1 inside a room. */
export function toRoomXY(room, x, y) {
  const cx = Math.min(1, Math.max(0, (x - room.x - 2.5) / (room.w - 5)));
  const cy = Math.min(1, Math.max(0, (y - room.y - 6) / (room.h - 9)));
  return { x: +cx.toFixed(3), y: +cy.toFixed(3) };
}

/** Spreads new pins inside a room so they don't stack. */
export function autoSpot(index) {
  const cols = 3;
  const col = index % cols;
  const row = Math.floor(index / cols) % 3;
  const jitter = () => (Math.random() - 0.5) * 0.08;
  return { x: +(0.18 + col * 0.32 + jitter()).toFixed(3), y: +(0.2 + row * 0.3 + jitter()).toFixed(3) };
}
