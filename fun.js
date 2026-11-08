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
  try { speechSynthesis.resume(); } catch (e) {} // Chrome startet manchmal „pausiert“
}
function radioStatus(msg) {
  const el = radioBtn && radioBtn.nextElementSibling && radioBtn.nextElementSibling.classList.contains('radiostat') ? radioBtn.nextElementSibling : null;
  if (el) el.textContent = msg; else alert(msg);
}
function playRadio(text, btn) {
  if (!('speechSynthesis' in window)) { alert('Dieser Browser kann leider nicht vorlesen.'); return; }
  if (radioOn) { const same = btn === radioBtn; stopRadio(); if (same) return; }
  radioBtn = btn; radioOn = true; radioStarted = false;
  radioNoise(0.45); tone(1250, 0, 0.09, 'sine', 0.05);
  try { speechSynthesis.cancel(); } catch (e) {}
  radioQueue = speechChunks(text);
  speakNext(); // direkt im Klick starten (iPhone erlaubt Sprachausgabe nur nach einer Berührung)
  setRadioBtn(true);
  clearTimeout(radioWatch);
  radioWatch = setTimeout(() => {
    if (!radioOn || radioStarted) return;
    if (!radioNoVoice) { // gewählte Stimme bleibt stumm → einmal mit der Standardstimme neu versuchen
      radioNoVoice = true; try { speechSynthesis.cancel(); } catch (e) {}
      radioQueue = speechChunks(text); radioOn = true; speakNext();
      radioWatch = setTimeout(() => {
        if (radioOn && !radioStarted) { radioStatus('⚠️ Die Vorlesestimme startet nicht. iPhone: Stummschalter aus, Lautstärke hoch. Sonst die Seite in Safari oder Chrome öffnen.'); stopRadio(); }
      }, 3000);
      return;
    }
    radioStatus('⚠️ Die Vorlesestimme startet nicht. iPhone: Stummschalter aus, Lautstärke hoch. Sonst die Seite in Safari oder Chrome öffnen.');
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
