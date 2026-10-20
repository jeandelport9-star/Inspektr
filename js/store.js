// Inspektr – local storage layer.
// Records (properties, inspections) live in localStorage; photos and video live in IndexedDB.

const KEY = 'inspektr.v1';

export const uid = (prefix = 'id') =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Inspektr: could not save state', err);
  }
}

export function clearState() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

// ---------- IndexedDB media store ----------
let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('inspektr-media', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('media');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function putMedia(id, blob) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('media', 'readwrite');
    tx.objectStore('media').put(blob, id);
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMedia(id) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d.transaction('media').objectStore('media').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function clearMedia() {
  const d = await db();
  return new Promise((resolve) => {
    const tx = d.transaction('media', 'readwrite');
    tx.objectStore('media').clear();
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });
}

const urlCache = new Map();
/** Returns an object URL for a stored photo or video, cached for the session. */
export async function mediaUrl(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  try {
    const blob = await getMedia(id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urlCache.set(id, url);
    return url;
  } catch {
    return null;
  }
}
