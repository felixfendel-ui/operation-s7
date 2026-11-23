/* Rate-Schutz & strengere Tipps
   - Falsche Antworten zählen fürs ganze Team (Jaspers Handy führt Buch, alle Handys sehen es).
   - Ab dem 3. Fehlversuch an einer Station: „Funkstille“ – Eingabe gesperrt (30 s, 60 s, dann je 120 s).
   - Jeder Fehlversuch kostet Punkte.
   - Der Tipp gibt es erst nach einer Mindestzeit an der Station UND einigen echten Versuchen – und er kostet Punkte.
   - Papa kann über die Zentrale trotzdem jederzeit einen Tipp gratis freischalten.
   Einstellbar in stations.json: "rules": { "lockAfter": 2, "lockSecs": [30, 60, 120], "wrongPts": 5,
                                             "hintWaitMin": 3, "hintMinWrong": 2, "hintPts": 25 }
   pro Station überschreibbar mit "hintWaitMin" / "hintMinWrong". */

const RULES_DEF = { lockAfter: 2, lockSecs: [30, 60, 120], wrongPts: 5, hintWaitMin: 3, hintMinWrong: 2, hintPts: 25 };
const rules = () => Object.assign({}, RULES_DEF, (typeof D !== 'undefined' && D && D.rules) || {});
const gSid = () => { const st = cur(); return st ? (st.id || P.idx) : P.idx; };
const wrongCount = () => (P.wt && Number(P.wt[gSid()])) || 0;
const lockLeft = () => (P.lock && P.lock.i === P.idx && Date.now() < P.lock.until) ? Math.ceil((P.lock.until - Date.now()) / 1000) : 0;

function lockSecsFor(n) { // n = Anzahl Fehlversuche nach diesem Versuch
  const R = rules(), k = n - R.lockAfter;
  if (k <= 0) return 0;
  const L = R.lockSecs.length ? R.lockSecs : [60];
  return L[Math.min(k - 1, L.length - 1)];
}
/* Fehlversuch verbuchen (auf Jaspers Handy verbindlich; auf Mitspieler-Handys sofort als Vorschau) */
function registerWrong(charge) {
  const sid = gSid();
  P.wt = Object.assign({}, P.wt, { [sid]: wrongCount() + 1 });
  const s = lockSecsFor(P.wt[sid]);
  if (s) P.lock = { i: P.idx, until: Date.now() + s * 1000 };
  if (charge) penalize(rules().wrongPts);
  return s;
}
function penalize(pts) {
  if (!pts) return;
  P.pts = Math.max(0, (Number(P.pts) || 0) - pts);
  if (teamOn() && P.tp) { P.tp.A = Math.max(0, (P.tp.A || 0) - pts / 2); P.tp.B = Math.max(0, (P.tp.B || 0) - pts / 2); }
}

/* Darf das Team schon einen Tipp anfordern? */
function hintState() {
  const R = rules(), st = cur() || {};
  const waitMin = isFinite(st.hintWaitMin) ? Number(st.hintWaitMin) : R.hintWaitMin;
  const minWrong = isFinite(st.hintMinWrong) ? Number(st.hintMinWrong) : R.hintMinWrong;
  const at = P.at && P.at.i === P.idx ? P.at.t : 0;
  const wait = at ? Math.max(0, Math.ceil((at + waitMin * 60000 - Date.now()) / 1000)) : 0;
  const need = Math.max(0, minWrong - wrongCount());
  return { ok: !wait && !need, wait, need, pts: R.hintPts };
}
function hintLockedText(h) {
  const parts = [];
  if (h.wait) parts.push(`noch ${Math.floor(h.wait / 60)}:${String(h.wait % 60).padStart(2, '0')} Min. nachdenken`);
  if (h.need) parts.push(`noch ${h.need} ${h.need === 1 ? 'ernsthafter Versuch' : 'ernsthafte Versuche'}`);
  return '🔒 Tipp gesperrt – ' + parts.join(' und ');
}
/* Auf Jaspers Handy: Tipp freigeben, wenn erlaubt (Mitspieler fragen per Funk an) */
function grantHint(by, free) {
  const sid = gSid();
  if (P.hints[sid]) return false;
  if (!free && !hintState().ok) return false;
  P.hints[sid] = true;
  if (!free) penalize(rules().hintPts);
  save(); render();
  liveEvent('hint', `Station ${P.idx + 1}: Tipp genutzt${by ? ' (' + by + ')' : ''}${free ? '' : ` – −${rules().hintPts} Punkte`}`, cur().title);
  return true;
}

/* Team-Stand */
function guardStateFields() { return { wt: P.wt || {}, lk: P.lock || null, at: P.at || null }; }
function guardApplyState(s) {
  P.wt = s.wt && typeof s.wt === 'object' ? s.wt : {};
  P.lock = s.lk && typeof s.lk === 'object' ? { i: Number(s.lk.i), until: Number(s.lk.until) || 0 } : null;
  P.at = s.at && typeof s.at === 'object' ? { i: Number(s.at.i), t: Number(s.at.t) || 0 } : null;
}

/* Sekündlich: Countdown anzeigen und bei Ablauf neu zeichnen */
let guardWas = null;
setInterval(() => {
  if (!P || P.status !== 'arrived' || !$('#ansWrap')) { guardWas = null; return; }
  const l = lockLeft(), h = hintState(), li = $('#lockInfo'), hi = $('#hintLocked');
  if (li && l) li.textContent = `📵 Funkstille! Der Maulwurf stört eure Leitung – noch ${l} Sek. keine Eingabe.`;
  if (hi && !h.ok) hi.textContent = hintLockedText(h);
  const now = (l ? 'L' : '') + (h.ok ? 'H' : '');
  if (guardWas !== null && now !== guardWas) renderRiddle();
  guardWas = now;
}, 1000);
