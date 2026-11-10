/* Live-Verbindung zu Papa über ntfy.sh – Ereignisse, Position, Funk-Chat und Papa-Zentrale.
   Kanäle (geheimer Basisname + Endung):
     <kanal>-log   Ereignisse + Nachrichten von Jasper (Papa abonniert diesen in der ntfy-App → Push)
     <kanal>-pos   Status/Position alle 2 Minuten (still, nur für die Papa-Zentrale)
     <kanal>-papa  Nachrichten von Papa an Jasper
   Wird vor app.js geladen; nutzt dessen globale Helfer erst zur Laufzeit. */
'use strict';

const KEY_L = 'sj7_live', KEY_CHAT = 'sj7_chat', KEY_OUT = 'sj7_outbox', KEY_PAPA = 'sj7_papa';
const NTFY = 'https://ntfy.sh', POS_EVERY = 120000, KID_POLL = 15000, PAPA_POLL = 10000;
const LEAFLET = {
  js: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js',
  jsSri: 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH',
  css: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css',
  cssSri: 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H'
};
const QUICK_KID = ['💡 Wir brauchen einen Tipp!', '👍 Alles gut', '🚆 Wir sitzen in der S-Bahn', '📞 Bitte ruf mich an', '🆘 Wir haben uns verlaufen'];
const QUICK_PAPA = ['💡 Tipp schicken', '👍 Super, weiter so!', '📞 Ich rufe gleich an', '⏰ Denkt an die Zeit – bald wird es dunkel', '🚆 Schaut in der MVV-App nach der nächsten S7'];
const EV_TAG = { start: 'rocket', arrived: 'round_pushpin', forced: 'warning', wrong: 'x', hint: 'bulb',
  solved: 'white_check_mark', finished: 'trophy', chat: 'speech_balloon', help: 'sos', depot: 'package', task: 'dart', join: 'wave', rsvp: 'envelope' };
/* ntfy.sh erlaubt anonym 250 Nachrichten pro Tag und IP. Jaspers Handy spart deshalb:
   Position nur alle 2 Min. wenn er sich bewegt (sonst alle 10 Min.), bei knappem Kontingent seltener. */
let QUOTA_LEFT = null, quotaTimer = null, lastSnapPos = null;
const wrongSent = {};
async function refreshQuota() {
  try { const r = await fetch(NTFY + '/v1/account'); const d = await r.json(); QUOTA_LEFT = d.stats ? d.stats.messages_remaining : null; } catch (e) {}
  return QUOTA_LEFT;
}
function startQuotaWatch() { if (!quotaTimer) { refreshQuota(); quotaTimer = setInterval(refreshQuota, 10 * 60000); } }

const lsRead = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }; // app.js lädt erst danach
let LIVE = Object.assign({ enabled: false, topic: '', server: NTFY }, lsRead(KEY_L) || {});
let CHAT = lsRead(KEY_CHAT) || [];
let OUTBOX = lsRead(KEY_OUT) || [];
let lastSnap = 0, flushing = false, unread = 0, kidTimer = null, PAPA = false;

const liveOn = () => !!(LIVE.enabled && LIVE.topic);
const tp = s => LIVE.topic + '-' + s;
const saveLive = () => lsSet(KEY_L, LIVE);
const papaLink = () => location.origin + location.pathname + '#papa=' + encodeURIComponent(LIVE.topic);
const hhmm = t => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
function ago(t) {
  const m = Math.floor((Date.now() - t) / 60000);
  return m < 1 ? 'gerade eben' : m < 60 ? `vor ${m} Min.` : `vor ${Math.floor(m / 60)} Std. ${m % 60} Min.`;
}
function randTopic() {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789', b = new Uint8Array(22);
  crypto.getRandomValues(b);
  return 'op-' + Array.from(b, x => a[x % a.length]).join('');
}
function parseNd(t) {
  return t.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } })
    .filter(m => m && m.event === 'message');
}
function copyText(t, done) {
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject())
    .then(() => done && done('Kopiert ✓'), () => prompt('Zum Kopieren markieren:', t));
}

/* ---------- Senden (mit Warteschlange für Funklöcher) ---------- */
async function publish(m) {
  const { _k, ...body } = m; // _k = interner Schlüssel: nur die neueste Nachricht dieser Art behalten
  const ac = typeof AbortController === 'function' ? new AbortController() : null, to = ac && setTimeout(() => ac.abort(), 15000);
  try {
    const r = await fetch((LIVE.server || NTFY) + '/', { method: 'POST', body: JSON.stringify(body), signal: ac ? ac.signal : undefined });
    if (r.status === 429) { QUOTA_LEFT = 0; dropLowPrio(); } // Kontingent/Ratenlimit: Papa-Kleinkram verwerfen, Team-Stand hat Vorrang
    if (!r.ok) throw new Error('HTTP ' + r.status);
  } finally { if (to) clearTimeout(to); }
}
/* Papa-Verlauf/Positionen sind verzichtbar – der Team-Stand nie. */
function dropLowPrio() {
  const n = OUTBOX.length;
  OUTBOX = OUTBOX.filter(x => !/-(log|pos)$/.test(x.topic) || (x.tags || []).some(t => t === 'ev-help' || t === 'ev-finished'));
  if (OUTBOX.length !== n) lsSet(KEY_OUT, OUTBOX);
}
function enqueue(m) {
  if (m.topic.endsWith('-pos')) OUTBOX = OUTBOX.filter(x => x.topic !== m.topic); // nur die neueste Position
  if (m._k) OUTBOX = OUTBOX.filter(x => !(x._k === m._k && x.topic === m.topic));
  OUTBOX.push(m);
  if (OUTBOX.length > 150) OUTBOX = OUTBOX.slice(-150);
  lsSet(KEY_OUT, OUTBOX);
  flush();
}
let retryDelay = 2000, retryTimer = null, lastSendError = '';
async function flush() {
  if (flushing || !OUTBOX.length) return;
  flushing = true;
  try {
    while (OUTBOX.length) {
      const m = OUTBOX.find(x => x._k === 'state') || OUTBOX.find(x => !/-(log|pos)$/.test(x.topic)) || OUTBOX[0]; // Team zuerst
      await publish(m);
      OUTBOX = OUTBOX.filter(x => x !== m); // per Identität entfernen – die Liste kann sich währenddessen ändern
      lsSet(KEY_OUT, OUTBOX);
    }
    retryDelay = 2000; lastSendError = '';
  } catch (e) {
    // Funkloch oder ntfy-Ratenlimit: mit wachsendem Abstand (2 s … 30 s) erneut versuchen
    lastSendError = e.message || 'Netzwerkfehler';
    clearTimeout(retryTimer);
    retryTimer = setTimeout(flush, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30000);
  } finally { flushing = false; }
}
window.addEventListener('online', () => { retryDelay = 2000; flush(); });

/* ---------- Jasper-Seite: Ereignisse & Position ---------- */
function liveEvent(type, title, message, priority = 3) {
  if (!liveOn() || !P || (!P.name && type !== 'rsvp' && type !== 'join') || PAPA || isMember()) return;
  startQuotaWatch();
  // Unwichtiges zuerst weglassen, wenn das Tageskontingent knapp wird
  if (type === 'wrong') { wrongSent[P.idx] = (wrongSent[P.idx] || 0) + 1; if (wrongSent[P.idx] > 3 || (QUOTA_LEFT !== null && QUOTA_LEFT < 60)) return; }
  if ((type === 'join' || type === 'task') && QUOTA_LEFT !== null && QUOTA_LEFT < 40) return;
  if (QUOTA_LEFT !== null && QUOTA_LEFT < 25 && !['help', 'finished', 'start'].includes(type)) return; // Rest fürs Team aufheben
  const tags = [EV_TAG[type] || 'spy', 'ev-' + type, 'i' + P.idx, 'pts-' + (Number(P.pts) || 0)];
  if (type === 'depot' && arguments[4]) tags.push('dp-' + arguments[4]);
  if (type === 'rsvp' && arguments[4]) tags.push(String(arguments[4]).slice(0, 30));
  enqueue({ topic: tp('log'), title, message: message || title, tags, priority });
  // Bei wichtigen Momenten den Stand für die Papa-Zentrale mitschicken (höchstens alle 45 s, Start/Ende immer)
  if (type === 'start' || type === 'finished' || (['forced', 'solved'].includes(type) && Date.now() - lastSnap > 3 * 60000)) liveSnapshot(true);
}
function liveSnapshot(force) {
  if (!liveOn() || !P || !P.name || PAPA || isMember()) return;
  startQuotaWatch();
  const now = Date.now(), p = here();
  const moved = !lastSnapPos || (p && dist(lastSnapPos, p) > 30);
  let every = moved ? POS_EVERY : 10 * 60000;
  if (QUOTA_LEFT !== null && QUOTA_LEFT < 80) every = Math.max(every, 6 * 60000);
  if (QUOTA_LEFT !== null && QUOTA_LEFT < 30) every = 20 * 60000;
  if (QUOTA_LEFT !== null && QUOTA_LEFT < 15) return; // dann nur noch Team-Funk
  if (typeof teamOn === 'function' && teamOn() && moved) every = Math.max(every, 5 * 60000); // im Team: Position alle 5 Min. (spart Kontingent)
  if (!force && now - lastSnap < every) return;
  lastSnap = now; if (p) lastSnapPos = { lat: p.lat, lon: p.lon };
  const s = { n: P.name, i: P.idx, s: P.status, f: Object.keys(P.frags).length, st: P.startedAt, fin: P.finishedAt, t: now };
  if (teamOn()) s.tm = teamNames();
  s.pts = P.pts || 0; s.dp = Object.keys(P.depots || {});
  if (p) Object.assign(s, { lat: +p.lat.toFixed(5), lon: +p.lon.toFixed(5), acc: Math.round(p.acc || 0), sim: !!sim });
  enqueue({ topic: tp('pos'), message: JSON.stringify(s), priority: 1 });
}
async function kidPoll() {
  if (!liveOn() || !P || !P.name || PAPA) return;
  flush(); liveSnapshot(false);
  const since = LIVE.papaSince || Math.floor((P.startedAt || Date.now()) / 1000) - 60;
  try {
    const r = await fetch(`${LIVE.server}/${tp('papa')}/json?poll=1&since=${since}`);
    if (!r.ok) return;
    for (const m of parseNd(await r.text())) { LIVE.papaSince = Math.max(LIVE.papaSince || 0, m.time); handlePapaMsg(m); }
    saveLive();
  } catch (e) {}
}
function handlePapaMsg(m) {
  if (String(m.message || '').startsWith(CMD)) return handlePapaCmd(m); // Fernsteuerung, kein Chat
  if (CHAT.some(c => c.id === m.id)) return;
  CHAT.push({ id: m.id, from: 'papa', text: m.message, t: m.time * 1000 });
  lsSet(KEY_CHAT, CHAT);
  fx('unlock');
  if ($('#chat').hidden) { unread++; showToast(m.message); }
  else { const box = $('#msgs'); if (box) { box.innerHTML = chatListHtml(CHAT, 'kid'); box.scrollTop = box.scrollHeight; } } // Entwurf im Eingabefeld bleibt erhalten
  liveUi();
}
function liveUi() {
  const b = $('#funk');
  if (!b) return;
  const show = liveOn() && P && P.name && !PAPA && !isMember();
  b.hidden = !show;
  document.body.classList.toggle('has-funk', !!show);
  const badge = $('#funkBadge');
  badge.textContent = unread || ''; badge.hidden = !unread;
  if (show) streamStart(); // Echtzeit-Stream für Papas Nachrichten (team.js)
}
function liveReset() { CHAT = []; lsSet(KEY_CHAT, CHAT); OUTBOX = []; lsSet(KEY_OUT, OUTBOX); delete LIVE.papaSince; saveLive(); unread = 0; }
function showToast(t) {
  const el = $('#toast');
  el.innerHTML = `📻 <b>Papa:</b> ${esc(t)}`;
  el.hidden = false;
  el.onclick = () => { el.hidden = true; openChat(); };
  clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 15000);
}

/* ---------- Funk-Chat (Jasper) ---------- */
function chatListHtml(list, me) {
  return list.slice(-80).map(c => `<div class="msg ${c.from === me ? 'me' : 'them'}"><div>${esc(c.text)}</div><div class="t">${hhmm(c.t)}</div></div>`).join('')
    || '<p class="small center">Noch keine Nachrichten.</p>';
}
function openChat() { unread = 0; $('#toast').hidden = true; $('#chat').hidden = false; document.body.style.overflow = 'hidden'; renderChat(); liveUi(); }
function closeChat() { $('#chat').hidden = true; document.body.style.overflow = ''; }
function renderChat() {
  const pending = OUTBOX.some(m => m.topic.endsWith('-log'));
  $('#chat').innerHTML = `<div class="wrap">
    <div class="adm-head"><h2>📻 Funk zu Papa</h2><button class="btn sec small" style="width:auto;margin:0" id="chatClose">✕ Zurück</button></div>
    <div class="msgs" id="msgs">${chatListHtml(CHAT, 'kid')}</div>
    <div class="quick">${QUICK_KID.map((q, i) => `<button type="button" data-q="${i}">${esc(q)}</button>`).join('')}</div>
    <div class="sendrow"><input id="chatIn" maxlength="300" placeholder="Nachricht an Papa" autocomplete="off"><button class="btn" id="chatSend">Senden</button></div>
    <p class="small">${pending ? '⏳ Kein Netz – wird automatisch gesendet, sobald wieder Empfang da ist.' : 'Papa bekommt deine Nachricht sofort aufs Handy.'}</p>
  </div>`;
  const box = $('#msgs'); box.scrollTop = box.scrollHeight;
  $('#chatClose').onclick = closeChat;
  $('#chatSend').onclick = () => { sendKid($('#chatIn').value); };
  $('#chatIn').onkeydown = e => { if (e.key === 'Enter') sendKid($('#chatIn').value); };
  $('#chat').querySelectorAll('[data-q]').forEach(b => { b.onclick = () => sendKid(QUICK_KID[+b.dataset.q]); });
}
function sendKid(text) {
  text = String(text || '').trim();
  if (!text) return;
  initAudio();
  CHAT.push({ id: 'k' + Date.now(), from: 'kid', text, t: Date.now() });
  lsSet(KEY_CHAT, CHAT);
  const help = /tipp|verlaufen|ruf/i.test(text), st = cur();
  liveEvent(help ? 'help' : 'chat', `${P.name}: ${text}`, `${text}\n(Station ${P.idx + 1}: ${st.title})`, help ? 5 : 4);
  renderChat();
}

/* ---------- Admin-Bereich ---------- */
function liveAdminHtml() {
  refreshQuota().then(q => { const e = $('#quotaLeft'); if (e && q !== null) e.textContent = q; });
  const t = LIVE.topic;
  return `<div class="card"><h3>LIVE-VERBINDUNG ZU PAPA</h3>
    <p class="small">Status: <b>${liveOn() ? 'aktiv' : 'aus'}</b>${t ? ` · Kanal <code>${esc(t)}</code>` : ''}${OUTBOX.length ? ` · ${OUTBOX.length} Nachricht(en) warten auf Netz` : ''}${lastSendError ? ` · letzter Fehler: ${esc(lastSendError)}` : ''}</p>
    <p class="small">ntfy-Kontingent heute (pro Internet-Anschluss): <b id="quotaLeft">${QUOTA_LEFT === null ? '…' : QUOTA_LEFT}</b> von 250 Nachrichten übrig. Im Team-Modus haben Team-Funk Vorrang; Papa-Verlauf und Position werden bei knappem Kontingent automatisch gedrosselt. Am Vortag nicht mehr viel testen.</p>
    ${t ? `<p class="small">1. Papa-Link auf Papas Handy/PC öffnen (Karte, Verlauf, Lösungen, Chat).<br>
      2. Für Push: ntfy-App installieren, Server ntfy.sh, Kanal <code>${esc(t)}-log</code> abonnieren.<br>
      Wer den Kanalnamen kennt, kann mitlesen – Link nur an Papa geben.</p>
      <div class="row"><button class="btn small" data-act="liveShare">🔗 Papa-Link teilen</button><button class="btn sec small" data-act="liveCopy">📋 Link kopieren</button></div>
      <div class="row"><button class="btn sec small" data-act="liveTest">📨 Testnachricht</button><button class="btn sec small" data-act="liveToggle">${liveOn() ? '⏸ Live aus' : '▶️ Live an'}</button></div>
      <button class="btn danger small" data-act="liveNew">Neuen geheimen Kanal erzeugen</button>`
    : `<p class="small">Noch kein Kanal. Erzeuge einen geheimen Kanal – danach sendet die App Ereignisse und alle 2 Minuten die Position an Papa.</p>
      <button class="btn" data-act="liveNew">📡 Live-Verbindung einrichten</button>`}
    <div class="feedback good" id="livefb"></div></div>`;
}
function liveMsg(t) { const e = $('#livefb'); if (e) e.textContent = t; }
function liveAdminAct(act) {
  switch (act) {
    case 'liveNew':
      if (LIVE.topic && !confirm('Neuen Kanal erzeugen? Der alte Papa-Link funktioniert dann nicht mehr.')) return;
      LIVE = { enabled: true, topic: randTopic(), server: NTFY }; saveLive(); break;
    case 'liveToggle': LIVE.enabled = !LIVE.enabled; saveLive(); break;
    case 'liveCopy': return copyText(papaLink(), liveMsg);
    case 'liveShare':
      if (navigator.share) return void navigator.share({ title: 'Operation Silberfuchs – Papa-Zentrale', url: papaLink() }).catch(() => {});
      return copyText(papaLink(), liveMsg);
    case 'liveTest':
      liveMsg('Sende …');
      return void publish({ topic: tp('log'), title: 'Operation Silberfuchs: Testnachricht', message: 'Die Live-Verbindung funktioniert.', tags: ['white_check_mark'] })
        .then(() => liveMsg('Testnachricht gesendet ✓'), e => liveMsg('Fehler: ' + e.message));
    default: return;
  }
  renderAdmin(); liveUi();
}

/* ---------- Papa-Zentrale ---------- */
const PS = { snap: null, track: [], log: [], chat: [], seen: new Set(), since: 0, clearedAt: 0, loaded: false, online: null };
let map = null, mk = {}, followKid = true;

async function initPapa(topic) {
  PAPA = true;
  LIVE = { enabled: true, topic, server: NTFY };
  PS.clearedAt = (lsGet(KEY_PAPA) || {})[topic] || 0;
  document.title = 'Papa-Zentrale';
  $('#htitle').textContent = 'PAPA-ZENTRALE';
  $('#rank').textContent = 'KANAL ' + topic.toUpperCase();
  document.body.classList.add('papa');
  document.addEventListener('click', initAudio, { once: true });
  app.innerHTML = `
    <div class="card" id="pStatus"><p>Verbinde …</p></div>
    ${papaRemoteHtml()}
    <div class="card mapcard"><div id="map"></div>
      <div class="row" style="margin-top:8px"><button class="btn sec small" id="pFollow">🎯 Jasper folgen</button><button class="btn sec small" id="pAll">🗺 Ganze Route</button></div></div>
    <div class="card"><h3 class="label">Funk</h3>
      <div class="msgs" id="pMsgs"></div>
      <div class="quick">${QUICK_PAPA.map((q, i) => `<button type="button" data-pq="${i}">${esc(q)}</button>`).join('')}</div>
      <div class="sendrow"><input id="pIn" maxlength="300" placeholder="Nachricht an Jasper" autocomplete="off"><button class="btn" id="pSend">Senden</button></div>
      <div class="feedback" id="pFb"></div></div>
    <div class="card" id="pRsvp" hidden></div>
    <div class="card" id="pStation"></div>
    <div class="card"><div class="adm-head"><h3 class="label" style="margin:0">Verlauf</h3><button class="btn sec small" style="width:auto;margin:0" id="pClear">🧹 Ansicht leeren</button></div><div id="pLog"></div></div>
    <p class="small center">Push aufs Handy: ntfy-App → Server ntfy.sh → Kanal <code>${esc(topic)}-log</code> abonnieren.</p>`;
  $('#pSend').onclick = () => papaSend($('#pIn').value, true);
  bindPapaRemote();
  $('#pIn').onkeydown = e => { if (e.key === 'Enter') papaSend($('#pIn').value, true); };
  app.querySelectorAll('[data-pq]').forEach(b => {
    b.onclick = () => {
      const i = +b.dataset.pq;
      if (i === 0) {
        const st = D.stations[Math.min(PS.snap ? PS.snap.i : 0, D.stations.length - 1)];
        const hint = (st.hint || '').replace(/\*\*/g, '');
        if (!hint) return;
        if (confirm(`Diesen Tipp an Jasper schicken?\n\n${hint}`)) papaSend('💡 Tipp: ' + hint);
      } else papaSend(QUICK_PAPA[i]);
    };
  });
  $('#pFollow').onclick = () => { followKid = true; updateMap(true); };
  $('#pAll').onclick = () => { followKid = false; fitRoute(); };
  $('#pClear').onclick = () => {
    if (!confirm('Bisherigen Verlauf in dieser Ansicht ausblenden (z. B. nach Testläufen)?')) return;
    PS.clearedAt = Date.now();
    const all = lsGet(KEY_PAPA) || {}; all[topic] = PS.clearedAt; lsSet(KEY_PAPA, all);
    Object.assign(PS, { snap: null, track: [], log: [], chat: [] });
    renderPapa();
  };
  loadLeaflet().then(initMap).catch(() => { $('#map').innerHTML = '<p class="small center" style="padding:40px 0">Karte konnte nicht geladen werden.</p>'; });
  await papaPoll();
  setInterval(() => { const st = STREAMS.papaview; PS.online = !!(st && st.ok); renderPapaStatus(); }, 20000);
}
async function papaSend(text, fromInput) {
  text = String(text || '').trim();
  if (!text) return;
  const fb = $('#pFb');
  try {
    await publish({ topic: tp('papa'), title: 'Papa', message: text, tags: ['radio'] });
    if (fromInput) $('#pIn').value = '';
    fb.className = 'feedback good'; fb.textContent = 'Gesendet ✓ – Jasper sieht es, sobald seine App offen ist.';
  } catch (e) { fb.className = 'feedback bad'; fb.textContent = 'Senden fehlgeschlagen: ' + e.message; }
}
/* Erst einmal alles Vorhandene laden, danach eine dauerhafte Verbindung (SSE) statt alle 10 s nachzufragen –
   das schont das ntfy-Anfragenbudget des Heim-Anschlusses, an dem am Feiertag auch die Kinderhandys hängen. */
function papaHandle(m) {
  let newKid = false;
  if (PS.seen.has(m.id)) return false;
  PS.seen.add(m.id);
  PS.since = Math.max(PS.since, m.time);
  if (PS.clearedAt && m.time * 1000 < PS.clearedAt) return false;
  if (m.topic === tp('pos')) {
    try {
      const s = JSON.parse(m.message);
      if (!PS.snap || s.t >= PS.snap.t) PS.snap = s;
      if (s.lat != null) PS.track.push([s.lat, s.lon, s.t]);
    } catch (e) {}
  } else if (m.topic === tp('papa')) {
    if (String(m.message || '').startsWith(CMD)) { let c = {}; try { c = JSON.parse(m.message.slice(CMD.length)); } catch (e) {} PS.log.push({ title: `🎛 Befehl gesendet: ${c.c || '?'}`, text: c.text ? String(c.text).replace(/\*\*/g, '').slice(0, 80) : '', t: m.time * 1000, tags: ['spy'] }); }
    else PS.chat.push({ from: 'papa', text: m.message, t: m.time * 1000 });
  } else {
    const tags = m.tags || [];
    PS.log.push({ title: m.title || '', text: m.message || '', t: m.time * 1000, tags });
    // Stand sofort aus dem Ereignis ableiten (Positionsmeldungen kommen seltener)
    const ti = tags.find(x => /^i\d+$/.test(x)), k = ti ? +ti.slice(1) : null;
    const tpt = tags.find(x => /^pts-\d+$/.test(x)), tdp = tags.find(x => /^dp-[a-z]+$/.test(x));
    if (PS.snap && tpt) PS.snap.pts = Math.max(Number(PS.snap.pts) || 0, +tpt.slice(4));
    if (PS.snap && tdp) PS.snap.dp = Array.from(new Set([...(Array.isArray(PS.snap.dp) ? PS.snap.dp : []), tdp.slice(3)]));
    if (PS.snap && k !== null && m.time * 1000 > PS.snap.t) {
      if (tags.includes('ev-arrived') || tags.includes('ev-forced')) Object.assign(PS.snap, { i: k, s: 'arrived', t: m.time * 1000 });
      else if (tags.includes('ev-solved')) Object.assign(PS.snap, { i: k, s: 'solved', t: m.time * 1000 });
      else if (tags.includes('ev-finished')) Object.assign(PS.snap, { fin: m.time * 1000, t: m.time * 1000 });
    }
    if (tags.includes('ev-chat') || tags.includes('ev-help')) {
      PS.chat.push({ from: 'kid', text: m.message, t: m.time * 1000 });
      newKid = true;
    }
  }
  return newKid;
}
let papaRenderTimer = null;
function papaRenderSoon() { clearTimeout(papaRenderTimer); papaRenderTimer = setTimeout(renderPapa, 150); }
async function papaPoll() {
  const topics = `${tp('log')},${tp('pos')},${tp('papa')}`;
  const since = PS.since || (PS.clearedAt ? Math.floor(PS.clearedAt / 1000) : 'all');
  try {
    const r = await fetch(`${LIVE.server}/${topics}/json?poll=1&since=${since}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    parseNd(await r.text()).sort((a, b) => a.time - b.time).forEach(papaHandle);
    PS.online = true;
  } catch (e) { PS.online = false; }
  PS.loaded = true;
  renderPapa();
  openStream('papaview', topics, () => PS.since || since, m => {
    PS.online = true;
    if (papaHandle(m) && PS.loaded) { fx('unlock'); document.title = '📻 Neue Nachricht – Papa-Zentrale'; setTimeout(() => { document.title = 'Papa-Zentrale'; }, 10000); }
    papaRenderSoon();
  });
}
function renderPapa() { renderPapaStatus(); renderPapaRsvp(); renderPapaStation(); renderPapaChat(); renderPapaLog(); updateMap(false); }
function renderPapaRsvp() {
  const el = $('#pRsvp');
  if (!el) return;
  const last = {}; // pro Gast die neueste Antwort (ntfy hält Ereignisse ca. 12 Stunden)
  PS.log.filter(e => (e.tags || []).includes('ev-rsvp')).forEach(e => { const id = (e.tags.find(x => x.startsWith('rid-')) || e.title); last[id] = e; });
  const list = Object.values(last);
  el.hidden = !list.length;
  if (!list.length) return;
  el.innerHTML = `<div class="label">💌 Antworten auf die Einladung (letzte 12 Std.)</div>` + list.map(e => `<div class="memb">${esc(e.title)}</div>`).join('')
    + '<p class="small">Die vollständige Liste steht in Jaspers Einsatzleiter-Zentrale.</p>';
}
function renderPapaStatus() {
  const el = $('#pStatus'), s = PS.snap;
  if (!el) return;
  const off = PS.online === false ? '<p class="feedback bad">⚠️ Keine Verbindung zu ntfy.sh – versuche es weiter …</p>' : '';
  if (!s) { el.innerHTML = `<div class="label">Agent</div><p>Noch keine Meldung. Sobald Jasper die Mission startet (mit eingeschalteter Live-Verbindung), erscheint er hier.</p>${off}`; return; }
  const n = D.stations.length, i = Math.max(0, Math.min(Number(s.i) || 0, n - 1)), st = D.stations[i];
  const num = x => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const label = s.fin ? '🏆 <b>Mission erfüllt!</b>' : s.s === 'travel' ? `unterwegs zu <b>${i + 1}. ${esc(st.targetName || st.title)}</b>`
    : s.s === 'arrived' ? `knobelt am Rätsel bei <b>${i + 1}. ${esc(st.title)}</b>` : `hat <b>${i + 1}. ${esc(st.title)}</b> gelöst`;
  const d = s.lat != null && !s.fin ? ' · Abstand zum Ziel ' + fmtDist(dist(s, st)) : '';
  const stale = Date.now() - s.t > 6 * 60000 && !s.fin
    ? `<p class="feedback bad">⚠️ Seit ${Math.round((Date.now() - s.t) / 60000)} Min. keine Meldung – Handy gesperrt, App zu oder kein Netz.</p>` : '';
  el.innerHTML = `<div class="label">Agent · Station ${Math.min(i + 1, n)} von ${n}</div><h2>${esc(s.n)}</h2><p>${label}</p>
    ${s.tm ? `<p class="small">👥 Team (${s.tm.length}): ${esc(s.tm.join(', '))}</p>` : ''}
    ${s.pts != null ? `<p class="small">🎖 ${num(s.pts)} Agentenpunkte · 📦 ${(Array.isArray(s.dp) ? s.dp : []).length}/${allDepots().length} Depots</p>` : ''}
    <p class="small">Letzte Meldung ${ago(s.t)} (${hhmm(s.t)})${s.acc != null ? ' · GPS ±' + num(s.acc) + ' m' : ''}${d} · Fragmente ${num(s.f)}/${D.stations.filter(x => x.fragment).length}${s.sim ? ' · 🧪 simuliert' : ''}</p>
    <div class="pbar"><div style="width:${(s.fin ? n : i + (s.s === 'solved' ? 1 : 0)) / n * 100}%"></div></div>${stale}${off}`;
  P.startedAt = s.st; P.finishedAt = s.fin; tick();
}
function renderPapaStation() {
  const el = $('#pStation');
  if (!el) return;
  const i = PS.snap ? Math.min(PS.snap.i, D.stations.length - 1) : 0, st = D.stations[i];
  if (el.dataset.i === String(i)) return;
  el.dataset.i = String(i);
  el.innerHTML = `<div class="label">Aktuelles Rätsel · Station ${i + 1}</div><h2>${esc(st.title)}</h2>
    <div class="riddle">${rich(st.riddle)}</div>
    <details><summary>🔑 Lösung & Tipp anzeigen</summary>
      <p><b>Lösung:</b> ${esc((st.answers || []).join(' / '))}</p>
      ${st.hint ? `<p><b>Tipp:</b> ${rich(st.hint)}</p>` : ''}
      ${st.fragment ? `<p class="small">Fragment: ${esc(st.fragment)}</p>` : ''}
    </details>`;
}
function renderPapaChat() {
  const box = $('#pMsgs');
  if (!box) return;
  const list = PS.chat.slice().sort((a, b) => a.t - b.t);
  if (box.dataset.n === String(list.length)) return;
  box.dataset.n = String(list.length);
  box.innerHTML = chatListHtml(list, 'papa');
  box.scrollTop = box.scrollHeight;
}
function renderPapaLog() {
  const el = $('#pLog');
  if (!el) return;
  if (el.dataset.n === String(PS.log.length)) return;
  el.dataset.n = String(PS.log.length);
  const icon = tags => ({ rocket: '🚀', round_pushpin: '📍', warning: '⚠️', x: '❌', bulb: '💡', white_check_mark: '✅', trophy: '🏆', speech_balloon: '💬', sos: '🆘', package: '📦', dart: '🎯', wave: '👋', envelope: '💌' })[tags[0]] || '•';
  el.innerHTML = PS.log.slice().reverse().slice(0, 150).map(e => `<div class="logrow"><span class="t">${hhmm(e.t)}</span> ${icon(e.tags)} <b>${esc(e.title)}</b>${e.text && e.text !== e.title ? `<div class="small">${esc(e.text)}</div>` : ''}</div>`).join('')
    || '<p class="small">Noch keine Ereignisse.</p>';
}

/* ---------- Karte (Leaflet nur in der Papa-Zentrale) ---------- */
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  return new Promise((res, rej) => {
    const l = document.createElement('link');
    Object.assign(l, { rel: 'stylesheet', href: LEAFLET.css, integrity: LEAFLET.cssSri, crossOrigin: 'anonymous' });
    document.head.appendChild(l);
    const s = document.createElement('script');
    Object.assign(s, { src: LEAFLET.js, integrity: LEAFLET.jsSri, crossOrigin: 'anonymous', onload: res, onerror: rej });
    document.head.appendChild(s);
  });
}
function fitRoute() { if (map) map.fitBounds(L.latLngBounds(D.stations.map(s => [s.lat, s.lon])), { padding: [24, 24] }); }
function initMap() {
  map = L.map('map', { zoomControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  mk.st = D.stations.map((s, i) => L.circleMarker([s.lat, s.lon], { radius: 9, weight: 2 }).bindTooltip(`${i + 1}. ${esc(s.title)}`));
  mk.st.slice().reverse().forEach(m => m.addTo(map)); // frühere Stationen liegen oben (Start = Ziel zu Hause)
  mk.dep = allDepots().map(d => L.circleMarker([d.lat, d.lon], { radius: 5, weight: 1, color: '#c084fc', fillColor: '#c084fc', fillOpacity: 0.8 })
    .bindTooltip(`${esc(d.icon)} ${esc(d.name)}`).addTo(map));
  mk.track = L.polyline([], { color: '#ff8a3d', weight: 4, opacity: 0.8 }).addTo(map);
  mk.acc = L.circle([0, 0], { radius: 1, color: '#39ff88', weight: 1, fillOpacity: 0.1 });
  mk.kid = L.circleMarker([0, 0], { radius: 10, color: '#ffffff', weight: 3, fillColor: '#39ff88', fillOpacity: 1 });
  map.on('dragstart', () => { followKid = false; });
  fitRoute();
  updateMap(true);
}
function updateMap(center) {
  if (!map) return;
  const s = PS.snap, i = s ? s.i : -1;
  mk.st.forEach((m, k) => {
    const c = s && (s.fin || k < i || (k === i && s.s === 'solved')) ? '#39ff88' : k === i ? '#ffc53d' : '#7a8a84';
    m.setStyle({ color: c, fillColor: c, fillOpacity: 0.55 });
  });
  const got = new Set((s && s.dp) || []);
  allDepots().forEach((d, k) => mk.dep[k].setStyle({ fillOpacity: got.has(d.id) ? 0.15 : 0.8 }));
  mk.track.setLatLngs(PS.track.slice().sort((a, b) => a[2] - b[2]).map(p => [p[0], p[1]]));
  if (s && s.lat != null) {
    mk.kid.setLatLng([s.lat, s.lon]).addTo(map).bindTooltip(esc(s.n));
    mk.acc.setLatLng([s.lat, s.lon]).setRadius(Math.max(s.acc || 0, 5)).addTo(map);
    if (followKid && (center || PS.track.length)) map.setView([s.lat, s.lon], Math.max(map.getZoom() || 14, 14));
  }
}
