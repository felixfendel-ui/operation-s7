/* Operation S7 – GPS-Schnitzeljagd. Reines Vanilla-JS, keine Abhängigkeiten. */
'use strict';

const KEY_P = 'sj7_progress';       // Spielfortschritt
const KEY_D = 'sj7_data_override';  // lokal im Admin-Modus geänderte Stationen
const RANKS = ['Rekrut', 'Kadett', 'Agent auf Probe', 'Agent', 'Spezialagent', 'Geheimagent',
  'Top-Agent', 'Elite-Agent', 'Meisteragent', 'Legende'];
const WRONG = ['Falsch, Agent. Der Maulwurf lacht sich ins Fäustchen.', 'Negativ! Nochmal nachdenken.',
  'Zugriff verweigert.', 'Fast … oder auch nicht. Nochmal!', 'Der Tresor bleibt zu. Versuch es erneut.'];

const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
let D = null, BASE = null, P = null;
let pos = null, sim = null, geoErr = null, watchId = null;
let heading = null, compassOn = false, lastRot = 0, rafPending = false;
let adminAuthed = false, adminView = 'main', editIdx = null;
let audioCtx = null;

/* ---------- Helfer ---------- */
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function rich(t) {
  return esc(t || '')
    .replace(/\{name\}/g, esc((P && P.name) || 'Agent'))
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>');
}
function norm(s) {
  return String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss').normalize('NFD').replace(/[^a-z0-9]/g, '');
}
const rad = x => x * Math.PI / 180;
function dist(a, b) {
  const R = 6371000, dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function fmtDist(m) {
  if (m < 1000) return (m < 100 ? Math.round(m) : Math.round(m / 10) * 10) + ' m';
  return (m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',') + ' km';
}
const DIRS = ['Norden', 'Nordosten', 'Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten'];
const dirName = b => DIRS[Math.round(b / 45) % 8];
function heat(m) {
  if (m < 40) return ['🔥 Glühend heiß!', 'h-fire'];
  if (m < 120) return ['Heiß!', 'h-hot'];
  if (m < 400) return ['Warm', 'h-warm'];
  if (m < 1200) return ['Lauwarm', 'h-mild'];
  if (m < 4000) return ['Kalt', 'h-cold'];
  return ['❄️ Eiskalt', 'h-ice'];
}
function fmtTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 3600) + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
const stations = () => D.stations;
const cur = () => D.stations[Math.min(P.idx, D.stations.length - 1)];
const here = () => sim || pos;
const fragStations = () => D.stations.map((s, i) => ({ s, i })).filter(o => o.s.fragment);
function save() { lsSet(KEY_P, P); teamAfterSave(); }
function newProgress() {
  return { name: '', idx: 0, status: 'travel', frags: {}, tries: {}, hints: {}, forced: 0, startedAt: null, finishedAt: null };
}

/* ---------- Sound & Haptik ---------- */
function initAudio() {
  try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {}
}
function tone(f, t0, dur, type = 'square', vol = 0.06) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type; o.frequency.value = f; g.gain.value = vol;
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + t0 + dur);
  o.connect(g).connect(audioCtx.destination);
  o.start(audioCtx.currentTime + t0); o.stop(audioCtx.currentTime + t0 + dur);
}
function fx(kind) {
  try {
    if (kind === 'unlock') { [660, 880, 1320].forEach((f, i) => tone(f, i * 0.12, 0.15)); navigator.vibrate && navigator.vibrate([120, 60, 120]); }
    if (kind === 'good') { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.18, 'triangle', 0.08)); navigator.vibrate && navigator.vibrate(80); }
    if (kind === 'bad') { tone(140, 0, 0.3, 'sawtooth', 0.05); navigator.vibrate && navigator.vibrate(250); }
    if (kind === 'win') { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.13, 0.25, 'triangle', 0.09)); navigator.vibrate && navigator.vibrate([100, 50, 100, 50, 300]); }
  } catch (e) {}
}
function confetti() {
  const box = $('#confetti'), cols = ['#39ff88', '#ffc53d', '#5ab4ff', '#ff5a5a', '#ffffff'];
  for (let i = 0; i < 140; i++) {
    const c = document.createElement('i');
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = cols[i % cols.length];
    c.style.animationDuration = 2.5 + Math.random() * 3 + 's';
    c.style.animationDelay = Math.random() * 1.5 + 's';
    box.appendChild(c);
  }
  setTimeout(() => { box.innerHTML = ''; }, 8000);
}

/* ---------- GPS ---------- */
function startGeo() {
  if (watchId !== null) return;
  if (!navigator.geolocation) { geoErr = { message: 'Dieses Gerät kann keinen Standort liefern.' }; updateLive(); return; }
  watchId = navigator.geolocation.watchPosition(p => {
    pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() };
    geoErr = null; onPos();
  }, e => {
    geoErr = e; updateLive();
    if (e.code === 1) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
}
function onPos() { checkUnlock(); updateLive(); updateAdminGps(); liveSnapshot(false); }
function checkUnlock() {
  if (!P.name || P.finishedAt || P.status !== 'travel') return;
  const p = here(), st = cur();
  if (!p || !st) return;
  if (dist(p, st) <= st.radius + Math.min(p.acc || 0, 25)) requestUnlock(false);
}
function unlock(forced, by) {
  P.status = 'arrived';
  if (forced) P.forced++;
  save(); fx('unlock'); render();
  liveEvent(forced ? 'forced' : 'arrived', `Station ${P.idx + 1} erreicht${forced ? ' (manuell freigeschaltet)' : ''}${by ? ' – ' + by : ''}`, cur().title, forced ? 4 : 3);
  keepAwake();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Kompass ---------- */
async function enableCompass() {
  initAudio();
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') { alert('Ohne Erlaubnis kein Kompass – der Pfeil zeigt dann mit Norden nach oben.'); return; }
      window.addEventListener('deviceorientation', onOrient, true);
    } else if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', onOrient, true);
    } else {
      window.addEventListener('deviceorientation', onOrient, true);
    }
    compassOn = true; updateLive();
    setTimeout(() => { if (heading === null) { compassOn = false; const b = $('#compassMsg'); if (b) b.textContent = 'Kein Kompass gefunden – der Pfeil zeigt mit Norden nach oben.'; updateLive(); } }, 3000);
  } catch (e) { compassOn = false; }
}
function onOrient(e) {
  let h = null;
  if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
  else if (e.absolute && e.alpha != null) h = 360 - e.alpha;
  if (h == null) return;
  const scr = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  heading = (h + scr + 360) % 360;
  if (!rafPending) { rafPending = true; requestAnimationFrame(() => { rafPending = false; updateLive(); }); }
}

/* ---------- Rendering ---------- */
function renderHeader() {
  const total = stations().length;
  const done = P.finishedAt ? total : P.idx + (P.status === 'solved' ? 1 : 0);
  $('#pbar').style.width = (P.name ? done / total * 100 : 0) + '%';
  const n = Object.keys(P.frags).length;
  const me = teamOn() && myMember();
  $('#rank').textContent = P.name ? ((me ? (me.trupp === 'A' ? 'TRUPP A' : 'TRUPP B') : 'RANG: ' + RANKS[Math.min(n, RANKS.length - 1)].toUpperCase()) + ' · ' + P.name.toUpperCase()) : '';
  tick();
}
function tick() {
  const t = $('#timer');
  if (!P || !P.startedAt) { t.textContent = ''; return; }
  t.textContent = '⏱ ' + fmtTime((P.finishedAt || Date.now()) - P.startedAt);
}
function fragsHtml() {
  return '<div class="frags">' + fragStations().map(o =>
    `<div class="frag ${P.frags[o.i] ? 'got' : ''}">${esc(P.frags[o.i] || '?')}</div>`).join('') + '</div>';
}

function render() {
  renderHeader();
  liveUi(); teamUi();
  if (isMember() && !memberReady()) return renderLobby();
  if (!P.name) return renderIntro();
  if (P.finishedAt) return renderVictory();
  const st = cur();
  if (P.status === 'travel' && st.free && !isMember()) { P.status = 'arrived'; save(); }
  if (P.status === 'travel') return renderTravel();
  if (P.status === 'arrived') return renderRiddle();
  return renderSolved();
}

function renderIntro() {
  app.innerHTML = `
  <div class="card pop">
    <div class="stamp">TOP SECRET</div>
    <h1>${esc(D.title)}</h1>
    <p>${rich(D.intro)}</p>
  </div>
  <div class="card">
    <label class="label" for="nameIn">Dein Agentenname</label>
    <input id="nameIn" maxlength="24" autocomplete="off" placeholder="z. B. Jasper" value="${esc(D.agentName || '')}" style="margin-top:8px">
    <button class="btn" id="startBtn">🔓 Mission starten</button>
    <p class="small">Die App fragt nach deinem Standort (für das Radar) und auf dem iPhone nach dem Kompass. Bitte jeweils erlauben.</p>
    ${isHost() ? `<p class="small">👥 Team-Modus: ${TEAM.members.length - 1} Mitspieler beigetreten. QR-Code über den Team-Knopf unten links.</p>` : ''}
  </div>`;
  const go = () => {
    const n = $('#nameIn').value.trim();
    if (!n) { $('#nameIn').classList.add('shake'); setTimeout(() => $('#nameIn').classList.remove('shake'), 400); return; }
    initAudio();
    P.name = n; P.startedAt = P.startedAt || Date.now(); save();
    startGeo(); enableCompass(); render(); keepAwake();
    liveEvent('start', 'Mission gestartet', `${n} hat die Mission gestartet.`);
  };
  $('#startBtn').onclick = go;
  $('#nameIn').onkeydown = e => { if (e.key === 'Enter') go(); };
}

function renderTravel() {
  const st = cur(), far = here() && dist(here(), st) > 3000, nav = canNavigate();
  app.innerHTML = `${teamRoleHtml()}
  <div class="card pop">
    <div class="label">Station ${P.idx + 1} von ${stations().length} · Nächstes Ziel</div>
    <h2>${esc(st.targetName || st.title)}</h2>
    <p>${rich(st.mission)}</p>
    ${far ? '<p class="small">🚆 Weite Strecke – nimm die S-Bahn wie im Auftrag beschrieben.</p>' : ''}
  </div>
  <div class="radar ${nav ? '' : 'noarrow'}" id="radar">
    <div class="sweep"></div><div class="north">N</div>
    <div class="arrow" id="arrow"><svg viewBox="0 0 40 60"><path d="M20 0 L40 44 L20 34 L0 44 Z" fill="#39ff88"/></svg></div>
    <div class="readout"><div id="dist">…</div><div id="heat" class="small">Suche Signal</div></div>
  </div>
  <p class="center" id="dirinfo"></p>
  <p class="center small" id="gpsinfo"></p>
  <div id="forcebox"></div>
  ${nav ? '' : '<button class="btn sec small" id="navOv">🧭 Navigator ausgefallen? Pfeil hier anzeigen</button>'}
  ${compassOn ? '' : '<button class="btn sec small" id="compassBtn">🧭 Kompass aktivieren</button><p class="center small" id="compassMsg"></p>'}
  <div class="card"><div class="label center">Code-Fragmente</div>${fragsHtml()}</div>`;
  const cb = $('#compassBtn'); if (cb) cb.onclick = () => enableCompass().then(render);
  const no = $('#navOv'); if (no) no.onclick = () => { navOverride = P.idx; render(); };
  lastRot = 0;
  updateLive();
}

function updateLive() {
  if (!P || !P.name || P.finishedAt || P.status !== 'travel') return;
  const st = cur(), p = here(), dEl = $('#dist');
  if (!dEl) return;
  const gi = $('#gpsinfo');
  if (!p) {
    dEl.textContent = '…';
    if (geoErr) gi.innerHTML = '⚠️ ' + esc(geoErr.code === 1
      ? 'Standort ist blockiert. Bitte in den Einstellungen für Safari/Chrome den Standortzugriff erlauben und die Seite neu laden.'
      : (geoErr.message || 'Kein GPS-Signal.')) + (geoErr.code === 1 ? '' : ' Warte kurz unter freiem Himmel.');
    else gi.textContent = 'Warte auf GPS-Signal …';
    return;
  }
  const d = dist(p, st), b = bearing(p, st), [hl, hc] = heat(d);
  dEl.textContent = fmtDist(d);
  const h = $('#heat'); h.textContent = hl; h.className = hc;
  const target = compassOn && heading !== null ? b - heading : b;
  const delta = ((target - lastRot) % 360 + 540) % 360 - 180;
  lastRot += delta;
  $('#arrow').style.transform = `rotate(${lastRot}deg)`;
  const r = teamRoles(P.idx), me = myMember();
  $('#dirinfo').innerHTML = !canNavigate() ? `Nur der 🧭 Navigator sieht die Richtung: <b>${esc(r && me && r.nav[me.trupp] ? r.nav[me.trupp].name : '')}</b> – folgt ihm!`
    : compassOn && heading !== null
    ? 'Der Pfeil zeigt zum Ziel. Halte das Handy flach vor dich.'
    : `Ziel liegt im <b>${dirName(b)}</b>. <span class="small">(Pfeil: Norden = oben)</span>`;
  gi.textContent = (sim ? '🧪 SIMULATION · ' : '') + 'GPS-Genauigkeit: ±' + Math.round(p.acc || 0) + ' m';
  const fb = $('#forcebox');
  const near = d <= Math.max(st.radius * 3, st.radius + (p.acc || 0) * 1.5);
  if (near && !fb.dataset.on) {
    fb.dataset.on = '1';
    fb.innerHTML = `<button class="btn sec small" id="forceBtn">📍 Ich bin da – aber nichts passiert</button>`;
    $('#forceBtn').onclick = () => {
      if (confirm('Seid ihr wirklich am Ziel? GPS ist im Isartal manchmal ungenau. Station jetzt freischalten?')) requestUnlock(true);
    };
  } else if (!near && fb.dataset.on) { fb.dataset.on = ''; fb.innerHTML = ''; }
}

function renderRiddle() {
  const st = cur(), id = st.id || P.idx, tries = P.tries[id] || 0, hintUsed = !!P.hints[id];
  const prevAns = $('#ans') ? $('#ans').value : '', teamHtml = teamRiddleHtml(st), answer = canAnswer();
  app.innerHTML = `${teamRoleHtml()}
  <div class="card pop">
    <div class="label">📍 Station ${P.idx + 1} von ${stations().length} · Ziel erreicht</div>
    <h2>${esc(st.title)}</h2>
    <p>${rich(st.story)}</p>
    ${st.final ? `<div class="label center" style="margin-top:12px">${isMember() ? 'Die Fragmente hat Einsatzleiter ' + esc(TEAM.hostName || 'Jasper') : 'Deine Fragmente'}</div>` + fragsHtml() : ''}
    ${teamHtml || `<div class="riddle">${rich(st.riddle)}</div>`}
    ${answer ? `<input id="ans" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Deine Lösung">
    <button class="btn" id="ansBtn">${st.final ? '🔐 Tresor öffnen' : '✔ Lösung prüfen'}</button>` : answerBlockedHtml()}
    <div class="feedback" id="fb"></div>
    ${st.hint ? (hintUsed
      ? `<div class="hintbox">💡 ${rich(st.hint)}</div>`
      : `<button class="btn sec small ${tries >= 2 ? 'pulse' : ''}" id="hintBtn">💡 Tipp vom Silberfuchs anfordern</button>`) : ''}
  </div>`;
  const submit = () => {
    const v = $('#ans').value;
    if (!norm(v)) return;
    initAudio();
    if ((st.answers || []).some(a => norm(a) === norm(v))) return requestSolve();
    P.tries[id] = (P.tries[id] || 0) + 1; save(); requestWrong(v);
    liveEvent('wrong', `Station ${P.idx + 1}: falsche Antwort`, `„${v.trim().slice(0, 80)}“ (Versuch ${P.tries[id]})`, 2);
    fx('bad');
    const fb = $('#fb'); fb.className = 'feedback bad'; fb.textContent = WRONG[P.tries[id] % WRONG.length];
    const a = $('#ans'); a.classList.remove('shake'); void a.offsetWidth; a.classList.add('shake'); a.select();
    const hb = $('#hintBtn'); if (hb && P.tries[id] >= 2) hb.classList.add('pulse');
  };
  if ($('#ans')) {
    $('#ans').value = prevAns;
    $('#ansBtn').onclick = submit;
    $('#ans').onkeydown = e => { if (e.key === 'Enter') submit(); };
  }
  const co = $('#codeOv'); if (co) co.onclick = () => { codeOverride = P.idx; renderRiddle(); };
  const hb = $('#hintBtn');
  if (hb) hb.onclick = () => { if (requestHint()) return; P.hints[id] = true; save(); renderRiddle(); liveEvent('hint', `Station ${P.idx + 1}: Tipp genutzt`, st.title); };
}

function solve(by) {
  const st = cur();
  if (st.fragment) P.frags[P.idx] = st.fragment;
  if (st.final) {
    P.finishedAt = Date.now(); save(); fx('win'); confetti(); render(); window.scrollTo(0, 0);
    liveEvent('finished', 'Mission erfüllt – Tresor offen!', `Einsatzzeit ${fmtTime(P.finishedAt - P.startedAt)}`, 5);
    return;
  }
  P.status = 'solved'; save(); fx('good'); render(); window.scrollTo(0, 0);
  liveEvent('solved', `Station ${P.idx + 1} gelöst${by ? ' – ' + by : ''}`, `${st.title} (Versuche hier: ${(P.tries[st.id || P.idx] || 0) + 1})`);
}

function renderSolved() {
  const st = cur(), nr = fragStations().findIndex(o => o.i === P.idx) + 1;
  app.innerHTML = `
  <div class="card center pop">
    <div class="label">✅ Richtig gelöst</div>
    ${st.fragment ? (isMember() ? `<p>🔒 Verschlüsseltes Fragment ${nr} von ${fragStations().length} ging an Einsatzleiter ${esc(TEAM.hostName || 'Jasper')}.</p>`
      : `<p class="small" style="margin-bottom:0">Verschlüsseltes Fragment ${nr} von ${fragStations().length}</p><div class="bigfrag">${esc(st.fragment)}</div>`) : ''}
    ${fragsHtml()}
  </div>
  <div class="card"><p>${rich(st.solved)}</p>
    <button class="btn" id="nextBtn">➜ Weiter zum nächsten Ziel</button>
  </div>`;
  $('#nextBtn').onclick = requestNext;
}
function doNext() {
  if (P.idx < stations().length - 1) { P.idx++; P.status = 'travel'; }
  else { P.finishedAt = Date.now(); }
  save(); render(); window.scrollTo(0, 0); checkUnlock();
}

function renderVictory() {
  const hints = Object.keys(P.hints).length, tries = Object.values(P.tries).reduce((a, b) => a + b, 0);
  app.innerHTML = `
  <div class="card center pop">
    <div class="stamp" style="border-color:var(--accent);color:var(--accent)">MISSION ERFÜLLT</div>
    <div style="font-size:64px">🏆</div>
    <p>${rich(D.finale)}</p>
    <div class="lock">${esc(D.lockCode || '')}</div>
    ${fragsHtml()}
  </div>
  <div class="card">
    <div class="label">Missionsbericht</div>
    <p>⏱ Einsatzzeit: <b>${fmtTime(P.finishedAt - P.startedAt)}</b><br>
    💡 Tipps genutzt: <b>${hints}</b><br>
    ❌ Fehlversuche: <b>${tries}</b><br>
    🎖 Rang: <b>${esc(RANKS[RANKS.length - 1])}</b></p>
    <button class="btn sec small" id="againBtn">🎉 Konfetti!</button>
  </div>`;
  $('#againBtn').onclick = () => { fx('win'); confetti(); };
}

/* ---------- Admin-Modus ---------- */
function openAdmin() { adminView = 'main'; $('#admin').hidden = false; document.body.style.overflow = 'hidden'; renderAdmin(); }
function closeAdmin() { $('#admin').hidden = true; document.body.style.overflow = ''; render(); }
function saveData() { lsSet(KEY_D, D); }
function isOverridden() { return !!lsGet(KEY_D); }

function renderAdmin() {
  const box = $('#admin');
  if (!adminAuthed) {
    box.innerHTML = `<div class="wrap"><div class="adm-head"><h2>🔧 Admin</h2><button class="btn sec small" style="width:auto;margin:0" data-act="close">✕</button></div>
      <div class="card"><label class="label" for="pin">PIN</label>
      <input id="pin" type="password" inputmode="numeric" autocomplete="off" style="margin-top:8px">
      <button class="btn" data-act="pin">Entsperren</button><div class="feedback bad" id="pinfb"></div></div></div>`;
    const pin = $('#pin'); pin.focus();
    pin.onkeydown = e => { if (e.key === 'Enter') adminAct('pin'); };
    return;
  }
  if (adminView === 'edit') return renderEditor();
  if (adminView === 'settings') return renderSettings();
  if (adminView === 'import') return renderImport();
  if (adminView === 'invite') return renderInviteEditor();
  const p = here();
  const list = stations().map((s, i) => {
    const d = p ? fmtDist(dist(p, s)) : '–';
    return `<div class="st-item ${i === P.idx ? 'cur' : ''}">
      <div><b>${i + 1}. ${esc(s.title)}</b>${s.free ? '<span class="tag">Start ohne GPS</span>' : ''}${s.final ? '<span class="tag">Finale</span>' : ''}${i === P.idx ? '<span class="tag">aktuell</span>' : ''}</div>
      <div class="meta">${Number(s.lat).toFixed(5)}, ${Number(s.lon).toFixed(5)} · r=${esc(s.radius)} m · Abstand ${d} · Lösung: ${esc((s.answers || [])[0] || '')}${s.fragment ? ' · Fragment ' + esc(s.fragment) : ''}</div>
      <div class="iconbtns">
        <button data-act="edit" data-i="${i}">✏️ Bearbeiten</button>
        <button data-act="here" data-i="${i}">📍 Hier setzen</button>
        <button data-act="jump" data-i="${i}">⏭ Spiel hierher</button>
        <a href="https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=18/${s.lat}/${s.lon}" target="_blank" rel="noopener">🗺 Karte</a>
        <button data-act="up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button data-act="down" data-i="${i}" ${i === stations().length - 1 ? 'disabled' : ''}>↓</button>
        <button data-act="del" data-i="${i}">🗑</button>
      </div></div>`;
  }).join('');
  box.innerHTML = `<div class="wrap">
    <div class="adm-head"><h2>🔧 Admin-Modus</h2><button class="btn sec small" style="width:auto;margin:0" data-act="close">✕ Schließen</button></div>
    <div class="card"><h3>AKTUELLE POSITION</h3><div class="gpsbox" id="admGps"></div>
      <button class="btn" data-act="new">➕ Aktuelle Position als neue Station</button>
      <p class="small">Neue Stationen werden vor dem Finale eingefügt. Danach Texte & Lösung im Editor ergänzen.</p></div>
    <div class="card"><h3>SPIEL</h3>
      <p class="small">Spieler: ${esc(P.name || '–')} · Station ${P.idx + 1} (${esc(P.status)})${P.finishedAt ? ' · beendet' : ''} · manuell freigeschaltet: ${P.forced}</p>
      <div class="row"><button class="btn small" data-act="unlock">🔓 Aktuelle Station freischalten</button>
      <button class="btn sec small" data-act="simTarget">🧪 Am Ziel simulieren</button></div>
      <div class="row"><button class="btn sec small" data-act="sim300">🧪 300 m vor Ziel</button>
      <button class="btn sec small" data-act="simOff">${sim ? '🛑 Simulation aus' : 'Simulation aus'}</button></div>
      <button class="btn danger small" data-act="reset">↺ Fortschritt zurücksetzen</button></div>
    <div class="card"><h3>STATIONEN (${stations().length})</h3>${list}</div>
    ${isMember() ? '' : liveAdminHtml()}
    ${teamAdminHtml()}
    <div class="card"><h3>DATEN</h3>
      <p class="small">${isOverridden() ? '⚠️ Es gibt lokale Änderungen auf diesem Gerät. Damit alle Geräte sie bekommen: JSON exportieren und im Repository als <code>stations.json</code> ersetzen.' : 'Die Stationen kommen aus stations.json.'}</p>
      <div class="row"><button class="btn small" data-act="download">⬇ JSON herunterladen</button>
      <button class="btn sec small" data-act="copy">📋 JSON kopieren</button></div>
      <div class="row"><button class="btn sec small" data-act="import">📥 JSON importieren</button>
      <button class="btn sec small" data-act="settings">⚙️ Spiel-Einstellungen</button></div>
      ${isOverridden() ? '<button class="btn danger small" data-act="discard">Lokale Änderungen verwerfen</button>' : ''}
      <div class="feedback good" id="admfb"></div></div>
  </div>`;
  updateAdminGps();
}
function updateAdminGps() {
  const g = $('#admGps'); if (!g) return;
  const p = here();
  if (!p) { g.textContent = geoErr ? '⚠️ ' + (geoErr.message || 'kein GPS') : 'Warte auf GPS …'; if (watchId === null) startGeo(); return; }
  g.innerHTML = `${sim ? '🧪 SIMULIERT<br>' : ''}Breite: ${p.lat.toFixed(6)}<br>Länge: ${p.lon.toFixed(6)}<br>Genauigkeit: ±${Math.round(p.acc || 0)} m${pos && !sim ? ' · ' + Math.round((Date.now() - pos.t) / 1000) + ' s alt' : ''}`;
}
function blankStation(p) {
  return { id: 'st-' + Date.now().toString(36), title: 'Neue Station', targetName: 'Neue Station', lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6),
    radius: 50, mission: '', story: '', riddle: '', answers: [''], hint: '', fragment: '', solved: '' };
}
function renderEditor() {
  const s = stations()[editIdx];
  const f = (k, label, type = 'input') => `<div class="field"><label for="f_${k}">${label}</label>${type === 'ta'
    ? `<textarea id="f_${k}">${esc(k === 'answers' ? (s.answers || []).join('\n') : s[k])}</textarea>`
    : `<input id="f_${k}" value="${esc(s[k])}" ${['lat', 'lon', 'radius'].includes(k) ? 'inputmode="decimal"' : ''}>`}</div>`;
  $('#admin').innerHTML = `<div class="wrap">
    <div class="adm-head"><h2>✏️ Station ${editIdx + 1}</h2><button class="btn sec small" style="width:auto;margin:0" data-act="back">← Zurück</button></div>
    <div class="card">
      ${f('title', 'Titel (nach Ankunft)')}${f('targetName', 'Zielname (während der Anreise)')}
      <div class="row">${f('lat', 'Breite')}${f('lon', 'Länge')}${f('radius', 'Radius (m)')}</div>
      <button class="btn sec small" data-act="editHere">📍 Aktuelle Position übernehmen</button>
      ${f('mission', 'Auftrag / Anreise (sichtbar vor Ankunft)', 'ta')}
      ${f('story', 'Geschichte bei Ankunft', 'ta')}
      ${f('riddle', 'Rätsel', 'ta')}
      ${f('answers', 'Lösungen (eine pro Zeile, Groß/Klein & Leerzeichen egal)', 'ta')}
      ${f('hint', 'Tipp', 'ta')}
      ${f('fragment', 'Code-Fragment (Buchstabe)')}
      ${f('solved', 'Text nach dem Lösen (inkl. Weg zur nächsten Station)', 'ta')}
      <label class="chk"><input type="checkbox" id="f_free" ${s.free ? 'checked' : ''}> Ohne GPS freischalten (Startstation)</label>
      <label class="chk"><input type="checkbox" id="f_final" ${s.final ? 'checked' : ''}> Finale (Codewort-Eingabe, danach Siegerbildschirm)</label>
      <p class="small">Formatierung: **fett**, {name} = Agentenname.</p>
      <button class="btn" data-act="editSave">💾 Speichern</button>
    </div></div>`;
}
function renderSettings() {
  $('#admin').innerHTML = `<div class="wrap">
    <div class="adm-head"><h2>⚙️ Spiel-Einstellungen</h2><button class="btn sec small" style="width:auto;margin:0" data-act="back">← Zurück</button></div>
    <div class="card">
      <div class="field"><label for="s_title">Titel</label><input id="s_title" value="${esc(D.title)}"></div>
      <div class="field"><label for="s_lock">Code für das Tresor-Schloss (Siegerbildschirm)</label><input id="s_lock" value="${esc(D.lockCode)}"></div>
      <div class="field"><label for="s_pin">Admin-PIN</label><input id="s_pin" value="${esc(D.adminPin)}"></div>
      <div class="field"><label for="s_intro">Intro-Geschichte</label><textarea id="s_intro" style="min-height:180px">${esc(D.intro)}</textarea></div>
      <div class="field"><label for="s_finale">Finale-Text</label><textarea id="s_finale" style="min-height:140px">${esc(D.finale)}</textarea></div>
      <button class="btn" data-act="settingsSave">💾 Speichern</button>
    </div></div>`;
}
function renderImport() {
  $('#admin').innerHTML = `<div class="wrap">
    <div class="adm-head"><h2>📥 JSON importieren</h2><button class="btn sec small" style="width:auto;margin:0" data-act="back">← Zurück</button></div>
    <div class="card"><textarea id="impTa" style="min-height:260px;font-family:var(--mono);font-size:12px" placeholder='{"title": …, "stations": [ … ]}'></textarea>
    <button class="btn" data-act="importDo">Übernehmen</button><div class="feedback bad" id="impfb"></div></div></div>`;
}
function exportJson() { return JSON.stringify(D, null, 2); }
function admMsg(t) { const e = $('#admfb'); if (e) e.textContent = t; }

function adminAct(act, i) {
  const list = stations();
  const p = here();
  switch (act) {
    case 'close': return closeAdmin();
    case 'back': adminView = 'main'; return renderAdmin();
    case 'pin':
      if (String($('#pin').value) === String(D.adminPin || '1212')) { adminAuthed = true; renderAdmin(); }
      else $('#pinfb').textContent = 'Falsche PIN';
      return;
    case 'new': {
      if (!p) return alert('Noch keine GPS-Position.');
      const fi = list.findIndex(s => s.final);
      const at = fi >= 0 ? fi : list.length;
      list.splice(at, 0, blankStation(p));
      if (P.idx >= at) P.idx++;
      saveData(); save(); editIdx = at; adminView = 'edit'; return renderEditor();
    }
    case 'here':
      if (!p) return alert('Noch keine GPS-Position.');
      if (!confirm(`Koordinaten von „${list[i].title}“ auf die aktuelle Position setzen (±${Math.round(p.acc || 0)} m)?`)) return;
      list[i].lat = +p.lat.toFixed(6); list[i].lon = +p.lon.toFixed(6); saveData(); return renderAdmin();
    case 'edit': editIdx = i; adminView = 'edit'; return renderEditor();
    case 'editHere':
      if (!p) return alert('Noch keine GPS-Position.');
      $('#f_lat').value = p.lat.toFixed(6); $('#f_lon').value = p.lon.toFixed(6); return;
    case 'editSave': {
      const s = list[editIdx], v = k => $('#f_' + k).value;
      const lat = parseFloat(v('lat').replace(',', '.')), lon = parseFloat(v('lon').replace(',', '.')), r = parseFloat(v('radius').replace(',', '.'));
      if (!isFinite(lat) || !isFinite(lon) || !isFinite(r)) return alert('Breite, Länge und Radius müssen Zahlen sein.');
      Object.assign(s, { title: v('title'), targetName: v('targetName'), lat, lon, radius: r, mission: v('mission'), story: v('story'),
        riddle: v('riddle'), answers: v('answers').split('\n').map(x => x.trim()).filter(Boolean), hint: v('hint'),
        fragment: v('fragment').trim(), solved: v('solved') });
      if ($('#f_free').checked) s.free = true; else delete s.free;
      if ($('#f_final').checked) s.final = true; else delete s.final;
      saveData(); adminView = 'main'; return renderAdmin();
    }
    case 'up': case 'down': {
      const j = act === 'up' ? i - 1 : i + 1;
      [list[i], list[j]] = [list[j], list[i]];
      if (P.idx === i) P.idx = j; else if (P.idx === j) P.idx = i;
      saveData(); save(); return renderAdmin();
    }
    case 'del':
      if (!confirm(`Station „${list[i].title}“ löschen?`)) return;
      list.splice(i, 1);
      if (P.idx > i || P.idx >= list.length) P.idx = Math.max(0, P.idx - 1);
      saveData(); save(); return renderAdmin();
    case 'jump':
      P.idx = i; P.status = 'travel'; P.finishedAt = null;
      if (!P.name) P.name = 'Test'; if (!P.startedAt) P.startedAt = Date.now();
      save(); return admMsg('Spiel steht jetzt auf Station ' + (i + 1) + '.');
    case 'unlock':
      if (!P.name) return alert('Erst das Spiel starten (Agentenname eingeben).');
      P.status = 'arrived'; save(); return closeAdmin();
    case 'simTarget': { const st = cur(); sim = { lat: st.lat, lon: st.lon, acc: 5 }; onPos(); return renderAdmin(); }
    case 'sim300': { const st = cur(); sim = { lat: st.lat + 0.0027, lon: st.lon, acc: 8 }; onPos(); return renderAdmin(); }
    case 'simOff': sim = null; onPos(); return renderAdmin();
    case 'reset':
      if (!confirm('Gesamten Spielfortschritt löschen? (Stationen bleiben erhalten.)')) return;
      P = newProgress(); save(); sim = null; liveReset(); return closeAdmin();
    case 'download': {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' }));
      a.download = 'stations.json'; document.body.appendChild(a); a.click(); a.remove();
      return admMsg('Download gestartet.');
    }
    case 'copy':
      (navigator.clipboard ? navigator.clipboard.writeText(exportJson()) : Promise.reject())
        .then(() => admMsg('JSON in die Zwischenablage kopiert.'), () => { adminView = 'import'; renderImport(); $('#impTa').value = exportJson(); $('#impTa').select(); });
      return;
    case 'import': adminView = 'import'; return renderImport();
    case 'importDo':
      try {
        const nd = JSON.parse($('#impTa').value);
        if (!nd || !Array.isArray(nd.stations) || !nd.stations.length) throw new Error('Feld "stations" fehlt oder ist leer.');
        nd.stations.forEach((s, k) => { if (!isFinite(s.lat) || !isFinite(s.lon)) throw new Error('Station ' + (k + 1) + ' hat keine gültigen Koordinaten.'); });
        D = nd; saveData(); if (P.idx >= D.stations.length) P.idx = 0; save(); adminView = 'main'; return renderAdmin();
      } catch (e) { $('#impfb').textContent = 'Fehler: ' + e.message; return; }
    case 'settings': adminView = 'settings'; return renderSettings();
    case 'settingsSave':
      D.title = $('#s_title').value; D.lockCode = $('#s_lock').value; D.adminPin = $('#s_pin').value.trim() || '1212';
      D.intro = $('#s_intro').value; D.finale = $('#s_finale').value;
      saveData(); adminView = 'main'; return renderAdmin();
    case 'discard':
      if (!confirm('Alle lokalen Stations-Änderungen verwerfen und stations.json neu laden?')) return;
      lsDel(KEY_D); D = JSON.parse(JSON.stringify(BASE)); if (P.idx >= D.stations.length) P.idx = 0; save(); return renderAdmin();
    default: return act.startsWith('team') ? teamAdminAct(act) : liveAdminAct(act);
  }
}
$('#admin').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  adminAct(b.dataset.act, b.dataset.i != null ? +b.dataset.i : undefined);
});

/* Admin öffnen: 5× aufs Logo tippen oder ?admin an die URL hängen */
let taps = [];
$('#logo').addEventListener('click', () => {
  const now = Date.now(); taps = taps.filter(t => now - t < 2500); taps.push(now);
  if (taps.length >= 5) { taps = []; openAdmin(); }
});

/* ---------- Start ---------- */
async function init() {
  try { const r = await fetch('stations.json', { cache: 'no-cache' }); BASE = await r.json(); } catch (e) { BASE = null; }
  D = lsGet(KEY_D) || (BASE && JSON.parse(JSON.stringify(BASE)));
  if (!D || !Array.isArray(D.stations) || !D.stations.length) {
    app.innerHTML = '<div class="card"><h2>Fehler</h2><p>stations.json konnte nicht geladen werden. Bitte Internetverbindung prüfen und neu laden.</p></div>';
    return;
  }
  document.title = D.title.split('–')[0].trim() || 'Operation S7';
  if (location.hash.startsWith('#papa=')) {
    P = newProgress(); renderHeader();
    setInterval(tick, 1000);
    return initPapa(decodeURIComponent(location.hash.slice(6)));
  }
  P = Object.assign(newProgress(), lsGet(KEY_P) || {});
  if (P.idx >= D.stations.length) P.idx = D.stations.length - 1;
  teamInit();
  if (isMember()) P.name = memberReady() ? TEAM.name : '';
  render();
  if (P.name && !P.finishedAt) { startGeo(); keepAwake(); }
  setInterval(tick, 1000);
  $('#funk').onclick = openChat;
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kidPoll(); });
  if (new URLSearchParams(location.search).has('admin')) openAdmin();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
