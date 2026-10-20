// Inspektr – voice commands and narration parsing.
//
// The recogniser turns speech into phrases; parsePhrase() turns each phrase into events:
//   room, item, photo, inventory, note, closeup, undo, pause, resume, finish.
// Narration pattern the parser understands best: room → item → condition → command, e.g.
//   "new room kitchen. stove four plates good. tap at the sink is dripping defect take photo"

import { analyse, conditionFrom, standardName } from './vocab.js';

const COMMANDS = [
  ['finish inspection', 'finish'],
  ['new room', 'room'],
  ['next room', 'room'],
  ['take a photo', 'photo'],
  ['take photo', 'photo'],
  ['take picture', 'photo'],
  ['close up', 'closeup'],
  ['closeup', 'closeup'],
  ['inventory', 'inventory'],
  ['defective', 'defect'],
  ['defect', 'defect'],
  ['missing', 'missing'],
  ['fair', 'fair'],
  ['good', 'good'],
  ['okay', 'good'],
  ['ok', 'good'],
  ['undo', 'undo'],
  ['note', 'note'],
  ['pause', 'pause'],
  ['resume', 'resume'],
];

const NUMBERS = {
  a: 1, an: 1, one: 1, single: 1, two: 2, pair: 2, couple: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12,
};

const RATING_WORD = /^(dirty|dusty|clean|stained|rusted|rusty|faulty|broken|cracked|damaged|missing|worn|loose|leaking|dripping|chipped|scratched|working|undamaged|blown|damp|peeling|bent|torn|not)$/;

const FILLER = new Set(['is', 'are', 'in', 'a', 'an', 'the', 'and', 'at', 'looks', 'looking', 'condition', 'it', 'its', "it's", 'so', 'um', 'uh', 'also', 'then', 'with', 'of']);
const STOP_AT = new Set(['is', 'are', 'has', 'have', 'looks', 'was', 'with', 'needs', 'seems', 'next', 'near', 'above', 'below', 'behind', 'under', 'by', 'to', 'four', 'three', 'two']);
const ROOM_WORDS = /^(kitchen|lounge|bathroom|bedroom|dining|living|garage|balcony|passage|hallway|study|laundry|entrance|patio|garden|toilet|en|ensuite|scullery|main|guest|open|family|tv|pool|stoep|veranda)$/;

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function tidy(text) {
  const w = text.split(' ').filter(Boolean);
  while (w.length && FILLER.has(w[w.length - 1])) w.pop();
  return cap(w.join(' '));
}

function normalise(text) {
  return ` ${text.toLowerCase().replace(/[.,;:!?]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

/** Splits text into [{text}|{cmd}] tokens, matching the longest command first. */
function tokenise(text) {
  const out = [];
  let rest = normalise(text);
  while (rest.trim()) {
    let best = null;
    for (const [phrase, cmd] of COMMANDS) {
      const idx = rest.indexOf(` ${phrase} `);
      if (idx !== -1 && (best === null || idx < best.idx || (idx === best.idx && phrase.length > best.phrase.length))) {
        best = { idx, phrase, cmd };
      }
    }
    if (!best) { out.push({ text: rest.trim() }); break; }
    const before = rest.slice(0, best.idx).trim();
    if (before) out.push({ text: before });
    out.push({ cmd: best.cmd });
    rest = ` ${rest.slice(best.idx + best.phrase.length + 1).trim()} `;
  }
  return out;
}

/** "tap at the sink is dripping" → "Taps" (standard SA item name), else a short spoken name. */
export function itemName(text) {
  const std = standardName(text);
  if (std) return std;
  return spokenName(text);
}

/** "tap at the sink is dripping" → "Tap at the sink" */
export function spokenName(text) {
  const words = text.split(' ').filter(Boolean);
  const kept = [];
  for (const w of words) {
    if ((STOP_AT.has(w) || RATING_WORD.test(w)) && kept.length) break;
    kept.push(w);
    if (kept.length >= 5) break;
  }
  while (kept.length && FILLER.has(kept[0])) kept.shift();
  while (kept.length && FILLER.has(kept[kept.length - 1])) kept.pop();
  const name = kept.join(' ');
  return name ? cap(name) : 'Item';
}

export function inferCondition(text, name = '') {
  const r = analyse(text, `${name} ${text}`);
  const condition = conditionFrom(r);
  return { condition, confidence: condition === 'unrated' ? 0.4 : r.damage || r.func === 'Faulty' ? 0.78 : 0.7 };
}

function roomName(text) {
  const words = text.split(' ').filter((w) => w && !['the', 'is', 'a'].includes(w));
  // Known room words take the room word plus a qualifier ("bedroom two", "dining room", "main bedroom").
  let take = Math.min(2, words.length);
  if (words.length && ROOM_WORDS.test(words[0])) {
    take = 1;
    const second = words[1] || '';
    if (/^(room|bedroom|suite|plan|toilet|living|\d+|one|two|three|four|five)$/.test(second)) take = 2;
    if (take === 2 && /^(living|bedroom)$/.test(second) && words[2] && /^(room|\d+|one|two|three)$/.test(words[2])) take = 3;
  }
  const name = words.slice(0, take).join(' ');
  return { name: name ? name.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Room', rest: words.slice(take).join(' ') };
}

function parseInventory(text) {
  const words = text.split(' ').filter(Boolean);
  let qty = 1;
  if (words.length) {
    const n = Number(words[0]);
    if (!Number.isNaN(n) && n > 0) { qty = n; words.shift(); }
    else if (NUMBERS[words[0]] !== undefined) { qty = NUMBERS[words.shift()]; }
  }
  const nameWords = [];
  for (const w of words) {
    if (nameWords.length >= 2 || /^(one|two|\d+)$/.test(w)) break;
    nameWords.push(w);
  }
  const name = nameWords.length ? cap(nameWords.join(' ')) : 'Item';
  return { qty, name, text: words.join(' ') };
}

/**
 * Parses one spoken phrase into events. Pending free text is attached to the next condition
 * command, or turned into an item with an inferred condition at the end of the phrase.
 */
export function parsePhrase(raw) {
  const sentences = String(raw).split(/[.!?;]+/).map((x) => x.trim()).filter(Boolean);
  if (sentences.length > 1) return sentences.flatMap((x) => parsePhrase(x));
  const tokens = tokenise(raw);
  const events = [];
  let pending = '';

  const flushPending = () => {
    if (!pending) return;
    if (!pending.split(' ').some((w) => w && !FILLER.has(w))) { pending = ''; return; }
    const nm = itemName(pending);
    const inferred = inferCondition(pending, nm);
    events.push({ cmd: 'item', name: nm, text: tidy(pending), ...inferred });
    pending = '';
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    if (tok.text !== undefined) { pending = pending ? `${pending} ${tok.text}` : tok.text; continue; }
    const next = tokens[i + 1] && tokens[i + 1].text !== undefined ? tokens[i + 1].text : '';

    switch (tok.cmd) {
      case 'room': {
        flushPending();
        const { name, rest } = roomName(next);
        events.push({ cmd: 'room', room: name });
        if (next) i += 1;
        pending = rest;
        break;
      }
      case 'good': case 'fair': case 'defect': case 'missing': {
        if (pending) {
          events.push({ cmd: 'item', name: itemName(pending), text: tidy(pending), condition: tok.cmd, confidence: 0.95 });
          pending = '';
        } else {
          events.push({ cmd: 'mark', condition: tok.cmd });
        }
        if (tok.cmd === 'defect') events.push({ cmd: 'photo', auto: true });
        break;
      }
      case 'inventory': {
        flushPending();
        const inv = parseInventory(next);
        const inferred = inferCondition(inv.text);
        events.push({ cmd: 'inventory', ...inv, text: cap(inv.text || inv.name), condition: inferred.condition === 'unrated' ? 'good' : inferred.condition, confidence: inferred.condition === 'unrated' ? 0.8 : 0.85 });
        if (next) i += 1;
        break;
      }
      case 'note': {
        flushPending();
        if (next) { events.push({ cmd: 'note', text: cap(next) }); i += 1; }
        break;
      }
      case 'photo': case 'closeup': {
        flushPending();
        events.push({ cmd: tok.cmd });
        break;
      }
      default:
        flushPending();
        events.push({ cmd: tok.cmd });
    }
  }
  flushPending();
  // A defect followed by an explicit "take photo" only needs one photo.
  return events.filter((e, idx, arr) => !(e.cmd === 'photo' && e.auto && arr[idx + 1] && arr[idx + 1].cmd === 'photo'));
}

// ---------- Speech recogniser (Web Speech API) ----------

export function speechSupported() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Continuous recogniser that restarts itself (Chrome ends sessions every so often).
 * onPhrase(text) fires for final results; onInterim(text) for live captions.
 */
export function createRecognizer({ onPhrase, onInterim, onState }) {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) return null;
  const rec = new Rec();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-ZA';
  rec.maxAlternatives = 1;

  let active = false;
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i += 1) {
      const r = e.results[i];
      if (r.isFinal) onPhrase(r[0].transcript.trim());
      else interim += r[0].transcript;
    }
    onInterim?.(interim.trim());
  };
  rec.onerror = (e) => {
    if (e.error === 'language-not-supported') { rec.lang = 'en-US'; }
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { active = false; onState?.('blocked'); }
  };
  rec.onend = () => {
    if (active) { try { rec.start(); } catch { /* already started */ } } else onState?.('off');
  };

  return {
    start() { active = true; try { rec.start(); onState?.('listening'); } catch { /* ignore */ } },
    stop() { active = false; try { rec.stop(); } catch { /* ignore */ } },
    get active() { return active; },
  };
}
