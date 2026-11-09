/* Unterwegs: Geheimdepots (virtuelle Gegenstände auf den Fußwegen) und Spezialaufträge auf halber Strecke.
   Daten in stations.json: station.depots = [{id, icon, name, text, lat, lon, pts}] gelten auf dem Weg ZU dieser Station,
   station.task = {mode, text, pts, secs?} erscheint auf halber Strecke dorthin.
   Im Team-Modus entscheidet Jaspers Handy (Zentrale); die anderen melden Funde und „Erledigt“ per Funk. */
'use strict';

const DEPOT_SIGNAL = 400, DEPOT_RADIUS = 35, TASK_AFTER_MS = 6 * 60000;
const depotSent = {};
let taskTimer = null, lastPopupKey = '';
const popupQueue = []; // mehrere Meldungen nacheinander statt übereinander

function exInit() {
  P.pts = P.pts || 0; P.depots = P.depots || {}; P.tasks = P.tasks || {}; P.legStart = P.legStart || {};
  P.tp = P.tp || { A: 0, B: 0 }; P.mp = P.mp || {}; P.arr = P.arr || {};
}

/* ---------- Trupp-Wettkampf ----------
   Die Rätsel bleiben Teamarbeit, aber Punkte zählen auch pro Trupp und pro Agent:
   📦 Depot = Trupp des Finders · 🏃 Vorhut-Bonus = wer zuerst am Ziel ist · 🔐 Codeknacker-Bonus (Blitz < 3 Min. doppelt) ·
   📡 Spezialauftrag = beide Trupps. Am Ende: Bester Trupp + MVP. */
const BONUS_VORHUT = 20, BONUS_CODE = 10, BLITZ_MS = 3 * 60000;
function memberById(id) { return (TEAM.members || []).find(x => x.id === id); }
function award(pts, mid) {
  exInit();
  P.pts += pts;
  const m = teamOn() && mid ? memberById(mid) : null;
  if (m) { P.tp[m.trupp] = (P.tp[m.trupp] || 0) + pts; P.mp[mid] = (P.mp[mid] || 0) + pts; }
  return m;
}
function awardBoth(pts) {
  exInit();
  P.pts += pts;
  if (teamOn()) { P.tp.A = (P.tp.A || 0) + Math.round(pts / 2); P.tp.B = (P.tp.B || 0) + Math.round(pts / 2); }
}
function flashBonus(text) {
  const el = document.createElement('div');
  el.className = 'bonusflash'; el.textContent = text;
  document.body.appendChild(el); setTimeout(() => el.remove(), 2600);
}
/* Station erreicht (von app.js unlock aufgerufen) */
function exArrived(forced, byId) {
  exInit();
  P.arr[P.idx] = Date.now();
  if (forced) return;
  moleArrived();
  const m = award(BONUS_VORHUT, byId || myId());
  if (m) flashBonus(`🏃 Vorhut-Bonus +${BONUS_VORHUT} für ${m.trupp === 'A' ? '🟥 Trupp A' : '🟦 Trupp B'} (${m.alias || m.name})`);
}
/* Rätsel gelöst (von app.js solve aufgerufen) */
function exSolved(byId) {
  exInit();
  const blitz = P.arr[P.idx] && Date.now() - P.arr[P.idx] <= BLITZ_MS;
  const pts = blitz ? BONUS_CODE * 2 : BONUS_CODE;
  const m = award(pts, byId || myId());
  if (m) flashBonus(`${blitz ? '⚡ Blitz-' : '🔐 '}Codeknacker-Bonus +${pts} für ${m.trupp === 'A' ? '🟥 Trupp A' : '🟦 Trupp B'}`);
}
function scoreboardHtml() {
  exInit();
  if (!teamOn()) return '';
  const a = P.tp.A || 0, b = P.tp.B || 0;
  return `<div class="scoreboard"><span class="sA">🟥 A <b>${a}</b></span><span class="vs">:</span><span class="sB"><b>${b}</b> B 🟦</span></div>`;
}
const allDepots = () => D.stations.flatMap(s => s.depots || []);
const legDepots = () => (cur().depots || []);
const depotById = id => allDepots().find(d => d.id === id);

/* ---------- laufend: Depots einsammeln, Auftrag auslösen ---------- */
function exOnPos() {
  exInit();
  if (!P.name || P.finishedAt || P.status !== 'travel') return;
  const p = here();
  if (!p) return;
  for (const dp of legDepots()) {
    if (P.depots[dp.id]) continue;
    if (dist(p, dp) <= DEPOT_RADIUS + Math.min(p.acc || 0, 20)) requestDepot(dp.id);
  }
  exTaskCheck();
}
function exTaskCheck() {
  exInit();
  if (isMember() || !P.name || P.finishedAt || P.status !== 'travel') return;
  const st = cur(), k = P.idx;
  if (!st.task || P.tasks[k]) return;
  const p = here();
  if (!P.legStart[k]) {
    if (!p) return;
    P.legStart[k] = { t: Date.now(), d: Math.round(dist(p, st)) }; save();
    return;
  }
  const ls = P.legStart[k];
  const half = p && ls.d >= 500 && dist(p, st) <= ls.d * 0.5;
  const late = ls.d >= 500 && Date.now() - ls.t >= TASK_AFTER_MS;
  if (half || late) {
    P.tasks[k] = 'open'; save();
    showTask(k);
    liveEvent('task', `Spezialauftrag Station ${k + 1}`, st.task.text.replace(/\*\*/g, '').slice(0, 140), 2);
  }
}

/* ---------- Depots ---------- */
function requestDepot(id) {
  if (!isMember()) return collectDepot(id, P.name, myId());
  const now = Date.now();
  if (depotSent[id] && now - depotSent[id] < 20000) return;
  depotSent[id] = now;
  teamAct('depot', { d: id });
}
function collectDepot(id, by, byId) {
  exInit();
  const dp = depotById(id);
  if (!dp || P.depots[id]) return;
  P.depots[id] = by || '?';
  award(dp.pts || 50, byId || myId());
  save();
  showDepot(dp, by);
  liveEvent('depot', `Depot geknackt: ${dp.name}${by ? ' – ' + by : ''}`, `+${dp.pts || 50} Punkte · gesamt ${P.pts}`, 2, dp.id);
  if (P.status === 'travel') renderTravel();
}
function showDepot(dp, by) {
  const key = 'd' + dp.id;
  if (lastPopupKey === key) return;
  if (!$('#exmodal').hidden) { if (!popupQueue.some(q => q.key === key)) popupQueue.push({ key, fn: () => showDepot(dp, by) }); return; }
  lastPopupKey = key;
  fx('good');
  openExModal(`<div class="center">
    <div class="label">📦 Geheimdepot geknackt</div>
    <div class="depot-icon pop">${esc(dp.icon)}</div>
    <h2>${esc(dp.name)}</h2>
    <p>${esc(dp.text)}</p>
    ${by && by !== P.name ? `<p class="small">Gefunden von ${esc(by)}</p>` : ''}
    ${teamOn() ? `<p class="small">Punkte für den Trupp des Finders</p>` : ''}
    <div class="ptsbig">+${dp.pts || 50} Agentenpunkte</div>
    <button class="btn" id="exOk">Ins Agentengepäck</button></div>`);
}

/* ---------- Spezialaufträge ---------- */
function showTask(k) {
  const st = D.stations[k];
  if (!st || !st.task) return;
  const key = 't' + k;
  if (lastPopupKey === key && !$('#exmodal').hidden) return;
  if (!$('#exmodal').hidden) { if (!popupQueue.some(q => q.key === key)) popupQueue.push({ key, fn: () => showTask(k) }); return; }
  lastPopupKey = key;
  fx('unlock');
  const t = st.task, done = P.tasks[k] === 'done';
  openExModal(`<div class="center">
    <div class="stamp">📡 SPEZIALAUFTRAG</div>
    <p style="text-align:left;font-size:18px">${rich(t.text)}</p>
    ${radioBtnHtml('task')}
    ${t.secs && !done ? `<div class="tasktimer" id="taskT">${t.secs}</div><button class="btn warn" id="taskGo">▶ Countdown starten</button>` : ''}
    ${done ? '<p class="feedback good">✅ Erledigt</p><button class="btn" id="exOk">OK</button>'
      : `<button class="btn" id="taskDone">✅ Auftrag erledigt (+${t.pts || 30})</button><button class="btn sec small" id="exOk">Später</button>`}
  </div>`);
  const go = $('#taskGo');
  if (go) go.onclick = () => {
    initAudio(); go.disabled = true;
    let s = t.secs; clearInterval(taskTimer);
    taskTimer = setInterval(() => {
      s--; const el = $('#taskT'); if (el) el.textContent = Math.max(s, 0);
      if (s <= 0) { clearInterval(taskTimer); fx('win'); if (el) el.textContent = '✔'; }
    }, 1000);
  };
  bindRadio({ task: 'Spezialauftrag! ' + t.text });
  const dn = $('#taskDone');
  if (dn) dn.onclick = () => { clearInterval(taskTimer); closeExModal(); requestTaskDone(k); };
}
function requestTaskDone(k) {
  if (isMember()) { teamAct('task', { x: k }); P.tasks[k] = 'done'; fx('good'); return; }
  completeTask(k, P.name);
}
function completeTask(k, by) {
  exInit();
  const st = D.stations[k];
  if (!st || !st.task || P.tasks[k] === 'done') return;
  P.tasks[k] = 'done'; awardBoth(st.task.pts || 30); save(); fx('good');
  liveEvent('task', `Spezialauftrag erledigt (Station ${k + 1})${by ? ' – ' + by : ''}`, `+${st.task.pts || 30} Punkte · gesamt ${P.pts}`, 2);
  if (P.status === 'travel') renderTravel();
}

/* ---------- Modal ---------- */
function openExModal(html) {
  const m = $('#exmodal');
  m.innerHTML = `<div class="wrap"><div class="card exmodal pop">${html}</div></div>`;
  m.hidden = false;
  const ok = $('#exOk'); if (ok) ok.onclick = closeExModal;
}
function closeExModal() {
  $('#exmodal').hidden = true; clearInterval(taskTimer); lastPopupKey = '';
  let next;
  while ((next = popupQueue.shift())) {
    // Aufträge nur zeigen, wenn sie noch offen sind und zur aktuellen Strecke gehören
    if (next.key[0] === 't' && (+next.key.slice(1) !== P.idx || P.tasks[+next.key.slice(1)] !== 'open')) continue;
    setTimeout(next.fn, 300); break;
  }
}

/* ---------- Anzeige ---------- */
function exTravelHtml() {
  exInit();
  const st = cur(), k = P.idx, deps = legDepots();
  const found = deps.filter(d => P.depots[d.id]).length;
  const taskOpen = st.task && P.tasks[k] === 'open';
  const total = allDepots().length, have = Object.keys(P.depots).length;
  return `<div class="card excard">
    ${scoreboardHtml()}
    <div class="exrow"><span>🎖 <b id="exPts">${Number(P.pts) || 0}</b> Agentenpunkte</span><span>📦 ${have}/${total} Depots</span></div>
    ${deps.length ? `<div class="scanner" id="exScan">📡 Depot-Scanner: ${found}/${deps.length} auf dieser Strecke</div>` : ''}
    ${taskOpen ? '<button class="btn warn small" id="exTaskOpen">📡 Offener Spezialauftrag – antippen</button>' : ''}
    ${have ? `<div class="inv">${allDepots().filter(d => P.depots[d.id]).map(d => `<span title="${esc(d.name)}">${esc(d.icon)}</span>`).join('')}</div>` : ''}
  </div>`;
}
function exBindTravel() {
  const b = $('#exTaskOpen'); if (b) b.onclick = () => showTask(P.idx);
}
function exUpdateLive() {
  const el = $('#exScan'), p = here();
  if (!el || !p) return;
  const open = legDepots().filter(d => !P.depots[d.id]);
  if (!open.length) { el.textContent = '📡 Depot-Scanner: alle Depots dieser Strecke gefunden ✓'; el.className = 'scanner'; return; }
  const near = Math.min(...open.map(d => dist(p, d)));
  if (near > DEPOT_SIGNAL) { el.textContent = `📡 Depot-Scanner: kein Signal · ${legDepots().length - open.length}/${legDepots().length} gefunden`; el.className = 'scanner'; return; }
  const [hl, hc] = heat(near);
  el.innerHTML = `📡 <b>Depot-Signal!</b> ${fmtDist(near)} · <span class="${hc}">${esc(hl)}</span>`;
  el.className = 'scanner on';
}
function exVictoryHtml() {
  exInit();
  const got = allDepots().filter(d => P.depots[d.id]);
  const tasks = Object.values(P.tasks).filter(v => v === 'done').length;
  return `🎖 Agentenpunkte: <b>${Number(P.pts) || 0}</b><br>📦 Depots: <b>${got.length}/${allDepots().length}</b> ${got.map(d => esc(d.icon)).join(' ')}<br>📡 Spezialaufträge: <b>${tasks}</b><br>`;
}
/* Rangliste beim Finale */
function rankingHtml() {
  exInit();
  if (!teamOn()) return '';
  const a = P.tp.A || 0, b = P.tp.B || 0;
  const best = a === b ? '🤝 Unentschieden – beide Trupps sind Elite!' : `🏆 Bester Trupp: <b>${a > b ? '🟥 Trupp A' : '🟦 Trupp B'}</b>`;
  const list = TEAM.members.map(m => ({ m, p: P.mp[m.id] || 0 })).sort((x, y) => y.p - x.p);
  const mvp = list[0] && list[0].p > 0 ? list[0] : null;
  return `<div class="card center pop">
    <div class="label">Rangliste</div>
    ${scoreboardHtml()}
    <p style="font-size:19px;margin:10px 0">${best}</p>
    ${mvp ? `<div class="mvp">⭐ MVP-Agent<br><span>${esc(mvp.m.alias || mvp.m.name)}</span><br><small>${esc(mvp.m.name)} · ${mvp.p} Punkte</small></div>` : ''}
    <div style="text-align:left;margin-top:12px">${list.map((x, i) => `<div class="memb trupp-${x.m.trupp}"><span>${i + 1}. ${memberLabel(x.m)}</span><b>${x.p}</b></div>`).join('')}</div>
  </div>`;
}

/* ---------- Team: Zentrale nimmt Funde/Erledigt an, Mitspieler zeigen Neues an ---------- */
function exHostApply(a) {
  if (a.k === 'depot') { const dp = depotById(a.d); if (dp && (cur().depots || []).some(x => x.id === a.d)) collectDepot(a.d, a.n, a.id); return true; }
  if (a.k === 'photo') { const k = Number(a.x); if (Number.isInteger(k) && D.stations[k] && D.stations[k].photo) markPhoto(k, a.n, !!a.skip); return true; }
  if (a.k === 'task') { if (P.tasks && P.tasks[a.x] === 'open') completeTask(a.x, a.n); return true; }
  return false;
}
function exStateFields() { exInit(); return { pts: P.pts, dp: P.depots, tk: P.tasks, tp: P.tp, mp: P.mp, ph: P.photos || {} }; }
function exApplyState(s) {
  exInit();
  const before = { dp: Object.assign({}, P.depots), tk: Object.assign({}, P.tasks) };
  P.pts = Number(s.pts) || 0;
  P.depots = s.dp && typeof s.dp === 'object' && !Array.isArray(s.dp) ? s.dp : {};
  P.tasks = s.tk && typeof s.tk === 'object' && !Array.isArray(s.tk) ? s.tk : {};
  P.photos = {};
  if (s.ph && typeof s.ph === 'object') for (const [k, v] of Object.entries(s.ph)) if (v && D.stations[+k]) P.photos[+k] = { by: String(v.by || '?').slice(0, 24), skip: !!v.skip };
  const oldTp = Object.assign({}, P.tp);
  P.tp = { A: Number(s.tp && s.tp.A) || 0, B: Number(s.tp && s.tp.B) || 0 };
  P.mp = {}; if (s.mp && typeof s.mp === 'object') for (const [k, v] of Object.entries(s.mp)) P.mp[String(k).slice(0, 20)] = Number(v) || 0;
  if (memberReady() && (P.tp.A !== (oldTp.A || 0) || P.tp.B !== (oldTp.B || 0))) {
    const dA = P.tp.A - (oldTp.A || 0), dB = P.tp.B - (oldTp.B || 0);
    if (dA > 0 && dB === 0) flashBonus(`🎖 🟥 Trupp A +${dA}`); else if (dB > 0 && dA === 0) flashBonus(`🎖 🟦 Trupp B +${dB}`);
    const sb = $('.scoreboard'); if (sb) sb.outerHTML = scoreboardHtml();
  }
  if (!memberReady()) return; // in der Einladungs-Lobby nichts verraten
  for (const id of Object.keys(P.depots)) if (!before.dp[id]) { const dp = depotById(id); if (dp) showDepot(dp, P.depots[id]); }
  for (const [k, v] of Object.entries(P.tasks)) if (v === 'open' && !before.tk[k] && +k === P.idx) showTask(+k);
}
