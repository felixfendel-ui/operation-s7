/* Etappen: Eine Station kann aus mehreren Teilstrecken bestehen (zu Fuß zur Haltestelle → Bahn/Bus → zu Fuß zum Ziel).
   Der Radar-Pfeil zeigt immer auf das Ziel der AKTUELLEN Etappe, nicht quer durchs Gelände aufs Endziel.

   In stations.json pro Station optional:
   "legs": [
     { "mode": "walk", "name": "S-Bahnhof Wolfratshausen", "lat": 47.9133, "lon": 11.4265, "radius": 120 },
     { "mode": "ride", "vehicle": "sbahn", "line": "S7", "dir": "München", "stops": 2,
       "from": { "id": "de:09173:4760", "name": "Wolfratshausen", "lat": 47.9133, "lon": 11.4265 },
       "exit": "Ebenhausen-Schäftlarn", "lat": …, "lon": …, "radius": 300, "hide": false,
       "dirNot": ["Wolfratshausen"] }
   ]
   - Eine Etappe OHNE lat/lon führt direkt zum Stationsziel (z. B. die Bahnfahrt bis zum Ziel-Bahnhof).
   - Hat die letzte Etappe ein eigenes Ziel, folgt automatisch „zu Fuß zum Ziel“.
   - "from.id" = MVV/MVG-Haltestellen-ID (globalId) → Live-Abfahrten der Linie in die richtige Richtung.
     "dir"/"dirNot": Teile des Fahrtziels, die passen / nicht passen müssen (Richtungsfilter), "dirLabel": Anzeige.
   - "hide": Ausstiegs-Haltestelle nicht nennen (verrät sonst das Ziel) – dann zählt „nach N Stationen / Radar < 300 m“.
   - Etappen werden pro Handy über das GPS weitergeschaltet; Team-Ankunft an der Station bleibt wie gehabt. */

const KEY_LEG = 'sj7_leg';
const LEG_ICON = { walk: '🚶', sbahn: '🚆', ubahn: '🚇', tram: '🚋', bus: '🚌', bahn: '🚆', ride: '🚆' };
const MVG_TYPES = { sbahn: 'SBAHN', ubahn: 'UBAHN', tram: 'TRAM', bus: 'BUS', bahn: 'BAHN' };
let legDep = { key: '', t: 0, list: null, err: false, busy: false };

/* Alle Etappen der Station inkl. automatischem Schlussstück „zu Fuß zum Ziel“ */
function legsOf(st) {
  if (!st || !Array.isArray(st.legs) || !st.legs.length || testPoint()) return [];
  const L = st.legs.map(l => Object.assign({}, l));
  const last = L[L.length - 1];
  if (isFinite(last.lat) && isFinite(last.lon)) L.push({ mode: 'walk', final: true });
  L.forEach(l => { if (!(isFinite(l.lat) && isFinite(l.lon))) l.final = true; });
  return L;
}
function legIdx() {
  const s = lsGet(KEY_LEG);
  return s && s.i === P.idx && Number.isInteger(s.n) ? s.n : 0;
}
function setLegIdx(n) { lsSet(KEY_LEG, { i: P.idx, n }); }
/* Aktuelle Etappe (oder null, wenn die Station keine Etappen hat) */
function curLeg() {
  const L = legsOf(cur());
  if (!L.length) return null;
  const n = Math.min(legIdx(), L.length - 1);
  return { L, n, leg: L[n] };
}
/* Wohin zeigt der Pfeil? Ziel der aktuellen Etappe, sonst das Stationsziel */
function navPoint() {
  const st = cur(), c = curLeg();
  if (!c || c.leg.final) return st;
  return { lat: c.leg.lat, lon: c.leg.lon, radius: Number(c.leg.radius) || (c.leg.mode === 'walk' ? 100 : 300) };
}
/* Bei jeder neuen Position: Etappe weiterschalten, sobald ihr Ziel (oder ein späteres) erreicht ist */
function legsOnPos() {
  const c = curLeg(), p = here();
  if (!c || !p || P.status !== 'travel') return false;
  let n = c.n;
  for (let j = c.n; j < c.L.length; j++) {
    const l = c.L[j];
    if (l.final) break;
    const r = (Number(l.radius) || (l.mode === 'walk' ? 100 : 300)) + Math.min(p.acc || 0, 25);
    if (dist(p, l) <= r) n = j + 1;
  }
  if (n !== c.n) { setLegIdx(n); fx('tick'); return true; }
  return false;
}

/* ---------- Anzeige ---------- */
function legName(st) { return revealLevel(P.idx) >= 2 || !st.codename ? (st.targetName || st.title) : 'zum Ziel'; }
function legText(l, st) {
  if (l.text) return rich(l.text);
  const ic = LEG_ICON[l.mode === 'walk' ? 'walk' : (l.vehicle || 'ride')] || '🚆';
  if (l.mode === 'walk') return `${ic} Zu Fuß ${l.final ? (legName(st) === 'zum Ziel' ? 'zum Ziel' : 'zu: <b>' + esc(legName(st)) + '</b>') : 'zu: <b>' + esc(l.name || 'Wegpunkt') + '</b>'}`;
  const line = l.line ? `<b>${esc(l.line)}</b> ` : '';
  const dl = l.dirLabel || (Array.isArray(l.dir) ? l.dir[0] : l.dir);
  const dir = dl ? `Richtung <b>${esc(dl)}</b>` : 'in Pfeilrichtung';
  const stops = l.stops ? ` · <b>${l.stops} ${l.stops === 1 ? 'Station' : 'Stationen'}</b>` : '';
  const exitName = l.final ? (legName(st) === 'zum Ziel' ? '' : legName(st)) : (l.exit || l.name || '');
  const out = !l.hide && exitName ? ` · aussteigen in <b>${esc(exitName)}</b>` : ' · aussteigen, wenn das Radar <b>unter 300 m</b> zeigt';
  return `${ic} ${line}${dir}${stops}${out}`;
}
function legsHtml() {
  const c = curLeg();
  if (!c) return '';
  const st = cur();
  const rows = c.L.map((l, j) => `<li class="${j < c.n ? 'done' : j === c.n ? 'now' : ''}">${j < c.n ? '✅ ' : ''}${legText(l, st)}</li>`).join('');
  const ride = c.leg.mode === 'ride' ? c.leg : (c.L[c.n + 1] && c.L[c.n + 1].mode === 'ride' ? c.L[c.n + 1] : null);
  return `<div class="card legs"><div class="label">Etappe ${c.n + 1} von ${c.L.length}</div><ol class="leglist">${rows}</ol>
    ${ride && ride.from && ride.from.id ? '<div id="legDep" class="legdep"></div>' : ''}
    ${c.leg.final ? '' : '<button type="button" class="linkbtn" id="legSkip">✓ Diese Etappe haben wir geschafft</button>'}</div>`;
}
function bindLegs() {
  const b = $('#legSkip');
  if (b) b.onclick = () => { const c = curLeg(); if (c && confirm('Etappe als erledigt markieren? Der Pfeil zeigt dann auf die nächste Etappe.')) { setLegIdx(c.n + 1); render(); } };
  updateLegDep();
}

/* ---------- Live-Abfahrten (MVG, ohne Anmeldung; es wird nur die Haltestellen-ID gesendet) ---------- */
function rideForDep() {
  const c = curLeg();
  if (!c) return null;
  if (c.leg.mode === 'ride') {
    const p = here(); // schon im Zug (weit weg von der Einstiegs-Haltestelle)? Dann keine Abfahrten mehr
    if (p && c.leg.from && isFinite(c.leg.from.lat) && dist(p, c.leg.from) > 600) return null;
    return c.leg;
  }
  const nx = c.L[c.n + 1];
  return nx && nx.mode === 'ride' ? nx : null;
}
function depMatches(d, l) {
  if (l.line && String(d.label || '').toUpperCase() !== String(l.line).toUpperCase()) return false;
  const dest = norm(d.destination || '');
  const has = x => (Array.isArray(x) ? x : x ? [x] : []).some(s => dest.includes(norm(s)));
  if (l.dir && !has(l.dir)) return false;        // Fahrtziel muss passen …
  if (l.dirNot && has(l.dirNot)) return false;   // … oder darf NICHT passen (z. B. „nicht Wolfratshausen“ = stadteinwärts)
  return !d.cancelled;
}
function updateLegDep() {
  const el = $('#legDep');
  if (!el) return;
  const l = rideForDep();
  if (!l || !l.from || !l.from.id) { el.innerHTML = ''; return; }
  const key = l.from.id + '|' + (l.vehicle || '');
  if (legDep.key === key && legDep.list && Date.now() - legDep.t < 60000) { el.innerHTML = depHtml(l); return; }
  if (legDep.key !== key) legDep = { key, t: 0, list: null, err: false, busy: false };
  el.innerHTML = depHtml(l);
  if (legDep.busy) return;
  legDep.busy = true;
  const types = MVG_TYPES[l.vehicle] ? '&transportTypes=' + MVG_TYPES[l.vehicle] : '';
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const to = setTimeout(() => ctl && ctl.abort(), 8000);
  fetch('https://www.mvg.de/api/bgw-pt/v3/departures?globalId=' + encodeURIComponent(l.from.id) + '&limit=20' + types, { signal: ctl ? ctl.signal : undefined, credentials: 'omit', referrerPolicy: 'no-referrer' })
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(a => { legDep.list = Array.isArray(a) ? a : []; legDep.err = false; })
    .catch(() => { legDep.err = true; })
    .finally(() => { clearTimeout(to); legDep.t = Date.now(); legDep.busy = false; const e = $('#legDep'); if (e && legDep.key === key) e.innerHTML = depHtml(l); });
}
function depHtml(l) {
  const head = `<div class="label">🚉 Nächste Abfahrten ab ${esc(l.from.name || 'Haltestelle')}</div>`;
  if (!legDep.list) return head + (legDep.err ? '<p class="small">Fahrplan gerade nicht erreichbar – schaut auf die Anzeige am Bahnsteig.</p>' : '<p class="small">Lade Fahrplan …</p>');
  const now = Date.now();
  const list = legDep.list.filter(d => depMatches(d, l) && (d.realtimeDepartureTime || d.plannedDepartureTime) > now - 30000).slice(0, 3);
  if (!list.length) return head + '<p class="small">Gerade keine passende Abfahrt gefunden – schaut auf die Anzeige am Bahnsteig.</p>';
  return head + '<ul class="deps">' + list.map(d => {
    const t = d.realtimeDepartureTime || d.plannedDepartureTime, min = Math.max(0, Math.round((t - now) / 60000));
    const delay = d.realtime && d.plannedDepartureTime ? Math.round((d.realtimeDepartureTime - d.plannedDepartureTime) / 60000) : 0;
    const clock = new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    return `<li><b>${esc(d.label || '')}</b> → ${esc(d.destination || '')}${d.platform ? ` · Gleis ${esc(String(d.platform))}` : ''}
      <span class="depmin ${min <= 3 ? 'soon' : ''}">${min === 0 ? 'jetzt' : 'in ' + min + ' Min'}</span>
      <span class="small">(${clock}${delay > 0 ? `, <span class="late">+${delay}</span>` : ''})</span></li>`;
  }).join('') + '</ul>';
}
setInterval(() => { if (!document.hidden && P && P.status === 'travel' && $('#legDep')) updateLegDep(); }, 30000);
