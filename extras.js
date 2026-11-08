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
    liveEvent('chat', `Spezialauftrag Station ${k + 1}`, st.task.text.replace(/\*\*/g, '').slice(0, 140), 2);
  }
}

/* ---------- Depots ---------- */
function requestDepot(id) {
  if (!isMember()) return collectDepot(id, P.name);
  const now = Date.now();
  if (depotSent[id] && now - depotSent[id] < 20000) return;
  depotSent[id] = now;
  teamAct('depot', { d: id });
}
function collectDepot(id, by) {
  exInit();
  const dp = depotById(id);
  if (!dp || P.depots[id]) return;
  P.depots[id] = by || '?';
  P.pts += dp.pts || 50;
  save();
  showDepot(dp, by);
  liveEvent('solved', `Depot geknackt: ${dp.name}${by ? ' – ' + by : ''}`, `+${dp.pts || 50} Punkte · gesamt ${P.pts}`, 2);
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
  P.tasks[k] = 'done'; P.pts += st.task.pts || 30; save(); fx('good');
  liveEvent('solved', `Spezialauftrag erledigt (Station ${k + 1})${by ? ' – ' + by : ''}`, `+${st.task.pts || 30} Punkte · gesamt ${P.pts}`, 2);
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
  const next = popupQueue.shift();
  if (next) setTimeout(next.fn, 300);
}

/* ---------- Anzeige ---------- */
function exTravelHtml() {
  exInit();
  const st = cur(), k = P.idx, deps = legDepots();
  const found = deps.filter(d => P.depots[d.id]).length;
  const taskOpen = st.task && P.tasks[k] === 'open';
  const total = allDepots().length, have = Object.keys(P.depots).length;
  return `<div class="card excard">
    <div class="exrow"><span>🎖 <b id="exPts">${P.pts}</b> Agentenpunkte</span><span>📦 ${have}/${total} Depots</span></div>
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
  return `🎖 Agentenpunkte: <b>${P.pts}</b><br>📦 Depots: <b>${got.length}/${allDepots().length}</b> ${got.map(d => esc(d.icon)).join(' ')}<br>📡 Spezialaufträge: <b>${tasks}</b><br>`;
}

/* ---------- Team: Zentrale nimmt Funde/Erledigt an, Mitspieler zeigen Neues an ---------- */
function exHostApply(a) {
  if (a.k === 'depot') { const dp = depotById(a.d); if (dp && (cur().depots || []).some(x => x.id === a.d)) collectDepot(a.d, a.n); return true; }
  if (a.k === 'task') { if (P.tasks && P.tasks[a.x] === 'open') completeTask(a.x, a.n); return true; }
  return false;
}
function exStateFields() { exInit(); return { pts: P.pts, dp: P.depots, tk: P.tasks }; }
function exApplyState(s) {
  exInit();
  const before = { dp: Object.assign({}, P.depots), tk: Object.assign({}, P.tasks) };
  P.pts = s.pts || 0; P.depots = s.dp || {}; P.tasks = s.tk || {};
  for (const id of Object.keys(P.depots)) if (!before.dp[id]) { const dp = depotById(id); if (dp) showDepot(dp, P.depots[id]); }
  for (const [k, v] of Object.entries(P.tasks)) if (v === 'open' && !before.tk[k] && memberReady()) showTask(+k);
}
