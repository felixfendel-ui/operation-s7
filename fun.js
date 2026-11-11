/* Funksprüche zum Anhören (Vorlesestimme des Browsers + Funkrauschen) und Morse-Signale.
   Wird vor app.js geladen; nutzt dessen Helfer erst zur Laufzeit. */
'use strict';

/* ---------- Funkspruch vorlesen ---------- */
let radioBtn = null;
function speechText(t) {
  return String(t || '')
    .replace(/\{name\}/g, (P && P.name && myAlias()) || (P && P.name) || 'Agent')
    .replace(/\*\*/g, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[•·–]/g, ' ').replace(/→/g, ' zu ').replace(/„|“/g, '')
    .replace(/\s+/g, ' ').trim();
}
let radioNoVoice = false; // Rückfall: Standardstimme des Systems, falls die gewählte Stimme stumm bleibt
const NOVELTY = /Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Bahh|Bells|Boing|Bubbles|Cellos|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Albert|Fred|Junior|Ralph|Kathy|Bad News|Good News/i;
function pickVoice() {
  if (radioNoVoice) return null;
  const vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
  const de = vs.filter(v => /^de/i.test(v.lang) && !NOVELTY.test(v.name));
  return de.find(v => /Markus|Yannick|Viktor|Martin/i.test(v.name)) || de.find(v => /Google Deutsch/i.test(v.name))
    || de.find(v => /Anna/i.test(v.name)) || de[0] || null;
}
if (window.speechSynthesis) { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices(); }
function radioNoise(sec) {
  initAudio();
  if (!audioCtx) return;
  try {
    const len = Math.floor(audioCtx.sampleRate * sec), buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.4;
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const f = audioCtx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 0.7;
    const g = audioCtx.createGain(); g.gain.value = 0.22; g.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + sec);
    src.connect(f).connect(g).connect(audioCtx.destination); src.start();
  } catch (e) {}
}
function setRadioBtn(on) {
  if (radioBtn) {
    if (!radioBtn.dataset.label) radioBtn.dataset.label = radioBtn.textContent;
    radioBtn.classList.toggle('on', on); radioBtn.textContent = on ? '⏹ Stoppen' : radioBtn.dataset.label;
  }
  if (!on) radioBtn = null;
}
/* Text in Sätze teilen: Chrome bricht lange Vorlesetexte sonst nach ~15 s ab oder startet sie gar nicht */
function speechChunks(t) {
  const parts = speechText(t).match(/[^.!?]+[.!?]*/g) || [];
  const out = []; let buf = '';
  for (const p of parts) { if ((buf + p).length > 180 && buf) { out.push(buf.trim()); buf = ''; } buf += p + ' '; }
  if (buf.trim()) out.push(buf.trim());
  return out;
}
let radioOn = false, radioStarted = false, radioQueue = [], radioWatch = null;
window.__sj7utt = []; // Referenzen halten, sonst sammelt Chrome die Ansage vorzeitig ein
function stopRadio() {
  radioOn = false; radioQueue = []; clearTimeout(radioWatch);
  try { speechSynthesis.cancel(); } catch (e) {}
  setRadioBtn(false);
}
function speakNext() {
  if (!radioOn) return;
  const chunk = radioQueue.shift();
  if (!chunk) { radioOn = false; radioNoise(0.3); tone(900, 0.3, 0.08, 'sine', 0.05); setRadioBtn(false); return; }
  const u = new SpeechSynthesisUtterance(chunk);
  u.lang = 'de-DE'; const v = pickVoice(); if (v) u.voice = v;
  u.rate = 1.03; u.pitch = 0.8; u.volume = 1;
  u.onstart = () => { radioStarted = true; };
  u.onend = () => speakNext();
  u.onerror = e => { if (e && (e.error === 'interrupted' || e.error === 'canceled')) return; radioStatus('⚠️ Vorlesen abgebrochen: ' + (e && e.error || 'unbekannt')); stopRadio(); };
  window.__sj7utt.push(u); if (window.__sj7utt.length > 30) window.__sj7utt.shift();
  speechSynthesis.speak(u);
  if (speechSynthesis.paused) { try { speechSynthesis.resume(); } catch (e) {} } // Chrome startet manchmal „pausiert“
}
function radioStatus(msg) {
  const el = radioBtn && radioBtn.nextElementSibling && radioBtn.nextElementSibling.classList.contains('radiostat') ? radioBtn.nextElementSibling : null;
  if (el) el.textContent = msg; else alert(msg);
}
/* ---------- Aufgenommene Funksprüche (audio/<hash>.m4a, erzeugt mit tools/voices.py) ----------
   Laufen wie Sprachnachrichten – auch auf dem iPhone mit Stummschalter. Vorlesestimme nur als Rückfall. */
let AUDIO_INDEX = null;
const AUDIO_V = '9'; // bei neuer Aufnahme erhöhen, damit Handys keine alten Dateien aus dem Cache spielen
fetch('audio/index.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : [])).then(j => { AUDIO_INDEX = new Set(j); }).catch(() => {});
function fnvHash(s) { // FNV-1a über UTF-16-Codeeinheiten – identisch zu tools/voices.py
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
const player = new Audio();
player.preload = 'none';
let playerBtn = null;
function stopPlayer() {
  try { player.pause(); } catch (e) {}
  if (playerBtn) { playerBtn.classList.remove('on'); playerBtn.textContent = playerBtn.dataset.label || '📻 Funkspruch anhören'; }
  playerBtn = null;
}
function playFile(src, btn, onFail) {
  initAudio(); // im Tipp entsperren (iOS)
  const same = btn && btn === playerBtn;
  stopPlayer(); if (radioOn) stopRadio();
  if (same) return;
  playerBtn = btn || null;
  if (btn) { if (!btn.dataset.label) btn.dataset.label = btn.textContent; btn.classList.add('on'); btn.textContent = '⏹ Stoppen'; }
  player.src = (window.AUDIO_BLOBS && AUDIO_BLOBS[src]) || src; // Offline-Paket bevorzugen
  player.onended = () => stopPlayer();
  let failed = false; // Ladefehler meldet sich doppelt (onerror + play()) – Rückfall nur einmal starten, sonst stoppt er sich selbst
  const fail = () => { if (failed) return; failed = true; stopPlayer(); if (onFail) onFail(); };
  player.onerror = fail;
  const pr = player.play(); // direkt im Tippen starten (iPhone)
  if (pr && pr.catch) pr.catch(err => { if (err && err.name === 'AbortError') return; fail(); });
}
function playRadio(text, btn) {
  const pv = papaVoiceFor(text); // Papas eigene Aufnahme (Start, Halbzeit, Finale)
  if (pv) return playFile(pv, btn, () => { const h2 = fnvHash(String(text || '')); if (AUDIO_INDEX && AUDIO_INDEX.has(h2)) playFile('audio/' + h2 + '.m4a?v=' + AUDIO_V, btn); else speakRadio(text, btn); });
  const h = fnvHash(String(text || ''));
  if (AUDIO_INDEX && AUDIO_INDEX.has(h)) return playFile('audio/' + h + '.m4a?v=' + AUDIO_V, btn, () => speakRadio(text, btn));
  speakRadio(text, btn);
}
function speakRadio(text, btn) {
  if (playerBtn) stopPlayer();
  if (!('speechSynthesis' in window)) { alert('Dieser Browser kann leider nicht vorlesen.'); return; }
  if (radioOn) { const same = btn === radioBtn; stopRadio(); if (same) return; }
  radioBtn = btn; radioOn = true; radioStarted = false;
  radioNoise(0.45); tone(1250, 0, 0.09, 'sine', 0.05);
  // iPhone-Eigenheit: cancel() direkt vor speak() verschluckt die Ansage – nur abbrechen, wenn wirklich etwas läuft
  if (speechSynthesis.speaking || speechSynthesis.pending) { try { speechSynthesis.cancel(); } catch (e) {} }
  radioQueue = speechChunks(text);
  speakNext(); // direkt im Klick starten (iPhone erlaubt Sprachausgabe nur nach einer Berührung)
  setRadioBtn(true);
  clearTimeout(radioWatch);
  radioWatch = setTimeout(() => {
    if (!radioOn || radioStarted) return;
    if (!radioNoVoice) { // gewählte Stimme bleibt stumm → einmal mit der Standardstimme neu versuchen
      radioNoVoice = true; if (speechSynthesis.speaking || speechSynthesis.pending) { try { speechSynthesis.cancel(); } catch (e) {} }
      radioQueue = speechChunks(text); radioOn = true; speakNext();
      radioWatch = setTimeout(() => {
        if (radioOn && !radioStarted) { radioStatus('⚠️ Die Vorlesestimme startet nicht. Lautstärke (Medien) hochdrehen, auf dem iPhone den Stummschalter aus – dann nochmal tippen. Der Text steht auch oben zum Lesen.'); stopRadio(); }
      }, 3000);
      return;
    }
    radioStatus('⚠️ Die Vorlesestimme startet nicht. Lautstärke (Medien) hochdrehen, auf dem iPhone den Stummschalter aus – dann nochmal tippen. Der Text steht auch oben zum Lesen.');
    stopRadio();
  }, 3000);
}
const radioBtnHtml = key => `<button type="button" class="radiobtn" data-radio="${key}">📻 Funkspruch anhören</button><div class="small radiostat"></div>`;
function bindRadio(texts) {
  document.querySelectorAll('[data-radio]').forEach(b => { b.onclick = () => playRadio(texts[b.dataset.radio], b); });
}

/* ---------- Morse ---------- */
const MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--',
  N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..' };
const morseVisual = word => String(word).toUpperCase().split('').filter(c => MORSE[c]).map(c => MORSE[c].replace(/\./g, '·').replace(/-/g, '–')).join('  /  ');
function playMorse(word, btn) {
  const w = String(word).toUpperCase();
  if (!btn || !btn.dataset.webaudio) return playFile('audio/morse-' + w + '.m4a?v=' + AUDIO_V, btn, () => { if (btn) btn.dataset.webaudio = '1'; playMorse(word, btn); });
  initAudio();
  const u = 0.13; let t = 0.05;
  for (const ch of String(word).toUpperCase()) {
    const code = MORSE[ch]; if (!code) continue;
    for (const s of code) { const d = s === '.' ? u : 3 * u; tone(660, t, d, 'sine', 0.14); t += d + u; }
    t += 2 * u;
  }
  if (btn) { btn.disabled = true; setTimeout(() => { btn.disabled = false; }, t * 1000 + 300); }
}
function morseHtml(word) {
  return `<div class="morse"><div class="label">📡 Abgefangenes Signal</div>
    <div class="morsecode">${esc(morseVisual(word))}</div>
    <button type="button" class="btn warn small" id="morseBtn">▶ Signal abspielen</button>
    <p class="small">Kurzer Ton = · Punkt · langer Ton = – Strich · „/“ trennt die Buchstaben</p></div>`;
}
function bindMorse(word) { const b = $('#morseBtn'); if (b) b.onclick = () => playMorse(word, b); }

function radioDiagnose() {
  const ok = 'speechSynthesis' in window, vs = ok ? speechSynthesis.getVoices() : [];
  const de = vs.filter(v => /^de/i.test(v.lang)), v = ok ? pickVoice() : null;
  return `Vorlesen: ${ok ? 'verfügbar' : 'NICHT verfügbar'} · Stimmen: ${vs.length} (deutsch: ${de.length}) · gewählt: ${v ? esc(v.name) : 'Standard'}`;
}

/* ---------- Sicherheit (Gruppe ist ohne Erwachsene unterwegs) ---------- */
function papaTel() {
  const t = (TEAM.invite && TEAM.invite.tel) || (TEAM.inviteDraft && TEAM.inviteDraft.tel) || TEAM.ptel || ''; // auch nach Zentralen-Wechsel und bei QR-Beitritt
  return t ? waNumber(t) : '';
}
function sosUi() {
  const b = $('#sosBtn');
  if (!b) return;
  const playing = (P && P.name && !P.finishedAt && (!isMember() || memberReady())); // erst im Einsatz, nicht schon in der Einladung
  b.hidden = !playing || PAPA;
}
function openSos() {
  const tel = papaTel(), p = here();
  openExModal(`<div class="center">
    <div class="stamp" style="border-color:var(--danger);color:var(--danger)">🆘 NOTFALL</div>
    <p style="text-align:left">Kein Spiel mehr – das hier ist echt. Bleibt zusammen und ruft Papa an.</p>
    ${tel ? `<a class="btn" href="tel:+${tel}">📞 Papa (Zentrale) anrufen</a>` : '<p class="small">Papas Nummer fehlt in der Einladung.</p>'}
    <div class="sospos">${p ? `📍 Euer Standort zum Vorlesen:<br><b>${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</b> (±${Math.round(p.acc || 0)} m)<br>
      <a href="${typeof IS_IOS !== 'undefined' && IS_IOS ? `https://maps.apple.com/?ll=${p.lat},${p.lon}&q=Hier%20sind%20wir` : `https://www.google.com/maps?q=${p.lat},${p.lon}`}" target="_blank" rel="noopener">In Karten öffnen</a>` : '📍 Standort wird gesucht …'}</div>
    <p class="small" style="text-align:left">Jemand fehlt? Bleibt an der Stelle, an der ihr ihn zuletzt gesehen habt, und ruft Papa an. Wer verloren ist: zum letzten Bahnhof zurück und dort warten.</p>
    ${takeoverHtml()}
    <button class="btn sec small" id="exOk">Zurück zur Mission</button></div>`);
  bindTakeover();
  liveEvent('help', `🆘 Notfall-Knopf geöffnet${P && P.name ? ' – ' + P.name : ''}`, p ? `Standort ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}` : 'Standort unbekannt', 5);
}
const RULES = ['Immer zusammenbleiben – niemand geht allein, auch nicht kurz.',
  'Am Bahnsteig hinter der weißen Linie. Erst einsteigen, wenn alle da sind.',
  'Im Wald und am Isar-Hochufer auf dem Weg bleiben – nie an die Kante.',
  'Straßen nur an Ampel oder Zebrastreifen überqueren.',
  'Notfall: 🆘-Knopf oben rechts – direkt Papa anrufen.'];
function rulesHtml() {
  return `<div class="card rules"><div class="label">🛡️ Agenten-Regeln</div><ol>${RULES.map(r => `<li>${esc(r)}</li>`).join('')}</ol></div>`;
}
const safetyHtml = st => (st && st.safety ? `<div class="safety">⚠️ ${rich(st.safety)}</div>` : '');
function countHtml() {
  if (!teamOn()) return '';
  return `<label class="chk countchk"><input type="checkbox" id="countOk"> <span>👥 <b>Durchzählen!</b> Alle ${TEAM.members.length} Agenten sind zusammen.</span></label>`;
}
function bindCount(btnSel) {
  const c = $('#countOk'), b = $(btnSel);
  if (!c || !b) return;
  b.disabled = true;
  c.onchange = () => { b.disabled = !c.checked; };
}
