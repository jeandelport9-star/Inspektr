// Inspektr – demo portfolio so the app looks alive on first open.
import { standardItems, isTestable, KEYS_AND_METERS } from './vocab.js';
// Photos are drawn as small SVG scenes; real inspections use camera stills.

const WALLS = ['#d9d3c7', '#cfd6d8', '#e2dccf', '#c9cfc4', '#ddd5cc', '#d3d8de'];

/** Draws a stylised "site photo" for demo findings. Returns a data URI. */
export function demoArt(kind = 'item', seed = 1) {
  const wall = WALLS[seed % WALLS.length];
  const floor = ['#8a6f55', '#9b9b95', '#7c6a5a', '#a08a70'][seed % 4];
  let subject = '';
  switch (kind) {
    case 'crack':
      subject = `<path d="M150 20 l-14 34 l18 22 l-22 30 l12 26 l-16 40" fill="none" stroke="#3b3530" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
                 <path d="M154 76 l22 10 l8 18" fill="none" stroke="#3b3530" stroke-width="2"/>`;
      break;
    case 'leak':
      subject = `<rect x="92" y="54" width="120" height="16" rx="6" fill="#9aa4ab"/>
                 <rect x="140" y="30" width="22" height="30" rx="4" fill="#b8c0c6"/>
                 <path d="M196 70 q10 0 10 14" fill="none" stroke="#9aa4ab" stroke-width="10" stroke-linecap="round"/>
                 <path d="M206 100 q-6 10 0 16 q6 -6 0 -16z" fill="#4aa3df"/>
                 <path d="M206 128 q-5 8 0 13 q5 -5 0 -13z" fill="#4aa3df" opacity=".7"/>
                 <ellipse cx="206" cy="172" rx="34" ry="6" fill="#4aa3df" opacity=".35"/>`;
      break;
    case 'stain':
      subject = `<path d="M110 40 c40 -16 90 4 92 40 c2 34 -40 54 -78 46 c-36 -8 -50 -70 -14 -86z" fill="#8c7a4e" opacity=".42"/>
                 <path d="M126 58 c22 -8 52 2 54 22 c0 20 -24 30 -46 24 c-20 -6 -28 -38 -8 -46z" fill="#6e5d34" opacity=".35"/>`;
      break;
    case 'scratch':
      subject = `<rect x="70" y="96" width="160" height="70" rx="6" fill="#7a5a3c"/>
                 <path d="M96 118 l70 16 M104 130 l58 13 M180 112 l26 30" stroke="#d9c6ad" stroke-width="2.5" stroke-linecap="round"/>`;
      break;
    case 'tile':
      subject = `<g stroke="#9d9a92" stroke-width="2">${Array.from({ length: 6 }, (_, i) => `<line x1="${40 + i * 44}" y1="20" x2="${40 + i * 44}" y2="180"/>`).join('')}${Array.from({ length: 4 }, (_, i) => `<line x1="20" y1="${40 + i * 44}" x2="300" y2="${40 + i * 44}"/>`).join('')}</g>
                 <path d="M128 84 l14 12 l-8 16 l16 10" fill="none" stroke="#3b3530" stroke-width="2.5"/>`;
      break;
    case 'window':
      subject = `<rect x="88" y="26" width="140" height="110" fill="#bcd6e6" stroke="#f2f2ee" stroke-width="10"/>
                 <line x1="158" y1="26" x2="158" y2="136" stroke="#f2f2ee" stroke-width="8"/>
                 <path d="M100 40 l40 50 M120 36 l-6 40 M100 80 l50 -10" stroke="#ffffff" stroke-width="2" opacity=".9"/>`;
      break;
    case 'door':
      subject = `<rect x="118" y="14" width="86" height="170" fill="#a47c56" stroke="#e9e3d8" stroke-width="8"/>
                 <circle cx="190" cy="104" r="6" fill="#d6c27a"/>`;
      break;
    case 'couch':
      subject = `<rect x="70" y="92" width="180" height="58" rx="14" fill="#5d6873"/>
                 <rect x="82" y="72" width="156" height="40" rx="12" fill="#6f7b86"/>
                 <rect x="60" y="100" width="24" height="56" rx="10" fill="#56606a"/>
                 <rect x="236" y="100" width="24" height="56" rx="10" fill="#56606a"/>`;
      break;
    case 'stove':
      subject = `<rect x="96" y="60" width="128" height="120" rx="6" fill="#e4e6e8" stroke="#b6bbbf" stroke-width="3"/>
                 <rect x="110" y="104" width="100" height="62" rx="4" fill="#2f3a44"/>
                 ${[0, 1, 2, 3].map((i) => `<circle cx="${122 + i * 26}" cy="78" r="9" fill="#3a434c"/>`).join('')}`;
      break;
    case 'meter':
      subject = `<rect x="104" y="44" width="112" height="112" rx="10" fill="#e9ecee" stroke="#9aa4ab" stroke-width="4"/>
                 <rect x="122" y="80" width="76" height="26" rx="3" fill="#1d2a33"/>
                 <text x="160" y="99" font-family="monospace" font-size="16" fill="#7cf0b4" text-anchor="middle">04812</text>`;
      break;
    default:
      subject = `<rect x="96" y="70" width="128" height="96" rx="8" fill="#7d8790"/>
                 <rect x="110" y="84" width="100" height="40" rx="4" fill="#9aa3ab"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">
    <defs>
      <linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${wall}"/><stop offset="1" stop-color="${shade(wall, -18)}"/></linearGradient>
      <radialGradient id="v" cx=".5" cy=".45" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></radialGradient>
    </defs>
    <rect width="320" height="200" fill="url(#w)"/>
    <rect y="172" width="320" height="28" fill="${floor}"/>
    ${subject}
    <rect width="320" height="200" fill="url(#v)"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, '0')).join('')}`;
}

// ---------- Floor-plan templates (plan units: 100 wide × 64 high) ----------
export const TEMPLATES = {
  house3: [
    { name: 'Lounge', x: 0, y: 0, w: 38, h: 30 },
    { name: 'Kitchen', x: 38, y: 0, w: 26, h: 30 },
    { name: 'Dining room', x: 64, y: 0, w: 36, h: 30 },
    { name: 'Bedroom 1', x: 0, y: 30, w: 30, h: 34 },
    { name: 'Bathroom', x: 30, y: 30, w: 18, h: 34 },
    { name: 'Bedroom 2', x: 48, y: 30, w: 26, h: 34 },
    { name: 'Bedroom 3', x: 74, y: 30, w: 26, h: 34 },
  ],
  flat2: [
    { name: 'Lounge', x: 0, y: 0, w: 46, h: 34 },
    { name: 'Kitchen', x: 46, y: 0, w: 26, h: 34 },
    { name: 'Balcony', x: 72, y: 0, w: 28, h: 20 },
    { name: 'Bathroom', x: 72, y: 20, w: 28, h: 14 },
    { name: 'Bedroom 1', x: 0, y: 34, w: 50, h: 30 },
    { name: 'Bedroom 2', x: 50, y: 34, w: 50, h: 30 },
  ],
  flat1: [
    { name: 'Open-plan living', x: 0, y: 0, w: 60, h: 64 },
    { name: 'Bedroom', x: 60, y: 0, w: 40, h: 40 },
    { name: 'Bathroom', x: 60, y: 40, w: 40, h: 24 },
  ],
  townhouse: [
    { name: 'Lounge', x: 0, y: 0, w: 40, h: 32 },
    { name: 'Kitchen', x: 40, y: 0, w: 30, h: 32 },
    { name: 'Garage', x: 70, y: 0, w: 30, h: 32 },
    { name: 'Main bedroom', x: 0, y: 32, w: 40, h: 32 },
    { name: 'En-suite', x: 40, y: 32, w: 20, h: 32 },
    { name: 'Bedroom 2', x: 60, y: 32, w: 40, h: 32 },
  ],
};

export const TEMPLATE_LABELS = {
  house3: '3-bedroom house',
  flat2: '2-bedroom flat',
  flat1: '1-bedroom flat',
  townhouse: 'Townhouse',
};

// ---------- Demo portfolio ----------
const it = (room, name, condition, text, art, t, x, y, extra = {}) => ({
  id: `d_${room}_${name}_${t}`.replace(/\W+/g, '_').toLowerCase(),
  room, name, kind: 'item', qty: 1, condition, text, art, t, x, y,
  confidence: 0.96, decision: 'accepted', ...extra,
});
const inv = (room, name, qty, condition, text, art, t, x, y, extra = {}) =>
  it(room, name, condition, text, art, t, x, y, { kind: 'inventory', qty, ...extra });

export function demoState() {
  const properties = [
    {
      id: 'p_lynnwood', name: '12 Jacaranda Lane', suburb: 'Lynnwood, Pretoria', lat: -25.7663, lng: 28.2735,
      template: 'house3', furnished: false, tenant: 'Thandi Mokoena', owner: 'R. Pieterse', nextDue: '2026-11-03',
    },
    {
      id: 'p_hatfield', name: 'Unit 304, The Arches', suburb: 'Hatfield, Pretoria', lat: -25.7489, lng: 28.2385,
      template: 'flat2', furnished: true, tenant: 'Kabelo Dlamini', owner: 'Arches Body Corporate', nextDue: '2026-10-31',
    },
    {
      id: 'p_brooklyn', name: '7 Bronkhorst Mews', suburb: 'Brooklyn, Pretoria', lat: -25.7712, lng: 28.2361,
      template: 'townhouse', furnished: false, tenant: 'Megan van Wyk', owner: 'M. Naidoo', nextDue: '2026-12-15',
    },
    {
      id: 'p_garsfontein', name: '41 Rubida Street', suburb: 'Garsfontein, Pretoria', lat: -25.7928, lng: 28.2985,
      template: 'house3', furnished: false, tenant: 'Johan & Elmarie Botha', owner: 'L. Khumalo', nextDue: '2027-01-20',
    },
    {
      id: 'p_centurion', name: 'Unit 12, Eldo Lakes', suburb: 'Centurion', lat: -25.8662, lng: 28.1729,
      template: 'flat1', furnished: true, tenant: 'Short-term guests', owner: 'S. Mahlangu', nextDue: '2026-10-24',
    },
  ];

  const at = (date, time = '09:00') => `${date}T${time}:00+02:00`;
  const inspections = [
    {
      id: 'i_lyn_in', propertyId: 'p_lynnwood', type: 'ingoing', date: '2026-03-02', startedAt: at('2026-03-02', '09:30'), inspector: 'J. Delport',
      status: 'signed', durationSec: 1284, signatures: { tenant: true, owner: true, tenantName: 'Thandi Mokoena', ownerName: 'J. Delport' },
      comments: { agent: 'Property handed over freshly painted. Garden service included in rental.' },
      items: [
        it('Lounge', 'Walls', 'good', 'Walls freshly painted, no marks', 'item', 42, 0.3, 0.4),
        it('Lounge', 'Doors', 'good', 'Sliding door runs smoothly, lock works', 'door', 71, 0.8, 0.2),
        it('Kitchen', 'Stove Or Hob', 'good', 'Stove, four plates, all working, oven clean', 'stove', 188, 0.5, 0.3),
        it('Kitchen', 'Taps', 'good', 'Tap at the sink fine, no drip', 'leak', 214, 0.2, 0.7),
        it('Bedroom 1', 'Cupboards', 'fair', 'Built-in cupboards, one hinge loose on the left door', 'door', 455, 0.25, 0.35, { damage: 'Wear & Tear', action: 'Landlord to repair' }),
        it('Bathroom', 'Floors', 'good', 'Floor tiles intact', 'tile', 540, 0.5, 0.6),
        it('Bedroom 2', 'Windows', 'good', 'Windows and burglar bars in good order', 'window', 610, 0.7, 0.15),
        it('Lounge', 'Prepaid Electricity Meter', 'good', 'Reading 04812 units', 'meter', 1201, 0.08, 0.85, { kind: 'meter' }),
        it('Lounge', 'Keys', 'good', '2 front door keys, 1 security gate key, 1 gate remote', 'door', 1230, 0.1, 0.8, { kind: 'meter' }),
      ],
    },
    {
      id: 'i_lyn_routine', propertyId: 'p_lynnwood', type: 'routine', date: '2026-09-14', startedAt: at('2026-09-14', '10:00'), inspector: 'J. Delport',
      status: 'signed', durationSec: 846, linkedId: 'i_lyn_in', signatures: { tenant: true, owner: true, tenantName: 'Thandi Mokoena', ownerName: 'J. Delport' },
      comments: { agent: 'Tenant keeps the property neat. Three items reported to the landlord.', tenant: 'The tap has been dripping for about two weeks.' },
      items: [
        it('Kitchen', 'Taps', 'defect', 'Tap at the sink is dripping, washer needs replacing', 'leak', 166, 0.22, 0.68, { func: 'Faulty', action: 'Landlord to repair', job: { status: 'quoted', trade: 'Plumbing' } }),
        it('Bathroom', 'Ceiling', 'defect', 'Damp stain on the ceiling above the shower', 'stain', 402, 0.6, 0.25, { clean: 'Stained', damage: 'Damaged', action: 'Landlord to repair', job: { status: 'approval', trade: 'Waterproofing' } }),
        it('Bedroom 2', 'Walls', 'defect', 'Crack in the wall next to the window, about forty centimetres', 'crack', 571, 0.82, 0.42, { damage: 'Cracked', action: 'Landlord to repair', job: { status: 'approval', trade: 'Building' } }),
        it('Lounge', 'Walls', 'fair', '2 nails, some scuff marks behind the couch', 'item', 40, 0.3, 0.4, { damage: 'Wear & Tear' }),
        it('Bedroom 1', 'Cupboards', 'fair', 'Cupboard hinge still loose, tenant aware', 'door', 488, 0.25, 0.35, { damage: 'Wear & Tear', action: 'Landlord to repair' }),
        it('Bedroom 1', 'Lights', 'defect', 'Bulb blown x1', 'item', 470, 0.6, 0.2, { func: 'Faulty', action: 'Tenant to replace' }),
      ],
    },
    {
      id: 'i_hat_in', propertyId: 'p_hatfield', type: 'ingoing', date: '2025-11-01', startedAt: at('2025-11-01', '08:30'), inspector: 'J. Delport',
      status: 'signed', durationSec: 1530, signatures: { tenant: true, owner: true, tenantName: 'Kabelo Dlamini', ownerName: 'J. Delport' },
      items: [
        inv('Lounge', 'Couch', 1, 'good', 'Three-seater couch, grey, good', 'couch', 60, 0.35, 0.5),
        inv('Lounge', 'Bar stools', 2, 'fair', 'Two bar stools, oak, one scratched', 'scratch', 92, 0.85, 0.7, { damage: 'Wear & Tear' }),
        inv('Kitchen', 'Dining chairs', 4, 'good', 'Four dining chairs, black', 'item', 205, 0.5, 0.6),
        it('Kitchen', 'Oven', 'good', 'Oven clean, light and fan working', 'stove', 230, 0.3, 0.25),
        it('Balcony', 'Doors', 'good', 'Balcony slider locks', 'door', 340, 0.5, 0.5),
        it('Bathroom', 'Shower', 'good', 'Shower tiles and grout clean', 'tile', 420, 0.5, 0.5),
        inv('Bedroom 1', 'Double bed', 1, 'good', 'Double bed with mattress', 'item', 610, 0.5, 0.45),
        inv('Bedroom 2', 'Desk', 1, 'good', 'Desk and chair', 'item', 790, 0.6, 0.4),
        it('Lounge', 'Keys', 'good', '1 front door key, 1 access tag, 1 remote', 'door', 1490, 0.1, 0.9, { kind: 'meter' }),
      ],
    },
    {
      id: 'i_hat_out', propertyId: 'p_hatfield', type: 'outgoing', date: '2026-10-15', startedAt: at('2026-10-15', '11:00'), inspector: 'J. Delport',
      status: 'signed', durationSec: 1390, linkedId: 'i_hat_in', signatures: { tenant: true, owner: true, tenantName: 'Kabelo Dlamini', ownerName: 'J. Delport' },
      comments: { agent: 'Unit left mostly clean. Deductions agreed with the tenant on site.', tenant: 'I will return the second bar stool by Friday.' },
      items: [
        inv('Lounge', 'Couch', 1, 'fair', 'Couch stained on the left seat, needs professional cleaning', 'couch', 55, 0.35, 0.5, { clean: 'Stained', damage: 'Undamaged', action: 'Tenant to clean', cost: '450' }),
        inv('Lounge', 'Bar stools', 1, 'missing', 'Only one bar stool, second one missing', 'scratch', 90, 0.85, 0.7, { damage: 'Missing', action: 'Tenant to replace', cost: '900' }),
        inv('Kitchen', 'Dining chairs', 4, 'good', 'Four dining chairs, all there', 'item', 200, 0.5, 0.6),
        it('Kitchen', 'Oven', 'fair', 'Oven dirty, grease on the racks', 'stove', 226, 0.3, 0.25, { clean: 'Dirty', damage: 'Undamaged', func: 'Working', action: 'Tenant to clean', cost: '250' }),
        it('Bedroom 1', 'Walls', 'defect', 'Nails in walls x6, 2 holes above the bed', 'item', 640, 0.4, 0.3, { damage: 'Damaged', action: 'Tenant to repair', cost: '350' }),
        it('Bathroom', 'Shower', 'fair', 'Soap holder rusted', 'tile', 430, 0.5, 0.5, { clean: 'Rusted', damage: 'Wear & Tear', func: 'Working' }),
        inv('Bedroom 1', 'Double bed', 1, 'good', 'Double bed with mattress', 'item', 600, 0.5, 0.45),
        inv('Bedroom 2', 'Desk', 1, 'good', 'Desk and chair', 'item', 780, 0.6, 0.4),
        it('Lounge', 'Keys', 'good', '1 front door key, 1 access tag, 1 remote returned', 'door', 1360, 0.1, 0.9, { kind: 'meter' }),
      ],
    },
    {
      id: 'i_bro_routine', propertyId: 'p_brooklyn', type: 'routine', date: '2026-06-10', startedAt: at('2026-06-10', '14:00'), inspector: 'J. Delport',
      status: 'signed', durationSec: 702, signatures: { tenant: true, owner: true, tenantName: 'Megan van Wyk', ownerName: 'J. Delport' },
      items: [
        it('Lounge', 'Walls', 'good', 'Walls good', 'item', 30, 0.4, 0.4),
        it('Kitchen', 'Stove Or Hob', 'good', 'Stove working', 'stove', 120, 0.5, 0.3),
        it('Garage', 'Garage Door Motor', 'good', 'Garage motor and remotes work', 'door', 260, 0.5, 0.5),
        it('En-suite', 'Washing Basin', 'good', 'Basin and tap fine', 'leak', 410, 0.5, 0.4),
      ],
    },
    {
      id: 'i_gar_routine', propertyId: 'p_garsfontein', type: 'routine', date: '2026-08-21', startedAt: at('2026-08-21', '09:15'), inspector: 'J. Delport',
      status: 'signed', durationSec: 910, signatures: { tenant: true, owner: true, tenantName: 'Johan Botha', ownerName: 'J. Delport' },
      items: [
        it('Bathroom', 'Floors', 'defect', 'Cracked floor tile in front of the toilet', 'tile', 380, 0.45, 0.7, { damage: 'Cracked', action: 'Landlord to repair', job: { status: 'done', trade: 'Tiling', approvedAt: '2026-08-22', doneAt: '2026-09-02', chosen: { name: 'TileCraft Pretoria', price: 650 } } }),
        it('Lounge', 'Windows', 'defect', 'Lounge window pane cracked in the corner', 'window', 75, 0.15, 0.1, { damage: 'Cracked', action: 'Landlord to repair', job: { status: 'open', trade: 'Glazing', approvedAt: '2026-08-25' } }),
        it('Kitchen', 'Stove Or Hob', 'good', 'Stove fine', 'stove', 190, 0.5, 0.3),
      ],
    },
    {
      id: 'i_cen_inv', propertyId: 'p_centurion', type: 'inventory', date: '2026-10-01', startedAt: at('2026-10-01', '12:00'), inspector: 'J. Delport',
      status: 'signed', durationSec: 640, signatures: { tenant: false, owner: true, ownerName: 'J. Delport' }, tenantPresent: false,
      items: [
        inv('Open-plan living', 'Couch', 1, 'good', 'Two-seater couch, cream', 'couch', 40, 0.3, 0.3),
        inv('Open-plan living', 'Dining chairs', 4, 'good', 'Four dining chairs', 'item', 75, 0.7, 0.6),
        inv('Open-plan living', 'Television', 1, 'good', 'Samsung TV with remote', 'item', 110, 0.15, 0.7),
        inv('Bedroom', 'Queen bed', 1, 'good', 'Queen bed, linen set of two', 'item', 260, 0.5, 0.5),
        inv('Bathroom', 'Towels', 6, 'good', 'Six towels, white', 'item', 330, 0.5, 0.5),
      ],
    },
  ];

  // Fill each inspected room's standard checklist so demo reports read like full SA reports.
  inspections.forEach((ins) => {
    if (ins.type === 'inventory') return;
    const prop = properties.find((pp) => pp.id === ins.propertyId);
    const rooms = TEMPLATES[prop.template].map((r) => r.name);
    rooms.forEach((room, ri) => {
      standardItems(room).forEach((name, ni) => {
        if (KEYS_AND_METERS.has(name)) return;
        if (ins.items.some((x) => x.room === room && x.name === name)) return;
        const testable = isTestable(name);
        ins.items.push({
          id: `s_${ins.id}_${ri}_${ni}`, room, name, kind: 'item', qty: 1, condition: 'good', text: '',
          clean: 'Clean', damage: 'Undamaged', func: testable ? 'Working' : null, t: null, x: null, y: null,
          confidence: 1, decision: 'accepted', std: true,
        });
      });
    });
    ins.finalized = true;
  });

  return { version: 3, inspector: 'J. Delport', properties, inspections, history: demoHistory(), plans: demoPlans() };
}


// ---------- Demo history for the dashboard (summaries of past inspections) ----------
const DEFECT_POOL = [
  ['Walls', 9], ['Lights', 8], ['Taps', 7], ['Locks And Keys', 6], ['Floors', 5], ['Ceiling', 5],
  ['Electrical Sockets', 4], ['Doors', 4], ['Curtains And Blinds', 3], ['Extractor Fan', 3], ['Toilet', 2], ['Garage Door Motor', 2],
];
function rng(seed) { let x = seed; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; }
export function demoHistory() {
  const r = rng(42);
  const pickDefect = () => {
    const total = DEFECT_POOL.reduce((a, [, w]) => a + w, 0);
    let n = r() * total;
    for (const [name, w] of DEFECT_POOL) { n -= w; if (n <= 0) return name; }
    return 'Walls';
  };
  const props = ['p_lynnwood', 'p_hatfield', 'p_brooklyn', 'p_garsfontein', 'p_centurion'];
  const types = ['routine', 'routine', 'ingoing', 'outgoing', 'routine', 'inventory'];
  const out = [];
  const now = new Date();
  for (let m = 11; m >= 0; m -= 1) {
    const count = 3 + Math.floor(r() * 6) + (m < 4 ? 2 : 0);
    for (let k = 0; k < count; k += 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1 + Math.floor(r() * 27));
      if (d > now) continue;
      const type = types[Math.floor(r() * types.length)];
      const defects = type === 'inventory' ? [] : Array.from({ length: Math.floor(r() * (type === 'outgoing' ? 6 : 4)) }, pickDefect);
      out.push({
        date: d.toISOString().slice(0, 10), type, propertyId: props[Math.floor(r() * props.length)],
        durationSec: 600 + Math.floor(r() * 1500), findings: 40 + Math.floor(r() * 60), defects,
      });
    }
  }
  return out;
}

export function demoPlans() {
  const d = (days) => { const x = new Date(); x.setDate(x.getDate() + days); return x.toISOString().slice(0, 10); };
  return [
    { id: 'pl_1', propertyId: 'p_centurion', type: 'inventory', date: d(1), time: '10:00', remind: 60, notes: 'New guests arrive Saturday, check linen count.' },
    { id: 'pl_2', propertyId: 'p_hatfield', type: 'ingoing', date: d(3), time: '09:00', remind: 1440, notes: 'New tenant. Meet at the gate, collect access tag from body corporate.' },
    { id: 'pl_3', propertyId: 'p_lynnwood', type: 'routine', date: d(9), time: '14:30', remind: 60, notes: 'Check bathroom ceiling after waterproofing.' },
  ];
}
