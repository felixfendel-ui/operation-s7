/* Erweiterungen: Offline-Paket, Papa-Fernsteuerung & Live-Überraschungen, Maulwurf-Verfolgung,
   Akku-Sparen, Zentrale übernehmen, Papas eigene Sprachnachrichten, Diashow.
   Wird vor app.js geladen; nutzt Helfer der anderen Module erst zur Laufzeit. */
'use strict';

/* =========================================================================
   1) Offline-Paket: alle Funksprüche vorab in den Gerätespeicher (Cache API)
   ========================================================================= */
window.AUDIO_BLOBS = {};
const OFFLINE_CACHE = () => 'sj7-audio-v' + AUDIO_V;
let PAPA_VOICES = [];
fetch('audio/papa.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : [])).then(j => { PAPA_VOICES = Array.isArray(j) ? j : []; }).catch(() => {});

async function audioFileList() {
  const idx = await (await fetch('audio/index.json', { cache: 'no-cache' })).json();
  const v = '?v=' + AUDIO_V;
  const files = idx.map(h => 'audio/' + h + '.m4a' + v);
  files.push('audio/test.m4a' + v);
  D.stations.filter(s => s.morse).forEach(s => files.push('audio/morse-' + s.morse + '.m4a' + v));
  PAPA_VOICES.forEach(n => files.push('audio/' + n + '.m4a' + v));
  return files;
}
async function loadOfflinePack(progress) {
  const files = await audioFileList(), c = await caches.open(OFFLINE_CACHE());
  let n = 0;
  for (const f of files) {
    let hit = await c.match(f);
    if (!hit) { const r = await fetch(f, { cache: 'no-cache' }); if (!r.ok) throw new Error('Download fehlgeschlagen'); await c.put(f, r.clone()); hit = r; }
    progress && progress(++n, files.length);
  }
  lsSet('sj7_offline', { v: AUDIO_V, t: Date.now(), n: files.length });
  await warmBlobs();
  return files.length;
}
/* Blob-Adressen vorbereiten, damit das Abspielen sofort (im Tippen) starten kann – auch ohne Netz */
async function warmBlobs() {
  try {
    const st = lsGet('sj7_offline');
    if (!st || st.v !== AUDIO_V || !('caches' in window)) return;
    const c = await caches.open(OFFLINE_CACHE());
    for (const req of await c.keys()) {
      const u = new URL(req.url), key = u.pathname.split('/').slice(-2).join('/') + u.search;
      if (AUDIO_BLOBS[key]) continue;
      const r = await c.match(req); if (r) AUDIO_BLOBS[key] = URL.createObjectURL(await r.blob());
    }
  } catch (e) {}
}
const offlineReady = () => { const st = lsGet('sj7_offline'); return !!(st && st.v === AUDIO_V); };
const OFFLINE_DONE = '📥 Offline-Paket geladen ✓ – Funksprüche laufen auch ohne Netz.';
function offlineCardHtml() {
  return `<div class="offlinebox">${offlineReady() ? OFFLINE_DONE
    : '<b>📥 Offline-Paket</b><br><span class="small">Lädt alle Funksprüche aufs Handy (ca. 7 MB, am besten im WLAN). Dann laufen sie auch im Funkloch.</span><button type="button" class="btn sec small" data-offline="1">Jetzt laden</button>'}</div>`;
}
/* Der Knopf kann mehrfach auf der Seite stehen (Startseite + Technik-Check darüber) – daher per Klick-Delegation */
let offlineLoading = false;
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-offline]');
  if (!b || offlineLoading) return;
  offlineLoading = true;
  const all = () => document.querySelectorAll('[data-offline]');
  all().forEach(x => { x.disabled = true; });
  try {
    await loadOfflinePack((i, n) => all().forEach(x => { x.textContent = `Lade … ${i}/${n}`; }));
    document.querySelectorAll('.offlinebox').forEach(box => { box.innerHTML = OFFLINE_DONE; });
  } catch (err) {
    all().forEach(x => { x.disabled = false; x.textContent = '⚠️ Fehlgeschlagen – nochmal versuchen'; });
  } finally { offlineLoading = false; }
});
function bindOffline() { /* nicht mehr nötig (Klick-Delegation), bleibt für bestehende Aufrufe */ }
warmBlobs();

/* =========================================================================
   2) Papas eigene Sprachnachrichten (audio/papa-start|halbzeit|finale.m4a)
   ========================================================================= */
function papaVoiceFor(text) {
  if (!PAPA_VOICES.length || !D) return '';
  const kl = D.stations.find(s => s.id === 'kloster-schaeftlarn');
  let name = '';
  if (text === D.intro) name = 'papa-start';
  else if (kl && text === kl.solved) name = 'papa-halbzeit';
  else if (String(text).startsWith(D.finale)) name = 'papa-finale';
  return name && PAPA_VOICES.includes(name) ? 'audio/' + name + '.m4a?v=' + AUDIO_V : '';
}

/* =========================================================================
   3) Papa-Fernsteuerung (Befehle über den Papa-Kanal, ausgeführt auf Jaspers Handy)
   ========================================================================= */
const CMD = '⚙';
const BONUS_TASKS = [
  '🎤 **Agenten-Hymne:** Denkt euch zusammen einen Schlachtruf für die Einheit ISAR aus und ruft ihn laut (aber nicht in der S-Bahn).',
  '🕵️ **Beschattung:** Wählt unauffällig einen Passanten aus und beschreibt ihn danach so genau wie möglich – ohne nochmal hinzusehen.',
  '🧠 **Gedächtnis-Test:** Wer kann alle Decknamen des Teams auswendig aufsagen?',
  '🤫 **Tarnung:** Geht die nächsten 2 Minuten so unauffällig wie möglich – niemand darf lachen.',
  '🔢 **Codezahl:** Findet in eurer Umgebung drei verschiedene Zahlen und rechnet sie zusammen. Das Ergebnis funkt ihr an Papa.'
];
function handlePapaCmd(m) {
  LIVE.cmdSeen = LIVE.cmdSeen || [];
  if (LIVE.cmdSeen.includes(m.id)) return;
  LIVE.cmdSeen.push(m.id); LIVE.cmdSeen = LIVE.cmdSeen.slice(-100); saveLive();
  if (isMember() || !P || !P.name || P.finishedAt) return;
  if (Date.now() / 1000 - m.time > 30 * 60) return; // alte Befehle nicht nachträglich ausführen
  let c; try { c = JSON.parse(m.message.slice(CMD.length)); } catch (e) { return; }
  if (c.i !== undefined && c.i !== P.idx && c.c !== 'sabotage' && c.c !== 'bonus' && c.c !== 'mole') return;
  const st = cur(), sid = st.id || P.idx;
  switch (c.c) {
    case 'unlock': if (P.status === 'travel') unlock(true, 'Papa', 'papa'); break;
    case 'skip':
      if (P.status === 'travel') unlock(true, 'Papa', 'papa');
      if (P.status === 'arrived') { P.photos = P.photos || {}; if (st.photo) P.photos[P.idx] = { by: 'Papa', skip: true }; solve('Papa', 'papa'); }
      break;
    case 'hint': P.hints[sid] = true; save(); render(); liveEvent('hint', `Station ${P.idx + 1}: Tipp von Papa freigeschaltet`, st.title); break;
    case 'sabotage': setSabotage(); liveEvent('task', '🦡 Maulwurf-Sabotage gestartet', '2 Minuten kein Richtungspfeil', 2); break;
    case 'bonus': setTeamEvent({ type: 'bonus', text: String(c.text || BONUS_TASKS[0]).slice(0, 300) }); liveEvent('task', '🎁 Bonusauftrag gesendet', String(c.text || '').replace(/\*\*/g, '').slice(0, 120), 2); break;
    case 'mole': P.moleOffset = (P.moleOffset || 0) + (Number(c.min) || 0); save(); render(); break;
  }
}
function papaSendCmd(c) { return publish({ topic: tp('papa'), title: 'Zentrale', message: CMD + JSON.stringify(c), priority: 2 }); }
function papaRemoteHtml() {
  return `<div class="card" id="pRemote"><div class="label">🎛 Fernsteuerung (wirkt auf Jaspers Handy)</div>
    <div class="row"><button class="btn sec small" data-pc="unlock">🔓 Station öffnen</button><button class="btn sec small" data-pc="skip">⏭ Station überspringen</button></div>
    <div class="row"><button class="btn sec small" data-pc="hint">💡 Tipp freischalten</button><button class="btn sec small" data-pc="sabotage">🦡 Maulwurf-Sabotage</button></div>
    <div class="field"><label for="pBonus">🎁 Bonusauftrag</label><select id="pBonus">${BONUS_TASKS.map((t, i) => `<option value="${i}">${esc(t.replace(/\*\*/g, '').slice(0, 70))}</option>`).join('')}</select></div>
    <button class="btn sec small" data-pc="bonus">🎁 Bonusauftrag senden</button>
    <div class="row"><button class="btn sec small" data-pc="mole-">🦡 Maulwurf bremsen (−10 Min.)</button><button class="btn sec small" data-pc="mole+">🦡 Maulwurf beschleunigen (+10 Min.)</button></div>
    <p class="small">Öffnen/Überspringen helfen bei S-Bahn-Ausfall, GPS-Problemen oder Zeitnot. Befehle kommen an, sobald Jaspers App offen ist.</p>
    <div class="feedback" id="pRemoteFb"></div></div>`;
}
function bindPapaRemote() {
  document.querySelectorAll('[data-pc]').forEach(b => {
    b.onclick = async () => {
      const k = b.dataset.pc, i = PS.snap ? Number(PS.snap.i) : undefined;
      const labels = { unlock: 'die aktuelle Station öffnen', skip: 'die aktuelle Station überspringen (gilt als gelöst)', hint: 'den Tipp freischalten', sabotage: 'eine Maulwurf-Sabotage starten (2 Min. kein Pfeil)', bonus: 'den Bonusauftrag senden' };
      const stName = PS.snap && D.stations[i] ? ` (Station ${i + 1}: ${D.stations[i].title})` : '';
      if (labels[k] && !confirm(`Wirklich ${labels[k]}${['unlock', 'skip', 'hint'].includes(k) ? stName : ''}?`)) return;
      const c = k === 'bonus' ? { c: 'bonus', text: BONUS_TASKS[+$('#pBonus').value] }
        : k === 'mole-' ? { c: 'mole', min: -10 } : k === 'mole+' ? { c: 'mole', min: 10 } : { c: k, i };
      const fb = $('#pRemoteFb');
      try { await papaSendCmd(c); fb.className = 'feedback good'; fb.textContent = 'Befehl gesendet ✓'; }
      catch (e) { fb.className = 'feedback bad'; fb.textContent = 'Senden fehlgeschlagen: ' + e.message; }
    };
  });
}

/* =========================================================================
   4) Live-Ereignisse fürs ganze Team (Sabotage, Bonusauftrag) – über den Team-Stand
   ========================================================================= */
let lastEvId = '';
function setTeamEvent(ev) {   // Bonusauftrag
  ev.id = 'e' + Date.now().toString(36);
  P.ev = ev; save(); showTeamEvent(ev); render();
}
function setSabotage() {      // eigener Speicherplatz, damit ein Bonusauftrag die Sabotage nicht überschreibt
  P.sab = { id: 's' + Date.now().toString(36), type: 'sabotage', until: Date.now() + 120000 };
  save(); showTeamEvent(P.sab); render();
}
const sabotageActive = () => !!(P && P.sab && Date.now() < P.sab.until);
const shownEvents = new Set();
function showTeamEvent(ev) {
  if (!ev || shownEvents.has(ev.id)) return;
  if (!$('#exmodal').hidden) { if (!popupQueue.some(q => q.key === 'ev' + ev.id)) popupQueue.push({ key: 'ev' + ev.id, fn: () => showTeamEvent(ev) }); return; }
  shownEvents.add(ev.id);
  if (ev.type === 'sabotage' && Date.now() < ev.until) {
    fx('bad');
    openExModal(`<div class="center"><div class="stamp" style="border-color:var(--danger);color:var(--danger)">🦡 MAULWURF-SABOTAGE</div>
      <p style="font-size:18px">Der Maulwurf hat einen <b>Störsender</b> eingeschaltet! Für 2 Minuten fällt der Richtungspfeil auf allen Handys aus.</p>
      <p>Navigiert jetzt nur mit <b>Entfernung</b> und <b>heiß/kalt</b> – schafft ihr das?</p>
      <button class="btn" id="exOk">Verstanden, Agenten!</button></div>`);
    setTimeout(() => { if (P.status === 'travel') render(); }, Math.max(0, ev.until - Date.now()) + 500);
  }
  if (ev.type === 'bonus') {
    fx('unlock');
    const done = P.bonusDone && P.bonusDone[ev.id];
    openExModal(`<div class="center"><div class="stamp">🎁 BONUSAUFTRAG</div>
      <p style="text-align:left;font-size:18px">${rich(ev.text)}</p>
      ${done ? '<p class="feedback good">✅ Erledigt</p><button class="btn" id="exOk">OK</button>'
        : `<button class="btn" id="bonusDone">✅ Erledigt (+30)</button><button class="btn sec small" id="exOk">Später</button>`}</div>`);
    const b = $('#bonusDone'); if (b) b.onclick = () => { closeExModal(); requestBonusDone(ev.id); };
  }
}
function requestBonusDone(id) {
  if (isMember()) { teamAct('bonus', { e: id }); P.bonusDone = Object.assign({}, P.bonusDone, { [id]: 1 }); fx('good'); return; }
  completeBonus(id, P.name);
}
function completeBonus(id, by) {
  P.bonusDone = P.bonusDone || {};
  if (!P.ev || P.ev.id !== id || P.bonusDone[id]) return;
  P.bonusDone[id] = 1; awardBoth(30); save(); fx('good');
  liveEvent('task', `🎁 Bonusauftrag erledigt${by ? ' – ' + by : ''}`, `+30 Punkte · gesamt ${P.pts}`, 2);
}
/* ---------- Geheimes Ziel aufdecken (kostet Punkte) ---------- */
/* Stufe 1 = Hinweis (−10), Stufe 2 = Zielname (−20) */
const revealLevel = k => (P && P.revealed && Number(P.revealed[k])) || 0;
const isRevealed = k => revealLevel(k) >= 2;
function requestReveal() {
  const st = cur(), lv = revealLevel(P.idx) < 1 && st.wayHint ? 1 : 2, cost = lv === 1 ? 10 : 20;
  if (!confirm(lv === 1 ? `Einen Hinweis zum Ziel anfordern? Das kostet ${cost} Agentenpunkte.` : `Ziel aufdecken? Dann seht ihr den echten Namen – das kostet ${cost} Agentenpunkte.`)) return;
  if (isMember()) { teamAct('reveal', { lv }); P.revealed = Object.assign({}, P.revealed, { [P.idx]: lv }); render(); return; }
  doReveal(P.idx, P.name, lv);
}
function doReveal(k, by, lv) {
  lv = lv === 1 ? 1 : 2;
  P.revealed = P.revealed || {};
  if (k !== P.idx || revealLevel(k) >= lv) return;
  P.revealed[k] = lv;
  const cost = lv === 1 ? 10 : 20;
  P.pts = Math.max(0, (P.pts || 0) - cost);
  if (teamOn()) { P.tp.A = Math.max(0, (P.tp.A || 0) - cost / 2); P.tp.B = Math.max(0, (P.tp.B || 0) - cost / 2); }
  save(); render();
  liveEvent('hint', `Station ${k + 1}: ${lv === 1 ? 'Hinweis zum Ziel' : 'Ziel aufgedeckt'}${by ? ' – ' + by : ''}`, lv === 1 ? String(D.stations[k].wayHint || '').replace(/\*\*/g, '') : D.stations[k].targetName || '', 2);
}
function moreHostApply(a) {
  if (a.k === 'reveal') { doReveal(Number(a.i), a.n, Number(a.lv) === 1 ? 1 : 2); return true; }
  if (a.k === 'bonus') { completeBonus(String(a.e || ''), a.n); return true; }
  return false;
}
function moreStateFields() { return { rv: P.revealed || {}, ev: P.ev || null, sab: P.sab || null, bd: P.bonusDone || {}, mo: P.moleOffset || 0, hid: myId(), lp: liveOn() ? LIVE.topic : '' }; }
function moreApplyState(s) {
  P.moleOffset = Number(s.mo) || 0;
  P.revealed = {}; if (s.rv && typeof s.rv === 'object') Object.entries(s.rv).forEach(([k, v]) => { if (D.stations[+k]) P.revealed[+k] = Number(v) === 1 ? 1 : 2; });
  P.bonusDone = s.bd && typeof s.bd === 'object' ? s.bd : {};
  TEAM.lp = typeof s.lp === 'string' ? s.lp.slice(0, 64) : '';
  const ev = s.ev && typeof s.ev === 'object' ? { id: String(s.ev.id || '').slice(0, 20), type: 'bonus', text: String(s.ev.text || '').slice(0, 300) } : null;
  const sab = s.sab && typeof s.sab === 'object' ? { id: String(s.sab.id || '').slice(0, 20), type: 'sabotage', until: Number(s.sab.until) || 0 } : null;
  P.ev = ev; P.sab = sab;
  if (sab && memberReady() && Date.now() < sab.until) showTeamEvent(sab);
  if (ev && memberReady()) showTeamEvent(ev);
}

/* =========================================================================
   5) Maulwurf-Verfolgung: der Maulwurf rückt nach einem Zeitplan vor
   ========================================================================= */
const MOLE_PLAN = [0, 35, 60, 80, 110, 150, 200, 235, 255, 300]; // Minuten ab Start bis zur jeweiligen Station
function moleIdx() {
  if (!P || !P.startedAt) return 0;
  const min = (Date.now() - P.startedAt) / 60000 - (P.moleOffset || 0);
  let i = 0; MOLE_PLAN.forEach((m, k) => { if (min >= m) i = k; });
  return Math.min(i, D.stations.length - 1);
}
function moleHtml() {
  if (!P || !P.startedAt || P.finishedAt) return '';
  const m = moleIdx(), me = P.idx, n = D.stations.length;
  const dots = D.stations.map((s, k) => `<span class="${k === me ? 'me' : ''} ${k === m ? 'mole' : ''} ${k < me ? 'done' : ''}">${k === m && k === me ? '⚔️' : k === m ? '🦡' : k === me ? '🕵️' : '·'}</span>`).join('');
  const txt = me > m ? `Ihr seid <b>vor dem Maulwurf</b> – Vorsprung-Bonus wartet am Ziel!` : me === m ? 'Kopf an Kopf mit dem Maulwurf!' : `Der Maulwurf ist <b>${m - me} Station${m - me > 1 ? 'en' : ''} voraus</b>.`;
  return `<div class="molebar"><div class="moletrack">${dots}</div><div class="small">🦡 ${txt} <span class="muted">(Nicht rennen – Sicherheit geht vor!)</span></div></div>`;
}
function moleArrived() {
  if (moleIdx() < P.idx) { awardBoth(10); flashBonus('🦡 Vorsprung vor dem Maulwurf: +10 für beide Trupps'); }
}

/* =========================================================================
   6) Akku sparen: nur Zentrale und Navigatoren halten den Bildschirm wach
   ========================================================================= */
function needAwake() {
  if (!P || !P.name || P.finishedAt) return false;
  if (!teamOn() || !isMember()) return true;          // Zentrale (Jasper) bleibt immer wach
  return P.status !== 'travel' || canNavigate();       // Mitspieler: nur als Navigator unterwegs
}
async function releaseAwake() { try { if (wakeLock && !wakeLock.released) await wakeLock.release(); } catch (e) {} wakeLock = null; }
function akkuHtml() {
  if (!teamOn() || !isMember() || P.status !== 'travel' || canNavigate()) return '';
  return `<div class="akkubox">🔋 <b>Akku sparen:</b> Du bist gerade nicht Navigator – dein Handy darf in die Tasche. <b>Am Ziel kurz entsperren</b>, damit es sich als „da“ meldet.</div>`;
}

/* =========================================================================
   7) Zentrale übernehmen, wenn Jaspers Handy ausfällt
   ========================================================================= */
let takeoverWait = null, stateSeenAt = 0;
function noteStateSeen() { stateSeenAt = Date.now(); }
function takeoverHtml() { return isMember() && memberReady() ? '<button class="btn sec small" id="takeoverBtn">📡 Jaspers Handy (Zentrale) antwortet nicht?</button><div class="small" id="takeoverFb"></div>' : ''; }
function bindTakeover() {
  const b = $('#takeoverBtn');
  if (!b) return;
  b.onclick = () => {
    const fb = $('#takeoverFb'), t0 = Date.now();
    b.disabled = true; fb.textContent = '📡 Rufe die Zentrale … (bis zu 30 Sekunden)';
    teamPublish({ k: 'hello', id: TEAM.id, n: TEAM.name });
    clearTimeout(takeoverWait);
    takeoverWait = setTimeout(() => {
      if (stateSeenAt > t0) { fb.textContent = '✅ Die Zentrale hat geantwortet – alles in Ordnung.'; b.disabled = false; return; }
      fb.textContent = '❌ Keine Antwort von der Zentrale.';
      if (confirm('Jaspers Handy antwortet nicht. Soll DIESES Handy die Zentrale übernehmen?\n\nNur EIN Handy im Team darf das tun – sprecht euch ab!')) takeover();
      else b.disabled = false;
    }, 30000);
  };
}
function takeover() {
  TEAM.role = 'host';
  TEAM.v = (TEAM.v || 0) + 1000;            // neuer Stand gewinnt gegenüber allem Bisherigen
  P.name = TEAM.name;
  Object.keys(P.frags || {}).forEach(k => { const st = D.stations[+k]; if (st && st.fragment) P.frags[k] = st.fragment; }); // echte Fragmente wiederherstellen
  if (TEAM.lp) { LIVE = { enabled: true, topic: TEAM.lp, server: NTFY }; saveLive(); }
  saveTeam(); lsSet(KEY_P, P);
  closeExModal();
  lastBcast = ''; broadcast(); streamStart();
  liveEvent('help', `📡 Zentrale gewechselt: ${TEAM.name} übernimmt`, 'Jaspers Handy hat nicht mehr geantwortet', 5);
  alert('Dieses Handy ist jetzt die Zentrale. Lasst die App hier immer geöffnet!');
  render();
}
/* Altes Zentralen-Handy meldet sich wieder: es wird zum Mitspieler */
function maybeDemote(a) {
  if (!isHost() || a.k !== 'state' || !a.hid || a.hid === myId() || (Number(a.v) || 0) <= (TEAM.v || 0)) return false;
  TEAM.role = 'member'; TEAM.name = P.name || TEAM.name || 'Jasper'; TEAM.alias = myAlias();
  saveTeam();
  applyState(a);
  alert('Ein anderes Handy hat die Zentrale übernommen. Dieses Handy spielt jetzt als Agent weiter.');
  return true;
}

/* =========================================================================
   8) Diashow (für den Fernseher – per AirPlay/Bildschirmsynchronisation)
   ========================================================================= */
function slideshow(list) {
  if (!list.length) return;
  const box = document.createElement('div'); box.className = 'slideshow';
  document.body.appendChild(box);
  let i = 0, timer = null;
  const show = () => {
    const p = list[i % list.length];
    box.innerHTML = `<img src="${URL.createObjectURL(p.blob)}" alt=""><div class="cap">📸 ${esc((D.stations[p.k] || {}).title || '')}</div><div class="hint">Tippen zum Beenden</div>`;
    i++;
  };
  show(); timer = setInterval(show, 4500);
  try { (box.requestFullscreen || box.webkitRequestFullscreen || (() => {})).call(box); } catch (e) {}
  box.onclick = () => { clearInterval(timer); try { document.fullscreenElement && document.exitFullscreen(); } catch (e) {} box.remove(); };
}
