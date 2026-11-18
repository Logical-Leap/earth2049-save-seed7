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
  function renderPlay(body) {
    body.innerHTML = `<div class="grid">
      <div class="card"><h3>QUICKPLAY</h3><p>Pick a playlist. You drop into an open match, or a new one starts. Bots fill every empty slot, so there is always a game.</p>
        <div class="row">${Object.values(PVP.PLAYLISTS).map(p => `<button data-qp="${p.id}" title="${esc(p.sub)}">${p.name}</button>`).join('')}</div><p class="hint">Online. Needs the match server.</p></div>
      <div class="card"><h3>OFFLINE // VS BOTS</h3><p>Any mode, any map, right now. Plays in this browser, no connection needed. A match with no other humans pays 75% XP, half DRIP and no GigaTech.</p>
        <label>MODE</label><select data-k="mode">${modeOptions(st.mode)}</select><label>MAP</label><select data-k="map">${mapOptions(st.map)}</select>
        <div class="row"><div style="flex:1"><label>BOT SKILL</label><select data-k="botSkill">${Object.entries(PVP.BOT_SKILL).map(([k, v]) => `<option value="${k}" ${k === st.botSkill ? 'selected' : ''}>${v.name}</option>`).join('')}</select></div>
        <div style="flex:1"><label>CLASS</label><select data-k="cls">${classOptions(st.cls)}</select></div></div>
        <p class="hint" style="margin-top:8px">${esc(PVP.MODES[st.mode].how)}</p><button class="go" data-act="offline">PLAY OFFLINE</button></div>
      <div class="card"><h3>PRIVATE ROOM</h3><p>Make a room and send friends the code. You pick the mode, the map and the rules. Custom rules pay no XP.</p>
        <div class="row"><button data-act="host">HOST PRIVATE</button><button data-act="hostPublic">HOST PUBLIC</button></div>
        <label>JOIN BY CODE</label><div class="row"><input data-k="code" maxlength="6" placeholder="ABCDE" style="flex:1;text-transform:uppercase"><button data-act="join">JOIN</button></div></div>
      <div class="card"><h3>OPEN ROOMS</h3><div class="rooms hint">Loading…</div><button data-act="refresh" style="margin-top:8px">REFRESH</button></div></div>
      <p class="hint" style="margin-top:14px">Controls: [3] [4] [5] scorestreaks // [Q] tactical // [G] lethal // [F] melee // [E] use, plant, defuse // [TAB] scoreboard // [SPACE] skip the killcam. Controller: D-pad up tactical, D-pad down streak.</p>`;
    body.querySelectorAll('select[data-k]').forEach(s => s.onchange = () => { st[s.dataset.k] = s.dataset.k === 'cls' ? +s.value : s.value; if (s.dataset.k === 'mode') render(); });
    body.querySelectorAll('[data-qp]').forEach(b => b.onclick = () => quickplay(b.dataset.qp));
    const act = (a, fn) => { const b = body.querySelector(`[data-act="${a}"]`); if (b) b.onclick = fn; };
    act('offline', () => startOffline());
    act('host', () => hostRoom(false)); act('hostPublic', () => hostRoom(true));
    act('join', () => joinRoom(body.querySelector('[data-k="code"]').value));
    act('refresh', () => refreshRooms(body));
    refreshRooms(body);
  }
  async function refreshRooms(body) {
    const box = body.querySelector('.rooms'); if (!box) return;
    lastRooms = await PvpNet.listRooms();
    box.innerHTML = lastRooms.length ? `<table>${lastRooms.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.playlist || '')}</td><td>${r.players}/${r.max}</td><td>${r.state === 'run' ? 'IN MATCH' : 'LOBBY'}</td><td><button data-room="${esc(r.code)}">JOIN</button></td></tr>`).join('')}</table>` : 'No open rooms right now. Quickplay opens one.';
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
  async function quickplay(pl) {
    const w = who();
    try { const r = await PvpNet.quickplay({ playerId: w.id, name: w.name, playlist: pl }); connect(r.roomCode); }
    catch (e) { status('Could not reach the match server. Offline matches still work.'); }
  }
  function joinRoom(code) { code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (code.length < 4) return; connect(code); }
  function connect(code) {
    leaveRoom();
    T = PvpNet.online(code, who());
    T.on(onNet);
    room = { code, players: [], settings: {}, connecting: true };
    tab = 'play'; render();
  }
  function leaveRoom() { if (T) { T.close(); T = null; room = null; chatLog = []; } }
  let pending = null;
  function onNet(m) {
    if (m.t === 'room') { room = m.room; if (isOpen() && tab === 'play') render(); }
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
      <div class="card"><h3>${r.options ? 'VOTE // ' + (r.voteLeft || 0) + 'S' : 'MATCH'}</h3>
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

  /* ------------------------------------------------------------------ CLASSES */
  function renderClasses(body) {
    const lv = PvpProgress.level(), list = PvpProgress.classes();
    if (editing !== null) return renderEditor(body, editing);
    const line = c => `${clean(PVP.GUNS[c.primary]?.name)} + ${clean(PVP.GUNS[c.secondary]?.name)} // ${clean(PVP.LETHALS[c.lethal]?.name)} // ${clean(PVP.TACTICALS[c.tactical]?.name)} // ${(c.perks || []).map(p => clean(PVP.PERKS[p]?.name)).join(', ')}`;
    body.innerHTML = `${lv < PVP.CUSTOM_AT ? `<p class="hint">Custom classes open at level ${PVP.CUSTOM_AT}. Until then, pick a premade class before each match or when you respawn.</p>` : ''}
      <div class="grid">${list.map((c, i) => `<div class="card"><h3>${esc(c.name)}${c.premade ? '<span class="tag">PREMADE</span>' : ''}</h3><p>${esc(line(c))}</p>${c.premade ? '' : `<button data-edit="${i}">EDIT</button>`}</div>`).join('')}</div>
      <div class="card" style="margin-top:12px"><h3>SCORESTREAKS (PICK ${PVP.STREAK_SLOTS})</h3><p>Points from kills, assists and objectives. They reset when you die.</p>
      <div class="opts">${PVP.STREAK_ORDER.map(id => { const S = PVP.STREAKS[id], ok = S.lvl <= lv; return `<label class="${ok ? '' : 'lock'}"><input type="checkbox" data-st="${id}" ${PvpProgress.streaks().includes(id) ? 'checked' : ''} ${ok ? '' : 'disabled'}>${clean(S.name)} (${S.pts})${ok ? '' : ' — LV ' + S.lvl}</label>`; }).join('')}</div></div>`;
    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { editing = +b.dataset.edit; render(); });
    body.querySelectorAll('[data-st]').forEach(x => x.onchange = () => {
      const on = [...body.querySelectorAll('[data-st]:checked')].map(i => i.dataset.st);
      if (on.length > PVP.STREAK_SLOTS) { x.checked = false; return; }
      PvpProgress.setStreaks(on.sort((a, b) => PVP.STREAKS[a].pts - PVP.STREAKS[b].pts));
    });
  }
  function renderEditor(body, idx) {
    const lv = PvpProgress.level(), list = PvpProgress.classes(), c = JSON.parse(JSON.stringify(list[idx])), slot = idx - PVP.PREMADE.length;
    c.att = c.att || {};
    const gunSel = (key, ids) => `<select data-f="${key}">${ids.map(id => { const G = PVP.GUNS[id], ok = G.lvl <= lv; return `<option value="${id}" ${c[key] === id ? 'selected' : ''} ${ok ? '' : 'disabled'}>${clean(G.name)}${G.standIn ? ' (STAND-IN ART)' : ''}${ok ? '' : ' — LV ' + G.lvl}</option>`; }).join('')}</select>`;
    const tbl = (key, T, tier) => `<select data-f="${key}">${Object.entries(T).filter(([, x]) => !tier || x.tier === tier).map(([id, x]) => `<option value="${id}" ${(tier ? c.perks[tier - 1] : c[key]) === id ? 'selected' : ''} ${x.lvl <= lv ? '' : 'disabled'}>${clean(x.name)}${x.lvl <= lv ? '' : ' — LV ' + x.lvl}</option>`).join('')}</select>`;
    const attBox = gid => { const wl = PvpProgress.weaponLevel(gid), have = c.att[gid] || []; return PVP.ATTACH_SLOTS.map(sl => `<div><b style="font-size:11px">${sl}</b> ${Object.entries(PVP.ATTACHMENTS).filter(([, a]) => a.slot === sl).map(([id, a]) => { const need = PVP.attachLevel(id), ok = wl >= need; return `<label class="${ok ? '' : 'lock'}" title="${esc(a.d)}"><input type="radio" name="a_${gid}_${sl}" data-att="${gid}" value="${id}" ${have.includes(id) ? 'checked' : ''} ${ok ? '' : 'disabled'}>${a.name}${ok ? '' : ' (W' + need + ')'}</label>`; }).join('')}<label><input type="radio" name="a_${gid}_${sl}" data-att="${gid}" value="" ${have.some(a => PVP.ATTACHMENTS[a].slot === sl) ? '' : 'checked'}>NONE</label></div>`).join(''); };
    const bnpl = (c.perks || []).includes('bnpl');
    body.innerHTML = `<div class="card"><h3>EDIT CLASS</h3><label>NAME</label><input data-f="name" maxlength="20" value="${esc(c.name)}">
      <div class="grid" style="margin-top:8px"><div><label>PRIMARY</label>${gunSel('primary', PVP.PRIMARY_IDS)}<label>ATTACHMENTS (UP TO ${PVP.MAX_ATTACH}) — WEAPON LEVEL ${PvpProgress.weaponLevel(c.primary)}</label><div class="opts" style="display:block">${attBox(c.primary)}</div></div>
      <div><label>SECONDARY${bnpl ? ' (BUY NOW PAY LATER: ANY GUN)' : ''}</label>${gunSel('secondary', bnpl ? PVP.SECONDARY_IDS.concat(PVP.PRIMARY_IDS) : PVP.SECONDARY_IDS)}<label>ATTACHMENTS</label><div class="opts" style="display:block">${attBox(c.secondary)}</div>
      <label>LETHAL</label>${tbl('lethal', PVP.LETHALS)}<label>TACTICAL</label>${tbl('tactical', PVP.TACTICALS)}
      <label>PERK 1</label>${tbl('p1', PVP.PERKS, 1)}<label>PERK 2</label>${tbl('p2', PVP.PERKS, 2)}<label>PERK 3</label>${tbl('p3', PVP.PERKS, 3)}</div></div>
      <p class="hint">Every attachment is a sidegrade: hover one to see what it trades. Rarity is a camo in the core playlist; it never changes a gun.</p>
      <div class="row"><button class="go" data-act="save">SAVE CLASS</button><button data-act="cancel">CANCEL</button></div></div>`;
    const read = () => {
      const g = k => body.querySelector(`[data-f="${k}"]`)?.value;
      const out = { name: g('name') || 'CUSTOM', primary: g('primary'), secondary: g('secondary'), lethal: g('lethal'), tactical: g('tactical'), perks: [g('p1'), g('p2'), g('p3')], att: {} };
      for (const gid of [out.primary, out.secondary]) out.att[gid] = [...body.querySelectorAll(`[data-att="${gid}"]:checked`)].map(i => i.value).filter(Boolean).slice(0, PVP.MAX_ATTACH);
      return out;
    };
    body.querySelectorAll('select[data-f="primary"],select[data-f="secondary"],select[data-f="p2"]').forEach(s => s.onchange = () => { const v = read(); Object.assign(list[idx], v); if (slot >= 0) PvpProgress.saveClass(slot, v); render(); });
    body.querySelector('[data-act="save"]').onclick = () => { const v = window.PvpSim.sanitizeClass(read(), lv); v.name = read().name; if (slot >= 0) PvpProgress.saveClass(slot, v); editing = null; render(); if (T) T.send({ t: 'classes', classes: PvpProgress.classes() }); };
    body.querySelector('[data-act="cancel"]').onclick = () => { editing = null; render(); };
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
