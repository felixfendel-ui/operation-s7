/* Beweisfotos: An jeder Station macht das Team ein Gruppenfoto in einer bestimmten Pose (station.photo).
   Erst danach geht es weiter. Die Fotos bleiben NUR auf dem Handy, das sie aufgenommen hat (IndexedDB) –
   es wird nichts hochgeladen. Die anderen Handys erfahren nur „Foto gemacht“. Beim Finale: Missions-Album.
   Wird vor app.js geladen. */
'use strict';

const PHOTO_PTS = 20;
let photoDb = null;

/* ---------- Speicher auf dem Gerät ---------- */
function idb() {
  if (photoDb) return Promise.resolve(photoDb);
  return new Promise((res, rej) => {
    const r = indexedDB.open('sj7photos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('p');
    r.onsuccess = () => { photoDb = r.result; res(photoDb); };
    r.onerror = () => rej(r.error);
  });
}
async function putPhoto(k, blob) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('p', 'readwrite'); t.objectStore('p').put({ blob, t: Date.now() }, String(k)); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
async function getPhoto(k) { const db = await idb(); return new Promise(res => { const r = db.transaction('p').objectStore('p').get(String(k)); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); }
async function allPhotos() {
  const db = await idb();
  return new Promise(res => {
    const out = [], r = db.transaction('p').objectStore('p').openCursor();
    r.onsuccess = () => { const c = r.result; if (c) { out.push({ k: +c.key, ...c.value }); c.continue(); } else res(out.sort((a, b) => a.k - b.k)); };
    r.onerror = () => res(out);
  });
}
function compressImage(file, max = 1600) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const sc = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => (b ? res(b) : rej(new Error('Bild konnte nicht verarbeitet werden'))), 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Bild konnte nicht geladen werden')); };
    img.src = url;
  });
}

/* ---------- Ablauf ---------- */
const photoDone = k => !!(P.photos && P.photos[k]);
function requestPhoto(k, skip) {
  if (isMember()) { teamAct('photo', { x: k, skip: !!skip }); P.photos = P.photos || {}; P.photos[k] = { by: TEAM.name, skip: !!skip }; return; }
  markPhoto(k, P.name, !!skip);
}
function markPhoto(k, by, skip) {
  exInit(); P.photos = P.photos || {};
  if (P.photos[k]) return;
  P.photos[k] = { by: String(by || '?').slice(0, 24), skip: !!skip };
  if (!skip) awardBoth(PHOTO_PTS);
  save();
  liveEvent('task', skip ? `Station ${k + 1}: Beweisfoto übersprungen` : `📸 Beweisfoto Station ${k + 1} – ${by}`, skip ? 'kein Foto möglich' : 'Alle zusammen im Bild', 2);
  if (P.status === 'solved' || P.finishedAt) render();
}
function photoCardHtml(st, k) {
  if (!st.photo) return '';
  const d = P.photos && P.photos[k];
  return `<div class="photocard" id="photoCard">
    <div class="label">📸 Beweisfoto für den Silberfuchs</div>
    <p>${rich(st.photo)}</p>
    ${d ? `<p class="feedback good">${d.skip ? '⏭ Übersprungen' : `✅ Foto gemacht${d.by && d.by !== P.name ? ' von ' + esc(d.by) : ''}${teamOn() ? '' : ` (+${PHOTO_PTS})`}`}</p>` : ''}
    <img class="photothumb" id="photoThumb" alt="" hidden>
    ${d ? '' : `<label class="btn warn photobtn">📷 Gruppenfoto aufnehmen<input type="file" accept="image/*" capture="environment" id="photoIn" hidden></label>
      <p class="small">Selbstauslöser oder einen Passanten fragen – alle müssen drauf sein! Das Foto bleibt auf deinem Handy.</p>
      <button type="button" class="linkbtn" id="photoSkip">Foto gerade nicht möglich – überspringen</button>`}
    <div class="feedback" id="photoFb"></div>
  </div>`;
}
function bindPhoto(k, after) {
  getPhoto(k).then(p => { const im = $('#photoThumb'); if (p && im) { im.src = URL.createObjectURL(p.blob); im.hidden = false; } }).catch(() => {});
  const inp = $('#photoIn');
  if (inp) inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    const fb = $('#photoFb'); if (fb) { fb.className = 'feedback'; fb.textContent = 'Speichere Foto …'; }
    try {
      const blob = await compressImage(f);
      await putPhoto(k, blob);
      fx('good'); flashBonus(`📸 Beweisfoto gesichert${teamOn() ? ` – beide Trupps +${PHOTO_PTS / 2}` : ''}`);
      requestPhoto(k, false);
      if (after) after();
    } catch (e) { if (fb) { fb.className = 'feedback bad'; fb.textContent = '⚠️ ' + e.message; } }
  };
  const sk = $('#photoSkip');
  if (sk) sk.onclick = () => { if (confirm('Beweisfoto wirklich überspringen? Dafür gibt es keine Punkte.')) { requestPhoto(k, true); if (after) after(); } };
}

/* ---------- Missions-Album (Finale) ---------- */
async function albumHtmlInto(el) {
  if (!el) return;
  let list = [];
  try { list = await allPhotos(); } catch (e) {}
  const others = Object.entries(P.photos || {}).filter(([k, v]) => !v.skip && !list.some(p => p.k === +k));
  if (!list.length && !others.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="card"><div class="label">📸 Missions-Album</div>
    ${list.length ? `<div class="album">${list.map(p => `<figure><img src="${URL.createObjectURL(p.blob)}" alt=""><figcaption>${esc((D.stations[p.k] || {}).title || '')}</figcaption></figure>`).join('')}</div>
      <button class="btn small" id="albumShare">📤 Fotos speichern oder teilen</button>` : ''}
    ${others.length ? `<p class="small">Weitere Fotos liegen auf den Handys von: ${esc([...new Set(others.map(([, v]) => v.by))].join(', '))}</p>` : ''}
  </div>`;
  const b = $('#albumShare');
  if (b) b.onclick = async () => {
    const files = list.map(p => new File([p.blob], `Operation-Silberfuchs-${String(p.k + 1).padStart(2, '0')}.jpg`, { type: 'image/jpeg' }));
    if (navigator.canShare && navigator.canShare({ files })) {
      try { await navigator.share({ files, title: 'Operation Silberfuchs – Missions-Album' }); } catch (e) {}
    } else {
      files.forEach(f => { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); });
    }
  };
}
