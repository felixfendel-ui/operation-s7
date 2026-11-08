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
  solved: 'white_check_mark', finished: 'trophy', chat: 'speech_balloon', help: 'sos' };

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
  return 's7-' + Array.from(b, x => a[x % a.length]).join('');
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
  const r = await fetch((LIVE.server || NTFY) + '/', { method: 'POST', body: JSON.stringify(body) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
}
function enqueue(m) {
  if (m.topic.endsWith('-pos')) OUTBOX = OUTBOX.filter(x => x.topic !== m.topic); // nur die neueste Position
  if (m._k) OUTBOX = OUTBOX.filter(x => !(x._k === m._k && x.topic === m.topic));
  OUTBOX.push(m);
  if (OUTBOX.length > 150) OUTBOX = OUTBOX.slice(-150);
  lsSet(KEY_OUT, OUTBOX);
  flush();
}
async function flush() {
  if (flushing || !OUTBOX.length) return;
  flushing = true;
  try {
    while (OUTBOX.length) {
      const m = OUTBOX[0];
      await publish(m);
      OUTBOX = OUTBOX.filter(x => x !== m); // per Identität entfernen – die Liste kann sich währenddessen ändern
      lsSet(KEY_OUT, OUTBOX);
    }
  } catch (e) { /* später erneut */ } finally { flushing = false; }
}

/* ---------- Jasper-Seite: Ereignisse & Position ---------- */
function liveEvent(type, title, message, priority = 3) {
  if (!liveOn() || !P || !P.name || PAPA || isMember()) return;
  enqueue({ topic: tp('log'), title, message: message || title, tags: [EV_TAG[type] || 'spy', 'ev-' + type, 'i' + P.idx], priority });
  liveSnapshot(true);
}
function liveSnapshot(force) {
  if (!liveOn() || !P || !P.name || PAPA || isMember()) return;
  const now = Date.now();
  if (!force && now - lastSnap < POS_EVERY) return;
  lastSnap = now;
  const p = here();
  const s = { n: P.name, i: P.idx, s: P.status, f: Object.keys(P.frags).length, st: P.startedAt, fin: P.finishedAt, t: now };
  if (teamOn()) s.tm = teamNames();
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
  if (CHAT.some(c => c.id === m.id)) return;
  CHAT.push({ id: m.id, from: 'papa', text: m.message, t: m.time * 1000 });
  lsSet(KEY_CHAT, CHAT);
  fx('unlock');
  if ($('#chat').hidden) { unread++; showToast(m.message); } else renderChat();
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
  const t = LIVE.topic;
  return `<div class="card"><h3>LIVE-VERBINDUNG ZU PAPA</h3>
    <p class="small">Status: <b>${liveOn() ? 'aktiv' : 'aus'}</b>${t ? ` · Kanal <code>${esc(t)}</code>` : ''}${OUTBOX.length ? ` · ${OUTBOX.length} Nachricht(en) warten auf Netz` : ''}</p>
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
      if (navigator.share) return void navigator.share({ title: 'Operation S7 – Papa-Zentrale', url: papaLink() }).catch(() => {});
      return copyText(papaLink(), liveMsg);
    case 'liveTest':
      liveMsg('Sende …');
      return void publish({ topic: tp('log'), title: 'Operation S7: Testnachricht', message: 'Die Live-Verbindung funktioniert.', tags: ['white_check_mark'] })
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
    <div class="card mapcard"><div id="map"></div>
      <div class="row" style="margin-top:8px"><button class="btn sec small" id="pFollow">🎯 Jasper folgen</button><button class="btn sec small" id="pAll">🗺 Ganze Route</button></div></div>
    <div class="card"><h3 class="label">Funk</h3>
      <div class="msgs" id="pMsgs"></div>
      <div class="quick">${QUICK_PAPA.map((q, i) => `<button type="button" data-pq="${i}">${esc(q)}</button>`).join('')}</div>
      <div class="sendrow"><input id="pIn" maxlength="300" placeholder="Nachricht an Jasper" autocomplete="off"><button class="btn" id="pSend">Senden</button></div>
      <div class="feedback" id="pFb"></div></div>
    <div class="card" id="pStation"></div>
    <div class="card"><div class="adm-head"><h3 class="label" style="margin:0">Verlauf</h3><button class="btn sec small" style="width:auto;margin:0" id="pClear">🧹 Ansicht leeren</button></div><div id="pLog"></div></div>
    <p class="small center">Push aufs Handy: ntfy-App → Server ntfy.sh → Kanal <code>${esc(topic)}-log</code> abonnieren.</p>`;
  $('#pSend').onclick = () => papaSend($('#pIn').value, true);
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
  setInterval(papaPoll, PAPA_POLL);
  setInterval(renderPapaStatus, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) papaPoll(); });
}
async function papaSend(text, fromInput) {
  text = String(text || '').trim();
  if (!text) return;
  const fb = $('#pFb');
  try {
    await publish({ topic: tp('papa'), title: 'Papa', message: text, tags: ['radio'] });
    if (fromInput) $('#pIn').value = '';
    fb.className = 'feedback good'; fb.textContent = 'Gesendet ✓ – Jasper sieht es, sobald seine App offen ist.';
    papaPoll();
  } catch (e) { fb.className = 'feedback bad'; fb.textContent = 'Senden fehlgeschlagen: ' + e.message; }
}
async function papaPoll() {
  const since = PS.since || (PS.clearedAt ? Math.floor(PS.clearedAt / 1000) : 'all');
  try {
    const r = await fetch(`${LIVE.server}/${tp('log')},${tp('pos')},${tp('papa')}/json?poll=1&since=${since}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    let newKid = false;
    for (const m of parseNd(await r.text()).sort((a, b) => a.time - b.time)) {
      if (PS.seen.has(m.id)) continue;
      PS.seen.add(m.id);
      PS.since = Math.max(PS.since, m.time);
      if (PS.clearedAt && m.time * 1000 < PS.clearedAt) continue;
      if (m.topic === tp('pos')) {
        try {
          const s = JSON.parse(m.message);
          if (!PS.snap || s.t >= PS.snap.t) PS.snap = s;
          if (s.lat != null) PS.track.push([s.lat, s.lon, s.t]);
        } catch (e) {}
      } else if (m.topic === tp('papa')) {
        PS.chat.push({ from: 'papa', text: m.message, t: m.time * 1000 });
      } else {
        const tags = m.tags || [];
        PS.log.push({ title: m.title || '', text: m.message || '', t: m.time * 1000, tags });
        if (tags.includes('ev-chat') || tags.includes('ev-help')) {
          PS.chat.push({ from: 'kid', text: m.message, t: m.time * 1000 });
          if (PS.loaded) newKid = true;
        }
      }
    }
    PS.loaded = true; PS.online = true;
    renderPapa();
    if (newKid) { fx('unlock'); document.title = '📻 Neue Nachricht – Papa-Zentrale'; setTimeout(() => { document.title = 'Papa-Zentrale'; }, 10000); }
  } catch (e) { PS.online = false; renderPapaStatus(); }
}
function renderPapa() { renderPapaStatus(); renderPapaStation(); renderPapaChat(); renderPapaLog(); updateMap(false); }
function renderPapaStatus() {
  const el = $('#pStatus'), s = PS.snap;
  if (!el) return;
  const off = PS.online === false ? '<p class="feedback bad">⚠️ Keine Verbindung zu ntfy.sh – versuche es weiter …</p>' : '';
  if (!s) { el.innerHTML = `<div class="label">Agent</div><p>Noch keine Meldung. Sobald Jasper die Mission startet (mit eingeschalteter Live-Verbindung), erscheint er hier.</p>${off}`; return; }
  const n = D.stations.length, i = Math.min(s.i, n - 1), st = D.stations[i];
  const label = s.fin ? '🏆 <b>Mission erfüllt!</b>' : s.s === 'travel' ? `unterwegs zu <b>${i + 1}. ${esc(st.targetName || st.title)}</b>`
    : s.s === 'arrived' ? `knobelt am Rätsel bei <b>${i + 1}. ${esc(st.title)}</b>` : `hat <b>${i + 1}. ${esc(st.title)}</b> gelöst`;
  const d = s.lat != null && !s.fin ? ' · Abstand zum Ziel ' + fmtDist(dist(s, st)) : '';
  const stale = Date.now() - s.t > 6 * 60000 && !s.fin
    ? `<p class="feedback bad">⚠️ Seit ${Math.round((Date.now() - s.t) / 60000)} Min. keine Meldung – Handy gesperrt, App zu oder kein Netz.</p>` : '';
  el.innerHTML = `<div class="label">Agent · Station ${Math.min(i + 1, n)} von ${n}</div><h2>${esc(s.n)}</h2><p>${label}</p>
    ${s.tm ? `<p class="small">👥 Team (${s.tm.length}): ${esc(s.tm.join(', '))}</p>` : ''}
    <p class="small">Letzte Meldung ${ago(s.t)} (${hhmm(s.t)})${s.acc != null ? ' · GPS ±' + s.acc + ' m' : ''}${d} · Fragmente ${s.f}/${D.stations.filter(x => x.fragment).length}${s.sim ? ' · 🧪 simuliert' : ''}</p>
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
  const icon = tags => ({ rocket: '🚀', round_pushpin: '📍', warning: '⚠️', x: '❌', bulb: '💡', white_check_mark: '✅', trophy: '🏆', speech_balloon: '💬', sos: '🆘' })[tags[0]] || '•';
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
  mk.track.setLatLngs(PS.track.slice().sort((a, b) => a[2] - b[2]).map(p => [p[0], p[1]]));
  if (s && s.lat != null) {
    mk.kid.setLatLng([s.lat, s.lon]).addTo(map).bindTooltip(esc(s.n));
    mk.acc.setLatLng([s.lat, s.lon]).setRadius(Math.max(s.acc || 0, 5)).addTo(map);
    if (followKid && (center || PS.track.length)) map.setView([s.lat, s.lon], Math.max(map.getZoom() || 14, 14));
  }
}
