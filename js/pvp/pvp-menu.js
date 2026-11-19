/* EARTH 2049: SAVE SEED 7 — the GigaLeague menu: PLAY (quickplay, offline against bots, private rooms, the open-room list,
 * the lobby with host settings and the map vote), CLASSES (create-a-class) and PROGRESS (level, weapons, camos, stats).
 * Opened from the title screen and from the Dreamcaster rig in the Rebel Haven. Starting a match calls
 * window.startPvpMatch(opts) (js/game.js), which runs it in the arena runtime (js/arena/arena-pvp.js).
 */
(function (root) {
  'use strict';
  const PVP = root.PVP;
  let ov = null, tab = 'play', T = null, room = null, editing = null, onClose = null, lastRooms = [], chatLog = [];
  const st = { mode: 'tdm', map: 'plaza', botSkill: 'regular', cls: 0, custom: false, c: { scoreLimit: 0, timeLimit: 0, hpMul: 1, headshotsOnly: false, noStreaks: false, lowGrav: false } };

  const CSS = `
  #pvpMenu{position:fixed;inset:0;z-index:60;background:radial-gradient(ellipse at 30% 20%,#1d1236,#07050f 70%);color:#e8e6f5;font-family:Consolas,'Lucida Console',monospace;display:none;overflow:auto;text-transform:uppercase;letter-spacing:.05em}
  #pvpMenu.on{display:block}
  #pvpMenu .wrap{max-width:1080px;margin:0 auto;padding:22px 20px 40px}
  #pvpMenu h1{margin:0;font-size:34px;letter-spacing:.14em;color:#fff}#pvpMenu h1 small{display:block;font-size:12px;color:#ff2bd6;letter-spacing:.2em;margin-top:4px}
  #pvpMenu .tabs{display:flex;gap:6px;margin:16px 0 14px;flex-wrap:wrap}
  #pvpMenu button{font:inherit;text-transform:uppercase;letter-spacing:.06em;background:#16122a;color:#e8e6f5;border:1px solid #4b3d80;padding:8px 12px;cursor:pointer}
  #pvpMenu button:hover,#pvpMenu button:focus{border-color:#ffd400;color:#ffd400;outline:none}
  #pvpMenu button.on{background:#ffd400;color:#111;border-color:#ffd400}#pvpMenu button.go{background:#ff2bd6;border-color:#ff2bd6;color:#fff;font-weight:bold}
  #pvpMenu button:disabled{opacity:.35;cursor:default}
  #pvpMenu .ctl{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:4px 14px;font-size:12px;margin:4px 0 6px}
  #pvpMenu .ctl span{white-space:nowrap}
  #pvpMenu button.big{display:block;width:100%;padding:16px;font-size:18px;letter-spacing:.2em;margin:6px 0 4px}
  #pvpMenu .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
  #pvpMenu .card{background:rgba(20,15,40,.78);border:1px solid rgba(255,255,255,.12);padding:12px 14px}
  #pvpMenu .card h3{margin:0 0 6px;font-size:15px;color:#00e5ff}#pvpMenu .card p{margin:4px 0 8px;font-size:12px;opacity:.82;text-transform:none;letter-spacing:0;line-height:1.4}
  #pvpMenu label{display:block;font-size:11px;opacity:.8;margin:8px 0 3px}
  #pvpMenu select,#pvpMenu input{font:inherit;background:#0e0b1c;color:#fff;border:1px solid #4b3d80;padding:6px;width:100%;box-sizing:border-box}
  #pvpMenu .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  #pvpMenu .bar{height:8px;background:#0e0b1c;border:1px solid #4b3d80;margin:6px 0}#pvpMenu .bar i{display:block;height:100%;background:#ffd400}
  #pvpMenu table{width:100%;border-collapse:collapse;font-size:12px}#pvpMenu td{padding:3px 6px;border-bottom:1px solid rgba(255,255,255,.06)}
  #pvpMenu .lock{opacity:.4}#pvpMenu .tag{font-size:10px;padding:1px 5px;border:1px solid currentColor;margin-left:6px}
  #pvpMenu .hint{font-size:11px;opacity:.7;text-transform:none;letter-spacing:0}
  #pvpMenu .chat{height:120px;overflow:auto;font-size:12px;text-transform:none;background:#0e0b1c;padding:6px;border:1px solid #2b2350}
  /* class list */
  #pvpMenu .clist{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
  #pvpMenu .ccard{display:flex;flex-direction:column;gap:6px;text-align:left;padding:10px 12px;background:linear-gradient(160deg,rgba(38,26,76,.9),rgba(14,10,30,.92));border-color:#3a2f66}
  #pvpMenu .ccName{font-size:14px;color:#fff;letter-spacing:.12em}
  #pvpMenu .ccGuns{display:grid;grid-template-columns:1.25fr 1fr;gap:6px}#pvpMenu .ccGuns span{display:flex;flex-direction:column;min-width:0}
  #pvpMenu .ccGuns b{font-size:10px;font-weight:normal;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #pvpMenu .ccGuns .thumb{height:52px}
  #pvpMenu .ccIcons{display:flex;gap:6px;align-items:center;color:#00e5ff}#pvpMenu .ccIcons .sep{width:1px;height:16px;background:#4b3d80;margin:0 2px}
  #pvpMenu .ccFoot{font-size:10px;color:#ffd400;align-self:flex-end}
  #pvpMenu .ccard:hover .ccFoot,#pvpMenu .ccard:focus .ccFoot{color:#fff}
  #pvpMenu .thumb{display:block;width:100%;height:76px;object-fit:contain;opacity:0;transition:opacity .25s}#pvpMenu .thumb.ok{opacity:1}
  /* create-a-class */
  #pvpMenu .cacTop{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
  #pvpMenu .cacTop input{flex:1;min-width:160px;max-width:420px;font-size:18px;letter-spacing:.14em;padding:8px 10px;text-transform:uppercase}
  #pvpMenu .cacTop h2{margin:0;font-size:20px;letter-spacing:.14em;color:#fff}
  #pvpMenu .cacMsg{font-size:11px;padding:4px 8px;opacity:0;transition:opacity .2s;background:#59f59a;color:#08130c}#pvpMenu .cacMsg.show{opacity:1}#pvpMenu .cacMsg.bad{background:#ff5a6e;color:#1a0507}
  #pvpMenu .cacBody{display:grid;grid-template-columns:280px minmax(0,1fr);gap:12px;align-items:start}
  #pvpMenu .cacLoad{display:flex;flex-direction:column;gap:6px;position:sticky;top:8px}
  #pvpMenu .slot{display:grid;grid-template-columns:30px 1fr;gap:2px 8px;align-items:center;text-align:left;width:100%;padding:8px 10px;background:rgba(20,15,40,.86);border-color:#3a2f66}
  #pvpMenu .slot .sl{grid-column:1/-1;font-size:9px;letter-spacing:.18em;color:#00e5ff}
  #pvpMenu .slot b{font-weight:normal;font-size:12px;letter-spacing:.06em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #pvpMenu .slot .ic{color:#ffd400;display:flex}#pvpMenu .sslot b{white-space:normal;line-height:1.25}
  #pvpMenu .slot.on{border-color:#ffd400;background:#251c45;box-shadow:inset 3px 0 0 #ffd400}
  #pvpMenu .gunslot{grid-template-columns:1fr auto}#pvpMenu .gunslot .thumb{grid-column:1/-1;height:70px}
  #pvpMenu .gunslot b{font-size:14px;color:#fff}#pvpMenu .gunslot small{font-size:9px;color:#9d93c8;grid-column:1;margin:0;letter-spacing:.08em}
  #pvpMenu .pips{grid-column:2;grid-row:3;display:flex;gap:5px;justify-self:end}#pvpMenu .pips i{width:7px;height:7px;transform:rotate(45deg);border:1px solid #ffd400}#pvpMenu .pips i.f{background:#ffd400}
  #pvpMenu .atts{grid-column:2;grid-row:4;display:flex;gap:3px;color:#ffd400;justify-self:end}
  #pvpMenu .pair{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  #pvpMenu .wrap.wide{max-width:1440px}
  #pvpMenu .cacMain{display:flex;flex-direction:column;gap:12px;min-width:0}
  #pvpMenu .cacDetail{background:linear-gradient(180deg,rgba(44,30,90,.9),rgba(14,10,30,.94));border:1px solid #4b3d80;padding:12px 14px;min-height:200px}
  #pvpMenu .dHead{display:flex;gap:12px;align-items:center}#pvpMenu .dHead>div{flex:1;min-width:0}
  #pvpMenu .dHead h3{margin:0;font-size:20px;color:#fff;letter-spacing:.12em}#pvpMenu .dHead .role{display:block;font-size:11px;color:#00e5ff;margin-top:2px}
  #pvpMenu .dHead em{font-style:normal;color:#ffd400}#pvpMenu .dHint{font-size:9px;opacity:.5;align-self:flex-start}
  #pvpMenu .bigic{color:#ffd400;display:flex;padding:6px;border:1px solid #4b3d80;background:#0e0b1c}
  #pvpMenu .lk{display:inline-flex;gap:4px;align-items:center;font-size:10px;color:#ff9800;margin-top:3px}
  #pvpMenu .cacStage{position:relative;height:190px;margin:6px -6px 8px;background:radial-gradient(ellipse at 50% 62%,rgba(0,229,255,.14),transparent 62%),repeating-linear-gradient(90deg,transparent 0 39px,rgba(255,255,255,.03) 39px 40px);border-bottom:1px solid rgba(255,255,255,.08);cursor:grab}
  #pvpMenu .cacStage.loading::after{content:'LOADING MODEL';position:absolute;inset:0;display:grid;place-items:center;font-size:11px;opacity:.6}
  #pvpMenu .cacCanvas{display:block;width:100%;height:100%;touch-action:pan-y}
  #pvpMenu .dCols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}
  #pvpMenu .sbar{display:grid;grid-template-columns:112px 1fr;gap:8px;align-items:center;font-size:10px;margin:5px 0;cursor:help}
  #pvpMenu .track{position:relative;height:8px;background:#0e0b1c;border:1px solid #3a2f66}#pvpMenu .track i{position:absolute;top:0;bottom:0;left:0}
  #pvpMenu .track .base{background:#e8e6f5}#pvpMenu .track .up{background:#59f59a}#pvpMenu .track .down{background:#ff5a6e}
  #pvpMenu .track.na{background:repeating-linear-gradient(90deg,#0e0b1c 0 6px,#1d1738 6px 8px)}
  #pvpMenu .nums{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin-top:10px}
  #pvpMenu .nums div{background:#0e0b1c;border:1px solid #2b2350;padding:5px 6px;min-width:0}#pvpMenu .nums small{display:block;font-size:8px;opacity:.65;letter-spacing:.08em}
  #pvpMenu .nums b{font-size:13px;font-weight:normal;color:#fff;white-space:nowrap}#pvpMenu .nums b i{font-style:normal;opacity:.45;margin:0 2px}
  #pvpMenu .nums .up b{color:#59f59a}#pvpMenu .nums .down b{color:#ff5a6e}
  #pvpMenu .dText p{text-transform:none;letter-spacing:0;font-size:13px;line-height:1.45;margin:0 0 8px}
  #pvpMenu .dText ul{margin:0;padding:0;list-style:none;font-size:12px;text-transform:none;letter-spacing:0;line-height:1.45}
  #pvpMenu .facts{margin-bottom:10px!important;color:#cfe9ff}#pvpMenu .facts li::before{content:'▸ ';color:#00e5ff}
  #pvpMenu .pc{display:grid;grid-template-columns:1fr 1fr;gap:12px}#pvpMenu .pc h4{margin:0 0 4px;font-size:11px;letter-spacing:.16em}
  #pvpMenu .pros h4{color:#59f59a}#pvpMenu .cons h4{color:#ff5a6e}
  #pvpMenu .pros li::before{content:'+ ';color:#59f59a;font-weight:bold}#pvpMenu .cons li::before{content:'− ';color:#ff5a6e;font-weight:bold}
  #pvpMenu .best{margin-top:10px;font-size:11px;color:#ffd400;border-top:1px solid rgba(255,255,255,.08);padding-top:8px}
  #pvpMenu .dText.solo{margin-top:10px;max-width:680px}
  #pvpMenu .cacPick{background:rgba(20,15,40,.78);border:1px solid rgba(255,255,255,.12);padding:12px 14px}
  #pvpMenu .ptabs{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:10px}#pvpMenu .ptabs .hint{flex:1;min-width:200px}
  #pvpMenu .pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:8px}
  #pvpMenu .pcard{position:relative;display:flex;flex-direction:column;gap:4px;text-align:left;padding:8px 9px;background:#141028;border-color:#3a2f66;min-width:0}
  #pvpMenu .pcard .pch{display:flex;gap:7px;align-items:center;color:#ffd400}#pvpMenu .pcard .pch b{color:#fff;font-weight:normal;font-size:12px;letter-spacing:.06em}
  #pvpMenu .pcard .role{font-size:9px;color:#00e5ff}#pvpMenu .pcard .pts{font-size:10px;color:#00e5ff}
  #pvpMenu .pcard .mini{font-size:11px;text-transform:none;letter-spacing:0;line-height:1.3;opacity:.9}
  #pvpMenu .mini .g{color:#59f59a;font-weight:bold}#pvpMenu .mini .r{color:#ff5a6e;font-weight:bold}
  #pvpMenu .pcard.eq{border-color:#ffd400;background:#2a2148}#pvpMenu .pcard.eq::after{content:'';position:absolute;top:8px;right:8px;width:8px;height:8px;transform:rotate(45deg);background:#ffd400;box-shadow:0 0 6px #ffd400}
  #pvpMenu .pcard .pch{padding-right:16px}#pvpMenu .pcard.eq .pch b{color:#ffd400}
  #pvpMenu .pcard.lock{opacity:.5}#pvpMenu .pcard.lock .pch{color:#8a80b0}
  #pvpMenu .pcard.gun .thumb{height:62px}
  #pvpMenu .minis{display:grid;gap:2px;margin-top:2px}#pvpMenu .mb{display:grid;grid-template-columns:42px 1fr;align-items:center;gap:4px}
  #pvpMenu .mb small{font-size:7px;opacity:.6}#pvpMenu .mb i{display:block;height:3px;background:#00e5ff;max-width:100%}
  #pvpMenu .aslot{margin-bottom:12px}#pvpMenu .ash{display:flex;align-items:center;gap:6px;font-size:11px;color:#00e5ff;margin-bottom:6px;letter-spacing:.16em}
  #pvpMenu .pvpi{flex:none}
  @media (min-width:1180px){
    #pvpMenu .cacBody{grid-template-columns:250px minmax(0,1fr)}
    #pvpMenu .cacMain{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.08fr);align-items:start}
    #pvpMenu .cacPick{order:1}#pvpMenu .cacDetail{order:2;position:sticky;top:8px;max-height:calc(100vh - 16px);overflow:auto}
    #pvpMenu .dCols{grid-template-columns:1fr}
  }
  @media (max-width:760px){
    #pvpMenu .wrap{padding:14px 10px 30px}
    #pvpMenu .cacBody{grid-template-columns:1fr}
    #pvpMenu .cacLoad{position:static;display:grid;grid-template-columns:1fr 1fr}#pvpMenu .cacLoad .pair{grid-column:1/-1}
    #pvpMenu .gunslot .thumb{height:54px}
    #pvpMenu .dCols{grid-template-columns:1fr}#pvpMenu .nums{grid-template-columns:repeat(2,minmax(0,1fr))}#pvpMenu .cacStage{height:150px}
    #pvpMenu .pgrid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}#pvpMenu .pc{grid-template-columns:1fr}
    #pvpMenu .dHint{display:none}
  }
  #pvpMenu .opts{display:flex;gap:6px;flex-wrap:wrap}#pvpMenu .opts label{display:inline-flex;gap:4px;align-items:center;opacity:1;margin:0 8px 0 0;font-size:12px}#pvpMenu .opts input{width:auto}
  `;

  function el(html) { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clean = s => String(s || '').replace(/"/g, '');
  function who() {
    const S = PvpProgress.save() || (root.__pvpSave = root.__pvpSave || {}); S.profile = S.profile || {};
    if (!S.profile.id) { S.profile.id = 'p_' + Math.random().toString(36).slice(2, 12); try { root.persist?.(); } catch (e) {} }  // NOSONAR
    let look = ''; try { look = root.AvatarKit ? AvatarKit.encode(AvatarKit.load()) : ''; } catch (e) { look = ''; }
    const input = root.VR?.active ? 'vr' : root.Pad?.active ? 'pad' : matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
    return { id: S.profile.id, name: (S.profile.name || 'OPERATIVE').slice(0, 20), look, input, level: PvpProgress.level(), classes: PvpProgress.classes() };
  }

  /* ------------------------------------------------------------------ open / close */
  function open(o = {}) {
    if (!ov) { const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); ov = document.createElement('div'); ov.id = 'pvpMenu'; document.body.appendChild(ov); }
    onClose = o.onClose || onClose;
    if (o.tab) tab = o.tab;
    document.exitPointerLock?.();
    ov.classList.add('on');
    render();
  }
  function close() { ov?.classList.remove('on'); onClose?.(); }
  addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !isOpen()) return;
    const a = document.activeElement;
    if (a && ov.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'SELECT')) { a.blur(); return; }
    e.preventDefault();
    if (editing !== null) { editing = null; render(); return; }
    ov.querySelector('[data-act="close"]')?.click();
  });
  // the button prompts follow the device: re-draw the controls card when it changes
  root.Glyph?.onChange(() => { if (!isOpen()) return; const c = ov.querySelector('.controls'); if (c) render(); });
  const isOpen = () => !!ov?.classList.contains('on');

  function render() {
    if (!ov) return;
    const L = PvpProgress.levelInfo();
    ov.innerHTML = `<div class="wrap"><div class="row" style="justify-content:space-between"><h1>GIGALEAGUE<small>${esc(PVP.HOST.title)} // DIE ON CREDIT</small></h1>
      <div style="text-align:right;font-size:12px">LEVEL <b style="font-size:22px;color:#ffd400">${L.level}</b>${L.prestige ? ' // PRESTIGE ' + L.prestige : ''}<div class="bar" style="width:220px"><i style="width:${L.need ? L.into / L.need * 100 : 100}%"></i></div></div></div>
      <div class="tabs">${['play', 'classes', 'progress'].map(t => `<button data-tab="${t}" class="${tab === t ? 'on' : ''}">${t}</button>`).join('')}<button data-act="close" style="margin-left:auto">BACK</button></div>
      <div class="body"></div></div>`;
    ov.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; editing = null; render(); });
    ov.querySelector('[data-act="close"]').onclick = () => { if (T && !room?.inMatch) leaveRoom(); close(); };
    const body = ov.querySelector('.body');
    if (tab === 'play') (T ? renderLobby : renderPlay)(body);
    if (tab === 'classes') renderClasses(body);
    if (tab === 'progress') renderProgress(body);
  }

  /* ------------------------------------------------------------------ PLAY */
  function modeOptions(sel) { return PVP.MODE_ORDER.map(m => `<option value="${m}" ${m === sel ? 'selected' : ''}>${clean(PVP.MODES[m].name)} — ${PVP.PLAYLISTS[PVP.MODES[m].playlist].name}</option>`).join(''); }
  function mapOptions(sel) { return PVP.MAP_ORDER.map(m => `<option value="${m}" ${m === sel ? 'selected' : ''}>${PVP.MAPS[m].name} — ${PVP.MAPS[m].region}</option>`).join(''); }
  function classOptions(sel) { return PvpProgress.classes().map((c, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(c.name)}${c.premade ? '' : ' (CUSTOM)'}</option>`).join(''); }
  /** The controls, in the buttons of whatever the player is holding (js/input-glyphs.js). */
  function controlsHtml() {
    const g = a => (root.Glyph ? Glyph.act(a, 'pvp') : '[' + a + ']');
    const rows = [['fire', 'FIRE'], ['ads', 'AIM'], ['reload', 'RELOAD'], ['use', 'HOLD: USE, PLANT, DEFUSE, PICK UP'], ['swap', 'SWAP WEAPON'], ['lethal', 'LETHAL'], ['tactical', 'TACTICAL'],
      ['melee', 'MELEE'], ['jump', 'JUMP'], ['crouch', 'CROUCH / SLIDE'], ['sprint', 'SPRINT'], ['streak1', 'STREAK 1'], ['streak2', 'STREAK 2'], ['streak3', 'STREAK 3'], ['score', 'SCOREBOARD (HOLD)'], ['pause', 'PAUSE / CHANGE CLASS']];
    return `<div class="ctl">${rows.map(([a, n]) => `<span>${g(a)} ${n}</span>`).join('')}</div>
      <p class="hint">Dead: ${g('classPrev')} ${g('classNext')} change class for the next life, ${g('skip')} skip the killcam.</p>`;
  }
  function renderPlay(body) {
    body.innerHTML = `<div class="grid">
      <div class="card"><h3>QUICK MATCH</h3><p>One button: you drop into the best open match, or a new one starts with bots in every empty slot, so there is always a game. No codes, no room names.</p>
        <button class="go big" data-qp="any">QUICK MATCH</button>
        <label>OR PICK A PLAYLIST</label><div class="row">${Object.values(PVP.PLAYLISTS).map(p => `<button data-qp="${p.id}" title="${esc(p.sub)}">${p.name}</button>`).join('')}</div><p class="qpStatus hint">Online. Needs the match server.</p></div>
      <div class="card"><h3>OFFLINE // VS BOTS</h3><p>Any mode, any map, right now. Plays in this browser, no connection needed. A match with no other humans pays 75% XP, half DRIP and no GigaTech.</p>
        <label>MODE</label><select data-k="mode">${modeOptions(st.mode)}</select><label>MAP</label><select data-k="map">${mapOptions(st.map)}</select>
        <div class="row"><div style="flex:1"><label>BOT SKILL</label><select data-k="botSkill">${Object.entries(PVP.BOT_SKILL).map(([k, v]) => `<option value="${k}" ${k === st.botSkill ? 'selected' : ''}>${v.name}</option>`).join('')}</select></div>
        <div style="flex:1"><label>CLASS</label><select data-k="cls">${classOptions(st.cls)}</select></div></div>
        <p class="hint" style="margin-top:8px">${esc(PVP.MODES[st.mode].how)}</p><button class="go" data-act="offline">PLAY OFFLINE</button></div>
      <div class="card"><h3>PRIVATE ROOM</h3><p>Make a room and send friends the code. You pick the mode, the map and the rules. Custom rules pay no XP.</p>
        <div class="row"><button data-act="host">HOST PRIVATE</button><button data-act="hostPublic">HOST PUBLIC</button></div>
        <label>JOIN BY CODE</label><div class="row"><input data-k="code" maxlength="6" placeholder="ABCDE" style="flex:1;text-transform:uppercase"><button data-act="join">JOIN</button></div></div>
      <div class="card"><h3>OPEN ROOMS</h3><div class="rooms hint">Loading…</div><button data-act="refresh" style="margin-top:8px">REFRESH</button></div></div>
      <div class="card controls" style="margin-top:12px"><h3>CONTROLS</h3>${controlsHtml()}
        <div class="row" style="margin-top:8px;align-items:center"><span class="hint" style="margin:0">BUTTON PROMPTS</span><button data-act="prompts">${root.Glyph ? Glyph.prefLabel() : 'AUTO'}</button><span class="hint" style="margin:0">AUTO follows whatever you touched last.</span></div></div>`;
    body.querySelectorAll('select[data-k]').forEach(s => s.onchange = () => { st[s.dataset.k] = s.dataset.k === 'cls' ? +s.value : s.value; if (s.dataset.k === 'mode') render(); });
    body.querySelectorAll('[data-qp]').forEach(b => b.onclick = () => quickplay(b.dataset.qp));
    const act = (a, fn) => { const b = body.querySelector(`[data-act="${a}"]`); if (b) b.onclick = fn; };
    act('offline', () => startOffline());
    act('prompts', () => { root.Glyph?.cycle(); render(); });
    act('host', () => hostRoom(false)); act('hostPublic', () => hostRoom(true));
    act('join', () => joinRoom(body.querySelector('[data-k="code"]').value));
    act('refresh', () => refreshRooms(body));
    refreshRooms(body);
    clearInterval(roomsT);
    roomsT = setInterval(() => { if (!isOpen() || T || tab !== 'play') { clearInterval(roomsT); return; } refreshRooms(body); }, 6000);
  }
  let roomsT = 0;
  async function refreshRooms(body) {
    const box = body.querySelector('.rooms'); if (!box) return;
    lastRooms = await PvpNet.listRooms();
    box.innerHTML = lastRooms.length ? `<table>${lastRooms.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.playlist || '')}</td><td>${r.players}/${r.max}</td><td>${r.state === 'run' ? 'IN MATCH' : 'LOBBY'}</td><td><button data-room="${esc(r.code)}">JOIN</button></td></tr>`).join('')}</table>` : 'No open rooms right now. QUICK MATCH opens one for others to find.';
    box.querySelectorAll('[data-room]').forEach(b => b.onclick = () => joinRoom(b.dataset.room));
  }
  function startOffline() {
    const w = who();
    const opts = { mode: st.mode, map: st.map, botSkill: st.botSkill, cls: st.cls, name: w.name, look: w.look, input: w.input, level: w.level, classes: w.classes };
    close();
    root.startPvpMatch({ transport: PvpNet.local(opts), mode: st.mode, map: st.map, cls: st.cls, offline: true,
      onAgain: () => { root.AR?.exit?.(); setTimeout(() => startOffline(), 60); }, onQuit: () => { root.AR?.exit?.(); setTimeout(() => open({ tab: 'play' }), 60); } });
  }

  /* ------------------------------------------------------------------ online rooms */
  function status(msg) { const b = ov?.querySelector('.rooms') || ov?.querySelector('.lobbyStatus'); if (b) b.textContent = msg; else root.banner?.('GIGALEAGUE', msg); }
  async function hostRoom(listed) {
    const w = who();
    try { const r = await PvpNet.createRoom({ playerId: w.id, name: w.name + '’S ROOM', public: listed, playlist: PVP.MODES[st.mode].playlist, settings: { mode: st.mode, map: st.map, botSkill: st.botSkill } }); connect(r.roomCode); }
    catch (e) { status('Could not reach the match server. Offline matches still work.'); }
  }
  let qpBusy = false;
  async function quickplay(pl) {
    if (qpBusy) return; qpBusy = true;
    const w = who(), box = ov?.querySelector('.qpStatus');
    if (box) box.textContent = 'Finding a match…';
    try { const r = await PvpNet.quickplay({ playerId: w.id, name: w.name, playlist: pl }); connect(r.roomCode); }
    catch (e) { const m = 'Could not reach the match server. Offline matches still work.'; if (box) box.textContent = m; else status(m); }
    finally { qpBusy = false; }
  }
  function joinRoom(code) { code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (code.length < 4) return; connect(code); }
  function connect(code) {
    leaveRoom();
    T = PvpNet.online(code, who());
    T.on(onNet);
    room = { code, players: [], settings: {}, connecting: true };
    tab = 'play'; render();
  }
  function leaveRoom() { if (T) { T.close(); T = null; room = null; chatLog = []; voteEnd = 0; } }
  let voteEnd = 0;
  const voteLeft = () => Math.max(0, voteEnd ? (voteEnd - performance.now()) / 1000 : (room?.voteLeft || 0));
  setInterval(() => {
    if (!isOpen()) return;
    const v = ov.querySelector('.voteLeft'); if (v) { const n = String(Math.ceil(voteLeft())); if (v.textContent !== n) v.textContent = n; }
  }, 200);
  let pending = null;
  function onNet(m) {
    if (m.t === 'room') {
      room = m.room;
      // the server sends the seconds left only when the room changes: count down here between updates
      if (room?.options && Number.isFinite(room.voteLeft)) voteEnd = performance.now() + room.voteLeft * 1000; else voteEnd = 0;
      if (isOpen() && tab === 'play') render();
    }
    if (m.t === 'chat') { chatLog.push(m); if (chatLog.length > 40) chatLog.shift(); const c = ov?.querySelector('.chat'); if (c) { c.innerHTML += `<div><b>${esc(m.from)}</b>: ${esc(m.text)}</div>`; c.scrollTop = 1e6; } }
    if (m.t === 'err' && m.m === 'host_only') status('Only the host can change that.');
    if (m.t === 'closed') { status(m.why === 'replaced' ? 'You joined from somewhere else.' : 'Lost the match server.'); T = null; room = null; if (isOpen()) render(); }
    if (m.t === 'start') {
      // the match is starting: hand the transport to the arena, buffering everything until it is listening
      const opts = { transport: T, mode: m.mode, map: m.map, cls: st.cls, start: m, queued: [], offline: false,
        onLobby: () => { root.AR?.exit?.(); setTimeout(() => open({ tab: 'play' }), 60); },
        onQuit: () => { leaveRoom(); root.AR?.exit?.(); setTimeout(() => open({ tab: 'play' }), 60); } };
      pending = opts;
      const off = T.on(x => { if (opts.queued) opts.queued.push(x); else off(); });
      close();
      root.startPvpMatch(opts);
    }
    if (m.t === 'lobby' && !root.AR?.Pvp?.on) render();
  }
  function renderLobby(body) {
    const r = room || {}, me = who(), host = !!r.host && me.id === r.host, set = r.settings || {};
    const opt = (o, i) => o ? `${clean(PVP.MODES[o.mode].name)} ON ${PVP.MAPS[o.map].name}` : 'RANDOM';
    const myVote = (r.votes || []).length;
    body.innerHTML = `<div class="grid"><div class="card"><h3>ROOM ${esc(r.code || '…')}</h3>
      <p class="lobbyStatus">${r.connecting ? 'Connecting…' : r.inMatch ? 'A match is running. You join as soon as it accepts you.' : r.quick ? 'Quickplay lobby. The vote picks the next match.' : host ? 'You are the host. Pick the rules and start.' : 'Waiting for the host.'}</p>
      <table>${(r.players || []).map(p => `<tr><td>${esc(p.name)}${p.host ? '<span class="tag">HOST</span>' : ''}</td><td>LV ${p.level}</td><td>${esc(p.input)}</td></tr>`).join('')}</table>
      <p class="hint">Share the code. Bots fill the empty slots and step aside when people join.</p>
      <div class="row"><button data-act="leave">LEAVE ROOM</button></div></div>
      <div class="card"><h3>${r.options ? 'VOTE // <span class="voteLeft">' + Math.ceil(voteLeft()) + '</span>S' : 'MATCH'}</h3>
      ${r.options ? `<div class="row" style="flex-direction:column;align-items:stretch">${[0, 1, 2].map(i => `<button data-vote="${i}">${opt(r.options[i], i)} // ${(r.votes || []).filter(v => v === i).length}</button>`).join('')}</div>` : ''}
      ${!r.quick ? `<label>MODE</label><select data-s="mode" ${host ? '' : 'disabled'}>${modeOptions(set.mode || st.mode)}</select><label>MAP</label><select data-s="map" ${host ? '' : 'disabled'}>${mapOptions(set.map || st.map)}</select>
      <div class="row"><div style="flex:1"><label>BOT SKILL</label><select data-s="botSkill" ${host ? '' : 'disabled'}>${Object.entries(PVP.BOT_SKILL).map(([k, v]) => `<option value="${k}" ${k === set.botSkill ? 'selected' : ''}>${v.name}</option>`).join('')}</select></div>
      <div style="flex:1"><label>BOTS</label><select data-s="bots" ${host ? '' : 'disabled'}><option value="1">FILL EMPTY SLOTS</option><option value="0" ${set.bots === false ? 'selected' : ''}>NO BOTS</option></select></div></div>
      <label>CUSTOM RULES (NO XP)</label><div class="opts">${[['custom', 'ON'], ['headshotsOnly', 'HEADSHOTS ONLY'], ['noStreaks', 'NO STREAKS'], ['lowGrav', 'LOW GRAVITY']].map(([k, n]) => `<label><input type="checkbox" data-c="${k}" ${k === 'custom' ? (set.custom ? 'checked' : '') : (set.custom?.[k] ? 'checked' : '')} ${host ? '' : 'disabled'}>${n}</label>`).join('')}</div>
      <div class="row"><div style="flex:1"><label>SCORE LIMIT (0 = DEFAULT)</label><input type="number" data-n="scoreLimit" value="${set.custom?.scoreLimit || 0}" ${host ? '' : 'disabled'}></div><div style="flex:1"><label>HEALTH x</label><input type="number" step="0.25" data-n="hpMul" value="${set.custom?.hpMul || 1}" ${host ? '' : 'disabled'}></div></div>` : ''}
      <label>YOUR CLASS</label><select data-k="cls">${classOptions(st.cls)}</select>
      <div class="row" style="margin-top:10px">${host && !r.quick && !r.inMatch ? '<button class="go" data-act="start">START MATCH</button>' : ''}</div></div>
      <div class="card"><h3>LOBBY CHAT</h3><div class="chat">${chatLog.map(m => `<div><b>${esc(m.from)}</b>: ${esc(m.text)}</div>`).join('')}</div><div class="row" style="margin-top:6px"><input data-k="say" maxlength="140" style="flex:1" placeholder="say something"><button data-act="say">SEND</button></div>
      <p class="hint">Text only for now. Party voice chat comes after launch.</p></div></div>`;
    void myVote;
    const sendSet = () => {
      const g = k => body.querySelector(`[data-s="${k}"]`)?.value;
      const c = body.querySelector('[data-c="custom"]')?.checked ? { headshotsOnly: !!body.querySelector('[data-c="headshotsOnly"]')?.checked, noStreaks: !!body.querySelector('[data-c="noStreaks"]')?.checked,
        lowGrav: !!body.querySelector('[data-c="lowGrav"]')?.checked, scoreLimit: +body.querySelector('[data-n="scoreLimit"]').value || 0, hpMul: +body.querySelector('[data-n="hpMul"]').value || 1 } : null;
      T?.send({ t: 'settings', settings: { mode: g('mode'), map: g('map'), botSkill: g('botSkill'), bots: g('bots') !== '0', custom: c } });
    };
    body.querySelectorAll('[data-s],[data-c],[data-n]').forEach(x => x.onchange = sendSet);
    body.querySelectorAll('[data-vote]').forEach(b => b.onclick = () => T?.send({ t: 'vote', i: +b.dataset.vote }));
    const cs = body.querySelector('[data-k="cls"]'); if (cs) cs.onchange = () => { st.cls = +cs.value; };
    const act = (a, fn) => { const b = body.querySelector(`[data-act="${a}"]`); if (b) b.onclick = fn; };
    act('leave', () => { leaveRoom(); render(); });
    act('start', () => T?.send({ t: 'start' }));
    const say = () => { const i = body.querySelector('[data-k="say"]'); if (i.value.trim()) { T?.send({ t: 'chat', text: i.value.trim() }); i.value = ''; } };
    act('say', say); const si = body.querySelector('[data-k="say"]'); if (si) si.onkeydown = e => { if (e.key === 'Enter') say(); e.stopPropagation(); };
  }

  /* ------------------------------------------------------------------ CLASSES
   * The class list (every class as a card with its guns and equipment), the scorestreak picks, and the create-a-class
   * editor: a loadout column (primary, secondary, lethal, tactical, three perks), a detail panel (live 3D gun with its
   * attachments, stat bars with the change a choice would make, the real numbers, plain-language PROS and CONS) and
   * a picker (weapons, attachments by slot, perks, equipment). Text: js/pvp/pvp-codex.js. Icons: js/pvp/pvp-icons.js.
   * Gun pictures: js/pvp/pvp-preview.js. Changes save as you make them. */
  let ed = null;                                   // the open editor: { idx, c (working copy), slot, sub, hover, ro, msg }
  const ICON = (id, o) => (root.PvpIcons ? PvpIcons.svg(id, o) : '');
  const CODEX = () => root.PvpCodex;
  const gunImg = (gid, att, cls = '') => `<img class="thumb ${cls}" alt="" data-thumb="${PVP.GUNS[gid].vis}|${(att || []).join('+')}|${PvpProgress.camoOf(gid)}">`;
  const fillThumbs = el => root.PvpPreview?.fillThumbs(el);
  const roleOf = gid => CODEX()?.GUNS[gid]?.role || PVP.GUNS[gid]?.cls?.toUpperCase() || '';

  function renderClasses(body) {
    if (editing !== null) return renderEditor(body, editing);
    ed = null;
    const lv = PvpProgress.level(), list = PvpProgress.classes(), mine = PvpProgress.streaks();
    const card = (c, i) => `<button class="ccard" data-edit="${i}">
        <span class="ccName">${esc(c.name)}${c.premade ? '<span class="tag">PREMADE</span>' : ''}</span>
        <span class="ccGuns"><span>${gunImg(c.primary, c.att?.[c.primary])}<b>${clean(PVP.GUNS[c.primary]?.name)}</b></span>
          <span>${gunImg(c.secondary, c.att?.[c.secondary])}<b>${clean(PVP.GUNS[c.secondary]?.name)}</b></span></span>
        <span class="ccIcons" title="${esc([PVP.LETHALS[c.lethal]?.name, PVP.TACTICALS[c.tactical]?.name, ...(c.perks || []).map(p => PVP.PERKS[p]?.name)].map(clean).join(' · '))}">
          ${ICON(c.lethal, { size: 20 })}${ICON(c.tactical, { size: 20 })}<i class="sep"></i>${(c.perks || []).map(p => ICON(p, { size: 20 })).join('')}</span>
        <span class="ccFoot">${c.premade ? 'VIEW' : 'EDIT'} ▸</span></button>`;
    body.innerHTML = `${lv < PVP.CUSTOM_AT ? `<p class="hint">Custom classes open at level ${PVP.CUSTOM_AT}. Until then, pick a premade class before each match or when you respawn. Tap one to see what is in it.</p>` : ''}
      <div class="clist">${list.map(card).join('')}</div>
      <div class="card" style="margin-top:14px"><h3>SCORESTREAKS — PICK ${PVP.STREAK_SLOTS} <span class="hint">(${mine.length} / ${PVP.STREAK_SLOTS})</span></h3>
        <p>Points from kills, assists and objectives buy these during a life. Your points reset when you die, so cheaper streaks come out more often.</p>
        <div class="pgrid">${PVP.STREAK_ORDER.map(id => {
          const S = PVP.STREAKS[id], ok = S.lvl <= lv, on = mine.includes(id), E = CODEX()?.entry('streak', id);
          return `<button class="pcard ${on ? 'eq' : ''} ${ok ? '' : 'lock'}" data-st="${id}" ${ok ? '' : 'aria-disabled="true"'}>
            <span class="pch">${ICON(id)}<b>${clean(S.name)}</b></span><span class="pts">${S.pts.toLocaleString('en-US')} POINTS</span>
            <span class="mini">${esc(S.d)}</span>${E?.cons?.[0] ? `<span class="mini"><span class="r">−</span> ${esc(E.cons[0])}</span>` : ''}
            ${ok ? '' : `<span class="lk">${ICON('lock', { size: 12 })} LEVEL ${S.lvl}</span>`}</button>`;
        }).join('')}</div><p class="hint streakMsg"></p></div>`;
    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { editing = +b.dataset.edit; render(); });
    body.querySelectorAll('[data-st]').forEach(b => b.onclick = () => {
      const id = b.dataset.st, S = PVP.STREAKS[id], msg = body.querySelector('.streakMsg');
      if (S.lvl > lv) { msg.textContent = `${clean(S.name)} unlocks at level ${S.lvl}.`; return; }
      let on = PvpProgress.streaks().slice();
      if (on.includes(id)) on = on.filter(x => x !== id);
      else if (on.length >= PVP.STREAK_SLOTS) { msg.textContent = `You can carry ${PVP.STREAK_SLOTS}. Take one off first.`; return; }
      else on.push(id);
      PvpProgress.setStreaks(on.sort((a, x) => PVP.STREAKS[a].pts - PVP.STREAKS[x].pts));
      render();
    });
    fillThumbs(body);
  }

  const GUN_SLOTS = { primary: 'PRIMARY', secondary: 'SECONDARY' };
  const slotKind = s => (GUN_SLOTS[s] ? 'gun' : s.startsWith('perk') ? 'perk' : s);
  const curId = s => { const c = ed.c; return GUN_SLOTS[s] ? c[s] : s.startsWith('perk') ? c.perks[+s.slice(4) - 1] : c[s]; };
  const attOf = gid => ed.c.att[gid] || [];
  /** the attachment list with one attachment put on (replacing its slot) or taken off */
  function toggled(att, a) {
    if (att.includes(a)) return att.filter(x => x !== a);
    const sl = PVP.ATTACHMENTS[a].slot, rest = att.filter(x => PVP.ATTACHMENTS[x].slot !== sl);
    return rest.length >= PVP.MAX_ATTACH ? null : rest.concat(a);
  }
  const bnplOn = () => ed.c.perks.includes('bnpl');
  const secondaryIds = () => (bnplOn() ? PVP.SECONDARY_IDS.concat(PVP.PRIMARY_IDS) : PVP.SECONDARY_IDS);

  function renderEditor(body, idx) {
    const list = PvpProgress.classes();
    if (!list[idx]) { editing = null; return render(); }
    if (!ed || ed.idx !== idx) {
      const c = JSON.parse(JSON.stringify(list[idx]));
      c.att = c.att || {}; c.perks = (c.perks || []).slice(0, 3);
      ed = { idx, c, slot: 'primary', sub: 'gun', hover: null, ro: !!list[idx].premade, msg: '' };
    }
    const c = ed.c;
    body.closest('.wrap')?.classList.add('wide');               // the editor uses the whole screen width
    body.innerHTML = `<div class="cac">
      <div class="cacTop"><button data-act="back">◂ CLASSES</button>
        ${ed.ro ? `<h2>${esc(c.name)}<span class="tag">PREMADE · READ ONLY</span></h2>` : `<input data-f="name" maxlength="20" value="${esc(c.name)}" aria-label="Class name">`}
        <span class="cacMsg"></span></div>
      <div class="cacBody"><div class="cacLoad"></div><div class="cacMain"><div class="cacDetail"></div><div class="cacPick"></div></div></div>
      <p class="hint" style="margin-top:10px">Every attachment is a trade: it makes one thing better and another worse. Bars show the change before you commit (green better, red worse). Rarity is a camo in the core playlist; it never changes a gun. Changes save as you make them.</p></div>`;
    body.querySelector('[data-act="back"]').onclick = () => { if (T && !ed.ro) T.send({ t: 'classes', classes: PvpProgress.classes() }); editing = null; ed = null; render(); };
    const nm = body.querySelector('[data-f="name"]');
    if (nm) nm.oninput = () => { c.name = nm.value.toUpperCase().slice(0, 20) || 'CUSTOM'; save(true); };
    drawAll(body);
  }
  function drawAll(body) { drawLoad(body); drawDetail(body); drawPick(body); }
  function flash(body, msg, bad) {
    const m = body.querySelector('.cacMsg'); if (!m) return;
    m.textContent = msg; m.className = 'cacMsg show' + (bad ? ' bad' : '');
    clearTimeout(flash.t); flash.t = setTimeout(() => { m.className = 'cacMsg'; }, 2200);
  }
  function save(quiet) {
    if (ed.ro) return;
    const lv = PvpProgress.level(), v = window.PvpSim.sanitizeClass(ed.c, lv);
    v.name = ed.c.name || 'CUSTOM';
    PvpProgress.saveClass(ed.idx - PVP.PREMADE.length, v);
    // keep the working copy's attachments for guns not in the class, so switching back restores them
    const att = Object.assign({}, ed.c.att, v.att);
    Object.assign(ed.c, v, { att });
    if (!quiet) flash(ov, 'SAVED');
  }

  /* ---- the loadout column */
  function drawLoad(body) {
    const L = body.querySelector('.cacLoad'), c = ed.c;
    const gunSlot = key => {
      const gid = c[key], G = PVP.GUNS[gid], att = attOf(gid);
      return `<button class="slot gunslot ${ed.slot === key ? 'on' : ''}" data-slot="${key}">
        <span class="sl">${GUN_SLOTS[key]}${key === 'secondary' && bnplOn() ? ' · ANY GUN' : ''}</span>${gunImg(gid, att)}
        <b>${clean(G.name)}</b><small>${roleOf(gid)}</small>
        <span class="pips" title="${att.length} of ${PVP.MAX_ATTACH} attachments">${Array.from({ length: PVP.MAX_ATTACH }, (_, i) => `<i class="${i < att.length ? 'f' : ''}"></i>`).join('')}</span>
        <span class="atts">${att.map(a => ICON(a, { size: 15 })).join('')}</span></button>`;
    };
    const small = (key, label, tbl) => {
      const id = curId(key), X = tbl[id];
      return `<button class="slot sslot ${ed.slot === key ? 'on' : ''}" data-slot="${key}"><span class="sl">${label}</span><span class="ic">${ICON(id)}</span><b>${clean(X?.name)}</b></button>`;
    };
    L.innerHTML = gunSlot('primary') + gunSlot('secondary') +
      `<div class="pair">${small('lethal', 'LETHAL', PVP.LETHALS)}${small('tactical', 'TACTICAL', PVP.TACTICALS)}</div>` +
      [1, 2, 3].map(t => small('perk' + t, 'PERK ' + t, PVP.PERKS)).join('');
    L.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => {
      ed.slot = b.dataset.slot; ed.sub = 'gun'; ed.hover = null; drawAll(body);
      if (innerWidth < 760) body.querySelector('.cacDetail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    fillThumbs(L);
  }

  /* ---- the detail panel */
  const fmtS = v => (v >= 10 ? Math.round(v) : v.toFixed(1)) + ' S';
  function drawDetail(body) {
    const D = body.querySelector('.cacDetail'), c = ed.c, C = CODEX(), kind = slotKind(ed.slot), lv = PvpProgress.level();
    if (!C) { D.innerHTML = ''; return; }
    if (kind === 'gun') {
      const gid = c[ed.slot], att = attOf(gid), h = ed.hover;
      let showGid = gid, showAtt = att, cmp = null, E, note = '';
      if (h?.kind === 'gun' && h.id !== gid) { showGid = h.id; showAtt = attOf(h.id); cmp = [gid, att]; E = C.entry('gun', showGid, showAtt); }
      else if (h?.kind === 'attach') {
        const t = toggled(att, h.id); E = C.entry('attach', h.id);
        if (t) { showAtt = t; cmp = [gid, att]; note = att.includes(h.id) ? 'TAKING IT OFF' : 'PUTTING IT ON'; } else note = `ALL ${PVP.MAX_ATTACH} SLOTS USED: TAKE ONE OFF FIRST`;
      } else E = C.entry('gun', gid, att);
      const st = C.gunStats(showGid, showAtt), base = cmp ? C.gunStats(cmp[0], cmp[1]) : null;
      const locked = h?.kind === 'gun' ? PVP.GUNS[h.id].lvl > lv : h?.kind === 'attach' ? PvpProgress.weaponLevel(gid) < PVP.attachLevel(h.id) : false;
      const lockTxt = h?.kind === 'gun' ? `UNLOCKS AT LEVEL ${PVP.GUNS[h.id].lvl}` : h?.kind === 'attach' ? `UNLOCKS AT WEAPON LEVEL ${PVP.attachLevel(h.id)} (YOURS: ${PvpProgress.weaponLevel(gid)})` : '';
      const attHead = h?.kind === 'attach';
      D.innerHTML = `<div class="dHead">${attHead ? `<span class="bigic">${ICON(h.id, { size: 34 })}</span>` : ''}<div><h3>${esc(E.title)}</h3>
          <span class="role">${esc(E.role)}${attHead ? ' ATTACHMENT · FOR ' + clean(PVP.GUNS[gid].name) : ''}${note ? ` · <em>${note}</em>` : ''}</span>
          ${locked ? `<span class="lk">${ICON('lock', { size: 12 })} ${lockTxt}</span>` : ''}</div>
          <span class="dHint">${cmp ? 'COMPARED WITH WHAT YOU HAVE' : 'DRAG TO TURN'}</span></div>
        <div class="cacStage"></div>
        <div class="dCols"><div class="dStats">${Object.keys(C.BAR_NAMES).map(k => barRow(C, k, st, base)).join('')}${numsHtml(st, base)}</div>
          <div class="dText">${textHtml(E)}</div></div>`;
      root.PvpPreview?.show(D.querySelector('.cacStage'), PVP.GUNS[showGid].vis, showAtt, PvpProgress.camoOf(showGid));
      return;
    }
    const id = ed.hover && ed.hover.kind === kind ? ed.hover.id : curId(ed.slot);
    const E = C.entry(kind, id), X = (kind === 'perk' ? PVP.PERKS : kind === 'lethal' ? PVP.LETHALS : PVP.TACTICALS)[id];
    const extra = kind === 'lethal' ? [X.dmg && `Damage: up to ${X.dmg}`, X.radius && `Blast radius: ${X.radius} m`, X.fuse && `Fuse: ${X.fuse} s`].filter(Boolean)
      : kind === 'tactical' ? [X.radius && `Radius: ${X.radius} m`, X.dur && `Lasts: ${X.dur} s`, X.fuse && `Fuse: ${X.fuse} s`].filter(Boolean) : [];
    D.innerHTML = `<div class="dHead"><span class="bigic">${ICON(id, { size: 40 })}</span><div><h3>${esc(E.title)}</h3><span class="role">${esc(E.role)}</span>
        ${X.lvl > lv ? `<span class="lk">${ICON('lock', { size: 12 })} UNLOCKS AT LEVEL ${X.lvl}</span>` : ''}</div></div>
      <div class="dText solo">${textHtml(Object.assign({}, E, { lines: extra }))}</div>`;
  }
  function barRow(C, k, st, base) {
    const v = st.bars[k];
    if (v == null) return `<div class="sbar" title="${esc(C.BAR_HELP[k])}"><span>${C.BAR_NAMES[k]}</span><div class="track na"></div></div>`;
    const b = base && base.bars[k] != null ? base.bars[k] : v, lo = Math.min(v, b), hi = Math.max(v, b);
    return `<div class="sbar" title="${esc(C.BAR_HELP[k])}"><span>${C.BAR_NAMES[k]}</span><div class="track"><i class="base" style="width:${(lo * 100).toFixed(1)}%"></i>${hi - lo > 0.004 ? `<i class="${v > b ? 'up' : 'down'}" style="left:${(lo * 100).toFixed(1)}%;width:${((hi - lo) * 100).toFixed(1)}%"></i>` : ''}</div></div>`;
  }
  function numsHtml(st, base) {
    const n = st.num, o = base?.num;
    // lowBetter: smaller is the better number
    const cell = (label, val, show, prev, lowBetter) => {
      let cls = '';
      if (o && prev !== undefined && prev !== val && typeof val === 'number') cls = (lowBetter ? val < prev : val > prev) ? 'up' : 'down';
      return `<div class="${cls}"><small>${label}</small><b>${show}</b></div>`;
    };
    const proj = n.fire === 'proj';
    return `<div class="nums">
      ${proj ? cell('DIRECT HIT', 1, 'KILLS') : cell('SHOTS TO KILL', n.stkNear * 10 + n.stkFar / 10, `${n.stkNear}<i>/</i>${n.stkFar}`, o && o.stkNear * 10 + o.stkFar / 10, true)}
      ${proj ? cell('SPLASH', n.splash, n.splash + ' M') : cell('TIME TO KILL', n.ttkNear, n.ttkNear ? n.ttkNear + ' MS' : 'ONE SHOT', o?.ttkNear, true)}
      ${cell(n.burst ? 'BURSTS / MIN' : 'FIRE RATE', n.rpm, n.rpm + (n.burst ? '' : ' RPM'), o?.rpm, false)}
      ${cell('MAGAZINE', n.mag, n.mag + ' + ' + n.reserve, o?.mag, false)}
      ${cell('RELOAD', n.reload, fmtS(n.reload), o?.reload, true)}
      ${cell('AIM TIME', n.ads, n.ads + ' MS', o?.ads, true)}
      ${cell('MOVE SPEED', n.move, n.move + '%', o?.move, false)}
      ${cell('RANGE', n.range ?? 999, n.range ? n.range + ' M' : proj ? '—' : 'NO DROP', o ? o.range ?? 999 : undefined, false)}</div>
      <p class="hint" style="margin:6px 0 0">SHOTS TO KILL: up close / far away. Time to kill assumes every shot lands.</p>`;
  }
  function textHtml(E) {
    const li = a => a.map(x => `<li>${esc(x)}</li>`).join('');
    return `${E.blurb ? `<p>${esc(E.blurb)}</p>` : ''}${E.lines?.length ? `<ul class="facts">${li(E.lines)}</ul>` : ''}
      <div class="pc"><div class="pros"><h4>PROS</h4><ul>${li(E.pros.length ? E.pros : ['—'])}</ul></div><div class="cons"><h4>CONS</h4><ul>${li(E.cons.length ? E.cons : ['—'])}</ul></div></div>
      ${E.best ? `<div class="best">BEST FOR: ${esc(E.best)}</div>` : ''}`;
  }

  /* ---- the picker */
  function drawPick(body) {
    const P = body.querySelector('.cacPick'), c = ed.c, kind = slotKind(ed.slot), lv = PvpProgress.level(), C = CODEX();
    let html = '';
    if (kind === 'gun') {
      const gid = c[ed.slot], att = attOf(gid), wl = PvpProgress.weaponLevel(gid);
      html = `<div class="ptabs"><button class="${ed.sub === 'gun' ? 'on' : ''}" data-sub="gun">WEAPON</button>
        <button class="${ed.sub === 'att' ? 'on' : ''}" data-sub="att">ATTACHMENTS ${att.length} / ${PVP.MAX_ATTACH}</button>
        <span class="hint">${ed.sub === 'att' ? `${clean(PVP.GUNS[gid].name)} · WEAPON LEVEL ${wl} / ${PVP.WEAPON_MAX}. Kills with it unlock more.` : 'Hover or focus a gun to compare it with yours.'}</span></div>`;
      if (ed.sub === 'gun') {
        const ids = ed.slot === 'primary' ? PVP.PRIMARY_IDS : secondaryIds();
        html += `<div class="pgrid guns">${ids.map(id => {
          const G = PVP.GUNS[id], ok = G.lvl <= lv, st = C?.gunStats(id, attOf(id));
          const mini = st ? ['damage', 'range', 'rate', 'mobility'].map(k => `<span class="mb"><small>${C.BAR_NAMES[k].split(' ')[0]}</small><i style="width:${Math.round((st.bars[k] ?? 0) * 100)}%"></i></span>`).join('') : '';
          return `<button class="pcard gun ${id === gid ? 'eq' : ''} ${ok ? '' : 'lock'}" data-pick="gun:${id}">${gunImg(id, attOf(id))}
            <span class="pch"><b>${clean(G.name)}</b></span><span class="role">${roleOf(id)}</span><span class="minis">${mini}</span>
            ${ok ? '' : `<span class="lk">${ICON('lock', { size: 12 })} LEVEL ${G.lvl}</span>`}</button>`;
        }).join('')}</div>`;
      } else {
        html += PVP.ATTACH_SLOTS.map(sl => {
          const ids = Object.keys(PVP.ATTACHMENTS).filter(a => PVP.ATTACHMENTS[a].slot === sl);
          return `<div class="aslot"><div class="ash">${ICON(sl, { slot: true, size: 18 })}<span>${sl}</span></div><div class="pgrid">${ids.map(a => {
            const A = PVP.ATTACHMENTS[a], need = PVP.attachLevel(a), ok = wl >= need, pc = C ? C.attachProsCons(a) : { pros: [], cons: [] };
            return `<button class="pcard att ${att.includes(a) ? 'eq' : ''} ${ok ? '' : 'lock'}" data-pick="attach:${a}">
              <span class="pch">${ICON(a)}<b>${A.name}</b></span>
              ${pc.pros.slice(0, 2).map(x => `<span class="mini"><span class="g">+</span> ${esc(x)}</span>`).join('')}
              ${pc.cons.slice(0, 2).map(x => `<span class="mini"><span class="r">−</span> ${esc(x)}</span>`).join('')}
              ${ok ? '' : `<span class="lk">${ICON('lock', { size: 12 })} WEAPON LEVEL ${need}</span>`}</button>`;
          }).join('')}</div></div>`;
        }).join('');
      }
    } else {
      const tier = kind === 'perk' ? +ed.slot.slice(4) : 0;
      const T = kind === 'perk' ? PVP.PERKS : kind === 'lethal' ? PVP.LETHALS : PVP.TACTICALS;
      const ids = Object.keys(T).filter(id => !tier || T[id].tier === tier), cur = curId(ed.slot);
      html = `<div class="ptabs"><span class="hint">${kind === 'perk' ? `PERK ${tier}: pick one. Each perk slot has its own list.` : kind === 'lethal' ? 'LETHAL: the grenade-slot weapon. One per life (DUMPSTER DIVER refills it).' : 'TACTICAL: equipment that does not kill but wins fights.'}</span></div>
        <div class="pgrid">${ids.map(id => {
          const X = T[id], ok = X.lvl <= lv, E = C?.entry(kind, id);
          return `<button class="pcard ${id === cur ? 'eq' : ''} ${ok ? '' : 'lock'}" data-pick="${kind}:${id}"><span class="pch">${ICON(id)}<b>${clean(X.name)}</b></span>
            <span class="mini">${esc(X.d)}</span>${E?.cons?.[0] ? `<span class="mini"><span class="r">−</span> ${esc(E.cons[0])}</span>` : ''}
            ${ok ? '' : `<span class="lk">${ICON('lock', { size: 12 })} LEVEL ${X.lvl}</span>`}</button>`;
        }).join('')}</div>`;
    }
    P.innerHTML = html;
    P.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => { ed.sub = b.dataset.sub; ed.hover = null; drawDetail(body); drawPick(body); });
    P.querySelectorAll('[data-pick]').forEach(b => {
      const [k, id] = b.dataset.pick.split(':');
      const hover = on => { ed.hover = on ? { kind: k, id } : null; clearTimeout(drawPick.t); drawPick.t = setTimeout(() => drawDetail(body), on ? 0 : 60); };
      b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') hover(true); });
      b.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hover(false); });
      b.addEventListener('focus', () => { if (b.matches(':focus-visible')) hover(true); });
      b.addEventListener('blur', () => hover(false));
      b.onclick = () => pick(body, k, id);
    });
    fillThumbs(P);
  }
  function pick(body, kind, id) {
    const c = ed.c, lv = PvpProgress.level();
    if (ed.ro) { ed.hover = { kind, id }; drawDetail(body); return flash(body, 'PREMADE CLASSES CANNOT BE CHANGED', true); }
    if (kind === 'gun') {
      if (PVP.GUNS[id].lvl > lv) { ed.hover = { kind, id }; drawDetail(body); return flash(body, `UNLOCKS AT LEVEL ${PVP.GUNS[id].lvl}`, true); }
      c[ed.slot] = id;
    } else if (kind === 'attach') {
      const gid = c[ed.slot], need = PVP.attachLevel(id);
      if (PvpProgress.weaponLevel(gid) < need) return flash(body, `UNLOCKS AT WEAPON LEVEL ${need}`, true);
      const t = toggled(attOf(gid), id);
      if (!t) return flash(body, `ALL ${PVP.MAX_ATTACH} ATTACHMENT SLOTS ARE IN USE`, true);
      c.att[gid] = t;
    } else {
      const T = kind === 'perk' ? PVP.PERKS : kind === 'lethal' ? PVP.LETHALS : PVP.TACTICALS;
      if (T[id].lvl > lv) return flash(body, `UNLOCKS AT LEVEL ${T[id].lvl}`, true);
      if (kind === 'perk') c.perks[+ed.slot.slice(4) - 1] = id; else c[kind] = id;
      if (!bnplOn() && !PVP.GUNS[c.secondary]?.secondary) c.secondary = 'pistol';
    }
    ed.hover = null;
    save();
    drawAll(body);
  }

  /* ------------------------------------------------------------------ PROGRESS */
  function renderProgress(body) {
    const s = PvpProgress.S(), L = PvpProgress.levelInfo(), st2 = s.stats;
    const next = []; for (let l = L.level + 1; l <= Math.min(PVP.MAX_LEVEL, L.level + 6); l++) for (const u of PVP.unlocksAt(l)) next.push(`LV ${l}: ${clean(u.name)}`);
    const guns = PVP.PRIMARY_IDS.concat(PVP.SECONDARY_IDS);
    body.innerHTML = `<div class="grid"><div class="card"><h3>LEVEL ${L.level}${L.prestige ? ' // PRESTIGE ' + L.prestige : ''}</h3><div class="bar"><i style="width:${L.need ? L.into / L.need * 100 : 100}%"></i></div>
      <p>${L.maxed ? 'Max level. Prestige resets you to level 1 for an emblem and a cosmetic. Nothing that changes stats.' : L.into.toLocaleString('en-US') + ' / ' + L.need.toLocaleString('en-US') + ' XP to the next level. The first win of each day pays double.'}</p>
      ${L.maxed && s.prestige < PVP.PRESTIGE_MAX ? '<button data-act="prestige">PRESTIGE</button>' : ''}
      <label>COMING UP</label><p>${next.join('<br>') || 'Everything is unlocked.'}</p></div>
      <div class="card"><h3>LIFETIME</h3><table><tr><td>MATCHES</td><td>${st2.matches}</td></tr><tr><td>WINS</td><td>${st2.wins}</td></tr><tr><td>KILLS / DEATHS</td><td>${st2.kills} / ${st2.deaths} (RATIO ${((st2.kills + 1) / (st2.deaths + 1)).toFixed(2)})</td></tr>
      <tr><td>BEST STREAK</td><td>${st2.best}</td></tr><tr><td>GIGATECH TODAY</td><td>${s.gtDay === PvpProgress.today() ? s.gtToday : 0} / ${PVP.GT.dailyCap}</td></tr><tr><td>REVIVAL FEES OWED</td><td>¤${(st2.deaths * PVP.REVIVAL_FEE).toLocaleString('en-US')}</td></tr></table>
      <p class="hint">PvP pays XP, DRIP for the Fitting Room, and a little GigaTech (capped each day). Campaign rarity finds unlock the same camo here: looks only.</p></div></div>
      <div class="card" style="margin-top:12px"><h3>WEAPONS AND CAMOS</h3><table><tr><td></td><td>LEVEL</td><td>CAMO</td><td>NEXT CAMO</td><td>KILLS / HEADS / LONGS</td></tr>${guns.map(g => {
        const t = PvpProgress.camoOf(g), R = PVP.CAMO_RULES[t + 1], w = s.wstats[g] || {};
        return `<tr><td>${clean(PVP.GUNS[g].name)}</td><td>${PvpProgress.weaponLevel(g)} / ${PVP.WEAPON_MAX}</td><td>${PVP.CAMO[t]}</td><td>${R ? PVP.CAMO[t + 1] + ': ' + R.d : 'DONE'}</td><td>${w.kills || 0} / ${w.heads || 0} / ${w.longs || 0}</td></tr>`;
      }).join('')}</table><p class="hint">Bot kills level your guns but never count toward camos.</p></div>`;
    const pb = body.querySelector('[data-act="prestige"]'); if (pb) pb.onclick = () => { if (PvpProgress.prestige()) render(); };
  }

  root.PvpMenu = { open, close, isOpen, get transport() { return T; }, leaveRoom };
})(typeof window !== 'undefined' ? window : globalThis);
