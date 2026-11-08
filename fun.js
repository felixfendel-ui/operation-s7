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
function pickVoice() {
  const vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
  const de = vs.filter(v => /^de/i.test(v.lang));
  return de.find(v => /Markus|Yannick|Martin|Google Deutsch/i.test(v.name)) || de.find(v => !/Anna/i.test(v.name)) || de[0] || null;
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
  if (radioBtn) { radioBtn.classList.toggle('on', on); radioBtn.textContent = on ? '⏹ Funkspruch stoppen' : '📻 Funkspruch anhören'; }
  if (!on) radioBtn = null;
}
function playRadio(text, btn) {
  if (!('speechSynthesis' in window)) { alert('Dieser Browser kann leider nicht vorlesen.'); return; }
  if (speechSynthesis.speaking || speechSynthesis.pending) { speechSynthesis.cancel(); setRadioBtn(false); return; }
  radioBtn = btn;
  radioNoise(0.45); tone(1250, 0, 0.09, 'sine', 0.05);
  // Sprechen direkt im Klick starten (iPhone erlaubt Sprachausgabe nur nach einer Berührung)
  const u = new SpeechSynthesisUtterance(speechText(text));
  u.lang = 'de-DE'; const v = pickVoice(); if (v) u.voice = v;
  u.rate = 1.03; u.pitch = 0.8;
  u.onend = () => { radioNoise(0.3); tone(900, 0.3, 0.08, 'sine', 0.05); setRadioBtn(false); };
  u.onerror = () => setRadioBtn(false);
  speechSynthesis.speak(u);
  setRadioBtn(true);
}
const radioBtnHtml = key => `<button type="button" class="radiobtn" data-radio="${key}">📻 Funkspruch anhören</button>`;
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
