/* Technik-Check: prüft Standort (GPS), Kompass, Ton und Verbindung – mit Hilfe für iPhone und Android.
   Erreichbar über den Knopf „🔧 Technik-Check“ (Einladung, Studio, Start, Admin) oder den Link …/#check.
   Wird vor app.js geladen. */
'use strict';

const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IS_ANDROID = /Android/i.test(navigator.userAgent);
const CK = { gps: null, compass: null, sound: null, net: null };
let ckWatch = null, ckOrient = null, ckHeadings = [];

const HELP = {
  gpsDenied: IS_IOS
    ? 'iPhone: <b>Einstellungen → Datenschutz & Sicherheit → Ortungsdienste</b> einschalten. Darunter <b>„Safari-Websites“</b> öffnen: „Beim Verwenden der App“ wählen und <b>„Genauer Standort“</b> einschalten. Dann diese Seite neu laden und „Erlauben“ tippen.'
    : IS_ANDROID
      ? 'Android: Oben in der Adresszeile auf das <b>Schloss-Symbol</b> → <b>Berechtigungen → Standort → Zulassen</b>. Außerdem in den Android-Einstellungen <b>Standort</b> einschalten und „Standortgenauigkeit“ aktivieren. Dann neu laden.'
      : 'Im Browser den Standortzugriff für diese Seite erlauben (Symbol links in der Adresszeile) und neu laden.',
  gpsWeak: 'Drinnen ist GPS oft ungenau. Bitte <b>draußen</b> unter freiem Himmel nochmal testen – dann sollten es unter 30 m sein. Auf dem iPhone muss „Genauer Standort“ für Safari-Websites an sein.',
  compassDenied: IS_IOS
    ? 'iPhone: Die Frage „Zugriff auf Bewegung & Ausrichtung“ muss mit <b>Erlauben</b> beantwortet werden. Wurde sie abgelehnt: diesen Safari-Tab <b>schließen</b>, den Link neu öffnen und erneut testen – Safari fragt dann nochmal.'
    : 'Der Browser liefert keine Kompassdaten. Chrome verwenden und die Seite neu laden.',
  compassNone: 'Kein Kompass gefunden. Das Spiel geht trotzdem: Der Pfeil zeigt dann mit <b>Norden nach oben</b>, und unten steht die Himmelsrichtung. Mit Kompass ist es aber deutlich leichter.',
  compassCalib: 'Tipp: Wenn der Pfeil springt, das Handy einmal langsam in Form einer <b>liegenden Acht</b> schwenken (Kompass kalibrieren).',
  sound: IS_IOS ? 'Lautstärke hochdrehen. Die Funksprüche laufen auch bei Stummschalter, Lautstärke 0 hört man aber nicht.' : 'Medien-Lautstärke hochdrehen.',
  net: 'Keine Verbindung zum Funk-Server. <b>WLAN aus, mobile Daten an</b> und neu laden. Ohne Netz funktionieren Rätsel und Radar trotzdem, aber Team und Papa-Funk nicht.'
};

function ckRow(key, title, state, text, extra) {
  const icon = { ok: '✅', warn: '⚠️', bad: '❌', run: '⏳' }[state] || '▫️';
  return `<div class="ckrow ck-${state || 'idle'}" id="ck-${key}"><div class="ckhead"><span class="ckicon">${icon}</span><b>${title}</b></div>
    <div class="cktext">${text || ''}</div>${extra || ''}</div>`;
}
function ckSummary() {
  const v = Object.values(CK);
  if (v.some(x => x === null)) return '';
  const bad = v.filter(x => x === 'bad').length, warn = v.filter(x => x === 'warn').length;
  return bad ? `<div class="cksum bad">❌ ${bad} Punkt(e) müssen noch eingestellt werden – siehe Hilfe oben.</div>`
    : warn ? '<div class="cksum warn">⚠️ Fast fertig – bitte die gelben Hinweise beachten.</div>'
    : '<div class="cksum ok">✅ Alles bereit für den Einsatz, Agent!</div>';
}
function openCheck() {
  const box = $('#checkpanel');
  box.hidden = false; document.body.style.overflow = 'hidden';
  box.innerHTML = `<div class="wrap">
    <div class="adm-head"><h2>🔧 Technik-Check</h2><button class="btn sec small" style="width:auto;margin:0" id="ckClose">✕ Fertig</button></div>
    <div class="card">
      <p class="small">Am besten <b>draußen</b> testen, mit <b>mobilen Daten</b> (WLAN aus) – so wie am Einsatztag. Tippe „Check starten“ und erlaube alles, was das Handy fragt.</p>
      <button class="btn" id="ckStart">▶ Check starten</button>
      <div id="ckRows">
        ${ckRow('gps', '📍 Standort (GPS)', '', 'Für Radar, Freischalten und Depots.')}
        ${ckRow('compass', '🧭 Kompass', '', 'Damit der Pfeil in die richtige Richtung zeigt.')}
        ${ckRow('sound', '🔊 Ton', '', 'Für Funksprüche und Morse-Signal.')}
        ${ckRow('net', '📡 Verbindung', '', 'Für Team-Funk und Papa-Zentrale.')}
      </div>
      <div id="ckSum"></div>
      <p class="small">Browser: ${IS_IOS ? 'iPhone/iPad' : IS_ANDROID ? 'Android' : 'Computer'}${window.isSecureContext ? '' : ' · ⚠️ keine sichere Verbindung (https nötig)'}${'wakeLock' in navigator ? ' · Bildschirm-wach: ✅' : ' · Bildschirm-wach: nicht verfügbar – Auto-Sperre in den Einstellungen verlängern'}</p>
    </div></div>`;
  $('#ckClose').onclick = closeCheck;
  $('#ckStart').onclick = runCheck;
}
function closeCheck() {
  $('#checkpanel').hidden = true; document.body.style.overflow = '';
  if (ckWatch !== null) { navigator.geolocation.clearWatch(ckWatch); ckWatch = null; }
  if (ckOrient) { window.removeEventListener('deviceorientation', ckOrient, true); window.removeEventListener('deviceorientationabsolute', ckOrient, true); ckOrient = null; }
  if (location.hash === '#check') history.replaceState(null, '', location.pathname + location.search);
}
function setRow(key, state, title, text, extra) {
  CK[key] = state === 'run' ? null : state;
  const el = $('#ck-' + key); if (el) el.outerHTML = ckRow(key, title, state, text, extra);
  const s = $('#ckSum'); if (s) s.innerHTML = ckSummary();
}
function runCheck() {
  initAudio();
  Object.keys(CK).forEach(k => { CK[k] = null; });
  checkSound();          // Ton zuerst – muss direkt im Tippen starten
  checkCompass();        // Kompass-Erlaubnis muss auf dem iPhone ebenfalls direkt im Tippen angefragt werden
  checkGps();
  checkNet();
}

/* Standort */
function checkGps() {
  const T = '📍 Standort (GPS)';
  if (!navigator.geolocation) return setRow('gps', 'bad', T, 'Dieses Gerät liefert keinen Standort.');
  setRow('gps', 'run', T, 'Suche Satelliten … (bis zu 30 Sekunden)');
  let best = null, done = false;
  const finish = () => {
    if (done) return; done = true;
    if (ckWatch !== null) { navigator.geolocation.clearWatch(ckWatch); ckWatch = null; }
    if (!best) return setRow('gps', 'bad', T, 'Kein Standort gefunden.', `<div class="ckhelp">${HELP.gpsWeak}</div>`);
    const acc = Math.round(best.coords.accuracy);
    if (acc <= 35) setRow('gps', 'ok', T, `Genauigkeit ±${acc} m – perfekt.`);
    else setRow('gps', 'warn', T, `Genauigkeit nur ±${acc} m.`, `<div class="ckhelp">${HELP.gpsWeak}</div>`);
  };
  ckWatch = navigator.geolocation.watchPosition(p => {
    if (!best || p.coords.accuracy < best.coords.accuracy) best = p;
    if (!done) setRow('gps', 'run', T, `Genauigkeit gerade ±${Math.round(best.coords.accuracy)} m …`);
    if (best.coords.accuracy <= 20) finish();
  }, e => {
    if (done) return;
    if (e.code === 1) { done = true; setRow('gps', 'bad', T, 'Standort ist blockiert.', `<div class="ckhelp">${HELP.gpsDenied}</div>`); }
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  setTimeout(finish, 25000);
}

/* Kompass */
async function checkCompass() {
  const T = '🧭 Kompass';
  setRow('compass', 'run', T, 'Bitte „Erlauben“ tippen, falls gefragt …');
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') return setRow('compass', 'bad', T, 'Zugriff auf Bewegung & Ausrichtung wurde abgelehnt.', `<div class="ckhelp">${HELP.compassDenied}</div>`);
    }
  } catch (e) { return setRow('compass', 'bad', T, 'Kompass-Abfrage fehlgeschlagen.', `<div class="ckhelp">${HELP.compassDenied}</div>`); }
  ckHeadings = [];
  ckOrient = e => {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
    else if (e.absolute && e.alpha != null) h = 360 - e.alpha;
    if (h == null) return;
    ckHeadings.push(h);
    const ar = $('#ckArrow'); if (ar) ar.style.transform = `rotate(${-h}deg)`;
    const tx = $('#ckDeg'); if (tx) tx.textContent = `${Math.round(h)}° (${dirName(h)})`;
  };
  window.addEventListener('ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation', ckOrient, true);
  setRow('compass', 'run', T, 'Dreh dich einmal langsam im Kreis …',
    `<div class="ckcompass"><div class="cknorth" id="ckArrow">N</div></div><div class="center small" id="ckDeg">–</div>`);
  setTimeout(() => {
    if (!ckHeadings.length) return setRow('compass', 'warn', T, 'Keine Kompassdaten.', `<div class="ckhelp">${HELP.compassNone}</div>`);
    const span = Math.max(...ckHeadings) - Math.min(...ckHeadings);
    setRow('compass', 'ok', T, span > 20 ? 'Kompass funktioniert – die Richtung ändert sich beim Drehen.' : 'Kompass liefert Daten. Beim Drehen sollte sich die Gradzahl ändern.',
      `<div class="ckcompass"><div class="cknorth" id="ckArrow">N</div></div><div class="center small" id="ckDeg">–</div><div class="ckhelp">${HELP.compassCalib}</div>`);
  }, 6000);
}

/* Ton */
function checkSound() {
  const T = '🔊 Ton';
  const ask = `<div class="row" style="margin-top:8px"><button class="btn small" id="ckHeard">👂 Gehört</button><button class="btn sec small" id="ckNotHeard">Nichts gehört</button></div>`;
  setRow('sound', 'run', T, 'Es piept zweimal …', ask);
  const bind = () => {
    const y = $('#ckHeard'), n = $('#ckNotHeard');
    if (y) y.onclick = () => setRow('sound', 'ok', T, 'Ton funktioniert.');
    if (n) n.onclick = () => setRow('sound', 'bad', T, 'Kein Ton.', `<div class="ckhelp">${HELP.sound}</div><button class="btn sec small" id="ckAgain">🔊 Nochmal abspielen</button>`) || bindAgain();
  };
  const bindAgain = () => { const a = $('#ckAgain'); if (a) a.onclick = () => { playFile('audio/test.m4a?v=' + AUDIO_V, null); checkSound(); }; };
  playFile('audio/test.m4a?v=' + AUDIO_V, null, () => { initAudio(); tone(880, 0, 0.4, 'sine', 0.2); tone(1320, 0.45, 0.4, 'sine', 0.2); });
  setTimeout(bind, 0);
}

/* Verbindung */
async function checkNet() {
  const T = '📡 Verbindung';
  setRow('net', 'run', T, 'Prüfe Funk-Server …');
  try {
    const r = await fetch(NTFY + '/v1/health', { cache: 'no-store' });
    const j = await r.json();
    if (j && j.healthy) setRow('net', 'ok', T, 'Funk-Server erreichbar.');
    else setRow('net', 'warn', T, 'Funk-Server antwortet, meldet aber ein Problem.', `<div class="ckhelp">${HELP.net}</div>`);
  } catch (e) { setRow('net', 'bad', T, 'Keine Verbindung.', `<div class="ckhelp">${HELP.net}</div>`); }
}
const checkBtnHtml = () => '<button type="button" class="btn sec small" data-check="1">🔧 Technik-Check (Standort, Kompass, Ton)</button>';
document.addEventListener('click', e => { if (e.target.closest('[data-check]')) openCheck(); });
