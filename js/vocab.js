// Inspektr – South African inspection vocabulary.
// Built from real ingoing, outgoing and interim reports: standard checklists per room,
// the three rating dimensions (cleanliness, damage, function) and responsibility tags.

export const CLEAN = ['Clean', 'Dusty', 'Dirty', 'Stained', 'Rusted'];
export const DAMAGE = ['Undamaged', 'Wear & Tear', 'Damaged', 'Cracked', 'Missing'];
export const FUNC = ['Working', 'Faulty', 'Unable to test'];
export const ACTIONS = [
  'Landlord to repair', 'Landlord to replace', 'Landlord to clean',
  'Tenant to repair', 'Tenant to replace', 'Tenant to clean',
];

// ---------- Standard checklists ----------
const COMMON = ['Ceiling', 'Lights', 'Walls', 'Light Switches', 'Electrical Sockets', 'Windows', 'Curtains And Blinds', 'Doors', 'Locks And Keys', 'Floors'];
const KITCHEN = ['Cupboards Inside', 'Cupboards Outside', 'Cupboard Tops', 'Stove Or Hob', 'Oven', 'Oven Racks And Pans', 'Extractor Fan', 'Sink', 'Taps', 'Water Pipes And Outlets'];
const BATH = ['Toilet', 'Washing Basin', 'Bath', 'Shower', 'Taps', 'Mirrors', 'Towel Rails', 'Extractor Fan'];
const TOILET = ['Toilet', 'Washing Basin', 'Taps', 'Mirrors', 'Towel Rails'];
const GARAGE = ['Ceiling', 'Lights', 'Walls', 'Light Switches', 'Electrical Sockets', 'Windows', 'Doors', 'Locks And Keys', 'Floors', 'Garage Doors', 'Garage Door Motor'];
const OUTSIDE = ['House Walls', 'Lights', 'Paving', 'Garden', 'Lawn', 'Irrigation', 'Boundary Walls', 'Gates', 'Roof', 'Gutters And Down Pipes'];
const BALCONY = ['Floors', 'Walls', 'Lights', 'Railings', 'Doors'];
const POOL = ['Pool Structure', 'Pool Pump', 'Filter', 'Chlorinator', 'Pool Cleaner', 'Pool Light', 'Nets And Covers'];
const KEYS = ['Keys', 'Remotes', 'Prepaid Electricity Meter', 'Water Meter'];

/** Standard item names for a room, by its name. */
export function standardItems(roomName = '') {
  const r = roomName.toLowerCase();
  if (/keys|meter/.test(r)) return KEYS;
  if (/pool/.test(r)) return POOL;
  if (/yard|garden|outside|court/.test(r)) return OUTSIDE;
  if (/balcony|patio|stoep|braai|entertain/.test(r)) return BALCONY;
  if (/garage/.test(r)) return GARAGE;
  if (/kitchen|scullery/.test(r)) return [...COMMON, ...KITCHEN];
  if (/toilet|wc/.test(r)) return [...COMMON, ...TOILET];
  if (/bath|en-?suite|shower/.test(r)) return [...COMMON, ...BATH];
  if (/bed/.test(r)) return [...COMMON, 'Cupboards'];
  if (/open-plan/.test(r)) return [...COMMON, ...KITCHEN];
  return COMMON;
}

/** Items that can be tested, so they get Working / Faulty. */
const FUNC_RE = /light|bulb|globe|switch|socket|window|curtain|blind|door|lock|stove|hob|oven|extractor|tap|toilet|shower|bath|garage|motor|gate|irrigation|aircon|pump|filter|chlorinator|cleaner|geyser|alarm|remote|meter|cupboard|drawer|basin|sink|fan|intercom/i;
export const isTestable = (name) => FUNC_RE.test(name);
export const KEYS_AND_METERS = new Set(KEYS);

// ---------- Spoken phrase → standard item name ----------
// The earliest keyword in the phrase wins, so "tap at the sink is dripping" → Taps.
const ITEM_WORDS = [
  [/\blight switch(es)?\b|\bswitch(es)?\b/, 'Light Switches'],
  [/\bplug( point)?s?\b|\bsockets?\b|\bpower points?\b/, 'Electrical Sockets'],
  [/\bcurtains?\b|\bblinds?\b|\bshutters?\b|\bcurtain rails?\b/, 'Curtains And Blinds'],
  [/\bgarage doors?\b/, 'Garage Doors'],
  [/\bgate motor\b|\bgarage (door )?motor\b|\bmotor\b/, 'Garage Door Motor'],
  [/\blocks?\b|\bkeys?\b(?! (and|&) meters)|\bhandles?\b|\bstriker plate\b/, 'Locks And Keys'],
  [/\bstove\b|\bhob\b|\bplates?\b/, 'Stove Or Hob'],
  [/\boven racks?\b|\boven pans?\b|\bracks? and pans\b/, 'Oven Racks And Pans'],
  [/\boven\b/, 'Oven'],
  [/\bextractor( fan)?\b/, 'Extractor Fan'],
  [/\bcounter ?tops?\b|\bcupboard tops?\b|\bworktops?\b|\bgranite\b/, 'Cupboard Tops'],
  [/\bcupboards?\b|\bdrawers?\b|\bbuilt-?ins?\b|\bwardrobes?\b|\bbics?\b/, 'Cupboards'],
  [/\bwashing basin\b|\bbasin\b|\bvanity\b/, 'Washing Basin'],
  [/\btaps?\b|\bmixer\b/, 'Taps'],
  [/\bsink\b/, 'Sink'],
  [/\btoilet\b|\bloo\b|\bcistern\b|\bseat cover\b/, 'Toilet'],
  [/\bshower\b|\bsoap holder\b/, 'Shower'],
  [/\bbath\b/, 'Bath'],
  [/\bmirrors?\b/, 'Mirrors'],
  [/\btowel rails?\b|\btowel hooks?\b/, 'Towel Rails'],
  [/\bgeyser\b/, 'Geyser'],
  [/\baircon\b|\bair conditioner\b/, 'Aircon'],
  [/\bceiling\b|\bcornices?\b|\bcornis\b/, 'Ceiling'],
  [/\blights?\b|\bglobes?\b|\bbulbs?\b|\bdown ?lights?\b|\blight fittings?\b/, 'Lights'],
  [/\bwindows?\b|\bwindow panes?\b|\bglass\b|\bburglar bars?\b/, 'Windows'],
  [/\bdoors?\b|\bdoor frames?\b|\bsafety gate\b/, 'Doors'],
  [/\bfloors?\b|\btiles?\b|\bgrout\b|\bcarpets?\b|\blaminate\b|\bskirting\b/, 'Floors'],
  [/\bhouse walls?\b|\boutside walls?\b|\bwashing line\b/, 'House Walls'],
  [/\bboundary walls?\b|\bpalisade\b|\bperimeter wall\b|\belectric fence\b/, 'Boundary Walls'],
  [/\bgates?\b/, 'Gates'],
  [/\bpaving\b|\bdriveway\b/, 'Paving'],
  [/\blawn\b|\bgrass\b/, 'Lawn'],
  [/\bgarden\b|\bflower beds?\b/, 'Garden'],
  [/\birrigation\b|\bsprinklers?\b/, 'Irrigation'],
  [/\bgutters?\b|\bdown ?pipes?\b/, 'Gutters And Down Pipes'],
  [/\broof\b/, 'Roof'],
  [/\brailings?\b|\bbalustrade\b/, 'Railings'],
  [/\bpool pump\b/, 'Pool Pump'],
  [/\bprepaid\b|\belectricity meter\b|\bmeter\b/, 'Prepaid Electricity Meter'],
  [/\bwater meter\b/, 'Water Meter'],
  [/\bremotes?\b/, 'Remotes'],
  [/\bwalls?\b|\bpaint\b|\bplaster\b|\bnails?\b/, 'Walls'],
];

/** Maps a spoken item phrase to a standard item name, or null if nothing matches. */
export function standardName(phrase = '') {
  const t = ` ${phrase.toLowerCase()} `;
  let best = null;
  for (const [re, name] of ITEM_WORDS) {
    const m = re.exec(t);
    if (m && (best === null || m.index < best.idx || (m.index === best.idx && m[0].length > best.len))) best = { idx: m.index, len: m[0].length, name };
  }
  // A water meter must not be read as the electricity meter.
  if (best?.name === 'Prepaid Electricity Meter' && /water meter/.test(t)) return 'Water Meter';
  return best ? best.name : null;
}

// ---------- Ratings from the inspector's words ----------
const R = {
  dirty: /\b(dirty|filthy|grease|greasy|grimy|not cleaned|needs (a )?clean(ing)?)\b/,
  dusty: /\bdust(y)?\b|\bcobwebs?\b/,
  stained: /\bstain(ed|s)?\b|\bwater streaks?\b|\bsticker\b|\bpen marks?\b|\bpaint marks?\b/,
  rusted: /\brust(ed|y)?\b/,
  clean: /\bclean\b/,
  missing: /\bmissing\b|\bno key\b|\bnot there\b|\bgone\b/,
  cracked: /\bcrack(ed|s|ing)?\b/,
  damaged: /\b(broken|damaged|torn|holes?|bent|peeling|damp|water damage|pulling (away|loose)|sagg?ing|leak(ing|s)?|burnt|dent(ed)?|nails?)\b/,
  wear: /\b(wear (and|&) tear|worn|faded|scuff(ed|s)?( marks?)?|chips?|chipped|minor marks|marks|patches|scratch(ed|es)?|loose)\b/,
  undamaged: /\b(undamaged|no damage|good condition|perfect|excellent|in order)\b/,
  faulty: /\b(not working|doesn'?t work|don'?t work|faulty|blown|flickers?|struggles?|stuck|tight|drip(ping|s)?|leak(ing|s)?|won'?t (lock|close|open|switch)|does not (lock|close|open)|makes? a noise|needs (a )?service)\b/,
  untested: /\b(unable to test|can'?t test|could not test|no electricity|no power)\b/,
  working: /\b(working|works|tested)\b/,
};

/** Reads cleanliness, damage, function and a responsibility tag from what was said. */
export function analyse(text = '', name = '') {
  const t = ` ${text.toLowerCase()} `;
  const out = { clean: null, damage: null, func: null, action: null };
  if (R.dirty.test(t)) out.clean = 'Dirty';
  else if (R.stained.test(t)) out.clean = 'Stained';
  else if (R.rusted.test(t)) out.clean = 'Rusted';
  else if (R.dusty.test(t)) out.clean = 'Dusty';
  else if (R.clean.test(t)) out.clean = 'Clean';

  if (R.missing.test(t)) out.damage = 'Missing';
  else if (R.cracked.test(t)) out.damage = 'Cracked';
  else if (R.damaged.test(t)) out.damage = 'Damaged';
  else if (R.wear.test(t)) out.damage = 'Wear & Tear';
  else if (R.undamaged.test(t)) out.damage = 'Undamaged';

  if (isTestable(`${name} ${text}`)) {
    if (R.untested.test(t)) out.func = 'Unable to test';
    else if (R.faulty.test(t)) out.func = 'Faulty';
    else if (R.working.test(t)) out.func = 'Working';
  }

  const a = t.match(/\b(landlord|owner|tenant) to (repair|replace|clean|fix|service)\b/);
  if (a) {
    const who = a[1] === 'tenant' ? 'Tenant' : 'Landlord';
    const what = a[2] === 'fix' || a[2] === 'service' ? 'repair' : a[2];
    out.action = `${who} to ${what}`;
  }
  return out;
}

/** Overall condition from the three ratings. */
export function conditionFrom({ clean, damage, func }) {
  if (damage === 'Missing') return 'missing';
  if (damage === 'Damaged' || damage === 'Cracked' || func === 'Faulty') return 'defect';
  if (damage === 'Wear & Tear' || clean === 'Dirty' || clean === 'Stained' || clean === 'Dusty' || clean === 'Rusted') return 'fair';
  if (damage === 'Undamaged' || clean === 'Clean' || func === 'Working' || func === 'Unable to test') return 'good';
  return 'unrated';
}

/** Fills missing ratings from the overall condition, so every item reads like an SA report. */
export function ratingsFor(it, inspectionType = 'ingoing') {
  const testable = isTestable(`${it.name} ${it.text || ''}`);
  const said = analyse(it.text || '', it.name);
  const cond = it.condition;
  const clean = it.clean ?? said.clean ?? (cond === 'unrated' ? null : 'Clean');
  const faulty = (it.func ?? said.func) === 'Faulty';
  const damage = it.damage ?? said.damage ?? {
    good: 'Undamaged', fair: faulty ? 'Undamaged' : 'Wear & Tear', defect: faulty ? 'Undamaged' : 'Damaged', missing: 'Missing',
  }[cond] ?? null;
  let func = it.func ?? said.func ?? null;
  if (!func && testable && cond !== 'unrated' && cond !== 'missing') func = cond === 'defect' && damage === 'Undamaged' ? 'Faulty' : 'Working';
  let action = it.action ?? said.action ?? null;
  if (!action && (cond === 'defect' || cond === 'missing')) {
    const tenant = inspectionType === 'outgoing' && (it.payer || 'tenant') === 'tenant';
    action = `${tenant ? 'Tenant' : 'Landlord'} to ${cond === 'missing' ? 'replace' : 'repair'}`;
  }
  if (!action && inspectionType === 'outgoing' && (clean === 'Dirty' || clean === 'Stained')) action = 'Tenant to clean';
  return { clean, damage, func: testable || func ? func : null, action };
}
