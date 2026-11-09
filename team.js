/* Team-Modus: alle Kinder spielen auf eigenen Handys, gemeinsamer Spielstand über ntfy.sh.
   Jaspers Handy ist die Zentrale (Host): Es hält den Spielstand, wendet Aktionen der anderen an
   und sendet den Stand an alle. Mitspieler senden nur Aktionen (beitreten, freischalten, lösen …),
   aber KEINE Standorte. Kanal: TEAM.topic (eigener Zufallsname, getrennt vom Papa-Kanal).
   Wird vor app.js geladen. */
'use strict';

const KEY_T = 'sj7_team';
const tRead = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
let TEAM = Object.assign({ topic: '', role: '', id: '', name: '', since: 0, v: 0, members: [], seen: [] }, tRead(KEY_T) || {});
let navOverride = -1, codeOverride = -1, joinTimer = null, bcastTimer = null, wakeLock = null, lastBcast = '';
const unlockSent = {};
const STREAMS = {};

const saveTeam = () => { TEAM.seen = TEAM.seen.slice(-300); lsSet(KEY_T, TEAM); };
const isHost = () => TEAM.role === 'host' && !!TEAM.topic;
const isMember = () => TEAM.role === 'member' && !!TEAM.topic;
const myId = () => (isMember() ? TEAM.id : (TEAM.id || 'host')); // nach einer Übernahme behält die neue Zentrale ihre eigene ID
const myMember = () => (TEAM.members || []).find(m => m.id === myId());
const teamOn = () => !!TEAM.topic && (TEAM.members || []).length >= 2;
const teamNames = () => (teamOn() ? TEAM.members.map(m => m.name + (m.alias ? ` (${m.alias})` : '')) : undefined);

/* ---------- Decknamen ---------- */
const KEY_ALIAS = 'sj7_alias';
const ALIAS_A = ['Schatten', 'Nacht', 'Sturm', 'Eis', 'Donner', 'Nebel', 'Blitz', 'Stahl', 'Feuer', 'Frost', 'Kupfer', 'Granit', 'Rauch', 'Wolken', 'Mond', 'Tarn', 'Turbo', 'Phantom'];
const ALIAS_B = ['falke', 'wolf', 'luchs', 'adler', 'otter', 'rabe', 'hai', 'puma', 'kobra', 'panther', 'bär', 'eule', 'viper', 'tiger', 'marder', 'skorpion', 'condor', 'jaguar'];
// Englische Gamer-Namen im YouTube-Stil (CamelCase), etwas häufiger als die deutschen
const ALIAS_EN_A = ['Shadow', 'Night', 'Storm', 'Ghost', 'Ice', 'Silent', 'Neon', 'Thunder', 'Frost', 'Steel', 'Turbo', 'Blaze', 'Cyber', 'Stealth', 'Dark', 'Phantom', 'Hyper', 'Iron', 'Rapid', 'Venom'];
const ALIAS_EN_B = ['Hawk', 'Viper', 'Wolf', 'Raven', 'Cobra', 'Panther', 'Falcon', 'Shark', 'Lynx', 'Raptor', 'Phoenix', 'Tiger', 'Owl', 'Jaguar', 'Eagle', 'Scorpion', 'Dragon', 'Ninja', 'Rider', 'Hunter'];
function makeAlias(avoid = []) {
  const r = n => { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] % n; };
  for (let k = 0; k < 40; k++) {
    const en = r(10) < 6;
    const n = en ? ALIAS_EN_A[r(ALIAS_EN_A.length)] + ALIAS_EN_B[r(ALIAS_EN_B.length)]
      : ALIAS_A[r(ALIAS_A.length)] + ALIAS_B[r(ALIAS_B.length)];
    if (!avoid.includes(n)) return n;
  }
  return 'Agent' + (100 + r(900));
}
const takenAliases = () => (TEAM.members || []).map(m => m.alias).filter(Boolean);
function myAlias() {
  if (isMember()) return TEAM.alias || '';
  let a = tRead(KEY_ALIAS);
  if (!a) { a = makeAlias(takenAliases()); lsSet(KEY_ALIAS, a); }
  return a;
}
function rerollMyAlias() {
  const n = makeAlias(takenAliases().concat(myAlias()));
  if (isMember()) { TEAM.alias = n; saveTeam(); if (TEAM.name) sendJoin(true); }
  else { lsSet(KEY_ALIAS, n); const h = (TEAM.members || []).find(m => m.id === myId()); if (h) { h.alias = n; saveTeam(); broadcast(); } }
  return n;
}
const memberLabel = m => `${esc(m.name)}${m.alias ? ` <span class="alias">„${esc(m.alias)}“</span>` : ''}`;
function aliasBoxHtml(label) {
  return `<div class="aliasbox"><span class="label">${label || 'Dein Deckname'}</span>
    <div class="aliasname">Agent <b id="aliasName">${esc(myAlias())}</b></div>
    <button type="button" class="btn sec small" id="aliasRoll">🎲 Anderen Decknamen würfeln</button></div>`;
}
function bindAliasBox() {
  const b = $('#aliasRoll');
  if (b) b.onclick = () => { const n = rerollMyAlias(); const el = $('#aliasName'); if (el) { el.textContent = n; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } };
}
const joinLink = () => location.origin + location.pathname + '#team=' + encodeURIComponent(TEAM.topic);
const TRUPP = { A: '🟥 Trupp A', B: '🟦 Trupp B' };

/* ---------- Echtzeit-Stream (Server-Sent Events von ntfy) ---------- */
function openStream(key, topic, sinceFn, onMsg) {
  const old = STREAMS[key];
  if (old) { clearTimeout(old.retry); if (old.es) old.es.close(); }
  if (!topic || typeof EventSource === 'undefined') return;
  const es = new EventSource(`${NTFY}/${topic}/sse?since=${sinceFn()}`);
  const s = STREAMS[key] = { topic, es, sinceFn, onMsg, ok: false, retry: null, delay: (old && old.delay) || 4000 };
  es.onopen = () => { s.ok = true; s.delay = 4000; netUi(); };
  es.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch (x) { return; }
    if (m.event === 'message') onMsg(m);
  };
  es.onerror = () => {
    // Neu verbinden mit wachsendem Abstand (4 s … 60 s), damit viele Handys im selben WLAN ntfy nicht überlasten
    s.ok = false; es.close(); netUi();
    clearTimeout(s.retry); s.retry = setTimeout(() => openStream(key, topic, sinceFn, onMsg), s.delay);
    s.delay = Math.min(s.delay * 2, 60000);
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
    if (!needAwake()) return releaseAwake(); // Akku sparen, wenn man gerade nicht Navigator ist
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
    // Nur senden, wenn es Mitspieler gibt und sich der sichtbare Stand geändert hat (spart ntfy-Kontingent)
    if ((TEAM.members || []).length < 2 && !Object.keys(TEAM.rsvps || {}).length) return;
    const body = { i: P.idx, s: P.status, st: P.startedAt, fin: P.finishedAt, n: P.name || 'Jasper', hr: P.status === 'travel' ? hereIds() : [],
      h: Object.keys(P.hints), fi: Object.keys(P.frags).map(Number), m: TEAM.members, r: TEAM.rsvps || {}, ...exStateFields(), ...moreStateFields() };
    const sig = JSON.stringify(body);
    if (sig === lastBcast) return;
    lastBcast = sig; TEAM.v++; saveTeam();
    teamPublish(Object.assign({ k: 'state', v: TEAM.v, t: Date.now() }, body), 'state');
  }, 400);
}
function teamAfterSave() {
  if (!isHost()) return;
  const h = TEAM.members.find(m => m.id === myId());
  if (h && P.name && h.name !== P.name) h.name = P.name;
  if (h && h.alias !== myAlias()) h.alias = myAlias();
  broadcast();
}

/* ---------- Eingehende Team-Nachrichten ---------- */
function handleTeamMsg(m) {
  TEAM.since = Math.max(TEAM.since || 0, m.time);
  if (TEAM.seen.includes(m.id)) return;
  TEAM.seen.push(m.id); saveTeam();
  let a; try { a = JSON.parse(m.message); } catch (e) { return; }
  if (a.k === 'state') noteStateSeen();
  if (maybeDemote(a)) return;
  if (isHost() && a.k !== 'state') hostApply(a);
  else if (isMember() && a.k === 'state') applyState(a);
}
function hostApply(a) {
  if (exHostApply(a) || moreHostApply(a)) return;
  const st = cur(), sid = st.id || P.idx, who = a.n ? ` (${a.n})` : '';
  switch (a.k) {
    case 'join': {
      if (!a.id || !a.n) return;
      if ((TEAM.kicked || []).includes(a.id)) {
        if (!a.manual) return; // automatische Wiederholungen eines entfernten Handys ignorieren
        TEAM.kicked = TEAM.kicked.filter(x => x !== a.id); // bewusst „Erneut beitreten“ gedrückt
      }
      const ex = TEAM.members.find(x => x.id === a.id), al = a.al ? String(a.al).slice(0, 24) : '';
      if (ex) { ex.name = String(a.n).slice(0, 24); ex.alias = al; }
      else {
        const cnt = t => TEAM.members.filter(x => x.trupp === t).length;
        TEAM.members.push({ id: a.id, name: String(a.n).slice(0, 24), alias: al, trupp: cnt('A') <= cnt('B') ? 'A' : 'B' });
        liveEvent('join', `${a.n} ist dem Team beigetreten`, `Team: ${TEAM.members.map(x => x.name).join(', ')}`, 2);
      }
      saveTeam(); broadcast(); teamPanelRefresh(); return;
    }
    case 'unlock':
      if (P.name && !P.finishedAt && a.i === P.idx && P.status === 'travel') markHere(a.id, a.n, !!a.forced);
      return;
    case 'solve':
      if (a.i === P.idx && P.status === 'arrived') solve(a.n, a.id);
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
      lastBcast = ''; broadcast(); return;
    case 'rsvp': {
      if (!a.id || !a.n || (a.v !== 'yes' && a.v !== 'no')) return;
      const name = String(a.n).slice(0, 24), al = a.al ? String(a.al).slice(0, 24) : '';
      const prev = (TEAM.rsvps || {})[a.id];
      TEAM.rsvps = Object.assign({}, TEAM.rsvps, { [a.id]: { n: name, al, v: a.v, po: !!a.po, t: Date.now() } });
      const ex = TEAM.members.find(x => x.id === a.id);
      if (a.v === 'no' && ex) TEAM.members = TEAM.members.filter(x => x.id !== a.id); // Absage: nicht im Team
      if (a.v === 'yes' && !ex && !(TEAM.kicked || []).includes(a.id)) {
        const cnt = t => TEAM.members.filter(x => x.trupp === t).length;
        TEAM.members.push({ id: a.id, name, alias: al, trupp: cnt('A') <= cnt('B') ? 'A' : 'B' });
      }
      saveTeam(); broadcast(); teamPanelRefresh();
      if (!prev || prev.v !== a.v) {
        const all = Object.values(TEAM.rsvps), yes = all.filter(x => x.v === 'yes');
        liveEvent('rsvp', `${name}${al ? ' (' + al + ')' : ''} ${a.v === 'yes' ? 'hat zugesagt ✅' : 'hat abgesagt ❌'}`,
          `Zusagen: ${yes.length} · Absagen: ${all.length - yes.length}${yes.length ? ' – ' + yes.map(x => x.n).join(', ') : ''}`, a.v === 'yes' ? 3 : 2, 'rid-' + a.id);
        if (typeof studioOn === 'function' && studioOn() && !P.name && $('#admin').hidden) render();
      }
      return;
    }
  }
}
function applyState(s) {
  // Daten aus dem Netz absichern (jeder mit dem Kanalnamen könnte etwas senden)
  s.v = Number(s.v) || 0; s.i = Math.max(0, Math.min(Number(s.i) || 0, D.stations.length - 1));
  s.s = ['travel', 'arrived', 'solved'].includes(s.s) ? s.s : 'travel'; s.pts = Number(s.pts) || 0;
  s.m = (Array.isArray(s.m) ? s.m : []).filter(x => x && x.id).map(x => ({ id: String(x.id).slice(0, 20), name: String(x.name || '?').slice(0, 24), alias: String(x.alias || '').slice(0, 24), trupp: x.trupp === 'B' ? 'B' : 'A' }));
  if (s.v < (TEAM.v || 0)) return;
  const key = () => JSON.stringify([P.idx, P.status, P.finishedAt, Object.keys(P.hints).length, rolesKey(), memberReady(), TEAM.members.map(x => x.name + x.trupp).join(), P.pts, Object.keys(P.depots || {}).length, JSON.stringify(P.tasks || {}), JSON.stringify(TEAM.rsvpList || {}), JSON.stringify(P.tp || {}), JSON.stringify(P.photos || {}), P.ev ? P.ev.id : '', P.sab ? P.sab.id : '', P.moleOffset || 0]);
  const before = key();
  const wasStatus = P.status, wasIdx = P.idx, wasFin = P.finishedAt;
  TEAM.v = s.v; TEAM.members = s.m || []; TEAM.hostName = s.n; TEAM.started = !!s.st; saveTeam();
  const inTeam = TEAM.members.some(x => x.id === TEAM.id);
  if (inTeam) TEAM.wasIn = true;
  else if (TEAM.wasIn && TEAM.name && TEAM.rsvp !== 'no') { TEAM.kickedMe = true; TEAM.wasIn = false; if (joinTimer) { clearTimeout(joinTimer); joinTimer = null; } }
  saveTeam();
  P.name = inTeam ? TEAM.name : ''; P.idx = s.i; P.status = s.s; P.startedAt = s.st; P.finishedAt = s.fin;
  P.hints = Object.fromEntries((s.h || []).map(k => [k, true]));
  P.frags = Object.fromEntries((s.fi || []).map(i => [i, '★']));
  exApplyState(s);
  moreApplyState(s);
  const rl = {};
  if (s.r && typeof s.r === 'object') for (const [id, x] of Object.entries(s.r)) if (x && (x.v === 'yes' || x.v === 'no')) rl[String(id).slice(0, 20)] = { n: String(x.n || '?').slice(0, 24), al: String(x.al || '').slice(0, 24), v: x.v };
  TEAM.rsvpList = rl; TEAM.rsvpConfirmed = rl[TEAM.id] ? rl[TEAM.id].v : ''; saveTeam();
  const oldHere = (TEAM.hereList || []).join();
  TEAM.hereList = (Array.isArray(s.hr) ? s.hr : []).map(x => String(x).slice(0, 20));
  if (oldHere !== TEAM.hereList.join()) updateHere();
  lsSet(KEY_P, P);
  if (inTeam && joinTimer) { clearTimeout(joinTimer); joinTimer = null; joinDelay = 20000; }
  if (before === key()) return;
  if (P.finishedAt && !wasFin) { fx('win'); confetti(); }
  else if (P.status === 'arrived' && (wasStatus !== 'arrived' || wasIdx !== P.idx)) fx('unlock');
  else if (P.status === 'solved' && wasStatus !== 'solved') fx('good');
  if (memberReady()) { startGeo(); keepAwake(); }
  render();
  if (wasIdx !== P.idx || wasStatus !== P.status) window.scrollTo(0, 0);
}
// Gäste mit Einladung kommen erst am Einsatztag ins Spiel – Testläufe auf Jaspers Handy vorher bleiben unsichtbar
const memberReady = () => isMember() && !!TEAM.name && TEAM.members.some(x => x.id === TEAM.id) && !!P.startedAt && (!TEAM.invite || isPartyDay(TEAM.invite));

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
  if (sabotageActive()) return false; // Maulwurf-Störsender
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
    <div class="role">Agent <b>${esc(me.alias || me.name)}</b> · ${mine.join(' + ')}</div>
    <div class="small">🧭 Navigator A: ${nm(r.nav.A)} · 🧭 Navigator B: ${nm(r.nav.B)} · 🔐 Codeknacker: ${nm(r.code)}</div>
    ${scoreboardHtml()}
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
/* ---------- Zusammen am Ziel ----------
   Im Team öffnet sich eine Station erst, wenn ALLE Handys am Ziel gemeldet sind (nur „bin da“, keine Koordinaten).
   Meldungen gelten 5 Minuten. Fällt ein Handy aus, kann Jasper die Station nach Rückfrage trotzdem öffnen. */
const HERE_VALID = 5 * 60000;
function hereIds() {
  const h = (P.here && P.here[P.idx]) || {}, now = Date.now();
  return Object.keys(h).filter(id => now - h[id].t < HERE_VALID && (TEAM.members || []).some(m => m.id === id));
}
function markHere(id, name, forced) {
  if (!P.name || P.finishedAt || P.status !== 'travel') return;
  P.here = P.here || {};
  const h = P.here[P.idx] = P.here[P.idx] || {};
  const isNew = !h[id];
  h[id] = { t: Date.now(), f: !!forced, first: isNew && !Object.keys(h).some(k => k !== id) };
  save();
  if (isNew) liveEvent('arrived', `${name || '?'} ist am Ziel (${hereIds().length}/${TEAM.members.length})`, cur().title, 2);
  checkAllHere();
  if (P.status === 'travel') updateHere();
}
function checkAllHere() {
  if (!isHost() || !teamOn() || !P.name || P.finishedAt || P.status !== 'travel') return;
  const ids = hereIds();
  if (ids.length < TEAM.members.length) return;
  const h = P.here[P.idx], firstId = Object.keys(h).sort((a, b) => h[a].t - h[b].t)[0], first = memberById(firstId);
  unlock(Object.values(h).every(x => x.f), first ? first.name : '', firstId);
}
function hereHtml() {
  if (!teamOn() || P.status !== 'travel') return '';
  const ids = isHost() ? hereIds() : (TEAM.hereList || []);
  if (!ids.length) return `<div class="herebox">👥 Die Station öffnet sich erst, wenn <b>alle ${TEAM.members.length} Agenten</b> am Ziel sind.</div>`;
  const missing = TEAM.members.filter(m => !ids.includes(m.id));
  return `<div class="herebox on">👥 Am Ziel: <b>${ids.length}/${TEAM.members.length}</b>${missing.length ? ` · Es fehlen: ${missing.map(m => esc(m.alias || m.name)).join(', ')}` : ''}
    ${isHost() && missing.length ? '<button class="btn sec small" id="hereOverride">Alle da, aber ein Handy meldet sich nicht? Station öffnen</button>' : ''}</div>`;
}
function updateHere() {
  const el = $('#teamHere');
  if (!el) return;
  el.innerHTML = hereHtml();
  const b = $('#hereOverride');
  if (b) b.onclick = () => {
    const missing = TEAM.members.filter(m => !hereIds().includes(m.id)).map(m => m.alias || m.name);
    if (confirm(`Es fehlen noch Meldungen von: ${missing.join(', ')}.\n\nSind wirklich ALLE Agenten hier zusammen? Dann Station öffnen.`)) unlock(true, P.name, myId());
  };
}
function requestUnlock(forced) {
  if (!isMember()) return teamOn() ? markHere(myId(), P.name, forced) : unlock(forced);
  const k = P.idx, now = Date.now();
  if (unlockSent[k] && now - unlockSent[k] < 90000) return; // Meldung alle 90 s erneuern (gilt 5 Min.)
  unlockSent[k] = now;
  teamAct('unlock', { forced: !!forced });
  const gi = $('#gpsinfo'); if (gi) gi.textContent = '📡 Du bist am Ziel – warte auf die anderen Agenten …';
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
  // Link-Anhang bleibt in der Adresse, damit ein Lesezeichen/Home-Bildschirm-Symbol ihn behält
  const q = new URLSearchParams(location.hash.slice(1));
  const topic = q.get('team') || '', inv = q.get('inv') ? b64urlDecode(q.get('inv')) : null;
  if (!topic) return;
  if (isHost() && TEAM.topic === topic) return; // eigener Link auf Jaspers Handy
  if (isMember() && TEAM.topic === topic) { if (inv) { TEAM.invite = inv; saveTeam(); } return; }
  const a = 'abcdefghijkmnpqrstuvwxyz23456789', b = new Uint8Array(10); crypto.getRandomValues(b);
  TEAM = { topic, role: 'member', id: 'm' + Array.from(b, x => a[x % a.length]).join(''), name: '', since: 0, v: 0, members: [], seen: [], invite: inv };
  saveTeam();
  lsSet(KEY_P, newProgress()); P = newProgress();
}
function keepInput(id, fn) { // Eingabe über ein Neu-Zeichnen hinweg erhalten
  const el = $('#' + id), v = el ? el.value : null, f = el && document.activeElement === el;
  fn();
  const n = $('#' + id); if (n && v !== null) { n.value = v; if (f) n.focus(); }
}
function kickedHtml() {
  return `<div class="card center"><p>🚫 Du wurdest von der Zentrale aus dem Team genommen.</p><button class="btn sec small" id="rejoinBtn">Erneut beitreten</button></div>`;
}
function bindRejoin() { const b = $('#rejoinBtn'); if (b) b.onclick = () => { TEAM.kickedMe = false; saveTeam(); sendJoin(true); render(); }; }
function renderLobby() {
  if (TEAM.invite) return keepInput('joinName', renderInviteLobby);
  return keepInput('joinName', renderLobbyInner);
}
function renderLobbyInner() {
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
    ${TEAM.members.length ? TEAM.members.map(x => `<div class="memb trupp-${x.trupp}">${x.trupp === 'A' ? '🟥' : '🟦'} ${memberLabel(x)}${x.id === 'host' ? ' ⭐' : ''}${x.id === TEAM.id ? ' (du)' : ''}</div>`).join('') : '<p class="small">Warte auf Antwort der Zentrale. Jaspers App muss geöffnet sein.</p>'}
    <p class="small" style="margin-top:12px">${joined ? (P.startedAt ? 'Los geht’s …' : '⏳ Warte, bis Einsatzleiter Jasper die Mission startet.') : ''}</p>
  </div><div class="card">${aliasBoxHtml()}${checkBtnHtml()}</div>`}`;
  bindAliasBox();
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
  if (TEAM.kickedMe) { app.insertAdjacentHTML('beforeend', kickedHtml()); bindRejoin(); return; }
  if (TEAM.name && !joinTimer && !joined) scheduleJoin();
}
let joinDelay = 20000;
function scheduleJoin() { // Anmeldung wiederholen, bis die Zentrale sie bestätigt: 20 s, 40 s, 80 s … max. 5 Min.
  clearTimeout(joinTimer);
  joinTimer = setTimeout(() => {
    joinTimer = null;
    if (!isMember() || TEAM.kickedMe || TEAM.members.some(x => x.id === TEAM.id)) return;
    sendJoin(); joinDelay = Math.min(joinDelay * 2, 300000); scheduleJoin();
  }, joinDelay);
}
function sendJoin(manual) {
  if (!isMember() || !TEAM.name || TEAM.kickedMe || TEAM.rsvp === 'no') return;
  if (!TEAM.alias) { TEAM.alias = makeAlias(takenAliases()); saveTeam(); }
  teamPublish(Object.assign({ k: 'join', id: TEAM.id, n: TEAM.name, al: TEAM.alias }, manual ? { manual: true } : {}));
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
        <span>${memberLabel(x)}${x.id === 'host' ? ' ⭐ Einsatzleiter' : ''}</span>
        ${x.id !== 'host' ? `<button class="rm" data-rm="${i}" aria-label="Entfernen">✕</button>` : ''}</div>`).join('')}
      ${TEAM.members.length < 2 ? '<p class="small">Noch niemand beigetreten. Die anderen scannen den QR-Code mit der Handy-Kamera.</p>' : ''}
      ${r ? `<p class="small">Station ${P.idx + 1}: 🧭 A ${esc((r.nav.A || {}).name || '–')} · 🧭 B ${esc((r.nav.B || {}).name || '–')} · 🔐 ${esc(r.code.name)}</p>` : ''}
    </div></div>`;
  $('#tpClose').onclick = closeTeamPanel;
  const msg = t => { $('#tpFb').textContent = t; };
  $('#tpCopy').onclick = () => copyText(joinLink(), msg);
  $('#tpShare').onclick = () => (navigator.share ? navigator.share({ title: 'Operation Silberfuchs – Team beitreten', url: joinLink() }).catch(() => {}) : copyText(joinLink(), msg));
  $('#teampanel').querySelectorAll('[data-tt]').forEach(b => {
    b.onclick = () => { const x = TEAM.members[+b.dataset.tt]; x.trupp = x.trupp === 'A' ? 'B' : 'A'; saveTeam(); broadcast(); renderTeamPanel(); };
  });
  $('#teampanel').querySelectorAll('[data-rm]').forEach(b => {
    b.onclick = () => {
      const x = TEAM.members[+b.dataset.rm];
      if (!confirm(`${x.name} aus dem Team entfernen?`)) return;
      TEAM.kicked = (TEAM.kicked || []).concat(x.id); // verhindert automatisches Wieder-Beitreten
      TEAM.members.splice(+b.dataset.rm, 1); saveTeam(); broadcast(); renderTeamPanel(); teamUi();
    };
  });
}

/* ---------- Admin ---------- */
function teamAdminHtml() {
  return `<div class="card"><h3>TEAM-MODUS (MEHRERE HANDYS)</h3>
    ${isHost() ? `<p class="small">Aktiv · ${TEAM.members.length} Mitglied(er) · Kanal <code>${esc(TEAM.topic)}</code></p>
      <button class="btn small" data-act="teamInvite">💌 Einladung erstellen</button>
      <button class="btn sec small" data-act="teamCopyList">🖨 Teamliste für Urkunden kopieren</button>
      <div class="feedback good" id="teamListFb"></div>
      <div class="row"><button class="btn sec small" data-act="teamPanel">👥 QR-Code & Mitglieder</button>
      <button class="btn danger small" data-act="teamOff">Team-Modus beenden</button></div>`
    : isMember() ? `<p class="small">Dieses Handy ist Mitspieler im Team von ${esc(TEAM.hostName || '?')}.</p>
      <button class="btn danger small" data-act="teamLeave">Team verlassen</button>`
    : `<p class="small">Auf Jaspers Handy einrichten. Die anderen Kinder treten per QR-Code bei und spielen auf ihren eigenen Handys mit – mit gemeinsamem Spielstand, zwei Trupps und wechselnden Rollen.</p>
      <div class="row"><button class="btn" data-act="teamNew">👥 Team-Modus einrichten</button><button class="btn sec" data-act="teamInvite">💌 Einladung erstellen</button></div>`}</div>`;
}
function teamAdminAct(act) {
  if (act.startsWith('teamInvite')) return inviteAdminAct(act);
  switch (act) {
    case 'teamNewQuiet':
      TEAM = { topic: randTopic().replace('op-', 'opt-'), role: 'host', id: 'host', name: '', since: Math.floor(Date.now() / 1000) - 5, v: 0,
        members: [{ id: 'host', name: P.name || D.agentName || 'Jasper', alias: myAlias(), trupp: 'A' }], seen: [] };
      saveTeam(); streamStart(); teamUi();
      return;
    case 'teamNew':
      TEAM = { topic: randTopic().replace('op-', 'opt-'), role: 'host', id: 'host', name: '', since: Math.floor(Date.now() / 1000) - 5, v: 0,
        members: [{ id: 'host', name: P.name || D.agentName || 'Jasper', alias: myAlias(), trupp: 'A' }], seen: [] };
      saveTeam(); streamStart(); broadcast(); teamUi(); closeAdmin(); return openTeamPanel();
    case 'teamPanel': closeAdmin(); return openTeamPanel();
    case 'teamCopyList': { // für die Druckvorlage druck/tresor-druck.html: „Vorname; Deckname“, Einsatzleiter mit *
      const yes = TEAM.rsvps || {};
      const list = TEAM.members.filter(m => m.id === 'host' || !yes[m.id] || yes[m.id].v === 'yes')
        .map(m => `${m.name}; ${m.alias || m.name}${m.id === 'host' ? ' *' : ''}`).join('\n');
      return copyText(list, t => { const e = $('#teamListFb'); if (e) e.textContent = t + ' – ' + TEAM.members.length + ' Agenten'; });
    }
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
function sendRsvp() {
  if (!isMember() || !TEAM.name || !TEAM.rsvp) return;
  teamPublish({ k: 'rsvp', id: TEAM.id, n: TEAM.name, al: TEAM.alias || '', v: TEAM.rsvp, po: !!TEAM.parentsOk });
}
function teamInit() {
  teamJoinFromHash();
  if (TEAM.topic) streamStart();
  if (isMember() && TEAM.rsvp && TEAM.rsvpConfirmed !== TEAM.rsvp) setTimeout(sendRsvp, 3000);
  setInterval(() => { if (isHost()) { checkAllHere(); if (P.status === 'travel') { updateHere(); broadcast(); } } }, 30000); // abgelaufene Meldungen
  if (isHost()) { lastBcast = ''; broadcast(); }
  if (isMember() && TEAM.name) sendJoin();
  setInterval(() => { flush(); liveSnapshot(false); }, 15000);
  $('#teamBtn').onclick = openTeamPanel;
  teamUi();
}
