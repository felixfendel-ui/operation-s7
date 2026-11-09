/* Einladung: Jasper verschickt vorab einen Link (= Team-Beitrittslink + Einladungsdaten).
   Die Daten (Datum, Treffpunkt, Telefonnummer …) stecken NUR im Link-Anhang (#…&inv=…) –
   sie stehen nicht im öffentlichen Repository und werden nie an einen Server geschickt.
   Das Spiel selbst bleibt gesperrt, bis Jasper am Einsatztag die Mission startet. */
'use strict';

const INV_DEFAULT = {
  host: 'Jasper', d: '2026-11-21', t: '11:00', end: '17:30', ort: '', tel: '', bis: '',
  mit: '📱 Handy mit vollem Akku und mobilem Internet (Link in Safari/Chrome öffnen, nicht als App speichern)\n🔋 Powerbank (falls vorhanden)\n🧥 Warme, wetterfeste Kleidung und feste Schuhe\n💧 Trinkflasche',
  note: 'Die Kinder sind als Gruppe ohne erwachsene Begleitung unterwegs: mit der S-Bahn zwischen Wolfratshausen und Pullach und zu Fuß (u. a. Isartal beim Kloster Schäftlarn, Isar-Hochufer in Pullach). Wir verfolgen die Gruppe live per App, sind die ganze Zeit telefonisch erreichbar und treffen die Kinder unterwegs am Kloster Schäftlarn (Verpflegung). Fahrkarten organisieren wir. Bitte gebt eurem Kind ein aufgeladenes Handy mit mobilem Internet und wetterfeste Kleidung mit. Zum Abschluss gibt es bei uns zu Hause Pizza.'
};
let invTimer = null;

function b64urlEncode(obj) {
  const s = btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  try {
    const s = str.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(s + '==='.slice((s.length + 3) % 4)))));
  } catch (e) { return null; }
}
function partyDate(inv) { const d = new Date(`${inv.d}T${inv.t || '00:00'}:00`); return isNaN(d) ? null : d; }
function fmtPartyDate(inv) {
  const d = partyDate(inv);
  if (!d) return esc(inv.d || '');
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function isPartyDay(inv) {
  const d = partyDate(inv);
  if (!d) return true;
  const now = new Date();
  return now.getFullYear() === d.getFullYear() && now.getMonth() === d.getMonth() && now.getDate() === d.getDate() || now > d;
}
function countdownText(inv) {
  const d = partyDate(inv);
  if (!d) return '';
  let s = Math.floor((d - Date.now()) / 1000);
  if (s <= 0) return 'Der Einsatz läuft!';
  const days = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60);
  return `${days > 0 ? days + (days === 1 ? ' Tag · ' : ' Tage · ') : ''}${String(h).padStart(2, '0')} Std · ${String(m).padStart(2, '0')} Min · ${String(s % 60).padStart(2, '0')} Sek`;
}
function waNumber(tel) {
  let n = String(tel || '').replace(/[^\d+]/g, '');
  if (n.startsWith('+')) n = n.slice(1); else if (n.startsWith('00')) n = n.slice(2); else if (n.startsWith('0')) n = '49' + n.slice(1);
  return n;
}
function inviteLink(inv) { return location.origin + location.pathname + '#team=' + encodeURIComponent(TEAM.topic) + '&inv=' + b64urlEncode(inv); }

/* ---------- Einladungskarte (für Gäste und als Vorschau) ---------- */
function inviteCardHtml(inv, who) {
  const host = esc(inv.host || 'Jasper');
  return `<div class="card invite pop">
    <div class="stamp">STRENG GEHEIM · EINBERUFUNG</div>
    <p class="label">An: Agent ${esc(who || '???')}</p>
    <h1>Operation Silberfuchs</h1>
    <p>Du wurdest von <b>Agent ${host}</b> für eine Spezialmission der <b>Einheit ISAR</b> ausgewählt. Anlass: ${host}s <b>12. Geburtstag</b>! 🎂</p>
    <p>Ein legendärer Agent hat entlang der S-Bahn an der Isar ein verschlüsseltes Codewort versteckt. Nur ein Team aus mutigen, schlauen Agenten kann es knacken – bevor der Maulwurf es tut.</p>
    <p>🍕 Nach erfolgreichem Einsatz wartet im Hauptquartier eine streng geheime Belohnung – Codename <b>„Operation Margherita“</b>. Mehr verraten die Akten nicht.</p>
    ${inv.msg ? `<div class="msgbox"><span class="label">Funkspruch von Agent ${esc(inv.al || inv.host || 'Jasper')}</span><p>${esc(inv.msg).replace(/\n/g, '<br>')}</p></div>` : ''}
    <div class="invgrid">
      <div><span class="label">Einsatzbeginn</span><b>${fmtPartyDate(inv)}${inv.t ? ', ' + esc(inv.t) + ' Uhr' : ''}</b></div>
      ${inv.ort ? `<div><span class="label">Treffpunkt</span><b>${esc(inv.ort)}</b></div>` : ''}
      ${inv.end ? `<div><span class="label">Einsatzende</span><b>ca. ${esc(inv.end)} Uhr</b></div>` : ''}
      ${inv.bis ? `<div><span class="label">Antwort bis</span><b>${esc(inv.bis)}</b></div>` : ''}
    </div>
    ${inv.mit ? `<div class="label" style="margin-top:14px">Ausrüstung</div><p>${esc(inv.mit).replace(/\n/g, '<br>')}</p>` : ''}
    <div class="countdown"><span class="label">Countdown bis zum Einsatz</span><div id="cdown">${countdownText(inv)}</div></div>
  </div>`;
}
function rsvpHtml(inv, name) {
  if (!inv.tel) return `<p class="small">Sag ${esc(inv.host || 'Jasper')} Bescheid, ob du dabei bist!</p>`;
  const n = waNumber(inv.tel), who = name ? `Agent ${TEAM.alias ? TEAM.alias + ' (' + name + ')' : name}` : 'Ich';
  const yes = `${who} meldet sich zum Dienst – ich komme zur Operation Silberfuchs! 🕵️`;
  const no = `${who} hier – ich kann leider nicht zur Operation Silberfuchs kommen. 😕`;
  return `<div class="row"><a class="btn" href="https://wa.me/${n}?text=${encodeURIComponent(yes)}" target="_blank" rel="noopener">✅ Ich bin dabei</a>
    <a class="btn sec" href="https://wa.me/${n}?text=${encodeURIComponent(no)}" target="_blank" rel="noopener">❌ Kann nicht</a></div>
    <p class="small center">Antwort per WhatsApp · <a href="sms:+${n}?&body=${encodeURIComponent(yes)}">lieber per SMS zusagen</a></p>`;
}
/* Zusage in der App: geht über den Team-Kanal an Jaspers Handy (Zentrale), das sie bestätigt.
   Die Zentrale muss dafür innerhalb von ~12 Std. einmal geöffnet sein; sonst schickt die App die Zusage beim nächsten Öffnen erneut. */
function rsvpCardHtml(inv) {
  const host = esc(inv.al || inv.host || 'Jasper');
  if (!TEAM.name) return `<div class="card"><div class="label">Bist du dabei?</div><p class="small">Trag dich oben als Agent ein – dann kannst du direkt hier zusagen.</p></div>`;
  const v = TEAM.rsvp, ok = v && TEAM.rsvpConfirmed === v;
  const status = !v ? '' : ok
    ? `<p class="feedback good">${v === 'yes' ? `✅ Deine Zusage ist bei Agent ${host} angekommen!` : '❌ Deine Absage ist angekommen. Schade – vielleicht beim nächsten Einsatz!'}</p>`
    : `<p class="small">📡 ${v === 'yes' ? 'Zusage' : 'Absage'} wird an die Zentrale gefunkt … Sie kommt an, sobald ${esc(inv.host || 'Jasper')}s App offen ist.</p>`;
  const yes = Object.entries(TEAM.rsvpList || {}).filter(([, x]) => x.v === 'yes');
  return `<div class="card"><div class="label">Bist du dabei?</div>
    <label class="chk consent"><input type="checkbox" id="parentsOk" ${TEAM.parentsOk ? 'checked' : ''}>
      <span>Meine Eltern haben die <b>Infos für Eltern</b> (unten) gelesen und sind einverstanden, dass ich ohne Erwachsene mit der Gruppe unterwegs bin.</span></label>
    <div class="row">
      <button class="btn ${v === 'yes' ? '' : 'sec'}" data-rsvp="yes" ${TEAM.parentsOk ? '' : 'disabled'}>✅ Ich bin dabei</button>
      <button class="btn ${v === 'no' ? 'danger' : 'sec'}" data-rsvp="no">❌ Kann leider nicht</button>
    </div>
    ${status}
    ${yes.length ? `<div class="label" style="margin-top:12px">Schon im Einsatzteam (${yes.length})</div>` + yes.map(([id, x]) => `<div class="memb">🕵️ ${memberLabel({ name: x.n, alias: x.al })}${id === TEAM.id ? ' (du)' : ''}</div>`).join('') : ''}
    ${inv.tel ? `<details class="small" style="margin-top:10px"><summary>Zusätzlich per WhatsApp Bescheid sagen</summary>${rsvpHtml(inv, TEAM.name)}</details>` : ''}
  </div>`;
}
const fixNote = n => (!n || /Begleitung durch Erwachsene/.test(n) ? INV_DEFAULT.note : n); // ältere Einladungen
function parentsHtml(inv) {
  return `<details class="card parents"><summary>ℹ️ Infos für Eltern</summary>
    <p>${esc(fixNote(inv.note))}</p>
    <p><b>Sicherheit in der App:</b> Jedes Handy hat oben einen 🆘-Knopf (Papa anrufen oder 112, mit Standortanzeige). An jeder Station zählt das Team durch, bevor es weitergeht, und an Bahnsteig, Steilhang und Isar-Hochufer erscheinen Sicherheitshinweise.</p>
    <p>Das Spiel ist eine Web-App im Browser – nichts installieren. Für das Rätsel-Radar fragt die App am Einsatztag nach dem Standort; <b>der Standort der Gäste wird nicht verschickt</b>, er wird nur auf dem eigenen Handy verwendet. Übertragen werden nur der Vorname und Spielaktionen (z. B. „Rätsel gelöst“).</p>
    ${inv.tel ? `<p>Fragen? <a href="tel:+${waNumber(inv.tel)}">${esc(inv.tel)}</a></p>` : ''}
  </details>`;
}

/* ---------- Gäste-Ansicht vor und am Einsatztag ---------- */
function renderInviteLobby() {
  const inv = TEAM.invite, party = isPartyDay(inv);
  const joined = TEAM.name && TEAM.members.some(x => x.id === TEAM.id);
  const me = TEAM.members.find(x => x.id === TEAM.id);
  let status;
  if (!TEAM.name) {
    status = `<div class="card"><label class="label" for="joinName">Trag dich als Agent ein</label>
      <input id="joinName" maxlength="24" autocomplete="off" placeholder="Dein Vorname" style="margin-top:8px">
      <button class="btn" id="joinBtn">🕵️ Agentennamen sichern</button></div>`;
  } else if (!party) {
    status = `<div class="card center"><p>✅ ${esc(TEAM.name)}, du bist registriert.</p>
      ${aliasBoxHtml()}
      <p class="small">🔒 Die Mission ist noch versiegelt. Öffne diesen Link am Einsatztag wieder – dann geht es los.</p></div>`;
  } else {
    status = `<div class="card"><div class="label">Heute ist Einsatztag!</div>
      <p>${joined ? `Du bist dabei: <b>${TRUPP[me.trupp]}</b>` : '📡 Melde dich bei der Zentrale an … (Jaspers App muss geöffnet sein)'}</p>
      ${TEAM.members.length ? TEAM.members.map(x => `<div class="memb trupp-${x.trupp}">${x.trupp === 'A' ? '🟥' : '🟦'} ${memberLabel(x)}${x.id === 'host' ? ' ⭐' : ''}${x.id === TEAM.id ? ' (du)' : ''}</div>`).join('') : ''}
      ${TEAM.name ? aliasBoxHtml() : ''}
      <p class="small" style="margin-top:12px">${joined ? '⏳ Warte, bis Einsatzleiter ' + esc(inv.host || 'Jasper') + ' die Mission startet.' : ''}</p></div>`;
  }
  app.innerHTML = inviteCardHtml(inv, TEAM.name ? (TEAM.alias || TEAM.name) : '') + status + rsvpCardHtml(inv)
    + `<div class="card"><div class="label">Vorbereitung</div><p class="small">Teste dein Handy schon vor dem Einsatztag – am besten draußen und zusammen mit deinen Eltern.</p>${checkBtnHtml()}</div>`
    + rulesHtml() + parentsHtml(inv);
  const po = $('#parentsOk');
  if (po) po.onchange = () => { TEAM.parentsOk = po.checked; saveTeam(); const yb = app.querySelector('[data-rsvp=yes]'); if (yb) yb.disabled = !po.checked; };
  app.querySelectorAll('[data-rsvp]').forEach(b => {
    b.onclick = () => {
      initAudio(); fx(b.dataset.rsvp === 'yes' ? 'good' : 'bad');
      TEAM.rsvp = b.dataset.rsvp; TEAM.rsvpConfirmed = ''; if (TEAM.rsvp === 'yes') TEAM.kickedMe = false;
      saveTeam(); sendRsvp(); render();
    };
  });
  const jb = $('#joinBtn');
  if (jb) {
    const go = () => {
      const n = $('#joinName').value.trim();
      if (!n) { $('#joinName').classList.add('shake'); setTimeout(() => $('#joinName').classList.remove('shake'), 400); return; }
      initAudio();
      TEAM.name = n; if (!TEAM.alias) TEAM.alias = makeAlias(takenAliases()); saveTeam(); sendJoin();
      if (isPartyDay(inv)) { startGeo(); enableCompass(); }
      render();
    };
    jb.onclick = go;
    $('#joinName').onkeydown = e => { if (e.key === 'Enter') go(); };
  }
  bindAliasBox();
  clearInterval(invTimer);
  invTimer = setInterval(() => {
    const el = $('#cdown');
    if (!el) { clearInterval(invTimer); return; }
    el.textContent = countdownText(inv);
    if (!party && isPartyDay(inv)) render();
  }, 1000);
  if (TEAM.kickedMe) { app.insertAdjacentHTML('beforeend', kickedHtml()); bindRejoin(); return; }
  if (party && TEAM.name && !joinTimer && !joined) scheduleJoin();
}

/* ---------- Einladung erstellen (Admin auf Jaspers Handy oder am Mac) ---------- */
function renderInviteEditor() {
  if (TEAM.inviteDraft && /Begleitung durch Erwachsene/.test(TEAM.inviteDraft.note || '')) { TEAM.inviteDraft.note = INV_DEFAULT.note; saveTeam(); }
  const inv = Object.assign({}, INV_DEFAULT, TEAM.inviteDraft || {});
  if (!TEAM.inviteDraft) inv.host = P.name || D.agentName || 'Jasper';
  const f = (k, label, type = 'text', ph = '') => `<div class="field"><label for="i_${k}">${label}</label>${type === 'ta'
    ? `<textarea id="i_${k}">${esc(inv[k])}</textarea>` : `<input id="i_${k}" type="${type}" value="${esc(inv[k])}" placeholder="${esc(ph)}">`}</div>`;
  $('#admin').innerHTML = `<div class="wrap">
    <div class="adm-head"><h2>💌 Einladung</h2><button class="btn sec small" style="width:auto;margin:0" data-act="back">← Zurück</button></div>
    <div class="card">
      <p class="small">Die Angaben stecken nur im Einladungslink, nicht im öffentlichen Repository. Der Link ist gleichzeitig der Team-Beitrittslink – am Einsatztag öffnen die Kinder ihn einfach wieder.</p>
      ${f('host', 'Geburtstagskind')}
      ${f('msg', 'Persönlicher Funkspruch an deine Agenten (optional)', 'ta')}
      <div class="row">${f('d', 'Datum', 'date')}${f('t', 'Beginn', 'time')}${f('end', 'Ende ca.', 'time')}</div>
      ${f('ort', 'Treffpunkt', 'text', 'z. B. bei uns zu Hause, Musterstraße 1')}
      ${f('tel', 'Telefon für Zusagen (WhatsApp)', 'tel', 'z. B. 0170 1234567')}
      ${f('bis', 'Antwort bis', 'text', 'z. B. 15. November')}
      ${f('mit', 'Ausrüstung', 'ta')}
      ${f('note', 'Infos für Eltern', 'ta')}
      <button class="btn" data-act="teamInviteSave">💾 Speichern & Link erzeugen</button>
    </div>
    <div id="invOut"></div></div>`;
  if (TEAM.inviteDraft) renderInviteOut();
}
function renderInviteOut() {
  const link = inviteLink(TEAM.inviteDraft);
  $('#invOut').innerHTML = `<div class="card center">
      <div class="label">Einladungslink</div>
      <div class="qr">${qrSvg(link)}</div>
      <div class="row"><button class="btn small" data-act="teamInviteShare">🔗 Einladung teilen</button><button class="btn sec small" data-act="teamInviteCopy">📋 Kopieren</button></div>
      <div class="feedback good" id="invFb"></div>
      <p class="small">Jasper schickt diesen Link an seine Freunde (z. B. in die WhatsApp-Gruppe). Wird die Einladung geändert, einfach den neuen Link nochmal schicken.</p>
    </div>
    <div class="label" style="margin:16px 0 0">Vorschau</div>${inviteCardHtml(TEAM.inviteDraft, 'Max')}${parentsHtml(TEAM.inviteDraft)}`;
}
function inviteAdminAct(act) {
  const msg = t => { const e = $('#invFb'); if (e) e.textContent = t; };
  switch (act) {
    case 'teamInvite':
      if (!isHost()) {
        if (isMember()) return alert('Dieses Handy ist Mitspieler – die Einladung wird auf Jaspers Handy erstellt.');
        teamAdminAct('teamNewQuiet');
      }
      adminView = 'invite'; return renderInviteEditor();
    case 'teamInviteSave': {
      const v = k => $('#i_' + k).value.trim();
      TEAM.inviteDraft = { host: v('host') || 'Jasper', al: myAlias(), msg: v('msg'), d: v('d'), t: v('t'), end: v('end'), ort: v('ort'), tel: v('tel'), bis: v('bis'), mit: v('mit'), note: v('note') };
      saveTeam(); renderInviteOut(); msg('Gespeichert ✓');
      $('#invOut').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    case 'teamInviteCopy': return copyText(inviteLink(TEAM.inviteDraft), msg);
    case 'teamInviteShare': {
      const link = inviteLink(TEAM.inviteDraft);
      const text = `🕵️ STRENG GEHEIM: Deine Einberufung zur Operation Silberfuchs – nur für deine Augen!`;
      if (navigator.share) return void navigator.share({ title: 'Operation Silberfuchs – Einberufung', text, url: link }).catch(() => {});
      return copyText(text + '\n' + link, msg);
    }
  }
}

/* ---------- Einladungs-Studio für Jasper ----------
   Link: …/operation-s7/#studio – Jasper kann Einladung und Deckname gestalten, sieht aber keine Rätsel.
   Sein Handy wird dabei automatisch die Zentrale (Host). Die Mission bleibt bis zum Einsatztag versiegelt;
   den Admin-Modus (Rätsel, Lösungen, Papa-Link) erreicht nur, wer die PIN kennt. */
const KEY_STUDIO = 'sj7_studio';
const studioOn = () => !isMember() && !!lsGet(KEY_STUDIO);
function studioFromHash() {
  if (location.hash.replace('#', '').split('&')[0] !== 'studio' || isMember()) return;
  lsSet(KEY_STUDIO, 1);
}
function renderStudio() {
  const inv = TEAM.inviteDraft, others = (TEAM.members || []).filter(m => m.id !== 'host');
  app.innerHTML = `
  <div class="card pop">
    <div class="stamp">EINSATZLEITER-ZENTRALE</div>
    <h1>Agent ${esc(myAlias())}</h1>
    <p>Hallo ${esc(D.agentName || 'Jasper')}! Du bist der <b>Einsatzleiter</b> der Operation Silberfuchs. Bevor die Mission startet, musst du dein Agententeam einberufen.</p>
    ${aliasBoxHtml('Dein Deckname als Einsatzleiter')}
  </div>
  <div class="card">
    <div class="label">Schritt 1 · Einladung</div>
    ${inv ? `<p>✅ Einladung für <b>${fmtPartyDate(inv)}</b> ist fertig.</p>` : '<p>Gestalte deine geheime Einberufung – mit Treffpunkt, Uhrzeit und einem persönlichen Funkspruch.</p>'}
    <button class="btn" id="stEdit">💌 ${inv ? 'Einladung ansehen, ändern & teilen' : 'Einladung gestalten'}</button>
  </div>
  <div class="card"><div class="label">Technik</div><p class="small">Prüfe dein Handy vorab – du bist die Zentrale!</p>${checkBtnHtml()}</div>
  <div class="card">
    <div class="label">Schritt 2 · Antworten deiner Agenten</div>
    ${rsvpSummaryHtml(others)}
  </div>
  <div class="card center">
    <p>🔒 <b>Die Mission ist versiegelt.</b></p>
    <p class="small">Die Rätsel öffnen sich erst am Einsatztag – auch für dich.</p>
    <div class="countdown"><span class="label">Countdown bis zum Einsatz</span><div id="cdown">${countdownText(inv || INV_DEFAULT)}</div></div>
  </div>`;
  bindAliasBox();
  $('#stEdit').onclick = () => { $('#admin').hidden = false; document.body.style.overflow = 'hidden'; inviteAdminAct('teamInvite'); };
  clearInterval(invTimer);
  invTimer = setInterval(() => {
    const el = $('#cdown');
    if (!el) { clearInterval(invTimer); return; }
    el.textContent = countdownText(inv || INV_DEFAULT);
    if (isPartyDay(inv || INV_DEFAULT)) render();
  }, 1000);
}

function rsvpSummaryHtml(others) {
  const rs = TEAM.rsvps || {}, all = Object.entries(rs);
  const yes = all.filter(([, x]) => x.v === 'yes'), no = all.filter(([, x]) => x.v === 'no');
  const open = others.filter(m => !rs[m.id]);
  if (!all.length && !open.length) return '<p class="small">Noch keine Antworten. Sobald deine Freunde in der Einladung zu- oder absagen, erscheinen sie hier (deine App muss dafür ab und zu geöffnet sein).</p>';
  return `<p><b>${yes.length}</b> dabei · <b>${no.length}</b> abgesagt${open.length ? ` · <b>${open.length}</b> ohne Antwort` : ''}</p>`
    + yes.map(([, x]) => `<div class="memb">✅ ${memberLabel({ name: x.n, alias: x.al })}${x.po ? ' <span class="small">· Eltern einverstanden</span>' : ''}</div>`).join('')
    + no.map(([, x]) => `<div class="memb">❌ ${memberLabel({ name: x.n, alias: x.al })}</div>`).join('')
    + open.map(m => `<div class="memb">⏳ ${memberLabel(m)}</div>`).join('');
}
