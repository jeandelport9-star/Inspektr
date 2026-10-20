// Inspektr – small UI helpers.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const TYPE_LABEL = { ingoing: 'Ingoing', outgoing: 'Outgoing', routine: 'Routine', inventory: 'Inventory' };
export const TYPE_SHORT = { ingoing: 'IN', outgoing: 'OUT', routine: 'RT', inventory: 'INV' };
export const COND_LABEL = { good: 'Good', fair: 'Fair', defect: 'Defect', missing: 'Missing', unrated: 'Needs rating', note: 'Note', inventory: 'Inventory' };

export function fmtDate(iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString('en-ZA', opts);
}

export function fmtClock(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

export function fmtDuration(sec) {
  const m = Math.round((sec || 0) / 60);
  return m < 1 ? 'under a minute' : `${m} min`;
}

export function daysFrom(iso) {
  if (!iso) return null;
  const a = new Date(); a.setHours(12, 0, 0, 0);
  const b = new Date(`${iso}T12:00:00`);
  return Math.round((b - a) / 86400000);
}

export function dueText(iso) {
  const d = daysFrom(iso);
  if (d === null) return 'No inspection scheduled';
  if (d < 0) return `Inspection overdue by ${-d} day${d === -1 ? '' : 's'}`;
  if (d === 0) return 'Inspection due today';
  if (d === 1) return 'Inspection due tomorrow';
  if (d <= 14) return `Inspection due in ${d} days`;
  return `Next inspection ${fmtDate(iso, { day: 'numeric', month: 'short' })}`;
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let toastTimer = null;
export function toast(message, ms = 2400) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), ms);
}

// ---------- Sounds (feedback for voice commands) ----------
let audio = null;
function ctx() {
  if (!audio) {
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return null;
    audio = new A();
  }
  if (audio.state === 'suspended') audio.resume();
  return audio;
}
function tone(freq, start, dur, gain = 0.12) {
  const a = ctx();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, a.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, a.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.02);
}
export const sound = {
  beep() { tone(880, 0, 0.12); },
  double() { tone(740, 0, 0.1); tone(740, 0.14, 0.12); },
  long() { tone(660, 0, 0.45, 0.1); },
  low() { tone(330, 0, 0.18); },
  shutter() { tone(1600, 0, 0.04, 0.08); tone(1100, 0.05, 0.05, 0.06); },
};
export function buzz(pattern) { try { navigator.vibrate?.(pattern); } catch { /* ignore */ } }

// ---------- Icons ----------
const I = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const icon = {
  map: I('<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>'),
  wrench: I('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6z"/>'),
  rec: I('<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>'),
  house: I('<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  mic: I('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  micOff: I('<path d="M3 3l18 18"/><path d="M9 9v2a3 3 0 0 0 5 2.2M15 10V6a3 3 0 0 0-5.7-1.3"/><path d="M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3"/>'),
  pause: I('<path d="M9 5v14M15 5v14"/>'),
  play: I('<path d="M7 4l13 8-13 8z" fill="currentColor"/>'),
  close: I('<path d="M6 6l12 12M18 6 6 18"/>'),
  chevron: I('<path d="m6 9 6 6 6-6"/>'),
  back: I('<path d="M15 18 9 12l6-6"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  print: I('<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>'),
  share: I('<path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>'),
  check: I('<path d="m5 12 5 5 9-10"/>'),
  locate: I('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/>'),
  camera: I('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  brush: I('<path d="M14 4l6 6-8.5 8.5a3 3 0 0 1-2.1.9H6v-3.4a3 3 0 0 1 .9-2.1z"/><path d="M12.5 5.5l6 6"/><path d="M3 21c1.5 0 3-1 3-3"/>'),
  upload: I('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>'),
  calendar: I('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  chart: I('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  reset: I('<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/>'),
};

export const brandMark = `<img class="brand-mark" src="assets/ava-mark.png" alt="">`;

// ---------- Bottom sheet ----------
export function openSheet(html, { onOpen, onClose } = {}) {
  closeSheet(true);
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const sheet = document.createElement('section');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.innerHTML = `<div class="sheet-grip"></div>${html}`;
  document.body.append(scrim, sheet);
  requestAnimationFrame(() => { scrim.classList.add('is-open'); sheet.classList.add('is-open'); });
  const close = () => closeSheet();
  scrim.addEventListener('click', close);
  sheet.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  sheet._onClose = onClose;
  document.addEventListener('keydown', escClose);
  onOpen?.(sheet);
  setTimeout(() => sheet.querySelector('[data-autofocus]')?.focus(), 60);
  return sheet;
}
function escClose(e) { if (e.key === 'Escape') closeSheet(); }
export function closeSheet(instant = false) {
  const sheet = document.querySelector('.sheet');
  const scrim = document.querySelector('.scrim');
  document.removeEventListener('keydown', escClose);
  if (!sheet) return;
  sheet._onClose?.();
  sheet.querySelectorAll('video').forEach((v) => v.pause());
  if (instant) { sheet.remove(); scrim?.remove(); return; }
  sheet.classList.remove('is-open');
  scrim?.classList.remove('is-open');
  setTimeout(() => { sheet.remove(); scrim?.remove(); }, 300);
}

/** Converts a stored condition to a badge. */
export function badge(cond, kind) {
  const c = kind === 'note' ? 'note' : cond;
  return `<span class="badge badge--${esc(c)}">${esc(COND_LABEL[c] || c)}</span>`;
}
