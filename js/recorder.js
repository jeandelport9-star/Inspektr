// Inspektr – camera, continuous video recording and still capture.
// The video never stops; photos are grabbed from the live stream at the moment of the command.

export async function openCamera(videoEl) {
  if (!navigator.mediaDevices?.getUserMedia) return { stream: null, reason: 'unsupported' };
  const tries = [
    { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: true },
    { video: { facingMode: { ideal: 'environment' } }, audio: true },
    { video: true, audio: false },
  ];
  let lastErr = null;
  for (const c of tries) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(c);
      videoEl.srcObject = stream;
      videoEl.muted = true;
      videoEl.playsInline = true;
      await videoEl.play().catch(() => {});
      return { stream, reason: null };
    } catch (err) {
      lastErr = err;
      if (err.name === 'NotAllowedError') break;
    }
  }
  return { stream: null, reason: lastErr?.name === 'NotAllowedError' ? 'blocked' : 'unavailable' };
}

export function stopStream(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

function pickMime() {
  if (!window.MediaRecorder) return null;
  const options = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return options.find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
}

/** Records the whole walk. Returns { pause, resume, stop(): Promise<Blob|null> }. */
export function startRecording(stream) {
  const mime = pickMime();
  if (!stream || mime === null) return null;
  let rec;
  try {
    rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 1_800_000 });
  } catch {
    try { rec = new MediaRecorder(stream); } catch { return null; }
  }
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.start(1000);
  return {
    pause() { if (rec.state === 'recording') rec.pause(); },
    resume() { if (rec.state === 'paused') rec.resume(); },
    stop() {
      return new Promise((resolve) => {
        if (rec.state === 'inactive') { resolve(chunks.length ? new Blob(chunks, { type: rec.mimeType }) : null); return; }
        rec.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: rec.mimeType || 'video/webm' }) : null);
        rec.stop();
      });
    },
  };
}

/** Grabs a JPEG still from the live video (max 1600 px wide). */
export function captureStill(videoEl) {
  return new Promise((resolve) => {
    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;
    if (!w || !h) { resolve(null); return; }
    const scale = Math.min(1, 1600 / w);
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    c.getContext('2d').drawImage(videoEl, 0, 0, c.width, c.height);
    c.toBlob((b) => resolve(b), 'image/jpeg', 0.86);
  });
}

/** Rough steadiness check from device motion; resolves true if the phone was still for ~0.4 s. */
export function steady(ms = 400) {
  return new Promise((resolve) => {
    if (!('DeviceMotionEvent' in window)) { resolve(true); return; }
    let moving = false;
    const onMotion = (e) => {
      const r = e.rotationRate;
      if (r && (Math.abs(r.alpha || 0) + Math.abs(r.beta || 0) + Math.abs(r.gamma || 0)) > 60) moving = true;
    };
    window.addEventListener('devicemotion', onMotion);
    setTimeout(() => { window.removeEventListener('devicemotion', onMotion); resolve(!moving); }, ms);
  });
}

/** Picks a demo scene that matches what was said, for camera-less demo mode. */
export function artFor(text = '') {
  const t = text.toLowerCase();
  if (/tap|leak|drip|pipe|geyser|basin|sink/.test(t)) return 'leak';
  if (/crack|wall/.test(t)) return 'crack';
  if (/stain|damp|ceiling|mou?ld/.test(t)) return 'stain';
  if (/tile|floor|grout/.test(t)) return 'tile';
  if (/window|glass|pane/.test(t)) return 'window';
  if (/door|cupboard|hinge|garage/.test(t)) return 'door';
  if (/couch|sofa|chair|stool/.test(t)) return 'couch';
  if (/stove|oven|plate|hob/.test(t)) return 'stove';
  if (/meter|serial|reading/.test(t)) return 'meter';
  if (/scratch|table|desk/.test(t)) return 'scratch';
  return 'item';
}
