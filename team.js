/* Team-Modus: alle Kinder spielen auf eigenen Handys, gemeinsamer Spielstand über ntfy.sh.
   Jaspers Handy ist die Zentrale (Host): Es hält den Spielstand, wendet Aktionen der anderen an
   und sendet den Stand an alle. Mitspieler senden nur Aktionen (beitreten, freischalten, lösen …),
   aber KEINE Standorte. Kanal: TEAM.topic (eigener Zufallsname, getrennt vom Papa-Kanal).
   Wird vor app.js geladen. */
'use strict';

const KEY_T = 'sj7_team';
const tRead = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
let TEAM = Object.assign({ topic: '', role: '', id: '', name: '', since: 0, v: 0, members: [], seen: [] }, tRead(KEY_T) || {});
let navOverride = -1, codeOverride = -1, joinTimer = null, bcastTimer = null, heartbeat = null, wakeLock = null;
const unlockSent = {};
const STREAMS = {};

const saveTeam = () => { TEAM.seen = TEAM.seen.slice(-300); lsSet(KEY_T, TEAM); };
const isHost = () => TEAM.role === 'host' && !!TEAM.topic;
const isMember = () => TEAM.role === 'member' && !!TEAM.topic;
const myId = () => (isMember() ? TEAM.id : 'host');
const myMember = () => (TEAM.members || []).find(m => m.id === myId());
const teamOn = () => !!TEAM.topic && (TEAM.members || []).length >= 2;
const teamNames = () => (teamOn() ? TEAM.members.map(m => m.name) : undefined);
const joinLink = () => location.origin + location.pathname + '#team=' + encodeURIComponent(TEAM.topic);
const TRUPP = { A: '🟥 Trupp A', B: '🟦 Trupp B' };

/* ---------- Echtzeit-Stream (Server-Sent Events von ntfy) ---------- */
function openStream(key, topic, sinceFn, onMsg) {
  const old = STREAMS[key];
  if (old) { clearTimeout(old.retry); if (old.es) old.es.close(); }
  if (!topic || typeof EventSource === 'undefined') return;
  const es = new EventSource(`${NTFY}/${topic}/sse?since=${sinceFn()}`);
  const s = STREAMS[key] = { topic, es, sinceFn, onMsg, ok: false, retry: null };
  es.onopen = () => { s.ok = true; netUi(); };
  es.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch (x) { return; }
    if (m.event === 'message') onMsg(m);
  };
  es.onerror = () => {
    s.ok = false; es.close(); netUi();
    clearTimeout(s.retry); s.retry = setTimeout(() => openStream(key, topic, sinceFn, onMsg), 4000);
  };
}
function streamsRestart() { Object.entries(STREAMS).forEach(([k, s]) => openStream(k, s.topic, s.sinceFn, s.onMsg)); }
function streamStart() {
  if (TEAM.topic && !STREAMS.team) openStream('team', TEAM.topic, () => (TEAM.since ? TEAM.since : (isMember() ? 'all' : Math.floor(Date.now() / 1000) - 60)), handleTeamMsg);
  if (!isMember() && liveOn() && P && P.name && !PAPA && (!STREAMS.papa || STREAMS.papa.topic !== tp('papa')))
    openStream('papa', tp('papa'), () => LIVE.papaSince || Math.floor((P.startedAt || Date.now()) / 1000) - 60, m => { LIVE.papaSince = Math.max(LIVE.papaSince || 0, m.time); saveLive(); handlePapaMsg(m); });
}
function netUi() {
  const el = $('#netdot');
  if (!el) return;
  const list = Object.values(STREAMS);
  el.hidden = !list.length;
  el.className = list.every(s => s.ok) ? 'ok' : 'bad';
  el.title = list.every(s => s.ok) ? 'Verbunden' : 'Keine Verbindung – versuche es weiter';
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  streamsRestart(); flush(); keepAwake();
});

/* Bildschirm wach halten, solange das Spiel läuft (sonst pausiert der Browser GPS und Funk). */
async function keepAwake() {
  try {
    if (!('wakeLock' in navigator) || document.hidden || !P || !P.name || P.finishedAt) return;
    if (wakeLock && !wakeLock.released) return;
    wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) {}
}

/* ---------- Nachrichten senden ---------- */
function teamPublish(obj, dedupeKey) {
  if (!TEAM.topic) return;
  enqueue({ topic: TEAM.topic, message: JSON.stringify(obj), priority: 1, _k: dedupeKey });
}
function teamAct(k, data) { teamPublish(Object.assign({ k, id: TEAM.id, n: TEAM.name, i: P.idx }, data || {})); }
function broadcast() {
  if (!isHost()) return;
  clearTimeout(bcastTimer);
  bcastTimer = setTimeout(() => {
    TEAM.v++; saveTeam();
    teamPublish({ k: 'state', v: TEAM.v, t: Date.now(), i: P.idx, s: P.status, st: P.startedAt, fin: P.finishedAt, n: P.name || 'Jasper',
      h: Object.keys(P.hints), fi: Object.keys(P.frags).map(Number), m: TEAM.members }, 'state');
  }, 250);
}
function teamAfterSave() {
  if (!isHost()) return;
  const h = TEAM.members.find(m => m.id === 'host');
  if (h && P.name && h.name !== P.name) h.name = P.name;
  broadcast();
}

/* ---------- Eingehende Team-Nachrichten ---------- */
function handleTeamMsg(m) {
  TEAM.since = Math.max(TEAM.since || 0, m.time);
  if (TEAM.seen.includes(m.id)) return;
  TEAM.seen.push(m.id); saveTeam();
  let a; try { a = JSON.parse(m.message); } catch (e) { return; }
  if (isHost() && a.k !== 'state') hostApply(a);
  else if (isMember() && a.k === 'state') applyState(a);
}
function hostApply(a) {
  const st = cur(), sid = st.id || P.idx, who = a.n ? ` (${a.n})` : '';
  switch (a.k) {
    case 'join': {
      if (!a.id || !a.n) return;
      const ex = TEAM.members.find(x => x.id === a.id);
      if (ex) ex.name = String(a.n).slice(0, 24);
      else {
        const cnt = t => TEAM.members.filter(x => x.trupp === t).length;
        TEAM.members.push({ id: a.id, name: String(a.n).slice(0, 24), trupp: cnt('A') <= cnt('B') ? 'A' : 'B' });
        liveEvent('chat', `${a.n} ist dem Team beigetreten`, `Team: ${TEAM.members.map(x => x.name).join(', ')}`, 2);
      }
      saveTeam(); broadcast(); teamPanelRefresh(); return;
    }
    case 'unlock':
      if (P.name && !P.finishedAt && a.i === P.idx && P.status === 'travel') unlock(!!a.forced, a.n);
      return;
    case 'solve':
      if (a.i === P.idx && P.status === 'arrived') solve(a.n);
      return;
    case 'wrong':
      if (a.i === P.idx) liveEvent('wrong', `Station ${P.idx + 1}: falsche Antwort${who}`, `„${String(a.x || '').slice(0, 80)}“`, 2);
      return;
    case 'hint':
      if (a.i === P.idx && !P.hints[sid]) { P.hints[sid] = true; save(); render(); liveEvent('hint', `Station ${P.idx + 1}: Tipp genutzt${who}`, st.title); }
      return;
    case 'next':
      if (a.i === P.idx && P.status === 'solved') doNext();
      return;
    case 'hello':
      broadcast(); return;
  }
}
function applyState(s) {
  if (s.v < (TEAM.v || 0)) return;
  const key = () => JSON.stringify([P.idx, P.status, P.finishedAt, Object.keys(P.hints).length, rolesKey(), memberReady(), TEAM.members.map(x => x.name + x.trupp).join()]);
  const before = key();
  const wasStatus = P.status, wasIdx = P.idx, wasFin = P.finishedAt;
  TEAM.v = s.v; TEAM.members = s.m || []; TEAM.hostName = s.n; TEAM.started = !!s.st; saveTeam();
  const inTeam = TEAM.members.some(x => x.id === TEAM.id);
  P.name = inTeam ? TEAM.name : ''; P.idx = s.i; P.status = s.s; P.startedAt = s.st; P.finishedAt = s.fin;
  P.hints = Object.fromEntries((s.h || []).map(k => [k, true]));
  P.frags = Object.fromEntries((s.fi || []).map(i => [i, '★']));
  lsSet(KEY_P, P);
  if (inTeam && P.startedAt && joinTimer) { clearInterval(joinTimer); joinTimer = null; }
  if (before === key()) return;
  if (P.finishedAt && !wasFin) { fx('win'); confetti(); }
  else if (P.status === 'arrived' && (wasStatus !== 'arrived' || wasIdx !== P.idx)) fx('unlock');
  else if (P.status === 'solved' && wasStatus !== 'solved') fx('good');
  if (memberReady()) { startGeo(); keepAwake(); }
  render();
  if (wasIdx !== P.idx || wasStatus !== P.status) window.scrollTo(0, 0);
}
const memberReady = () => isMember() && !!TEAM.name && TEAM.members.some(x => x.id === TEAM.id) && !!P.startedAt;

/* ---------- Rollen & geteilte Hinweise ---------- */
function teamRoles(idx) {
  const m = TEAM.members || [];
  if (m.length < 2) return null;
  const st = D.stations[idx] || {};
  const code = st.final ? m[0] : m[idx % m.length];
  const nav = {};
  ['A', 'B'].forEach(t => {
    let g = m.filter(x => x.trupp === t);
    if (g.length > 1) g = g.filter(x => x.id !== code.id); // Codeknacker navigiert nicht gleichzeitig
    nav[t] = g.length ? g[idx % g.length] : null;
  });
  return { code, nav };
}
function rolesKey() { const r = teamRoles(P.idx); return r ? r.code.id + '|' + (r.nav.A || {}).id + '|' + (r.nav.B || {}).id + '|' + (myMember() || {}).trupp : ''; }
function canNavigate() {
  const r = teamRoles(P.idx), me = myMember();
  if (!r || !me) return true;
  return navOverride === P.idx || (r.nav[me.trupp] && r.nav[me.trupp].id === me.id);
}
function canAnswer() {
  const r = teamRoles(P.idx);
  if (!r) return true;
  return codeOverride === P.idx || r.code.id === myId();
}
function teamRoleHtml() {
  if (!teamOn()) return '';
  const r = teamRoles(P.idx), me = myMember();
  if (!r || !me) return '';
  const mine = [];
  if (r.nav[me.trupp] && r.nav[me.trupp].id === me.id) mine.push('🧭 Navigator');
  if (r.code.id === me.id) mine.push('🔐 Codeknacker');
  if (me.id === 'host') mine.push('⭐ Einsatzleiter');
  if (!mine.length) mine.push('🕵️ Agent');
  const nm = x => (x ? esc(x.name) : '–');
  return `<div class="card rolecard trupp-${me.trupp}">
    <div class="label">${TRUPP[me.trupp]} · Station ${P.idx + 1}</div>
    <div class="role">Deine Rolle: <b>${mine.join(' + ')}</b></div>
    <div class="small">🧭 Navigator A: ${nm(r.nav.A)} · 🧭 Navigator B: ${nm(r.nav.B)} · 🔐 Codeknacker: ${nm(r.code)}</div>
  </div>`;
}
function teamRiddleHtml(st) {
  if (!teamOn() || !st.clueA) return null;
  const me = myMember(), t = me ? me.trupp : 'A', other = t === 'A' ? 'B' : 'A';
  const otherHas = TEAM.members.some(x => x.trupp === other);
  const show = otherHas ? [t] : [t, other];
  return show.map(x => `<div class="clue trupp-${x}"><div class="label">Geheimakte ${TRUPP[x]}</div>${rich(st['clue' + x])}</div>`).join('')
    + (otherHas ? `<p class="small">⚠️ Die andere Hälfte der Hinweise hat ${TRUPP[other]}. Nur zusammen könnt ihr das Rätsel knacken – lest euch eure Akten gegenseitig vor!</p>` : '')
    + `<div class="riddle">${rich(st.teamQ || st.riddle)}</div>`;
}
function answerBlockedHtml() {
  const r = teamRoles(P.idx);
  return `<div class="hintbox">🔐 Die Lösung tippt an dieser Station <b>${esc(r ? r.code.name : '')}</b> ein. Sagt dem Codeknacker eure Hinweise!</div>
    ${isHost() ? '<button class="btn sec small" id="codeOv">Codeknacker ausgefallen? Selbst eingeben</button>' : ''}`;
}

/* ---------- Aktionen: Host führt direkt aus, Mitspieler funken an die Zentrale ---------- */
function requestUnlock(forced) {
  if (!isMember()) return unlock(forced);
  const k = P.idx, now = Date.now();
  if (unlockSent[k] && now - unlockSent[k] < 20000) return;
  unlockSent[k] = now;
  teamAct('unlock', { forced: !!forced });
  const gi = $('#gpsinfo'); if (gi) gi.textContent = '📡 Ziel erreicht – Zentrale wird benachrichtigt …';
}
function requestSolve() {
  if (!isMember()) return solve();
  teamAct('solve');
  const fb = $('#fb'); if (fb) { fb.className = 'feedback good'; fb.textContent = '✔ Richtig! Funke an die Zentrale …'; }
  const b = $('#ansBtn'); if (b) b.disabled = true;
  fx('good');
}
function requestWrong(text) { if (isMember()) teamAct('wrong', { x: String(text).trim().slice(0, 80) }); }
function requestHint() {
  if (!isMember()) return false;
  teamAct('hint');
  const hb = $('#hintBtn'); if (hb) { hb.disabled = true; hb.textContent = '💡 Tipp angefordert …'; }
  return true;
}
function requestNext() {
  if (!isMember()) return doNext();
  teamAct('next');
  const b = $('#nextBtn'); if (b) { b.disabled = true; b.textContent = 'Funke an die Zentrale …'; }
}

/* ---------- Beitreten (Mitspieler) ---------- */
function teamJoinFromHash() {
  if (!location.hash.startsWith('#team=')) return;
  const topic = decodeURIComponent(location.hash.slice(6));
  history.replaceState(null, '', location.pathname + location.search);
  if (isHost() && TEAM.topic === topic) return; // eigener Link auf Jaspers Handy
  if (isMember() && TEAM.topic === topic) return;
  const a = 'abcdefghijkmnpqrstuvwxyz23456789', b = new Uint8Array(10); crypto.getRandomValues(b);
  TEAM = { topic, role: 'member', id: 'm' + Array.from(b, x => a[x % a.length]).join(''), name: '', since: 0, v: 0, members: [], seen: [] };
  saveTeam();
  lsSet(KEY_P, newProgress()); P = newProgress();
}
function renderLobby() {
  const joined = TEAM.name && TEAM.members.some(x => x.id === TEAM.id);
  const me = TEAM.members.find(x => x.id === TEAM.id);
  app.innerHTML = `
  <div class="card pop">
    <div class="stamp">EINSATZTEAM</div>
    <h1>${esc(D.title)}</h1>
    ${!TEAM.name ? `<p>Du wurdest ins Einsatzteam von <b>Agent ${esc(TEAM.hostName || D.agentName || 'Jasper')}</b> berufen! Euer Auftrag: den Isar-Code des Silberfuchs knacken – bevor der Maulwurf es tut.</p>
      <p>Ihr spielt als ein Team in <b>zwei Trupps</b>. Jeder Trupp bekommt nur die Hälfte der Hinweise – ihr müsst also zusammenarbeiten. An jeder Station wechseln die Rollen: 🧭 Navigator, 🔐 Codeknacker, 🕵️ Agent.</p>`
    : `<p>${joined ? `Du bist dabei: <b>${TRUPP[me.trupp]}</b>` : '📡 Melde dich bei der Zentrale an …'}</p>`}
  </div>
  ${!TEAM.name ? `<div class="card">
    <label class="label" for="joinName">Dein Agentenname</label>
    <input id="joinName" maxlength="24" autocomplete="off" placeholder="z. B. Max" style="margin-top:8px">
    <button class="btn" id="joinBtn">🤝 Team beitreten</button>
    <p class="small">Die App fragt nach deinem Standort (für dein Radar – er wird nicht verschickt) und auf dem iPhone nach dem Kompass. Bitte erlauben.</p>
  </div>` : `<div class="card"><div class="label">Team</div>
    ${TEAM.members.length ? TEAM.members.map(x => `<div class="memb trupp-${x.trupp}">${x.trupp === 'A' ? '🟥' : '🟦'} ${esc(x.name)}${x.id === 'host' ? ' ⭐' : ''}${x.id === TEAM.id ? ' (du)' : ''}</div>`).join('') : '<p class="small">Warte auf Antwort der Zentrale. Jaspers App muss geöffnet sein.</p>'}
    <p class="small" style="margin-top:12px">${joined ? (P.startedAt ? 'Los geht’s …' : '⏳ Warte, bis Einsatzleiter Jasper die Mission startet.') : ''}</p>
  </div>`}`;
  const jb = $('#joinBtn');
  if (jb) {
    const go = () => {
      const n = $('#joinName').value.trim();
      if (!n) { $('#joinName').classList.add('shake'); setTimeout(() => $('#joinName').classList.remove('shake'), 400); return; }
      initAudio(); startGeo(); enableCompass();
      TEAM.name = n; saveTeam(); sendJoin(); render();
    };
    jb.onclick = go;
    $('#joinName').onkeydown = e => { if (e.key === 'Enter') go(); };
  }
  if (TEAM.name && !joinTimer && !(joined && P.startedAt)) joinTimer = setInterval(sendJoin, 20000);
}
function sendJoin() {
  if (!isMember() || !TEAM.name) return;
  teamPublish({ k: 'join', id: TEAM.id, n: TEAM.name });
}

/* ---------- Team-Panel (Jasper): QR-Code, Mitglieder, Trupps ---------- */
function teamUi() {
  const b = $('#teamBtn');
  if (!b) return;
  b.hidden = !isHost();
  b.textContent = `👥 Team ${TEAM.members.length}`;
  netUi();
}
function openTeamPanel() { $('#teampanel').hidden = false; document.body.style.overflow = 'hidden'; renderTeamPanel(); }
function closeTeamPanel() { $('#teampanel').hidden = true; document.body.style.overflow = ''; render(); }
function teamPanelRefresh() { teamUi(); if (!$('#teampanel').hidden) renderTeamPanel(); }
function qrSvg(text) {
  try { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 5, margin: 3, scalable: true }); }
  catch (e) { return '<p class="small">QR-Code nicht verfügbar – Link teilen.</p>'; }
}
function renderTeamPanel() {
  const r = teamRoles(P.idx);
  $('#teampanel').innerHTML = `<div class="wrap">
    <div class="adm-head"><h2>👥 Einsatzteam</h2><button class="btn sec small" style="width:auto;margin:0" id="tpClose">✕ Zurück</button></div>
    <div class="card center">
      <div class="label">Zum Beitreten scannen</div>
      <div class="qr">${qrSvg(joinLink())}</div>
      <div class="row"><button class="btn small" id="tpShare">🔗 Link teilen</button><button class="btn sec small" id="tpCopy">📋 Kopieren</button></div>
      <div class="feedback good" id="tpFb"></div>
    </div>
    <div class="card"><div class="label">Mitglieder (${TEAM.members.length}) – antippen wechselt den Trupp</div>
      ${TEAM.members.map((x, i) => `<div class="memb trupp-${x.trupp}">
        <button class="trupp-btn" data-tt="${i}">${x.trupp === 'A' ? '🟥 A' : '🟦 B'}</button>
        <span>${esc(x.name)}${x.id === 'host' ? ' ⭐ Einsatzleiter' : ''}</span>
        ${x.id !== 'host' ? `<button class="rm" data-rm="${i}" aria-label="Entfernen">✕</button>` : ''}</div>`).join('')}
      ${TEAM.members.length < 2 ? '<p class="small">Noch niemand beigetreten. Die anderen scannen den QR-Code mit der Handy-Kamera.</p>' : ''}
      ${r ? `<p class="small">Station ${P.idx + 1}: 🧭 A ${esc((r.nav.A || {}).name || '–')} · 🧭 B ${esc((r.nav.B || {}).name || '–')} · 🔐 ${esc(r.code.name)}</p>` : ''}
    </div></div>`;
  $('#tpClose').onclick = closeTeamPanel;
  const msg = t => { $('#tpFb').textContent = t; };
  $('#tpCopy').onclick = () => copyText(joinLink(), msg);
  $('#tpShare').onclick = () => (navigator.share ? navigator.share({ title: 'Operation S7 – Team beitreten', url: joinLink() }).catch(() => {}) : copyText(joinLink(), msg));
  $('#teampanel').querySelectorAll('[data-tt]').forEach(b => {
    b.onclick = () => { const x = TEAM.members[+b.dataset.tt]; x.trupp = x.trupp === 'A' ? 'B' : 'A'; saveTeam(); broadcast(); renderTeamPanel(); };
  });
  $('#teampanel').querySelectorAll('[data-rm]').forEach(b => {
    b.onclick = () => {
      const x = TEAM.members[+b.dataset.rm];
      if (!confirm(`${x.name} aus dem Team entfernen?`)) return;
      TEAM.members.splice(+b.dataset.rm, 1); saveTeam(); broadcast(); renderTeamPanel(); teamUi();
    };
  });
}

/* ---------- Admin ---------- */
function teamAdminHtml() {
  return `<div class="card"><h3>TEAM-MODUS (MEHRERE HANDYS)</h3>
    ${isHost() ? `<p class="small">Aktiv · ${TEAM.members.length} Mitglied(er) · Kanal <code>${esc(TEAM.topic)}</code></p>
      <div class="row"><button class="btn small" data-act="teamPanel">👥 QR-Code & Mitglieder</button>
      <button class="btn danger small" data-act="teamOff">Team-Modus beenden</button></div>`
    : isMember() ? `<p class="small">Dieses Handy ist Mitspieler im Team von ${esc(TEAM.hostName || '?')}.</p>
      <button class="btn danger small" data-act="teamLeave">Team verlassen</button>`
    : `<p class="small">Auf Jaspers Handy einrichten. Die anderen Kinder treten per QR-Code bei und spielen auf ihren eigenen Handys mit – mit gemeinsamem Spielstand, zwei Trupps und wechselnden Rollen.</p>
      <button class="btn" data-act="teamNew">👥 Team-Modus einrichten</button>`}</div>`;
}
function teamAdminAct(act) {
  switch (act) {
    case 'teamNew':
      TEAM = { topic: randTopic().replace('s7-', 's7t-'), role: 'host', id: 'host', name: '', since: Math.floor(Date.now() / 1000) - 5, v: 0,
        members: [{ id: 'host', name: P.name || D.agentName || 'Jasper', trupp: 'A' }], seen: [] };
      saveTeam(); streamStart(); broadcast(); teamUi(); closeAdmin(); return openTeamPanel();
    case 'teamPanel': closeAdmin(); return openTeamPanel();
    case 'teamOff':
      if (!confirm('Team-Modus beenden? Die anderen Handys bekommen dann keine Updates mehr.')) return;
      break;
    case 'teamLeave':
      if (!confirm('Dieses Handy aus dem Team nehmen?')) return;
      break;
    default: return;
  }
  if (STREAMS.team) { clearTimeout(STREAMS.team.retry); STREAMS.team.es && STREAMS.team.es.close(); delete STREAMS.team; }
  const wasMember = isMember();
  TEAM = { topic: '', role: '', id: '', name: '', since: 0, v: 0, members: [], seen: [] }; saveTeam();
  if (wasMember) { P = newProgress(); lsSet(KEY_P, P); }
  teamUi(); renderAdmin();
}

/* ---------- Start ---------- */
function teamInit() {
  teamJoinFromHash();
  if (TEAM.topic) streamStart();
  if (isHost()) { heartbeat = setInterval(broadcast, 60000); broadcast(); }
  if (isMember() && TEAM.name) sendJoin();
  setInterval(() => { flush(); liveSnapshot(false); }, 15000);
  $('#teamBtn').onclick = openTeamPanel;
  teamUi();
}
